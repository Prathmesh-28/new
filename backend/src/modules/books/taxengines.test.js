"use strict";
// DB-free unit tests for the correctness-critical PURE money-math engines shipped this session:
// income-tax interest 234A/B/C, TDS/TCS 194Q-vs-206C applicability, MSMED-Act 43B(h) interest,
// dividend Sec-194 TDS, and the board-minutes generator. These lock in the numbers so a future
// edit can't silently change a tax computation. Run: node --test src/modules/books/taxengines.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { interest234, computeIncomeTax } = require("./incometax");
const { applicability194Q206C } = require("./taxdepth");
const { msmeInterest } = require("./msme");
const { dividendTds, boardMinutes } = require("./roc");

test("234: nothing due when fully paid and filed on time", () => {
  const r = interest234({ ay: "2025-26", assessedTax: 500000, tds: 0, advanceTaxPaid: 500000, returnDueDate: "2025-07-31", returnFiledOn: "2025-07-15", paidCumulative: { jun: 75000, sep: 225000, dec: 375000, mar: 500000 } });
  assert.equal(r.s234A.interest, 0, "no 234A when filed before due date");
  assert.equal(r.s234B.interest, 0, "no 234B when advance >= 90%");
  assert.equal(r.s234C.interest, 0, "no 234C when each instalment met");
  assert.equal(r.totalInterest, 0);
});

test("234A: 1%/month on net liability for late filing", () => {
  // ₹5L tax, ₹1L TDS → net ₹4L; no advance; filed 2025-01-31 (6 months after 2025-07-31 due).
  const r = interest234({ ay: "2025-26", assessedTax: 500000, tds: 100000, advanceTaxPaid: 0, returnDueDate: "2025-07-31", returnFiledOn: "2026-01-31" });
  assert.ok(r.s234A.months >= 6 && r.s234A.months <= 7, `~6-7 months, got ${r.s234A.months}`);
  assert.equal(r.s234A.interest, Math.round(r.s234A.base * 0.01 * r.s234A.months), "234A = base × 1% × months");
  assert.ok(r.s234A.base > 0);
});

test("234B: triggers only when advance < 90% of assessed tax", () => {
  const short = interest234({ ay: "2025-26", assessedTax: 200000, tds: 0, advanceTaxPaid: 100000, returnFiledOn: "2025-06-10" });
  assert.ok(short.s234B.interest > 0, "50% paid → 234B applies");
  const ok = interest234({ ay: "2025-26", assessedTax: 200000, tds: 0, advanceTaxPaid: 190000, returnFiledOn: "2025-06-10" });
  assert.equal(ok.s234B.interest, 0, "95% paid → no 234B");
});

test("194Q vs 206C(1H): precedence + thresholds", () => {
  // Buyer turnover > ₹10cr, value > ₹50L → 194Q on the buyer, 0.1% over ₹50L.
  const q = applicability194Q206C({ myTurnoverPrevFy: 120000000, aggregateValueFy: 8000000, iAmBuyer: true });
  assert.equal(q.section, "194Q");
  assert.equal(q.amount, 3000, "0.1% of (80L-50L)=30L = ₹3000");
  // I'm the seller > ₹10cr, buyer small (< ₹10cr, so no 194Q) → 206C(1H) applies to me.
  const c = applicability194Q206C({ myTurnoverPrevFy: 120000000, counterpartyTurnoverPrevFy: 20000000, aggregateValueFy: 8000000, iAmBuyer: false });
  assert.equal(c.section, "206C(1H)");
  assert.equal(c.liable_on_me, true);
  // Both parties > ₹10cr → 194Q wins (buyer deducts), seller must NOT collect TCS.
  const both = applicability194Q206C({ myTurnoverPrevFy: 120000000, counterpartyTurnoverPrevFy: 150000000, aggregateValueFy: 8000000, iAmBuyer: false });
  assert.equal(both.section, "194Q", "194Q takes precedence when both cross ₹10cr");
  assert.equal(both.liable_on_me, false, "as seller, not liable when buyer deducts 194Q");
  // Below thresholds → neither.
  assert.equal(applicability194Q206C({ myTurnoverPrevFy: 5000000, aggregateValueFy: 1000000, iAmBuyer: true }).section, "none");
  // No PAN → higher 194Q rate (5%).
  assert.equal(applicability194Q206C({ myTurnoverPrevFy: 120000000, aggregateValueFy: 8000000, iAmBuyer: true, panAvailable: false }).rate_pct, 5);
});

test("MSMED 43B(h) interest: 0 until overdue, then compounds at 3× bank rate", () => {
  assert.equal(msmeInterest(100000, 0, 19.5), 0, "not overdue → no interest");
  assert.equal(msmeInterest(0, 60, 19.5), 0, "no outstanding → no interest");
  const i = msmeInterest(100000, 90, 19.5); // ~3 months at 19.5% p.a. monthly rests
  assert.ok(i > 0 && i < 100000 * 0.06, `positive, ~3mo compound (got ${i})`);
});

test("dividend Sec-194 TDS: 10% resident, 20% no-PAN, threshold relief", () => {
  assert.equal(dividendTds({ totalDividend: 100000, panAvailable: true }).tds, 10000);
  assert.equal(dividendTds({ totalDividend: 100000, panAvailable: false }).tds, 20000);
  assert.equal(dividendTds({ totalDividend: 100000, perShareholderAvg: 4000, panAvailable: true }).tds, 0, "≤ ₹5k/shareholder → no TDS");
});

test("AY 2026-27 (FY2025-26): Budget 2025 new-regime ₹12L nil-tax point, cliff above it, old regime + prior AY unaffected", () => {
  // Landmark Budget 2025 change: total income ≤ ₹12,00,000 under the new regime → NIL tax
  // (rebate u/s 87A raised to ₹60,000). Was UNSUPPORTED_AY before this fix.
  const atLimit = computeIncomeTax({ taxableIncome: 1200000, regime: "new", entityType: "individual", ay: "2026-27" });
  assert.equal(atLimit.total, "0.00");
  assert.equal(atLimit.rebate, "60000.00");

  // Just above the limit: this codebase models 87A as a cliff (no marginal relief) for
  // EVERY threshold it has ever encoded, not just this one — so normal slab tax applies.
  const justAbove = computeIncomeTax({ taxableIncome: 1200001, regime: "new", entityType: "individual", ay: "2026-27" });
  assert.equal(justAbove.rebate, "0.00");
  assert.ok(Number(justAbove.total) > 0, "no rebate above the limit -> tax is due");

  // Old regime was NOT revised by Budget 2025 - AY2026-27 must match AY2025-26 exactly.
  const old2026 = computeIncomeTax({ taxableIncome: 600000, regime: "old", entityType: "individual", ay: "2026-27" });
  const old2025 = computeIncomeTax({ taxableIncome: 600000, regime: "old", entityType: "individual", ay: "2025-26" });
  assert.deepEqual(old2026, old2025);

  // Regression: AY2025-26 new-regime keeps its OWN ₹7L rebate ceiling, unaffected by the
  // new AY2026-27 entry being prepended to the dated table. Rebate = min(tax, ceiling); at
  // exactly ₹7L the slab tax (₹20,000) is below the ₹25,000 ceiling, so THAT'S the rebate.
  const priorAy = computeIncomeTax({ taxableIncome: 700000, regime: "new", entityType: "individual", ay: "2025-26" });
  assert.equal(priorAy.total, "0.00");
  assert.equal(priorAy.rebate, "20000.00");
});

test("board minutes generator produces a usable minute", () => {
  const m = boardMinutes({ companyName: "Acme Pvt Ltd", meetingType: "Board", resolutions: ["the audited accounts be adopted"] });
  assert.match(m.minutes, /ACME PVT LTD/);
  assert.match(m.minutes, /RESOLVED THAT the audited accounts be adopted/);
  assert.ok(m.minutes.includes("Chairman"));
});
