// §12 - Transaction Rules engine (Firefly-III-style, logic ported not copied).
//
// Shape:  rule_groups → rules → { triggers[], actions[] }
//   • A rule_group is an ordered bucket of rules (lower order_index runs first).
//   • A rule has strict_mode = 'AND' (all triggers must hit) or 'OR' (any trigger),
//     an active flag, an order_index, and stop_processing (halt the whole engine
//     once this rule fires - mirrors Firefly's "stop processing" switch).
//   • A trigger is { field, operator, value, negate } evaluated over a transaction
//     row. Negate inverts the single trigger's boolean result.
//   • An action mutates the row: set_category / add_tag / set_ledger (the GL ledger
//     a confirmed line will post against) / set_flag / clear / convert (flip sign).
//
// applyRules(tenantId, rows) loads the tenant's active rules once, runs them over an
// array of plain transaction/bank rows, and returns the MUTATED rows plus a per-row
// audit of which rules fired. It never touches the GL - categorisation is metadata;
// posting still goes through ./posting-engine when a line is confirmed.
//
// Also exports a unified search-operator parser so a single string like
//   amount_more:1000 description_contains:swiggy -category_is:Travel date_after:2026-04-01
// compiles into the same trigger objects the DB stores.
const { pool } = require("../../db");
const { money } = require("./money");
const { PostError } = require("./posting-engine");

// ── Trigger vocabulary ────────────────────────────────────────────────────────
// Each field maps a row to a comparable value; each operator is a pure predicate.
// Keeping these as data (not a switch) is what makes the search-language parser and
// the evaluator share one source of truth.
const FIELDS = {
  amount: (row) => money(row.amount == null ? 0 : row.amount),
  amount_abs: (row) => money(row.amount == null ? 0 : row.amount).abs(),
  description: (row) => String(row.description == null ? "" : row.description),
  reference: (row) => String(row.reference == null ? "" : row.reference),
  // "account" = the bank ledger the line belongs to; "category"/"tag"/"ledger" are
  // the categorisation slots actions write - so later rules can react to them.
  account: (row) => String(row.bank_ledger_id == null ? (row.account || "") : row.bank_ledger_id),
  category: (row) => String(row.category == null ? "" : row.category),
  ledger: (row) => String(row.suggested_ledger_id == null ? (row.ledger || "") : row.suggested_ledger_id),
  date: (row) => String(row.txn_date == null ? (row.date || "") : row.txn_date),
  tag: (row) => (Array.isArray(row.tags) ? row.tags.map(String) : []),
};

const lc = (s) => String(s).toLowerCase();

// Operators. Numeric ops coerce via money(); string ops are case-insensitive; the
// `*_any`/`tag_*` ops take a comma list. Each returns a plain boolean.
const OPERATORS = {
  // text
  contains: (a, b) => lc(a).includes(lc(b)),
  not_contains: (a, b) => !lc(a).includes(lc(b)),
  is: (a, b) => lc(a) === lc(b),
  is_not: (a, b) => lc(a) !== lc(b),
  starts: (a, b) => lc(a).startsWith(lc(b)),
  ends: (a, b) => lc(a).endsWith(lc(b)),
  matches: (a, b) => { try { return new RegExp(b, "i").test(String(a)); } catch (_) { return false; } },
  any: (a, b) => String(b).split(",").map((x) => lc(x.trim())).filter(Boolean).includes(lc(a)),
  // numeric (money-safe)
  more: (a, b) => money(a).greaterThan(money(b)),
  more_eq: (a, b) => money(a).greaterThanOrEqualTo(money(b)),
  less: (a, b) => money(a).lessThan(money(b)),
  less_eq: (a, b) => money(a).lessThanOrEqualTo(money(b)),
  eq: (a, b) => money(a).equals(money(b)),
  // date (ISO strings compare lexicographically once normalised to yyyy-mm-dd)
  before: (a, b) => String(a).slice(0, 10) < String(b).slice(0, 10),
  after: (a, b) => String(a).slice(0, 10) > String(b).slice(0, 10),
  on: (a, b) => String(a).slice(0, 10) === String(b).slice(0, 10),
  // array (tags)
  has: (arr, b) => Array.isArray(arr) && arr.map(lc).includes(lc(b)),
  has_not: (arr, b) => !(Array.isArray(arr) && arr.map(lc).includes(lc(b))),
};

// ── Search-operator language ───────────────────────────────────────────────────
// Token grammar:  [-]field_operator:value   (value may be "quoted with spaces")
// A leading '-' on the token negates that trigger. The field/operator split takes
// the LAST underscore-segment that names a known operator, so multi-word fields
// (amount_abs_more) and multi-word operators (not_contains, more_eq) both parse.
const OP_NAMES = Object.keys(OPERATORS)
  .concat(["not_contains", "more_eq", "less_eq", "is_not", "has_not"]) // multi-word, longest-first below
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort((x, y) => y.length - x.length);

function splitFieldOp(key) {
  // key like "amount_abs_more" → field "amount_abs", op "more".
  for (const op of OP_NAMES) {
    if (key === op) return null; // bare operator with no field - invalid
    if (key.endsWith("_" + op)) {
      const field = key.slice(0, -(op.length + 1));
      if (FIELDS[field]) return { field, operator: op };
    }
  }
  return null;
}

function tokenizeSearch(str) {
  // Splits on whitespace but keeps quoted spans together.
  const out = [];
  const re = /(-?)([a-z_]+):("([^"]*)"|\S+)/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const negate = m[1] === "-";
    const key = m[2];
    const raw = m[4] != null ? m[4] : m[3];
    out.push({ negate, key, value: raw });
  }
  return out;
}

// Compile a search string into trigger objects (the same shape stored in JSONB).
function parseSearch(str) {
  if (!str || typeof str !== "string") return [];
  return tokenizeSearch(str)
    .map((t) => {
      const fo = splitFieldOp(lc(t.key));
      if (!fo) return null;
      return { field: fo.field, operator: fo.operator, value: t.value, negate: t.negate };
    })
    .filter(Boolean);
}

// ── Evaluation (pure) ───────────────────────────────────────────────────────────
function evalTrigger(trigger, row) {
  const getField = FIELDS[trigger.field];
  const op = OPERATORS[trigger.operator];
  if (!getField || !op) return false; // unknown field/op never matches (fail-closed)
  let result;
  try { result = !!op(getField(row), trigger.value); } catch (_) { result = false; }
  return trigger.negate ? !result : result;
}

function ruleMatches(rule, row) {
  const trigs = Array.isArray(rule.triggers) ? rule.triggers : [];
  if (trigs.length === 0) return false; // a rule with no triggers fires on nothing
  const mode = String(rule.strict_mode || "AND").toUpperCase();
  return mode === "OR"
    ? trigs.some((t) => evalTrigger(t, row))
    : trigs.every((t) => evalTrigger(t, row));
}

// Apply one action to a row IN PLACE-ish (returns a new object) and record the change.
function runAction(action, row) {
  const r = { ...row };
  switch (action.type) {
    case "set_category": r.category = action.value; break;
    case "set_ledger": r.suggested_ledger_id = action.value; break;
    case "add_tag": {
      const tags = Array.isArray(r.tags) ? r.tags.slice() : [];
      if (!tags.map(lc).includes(lc(action.value))) tags.push(action.value);
      r.tags = tags;
      break;
    }
    case "set_flag": r.flagged = action.value == null ? true : !!action.value; break;
    case "clear_category": r.category = null; break;
    case "convert": {
      // Flip the sign (e.g. a refund miscoded as a debit) - money-safe, never float.
      r.amount = money(r.amount == null ? 0 : r.amount).neg().toFixed(4);
      break;
    }
    default: break; // unknown action is a no-op (forward-compatible)
  }
  return r;
}

// Run an ordered rule list over a single row. Honors stop_processing.
function applyRuleListToRow(rules, row) {
  let cur = row;
  const fired = [];
  for (const rule of rules) {
    if (rule.is_active === false) continue;
    if (!ruleMatches(rule, cur)) continue;
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    for (const a of actions) cur = runAction(a, cur);
    fired.push({ ruleId: rule.id, ruleName: rule.name });
    if (rule.stop_processing) break;
  }
  return { row: cur, fired };
}

// ── DB CRUD ──────────────────────────────────────────────────────────────────
async function createRuleGroup(tenantId, d = {}) {
  if (!d.name) throw new PostError("BAD_INPUT", "name required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_rule_groups(tenant_id,name,description,order_index,is_active)
       VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,name) DO UPDATE SET
       description=EXCLUDED.description, order_index=EXCLUDED.order_index, is_active=EXCLUDED.is_active
     RETURNING *`,
    [tenantId, d.name, d.description || null, Number.isFinite(d.orderIndex) ? d.orderIndex : 0, d.isActive !== false]
  );
  return rows[0];
}

async function listRuleGroups(tenantId) {
  const { rows } = await pool.query(
    "SELECT * FROM book_rule_groups WHERE tenant_id=$1 ORDER BY order_index, name",
    [tenantId]
  );
  return rows;
}

// Normalise/validate trigger + action arrays before they hit JSONB. We accept either
// an explicit triggers[] or a `search` string (which we compile).
function normalizeTriggers(d) {
  let triggers = Array.isArray(d.triggers) ? d.triggers : [];
  if (d.search) triggers = triggers.concat(parseSearch(d.search));
  return triggers
    .filter((t) => t && t.field && t.operator)
    .map((t) => ({
      field: String(t.field),
      operator: String(t.operator),
      value: t.value == null ? "" : String(t.value),
      negate: !!t.negate,
    }));
}

function normalizeActions(d) {
  return (Array.isArray(d.actions) ? d.actions : [])
    .filter((a) => a && a.type)
    .map((a) => ({ type: String(a.type), value: a.value == null ? null : a.value }));
}

async function createRule(tenantId, d = {}) {
  if (!d.groupId) throw new PostError("BAD_INPUT", "groupId required", 400);
  if (!d.name) throw new PostError("BAD_INPUT", "name required", 400);
  // Group must belong to the tenant.
  const { rows: g } = await pool.query(
    "SELECT id FROM book_rule_groups WHERE tenant_id=$1 AND id=$2",
    [tenantId, d.groupId]
  );
  if (!g[0]) throw new PostError("NOT_FOUND", "Rule group not found", 404);
  const triggers = normalizeTriggers(d);
  const actions = normalizeActions(d);
  if (triggers.length === 0) throw new PostError("BAD_INPUT", "rule needs at least one trigger", 400);
  if (actions.length === 0) throw new PostError("BAD_INPUT", "rule needs at least one action", 400);
  const strict = String(d.strictMode || "AND").toUpperCase();
  if (strict !== "AND" && strict !== "OR") throw new PostError("BAD_INPUT", "strictMode must be AND or OR", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_rules(tenant_id,group_id,name,description,strict_mode,is_active,stop_processing,order_index,triggers,actions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *`,
    [
      tenantId, d.groupId, d.name, d.description || null, strict,
      d.isActive !== false, !!d.stopProcessing,
      Number.isFinite(d.orderIndex) ? d.orderIndex : 0,
      JSON.stringify(triggers), JSON.stringify(actions),
    ]
  );
  return rows[0];
}

async function updateRule(tenantId, id, d = {}) {
  const triggers = d.triggers || d.search ? normalizeTriggers(d) : null;
  const actions = d.actions ? normalizeActions(d) : null;
  let strict = null;
  if (d.strictMode != null) {
    strict = String(d.strictMode).toUpperCase();
    if (strict !== "AND" && strict !== "OR") throw new PostError("BAD_INPUT", "strictMode must be AND or OR", 400);
  }
  const { rows } = await pool.query(
    `UPDATE book_rules SET
        name=COALESCE($3,name),
        description=COALESCE($4,description),
        strict_mode=COALESCE($5,strict_mode),
        is_active=COALESCE($6,is_active),
        stop_processing=COALESCE($7,stop_processing),
        order_index=COALESCE($8,order_index),
        triggers=COALESCE($9::jsonb,triggers),
        actions=COALESCE($10::jsonb,actions),
        updated_at=now()
      WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [
      tenantId, id, d.name ?? null, d.description ?? null, strict,
      d.isActive ?? null, d.stopProcessing ?? null,
      Number.isFinite(d.orderIndex) ? d.orderIndex : null,
      triggers ? JSON.stringify(triggers) : null,
      actions ? JSON.stringify(actions) : null,
    ]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Rule not found", 404);
  return rows[0];
}

async function deleteRule(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_rules WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Rule not found", 404);
  return { ok: true };
}

// List rules, optionally filtered to one group, ordered the way the engine runs them:
// group.order_index, then rule.order_index.
async function listRules(tenantId, groupId) {
  const params = [tenantId];
  let where = "r.tenant_id=$1";
  if (groupId) { params.push(groupId); where += " AND r.group_id=$2"; }
  const { rows } = await pool.query(
    `SELECT r.*, g.name AS group_name, g.order_index AS group_order, g.is_active AS group_active
       FROM book_rules r JOIN book_rule_groups g ON g.id=r.group_id
      WHERE ${where}
      ORDER BY g.order_index, g.name, r.order_index, r.name`,
    params
  );
  return rows;
}

// ── The engine entrypoint ───────────────────────────────────────────────────────
// applyRules(tenantId, rows): load the tenant's active rules (ordered), run them over
// each row, and return { rows: [...mutated], fired: [{ index, ruleId, ruleName }...] }.
// `rows` is an array of plain transaction/bank objects ({ amount, description,
// reference, txn_date|date, bank_ledger_id, category, tags, ... }). Pure w.r.t. the GL.
async function applyRules(tenantId, rows) {
  const list = Array.isArray(rows) ? rows : [];
  // Only active rules whose group is also active. Engine order = group then rule.
  const { rows: rules } = await pool.query(
    `SELECT r.id, r.name, r.strict_mode, r.is_active, r.stop_processing, r.order_index, r.triggers, r.actions
       FROM book_rules r JOIN book_rule_groups g ON g.id=r.group_id
      WHERE r.tenant_id=$1 AND r.is_active=true AND g.is_active=true
      ORDER BY g.order_index, g.name, r.order_index, r.name`,
    [tenantId]
  );
  const out = [];
  const fired = [];
  list.forEach((row, index) => {
    const res = applyRuleListToRow(rules, row);
    out.push(res.row);
    for (const f of res.fired) fired.push({ index, ruleId: f.ruleId, ruleName: f.ruleName });
  });
  return { rows: out, fired };
}

module.exports = {
  // pure (selftest-able)
  FIELDS, OPERATORS, parseSearch, tokenizeSearch, splitFieldOp,
  evalTrigger, ruleMatches, runAction, applyRuleListToRow,
  // DB
  createRuleGroup, listRuleGroups, createRule, updateRule, deleteRule, listRules,
  applyRules,
};
