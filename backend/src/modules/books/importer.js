// Bulk onboarding import - the #1 migration blocker. Lets a new tenant load their
// existing chart of accounts, stock masters and opening balances in one shot
// (Tally "Masters export" / ERPNext "Chart of Accounts Importer" shape). Every
// row is validated and upserted independently: one bad row never aborts the batch,
// it lands in `skipped` with a reason. Idempotent - re-running the same file is safe.
const { pool } = require("../../db");
const { money, toDb, eq, ZERO } = require("./money");
const { PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

const s = (v) => (v == null ? "" : String(v).trim());
const isBlank = (v) => s(v) === "";

// ───────────────────────────────────────────────────────────────────────────
// (1) importLedgers - chart of accounts. Resolve group by NAME → group_id.
// We require the group to already exist (seedBooks lays down Tally's 28); an
// unknown group is reported, never auto-created (creating a group needs a
// nature/affects_pl decision we won't guess). ON CONFLICT(tenant,name) upserts.
// ───────────────────────────────────────────────────────────────────────────
async function importLedgers(tenantId, rows) {
  if (!Array.isArray(rows)) throw new PostError("BAD_INPUT", "rows must be an array", 400);
  let created = 0, updated = 0;
  const skipped = [];

  // Resolve every group name once (case-insensitive) so 5000 rows = 1 lookup.
  const { rows: grps } = await pool.query(
    "SELECT id, name FROM book_account_groups WHERE tenant_id=$1", [tenantId]
  );
  const gid = new Map(grps.map((g) => [g.name.toLowerCase(), g.id]));

  for (const raw of rows) {
    const r = raw || {};
    const name = s(r.name);
    const group = s(r.group);
    if (!name) { skipped.push({ name: name || "(blank)", reason: "name required" }); continue; }
    if (!group) { skipped.push({ name, reason: "group required" }); continue; }

    const groupId = gid.get(group.toLowerCase());
    if (!groupId) { skipped.push({ name, reason: `unknown group "${group}" (create it first)` }); continue; }

    // Opening balance is optional; default debit. Negative is allowed but the
    // sign is carried by opening_is_debit, so we store the magnitude.
    let opening = ZERO, isDebit = true;
    if (!isBlank(r.opening_balance)) {
      let bal;
      try { bal = money(r.opening_balance); } catch (_) {
        skipped.push({ name, reason: `bad opening_balance "${r.opening_balance}"` }); continue;
      }
      isDebit = r.opening_is_debit == null ? true : !!r.opening_is_debit;
      if (bal.isNegative()) { bal = bal.abs(); isDebit = !isDebit; } // normalise sign onto the flag
      opening = bal;
    }

    const isParty = r.is_party == null ? null : !!r.is_party;

    try {
      const { rows: out } = await pool.query(
        `INSERT INTO book_ledgers
           (tenant_id, name, group_id, opening_balance, opening_is_debit, is_party,
            gstin, pan, state_code)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,false),$7,$8,$9)
         ON CONFLICT (tenant_id, name) DO UPDATE SET
            group_id         = EXCLUDED.group_id,
            opening_balance  = EXCLUDED.opening_balance,
            opening_is_debit = EXCLUDED.opening_is_debit,
            is_party         = COALESCE($6, book_ledgers.is_party),
            gstin            = COALESCE(EXCLUDED.gstin, book_ledgers.gstin),
            pan              = COALESCE(EXCLUDED.pan, book_ledgers.pan),
            state_code       = COALESCE(EXCLUDED.state_code, book_ledgers.state_code)
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, name, groupId, toDb(opening), isDebit, isParty,
         s(r.gstin) || null, s(r.pan) || null, s(r.state_code) || null]
      );
      if (out[0] && out[0].inserted) created += 1; else updated += 1;
    } catch (err) {
      skipped.push({ name, reason: err.code === "23505" ? "duplicate name" : (err.message || "db error") });
    }
  }

  return { created, updated, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// (2) importItems - stock masters. Tally "Stock Item" / ERPNext "Item" import.
// ───────────────────────────────────────────────────────────────────────────
async function importItems(tenantId, rows) {
  if (!Array.isArray(rows)) throw new PostError("BAD_INPUT", "rows must be an array", 400);
  let created = 0, updated = 0;
  const skipped = [];
  const VALID_VM = new Set(["WEIGHTED_AVG", "FIFO"]);

  for (const raw of rows) {
    const r = raw || {};
    const name = s(r.name);
    const unit = s(r.unit);
    if (!name) { skipped.push({ name: name || "(blank)", reason: "name required" }); continue; }
    if (!unit) { skipped.push({ name, reason: "unit required" }); continue; }

    let gstRate = null;
    if (!isBlank(r.gst_rate)) {
      try { gstRate = toDb(money(r.gst_rate)); } catch (_) {
        skipped.push({ name, reason: `bad gst_rate "${r.gst_rate}"` }); continue;
      }
    }
    let openQty = ZERO, openVal = ZERO;
    try {
      if (!isBlank(r.opening_qty)) openQty = money(r.opening_qty);
      if (!isBlank(r.opening_value)) openVal = money(r.opening_value);
    } catch (_) {
      skipped.push({ name, reason: "bad opening_qty/opening_value" }); continue;
    }
    if (openQty.isNegative() || openVal.isNegative()) {
      skipped.push({ name, reason: "opening qty/value cannot be negative" }); continue;
    }

    const vm = isBlank(r.valuation_method) ? "WEIGHTED_AVG" : s(r.valuation_method).toUpperCase();
    if (!VALID_VM.has(vm)) { skipped.push({ name, reason: `valuation_method must be WEIGHTED_AVG or FIFO` }); continue; }

    try {
      const { rows: out } = await pool.query(
        `INSERT INTO book_stock_items
           (tenant_id, name, unit, hsn_sac, gst_rate, opening_qty, opening_value,
            valuation_method, current_qty, current_value)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6,$7)
         ON CONFLICT (tenant_id, name) DO UPDATE SET
            unit             = EXCLUDED.unit,
            hsn_sac          = COALESCE(EXCLUDED.hsn_sac, book_stock_items.hsn_sac),
            gst_rate         = COALESCE(EXCLUDED.gst_rate, book_stock_items.gst_rate),
            opening_qty      = EXCLUDED.opening_qty,
            opening_value    = EXCLUDED.opening_value,
            valuation_method = EXCLUDED.valuation_method
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, name, unit, s(r.hsn) || null, gstRate,
         toDb(openQty), toDb(openVal), vm]
      );
      if (out[0] && out[0].inserted) created += 1; else updated += 1;
    } catch (err) {
      skipped.push({ name, reason: err.code === "23505" ? "duplicate name" : (err.message || "db error") });
    }
  }

  return { created, updated, skipped };
}

// ───────────────────────────────────────────────────────────────────────────
// (3) importOpeningBalances - set opening on existing ledgers and report the
// net (Σ debit − Σ credit). A correct opening trial balance nets to zero; the
// caller (orchestrator) checks `openingNet` and warns/blocks if it doesn't.
// `ledger` may be a name or a uuid. Each row updated independently.
// ───────────────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function importOpeningBalances(tenantId, rows) {
  if (!Array.isArray(rows)) throw new PostError("BAD_INPUT", "rows must be an array", 400);
  let updated = 0;
  const skipped = [];
  let net = ZERO; // debit positive

  for (const raw of rows) {
    const r = raw || {};
    const ref = s(r.ledger);
    if (!ref) { skipped.push({ name: "(blank)", reason: "ledger required" }); continue; }
    if (isBlank(r.opening_balance)) { skipped.push({ name: ref, reason: "opening_balance required" }); continue; }

    let bal;
    try { bal = money(r.opening_balance); } catch (_) {
      skipped.push({ name: ref, reason: `bad opening_balance "${r.opening_balance}"` }); continue;
    }
    let isDebit = r.opening_is_debit == null ? true : !!r.opening_is_debit;
    if (bal.isNegative()) { bal = bal.abs(); isDebit = !isDebit; }

    // Resolve to a ledger id (accept uuid or name).
    let ledgerId = UUID_RE.test(ref) ? ref : await ledgerIdByName(tenantId, ref);

    let res;
    try {
      res = await pool.query(
        `UPDATE book_ledgers SET opening_balance=$3, opening_is_debit=$4
           WHERE tenant_id=$1 AND id=$2 RETURNING id`,
        [tenantId, ledgerId || "00000000-0000-0000-0000-000000000000", toDb(bal), isDebit]
      );
    } catch (_) {
      res = { rowCount: 0 };
    }
    if (!res.rowCount) { skipped.push({ name: ref, reason: "ledger not found" }); continue; }

    updated += 1;
    net = isDebit ? net.plus(bal) : net.minus(bal);
  }

  return { updated, skipped, openingNet: toDb(net), balanced: eq(net, ZERO) };
}

module.exports = { importLedgers, importItems, importOpeningBalances };
