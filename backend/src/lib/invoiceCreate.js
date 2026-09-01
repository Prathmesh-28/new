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
/**
 * Find (or create) the customer master row for this invoice.
 *
 * Invoices used to carry only a free-text name, so "Acme Traders" and "Acme traders" were
 * different customers and no ledger was possible. Every invoice now links to a master row:
 * an existing customer is matched case-insensitively on the trimmed name (the same key the
 * unique index in 0034 uses), and an unknown name creates one rather than making the user
 * stop and fill in a form before they can bill anyone.
 *
 * `customer_name` still gets written onto the invoice as the name AS BILLED — correcting a
 * customer's name later must not silently rewrite invoices already issued.
 */
async function resolveCustomerId(client, tenantId, { customer_name, customer_gstin, customer_email, customer_phone, customer_id }) {
  if (customer_id) {
    const { rows } = await client.query("SELECT id FROM customers WHERE id=$1 AND tenant_id=$2", [customer_id, tenantId]);
    if (rows[0]) return rows[0].id;
  }
  const name = String(customer_name || "").trim();
  if (!name) return null;

  const found = await client.query(
    "SELECT id FROM customers WHERE tenant_id=$1 AND lower(btrim(name))=lower(btrim($2))", [tenantId, name]);
  if (found.rows[0]) return found.rows[0].id;

  const posCode = /^\d{2}/.test(String(customer_gstin || "").trim()) ? String(customer_gstin).trim().slice(0, 2) : null;
  const { rows } = await client.query(
    `INSERT INTO customers(tenant_id, name, gstin, email, phone, place_of_supply_code, gst_treatment)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, lower(btrim(name))) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [tenantId, name, customer_gstin || null, customer_email || null, customer_phone || null,
     posCode, customer_gstin ? "regular" : "unregistered"]);
  return rows[0]?.id ?? null;
}

async function createInvoiceTx(client, tenantId, {
  customer_name, customer_gstin = null, customer_email = null, customer_phone = null,
  gst_rate = 18, due_date = null, items = [], status = "draft", customer_id = null,
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
  const resolvedCustomerId = await resolveCustomerId(client, tenantId, { customer_name, customer_gstin, customer_email, customer_phone, customer_id });
  const { rows: [row] } = await client.query(
    `INSERT INTO invoices(tenant_id, invoice_number, customer_name, customer_gstin, customer_email,
       customer_phone, subtotal, gst_rate, gst_amount, total_amount, status, due_date, customer_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [tenantId, invoice_number, customer_name, customer_gstin, customer_email, customer_phone,
     subtotal, gst_rate, gst_amount, total, status, due_date, resolvedCustomerId]
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

module.exports = { nextInvoiceNumber, createInvoiceTx, resolveCustomerId };
