// §ITR — Schema-aware, portal-ready ITR JSON assembler.
//
// This module turns the DEEP, already-correct income-tax COMPUTATION in
// ./incometax (which itself reads dated legislation from ./taxrules) into the
// nested JSON shape the Income-Tax Department's e-filing utility ingests — an
// ITR-3 (business/profession with full books) or ITR-4 SUGAM (44AD/44ADA
// presumptive). Nothing here re-implements the tax math: we call
// incometax.itrSummary + incometax.computeIncomeTax and MAP their figures into
// the portal envelope. Nothing is marked "filed" — this is a download the user
// reviews and uploads themselves.
//
// Two patterns are deliberately borrowed:
//   • nootus/opentax "ITR Builder" — the FORM STRUCTURE (PartA-GEN identity block,
//     Schedule BP/HP/OS/CG income heads, Schedule VIA deductions, PartB-TI total
//     income, PartB-TTI tax-on-total-income + taxes-paid, Verification). We emit a
//     trimmed, faithfully-named subset of that tree (real ITR JSON is huge; we fill
//     the SMB-relevant heads and leave declared-empty stubs for the rest so the
//     shape validates and the utility accepts it).
//   • ustaxes declarative FIELD-MAPPING — instead of hand-building each node we
//     declare a FORM_SPEC (per form × the schedules + required fields it carries)
//     and a single assembler walks it. The required-field list per form/AY drives
//     itrSchema validation, so a missing PAN or AY fails loudly here, not on the
//     portal.
//
// Tenant data sourced WITHOUT touching the engines:
//   • PartA-GEN identity  ← tenant_profile (PAN, name, address, …)
//   • Business income     ← incometax.itrSummary (books P&L → "PGBP")
//   • TDS/TCS credits     ← book_tax_entries (tax_kind TDS/TCS, is_input=true =
//                            tax SUFFERED by the tenant on its receipts)
//   • Advance / self-asmt ← book_advance_tax (challans recorded by the tenant)
//   • Chapter VI-A        ← caller-supplied (same contract as itrSummary deductions)
//
// All money crosses as strings via ./money; errors throw PostError(code,msg,http).
const { pool } = require("../../db");
const { money, ZERO, toRupees, sum } = require("./money");
const { PostError } = require("./posting-engine");
const incometax = require("./incometax");

// ── (A) Supported forms + AYs ────────────────────────────────────────────────
// The two SMB-relevant ITR forms this assembler emits. ITR-3: an
// individual/HUF/firm carrying on business/profession with regular books (our
// default). ITR-4 SUGAM: the same assessee opting for the 44AD/44ADA presumptive
// scheme. (ITR-1/2 are salary/no-business; ITR-5/6 are firm-as-entity/company and
// out of this SMB scope.) AYs mirror incometax's SUPPORTED_AYS so we never emit a
// form for an AY whose slabs the engine refuses to compute.
const SUPPORTED_FORMS = ["ITR-3", "ITR-4"];
const SUPPORTED_AYS = ["2024-25", "2025-26"];

// ── (B) FORM_SPEC — declarative field map (ustaxes pattern) ──────────────────
// For each form: the human label, the income schedules it carries, and the
// REQUIRED fields (dotted paths into the assembled JSON) that itrSchema asserts
// are present + non-empty before the JSON is considered portal-ready. The schedule
// list drives which income-head nodes the assembler fills vs leaves as a declared
// stub. ITR-4 presumptive carries no Schedule HP/CG/BP-detail (income is declared
// directly), so its schedule set is intentionally small.
const FORM_SPEC = {
  "ITR-3": {
    label: "ITR-3 — Individual/HUF/Firm with income from business or profession (regular books)",
    schedules: ["BP", "HP", "OS", "CG", "VIA"],
    requiredFields: [
      "ITR.PartA_GEN.PersonalInfo.PAN",
      "ITR.PartA_GEN.PersonalInfo.AssesseeName.SurNameOrOrgName",
      "ITR.PartA_GEN.FilingStatus.AssessmentYear",
      "ITR.PartB_TI.GrossTotalIncome",
      "ITR.PartB_TI.TotalIncome",
      "ITR.PartB_TTI.ComputationOfTaxLiability.TotalTaxPayable",
      "ITR.Verification.Declaration.AssesseeVerName",
    ],
  },
  "ITR-4": {
    label: "ITR-4 SUGAM — Presumptive income from business & profession (44AD/44ADA)",
    schedules: ["BP_PRESUMPTIVE", "OS", "VIA"],
    requiredFields: [
      "ITR.PartA_GEN.PersonalInfo.PAN",
      "ITR.PartA_GEN.PersonalInfo.AssesseeName.SurNameOrOrgName",
      "ITR.PartA_GEN.FilingStatus.AssessmentYear",
      "ITR.PartB_TI.GrossTotalIncome",
      "ITR.PartB_TI.TotalIncome",
      "ITR.PartB_TTI.ComputationOfTaxLiability.TotalTaxPayable",
      "ITR.Verification.Declaration.AssesseeVerName",
    ],
  },
};

// Public catalogue for the GET /tax/itr-forms route: which forms exist, which AYs
// each supports, the schedules it carries, and a one-line "use when" hint.
function listForms() {
  return {
    assessmentYears: SUPPORTED_AYS.slice(),
    forms: SUPPORTED_FORMS.map((form) => ({
      form,
      label: FORM_SPEC[form].label,
      schedules: FORM_SPEC[form].schedules.slice(),
      assessmentYears: SUPPORTED_AYS.slice(),
      useWhen:
        form === "ITR-4"
          ? "Opting for the 44AD/44ADA presumptive scheme (turnover within the limit)."
          : "Carrying on business/profession with regular books of account.",
    })),
  };
}

// AY 2025-26 ⇒ FY 2024-25. Mirrors the convention in incometax.itrSummary.
function ayToFy(ay) {
  const ayStart = Number(String(ay).slice(0, 4));
  if (!Number.isFinite(ayStart)) throw new PostError("BAD_AY", `Bad assessment year "${ay}"`, 422);
  const fyStart = ayStart - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

// ── (C) Tenant data readers (no engine edits) ────────────────────────────────
// PartA-GEN identity from tenant_profile. Blank fields stay blank (the user
// completes them in the utility) rather than being fabricated.
async function _identity(tenantId) {
  const { rows } = await pool.query(
    "SELECT company_name, legal_name, pan, gstin, address, city, state, pincode, phone, website FROM tenant_profile WHERE tenant_id=$1",
    [tenantId]
  );
  const p = rows[0] || {};
  return {
    pan: (p.pan || "").toUpperCase(),
    name: p.legal_name || p.company_name || "",
    address: p.address || "",
    city: p.city || "",
    state: p.state || "",
    pincode: p.pincode || "",
    phone: p.phone || "",
    email: "",
  };
}

// Prepaid-tax credits for the FY, off the books:
//   • TDS/TCS SUFFERED — book_tax_entries rows with tax_kind TDS/TCS and
//     is_input=true (tax others withheld on the tenant's receipts = a credit the
//     tenant claims). Grouped by counterparty (the deductor/collector) for the
//     Schedule-TDS/TCS line shape the portal expects.
//   • Advance tax & self-assessment challans — book_advance_tax rows (the table
//     this module's DDL adds), each a BSR/CIN-stamped payment.
// Falls back to empty arrays if nothing recorded — never throws on absence.
async function _taxesPaid(tenantId, fy) {
  // FY "2024-25" → 2024-04-01 .. 2025-03-31.
  const startYear = Number(String(fy).slice(0, 4));
  const from = `${startYear}-04-01`;
  const to = `${startYear + 1}-03-31`;

  const { rows: withheld } = await pool.query(
    `SELECT te.tax_kind, te.hsn_sac AS section, te.taxable_value, te.tax_amount,
            l.name AS party_name, l.pan AS party_pan
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
       LEFT JOIN book_ledgers l ON l.id=v.party_ledger_id
      WHERE te.tenant_id=$1 AND te.tax_kind IN ('TDS','TCS') AND te.is_input=true
        AND v.voucher_date BETWEEN $2 AND $3`,
    [tenantId, from, to]
  );

  const tds = [];
  const tcs = [];
  for (const r of withheld) {
    const row = {
      deductorName: r.party_name || null,
      deductorPan: (r.party_pan || "").toUpperCase() || null,
      section: (r.section || "").toUpperCase() || null,
      amountPaidCredited: toRupees(r.taxable_value),
      taxCredit: toRupees(r.tax_amount),
    };
    (r.tax_kind === "TCS" ? tcs : tds).push(row);
  }

  // Advance / self-assessment challans (best-effort: table may be empty/new).
  let advance = [];
  try {
    const { rows } = await pool.query(
      `SELECT kind, bsr_code, challan_no, paid_on, amount
         FROM book_advance_tax
        WHERE tenant_id=$1 AND paid_on BETWEEN $2 AND $3
        ORDER BY paid_on`,
      [tenantId, from, to]
    );
    advance = rows.map((r) => ({
      kind: r.kind, // 'ADVANCE' | 'SELF_ASSESSMENT'
      bsrCode: r.bsr_code || null,
      challanNo: r.challan_no || null,
      paidOn: r.paid_on ? String(r.paid_on).slice(0, 10) : null,
      amount: toRupees(r.amount),
    }));
  } catch (e) {
    // Table not migrated yet on this DB — treat as no challans.
    advance = [];
  }

  const totalTds = sum(tds.map((r) => r.taxCredit));
  const totalTcs = sum(tcs.map((r) => r.taxCredit));
  const totalAdvance = sum(advance.filter((a) => a.kind === "ADVANCE").map((a) => a.amount));
  const totalSelfAssessment = sum(advance.filter((a) => a.kind === "SELF_ASSESSMENT").map((a) => a.amount));

  return {
    tds,
    tcs,
    advance,
    totals: {
      tds: toRupees(totalTds),
      tcs: toRupees(totalTcs),
      advanceTax: toRupees(totalAdvance),
      selfAssessmentTax: toRupees(totalSelfAssessment),
      totalPrepaid: toRupees(totalTds.plus(totalTcs).plus(totalAdvance).plus(totalSelfAssessment)),
    },
  };
}

// ── (D) Schedule builders (opentax ITR-Builder structure) ────────────────────
// Each returns the named schedule node. Heads the assessee doesn't have are
// emitted as declared-zero stubs so the tree shape stays stable and the utility
// accepts it (a missing schedule and a zero schedule are different to the portal).

// Schedule BP — Profits & gains of business or profession (ITR-3, regular books).
function scheduleBP(businessProfit) {
  const p = toRupees(money(businessProfit));
  return {
    ProfBusinessTotalIncome: p,
    NetProfitLossFromBusinessProf: p,
    BusinessIncOthThanSpecOrSpecludgnNetIncome: p, // single-activity SMB: all under one head
  };
}

// Schedule BP (presumptive) — ITR-4 SUGAM. 44AD (business) / 44ADA (profession):
// the presumptive income IS the declared profit; no detailed P&L is filed.
function scheduleBP44(businessProfit, regime) {
  const p = toRupees(money(businessProfit));
  const section = regime === "44ADA" ? "44ADA" : "44AD";
  return {
    PresumptiveSection: section,
    PresumptiveIncome44AD: section === "44AD" ? p : "0.00",
    PresumptiveIncome44ADA: section === "44ADA" ? p : "0.00",
    TotalPresumptiveIncomeUnderBP: p,
  };
}

// Schedule HP — Income from house property. SMB books don't track this; declared
// zero stub (the user fills it in the utility if they have rental income).
function scheduleHP() {
  return { TotalIncomeChargeableUnHP: "0.00", PassThroughIncome: "0.00" };
}

// Schedule OS — Income from other sources (interest, etc.). Caller-supplied via
// otherIncome; otherwise zero.
function scheduleOS(otherIncome) {
  const v = toRupees(money(otherIncome || 0));
  return { TotOthSrcNoRaceHorse: v, IncChargeable: v };
}

// Schedule CG — Capital gains. Caller-supplied total via capitalGains; we don't
// split STCG/LTCG (the user refines in the utility). Declared as a single total.
function scheduleCG(capitalGains) {
  const v = toRupees(money(capitalGains || 0));
  return { TotalCapGains: v, ShortTermCapGainFor15Per: "0.00", LongTermCapGain10Per: "0.00" };
}

// Schedule VIA — Chapter VI-A deductions (80C/80D/…). Caller passes either a
// single `deductions` total or a `deductionsBreakup` map of section→amount. We
// emit the named lines we recognise plus the total; the engine only ever consumed
// the total, so the JSON total must equal what itrSummary deducted.
const VIA_SECTIONS = ["80C", "80CCC", "80CCD1", "80CCD1B", "80CCD2", "80D", "80E", "80G", "80TTA", "80TTB"];
function scheduleVIA(deductionsTotal, breakup) {
  const node = { Section80C: "0.00", Section80D: "0.00", Section80G: "0.00", Section80TTA: "0.00" };
  if (breakup && typeof breakup === "object") {
    for (const sec of VIA_SECTIONS) {
      if (breakup[sec] != null) node[`Section${sec}`] = toRupees(money(breakup[sec]));
    }
  }
  node.TotalChapVIADeductions = toRupees(money(deductionsTotal || 0));
  return node;
}

// ── (E) PartA-GEN — assessee identity + filing status ────────────────────────
function partAGen(form, ay, identity, regime) {
  // Split a free-form name into surname/first for the portal's name node; an org/
  // firm name goes whole into SurNameOrOrgName.
  const parts = (identity.name || "").trim().split(/\s+/);
  const surname = parts.length > 1 ? parts[parts.length - 1] : (identity.name || "");
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  return {
    PersonalInfo: {
      AssesseeName: { SurNameOrOrgName: surname, FirstName: first || null },
      PAN: identity.pan,
      Address: {
        ResidenceNo: identity.address || null,
        CityOrTownOrDistrict: identity.city || null,
        StateCode: identity.state || null,
        PinCode: identity.pincode || null,
        CountryCode: "91",
        MobileNo: identity.phone || null,
        EmailAddress: identity.email || null,
      },
    },
    FilingStatus: {
      AssessmentYear: ay,
      ReturnFileSec: 11, // 11 = filed u/s 139(1), on or before due date (default)
      // 115BAC = the new (default) regime; "old" = the assessee opted out.
      OptingNewTaxRegime: regime === "old" ? "N" : "Y",
      FormType: form,
    },
  };
}

// ── (F) PartB-TI — total income roll-up ──────────────────────────────────────
function partBTI(summary, schedules, form) {
  // Head amounts, taken from the engine's head-wise summary (single source of
  // truth) so PartB-TI always reconciles to the computation.
  const heads = {};
  for (const h of summary.incomeHeads) {
    if (/business or profession/i.test(h.head)) heads.bp = h.amount;
    else if (/other sources/i.test(h.head)) heads.os = h.amount;
    else if (/capital gains/i.test(h.head)) heads.cg = h.amount;
  }
  return {
    IncomeFromBusinessProf: heads.bp || "0.00",
    IncomeFromHP: "0.00",
    CapGain: { TotalCapGains: heads.cg || "0.00" },
    IncFromOS: { TotIncFromOS: heads.os || "0.00" },
    GrossTotalIncome: summary.grossTotalIncome,
    DeductionsUnderScheduleVIA: summary.deductions,
    TotalIncome: summary.taxableIncome,
  };
}

// ── (G) PartB-TTI — tax on total income + taxes paid + balance ───────────────
function partBTTI(summary, taxesPaid) {
  const tc = summary.taxComputation;
  const totalTaxPayable = money(tc.total); // tax + surcharge + cess, post-rebate
  const prepaid = money(taxesPaid.totals.totalPrepaid);
  const balance = totalTaxPayable.minus(prepaid);
  return {
    ComputationOfTaxLiability: {
      TaxPayableOnTotInc: tc.tax,
      Rebate87A: tc.rebate,
      Surcharge: tc.surcharge,
      EducationCess: tc.cess,
      TotalTaxPayable: tc.total,
    },
    TaxPaid: {
      TaxesPaid: {
        AdvanceTax: taxesPaid.totals.advanceTax,
        TDS: taxesPaid.totals.tds,
        TCS: taxesPaid.totals.tcs,
        SelfAssessmentTax: taxesPaid.totals.selfAssessmentTax,
        TotalTaxesPaid: taxesPaid.totals.totalPrepaid,
      },
      // BalTaxPayable > 0 ⇒ still owed; < 0 ⇒ refund due.
      BalTaxPayable: balance.greaterThanOrEqualTo(0) ? toRupees(balance) : "0.00",
      RefundDue: balance.lessThan(0) ? toRupees(balance.abs()) : "0.00",
    },
  };
}

// ── (H) Schedule-TDS / Schedule-TCS detail (per-deductor rows) ───────────────
function scheduleTaxesPaidDetail(taxesPaid) {
  return {
    ScheduleTDS: taxesPaid.tds.map((r, i) => ({
      SrNo: i + 1,
      DeductorName: r.deductorName,
      TANOrPAN: r.deductorPan,
      Section: r.section,
      AmtCarriedFwd: r.amountPaidCredited,
      TaxDeductCreditClaim: r.taxCredit,
    })),
    ScheduleTCS: taxesPaid.tcs.map((r, i) => ({
      SrNo: i + 1,
      CollectorName: r.deductorName,
      TAN: r.deductorPan,
      Section: r.section,
      AmtCarriedFwd: r.amountPaidCredited,
      TaxCollectCreditClaim: r.taxCredit,
    })),
    ScheduleIT: taxesPaid.advance.map((r, i) => ({
      SrNo: i + 1,
      BSRCode: r.bsrCode,
      DateDep: r.paidOn,
      ChallanNo: r.challanNo,
      TaxPaid: r.amount,
      Kind: r.kind,
    })),
  };
}

// ── (I) Verification block ───────────────────────────────────────────────────
function verification(identity) {
  return {
    Declaration: {
      AssesseeVerName: identity.name || "",
      AssesseeVerPAN: identity.pan || "",
      Capacity: "S", // S = Self
    },
    Place: identity.city || "",
    Date: new Date().toISOString().slice(0, 10),
  };
}

// ── (J) Schema validation — required fields per form/AY (ustaxes pattern) ─────
// Walk a dotted path into the assembled object; undefined if any segment missing.
function _get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Assert every requiredField for the form is present + non-empty. Returns
// { valid, errors:[{field,message}] }. A value of "0.00" is VALID (a real zero);
// only null/undefined/"" fail.
function itrSchema(itrJson, form) {
  const spec = FORM_SPEC[form];
  if (!spec) throw new PostError("BAD_FORM", `Unknown ITR form "${form}"`, 422);
  const errors = [];
  for (const field of spec.requiredFields) {
    const v = _get(itrJson, field);
    if (v == null || v === "") errors.push({ field, message: `Required field "${field}" is missing or empty` });
  }
  // PAN sanity: 10 chars AAAAA9999A pattern (loose; checksum lives in lib/validators).
  const pan = _get(itrJson, "ITR.PartA_GEN.PersonalInfo.PAN");
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan))) {
    errors.push({ field: "ITR.PartA_GEN.PersonalInfo.PAN", message: `PAN "${pan}" is not in AAAAA9999A format` });
  }
  return { valid: errors.length === 0, errors };
}

// ── (K) buildItrJson — the assembler ─────────────────────────────────────────
// Assemble the portal-ready ITR JSON for a tenant. opts:
//   ay      — assessment year, e.g. "2025-26" (required; must be SUPPORTED_AYS)
//   regime  — "new" (default, 115BAC) | "old"; or "44AD"/"44ADA" for presumptive
//   form    — "ITR-3" (default) | "ITR-4"; if 44AD/44ADA and form unset ⇒ ITR-4
//   entityType, otherIncome, capitalGains, deductions, deductionsBreakup,
//   companyRate25 — passed through to incometax.itrSummary.
// Returns { form, assessmentYear, financialYear, regime, itr, schema, sources }.
async function buildItrJson(tenantId, opts = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const ay = opts.ay;
  if (!ay) throw new PostError("BAD_INPUT", "ay (assessment year) required", 422);
  if (!SUPPORTED_AYS.includes(String(ay))) {
    throw new PostError("UNSUPPORTED_AY", `ITR JSON not configured for AY ${ay} (supported: ${SUPPORTED_AYS.join(", ")})`, 422);
  }

  const regime = opts.regime || "new";
  const presumptive = regime === "44AD" || regime === "44ADA";
  // Pick the SMB-relevant form: presumptive ⇒ ITR-4, else ITR-3, unless overridden.
  const form = opts.form || (presumptive ? "ITR-4" : "ITR-3");
  if (!SUPPORTED_FORMS.includes(form)) {
    throw new PostError("BAD_FORM", `form must be one of ${SUPPORTED_FORMS.join(", ")}, got ${form}`, 422);
  }

  const fy = ayToFy(ay);

  // (1) The DEEP computation — single source of truth for every rupee figure.
  // Presumptive income is taxed under normal slabs, so pass "new"/"old" to the
  // engine (it does not slab-tax differently for 44AD; the presumptive scheme only
  // changes how the PROFIT is arrived at, which the books already reflect).
  const summary = await incometax.itrSummary(tenantId, fy, {
    ay,
    regime: presumptive ? (opts.rateRegime === "old" ? "old" : "new") : regime,
    entityType: opts.entityType || "individual",
    otherIncome: opts.otherIncome || 0,
    capitalGains: opts.capitalGains || 0,
    deductions: opts.deductions || 0,
    companyRate25: opts.companyRate25,
  });

  // (2) Tenant identity + prepaid-tax credits (no engine involvement).
  const [identity, taxesPaid] = await Promise.all([_identity(tenantId), _taxesPaid(tenantId, fy)]);

  // Business profit (the PGBP head) for the schedule builders.
  const bpHead = summary.incomeHeads.find((h) => /business or profession/i.test(h.head));
  const businessProfit = bpHead ? bpHead.amount : "0.00";

  // (3) Build the schedule nodes the FORM_SPEC says this form carries.
  const want = new Set(FORM_SPEC[form].schedules);
  const schedules = {};
  if (want.has("BP")) schedules.ScheduleBP = scheduleBP(businessProfit);
  if (want.has("BP_PRESUMPTIVE")) schedules.ScheduleBP = scheduleBP44(businessProfit, regime);
  if (want.has("HP")) schedules.ScheduleHP = scheduleHP();
  if (want.has("OS")) schedules.ScheduleOS = scheduleOS(opts.otherIncome);
  if (want.has("CG")) schedules.ScheduleCG = scheduleCG(opts.capitalGains);
  if (want.has("VIA")) schedules.ScheduleVIA = scheduleVIA(summary.deductions, opts.deductionsBreakup);

  // (4) Assemble the full ITR envelope (opentax tree shape).
  const itr = {
    ITR: {
      Form_ITR: form.replace("ITR-", "ITR"), // "ITR3" / "ITR4"
      SchemaVer: `${ay}_v1`,
      PartA_GEN: partAGen(form, ay, identity, regime),
      ...schedules,
      ...scheduleTaxesPaidDetail(taxesPaid),
      PartB_TI: partBTI(summary, schedules, form),
      PartB_TTI: partBTTI(summary, taxesPaid),
      Verification: verification(identity),
    },
  };

  // (5) Validate against the per-form required-field schema.
  const schema = itrSchema(itr, form);

  return {
    form,
    assessmentYear: ay,
    financialYear: fy,
    regime: presumptive ? `presumptive (${regime})` : regime,
    itr,
    schema, // { valid, errors }
    sources: {
      businessProfit: `Books P&L FY ${fy} (via incometax.itrSummary)`,
      tdsCredits: taxesPaid.tds.length,
      tcsCredits: taxesPaid.tcs.length,
      advanceChallans: taxesPaid.advance.length,
      identityComplete: !!(identity.pan && identity.name),
    },
    note: "Portal-ready JSON for review/upload — NOT a filed return. Verify totals before uploading to the e-filing utility.",
  };
}

module.exports = {
  buildItrJson,
  listForms,
  itrSchema,
  SUPPORTED_FORMS,
  SUPPORTED_AYS,
  FORM_SPEC,
};
