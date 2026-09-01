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
// DATE columns now arrive as plain "YYYY-MM-DD" strings (db.js); passing one through
// `new Date()` and back would re-introduce the timezone shift that fix removed.
const isoDate = (d) => {
  const s = String(d ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try { return new Date(d).toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); }
};

async function sellerGstin(tenantId) {
  try {
    const { rows } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1 LIMIT 1", [tenantId]);
    return rows[0]?.gstin || null;
  } catch { return null; }
}

// The revenue + output-GST legs for a given (subtotal, gst) slice of an invoice, with the
// intra/inter-state derivation. Shared by the SALES voucher and the CREDIT_NOTE voucher so a
// note can never split its tax differently from the sale it adjusts.
// → { party, legs: [{ledgerId, amt}], taxes } or null when the chart isn't seeded.
async function salesLegs(tenantId, inv, { subtotal, gst }) {
  const party = await resolvePartyLedgerByName(tenantId, inv.customer_name || "Customer", "SALES");
  const salesL = await ledgerIdByName(tenantId, "Sales");
  if (!party || !salesL) return null; // chart not seeded → leave AR in the invoices table only

  const legs = []; // { ledgerId, amt }
  const taxes = [];
  if (subtotal > 0) legs.push({ ledgerId: salesL, amt: subtotal });

  if (gst > 0) {
    const rate = num(inv.gst_rate);
    const buyer = stateOf(inv.customer_gstin);
    const seller = stateOf(await sellerGstin(tenantId));
    // Wave 4 stores place_of_supply_code and is_inter_state ON the invoice. Prefer them:
    // an unregistered (B2C) buyer has no GSTIN to derive a state from, so deriving would
    // silently book CGST+SGST on what may be an inter-state supply.
    const interState = inv.is_inter_state != null
      ? inv.is_inter_state === true
      : !!(buyer && seller && buyer !== seller);
    const pos = inv.place_of_supply_code || buyer || seller || null;
    if (interState) {
      const igstL = await ledgerIdByName(tenantId, "IGST Output");
      if (!igstL) return null;
      legs.push({ ledgerId: igstL, amt: gst });
      taxes.push({ taxKind: "IGST", rate, taxableValue: subtotal, taxAmount: gst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
    } else {
      const cgstL = await ledgerIdByName(tenantId, "CGST Output");
      const sgstL = await ledgerIdByName(tenantId, "SGST Output");
      if (!cgstL || !sgstL) return null;
      const cgst = round2(gst / 2);
      const sgst = round2(gst - cgst); // exact remainder so the two halves sum to gst
      legs.push({ ledgerId: cgstL, amt: cgst }, { ledgerId: sgstL, amt: sgst });
      taxes.push({ taxKind: "CGST", rate: round2(rate / 2), taxableValue: subtotal, taxAmount: cgst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
      taxes.push({ taxKind: "SGST", rate: round2(rate / 2), taxableValue: subtotal, taxAmount: sgst, isInput: false, placeOfSupply: pos, supplyType: "REGULAR", counterpartyGstin: inv.customer_gstin || null });
    }
  }
  return { party, legs, taxes };
}

// Post the SALES voucher for an invoice (idempotent on sale:inv:<id>). Returns the
// postVoucher result, or null if the books aren't seeded / nothing to post.
async function postInvoiceSale(tenantId, inv) {
  try {
    const subtotal = round2(num(inv.subtotal));
    const gst = round2(num(inv.gst_amount));
    if (subtotal + gst <= 0) return null;

    const derived = await salesLegs(tenantId, inv, { subtotal, gst });
    if (!derived) return null;
    const { party, legs, taxes } = derived;

    // ── Round-off ─────────────────────────────────────────────────────────────
    // Wave 4 lets an invoice round to the nearest rupee. Without handling it here the
    // debtor would be debited subtotal+gst (e.g. 5540.40) while the customer is billed
    // and pays the rounded total (5540.00) — leaving a 40-paise residue on their account
    // that never clears and quietly ages into the receivables report forever.
    // Preference: a dedicated "Round Off" ledger (what Tally-style charts use). If the
    // chart doesn't have one, the adjustment folds into Sales — sub-rupee, and far better
    // than an uncollectable residue on the customer.
    const roundOff = round2(num(inv.round_off));
    if (roundOff !== 0) {
      const roundL = await ledgerIdByName(tenantId, "Round Off").catch(() => null);
      if (roundL) {
        legs.push({ ledgerId: roundL, amt: roundOff });
      } else {
        const salesLedgerId = await ledgerIdByName(tenantId, "Sales").catch(() => null);
        const sales = legs.find((l) => l.ledgerId === salesLedgerId);
        if (sales) sales.amt = round2(sales.amt + roundOff);
      }
    }

    // Balanced by construction: party debit == sum of credits.
    const partyDebit = round2(legs.reduce((s, c) => s + c.amt, 0));
    const entries = [{ ledgerId: party, debit: toDb(partyDebit), credit: "0" }];
    for (const c of legs) {
      // A negative round-off is a debit, not a negative credit — a voucher line must
      // never carry a negative amount.
      if (c.amt < 0) entries.push({ ledgerId: c.ledgerId, debit: toDb(-c.amt), credit: "0" });
      else entries.push({ ledgerId: c.ledgerId, debit: "0", credit: toDb(c.amt) });
    }

    return await postVoucher(
      tenantId, null,
      {
        voucherType: "SALES",
        // The DOCUMENT date, not the row's insert timestamp: a back-dated invoice must land
        // in the period it was actually raised in, or the books and the invoice disagree.
        voucherDate: isoDate(inv.invoice_date || inv.created_at || Date.now()),
        narration: `Invoice ${inv.invoice_number || ""}`.trim(),
        reference: inv.invoice_number || null, partyLedgerId: party, source: "invoice",
      },
      entries,
      { idempotencyKey: `sale:inv:${inv.id}`, taxes }
    );
  } catch (e) {
    console.warn("[invoiceGl] sale voucher skipped:", e && e.message);
    return null;
  }
}

// Post the CREDIT_NOTE voucher for a credit note against an invoice (idempotent per note).
// Mirror of the sale: Dr Sales + Dr Output GST / Cr Sundry Debtor. The tax rows ride on a
// CREDIT_NOTE voucher, which the GST engine already reports in GSTR-1 CDNR and GSTR-3B 4I.
// Books the SALES voucher first (idempotent) so the debtor can absorb the credit.
async function postInvoiceCreditNote(tenantId, inv, note) {
  try {
    const subtotal = round2(num(note.subtotal));
    const gst = round2(num(note.gst_amount));
    if (subtotal + gst <= 0) return null;
    const sale = await postInvoiceSale(tenantId, inv);
    if (!sale) { console.warn("[invoiceGl] credit note skipped: sale voucher not established"); return null; }

    const derived = await salesLegs(tenantId, inv, { subtotal, gst });
    if (!derived) return null;
    const { party, legs, taxes } = derived;

    const partyCredit = round2(legs.reduce((s, c) => s + c.amt, 0));
    const entries = legs.map((c) => ({ ledgerId: c.ledgerId, debit: toDb(c.amt), credit: "0" }));
    entries.push({ ledgerId: party, debit: "0", credit: toDb(partyCredit) });

    return await postVoucher(
      tenantId, null,
      { voucherType: "CREDIT_NOTE", voucherDate: isoDate(note.created_at || Date.now()), narration: `Credit note ${note.note_number || ""} against ${inv.invoice_number || "invoice"}: ${note.reason || ""}`.trim(), reference: note.note_number || null, partyLedgerId: party, source: "invoice" },
      entries,
      { idempotencyKey: `cn:inv:${inv.id}:${note.id}`, taxes }
    );
  } catch (e) {
    console.warn("[invoiceGl] credit note voucher skipped:", e && e.message);
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

module.exports = { postInvoiceSale, postInvoiceReceipt, postInvoiceCreditNote };
