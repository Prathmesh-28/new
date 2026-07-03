#!/usr/bin/env node
"use strict";
/*
 * check-tenant-scope — static guard against the cross-tenant write bug class.
 *
 * Motivation: the 2026-06 audit found a CRITICAL bug — a raw pool.query UPDATE matched rows
 * by `invoice_number` (which is only unique PER TENANT) with no tenant_id filter, so one
 * tenant's webhook could mark another tenant's invoice paid (fixed in e856ceb). This script
 * greps every backend SQL write and flags that shape so it can't regress.
 * Run: `npm run check:tenant-scope` (exit 1 on any high finding). Self-test: `--self-test`.
 *
 * Classification for an UPDATE/DELETE on a tenant-scoped (has tenant_id column) table:
 *   - SAFE (skip): via q()/withTenant (FORCE-RLS enforces isolation via the app.current_tenant
 *       GUC); OR the statement contains a tenant_id filter; OR the table has no tenant_id
 *       column (global/config table); OR the site is annotated `// @tenant-safe: <reason>`.
 *   - review: keyed by equality on a GLOBALLY-UNIQUE column (single-col PK / single-col UNIQUE
 *       / single-col unique index). Cross-tenant-safe from guessing, but only correct if a
 *       tenant-scoped check precedes it — a human should confirm. Does NOT fail the build.
 *   - high: neither tenant_id nor a globally-unique-column equality — e.g. keyed on a
 *       per-tenant-unique column like invoice_number, a non-unique column, or no WHERE at
 *       all. This is the Razorpay shape. FAILS the build.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(__dirname, "..", "src");
const MIGRATIONS = path.join(SRC, "migrations");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

// ── parse schemas: tenant-scoped tables + each table's globally-unique columns ───────────
// uniqueCols = columns that are individually globally unique (single-col PK / UNIQUE / unique
// index). Composite keys (e.g. UNIQUE(tenant_id, invoice_number)) do NOT make a member unique.
function parseSchemas(schemaFiles) {
  const tenantTables = new Set();
  const uniqueCols = {}; // table -> Set(col)
  for (const sf of schemaFiles) {
    if (!fs.existsSync(sf)) continue;
    const txt = fs.readFileSync(sf, "utf8");
    const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\b([\s\S]*?)\n\s*\)\s*;/g;
    let m;
    while ((m = re.exec(txt))) {
      const table = m[1], body = m[2];
      if (/\btenant_id\b/.test(body)) tenantTables.add(table);
      const u = uniqueCols[table] || (uniqueCols[table] = new Set());
      for (const line of body.split("\n")) {
        const col = line.match(/^\s*(\w+)\s+[A-Za-z]/); // column definition line
        // inline single-col key: "<col> <type> ... PRIMARY KEY|UNIQUE ..." (NOT the table-level
        // "PRIMARY KEY (…)" / "UNIQUE (…)" forms, which may be composite).
        if (col && /\bPRIMARY KEY\b/.test(line) && !/PRIMARY KEY\s*\(/.test(line)) u.add(col[1]);
        else if (col && /\bUNIQUE\b/.test(line) && !/UNIQUE\s*\(/.test(line)) u.add(col[1]);
      }
      const tpk = body.match(/PRIMARY KEY\s*\(\s*(\w+)\s*\)/); // table-level single-col PK
      if (tpk) u.add(tpk[1]);
      const tuq = body.match(/\bUNIQUE\s*\(\s*(\w+)\s*\)/);     // table-level single-col UNIQUE
      if (tuq) u.add(tuq[1]);
    }
    // single-column unique indexes (e.g. CREATE UNIQUE INDEX ... ON t(col) [WHERE ...]).
    // [^;]* keeps the match inside ONE statement so it can't span to an unrelated ON t(col)
    // and wrongly mark a non-unique FK column (e.g. credit_offers.application_id) as unique.
    const ui = /CREATE UNIQUE INDEX\b[^;]*?\bON\s+(\w+)\s*\(\s*(\w+)\s*\)/g;
    let x;
    while ((x = ui.exec(txt))) (uniqueCols[x[1]] || (uniqueCols[x[1]] = new Set())).add(x[2]);
  }
  return { tenantTables, uniqueCols };
}

// ── RLS tables (FORCE ROW LEVEL SECURITY via migration ARRAY[...]) ───────────────────────
function parseRls() {
  const rls = new Set();
  if (!fs.existsSync(MIGRATIONS)) return rls;
  for (const mf of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
    const txt = fs.readFileSync(path.join(MIGRATIONS, mf), "utf8");
    if (!/FORCE ROW LEVEL SECURITY/i.test(txt)) continue;
    for (const a of txt.match(/ARRAY\[([^\]]+)\]/g) || [])
      for (const q of a.match(/'([^']+)'/g) || []) rls.add(q.replace(/'/g, ""));
  }
  return rls;
}

// equality on a unique column: `col = $n` or set-membership `col = ANY($n)` (both key by the
// unique value; the latter is a delete/update of specific rows by that unique column).
const eqUnique = (sql, cols) => [...cols].some((c) => new RegExp("\\b" + c + "\\s*=\\s*(ANY\\s*\\()?\\$").test(sql));

// classify one raw-pool.query write; returns 'safe' | 'review' | 'high'
function classify(sql, table, tenantTables, rlsTables, uniqueCols) {
  if (!tenantTables.has(table)) return "safe";        // global/config table
  if (rlsTables.has(table)) return "safe";            // FORCE-RLS GUC
  if (/\btenant_id\b/i.test(sql)) return "safe";      // explicit tenant filter
  if (eqUnique(sql, uniqueCols[table] || new Set())) return "review"; // globally-unique key
  return "high";                                      // Razorpay shape
}

// classify a raw-pool.query INSERT. An INSERT into a tenant-scoped, non-RLS table that omits
// the tenant_id COLUMN lets the row take the column default (often 'default') → it lands in
// the wrong tenant. (RLS tables are safe: their WITH CHECK policy rejects a mismatched/absent
// tenant at the DB.) A positional INSERT (no column list) can't be verified statically.
function classifyInsert(sql, table, tenantTables, rlsTables) {
  if (!tenantTables.has(table)) return "safe";
  if (rlsTables.has(table)) return "safe";
  const m = sql.match(/INSERT\s+INTO\s+\w+\s*\(([^)]*)\)/i); // column list before VALUES/SELECT
  if (!m) return "review";                            // positional INSERT … VALUES(…)
  return /\btenant_id\b/i.test(m[1]) ? "safe" : "high";
}

// Capture the FIRST argument to a call at openParen (index of "("), joining every string /
// template-literal piece so concatenated SQL ("UPDATE …" + "WHERE tenant_id=…") is captured
// whole. Stops at the top-level comma (end of arg 1) or the matching ")".
function firstArgSql(text, openParen) {
  let i = openParen + 1, depth = 1, sql = "", inStr = null;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === inStr) inStr = null; else sql += c;
      i++; continue;
    }
    if (c === "`" || c === '"' || c === "'") { inStr = c; i++; continue; }
    if (c === "(") depth++;
    else if (c === ")") { if (--depth === 0) break; }
    else if (c === "," && depth === 1) break;
    i++;
  }
  return sql;
}

const WRITE_RE = /\b(?:UPDATE\s+(\w+)\s+SET|DELETE\s+FROM\s+(\w+))\b/i;

function scan(jsFiles, ctx) {
  const findings = [];
  let suppressed = 0;
  const CALL = "pool.query(";
  for (const file of jsFiles) {
    if (file.endsWith("check-tenant-scope.js")) continue;
    const txt = fs.readFileSync(file, "utf8");
    const lines = txt.split("\n");
    // Only raw pool.query(...) is a risk. q(tenantId,…)/withTenant client.query set the RLS
    // GUC, so their writes are enforced at the DB and intentionally not scanned here.
    let from = 0, idx;
    while ((idx = txt.indexOf(CALL, from)) >= 0) {
      from = idx + CALL.length;
      const sql = firstArgSql(txt, idx + CALL.length - 1);
      const w = sql.match(WRITE_RE);
      const ins = w ? null : sql.match(/\bINSERT\s+INTO\s+(\w+)/i);
      let table, op, verdict;
      if (w) {
        table = (w[1] || w[2] || "").toLowerCase();
        if (!ctx.tenantTables.has(table)) continue;
        verdict = classify(sql, table, ctx.tenantTables, ctx.rlsTables, ctx.uniqueCols);
        op = /UPDATE/i.test(w[0]) ? "UPDATE" : "DELETE";
      } else if (ins) {
        table = ins[1].toLowerCase();
        if (!ctx.tenantTables.has(table)) continue;
        verdict = classifyInsert(sql, table, ctx.tenantTables, ctx.rlsTables);
        op = "INSERT";
      } else continue;
      if (verdict === "safe") continue;
      const lineNo = txt.slice(0, idx).split("\n").length;
      const around = lines.slice(Math.max(0, lineNo - 3), lineNo + 1).join("\n"); // @tenant-safe on/above the call
      if (/@tenant-safe\b/.test(around)) { suppressed++; continue; }
      findings.push({
        file: path.relative(ROOT, file), line: lineNo, table, op,
        severity: verdict, sql: sql.replace(/\s+/g, " ").trim().slice(0, 110),
      });
    }
  }
  return { findings, suppressed };
}

// ── self-test: prove the classifier is not vacuous ──────────────────────────────────────
function selfTest() {
  const tenantTables = new Set(["invoices", "loans"]);
  const rlsTables = new Set(["loans"]);
  const uniqueCols = { invoices: new Set(["id"]) }; // invoice_number is NOT globally unique
  const t = (sql, table, want) => {
    const got = classify(sql, table, tenantTables, rlsTables, uniqueCols);
    const ok = got === want;
    console.log(`  ${ok ? "ok " : "FAIL"}  want=${want} got=${got}  ${sql}`);
    return ok;
  };
  console.log("self-test (classifier + extractor):");
  let pass = true;
  pass &= t("UPDATE invoices SET status=$1 WHERE invoice_number=$2", "invoices", "high");   // the Razorpay bug
  pass &= t("UPDATE invoices SET status=$1 WHERE invoice_number=$2 AND tenant_id=$3", "invoices", "safe");
  pass &= t("UPDATE invoices SET status=$1 WHERE id=$2", "invoices", "review");             // globally-unique PK
  pass &= t("UPDATE invoices SET x=$1", "invoices", "high");                                 // no WHERE at all
  pass &= t("UPDATE loans SET x=$1 WHERE y=$2", "loans", "safe");                            // FORCE-RLS table
  // INSERT classifier: omitting tenant_id lands the row in the wrong tenant
  const ti = (sql, table, want) => {
    const got = classifyInsert(sql, table, tenantTables, rlsTables);
    const ok = got === want;
    console.log(`  ${ok ? "ok " : "FAIL"}  want=${want} got=${got}  ${sql}`);
    return ok;
  };
  pass &= ti("INSERT INTO invoices(invoice_number, total_amount) VALUES($1,$2)", "invoices", "high");  // omits tenant_id
  pass &= ti("INSERT INTO invoices(tenant_id, invoice_number) VALUES($1,$2)", "invoices", "safe");
  pass &= ti("INSERT INTO invoices VALUES($1,$2,$3)", "invoices", "review");                            // positional
  pass &= ti("INSERT INTO loans(x) VALUES($1)", "loans", "safe");                                       // FORCE-RLS
  // extractor must join concatenated string literals (the einvoice/ewaybill shape)
  const catSql = firstArgSql('pool.query("UPDATE invoices SET x=$2 " + "WHERE tenant_id=$1 AND id=$3", [a])', 10);
  const catOk = /tenant_id/.test(catSql);
  console.log(`  ${catOk ? "ok " : "FAIL"}  concatenated-SQL extraction captures tenant_id  →  "${catSql.trim()}"`);
  pass = pass && catOk;
  console.log(pass ? "self-test PASS\n" : "self-test FAIL\n");
  return !!pass;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

const jsFiles = walk(SRC);
const schemaFiles = [path.join(SRC, "db.js"), ...jsFiles.filter((f) => /modules\/[a-z]+\/schema\.js$/.test(f))];
const { tenantTables, uniqueCols } = parseSchemas(schemaFiles);
const rlsTables = parseRls();
const stOk = selfTest();
const { findings, suppressed } = scan(jsFiles, { tenantTables, rlsTables, uniqueCols });
const high = findings.filter((f) => f.severity === "high");
const review = findings.filter((f) => f.severity === "review");
console.log(`tenant tables: ${tenantTables.size} | RLS tables: ${rlsTables.size} | scanned: ${jsFiles.length} files | suppressed(@tenant-safe): ${suppressed}`);
console.log(`findings: ${high.length} high, ${review.length} review\n`);
const show = (f) => console.log(`  [${f.severity}] ${f.file}:${f.line}  ${f.op} ${f.table}\n      ${f.sql}`);
if (high.length) { console.log("HIGH — cross-tenant write risk (UPDATE/DELETE with no tenant_id & no unique key, or INSERT omitting tenant_id):"); high.forEach(show); console.log(); }
if (review.length) {
  console.log(`REVIEW — keyed on a globally-unique column; safe only if a tenant check precedes it (${review.length})` + (process.argv.includes("--all") ? ":" : " — pass --all to list"));
  if (process.argv.includes("--all")) { review.forEach(show); console.log(); }
}
if (!findings.length) console.log("✓ no cross-tenant write risks found");
process.exit(stOk && high.length === 0 ? 0 : 1);
