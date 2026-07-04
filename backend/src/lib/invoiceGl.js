"use strict";
// Invoice → GL bridge. The standalone `invoices` table (routes/invoices.js) is not linked
// to the double-entry ledger, so Razorpay/manual collections never reached the books. This
// posts the two vouchers that keep AR + cash + GST correct:
//   SALES   (on send)  Dr Sundry Debtor / Cr Sales / Cr Output GST (CGST+SGST intra, IGST inter)
//   RECEIPT (on paid)  Dr Undeposited Funds / Cr Sundry Debtor
// Best-effort (NEVER throws — an invoice op must still succeed when the books chart isn't
// seeded) and idempotent (sale:inv:<id> / recv:...:<ref>), so the send + pay paths and any
// webhook retry can't double-post. book_* tables are NOT RLS'd → plain pool/postVoucher.
const { pool } = require("../db");
const { postVoucher } = require("../modules/books/posting-engine");
const { resolvePartyLedgerByName } = require("../modules/books/documents");
const { ledgerIdByName } = require("../modules/books/seed");
const { toDb } = require("../modules/books/money");

const num = (v) => (v == null ? 0 : Number(v) || 0);
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
// Shared with the document layer (lib/gstInvoice.js) so the customer-facing tax split can never
// disagree with what the GL posts. Requires 2 leading DIGITS (a real GSTIN state code) —
// a malformed GSTIN now falls back to intra-state, same as no GSTIN at all.
const { stateOf } = require("./gstInvoice");
const isoDate = (d) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); } };

async function sellerGstin(tenantId) {
  try {
    const { rows } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [tenantId]);
    return rows[0]?.gstin || null;
  } catch { return null; }
}

// Post the SALES voucher for an invoice (idempotent on sale:inv:<id>). Returns the
// postVoucher result, or null if the books aren't seeded / nothing to post.
async function postInvoiceSale(tenantId, inv) {
  try {
    const subtotal = round2(num(inv.subtotal));
    const gst = round2(num(inv.gst_amount));
    if (subtotal + gst <= 0) return null;

    const party = await resolvePartyLedgerByName(tenantId, inv.customer_name || "Customer", "SALES");
    const salesL = await ledgerIdByName(tenantId, "Sales");
    if (!party || !salesL) return null; // chart not seeded → leave AR in the invoices table only

    const credits = []; // { ledgerId, amt }
    const taxes = [];
    if (subtotal > 0) credits.push({ ledgerId: salesL, amt: subtotal });

    if (gst > 0) {
      const rate = num(inv.gst_rate);
      const buyer = stateOf(inv.customer_gstin);
      const seller = stateOf(await sellerGstin(tenantId));
      const interState = !!(buyer && seller && buyer !== seller);
      const pos = buyer || seller || null;
      if (interState) {
        const igstL = await ledgerIdByName(tenantId, "IGST Output");
        if (!igstL) return null;
        credits.push({ ledgerId: igstL, amt: gst });
        taxes.push({ taxKind: "IGST", rate, taxableValue: subtotal, taxAmount: gst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
      } else {
        const cgstL = await ledgerIdByName(tenantId, "CGST Output");
        const sgstL = await ledgerIdByName(tenantId, "SGST Output");
        if (!cgstL || !sgstL) return null;
        const cgst = round2(gst / 2);
        const sgst = round2(gst - cgst); // exact remainder so the two halves sum to gst
        credits.push({ ledgerId: cgstL, amt: cgst }, { ledgerId: sgstL, amt: sgst });
        taxes.push({ taxKind: "CGST", rate: round2(rate / 2), taxableValue: subtotal, taxAmount: cgst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
        taxes.push({ taxKind: "SGST", rate: round2(rate / 2), taxableValue: subtotal, taxAmount: sgst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
      }
    }

    // Balanced by construction: party debit == sum of credits (subtotal + gst booked).
    const partyDebit = round2(credits.reduce((s, c) => s + c.amt, 0));
    const entries = [{ ledgerId: party, debit: toDb(partyDebit), credit: "0" }];
    for (const c of credits) entries.push({ ledgerId: c.ledgerId, debit: "0", credit: toDb(c.amt) });

    return await postVoucher(
      tenantId, null,
      { voucherType: "SALES", voucherDate: isoDate(inv.created_at || Date.now()), narration: `Invoice ${inv.invoice_number || ""}`.trim(), reference: inv.invoice_number || null, partyLedgerId: party, source: "invoice" },
      entries,
      { idempotencyKey: `sale:inv:${inv.id}`, taxes }
    );
  } catch (e) {
    console.warn("[invoiceGl] sale voucher skipped:", e && e.message);
    return null;
  }
}

// Post the RECEIPT voucher for an invoice payment (idempotent). Ensures the SALES
// voucher is booked first (idempotent), so the debtor is never driven negative even
// for invoices that were paid without ever passing through the "send" path.
async function postInvoiceReceipt(tenantId, inv, { amount, ref, idempotencyKey } = {}) {
  try {
    const amt = round2(amount != null ? num(amount) : num(inv.total_amount));
    if (amt <= 0) return null;
    // Book the debtor first (idempotent). If the SALES leg couldn't be established (books
    // unseeded, or its period is locked, or an output-GST ledger is missing) it returns null —
    // do NOT post a lone RECEIPT then, or the debtor is driven negative with no matching sale.
    const sale = await postInvoiceSale(tenantId, inv);
    if (!sale) { console.warn("[invoiceGl] receipt skipped: sale voucher not established (books unseeded / period locked / ledger missing)"); return null; }
    const party = await resolvePartyLedgerByName(tenantId, inv.customer_name || "Customer", "SALES");
    const landing = (await ledgerIdByName(tenantId, "Undeposited Funds")) || (await ledgerIdByName(tenantId, "Cash"));
    if (!party || !landing) return null;
    return await postVoucher(
      tenantId, null,
      { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Receipt for ${inv.invoice_number || "invoice"}`, reference: ref || inv.invoice_number || null, partyLedgerId: party, source: "invoice" },
      [
        { ledgerId: landing, debit: toDb(amt), credit: "0" },
        { ledgerId: party, debit: "0", credit: toDb(amt) },
      ],
      { idempotencyKey: idempotencyKey || `recv:inv:${inv.id}` }
    );
  } catch (e) {
    console.warn("[invoiceGl] receipt voucher skipped:", e && e.message);
    return null;
  }
}

module.exports = { postInvoiceSale, postInvoiceReceipt };
