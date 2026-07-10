"use strict";
// GST invoice for HEADROOM'S OWN subscription charge - distinct from the customer
// invoices a tenant issues its own buyers (routes/invoices.js). A B2B tenant needs
// one of THESE to claim ITC on what it pays Headroom.
//
// PRICING NOTE (flagged to the user, not silently decided): the amount actually
// charged via Razorpay today (PLAN_PRICING in routes/billing.js) has never included
// GST - checkout charges exactly the listed price. This module treats that charged
// amount as GST-INCLUSIVE and back-calculates base+GST from it, so every invoice
// reconciles exactly with money that really moved. The alternative - grossing up
// checkout to charge base*1.18 so the listed prices are truly "ex-GST" as the
// pricing page's fine print claims - would raise what customers actually pay and is
// a pricing decision, not a compliance one; this module doesn't make that call.
const { pool } = require("../db");
const { taxSplit } = require("./gstInvoice");

const GST_RATE = 18;
const platformGstin = () => (process.env.PLATFORM_GSTIN || "").trim() || null;
const platformLegalName = () => process.env.PLATFORM_LEGAL_NAME || "Headroom";
const platformAddress = () => process.env.PLATFORM_ADDRESS || "";
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function nextInvoiceNumber(client) {
  const { rows } = await client.query("SELECT nextval('subscription_invoice_seq') AS n");
  return `HR-INV-${String(rows[0].n).padStart(6, "0")}`;
}

// amountPaise: what was ACTUALLY charged via Razorpay for this specific payment.
// Idempotent per razorpay_payment_id - a webhook retry or a double verify-call must
// never mint two invoices for the same charge.
async function recordInvoice(tenantId, { plan, cycle, amountPaise, razorpayPaymentId }) {
  if (!razorpayPaymentId || !Number.isFinite(amountPaise) || amountPaise <= 0) return null;
  const { rows: dup } = await pool.query("SELECT * FROM subscription_invoices WHERE razorpay_payment_id=$1", [razorpayPaymentId]);
  if (dup[0]) return dup[0];

  const { rows: profRows } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [tenantId]).catch(() => ({ rows: [] }));
  const buyerGstin = profRows[0]?.gstin || null;

  const totalInr = amountPaise / 100;
  const baseInr = round2(totalInr / (1 + GST_RATE / 100));
  const gstInr = round2(totalInr - baseInr);
  const split = taxSplit({ gstAmount: gstInr, gstRate: GST_RATE, buyerGstin, sellerGstin: platformGstin() });

  try {
    const invoiceNumber = await nextInvoiceNumber(pool);
    const { rows } = await pool.query(
      `INSERT INTO subscription_invoices(tenant_id, invoice_number, plan, cycle, base_amount, gst_rate, gst_amount, total_amount, razorpay_payment_id, buyer_gstin, inter_state)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (razorpay_payment_id) DO NOTHING RETURNING *`,
      [tenantId, invoiceNumber, plan, cycle, baseInr, GST_RATE, gstInr, totalInr, razorpayPaymentId, buyerGstin, split.interState]
    );
    // A concurrent duplicate call raced us to the unique constraint - fetch what it inserted.
    if (!rows[0]) { const { rows: r2 } = await pool.query("SELECT * FROM subscription_invoices WHERE razorpay_payment_id=$1", [razorpayPaymentId]); return r2[0] || null; }
    return rows[0];
  } catch (e) {
    console.error("[subscription-invoice] record failed:", e.message);
    return null;
  }
}

async function listInvoices(tenantId) {
  const { rows } = await pool.query(
    "SELECT id, invoice_number, plan, cycle, base_amount, gst_amount, total_amount, created_at FROM subscription_invoices WHERE tenant_id=$1 ORDER BY created_at DESC",
    [tenantId]
  );
  return rows;
}

async function getInvoice(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM subscription_invoices WHERE id=$1 AND tenant_id=$2", [id, tenantId]);
  return rows[0] || null;
}

module.exports = { recordInvoice, listInvoices, getInvoice, GST_RATE, platformGstin, platformLegalName, platformAddress };
