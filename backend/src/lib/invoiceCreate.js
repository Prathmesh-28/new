"use strict";
// Shared invoice-document factory — the ONE place an invoice row + line items are created, used
// by both POST /api/invoices and the recurring-invoice cron so a generated invoice is
// indistinguishable from a hand-raised one (same numbering, same totals math, same shape).
// Runs inside the caller's tenant-scoped transaction client (invoices is FORCE-RLS).
const { computeInvoice, dueDateFromTerms } = require("./invoiceTotals");

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

/** The seller's own GST state code — the other half of the IGST-vs-CGST/SGST decision. */
async function sellerStateCode(client, tenantId) {
  try {
    const { rows } = await client.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [tenantId]);
    const g = String(rows[0]?.gstin || "").trim();
    return /^\d{2}/.test(g) ? g.slice(0, 2) : null;
  } catch { return null; }
}

async function createInvoiceTx(client, tenantId, {
  customer_name, customer_gstin = null, customer_email = null, customer_phone = null,
  gst_rate = 18, due_date = null, items = [], status = "draft", customer_id = null,
  invoice_date = null, place_of_supply_code = null, reverse_charge = false,
  discount_amount = 0, shipping_amount = 0, currency = "INR", exchange_rate = 1,
  po_number = null, reference = null, terms = null, notes = null, round_off_enabled = true,
}) {
  const resolvedCustomerId = await resolveCustomerId(client, tenantId, { customer_name, customer_gstin, customer_email, customer_phone, customer_id });

  // Defaults that come from the customer master rather than being typed again each time:
  // the place of supply that decides the tax split, and the payment terms that decide the
  // due date. Anything passed in explicitly still wins.
  let master = null;
  if (resolvedCustomerId) {
    const { rows } = await client.query(
      "SELECT place_of_supply_code, payment_terms_days, gstin FROM customers WHERE id=$1 AND tenant_id=$2",
      [resolvedCustomerId, tenantId]);
    master = rows[0] || null;
  }

  const docDate = String(invoice_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const pos = place_of_supply_code
    || (/^\d{2}/.test(String(customer_gstin || "")) ? String(customer_gstin).slice(0, 2) : null)
    || master?.place_of_supply_code
    || null;
  const dueDate = due_date || (master?.payment_terms_days ? dueDateFromTerms(docDate, master.payment_terms_days) : null);

  const totals = computeInvoice({
    items, gst_rate, discount_amount, shipping_amount,
    place_of_supply_code: pos,
    seller_state_code: await sellerStateCode(client, tenantId),
    reverse_charge, round_off_enabled,
  });
  const subtotal = totals.taxable_total;
  const gst_amount = totals.gst_amount;
  const total = totals.total_amount;

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
  const invoice_number = `INV-${new Date(docDate).getFullYear()}-${String(Number(mx.maxn) + 1).padStart(3, "0")}`;
  const { rows: [row] } = await client.query(
    `INSERT INTO invoices(tenant_id, invoice_number, customer_name, customer_gstin, customer_email,
       customer_phone, subtotal, gst_rate, gst_amount, total_amount, status, due_date, customer_id,
       invoice_date, place_of_supply_code, is_inter_state, reverse_charge,
       cgst_amount, sgst_amount, igst_amount, currency, exchange_rate,
       po_number, reference, terms, notes, discount_amount, shipping_amount, round_off, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
            $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29, now())
     RETURNING *`,
    [tenantId, invoice_number, customer_name, customer_gstin, customer_email, customer_phone,
     subtotal, gst_rate, gst_amount, total, status, dueDate, resolvedCustomerId,
     docDate, pos, totals.is_inter_state, !!reverse_charge,
     totals.cgst_amount, totals.sgst_amount, totals.igst_amount, currency, exchange_rate,
     po_number, reference, terms, notes, totals.discount_amount, totals.shipping_amount, totals.round_off]
  );
  for (const line of totals.lines) {
    await client.query(
      `INSERT INTO invoice_items(invoice_id, description, hsn_sac, quantity, unit_price, gst_rate, amount,
         uom, discount_pct, discount_amount, taxable_value, tax_amount)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.id, line.description, line.hsn_sac ?? null, line.quantity, line.unit_price, line.taxRate,
       line.taxable_value, line.uom ?? null, line.discount_pct, line.discount_amount, line.taxable_value, line.tax_amount]
    );
  }
  return row;
}

module.exports = { nextInvoiceNumber, createInvoiceTx, resolveCustomerId, sellerStateCode };
