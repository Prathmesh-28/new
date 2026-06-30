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

// Re-export the rules-as-data primitives so an inspector route can read the dated
// parameter tables (and the validation) the income-tax numbers are sourced from.
module.exports = {
  advanceTaxSchedule,
  computeIncomeTax,
  itrSummary,
  taxParams: taxrules.PARAMS,
  resolveParam: taxrules.resolveParam,
  validateParams: taxrules.validateParams,
};
