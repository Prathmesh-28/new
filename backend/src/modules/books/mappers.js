// §7 - Document → journal mappers. Pure functions: (document, ledgerCtx) →
// { voucher, entries[], taxes[] }. All business rules live here; the engine just
// validates the result. Money math via decimal.js, rounded once at the split.
const { money, toDb, ZERO } = require("./money");

// §9.1 place-of-supply: intra-state → CGST+SGST (rate/2 each); inter-state → IGST.
// REGULAR (taxable) supply only - see splitGstFor for the supply-type aware split.
// 4th arg is OPTIONAL and backward-compatible: pass a number/string for cessRate,
// or an options object { cessRate }. Default cessRate 0 → byte-identical output,
// PLUS a `cess` field (0 by default) added to the gross when cessRate>0. Existing
// callers that ignore `cess`/omit the arg get the exact same numbers as before.
function splitGst(net, rate, interState, opts) {
  const cessRate = money(opts == null ? 0 : (typeof opts === "object" ? (opts.cessRate == null ? 0 : opts.cessRate) : opts));
  const n = money(net), r = money(rate);
  const cess = n.mul(cessRate).div(100);
  if (interState) {
    const igst = n.mul(r).div(100);
    return { taxable: n, cgst: money(0), sgst: money(0), igst, cess, gross: n.plus(igst).plus(cess) };
  }
  const half = r.div(2);
  const cgst = n.mul(half).div(100);
  return { taxable: n, cgst, sgst: cgst, igst: money(0), cess, gross: n.plus(cgst).plus(cgst).plus(cess) };
}

// Supply types that carry NO tax on the invoice (GST portal / ERPNext-india):
//  - EXPORT, SEZ → ZERO-RATED (taxable recorded, tax 0; may be WPAY/WOPAY but we
//    model the common LUT/bond route = without payment of tax → tax 0).
//  - NIL, EXEMPT → no tax by nature of the goods/service.
// REGULAR (and any unknown/blank) → ordinary taxable supply, charged via splitGst.
const ZERO_RATED = new Set(["EXPORT", "SEZ"]);
const NO_TAX = new Set(["EXPORT", "SEZ", "NIL", "EXEMPT"]);
function normalizeSupplyType(t) {
  return String(t || "REGULAR").toUpperCase();
}

// §9.1b supply-type aware split. For EXPORT/SEZ (zero-rated) and NIL/EXEMPT the
// taxable value is still recorded but the tax is 0 and gross === taxable; the
// returned `supplyType` is the normalized tag to stamp on tax side-records so
// GSTR-1 groups them correctly. REGULAR is byte-for-byte identical to splitGst.
function splitGstFor(supplyType, net, rate, interState) {
  const st = normalizeSupplyType(supplyType);
  if (NO_TAX.has(st)) {
    const n = money(net);
    return { taxable: n, cgst: money(0), sgst: money(0), igst: money(0), gross: n, supplyType: st, zeroRated: ZERO_RATED.has(st), taxed: false };
  }
  return Object.assign(splitGst(net, rate, interState), { supplyType: st, zeroRated: false, taxed: true });
}

// §7.x LINE-ITEMISED GST. Frappe Books / Zoho compute tax PER LINE at that
// line's own rate (line net = qty*rate − discount), round each line's tax, then
// SUM - so a 5% line and an 18% line on one invoice each carry their correct tax.
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
// input.supplyType (optional, default REGULAR): REGULAR charges GST as before;
// EXPORT/SEZ are zero-rated (taxable booked, tax 0); NIL/EXEMPT book taxable only.
// For non-taxable supplies no GST ledger entries are made and a single zero-tax
// side-record is emitted (tagged with supplyType) so GSTR-1 can classify it.
function buildSalesVoucher(input, ctx) {
  const s = splitGstFor(input.supplyType, input.lineTotal, input.gstRate, !!input.interState);
  const { taxable, cgst, sgst, igst, gross } = s;
  const entries = [{ ledgerId: ctx.customerLedgerId, debit: toDb(gross), credit: "0" }];
  const taxes = [];
  entries.push({ ledgerId: ctx.salesLedgerId, debit: "0", credit: toDb(taxable) });
  if (!s.taxed) {
    // Zero-rated / nil / exempt: no GST ledger entry; record taxable @ tax 0.
    taxes.push({ taxKind: input.interState ? "IGST" : "CGST", rate: "0", taxableValue: toDb(taxable), taxAmount: "0", hsnSac: input.hsn, placeOfSupply: input.placeOfSupply, supplyType: s.supplyType, counterpartyGstin: input.counterpartyGstin });
  } else if (input.interState) {
    entries.push({ ledgerId: ctx.igstLedgerId, debit: "0", credit: toDb(igst) });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(taxable), taxAmount: toDb(igst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply, supplyType: s.supplyType, counterpartyGstin: input.counterpartyGstin });
  } else {
    entries.push({ ledgerId: ctx.cgstLedgerId, debit: "0", credit: toDb(cgst) });
    entries.push({ ledgerId: ctx.sgstLedgerId, debit: "0", credit: toDb(sgst) });
    const half = toDb(money(input.gstRate).div(2));
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(cgst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply, supplyType: s.supplyType, counterpartyGstin: input.counterpartyGstin });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(sgst), hsnSac: input.hsn, placeOfSupply: input.placeOfSupply, supplyType: s.supplyType, counterpartyGstin: input.counterpartyGstin });
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

// PURCHASE under Reverse Charge Mechanism (ERPNext india RCM). The vendor does
// NOT charge GST, so the bill PAYABLE is the taxable value only - there is no
// input GST on the bill itself. The recipient self-assesses the GST and must pay
// it in CASH: we book it as an OUTPUT liability (Cr CGST/SGST/IGST Output) and at
// the same time book the claimable ITC (Dr CGST/SGST/IGST Input). The Input ↔
// Output legs net within the books (no P&L impact) but are tracked via two tax
// side-records per head, both tagged supplyType:'RCM':
//   - OUTPUT (isInput:false) → the self-assessed liability, surfaces in GSTR-3B 3.1(d)
//   - INPUT  (isInput:true)  → the matching ITC, surfaces in GSTR-3B 4(A)(3)
// ctx ledgers: { vendorLedgerId, purchaseLedgerId,
//   cgstInputLedgerId, sgstInputLedgerId, igstInputLedgerId,
//   cgstOutputLedgerId, sgstOutputLedgerId, igstOutputLedgerId }
function buildRcmBill(input, ctx) {
  const interState = !!input.interState;
  const { taxable, cgst, sgst, igst } = splitGst(input.lineTotal, input.gstRate, interState);
  const half = toDb(money(input.gstRate).div(2));
  // 1) Vendor bill WITHOUT GST: Dr Purchases (taxable) / Cr Vendor (taxable).
  const entries = [
    { ledgerId: ctx.purchaseLedgerId, debit: toDb(taxable), credit: "0" },
    { ledgerId: ctx.vendorLedgerId, debit: "0", credit: toDb(taxable) },
  ];
  const taxes = [];
  // 2) Self-assessed GST: Dr Input (ITC) + Cr Output (liability) - nets to zero.
  if (interState) {
    entries.push({ ledgerId: ctx.igstInputLedgerId, debit: toDb(igst), credit: "0" });
    entries.push({ ledgerId: ctx.igstOutputLedgerId, debit: "0", credit: toDb(igst) });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(taxable), taxAmount: toDb(igst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(taxable), taxAmount: toDb(igst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
  } else {
    entries.push({ ledgerId: ctx.cgstInputLedgerId, debit: toDb(cgst), credit: "0" });
    entries.push({ ledgerId: ctx.sgstInputLedgerId, debit: toDb(sgst), credit: "0" });
    entries.push({ ledgerId: ctx.cgstOutputLedgerId, debit: "0", credit: toDb(cgst) });
    entries.push({ ledgerId: ctx.sgstOutputLedgerId, debit: "0", credit: toDb(sgst) });
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(cgst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(sgst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(cgst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(taxable), taxAmount: toDb(sgst), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply, supplyType: "RCM", counterpartyGstin: input.counterpartyGstin });
  }
  return {
    voucher: { voucherType: "PURCHASE", voucherDate: input.date, reference: input.reference, partyLedgerId: ctx.vendorLedgerId, narration: input.narration, source: "bill" },
    entries, taxes,
  };
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

// Purchase return (DEBIT_NOTE): Dr Vendor / Cr Purchases + Cr GST-Input (reversal).
// Mirror of buildCreditNote on the purchase side: we owe the vendor less, so debit
// the party; and we reverse the Input GST (ITC) the original bill claimed by
// crediting the same GST Input ledgers and emitting NEGATIVE isInput tax records
// (so GSTR-2 / ITC summary reduces by the returned amount).
// ctx: { vendorLedgerId/partyLedgerId, purchasesLedgerId/purchaseLedgerId, cgstInputLedgerId, sgstInputLedgerId, igstInputLedgerId }
function buildDebitNote(input, ctx) {
  const partyLedgerId = ctx.partyLedgerId || ctx.vendorLedgerId;
  const purchasesLedgerId = ctx.purchasesLedgerId || ctx.purchaseLedgerId;
  const { taxable, cgst, sgst, igst, gross } = splitGst(input.lineTotal, input.gstRate, !!input.interState);
  const entries = [{ ledgerId: partyLedgerId, debit: toDb(gross), credit: "0" }];
  const taxes = [];
  entries.push({ ledgerId: purchasesLedgerId, debit: "0", credit: toDb(taxable) });
  if (input.interState) {
    entries.push({ ledgerId: ctx.igstInputLedgerId, debit: "0", credit: toDb(igst) });
    taxes.push({ taxKind: "IGST", rate: toDb(input.gstRate), taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(igst).neg()), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
  } else {
    entries.push({ ledgerId: ctx.cgstInputLedgerId, debit: "0", credit: toDb(cgst) });
    entries.push({ ledgerId: ctx.sgstInputLedgerId, debit: "0", credit: toDb(sgst) });
    const half = toDb(money(input.gstRate).div(2));
    taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(cgst).neg()), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
    taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(money(taxable).neg()), taxAmount: toDb(money(sgst).neg()), hsnSac: input.hsn, isInput: true, placeOfSupply: input.placeOfSupply });
  }
  return { voucher: { voucherType: "DEBIT_NOTE", voucherDate: input.date, reference: input.reference, partyLedgerId, narration: input.narration, source: "manual" }, entries, taxes };
}

// Refund of a customer's advance / unapplied credit: Dr Customer / Cr Bank/Cash.
// A PAYMENT out of the business; the orchestrator links sourceVoucherId via an
// allocation so the original advance/credit is drawn down (ERPNext Payment Entry
// "Pay" against an outstanding credit). ctx OR input may carry the ledgers.
// input: { partyLedgerId, amount, paidFromLedgerId, date, sourceVoucherId? }
function buildRefund(input, ctx = {}) {
  const partyLedgerId = input.partyLedgerId || ctx.partyLedgerId;
  const paidFromLedgerId = input.paidFromLedgerId || ctx.paidFromLedgerId || ctx.bankLedgerId;
  return {
    voucher: { voucherType: "PAYMENT", voucherDate: input.date, reference: input.reference, partyLedgerId, narration: input.narration, source: "refund", sourceVoucherId: input.sourceVoucherId || null },
    entries: [
      { ledgerId: partyLedgerId, debit: toDb(input.amount), credit: "0" },
      { ledgerId: paidFromLedgerId, debit: "0", credit: toDb(input.amount) },
    ],
  };
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

// Bad-debt write-off: an uncollectable receivable is removed from the books by
// recognising an expense. Dr Bad Debts (expense) / Cr Customer (clears the AR).
// Modelled as a manual JOURNAL (ERPNext writes this off via a Journal Entry).
// ctx: { badDebtsLedgerId }   input: { partyLedgerId, amount, date, ... }
function buildBadDebt(input, ctx) {
  return {
    voucher: { voucherType: "JOURNAL", voucherDate: input.date, reference: input.reference, partyLedgerId: input.partyLedgerId, narration: input.narration, source: "manual" },
    entries: [
      { ledgerId: ctx.badDebtsLedgerId, debit: toDb(input.amount), credit: "0" },
      { ledgerId: input.partyLedgerId, debit: "0", credit: toDb(input.amount) },
    ],
  };
}

// §9.x GST on a customer ADVANCE (GST is payable on receipt of an advance for a
// supply of services). The money RECEIVED is tax-inclusive: Dr Bank input.amount.
// We back out the GST embedded in that gross - net = gross / (1 + rate/100) - so
// Cr Customer (the advance liability we still owe to fulfil) = net, and Cr GST
// Output = the tax now payable. Intra-state → CGST+SGST; inter-state → IGST.
// Tax side-records are emitted is_input:false, supplyType 'ADVANCE' so they land
// in GSTR-1 11A (advances received) and reverse on adjustment against the invoice.
// If gstRate is 0/absent the whole receipt is the advance (no tax split).
// ctx: { bankLedgerId, cgstLedgerId, sgstLedgerId, igstLedgerId }
// input: { partyLedgerId, amount, gstRate?, interState?, hsn?, placeOfSupply?, counterpartyGstin?, date, ... }
function buildAdvanceReceipt(input, ctx) {
  const interState = !!input.interState;
  const rate = money(input.gstRate == null ? 0 : input.gstRate);
  const gross = money(input.amount);
  const entries = [{ ledgerId: ctx.bankLedgerId, debit: toDb(gross), credit: "0" }];
  const taxes = [];
  if (rate.greaterThan(0)) {
    // Tax-inclusive: derive net from gross, then split tax off the net.
    const net = gross.div(money(1).plus(rate.div(100)));
    const s = splitGst(net, rate, interState);
    entries.push({ ledgerId: input.partyLedgerId, debit: "0", credit: toDb(s.taxable) });
    if (interState) {
      entries.push({ ledgerId: ctx.igstLedgerId, debit: "0", credit: toDb(s.igst) });
      taxes.push({ taxKind: "IGST", rate: toDb(rate), taxableValue: toDb(s.taxable), taxAmount: toDb(s.igst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "ADVANCE", counterpartyGstin: input.counterpartyGstin });
    } else {
      entries.push({ ledgerId: ctx.cgstLedgerId, debit: "0", credit: toDb(s.cgst) });
      entries.push({ ledgerId: ctx.sgstLedgerId, debit: "0", credit: toDb(s.sgst) });
      const half = toDb(rate.div(2));
      taxes.push({ taxKind: "CGST", rate: half, taxableValue: toDb(s.taxable), taxAmount: toDb(s.cgst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "ADVANCE", counterpartyGstin: input.counterpartyGstin });
      taxes.push({ taxKind: "SGST", rate: half, taxableValue: toDb(s.taxable), taxAmount: toDb(s.sgst), hsnSac: input.hsn, isInput: false, placeOfSupply: input.placeOfSupply, supplyType: "ADVANCE", counterpartyGstin: input.counterpartyGstin });
    }
  } else {
    entries.push({ ledgerId: input.partyLedgerId, debit: "0", credit: toDb(gross) });
  }
  return {
    voucher: { voucherType: "RECEIPT", voucherDate: input.date, reference: input.reference, partyLedgerId: input.partyLedgerId, narration: input.narration, source: "manual" },
    entries, taxes,
  };
}

// Advance PAID to a supplier (prepayment before the bill). Dr Vendor Advance (the
// receivable/advance against the party) / Cr Bank - money out, so a PAYMENT.
// ctx: { bankLedgerId }   input: { partyLedgerId, amount, date, ... }
function buildVendorAdvance(input, ctx) {
  return {
    voucher: { voucherType: "PAYMENT", voucherDate: input.date, reference: input.reference, partyLedgerId: input.partyLedgerId, narration: input.narration, source: "manual" },
    entries: [
      { ledgerId: input.partyLedgerId, debit: toDb(input.amount), credit: "0" },
      { ledgerId: ctx.bankLedgerId, debit: "0", credit: toDb(input.amount) },
    ],
    taxes: [],
  };
}

module.exports = { splitGst, splitGstFor, computeLineGst, buildSalesVoucher, buildSalesVoucherLines, buildReceiptVoucher, buildPurchaseVoucher, buildPurchaseVoucherLines, buildRcmBill, buildCreditNote, buildPaymentVoucher, buildDebitNote, buildRefund, buildBadDebt, buildAdvanceReceipt, buildVendorAdvance };
