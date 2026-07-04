"use strict";
// Pure money-math for invoice receipts — NO DB — so the partial / advance / overpayment /
// fully-paid decisions are unit-testable and identical across the record-payment and
// mark-paid code paths. All amounts are rounded to paise; a 1-paise epsilon absorbs float noise.
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// What the customer actually owes on the document: the invoice total net of credit notes
// issued against it. Receipts settle THIS, never the gross total.
const effectiveTotal = ({ total, creditedAmount = 0 }) => round2(round2(total) - round2(creditedAmount));

// Effect of receiving `amount` against an invoice at (total, paidAmount, creditedAmount).
// → { ok:false, error, balanceBefore } on a non-positive amount or overpayment,
//   { ok:true, newPaid, balanceBefore, balanceAfter, fullyPaid } otherwise.
// Every value is round2-quantized to paise before comparison, so exact strict comparisons are
// safe: paying the balance to the paise is allowed; a single paise more is refused.
function applyReceipt({ total, paidAmount, creditedAmount = 0 }, amount) {
  const t = effectiveTotal({ total, creditedAmount });
  const already = round2(paidAmount);
  const amt = round2(amount);
  const balanceBefore = round2(t - already);
  if (!(amt > 0)) return { ok: false, error: "non_positive", balanceBefore };
  if (amt > balanceBefore) return { ok: false, error: "overpayment", balanceBefore };
  const newPaid = round2(already + amt);
  return { ok: true, newPaid, balanceBefore, balanceAfter: round2(t - newPaid), fullyPaid: newPaid >= t };
}

// Remaining balance to book when marking an invoice fully paid (0 if partials/credits covered it).
const remainingToSettle = ({ total, paidAmount, creditedAmount = 0 }) =>
  round2(effectiveTotal({ total, creditedAmount }) - round2(paidAmount));

// How much MORE can be credited against an invoice: never beyond what is still uncollected
// (crediting collected money is a refund, which is a different, gated flow).
const creditableBalance = ({ total, paidAmount, creditedAmount = 0 }) =>
  Math.max(0, round2(effectiveTotal({ total, creditedAmount }) - round2(paidAmount)));

module.exports = { round2, applyReceipt, remainingToSettle, effectiveTotal, creditableBalance };
