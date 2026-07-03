"use strict";
// Direct-tax depth: the remaining gaps around the existing income-tax/ITR/TDS engines.
//  #41 194Q vs 206C(1H) applicability (with precedence) — pure
//  #45 269ST cash-receipt (≥ ₹2L) alerts — from RECEIPT vouchers hitting the Cash ledger
//  #46 book-vs-IT depreciation reconciliation — book_fixed_assets (Cos Act) vs book_it_dep_blocks (IT Act)
//  #47 deferred tax from the depreciation timing difference
//  #48 ITR-to-books variance bridge (books profit → taxable income, showing add-backs)
const { pool } = require("../../db");
const reports = require("./reports");

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const fyBounds = (fy) => { const y = Number(String(fy).slice(0, 4)); return { start: `${y}-04-01`, end: `${y + 1}-03-31` }; };

// #41 — 194Q (buyer's TDS) vs 206C(1H) (seller's TCS). Both 0.1% on value over ₹50L when the
// relevant party's prior-FY turnover exceeds ₹10cr. 194Q takes precedence: if the buyer is liable
// under 194Q, the seller does NOT collect 206C(1H). Pure.
function applicability194Q206C({ myTurnoverPrevFy = 0, counterpartyTurnoverPrevFy = 0, aggregateValueFy = 0, iAmBuyer = true, panAvailable = true } = {}) {
  const CR10 = 100000000, L50 = 5000000;
  const buyerTurnover = iAmBuyer ? n(myTurnoverPrevFy) : n(counterpartyTurnoverPrevFy);
  const sellerTurnover = iAmBuyer ? n(counterpartyTurnoverPrevFy) : n(myTurnoverPrevFy);
  const value = n(aggregateValueFy);
  const excess = Math.max(0, value - L50);
  const qApplies = buyerTurnover > CR10 && value > L50;
  const cApplies = sellerTurnover > CR10 && value > L50 && !qApplies; // 194Q precedence
  let section = "none", who = "—", rate = 0, actor = null;
  if (qApplies) { section = "194Q"; who = "Buyer deducts TDS"; rate = panAvailable ? 0.1 : 5; actor = "buyer"; }
  else if (cApplies) { section = "206C(1H)"; who = "Seller collects TCS"; rate = panAvailable ? 0.1 : 1; actor = "seller"; }
  const amount = r2(excess * rate / 100);
  return {
    section, who, actor, rate_pct: rate, threshold: L50, taxable_base: r2(excess), amount,
    my_role: iAmBuyer ? "buyer" : "seller",
    liable_on_me: (iAmBuyer && actor === "buyer") || (!iAmBuyer && actor === "seller"),
    precedence_note: qApplies ? "194Q applies → seller must NOT also collect 206C(1H)." : cApplies ? "206C(1H) applies (buyer not liable under 194Q)." : "Neither applies (turnover ≤ ₹10cr or value ≤ ₹50L).",
  };
}

// #45 — 269ST: no person may RECEIVE ≥ ₹2,00,000 in cash from one person in a day / per transaction.
// Flag cash receipts (debit to a Cash ledger on RECEIPT vouchers) aggregated per party per day.
async function cash269ST(tenantId, { fy } = {}) {
  const y = fy ? Number(String(fy).slice(0, 4)) : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const { start, end } = fyBounds(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  const { rows } = await pool.query(
    `SELECT v.voucher_date, COALESCE(pl.name,'(no party)') AS party, SUM(e.debit) AS cash_in
       FROM book_vouchers v
       JOIN book_voucher_entries e ON e.voucher_id=v.id AND e.tenant_id=v.tenant_id
       JOIN book_ledgers l ON l.id=e.ledger_id
       LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id
      WHERE v.tenant_id=$1 AND v.voucher_type='RECEIPT' AND v.is_cancelled=false
        AND v.voucher_date BETWEEN $2 AND $3 AND l.is_bank=false AND LOWER(l.name) LIKE '%cash%'
      GROUP BY v.voucher_date, pl.name
      HAVING SUM(e.debit) >= 200000
      ORDER BY SUM(e.debit) DESC`, [tenantId, start, end]).catch(() => ({ rows: [] }));
  return {
    fy: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, threshold: 200000,
    breaches: rows.map((r) => ({ date: r.voucher_date, party: r.party, cash_received: n(r.cash_in), penalty_exposure: n(r.cash_in) })),
    total_exposure: r2(rows.reduce((s, r) => s + n(r.cash_in), 0)),
    note: "269ST: cash receipt ≥ ₹2,00,000 from one person in a day / single transaction attracts a penalty u/s 271DA equal to the amount received. Verify these are not banking/exempt receipts.",
  };
}

// #46 + #47 — book (Companies Act) vs IT (block) depreciation, and the deferred tax it creates.
async function depreciationRecon(tenantId, { fy, taxRatePct = 25 } = {}) {
  const y = fy ? Number(String(fy).slice(0, 4)) : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const fyStr = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  // Book depreciation for the year (full-year estimate: SLM on cost, WDV on written-down value).
  const { rows: assets } = await pool.query("SELECT cost, salvage, accumulated_dep, method, rate FROM book_fixed_assets WHERE tenant_id=$1 AND is_active=true", [tenantId]).catch(() => ({ rows: [] }));
  let bookDep = 0;
  for (const a of assets) {
    const rate = n(a.rate) / 100;
    bookDep += a.method === "WDV" ? (n(a.cost) - n(a.accumulated_dep)) * rate : (n(a.cost) - n(a.salvage)) * rate;
  }
  // IT Act block depreciation for the FY.
  const { rows: itRows } = await pool.query("SELECT COALESCE(SUM(depreciation),0) AS d FROM book_it_dep_blocks WHERE tenant_id=$1 AND fy=$2", [tenantId, fyStr]).catch(() => ({ rows: [{ d: 0 }] }));
  const itDep = n(itRows[0].d);
  const timingDiff = r2(bookDep - itDep);           // book − tax
  const rate = n(taxRatePct) / 100;
  // Tax dep > book dep → taxable income lower now → Deferred Tax LIABILITY. Opposite → DTA.
  const dtl = timingDiff < 0 ? r2(Math.abs(timingDiff) * rate) : 0;
  const dta = timingDiff > 0 ? r2(timingDiff * rate) : 0;
  return {
    fy: fyStr, tax_rate_pct: n(taxRatePct),
    book_depreciation: r2(bookDep), it_depreciation: itDep, timing_difference: timingDiff,
    deferred_tax_liability: dtl, deferred_tax_asset: dta,
    note: itDep === 0 ? "No IT-block depreciation recorded for this FY — enter book_it_dep_blocks to reconcile. Book depreciation is a full-year estimate; run the monthly depreciation for the exact figure." : "Timing difference between Companies-Act and Income-Tax-Act depreciation drives the deferred tax. Add other timing differences (provisions, 43B) for the full deferred-tax schedule.",
  };
}

// #48 — bridge from books net profit to taxable income, showing the add-backs the ITR needs.
async function itrVariance(tenantId, { fy } = {}) {
  const y = fy ? Number(String(fy).slice(0, 4)) : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const fyStr = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  const pl = await reports.profitLoss(tenantId, fyStr);
  const booksProfit = n(pl.netProfit);
  const adjustments = [];
  // Depreciation timing difference (add back book dep, allow IT dep).
  try { const dep = await depreciationRecon(tenantId, { fy: fyStr }); if (dep.timing_difference) adjustments.push({ item: "Depreciation (Companies Act vs IT Act)", amount: dep.timing_difference, effect: dep.timing_difference > 0 ? "add to income" : "reduce income" }); } catch { /* optional */ }
  // 43B(h) MSME disallowance (add back unpaid-beyond-45d dues).
  try { const m = await require("./msme").msme43b(tenantId, { asOf: fyBounds(fyStr).end }); if (m.totals.disallowed) adjustments.push({ item: "43B(h) — MSME dues unpaid > 45 days (disallowed)", amount: r2(m.totals.disallowed), effect: "add to income" }); } catch { /* optional */ }
  const netAdjustment = r2(adjustments.reduce((s, a) => s + (a.effect === "add to income" ? a.amount : -Math.abs(a.amount)), 0));
  return {
    fy: fyStr, books_net_profit: booksProfit, adjustments, net_adjustment: netAdjustment,
    estimated_business_income: r2(booksProfit + netAdjustment),
    note: "Bridge from audited books profit to ITR business income. Add Chapter VI-A deductions and any other disallowances (40A(3), 40(a)(ia), personal expenses) to finalise. A large unexplained variance is a review flag.",
  };
}

module.exports = { applicability194Q206C, cash269ST, depreciationRecon, itrVariance };
