// §7 — Document → journal mappers. Pure functions: (document, ledgerCtx) →
// { voucher, entries[], taxes[] }. All business rules live here; the engine just
// validates the result. Money math via decimal.js, rounded once at the split.
const { money, toDb, ZERO } = require("./money");

// §9.1 place-of-supply: intra-state → CGST+SGST (rate/2 each); inter-state → IGST.
function splitGst(net, rate, interState) {
  const n = money(net), r = money(rate);
  if (interState) {
    const igst = n.mul(r).div(100);
    return { taxable: n, cgst: money(0), sgst: money(0), igst, gross: n.plus(igst) };
  }
  const half = r.div(2);
  const cgst = n.mul(half).div(100);
  return { taxable: n, cgst, sgst: cgst, igst: money(0), gross: n.plus(cgst).plus(cgst) };
}

// §7.x LINE-ITEMISED GST. Frappe Books / Zoho compute tax PER LINE at that
// line's own rate (line net = qty*rate − discount), round each line's tax, then
// SUM — so a 5% line and an 18% line on one invoice each carry their correct tax.
// Returns { taxable, cgst, sgst, igst, gross, lines:[{...,split}], taxes:[per-line] }.
// `taxes[]` is the side-record array postVoucher persists into book_tax_entries.
// `isInput` flags purchase-side ITC; place-of-supply/hsn carried per line.
function computeLineGst(lines, interState, opts = {}) {
  const isInput = !!opts.isInput;
  const pos = opts.placeOfSupply;
  let taxable = ZERO, cgst = ZERO, sgst = ZERO, igst = ZERO, gross = ZERO;
  const detail = [];          // per-line, for rendering + sales/purchase credit/debit
  const taxes = [];           // per-line tax side-records (CGST/SGST or IGST)
  for (const ln of lines || []) {
    const qty = money(ln.qty == null ? 1 : ln.qty);
    const rate = money(ln.rate == null ? 0 : ln.rate);
    const discount = money(ln.discount == null ? 0 : ln.discount);
    const net = qty.mul(rate).minus(discount);
    const gstRate = money(ln.gst_rate == null ? (ln.gstRate == null ? 0 : ln.gstRate) : ln.gst_rate);
    const hsn = ln.hsn || ln.hsn_sac || null;
    const s = splitGst(net, gstRate, interState);
    taxable = taxable.plus(s.taxable);
    cgst = cgst.plus(s.cgst); sgst = sgst.plus(s.sgst); igst = igst.plus(s.igst);
    gross = gross.plus(s.gross);
    detail.push({ description: ln.description || ln.name || "", itemId: ln.itemId || ln.item_id || null, qty, rate, discount, hsn, gstRate, net, split: s });
    if (interState) {
      taxes.push({ taxKind: "IGST", rate: toDb(gstRate), taxableValue: toDb(s.taxable), taxAmount: toDb(s.igst), hsnSac: hsn, isInput, placeOfSupply: pos });
    } else {
      const half = toDb(gstRate.div(2));
      taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(s.taxable), taxAmount: toDb(s.cgst), hsnSac: hsn, isInput, placeOfSupply: pos });
      taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(s.taxable), taxAmount: toDb(s.sgst), hsnSac: hsn, isInput, placeOfSupply: pos });
    }
  }
  return { taxable, cgst, sgst, igst, gross, lines: detail, taxes };
}

// ctx: { customerLedgerId, salesLedgerId, cgstLedgerId, sgstLedgerId, igstLedgerId }
function buildSalesVoucher(input, ctx) {
  const { taxable, cgst, sgst, igst, gross } = splitGst(input.lineTotal, input.gstRate, !!input.interState);
  const entries = [{ ledgerId: ctx.customerLedgerId, debit: toDb(gross), credit: "0" }];
  const taxes = [];
  entries.push({ ledgerId: ctx.salesLedgerId, debit: "0", credit: toDb(taxable) });
  if (input.interState) {
    entries.push({ ledgerId: ctx.igstLedgerId, debit: "0", credit: toDb(igst) });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(taxable), taxAmount: toDb(igst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
  } else {
    entries.push({ ledgerId: ctx.cgstLedgerId, debit: "0", credit: toDb(cgst) });
    entries.push({ ledgerId: ctx.sgstLedgerId, debit: "0", credit: toDb(sgst) });
    const half = toDb(money(input.gstRate).div(2));
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(cgst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(sgst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
  }
  return {
    voucher: { voucherType: "SALES", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.customerLedgerId, narration: input.narration, source: "invoice" },
    entries, taxes,
  };
}

// Line-itemised sales invoice: one Sales credit for Σ taxable, aggregated GST
// ledger entries (engine only needs one entry per ledger), but per-LINE tax
// side-records so GSTR-1 / HSN summary stays line-faithful. Same ctx as above.
function buildSalesVoucherLines(input, ctx) {
  const interState = !!input.interState;
  const g = computeLineGst(input.lines, interState, { placeOfSupply: input.placeOfSupply });
  const entries = [{ ledgerId: ctx.customerLedgerId, debit: toDb(g.gross), credit: "0" }];
  entries.push({ ledgerId: ctx.salesLedgerId, debit: "0", credit: toDb(g.taxable) });
  if (interState) {
    if (g.igst.greaterThan(0)) entries.push({ ledgerId: ctx.igstLedgerId, debit: "0", credit: toDb(g.igst) });
  } else {
    if (g.cgst.greaterThan(0)) entries.push({ ledgerId: ctx.cgstLedgerId, debit: "0", credit: toDb(g.cgst) });
    if (g.sgst.greaterThan(0)) entries.push({ ledgerId: ctx.sgstLedgerId, debit: "0", credit: toDb(g.sgst) });
  }
  return {
    voucher: { voucherType: "SALES", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.customerLedgerId, narration: input.narration, source: "invoice" },
    entries, taxes: g.taxes, totals: g,
  };
}

// Money received: Dr Bank/Cash, Cr Customer (or income). ctx: { bankLedgerId, partyLedgerId }
function buildReceiptVoucher(input, ctx) {
  return {
    voucher: { voucherType: "RECEIPT", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.partyLedgerId, narration: input.narration, source: "manual" },
    entries: [
      { ledgerId: ctx.bankLedgerId, debit: toDb(input.amount), credit: "0" },
      { ledgerId: ctx.partyLedgerId, debit: "0", credit: toDb(input.amount) },
    ],
    taxes: [],
  };
}

// Bill: Dr Purchases + Dr GST Input / Cr Vendor. ctx: { vendorLedgerId, purchaseLedgerId, cgstInputLedgerId, sgstInputLedgerId, igstInputLedgerId }
function buildPurchaseVoucher(input, ctx) {
  const { taxable, cgst, sgst, igst, gross } = splitGst(input.lineTotal, input.gstRate, !!input.interState);
  const entries = [{ ledgerId: ctx.purchaseLedgerId, debit: toDb(taxable), credit: "0" }];
  const taxes = [];
  if (input.interState) {
    entries.push({ ledgerId: ctx.igstInputLedgerId, debit: toDb(igst), credit: "0" });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(taxable), taxAmount: toDb(igst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
  } else {
    entries.push({ ledgerId: ctx.cgstInputLedgerId, debit: toDb(cgst), credit: "0" });
    entries.push({ ledgerId: ctx.sgstInputLedgerId, debit: toDb(sgst), credit: "0" });
    const half = toDb(money(input.gstRate).div(2));
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(cgst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(sgst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
  }
  entries.push({ ledgerId: ctx.vendorLedgerId, debit: "0", credit: toDb(gross) });
  return { voucher: { voucherType: "PURCHASE", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.vendorLedgerId, narration: input.narration, source: "bill" }, entries, taxes };
}

// Line-itemised bill: Dr Purchases (Σ taxable) + Dr aggregated GST Input / Cr Vendor.
function buildPurchaseVoucherLines(input, ctx) {
  const interState = !!input.interState;
  const g = computeLineGst(input.lines, interState, { isInput: true, placeOfSupply: input.placeOfSupply });
  const entries = [{ ledgerId: ctx.purchaseLedgerId, debit: toDb(g.taxable), credit: "0" }];
  if (interState) {
    if (g.igst.greaterThan(0)) entries.push({ ledgerId: ctx.igstInputLedgerId, debit: toDb(g.igst), credit: "0" });
  } else {
    if (g.cgst.greaterThan(0)) entries.push({ ledgerId: ctx.cgstInputLedgerId, debit: toDb(g.cgst), credit: "0" });
    if (g.sgst.greaterThan(0)) entries.push({ ledgerId: ctx.sgstInputLedgerId, debit: toDb(g.sgst), credit: "0" });
  }
  entries.push({ ledgerId: ctx.vendorLedgerId, debit: "0", credit: toDb(g.gross) });
  return { voucher: { voucherType: "PURCHASE", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.vendorLedgerId, narration: input.narration, source: "bill" }, entries, taxes: g.taxes, totals: g };
}

// Sales return (CREDIT_NOTE): Dr Sales Returns + Dr Output-GST (reversal) / Cr Customer.
function buildCreditNote(input, ctx) {
  const { taxable, cgst, sgst, igst, gross } = splitGst(input.lineTotal, input.gstRate, !!input.interState);
  const entries = [{ ledgerId: ctx.salesReturnsLedgerId, debit: toDb(taxable), credit: "0" }];
  const taxes = [];
  if (input.interState) {
    entries.push({ ledgerId: ctx.igstLedgerId, debit: toDb(igst), credit: "0" });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(igst).neg()), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
  } else {
    entries.push({ ledgerId: ctx.cgstLedgerId, debit: toDb(cgst), credit: "0" });
    entries.push({ ledgerId: ctx.sgstLedgerId, debit: toDb(sgst), credit: "0" });
    const half = toDb(money(input.gstRate).div(2));
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(cgst).neg()), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(sgst).neg()), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply });
  }
  entries.push({ ledgerId: ctx.customerLedgerId, debit: "0", credit: toDb(gross) });
  return { voucher: { voucherType: "CREDIT_NOTE", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.customerLedgerId, narration: input.narration, source: "manual" }, entries, taxes };
}

// Payment out: Dr Vendor/Expense / Cr Bank/Cash. ctx: { bankLedgerId, partyLedgerId }
function buildPaymentVoucher(input, ctx) {
  return {
    voucher: { voucherType: "PAYMENT", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.partyLedgerId, narration: input.narration, source: "manual" },
    entries: [
      { ledgerId: ctx.partyLedgerId, debit: toDb(input.amount), credit: "0" },
      { ledgerId: ctx.bankLedgerId, debit: "0", credit: toDb(input.amount) },
    ],
    taxes: [],
  };
}

module.exports = { splitGst, computeLineGst, buildSalesVoucher, buildSalesVoucherLines, buildReceiptVoucher, buildPurchaseVoucher, buildPurchaseVoucherLines, buildCreditNote, buildPaymentVoucher };
