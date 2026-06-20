// §IT — Income-Tax computation + Advance Tax for the BUSINESS, driven by the books P&L.
//
// This module produces the COMPUTATION that underlies an Income-Tax Return (ITR):
// it takes the net profit the books already prove (reports.profitLoss), treats it
// as "Profits & gains of business or profession", lets the caller add other heads
// (other income, capital gains), runs the slab/surcharge/cess machine for the
// applicable Assessment Year, and returns a head-wise summary. It also schedules
// the four statutory advance-tax instalments (s.211).
//
// SCOPE: this is the computation, NOT a filing. A portal-ready ITR JSON is a later
// step. Nothing here marks anything "filed" — these are figures the user verifies.
//
// All money math goes through ./money (decimal.js); never a JS float. The slab/
// surcharge/rebate facts are statutory (Income-Tax Act + Finance Acts) and are
// keyed by Assessment Year so the same code computes a prior year correctly.
const { money, ZERO, toRupees } = require("./money");
const { PostError } = require("./posting-engine");
const reports = require("./reports");

// ── (A) Statutory rate tables, keyed by Assessment Year ──────────────────────
// A "slab" is { upTo, rate } where upTo is the upper bound of taxable income for
// that band (null = no ceiling) and rate is a percentage. computeSlab walks them.
//
// New regime = s.115BAC (default from AY 2024-25). Old regime = the pre-existing
// slabs (with the basic exemption + Chapter VI-A deductions the caller supplies).
const IT_RULES = {
  "2024-25": {
    new: {
      slabs: [
        { upTo: 300000, rate: 0 },
        { upTo: 600000, rate: 5 },
        { upTo: 900000, rate: 10 },
        { upTo: 1200000, rate: 15 },
        { upTo: 1500000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      rebate87A: { incomeLimit: 700000, maxRebate: 25000 },
      // Under the new regime the top surcharge slab (37%) was abolished: capped 25%.
      surcharge: [
        { over: 5000000, rate: 10 },
        { over: 10000000, rate: 15 },
        { over: 20000000, rate: 25 },
      ],
    },
    old: {
      slabs: [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 5 },
        { upTo: 1000000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      rebate87A: { incomeLimit: 500000, maxRebate: 12500 },
      surcharge: [
        { over: 5000000, rate: 10 },
        { over: 10000000, rate: 15 },
        { over: 20000000, rate: 25 },
        { over: 50000000, rate: 37 },
      ],
    },
  },
  "2025-26": {
    // AY 2025-26 (FY 2024-25): new-regime slabs unchanged from AY 2024-25 for the
    // individual base; rebate/surcharge identical. (The wider FY2025-26 rebate is a
    // later AY and intentionally not asserted here.)
    new: {
      slabs: [
        { upTo: 300000, rate: 0 },
        { upTo: 700000, rate: 5 },
        { upTo: 1000000, rate: 10 },
        { upTo: 1200000, rate: 15 },
        { upTo: 1500000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      rebate87A: { incomeLimit: 700000, maxRebate: 25000 },
      surcharge: [
        { over: 5000000, rate: 10 },
        { over: 10000000, rate: 15 },
        { over: 20000000, rate: 25 },
      ],
    },
    old: {
      slabs: [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 5 },
        { upTo: 1000000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      rebate87A: { incomeLimit: 500000, maxRebate: 12500 },
      surcharge: [
        { over: 5000000, rate: 10 },
        { over: 10000000, rate: 15 },
        { over: 20000000, rate: 25 },
        { over: 50000000, rate: 37 },
      ],
    },
  },
};

// Non-individual flat rates. company: caller passes a 25%/30% via entityType detail;
// we accept "company" (default 30, or 25 if companyRate25 opt) and "firm"/"llp" (30).
const FLAT_RATES = {
  company: { rate: 30, rate25: 25, surcharge: [{ over: 10000000, rate: 7 }, { over: 100000000, rate: 12 }] },
  firm: { rate: 30, surcharge: [{ over: 10000000, rate: 12 }] },
};

const CESS_RATE = 4; // Health & Education Cess on (tax + surcharge).

function rulesFor(ay) {
  const r = IT_RULES[ay];
  if (!r) throw new PostError("UNSUPPORTED_AY", `Income-tax rules not configured for AY ${ay}`, 422);
  return r;
}

function normEntity(entityType) {
  const e = String(entityType || "individual").toLowerCase();
  if (e === "individual" || e === "huf") return "individual";
  if (e === "company") return "company";
  if (e === "firm" || e === "llp" || e === "partnership") return "firm";
  throw new PostError("BAD_ENTITY", `Unknown entityType '${entityType}'`, 422);
}

// Walk the slabs and tax each band's slice. Returns a Decimal.
function computeSlab(taxableIncome, slabs) {
  let tax = ZERO;
  let lower = money(0);
  const ti = money(taxableIncome);
  for (const s of slabs) {
    const ceil = s.upTo == null ? ti : money(s.upTo);
    const top = ti.lessThan(ceil) ? ti : ceil;
    const slice = top.minus(lower);
    if (slice.greaterThan(0)) tax = tax.plus(slice.times(s.rate).div(100));
    lower = ceil;
    if (ti.lessThanOrEqualTo(ceil)) break;
  }
  return tax;
}

// Surcharge on tax-before-cess, by the highest band the income crosses. Returns Decimal.
function computeSurcharge(taxableIncome, baseTax, surchargeBands) {
  const ti = money(taxableIncome);
  let rate = 0;
  for (const b of surchargeBands) if (ti.greaterThan(b.over)) rate = b.rate;
  return rate === 0 ? ZERO : money(baseTax).times(rate).div(100);
}

// ── (1) Advance-tax schedule (s.211) ─────────────────────────────────────────
// Statutory cumulative instalments: 15% by 15-Jun, 45% by 15-Sep, 75% by 15-Dec,
// 100% by 15-Mar. A 44AD/44ADA presumptive assessee pays the whole thing (100%)
// in a single instalment by 15-Mar. The due dates are stamped against the FY whose
// advance tax this is — derived from the AY (AY 2025-26 ⇒ FY 2024-25, dates in
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

  if (entity === "individual") {
    const r = rulesFor(ay);
    const reg = regime === "old" ? "old" : "new"; // default new (115BAC)
    const cfg = r[reg];
    baseTax = computeSlab(ti, cfg.slabs);
    // 87A rebate: if total income ≤ limit, rebate the tax up to maxRebate.
    if (ti.lessThanOrEqualTo(cfg.rebate87A.incomeLimit)) {
      rebate = baseTax.lessThan(cfg.rebate87A.maxRebate) ? baseTax : money(cfg.rebate87A.maxRebate);
    }
    surchargeBands = cfg.surcharge;
  } else {
    // Company / firm: flat rate, no slabs, no 87A.
    const flat = FLAT_RATES[entity];
    const rate = entity === "company" && companyRate25 ? flat.rate25 : flat.rate;
    baseTax = ti.times(rate).div(100);
    surchargeBands = flat.surcharge;
  }

  const taxAfterRebate = baseTax.minus(rebate);
  const surcharge = computeSurcharge(ti, taxAfterRebate, surchargeBands);
  const taxPlusSurcharge = taxAfterRebate.plus(surcharge);
  const cess = taxPlusSurcharge.times(CESS_RATE).div(100);
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
  const deductions = money(opts.deductions || 0); // Chapter VI-A (80C/80D/…) — caller-supplied.

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
    note: "Computation only — not a filing. A portal-ready ITR JSON is a later step.",
  };
}

module.exports = { advanceTaxSchedule, computeIncomeTax, itrSummary };
