"use strict";
// Real per-customer credit limits, off book_ledgers.credit_limit (already a real
// column, already enforced by documents.js::convertDocument's credit-limit gate -
// just never surfaced or settable from any UI). An audit found THREE separate
// per-page KV credit-limit trackers (Receivables/Collections/Invoices), each its
// own list keyed by customer name, that could each show a different limit for the
// exact same customer and none of which the real invoice-conversion gate ever saw.
// This is now the one place any page reads/writes a customer's real credit limit.
const { pool } = require("../../db");
const { resolvePartyLedgerByName } = require("./documents");

// All customer (Sundry Debtors) ledgers, with real credit limit + real outstanding
// (the same SUM(debit-credit) over non-cancelled vouchers documents.js's gate uses).
async function listCustomerCredit(tenantId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.credit_limit,
            COALESCE((SELECT SUM(e.debit-e.credit) FROM book_voucher_entries e
                        JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false
                       WHERE e.tenant_id=l.tenant_id AND e.ledger_id=l.id),0) AS outstanding
       FROM book_ledgers l JOIN book_account_groups g ON g.id=l.group_id
      WHERE l.tenant_id=$1 AND g.name='Sundry Debtors' AND l.is_active
      ORDER BY l.name`,
    [tenantId]
  );
  return rows.map((r) => ({
    ledgerId: r.id, name: r.name,
    creditLimit: Number(r.credit_limit) || 0, outstanding: Number(r.outstanding) || 0,
  }));
}

// Set (0 = clear) a customer's real credit limit by name - resolves/creates the
// Sundry Debtors ledger the exact same way posting an invoice to them would.
async function setCustomerCreditLimit(tenantId, name, limit) {
  const ledgerId = await resolvePartyLedgerByName(tenantId, name, "SALES");
  const { rows } = await pool.query(
    "UPDATE book_ledgers SET credit_limit=$1 WHERE tenant_id=$2 AND id=$3 RETURNING id, name, credit_limit",
    [Number(limit) || 0, tenantId, ledgerId]
  );
  return rows[0];
}

module.exports = { listCustomerCredit, setCustomerCreditLimit };
