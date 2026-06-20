// Ledger master cleanup — merge duplicates and delete unused ledgers. Merging
// repoints every voucher/party reference from the duplicate to the target AND
// folds the duplicate's incremental balance snapshots + opening into the target,
// so trial balance / reports stay correct. All in one transaction.
const { pool } = require("../../db");
const { money, toDb } = require("./money");
const { PostError } = require("./posting-engine");

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

module.exports = { mergeLedger, deleteLedger };
