"use strict";
// Shared invoice-document factory — the ONE place an invoice row + line items are created, used
// by both POST /api/invoices and the recurring-invoice cron so a generated invoice is
// indistinguishable from a hand-raised one (same numbering, same totals math, same shape).
// Runs inside the caller's tenant-scoped transaction client (invoices is FORCE-RLS).

function nextInvoiceNumber(existing) {
  const year = new Date().getFullYear();
  const nums = existing
    .map((n) => { const m = n.match(/INV-\d{4}-(\d+)$/); return m ? parseInt(m[1]) : 0; })
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(3, "0")}`;
}

// Insert the invoice + items atomically on `client`. Totals are recomputed here from the
// items (never trusted from the caller). Returns the inserted invoice row.
async function createInvoiceTx(client, tenantId, {
  customer_name, customer_gstin = null, customer_email = null, customer_phone = null,
  gst_rate = 18, due_date = null, items = [], status = "draft",
}) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0);
  const gstSum = items.reduce((s, i) => {
    const lineAmt = parseFloat(i.quantity) * parseFloat(i.unit_price);
    return s + (lineAmt * (i.gst_rate ?? gst_rate) / 100);
  }, 0);
  const gst_amount = parseFloat(gstSum.toFixed(2));
  const total = parseFloat((subtotal + gst_amount).toFixed(2));

  // Serialize numbering per tenant for the rest of this transaction. The old
  // unlocked read-max-insert let two concurrent creates mint the SAME number
  // (and the Razorpay webhook resolves invoices BY number, so a duplicate could
  // mark the wrong customer's invoice paid). The advisory xact-lock is the
  // primary guard; the unique index from migration 0031 is the backstop. MAX is
  // taken over ALL rows, not a last-50 window (which could repeat a number for
  // tenants whose recent 50 don't include the highest-numbered invoice).
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${tenantId}:invoice-number`]);
  const { rows: [mx] } = await client.query(
    `SELECT COALESCE(MAX((regexp_match(invoice_number, 'INV-\\d{4}-(\\d+)$'))[1]::int), 0) AS maxn
       FROM invoices WHERE tenant_id=$1`,
    [tenantId]
  );
  const invoice_number = `INV-${new Date().getFullYear()}-${String(Number(mx.maxn) + 1).padStart(3, "0")}`;
  const { rows: [row] } = await client.query(
    `INSERT INTO invoices(tenant_id, invoice_number, customer_name, customer_gstin, customer_email,
       customer_phone, subtotal, gst_rate, gst_amount, total_amount, status, due_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [tenantId, invoice_number, customer_name, customer_gstin, customer_email, customer_phone,
     subtotal, gst_rate, gst_amount, total, status, due_date]
  );
  for (const item of items) {
    const amt = parseFloat(item.quantity) * parseFloat(item.unit_price);
    await client.query(
      "INSERT INTO invoice_items(invoice_id, description, hsn_sac, quantity, unit_price, gst_rate, amount) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [row.id, item.description, item.hsn_sac ?? null, item.quantity, item.unit_price, item.gst_rate ?? gst_rate, amt]
    );
  }
  return row;
}

module.exports = { nextInvoiceNumber, createInvoiceTx };
