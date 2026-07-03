// §IT - Income-Tax computation + Advance Tax for the BUSINESS, driven by the books P&L.
//
// This module produces the COMPUTATION that underlies an Income-Tax Return (ITR):
// it takes the net profit the books already prove (reports.profitLoss), treats it
// as "Profits & gains of business or profession", lets the caller add other heads
// (other income, capital gains), runs the slab/surcharge/cess machine for the
// applicable Assessment Year, and returns a head-wise summary. It also schedules
// the four statutory advance-tax instalments (s.211).
//
// SCOPE: this is the computation, NOT a filing. A portal-ready ITR JSON is a later
// step. Nothing here marks anything "filed" - these are figures the user verifies.
//
// All money math goes through ./money (decimal.js); never a JS float. The slab/
// surcharge/rebate facts are statutory (Income-Tax Act + Finance Acts) and are
// keyed by Assessment Year so the same code computes a prior year correctly.
const { money, ZERO, toRupees } = require("./money");
const { PostError } = require("./posting-engine");
const reports = require("./reports");
const taxrules = require("./taxrules");

// ── (A) Statutory rate tables ─────────────────────────────────────────────────
// The slab/surcharge/rebate/cess facts are no longer inline here - they live in
// ./taxrules as DATED, VALIDATED parameters (rules-as-data, OpenFisca-style), keyed
// by the Assessment Year. We resolve them by AY via taxrules.ayToDate + resolveParam
// and run them through the pure helpers taxrules exports (slabTax / applyRebate87A /
// surcharge / addCess). This keeps the legislation auditable in one inspectable file.
const { ayToDate, resolveParam, slabTax, applyRebate87A, surcharge: surchargeOf, addCess } = taxrules;

// The AYs whose INDIVIDUAL/HUF slab tables this engine is willing to compute. The
// dated parameter store could resolve any date to its nearest-effective entry, but
// historically this engine only configured these two AYs (the old IT_RULES had just
// these keys) and threw UNSUPPORTED_AY for any other AY - we keep that contract exact
// (a future/prior AY needs an explicit Finance-Act review, not silent slab reuse).
// NOTE: only the individual path was AY-gated historically; company/firm used static
// FLAT_RATES regardless of AY (see flatRulesFor), so that path is intentionally NOT
// gated here.
const SUPPORTED_AYS = new Set(["2024-25", "2025-26"]);

// Resolve the INDIVIDUAL slab/rebate/surcharge rule set for an AY from the dated
// parameter store. Mirrors the old IT_RULES[ay] shape. Throws UNSUPPORTED_AY for an
// AY that was never configured.
function rulesFor(ay) {
  if (!SUPPORTED_AYS.has(String(ay))) {
    throw new PostError("UNSUPPORTED_AY", `Income-tax rules not configured for AY ${ay}`, 422);
  }
  const onDate = ayToDate(ay);
  const r = (key) => resolveParam("incometax", key, onDate);
  return {
    new: {
      slabs: r("slabsNew").brackets,
      rebate87A: r("rebate87ANew"),
      surcharge: r("surchargeIndividualNew").bands,
    },
    old: {
      slabs: r("slabsOld").brackets,
      rebate87A: r("rebate87AOld"),
      surcharge: r("surchargeIndividualOld").bands,
    },
    cessRate: r("cessIndividual").rate,
  };
}

// Resolve the NON-INDIVIDUAL flat-rate rule set (company/firm). These rates are not
// AY-keyed in the legislation we encode (a single static entry), and historically the
// company/firm path never consulted the AY - so we resolve "as of today" and do NOT
// gate on SUPPORTED_AYS, preserving that any AY (even unconfigured) computes a flat
// liability. Mirrors the old FLAT_RATES + CESS_RATE shape.
const _FLAT_DATE = new Date().toISOString().slice(0, 10);
function flatRulesFor(entity) {
  const r = (key) => resolveParam("incometax", key, _FLAT_DATE);
  if (entity === "company") {
    const f = r("flatCompany");
    return { rate: f.rate, rate25: f.rate25, surcharge: r("surchargeCompany").bands, cessRate: r("cessCompany").rate };
  }
  const f = r("flatFirm");
  return { rate: f.rate, surcharge: r("surchargeFirm").bands, cessRate: r("cessFirm").rate };
}

function normEntity(entityType) {
  const e = String(entityType || "individual").toLowerCase();
  if (e === "individual" || e === "huf") return "individual";
  if (e === "company") return "company";
  if (e === "firm" || e === "llp" || e === "partnership") return "firm";
  throw new PostError("BAD_ENTITY", `Unknown entityType '${entityType}'`, 422);
}

// Walk the slabs and tax each band's slice. Returns a Decimal. (Thin wrapper over
// the rules-as-data helper taxrules.slabTax - kept so the engine reads clearly.)
function computeSlab(taxableIncome, slabs) {
  return slabTax(taxableIncome, slabs);
}

// Surcharge on tax-before-cess, by the highest band the income crosses. Returns
// Decimal. (Delegates to taxrules.surcharge; note the (tax, income, bands) order.)
function computeSurcharge(taxableIncome, baseTax, surchargeBands) {
  return surchargeOf(baseTax, taxableIncome, surchargeBands);
}

// ── (1) Advance-tax schedule (s.211) ─────────────────────────────────────────
// Statutory cumulative instalments: 15% by 15-Jun, 45% by 15-Sep, 75% by 15-Dec,
// 100% by 15-Mar. A 44AD/44ADA presumptive assessee pays the whole thing (100%)
// in a single instalment by 15-Mar. The due dates are stamped against the FY whose
// advance tax this is - derived from the AY (AY 2025-26 ⇒ FY 2024-25, dates in
// Jun-2024 … Mar-2025). Pure; no DB.
function advanceTaxSchedule({ projectedAnnualIncome, regime, entityType, ay } = {}) {
  const entity = normEntity(entityType);
  const presumptive = regime === "44AD" || regime === "44ADA" || regime === "presumptive";
  // The advance-tax liability is the FULL income-tax on the projected income.
  const { total } = computeIncomeTax({
    taxableIncome: projectedAnnualIncome,
    // 44AD assessees are individuals/firms taxed normally on the presumptive income;
    // default the rate-regime to "new" for individuals unless caller overrode it.
    regime: presumptive ? "new" : regime,
    entityType,
    ay,
  });

  // Due dates: the AY's previous FY. AY "2025-26" → FY start year 2024.
  const fyStartYear = ay ? Number(String(ay).slice(0, 4)) - 1 : new Date().getUTCFullYear();
  const d = (y, m, day) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const liability = money(total);
  const rows = presumptive
    ? [{ dueDate: d(fyStartYear + 1, 3, 15), cumulativePct: 100 }]
    : [
        { dueDate: d(fyStartYear, 6, 15), cumulativePct: 15 },
        { dueDate: d(fyStartYear, 9, 15), cumulativePct: 45 },
        { dueDate: d(fyStartYear, 12, 15), cumulativePct: 75 },
        { dueDate: d(fyStartYear + 1, 3, 15), cumulativePct: 100 },
      ];

  let priorCumulative = ZERO;
  const instalments = rows.map((r) => {
    const cumulativeTax = liability.times(r.cumulativePct).div(100);
    const instalment = cumulativeTax.minus(priorCumulative);
    priorCumulative = cumulativeTax;
    return {
      dueDate: r.dueDate,
      cumulativePct: r.cumulativePct,
      cumulativeTax: toRupees(cumulativeTax),
      instalmentDue: toRupees(instalment),
    };
  });

  return {
    assessmentYear: ay || null,
    entityType: entity,
    regime: presumptive ? "presumptive (44AD/44ADA)" : (regime || "new"),
    projectedAnnualIncome: toRupees(money(projectedAnnualIncome)),
    totalAdvanceTax: toRupees(liability),
    instalments,
  };
}

// ── (2) Income-tax engine ────────────────────────────────────────────────────
// Slab tax (new vs old for individual/HUF; flat 25%/30% for company/firm), 87A
// rebate (new regime ≤7L), surcharge slabs, 4% cess. AY-parameterised. Pure; no DB.
function computeIncomeTax({ taxableIncome, regime, entityType, ay, companyRate25 } = {}) {
  const ti = money(taxableIncome);
  if (ti.lessThan(0)) throw new PostError("NEGATIVE_INCOME", "taxableIncome cannot be negative", 422);
  const entity = normEntity(entityType);

  let baseTax = ZERO;
  let rebate = ZERO;
  let surchargeBands = [];
  let cessRate;

  if (entity === "individual") {
    const r = rulesFor(ay); // AY-keyed individual slabs/rebate/surcharge from ./taxrules
    const reg = regime === "old" ? "old" : "new"; // default new (115BAC)
    const cfg = r[reg];
    baseTax = computeSlab(ti, cfg.slabs);
    // 87A rebate: if total income ≤ limit, rebate the tax up to maxRebate.
    rebate = applyRebate87A(ti, baseTax, cfg.rebate87A);
    surchargeBands = cfg.surcharge;
    cessRate = r.cessRate;
  } else {
    // Company / firm: flat rate, no slabs, no 87A. AY-independent (as historically).
    const flat = flatRulesFor(entity);
    const rate = entity === "company" && companyRate25 ? flat.rate25 : flat.rate;
    baseTax = ti.times(rate).div(100);
    surchargeBands = flat.surcharge;
    cessRate = flat.cessRate;
  }

  const taxAfterRebate = baseTax.minus(rebate);
  const surcharge = computeSurcharge(ti, taxAfterRebate, surchargeBands);
  const taxPlusSurcharge = taxAfterRebate.plus(surcharge);
  const cess = addCess(taxPlusSurcharge, cessRate);
  const total = taxPlusSurcharge.plus(cess);
  const effectiveRate = ti.greaterThan(0) ? total.div(ti).times(100) : ZERO;

  return {
    tax: toRupees(baseTax),
    rebate: toRupees(rebate),
    surcharge: toRupees(surcharge),
    cess: toRupees(cess),
    total: toRupees(total),
    effectiveRate: effectiveRate.toFixed(2),
  };
}

// ── (3) ITR computation summary (DB-backed) ──────────────────────────────────
// Pull the business net profit the books prove (reports.profitLoss for the FY),
// treat it as "Profits & gains of business or profession", add the heads the caller
// passes (other income, capital gains), subtract Chapter VI-A deductions, run
// computeIncomeTax, and return the head-wise computation behind an ITR. The AY is
// derived from the FY ("2024-25" ⇒ AY "2025-26") unless opts.ay overrides it.
async function itrSummary(tenantId, fy, opts = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!fy) throw new PostError("BAD_INPUT", "fy (financial year) required", 400);

  const pl = await reports.profitLoss(tenantId, fy);
  const businessProfit = money(pl.netProfit);

  const otherIncome = money(opts.otherIncome || 0);
  const capitalGains = money(opts.capitalGains || 0);
  const deductions = money(opts.deductions || 0); // Chapter VI-A (80C/80D/…) - caller-supplied.

  const incomeHeads = [
    { head: "Profits & gains of business or profession", amount: toRupees(businessProfit), source: `Books P&L (FY ${fy})` },
    { head: "Income from other sources", amount: toRupees(otherIncome) },
    { head: "Capital gains", amount: toRupees(capitalGains) },
  ];

  const grossTotalIncome = businessProfit.plus(otherIncome).plus(capitalGains);
  let taxableIncome = grossTotalIncome.minus(deductions);
  if (taxableIncome.lessThan(0)) taxableIncome = ZERO;

  // AY = FY start year + 1, expressed as "YYYY-YY".
  const fyStart = Number(String(fy).slice(0, 4));
  const ay = opts.ay || `${fyStart + 1}-${String((fyStart + 2) % 100).padStart(2, "0")}`;
  const regime = opts.regime || "new";
  const entityType = opts.entityType || "individual";

  const taxComputation = computeIncomeTax({
    taxableIncome: toRupees(taxableIncome),
    regime,
    entityType,
    ay,
    companyRate25: opts.companyRate25,
  });

  return {
    tenantId,
    financialYear: fy,
    assessmentYear: ay,
    regime,
    entityType: normEntity(entityType),
    incomeHeads,
    grossTotalIncome: toRupees(grossTotalIncome),
    deductions: toRupees(deductions),
    taxableIncome: toRupees(taxableIncome),
    taxComputation,
    note: "Computation only - not a filing. A portal-ready ITR JSON is a later step.",
  };
}

// ── (4) Interest u/s 234A / 234B / 234C (precise) ─────────────────────────────
// Replaces the rough frontend estimate. All three run at 1% per month; the period is
// counted on a 30-day-month basis with any part of a month treated as a full month
// (documented approximation — final figures confirmed at filing). Pure; no DB.
//   234A - late filing: on (assessed tax − advance − TDS), from the return due date to
//          the actual filing date.
//   234B - default in advance tax: if advance paid < 90% of assessed tax, on the shortfall,
//          from 1-Apr of the AY to the filing/assessment date.
//   234C - deferment of instalments: per-instalment shortfall vs the cumulative target,
//          with the 12%/36% June/Sep safe-harbour. 3 months each for Jun/Sep/Dec, 1 for Mar.
const DAY_MS = 86400000;
function taxMonths(fromISO, toISO) {
  const d = Math.floor((new Date(toISO).getTime() - new Date(fromISO).getTime()) / DAY_MS);
  return d <= 0 ? 0 : Math.ceil(d / 30); // month or part of a month (30-day basis)
}
const round100Down = (x) => Math.floor(Number(x) / 100) * 100; // interest base is rounded to ₹100

function interest234({
  ay, assessedTax, tds = 0, advanceTaxPaid = 0, paidCumulative,
  returnDueDate, returnFiledOn, presumptive = false,
} = {}) {
  if (!ay) throw new PostError("BAD_INPUT", "ay required", 400);
  const fyStartYear = Number(String(ay).slice(0, 4)) - 1;         // AY 2025-26 → FY 2024-25
  const aprFirst = `${fyStartYear + 1}-04-01`;                    // 1-Apr of the AY
  const dueDate = returnDueDate || `${fyStartYear + 1}-07-31`;    // default non-audit due date
  const filedOn = returnFiledOn || new Date().toISOString().slice(0, 10);

  const totalTax = Math.max(0, Number(assessedTax) || 0);
  const netLiability = Math.max(0, totalTax - (Number(tds) || 0)); // "assessed tax" for 234B/234C
  const advPaid = Number(advanceTaxPaid) || 0;

  // 234B — advance tax < 90% of net liability.
  let i234B = 0, b234B = 0, m234B = 0;
  if (netLiability > 0 && advPaid < 0.9 * netLiability) {
    b234B = round100Down(netLiability - advPaid);
    m234B = taxMonths(aprFirst, filedOn);
    i234B = Math.round(b234B * 0.01 * m234B);
  }

  // 234C — per-instalment deferment. Cumulative paid by each due date (defaults: only the
  // Mar figure known = advPaid, earlier = 0 — the conservative case, clearly flagged).
  const cum = paidCumulative || { jun: 0, sep: 0, dec: 0, mar: advPaid };
  const schedule = presumptive
    ? [{ key: "mar", target: 1.0, safe: 1.0, months: 1 }]
    : [
        { key: "jun", target: 0.15, safe: 0.12, months: 3 },
        { key: "sep", target: 0.45, safe: 0.36, months: 3 },
        { key: "dec", target: 0.75, safe: 0.75, months: 3 },
        { key: "mar", target: 1.0, safe: 1.0, months: 1 },
      ];
  const c234C = [];
  let i234C = 0;
  for (const s of schedule) {
    const paid = Number(cum[s.key]) || 0;
    const safeAmt = netLiability * s.safe;
    let interest = 0, shortfall = 0;
    if (paid < safeAmt) { shortfall = round100Down(netLiability * s.target - paid); interest = Math.round(Math.max(0, shortfall) * 0.01 * s.months); }
    i234C += interest;
    c234C.push({ instalment: s.key, target_pct: Math.round(s.target * 100), paid, shortfall: Math.max(0, shortfall), months: s.months, interest });
  }

  // 234A — late filing.
  let i234A = 0, m234A = 0, b234A = 0;
  if (new Date(filedOn) > new Date(dueDate)) {
    b234A = round100Down(Math.max(0, netLiability - advPaid));
    m234A = taxMonths(dueDate, filedOn);
    i234A = Math.round(b234A * 0.01 * m234A);
  }

  return {
    assessmentYear: ay,
    inputs: { assessedTax: totalTax, tds: Number(tds) || 0, advanceTaxPaid: advPaid, netLiability, returnDueDate: dueDate, returnFiledOn: filedOn, presumptive },
    s234A: { base: b234A, months: m234A, interest: i234A },
    s234B: { base: b234B, months: m234B, interest: i234B },
    s234C: { instalments: c234C, interest: i234C },
    totalInterest: i234A + i234B + i234C,
    note: "1%/month, part of a month = full (30-day basis). 234C uses cumulative advance paid by each due date; supply paidCumulative {jun,sep,dec,mar} for accuracy. Confirm at filing.",
  };
}

// ── (5) Form 3CD prep sheet (tax audit u/s 44AB) — ledger-derived ─────────────
// Not a filed form: a prep sheet that fills the clauses derivable from the books so the
// auditor starts from real numbers. Clause 40 ratios (turnover/GP/NP), clause 21(b)/40A(3)
// cash payments over ₹10,000, and the 43B(h) MSME disallowance are computed here; the rest
// are left as structured placeholders for the auditor.
async function form3cd(tenantId, fy, opts = {}) {
  if (!fy) throw new PostError("BAD_INPUT", "fy required", 400);
  const pl = await reports.profitLoss(tenantId, fy);
  const turnover = Number(pl.totalIncome) || 0;
  const netProfit = Number(pl.netProfit) || 0;
  const grossProfit = turnover - (Number(pl.totalExpense) || 0) + netProfit; // rough GP proxy; auditor refines

  // Clause 21(b) / 40A(3): cash PAYMENT vouchers where a single payment credits the Cash
  // ledger by more than ₹10,000 (₹35,000 for transporters). Ledger-derived flag list.
  const { pool } = require("../../db");
  const start = `${String(fy).slice(0, 4)}-04-01`, end = `${Number(String(fy).slice(0, 4)) + 1}-03-31`;
  const { rows: cashPayments } = await pool.query(
    `SELECT v.id, v.voucher_date, v.narration, SUM(e.credit) AS cash_out
       FROM book_vouchers v
       JOIN book_voucher_entries e ON e.voucher_id=v.id AND e.tenant_id=v.tenant_id
       JOIN book_ledgers l ON l.id=e.ledger_id
      WHERE v.tenant_id=$1 AND v.voucher_type='PAYMENT' AND v.is_cancelled=false
        AND v.voucher_date BETWEEN $2 AND $3 AND l.is_bank=false AND LOWER(l.name) LIKE '%cash%'
      GROUP BY v.id, v.voucher_date, v.narration
      HAVING SUM(e.credit) > 10000
      ORDER BY SUM(e.credit) DESC LIMIT 200`,
    [tenantId, start, end]
  ).catch(() => ({ rows: [] }));

  let msme43b = null;
  try { msme43b = await require("./msme").msme43b(tenantId, { asOf: end }); } catch { /* optional */ }

  return {
    financialYear: fy, assessmentYear: `${Number(String(fy).slice(0, 4)) + 1}-${String((Number(String(fy).slice(0, 4)) + 2) % 100).padStart(2, "0")}`,
    clause_40_ratios: {
      turnover, gross_profit: grossProfit, net_profit: netProfit,
      gp_to_turnover_pct: turnover > 0 ? Math.round((grossProfit / turnover) * 10000) / 100 : 0,
      np_to_turnover_pct: turnover > 0 ? Math.round((netProfit / turnover) * 10000) / 100 : 0,
    },
    clause_21b_40A3_cash_payments: {
      count: cashPayments.length,
      total: cashPayments.reduce((s, r) => s + Number(r.cash_out), 0),
      items: cashPayments.map((r) => ({ date: r.voucher_date, narration: r.narration, amount: Number(r.cash_out) })),
      note: "Single cash payments over ₹10,000 (₹35,000 for transporters) — potential 40A(3) disallowance; auditor to verify the exception cases.",
    },
    clause_22_msme_43bh: msme43b ? { disallowed: msme43b.totals.disallowed, interest: msme43b.totals.interest } : null,
    placeholders: ["Clause 18 (depreciation)", "Clause 26 (43B statutory dues)", "Clause 31 (269SS/269T loans)", "Clause 34 (TDS/TCS compliance)"],
    note: "Prep sheet only — clauses derivable from the ledger are filled; the auditor completes the rest and signs.",
  };
}

// Re-export the rules-as-data primitives so an inspector route can read the dated
// parameter tables (and the validation) the income-tax numbers are sourced from.
module.exports = {
  advanceTaxSchedule,
  computeIncomeTax,
  itrSummary,
  interest234,
  form3cd,
  taxParams: taxrules.PARAMS,
  resolveParam: taxrules.resolveParam,
  validateParams: taxrules.validateParams,
};
