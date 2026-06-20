// §7 — Document → journal mappers. Pure functions: (document, ledgerCtx) →
// { voucher, entries[], taxes[] }. All business rules live here; the engine just
// validates the result. Money math via decimal.js, rounded once at the split.
const { money, toDb } = require("./money");

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

module.exports = { splitGst, buildSalesVoucher, buildReceiptVoucher, buildPurchaseVoucher, buildCreditNote, buildPaymentVoucher };
