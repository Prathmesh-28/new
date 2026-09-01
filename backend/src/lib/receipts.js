"use strict";
// ── The one place a receipt is recorded ──────────────────────────────────────
// Extracted from POST /api/invoices/:id/payments so bank-match (Wave 15) and any future
// caller record receipts through IDENTICAL logic — same overpayment guard, same receipt
// numbering, same status transitions. Two copies of this would drift, and receipt logic
// is the last place drift is affordable.
//
// Runs inside the caller's tenant-scoped transaction client. Throws {code} errors the
// caller translates for its audience.
const { round2, applyReceipt } = require("./invoicePaymentMath");

async function recordReceiptTx(client, tenantId, { invoiceId, amount, mode = "other", reference = null, receivedAt = null, userId = null, transactionId = null }) {
  const amt = round2(amount);
  const { rows: [inv] } = await client.query(
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [invoiceId, tenantId]);
  if (!inv) throw Object.assign(new Error("Invoice not found"), { code: "NOT_FOUND" });
  if (inv.status === "cancelled" || inv.voided_at)
    throw Object.assign(new Error("Can't record a payment against a cancelled invoice."), { code: "CANCELLED" });

  const eff = applyReceipt({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }, amt);
  if (!eff.ok) throw Object.assign(
    new Error(`That's more than the ₹${eff.balanceBefore.toLocaleString("en-IN")} still outstanding — record the balance or less.`),
    { code: "OVERPAYMENT", balance: eff.balanceBefore });

  // Receipt numbering, serialised per tenant (same advisory-lock pattern as invoices).
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:receipt-number`]);
  const { rows: [rmax] } = await client.query(
    `SELECT COALESCE(MAX((regexp_match(receipt_number, 'RCT-\\d{4}-(\\d+)$'))[1]::int), 0) AS maxn
       FROM invoice_payments WHERE tenant_id=$1 AND receipt_number IS NOT NULL`, [tenantId]);
  const receiptNumber = `RCT-${new Date().getFullYear()}-${String(Number(rmax.maxn) + 1).padStart(3, "0")}`;

  const { rows: [pay] } = await client.query(
    `INSERT INTO invoice_payments(tenant_id, invoice_id, amount, mode, reference, received_at, created_by, receipt_number, transaction_id)
     VALUES($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7,$8,$9) RETURNING *`,
    [tenantId, inv.id, amt, mode, reference, receivedAt, userId, receiptNumber, transactionId]);

  const { rows: [upd] } = await client.query(
    `UPDATE invoices SET paid_amount=$1,
       status=CASE WHEN $2 THEN 'paid' WHEN status='draft' THEN 'sent' ELSE status END,
       paid_at=CASE WHEN $2 THEN now() ELSE paid_at END
     WHERE id=$3 AND tenant_id=$4 RETURNING *`,
    [eff.newPaid, eff.fullyPaid, inv.id, tenantId]);

  return { inv: upd, pay, fullyPaid: eff.fullyPaid };
}

module.exports = { recordReceiptTx };
