// Ledger master cleanup — merge duplicates and delete unused ledgers. Merging
// repoints every voucher/party reference from the duplicate to the target AND
// folds the duplicate's incremental balance snapshots + opening into the target,
// so trial balance / reports stay correct. All in one transaction.
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { PostError } = require("./posting-engine");
const validators = require("../../lib/validators");

// Resolve a group reference that may be a UUID (id) or a group name, to its id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveGroupId(tenantId, group) {
  const g = String(group == null ? "" : group).trim();
  if (!g) throw new PostError("BAD_INPUT", "group required", 400);
  if (UUID_RE.test(g)) {
    const { rows } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND id=$2", [tenantId, g]);
    if (!rows[0]) throw new PostError("NOT_FOUND", `Group not found: ${g}`, 404);
    return rows[0].id;
  }
  const { rows } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND lower(name)=lower($2)", [tenantId, g]);
  if (!rows[0]) throw new PostError("NOT_FOUND", `Group not found: ${g}`, 404);
  return rows[0].id;
}

// Create one ledger — same validation + INSERT as POST /api/books/ledgers, plus
// group-by-name resolution. opening_dir ('debit'/'credit'/'dr'/'cr') maps to
// opening_is_debit (defaults to debit). Single INSERT, non-transactional.
async function createOneLedger(tenantId, row) {
  const r = row || {};
  if (!r.name) throw new PostError("BAD_INPUT", "name required", 400);
  if (r.gstin && !validators.isValidGstin(String(r.gstin).toUpperCase())) throw new PostError("BAD_INPUT", "Invalid GSTIN (checksum failed)", 400);
  if (r.pan && !validators.isValidPan(String(r.pan).toUpperCase())) throw new PostError("BAD_INPUT", "Invalid PAN", 400);
  const groupId = await resolveGroupId(tenantId, r.group != null ? r.group : r.group_id);
  const openingIsDebit = r.opening_dir == null
    ? (r.opening_is_debit !== false)
    : !/^(c|cr|credit)$/i.test(String(r.opening_dir).trim());
  const { rows } = await pool.query(
    `INSERT INTO book_ledgers(tenant_id,name,group_id,opening_balance,opening_is_debit,is_party,gstin,pan,is_bank)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [tenantId, r.name, groupId, r.opening_balance || 0, openingIsDebit, !!r.is_party, r.gstin || null, r.pan || null, !!r.is_bank]
  );
  return rows[0];
}

// Bulk-create ledgers (Chart-of-Accounts + party bulk add). Each row reuses the
// single-create logic above and runs in its own try/catch so one bad row never
// aborts the rest. createOneLedger is a single INSERT (non-transactional), so
// per-row error isolation is sufficient — no batch transaction needed.
async function bulkCreateLedgers(tenantId, actorId, rows) {
  if (!Array.isArray(rows)) throw new PostError("BAD_INPUT", "rows array required", 400);
  let created = 0, failed = 0; const errors = [];
  for (let i = 0; i < rows.length; i++) {
    try { await createOneLedger(tenantId, rows[i] || {}); created++; }
    catch (e) { failed++; errors.push({ row: i + 1, error: e.message }); }
  }
  return { created, failed, errors };
}

// Signed opening (debit-positive) of a ledger row.
const signedOpening = (l) => money(l.opening_balance || 0).mul(l.opening_is_debit ? 1 : -1);

async function mergeLedger(tenantId, fromId, toId) {
  if (!fromId || !toId || fromId === toId) throw new PostError("BAD_INPUT", "distinct fromId and toId required", 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: led } = await client.query("SELECT * FROM book_ledgers WHERE tenant_id=$1 AND id = ANY($2::uuid[]) FOR UPDATE", [tenantId, [fromId, toId]]);
    const from = led.find((l) => l.id === fromId), to = led.find((l) => l.id === toId);
    if (!from || !to) throw new PostError("NOT_FOUND", "Both ledgers must exist in this tenant", 404);

    // 1. Repoint transactions + party references.
    await client.query("UPDATE book_voucher_entries SET ledger_id=$3 WHERE tenant_id=$1 AND ledger_id=$2", [tenantId, fromId, toId]);
    await client.query("UPDATE book_vouchers SET party_ledger_id=$3 WHERE tenant_id=$1 AND party_ledger_id=$2", [tenantId, fromId, toId]);

    // 2. Fold the duplicate's balance snapshots into the target (per FY/period), then drop them.
    await client.query(
      `INSERT INTO book_ledger_balances(tenant_id,ledger_id,financial_year,period_month,opening_signed,total_debit,total_credit,closing_signed,updated_at)
         SELECT tenant_id,$3,financial_year,period_month,opening_signed,total_debit,total_credit,closing_signed,now()
           FROM book_ledger_balances WHERE tenant_id=$1 AND ledger_id=$2
       ON CONFLICT(tenant_id,ledger_id,financial_year,period_month) DO UPDATE
         SET opening_signed = book_ledger_balances.opening_signed + EXCLUDED.opening_signed,
             total_debit    = book_ledger_balances.total_debit    + EXCLUDED.total_debit,
             total_credit   = book_ledger_balances.total_credit   + EXCLUDED.total_credit,
             closing_signed = book_ledger_balances.closing_signed + EXCLUDED.closing_signed,
             updated_at = now()`,
      [tenantId, fromId, toId]
    );
    await client.query("DELETE FROM book_ledger_balances WHERE tenant_id=$1 AND ledger_id=$2", [tenantId, fromId]);

    // 3. Fold the duplicate's master opening into the target.
    const combined = signedOpening(to).plus(signedOpening(from));
    await client.query("UPDATE book_ledgers SET opening_balance=$2, opening_is_debit=$3 WHERE id=$1",
      [toId, toDb(combined.abs()), combined.greaterThanOrEqualTo(0)]);

    // 4. Drop the now-empty duplicate.
    await client.query("DELETE FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, fromId]);
    await client.query("COMMIT");
    return { ok: true, merged: fromId, into: toId };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Delete an unused ledger (no postings, zero opening). Otherwise the caller must merge.
async function deleteLedger(tenantId, id) {
  const { rows: e } = await pool.query("SELECT 1 FROM book_voucher_entries WHERE tenant_id=$1 AND ledger_id=$2 LIMIT 1", [tenantId, id]);
  if (e[0]) throw new PostError("IN_USE", "Ledger has postings — merge it into another ledger instead of deleting", 409);
  const { rows: l } = await pool.query("SELECT opening_balance FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!l[0]) throw new PostError("NOT_FOUND", "Ledger not found", 404);
  if (money(l[0].opening_balance || 0).greaterThan(0)) throw new PostError("HAS_OPENING", "Clear the opening balance before deleting", 409);
  await pool.query("DELETE FROM book_ledger_balances WHERE tenant_id=$1 AND ledger_id=$2", [tenantId, id]);
  await pool.query("DELETE FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  return { ok: true, deleted: id };
}

module.exports = { mergeLedger, deleteLedger, bulkCreateLedgers, createOneLedger };
