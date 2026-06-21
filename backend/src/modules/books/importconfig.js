// §12b — Import Configurations + idempotent (hash-deduped) statement import.
//
// importers.js holds the DEEP, stateless parsers (OFX/QIF/CAMT/MT940/CSV). This
// module is the data-importer layer ported in LOGIC (not code) from Firefly-III's
// CSV/data-importer: it stores a reusable per-bank *Configuration* object — which
// parser to use, optional column/value Mappings, a date-format hint, and the bank
// account it binds to — and remembers a stable hash for every line it has ever
// imported so re-uploading the same statement is idempotent (already-seen lines
// are skipped, never double-posted).
//
// Boundaries (per module conventions):
//   • CommonJS, money as strings via ./money.
//   • NO GL posting here — runImport only materialises raw bank lines via
//     recon.importLines; the user still confirms each line (recon.confirmLine →
//     posting-engine.postVoucher) exactly as a manual import. Dedup happens BEFORE
//     recon ever sees a line, so the ledger path is untouched.
//   • Errors throw PostError(code,msg,http).
//   • DDL is returned to the caller (book_import_configs, book_import_hashes); not
//     written here. Tables are created IF NOT EXISTS by schema.js.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");
const importers = require("./importers");

// ── Configuration shape ──────────────────────────────────────────────────────
// A Configuration row:
//   name           human label ("HDFC current acct CSV")
//   format         one of importers.FORMATS (which parser to run)
//   bank_ledger_id the book_ledgers id this statement posts against (account binding)
//   date_format    optional hint string, passed through to mappings (advisory)
//   mappings       JSONB: {
//                    columns:   { date, amount, debit, credit, description, reference }
//                               -> CSV header-name OR 0-based index overrides; lets a
//                                  bank with odd headers map to our normalized fields.
//                    rules:     [{ match, ledgerId }]  -> reused by recon.applyRules so
//                               the inbox can pre-suggest a counter ledger per line.
//                    valueMap:  { "<rawDescription>": "<canonicalDescription>" }
//                               -> Firefly-style value remapping applied to description.
//                  }
const s = (v) => (v == null ? "" : String(v).trim());

function validFormat(fmt) {
  if (!importers.FORMATS.includes(s(fmt).toLowerCase())) {
    throw new PostError("BAD_FORMAT", `format must be one of ${importers.FORMATS.join(", ")}`, 422);
  }
  return s(fmt).toLowerCase();
}

function normMappings(m) {
  const out = { columns: {}, rules: [], valueMap: {} };
  if (m && typeof m === "object") {
    if (m.columns && typeof m.columns === "object") out.columns = m.columns;
    if (Array.isArray(m.rules)) out.rules = m.rules.filter((r) => r && r.match && r.ledgerId);
    if (m.valueMap && typeof m.valueMap === "object") out.valueMap = m.valueMap;
  }
  return out;
}

// Apply a Configuration's CSV column overrides by rewriting the header row of the
// raw CSV so importers.parseCsv (which is header-driven) picks our intended columns.
// Pure string surgery — keeps parseCsv as the single source of CSV truth.
// columns values may be a header substring OR a 0-based column index (number/string).
function applyCsvColumnMap(content, columns) {
  if (!columns || !Object.keys(columns).length) return content;
  const text = s(content).replace(/\r\n/g, "\n");
  const nl = text.indexOf("\n");
  if (nl < 0) return content;
  const headerLine = text.slice(0, nl);
  const rest = text.slice(nl);
  // Canonical header tokens parseCsv already understands.
  const canon = { date: "date", amount: "amount", debit: "debit", credit: "credit", description: "description", reference: "reference" };
  const cells = headerLine.split(",");
  for (const [field, target] of Object.entries(columns)) {
    if (!canon[field] || target == null || target === "") continue;
    let idx = -1;
    if (/^\d+$/.test(String(target))) idx = Number(target);
    else idx = cells.findIndex((h) => h.toLowerCase().includes(String(target).toLowerCase()));
    if (idx >= 0 && idx < cells.length) cells[idx] = canon[field];
  }
  return cells.join(",") + rest;
}

// Apply Firefly-style value remapping to a parsed line's description.
function applyValueMap(lines, valueMap) {
  const keys = valueMap && typeof valueMap === "object" ? Object.keys(valueMap) : [];
  if (!keys.length) return lines;
  return lines.map((l) => {
    const d = s(l.description);
    return d && Object.prototype.hasOwnProperty.call(valueMap, d) ? { ...l, description: s(valueMap[d]) } : l;
  });
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function listConfigs(tenantId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.format, c.bank_ledger_id, c.date_format, c.mappings, c.created_at, c.updated_at,
            l.name AS bank_ledger_name
       FROM book_import_configs c
       LEFT JOIN book_ledgers l ON l.id = c.bank_ledger_id AND l.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
      ORDER BY c.name`,
    [tenantId]
  );
  return rows;
}

async function getConfig(tenantId, id) {
  const { rows } = await pool.query(
    "SELECT id, name, format, bank_ledger_id, date_format, mappings, created_at, updated_at FROM book_import_configs WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Import config not found", 404);
  return rows[0];
}

async function createConfig(tenantId, body = {}) {
  const name = s(body.name);
  if (!name) throw new PostError("BAD_INPUT", "name required", 422);
  const format = validFormat(body.format);
  const bankLedgerId = body.bank_ledger_id || body.bankLedgerId;
  if (!bankLedgerId) throw new PostError("BAD_INPUT", "bank_ledger_id required", 422);
  // Account binding must be a real ledger in this tenant (and ideally a bank/cash one).
  const { rows: led } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND id=$2 AND is_active=true", [tenantId, bankLedgerId]);
  if (!led[0]) throw new PostError("UNKNOWN_LEDGER", "bank_ledger_id is missing, inactive or from another tenant", 422);
  const mappings = normMappings(body.mappings);
  const { rows } = await pool.query(
    `INSERT INTO book_import_configs(tenant_id, name, format, bank_ledger_id, date_format, mappings)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id, name, format, bank_ledger_id, date_format, mappings, created_at, updated_at`,
    [tenantId, name, format, bankLedgerId, s(body.date_format) || null, JSON.stringify(mappings)]
  );
  return rows[0];
}

async function updateConfig(tenantId, id, body = {}) {
  const cur = await getConfig(tenantId, id);
  const name = body.name != null ? s(body.name) : cur.name;
  if (!name) throw new PostError("BAD_INPUT", "name cannot be empty", 422);
  const format = body.format != null ? validFormat(body.format) : cur.format;
  let bankLedgerId = body.bank_ledger_id != null || body.bankLedgerId != null ? (body.bank_ledger_id || body.bankLedgerId) : cur.bank_ledger_id;
  if (!bankLedgerId) throw new PostError("BAD_INPUT", "bank_ledger_id required", 422);
  if (bankLedgerId !== cur.bank_ledger_id) {
    const { rows: led } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND id=$2 AND is_active=true", [tenantId, bankLedgerId]);
    if (!led[0]) throw new PostError("UNKNOWN_LEDGER", "bank_ledger_id is missing, inactive or from another tenant", 422);
  }
  const mappings = body.mappings != null ? normMappings(body.mappings) : cur.mappings;
  const dateFormat = body.date_format != null ? (s(body.date_format) || null) : cur.date_format;
  const { rows } = await pool.query(
    `UPDATE book_import_configs SET name=$3, format=$4, bank_ledger_id=$5, date_format=$6, mappings=$7, updated_at=now()
      WHERE tenant_id=$1 AND id=$2
      RETURNING id, name, format, bank_ledger_id, date_format, mappings, created_at, updated_at`,
    [tenantId, id, name, format, bankLedgerId, dateFormat, JSON.stringify(mappings)]
  );
  return rows[0];
}

async function deleteConfig(tenantId, id) {
  // Keep the hash ledger: deleting a config must NOT make previously-imported lines
  // re-importable. Hashes are keyed by (tenant, bank_ledger) — independent of config.
  const { rowCount } = await pool.query("DELETE FROM book_import_configs WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Import config not found", 404);
  return { ok: true, deleted: id };
}

// ── runImport — parse → dedup by hash → import new lines ───────────────────────
// Idempotent: every line gets importers.lineHash(bankLedgerId, line). Hashes already
// recorded in book_import_hashes are duplicates and skipped; new hashes are recorded
// and their lines handed to recon.importLines. Re-running the SAME content yields
// zero new lines. The hash insert + recon.importLines run in one transaction so a
// crash can't record a hash without its bank line (or vice-versa).
//
// Returns { configId, parsed, imported (new), duplicates, bankLedgerId }.
async function runImport(tenantId, { configId, content } = {}) {
  if (!configId) throw new PostError("BAD_INPUT", "configId required", 422);
  if (content == null || content === "") throw new PostError("BAD_INPUT", "content required", 422);
  const cfg = await getConfig(tenantId, configId);
  const mappings = normMappings(cfg.mappings);

  // 1. Parse via the deep importers, applying the config's column/value Mappings.
  let raw = cfg.format === "csv" ? applyCsvColumnMap(content, mappings.columns) : content;
  let lines = importers.parseStatement(cfg.format, raw);
  lines = applyValueMap(lines, mappings.valueMap);

  // 2. Hash every parsed line and collapse intra-batch dups (two byte-identical
  //    lines in one statement share a hash — keep the first, count the rest as dups).
  const byHash = new Map(); // hash -> first line with that hash
  for (const l of lines) {
    const h = importers.lineHash(cfg.bank_ledger_id, l);
    if (!byHash.has(h)) byHash.set(h, l);
  }
  const candHashes = [...byHash.keys()];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 3. Claim hashes atomically. ON CONFLICT DO NOTHING + RETURNING tells us EXACTLY
    //    which hashes WE inserted this run — anything not returned was already present
    //    (a prior import or a concurrent run claimed it first), i.e. a duplicate. The
    //    unique index is the real guard, so a SELECT-then-INSERT race can't double-import.
    let freshHashes = [];
    if (candHashes.length) {
      const params = [tenantId, cfg.bank_ledger_id, configId];
      const vals = candHashes.map((h) => { params.push(h); return `($1,$2,$3,$${params.length})`; });
      const { rows: inserted } = await client.query(
        `INSERT INTO book_import_hashes(tenant_id, bank_ledger_id, config_id, line_hash)
           VALUES ${vals.join(",")}
         ON CONFLICT (tenant_id, bank_ledger_id, line_hash) DO NOTHING
         RETURNING line_hash`,
        params
      );
      freshHashes = inserted.map((r) => r.line_hash);
    }

    // 4. Materialise only the genuinely-new lines as raw UNMATCHED bank lines — the
    //    SAME shape recon.importLines produces (/recon/import-file path). runImport
    //    only adds the dedup gate; GL posting still happens later via recon.confirmLine.
    //    We insert on OUR client so hash-claim + bank-line insert are one atomic txn.
    let imported = 0;
    for (const h of freshHashes) {
      const l = byHash.get(h);
      await client.query(
        "INSERT INTO book_bank_lines(tenant_id,bank_ledger_id,txn_date,amount,description,reference) VALUES($1,$2,$3,$4,$5,$6)",
        [tenantId, cfg.bank_ledger_id, l.date, l.amount, l.description || null, l.reference || null]
      );
      imported += 1;
    }

    await client.query("COMMIT");
    return {
      configId,
      bankLedgerId: cfg.bank_ledger_id,
      parsed: lines.length,    // total lines the parser produced
      imported,                // new lines actually stored
      duplicates: lines.length - imported, // already-seen (prior run) + intra-batch dups
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  runImport,
  // exported for selftest / reuse
  applyCsvColumnMap,
  applyValueMap,
  normMappings,
};
