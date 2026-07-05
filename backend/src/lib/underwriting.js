/**
 * Underwriting engine - Node.js.
 * Scores a credit application 0-100 from 9 signals.
 */

const { q } = require("./tenantDb"); // RLS-safe reads of the lending tables (loans/loan_schedule)

const INDUSTRY_RISK = {
  restaurant: 1.15, retail: 1.1, construction: 1.12,
  software: 0.9, professional_services: 0.92, healthcare: 0.88,
  default: 1.0,
};

// Scorecard version stamp — persisted with every run so future weight changes can be
// backtested against outcomes recorded under the version that produced them.
const SCORECARD_VERSION = "v2-2026-07";

// pg returns DATE columns as JS Date objects; a naive toString() yields "Mon Jun 15 2026…",
// so slicing it produced WEEKDAY+MONTH buckets ("Mon Jun") instead of calendar months —
// the #2-weighted consistency signal was computed over garbage for every tenant.
// These handle Date | ISO string | anything Date.parse can read, in UTC.
function isoDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const t = Date.parse(d);
  return Number.isNaN(t) ? String(d).slice(0, 10) : new Date(t).toISOString().slice(0, 10);
}
const isoMonth = (d) => isoDate(d).slice(0, 7);

// Map free-text firm.industry/sector → an INDUSTRY_RISK band (policy heuristic, NOT a live
// default-rate feed). Unknown → default (1.0).
function normalizeIndustry(s) {
  const t = String(s || "").toLowerCase();
  if (/(restaurant|food|cafe|hospitality|hotel|catering)/.test(t)) return "restaurant";
  if (/(retail|trading|shop|store|ecommerce|e-commerce|fmcg|distribut)/.test(t)) return "retail";
  if (/(construction|realty|real estate|infra|contractor|builder)/.test(t)) return "construction";
  if (/(software|saas|tech|information technology|digital|\bit\b)/.test(t)) return "software";
  if (/(consult|professional|services|agency|legal|account|advisory|design)/.test(t)) return "professional_services";
  if (/(health|clinic|pharma|hospital|medical|diagnostic|wellness)/.test(t)) return "healthcare";
  return "default";
}

async function score(tenantId, pool, enrichment, opts = {}) {
  const cutoff90  = daysAgo(90);
  const cutoff180 = daysAgo(180);
  const c90 = new Date(cutoff90); // Date form for in-JS filters — a Date compared to a string is ALWAYS false (latent bug: the 90-day window was silently empty)

  // Fetch raw data. GST + receivables are SMB-specific signals Headroom uniquely has.
  // Legacy active_loans is kept ONLY as a fallback; real debt lives in the RLS'd lending
  // tables (loans/loan_schedule) → read via q() (a plain pool.query returns 0 rows under
  // FORCE RLS). kv_store (firm profile) + the legacy tables are not RLS'd.
  const [txnRes, accountRes, loanRes, userRes, gstRes, invRes, realLoanRes, dueNextRes, dpdRes, kvRes] = await Promise.all([
    pool.query(
      "SELECT * FROM transactions WHERE tenant_id=$1 AND transaction_date>=$2 ORDER BY transaction_date",
      [tenantId, cutoff180]
    ),
    pool.query("SELECT * FROM bank_accounts WHERE tenant_id=$1 AND is_active=true", [tenantId]),
    // Legacy fallback EXCLUDES fake-rail loans: every "loan" created by accepting one of
    // the old illustrative lender offers carries offer_id — a demo toy must never lower a
    // real credit limit. Genuinely-legacy manual records (offer_id NULL) still count.
    pool.query("SELECT * FROM active_loans WHERE tenant_id=$1 AND offer_id IS NULL", [tenantId]).catch(() => ({ rows: [] })),
    pool.query("SELECT created_at FROM users WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId]),
    pool.query("SELECT period_year, period_month, status, filed_at, output_tax, computed_data FROM gst_returns WHERE tenant_id=$1 ORDER BY period_year DESC, period_month DESC LIMIT 24", [tenantId]).catch(() => ({ rows: [] })),
    q(tenantId, "SELECT total_amount, status, due_date, customer_gstin, customer_name, created_at FROM invoices WHERE tenant_id=$1 AND status <> 'cancelled'", [tenantId]).catch(() => ({ rows: [] })), // invoices is FORCE-RLS (0015) → q()
    q(tenantId, "SELECT outstanding_principal FROM loans WHERE tenant_id=$1 AND status='active'", [tenantId]).catch(() => ({ rows: [] })),
    q(tenantId, "SELECT COALESCE(SUM(s.total_due),0) AS due_next FROM loan_schedule s JOIN loans l ON l.id=s.loan_id WHERE l.tenant_id=$1 AND l.status='active' AND s.status <> 'paid' AND s.due_date < now() + interval '31 days'", [tenantId]).catch(() => ({ rows: [{ due_next: 0 }] })),
    q(tenantId, "SELECT COALESCE(MAX(now()::date - s.due_date),0) AS max_dpd FROM loan_schedule s JOIN loans l ON l.id=s.loan_id WHERE l.tenant_id=$1 AND l.status='active' AND s.status <> 'paid' AND s.due_date < now()::date", [tenantId]).catch(() => ({ rows: [{ max_dpd: 0 }] })),
    pool.query("SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1", [tenantId]).catch(() => ({ rows: [] })),
  ]);

  const txns     = txnRes.rows;
  const accounts = accountRes.rows;
  const loans    = loanRes.rows; // legacy active_loans (fallback only)
  const joinDate = userRes.rows[0]?.created_at || new Date();
  const gstRows  = gstRes.rows;
  const invRows  = invRes.rows;

  // Real lending debt (RLS'd), with legacy fallback so existing active_loans users don't regress.
  const realLoans         = realLoanRes.rows;
  const useLending        = realLoans.length > 0;
  const realOutstanding   = realLoans.reduce((s, l) => s + Number(l.outstanding_principal || 0), 0);
  const legacyOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_balance || 0), 0);
  const existingDebt      = useLending ? realOutstanding : legacyOutstanding;
  const dueNext           = Number(dueNextRes.rows[0]?.due_next || 0);
  const maxDpd            = Number(dpdRes.rows[0]?.max_dpd || 0);
  const firm              = kvRes.rows[0]?.value?.value?.firm ?? {};

  const currentBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

  // ── Signal helpers ──────────────────────────────────────────────────────────
  const inflows90  = txns.filter(t => Number(t.amount) > 0 && new Date(t.transaction_date) >= c90);
  const outflows90 = txns.filter(t => Number(t.amount) < 0 && new Date(t.transaction_date) >= c90);
  const inflows180 = txns.filter(t => Number(t.amount) > 0);
  const outflows180 = txns.filter(t => Number(t.amount) < 0);

  const monthlyRevenueBooks90 = sum(inflows90)  / 3;
  const monthlyRevenue180     = sum(inflows180) / 6;

  // GST-declared turnover (lender-verifiable) — the returns we compute store the period's
  // taxable turnover in computed_data. It was fetched here and then DISCARDED; now, when a
  // business's books lag (common: sales invoiced but bank inflows recorded elsewhere), the
  // GST-declared monthly turnover FLOORS the revenue signal — declared-to-government beats
  // absent bookkeeping. Books remain the source when they're the larger.
  const gstTurnovers = gstRows
    .filter((r) => r.filed_at || ["filed", "accepted"].includes(r.status))
    .map((r) => Number(r.computed_data?.taxable_turnover))
    .filter((v) => Number.isFinite(v) && v > 0);
  const gstMonthlyTurnover = gstTurnovers.length ? gstTurnovers.reduce((a, b) => a + b, 0) / gstTurnovers.length : 0;
  const monthlyRevenue90 = Math.max(monthlyRevenueBooks90, gstMonthlyTurnover);
  const revenueSource = monthlyRevenue90 === monthlyRevenueBooks90 ? "books" : "gst_returns";

  // S1 - Average monthly revenue (last 3 months, GST-floored)
  const s1 = scoreRevenue(monthlyRevenue90);

  // S2 - Revenue consistency (CoV of monthly inflows)
  const s2 = scoreConsistency(inflows180);

  // S3 - Business vintage: EARLIEST EVIDENCE of the business existing — the first user's
  // join date, the earliest invoice, or the earliest FILED GST period — whichever is
  // oldest. (Join date alone punished long-running firms that adopted Headroom recently.)
  const earliestInvoice = invRows.reduce((min, i) => {
    const t = i.created_at ? new Date(i.created_at).getTime() : Infinity;
    return t < min ? t : min;
  }, Infinity);
  const earliestGst = gstRows
    .filter((r) => r.filed_at || ["filed", "accepted"].includes(r.status))
    .reduce((min, r) => {
      const t = new Date(r.period_year, (r.period_month || 1) - 1, 1).getTime();
      return t < min ? t : min;
    }, Infinity);
  const earliestEvidence = Math.min(new Date(joinDate).getTime(), earliestInvoice, earliestGst);
  const ageMonths = (Date.now() - earliestEvidence) / (1000 * 60 * 60 * 24 * 30);
  const s3 = scoreAge(ageMonths);

  // S4 - Revenue concentration. Prefer INVOICES keyed by customer GSTIN (falling back to
  // the normalized name) — the audit-grade source. Fall back to bank inflows only when
  // there are too few invoices, and there EXCLUDE unnamed receipts: previously every
  // no-counterparty inflow lumped into one "unknown" merchant, so a tenant that didn't
  // fill counterparty names looked 100%-concentrated and ate the full penalty.
  const s4 = scoreConcentrationFromInvoices(invRows, inflows90);

  // S5 - Overdraft frequency (transactions that cause balance to go <0)
  const s5 = scoreOverdraft(txns);

  // S6 - Debt service ratio. Real near-term scheduled repayment from the lending module
  // (SUM of total_due in the next 31 days); falls back to a 5%-of-outstanding proxy for
  // out-of-window bullet loans, and to legacy active_loans when no lending loan exists.
  // ZERO revenue with a real repayment obligation is the WORST debt-service position,
  // not a perfect one (the old ternary scored it 100).
  const monthlyLoanRepayment = useLending
    ? (dueNext > 0 ? dueNext : realOutstanding * 0.05)
    : legacyOutstanding * 0.05;
  let s6;
  if (monthlyLoanRepayment <= 0) s6 = 100;                    // no debt burden at all
  else if (monthlyRevenue90 <= 0) s6 = 20;                    // debt with no revenue to service it
  else {
    const dsr = monthlyLoanRepayment / monthlyRevenue90;
    s6 = dsr < 0.15 ? 100 : dsr < 0.30 ? 80 : dsr < 0.45 ? 60 : dsr < 0.60 ? 40 : 20;
  }
  const dsr = monthlyRevenue90 > 0 ? monthlyLoanRepayment / monthlyRevenue90 : (monthlyLoanRepayment > 0 ? Infinity : 0);

  // S12 - Loan repayment conduct (worst current DPD across the real schedule). Neutral (100)
  // when there are no loans or nothing is overdue.
  const s12 = maxDpd <= 0 ? 100 : maxDpd <= 30 ? 60 : maxDpd <= 60 ? 35 : 15;

  // S7 - Current balance vs monthly burn. When the tenant has NO bank accounts on record,
  // the runway is UNKNOWN, not zero — the old code scored active businesses 10/100 on a
  // 10%-weight factor purely for not having connected a bank (an ~9-point penalty for
  // keeping books). Unknown → neutral 60, surfaced as runway_months: null.
  const monthlyBurn = Math.abs(sum(outflows90)) / 3;
  const runwayKnown = accounts.length > 0;
  const runwayMonths = !runwayKnown ? null : (monthlyBurn > 0 ? currentBalance / monthlyBurn : 6);
  const s7 = !runwayKnown ? 60 : runwayMonths >= 3 ? 100 : runwayMonths >= 1.5 ? 70 : runwayMonths >= 0.5 ? 40 : 10;

  // S8 - Payment behaviour (outflows vs expected recurring)
  const s8 = scorePaymentBehavior(txns);

  // S9 - Volume / activity signal
  const activityScore = Math.min(100, txns.length / 2);

  // S10 - GST filing regularity (compliance + verifiable, lender-trusted turnover)
  const s10 = scoreGst(gstRows);

  // S11 - Receivables health (overdue as a share of what's outstanding)
  const recv = receivablesHealth(invRows);
  const s11 = recv.score;

  // Explainable, weighted factors - single source of truth for both the score and the
  // per-factor breakdown the owner sees (label · weight · status · how to improve).
  const factorDefs = [
    { key: "revenue",      label: "Monthly revenue",        score: s1,  weight: 0.20, hint: "Higher, steadier sales lift eligibility the most." },
    { key: "consistency",  label: "Revenue consistency",    score: s2,  weight: 0.13, hint: "Smooth out lumpy month-to-month inflows." },
    { key: "overdraft",    label: "Account conduct",        score: s5,  weight: 0.10, hint: "Avoid letting the balance dip negative." },
    { key: "debt_service", label: "Debt-service ratio",     score: s6,  weight: 0.10, hint: "Carry less existing-loan load vs revenue." },
    { key: "runway",       label: "Cash runway",            score: s7,  weight: 0.10, hint: "Keep a bigger cash buffer vs monthly burn." },
    { key: "gst",          label: "GST filing regularity",  score: s10, weight: 0.08, hint: "File GST returns on time, every period." },
    { key: "age",          label: "Business vintage",       score: s3,  weight: 0.08, hint: "Track record builds with age - automatic over time." },
    { key: "concentration",label: "Customer diversity",     score: s4,  weight: 0.05, hint: "Reduce reliance on one large customer." },
    { key: "receivables",  label: "Receivables health",     score: s11, weight: 0.07, hint: "Collect overdue invoices to cut your overdue %." },
    { key: "loan_conduct", label: "Loan repayment conduct", score: s12, weight: 0.05, hint: "Pay loan instalments on or before the due date." },
    { key: "payments",     label: "Payment behaviour",      score: s8,  weight: 0.03, hint: "Keep regular, on-time recurring payments." },
    { key: "activity",     label: "Account activity",       score: Math.round(activityScore), weight: 0.01, hint: "More transaction history strengthens the picture." },
  ];
  // Weights above sum to 1.0 (loan_conduct 0.05 offset by concentration −0.02, payments −0.02, activity −0.01).
  // Optional FinBox/bureau enrichment - adds a credit-bureau factor when available, then
  // renormalizes weights to 1.0. Absent → scorecard is exactly the internal-data version.
  if (enrichment && enrichment.bureau && enrichment.bureau.score != null) {
    factorDefs.push({ key: "bureau", label: "Credit bureau score", score: bureauToScore(enrichment.bureau.score), weight: 0.25, hint: "Keep your CIBIL / commercial bureau score healthy." });
    const wsum0 = factorDefs.reduce((s, f) => s + f.weight, 0);
    factorDefs.forEach((f) => (f.weight = f.weight / wsum0));
  }
  const raw = factorDefs.reduce((s, f) => s + f.score * f.weight, 0); // weights sum to 1.0

  const sectorKey = normalizeIndustry(firm.industry || firm.sector);
  const multiplier = INDUSTRY_RISK[sectorKey] ?? INDUSTRY_RISK["default"];
  const finalScore = Math.min(100, Math.round(raw / multiplier));
  const grade = gradeOf(finalScore);

  const factors = factorDefs.map((f) => ({
    key: f.key, label: f.label, score: Math.round(f.score), weight: f.weight,
    status: f.score >= 75 ? "strong" : f.score >= 50 ? "ok" : "weak",
    contribution: Math.round(f.score * f.weight),
    hint: f.hint,
  }));

  const approvedAmount = calcApproved(finalScore, monthlyRevenue90);
  const product = recommendProduct(finalScore, txns);

  const result = {
    score: finalScore,
    grade,
    approved_amount: approvedAmount,
    recommended_product: product,
    factors,
    breakdown: {
      monthly_revenue: Math.round(monthlyRevenue90),
      monthly_revenue_books: Math.round(monthlyRevenueBooks90),
      monthly_revenue_gst: Math.round(gstMonthlyTurnover),
      revenue_source: revenueSource,
      monthly_revenue_180: Math.round(monthlyRevenue180),
      age_months: Math.round(ageMonths),
      debt_service_ratio: Number.isFinite(dsr) ? Math.round(dsr * 100) / 100 : null,
      runway_months: runwayMonths == null ? null : Math.round(runwayMonths * 10) / 10,
      runway_source: runwayKnown ? "bank_accounts" : "none",
      scorecard_version: SCORECARD_VERSION,
      current_balance: currentBalance,
      gst_periods_filed: recv ? s10 : 0,           // NOTE: this is the 0-100 GST SCORE
      gst_filings_count: gstFiledCount(gstRows),   // the real COUNT of periods filed
      gst_window: GST_WINDOW,                       // periods in the window (denominator)
      existing_debt: Math.round(existingDebt),
      debt_source: useLending ? "lending" : "legacy",
      max_dpd: maxDpd,
      industry: sectorKey,
      industry_multiplier: multiplier,
      monthly_burn: Math.round(monthlyBurn),
      overdue_ratio: Math.round(recv.overdueRatio * 100) / 100,
      outstanding_receivables: recv.outstanding,
      overdue_receivables: recv.overdue,
      signals: { s1, s2, s3, s4, s5, s6, s7, s8, gst: s10, receivables: s11, activity: activityScore, loan_conduct: s12 },
    },
  };
  result.decision = decide(result);
  // Persist EVERY compute (including declines) — the label loop that makes the scorecard
  // backtestable lives on these rows. Best-effort inside the lib so no caller path is
  // ever missed and no scoring read can fail because the analytics insert did.
  require("./underwritingRuns").recordRun(tenantId, result, { trigger: opts.trigger, actorId: opts.actorId }).catch(() => {});
  return result;
}

// Grade bands for a human-readable risk tier.
function gradeOf(s) { return s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "E"; }

// Map a 300-900 bureau score (CIBIL / commercial) to our 0-100 factor scale.
function bureauToScore(c) {
  if (c == null || isNaN(Number(c))) return 50;
  const v = Number(c);
  return v >= 800 ? 98 : v >= 750 ? 88 : v >= 700 ? 75 : v >= 650 ? 58 : v >= 600 ? 40 : 20;
}

// Decisioning layer (Headroom's own BRE output): turn the score/grade into an explainable
// outcome + reasons + eligible amount. Pre-qualified (A/B/C) · refer (D) · declined (E / ₹0).
function decide(r) {
  const grade = r.grade;
  const overdue = (r.breakdown && r.breakdown.overdue_ratio) || 0;
  const gstScore = (r.breakdown && r.breakdown.signals && r.breakdown.signals.gst) || 0;
  const amt = Math.round(r.approved_amount || 0);
  const reasons = [];
  let outcome;
  if (grade === "E" || amt <= 0) { outcome = "declined"; reasons.push({ code: "low_score", text: `Score ${r.score} (grade ${grade}) is below the lending threshold.` }); }
  else if (grade === "D") { outcome = "refer"; reasons.push({ code: "borderline", text: `Grade ${grade} - borderline; a manual review is recommended.` }); }
  else { outcome = "pre_qualified"; reasons.push({ code: "qualified", text: `Grade ${grade} - pre-qualified up to ₹${amt.toLocaleString("en-IN")}.` }); }
  if (overdue > 0.4) reasons.push({ code: "high_overdue", text: `High overdue receivables (${Math.round(overdue * 100)}%) - collections risk.` });
  if (gstScore <= 5) reasons.push({ code: "no_gst", text: "No recent GST filing track record - verifiable turnover is limited." });
  return {
    outcome,
    label: outcome === "pre_qualified" ? "Pre-qualified" : outcome === "refer" ? "Refer for review" : "Not yet eligible",
    reasons,
    eligible_amount: amt,
  };
}

// GST filing regularity - distinct GST periods FILED in the last ~7 months. Filing on
// time signals compliance and gives a lender verifiable turnover. No returns → no track record.
// Distinct GST periods actually filed in the trailing ~7-month window (the real
// COUNT - distinct from the 0-100 score below). GST_WINDOW periods = full marks.
const GST_WINDOW = 6;
function gstFiledCount(rows) {
  if (!rows.length) return 0;
  const cut = new Date(); cut.setMonth(cut.getMonth() - 7);
  return new Set(
    rows
      .filter((r) => r.filed_at || ["filed", "accepted"].includes(r.status))
      .filter((r) => new Date(r.period_year, (r.period_month || 1) - 1, 1) >= cut)
      .map((r) => `${r.period_year}-${r.period_month}`)
  ).size;
}
function scoreGst(rows) {
  const n = gstFiledCount(rows);
  return n >= 6 ? 100 : n === 5 ? 88 : n === 4 ? 70 : n === 3 ? 50 : n === 2 ? 30 : n === 1 ? 15 : 5;
}

// Receivables health - overdue as a share of outstanding. No open invoices → neutral.
function receivablesHealth(invs) {
  const today = new Date();
  const open = invs.filter((i) => i.status !== "paid");
  const outstanding = open.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  if (outstanding <= 0) return { score: 60, overdueRatio: 0, outstanding: 0, overdue: 0 };
  const overdue = open.filter((i) => i.due_date && new Date(i.due_date) < today).reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const ratio = overdue / outstanding;
  const score = ratio === 0 ? 100 : ratio < 0.1 ? 85 : ratio < 0.25 ? 65 : ratio < 0.5 ? 45 : ratio < 0.75 ? 25 : 10;
  return { score, overdueRatio: ratio, outstanding: Math.round(outstanding), overdue: Math.round(overdue) };
}

// ── Signal implementations ─────────────────────────────────────────────────

function scoreRevenue(monthly) {
  if (monthly >= 2000000) return 100;
  if (monthly >= 1000000) return 85;
  if (monthly >= 500000)  return 70;
  if (monthly >= 200000)  return 55;
  if (monthly >= 100000)  return 40;
  if (monthly >= 50000)   return 25;
  return 10;
}

function scoreConsistency(inflows) {
  if (!inflows.length) return 0;
  const byMonth = {};
  for (const t of inflows) {
    const m = isoMonth(t.transaction_date); // real YYYY-MM calendar months (see isoDate note)
    byMonth[m] = (byMonth[m] || 0) + Number(t.amount);
  }
  const vals = Object.values(byMonth);
  if (vals.length < 2) return 60;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd   = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
  const cv   = mean > 0 ? sd / mean : 1;
  return cv < 0.1 ? 100 : cv < 0.2 ? 85 : cv < 0.35 ? 65 : cv < 0.5 ? 45 : 25;
}

function scoreAge(months) {
  if (months >= 36)  return 100;
  if (months >= 24)  return 85;
  if (months >= 12)  return 65;
  if (months >= 6)   return 45;
  if (months >= 3)   return 25;
  return 10;
}

// Shared top-share → score bands.
function concentrationBands(topPct) {
  return topPct < 0.2 ? 100 : topPct < 0.35 ? 80 : topPct < 0.5 ? 60 : topPct < 0.7 ? 40 : 20;
}

// Concentration from INVOICES, keyed by customer GSTIN (else normalized name) — the same
// identity key customerScore.js uses, so the debtor a lender sees here matches the debtor
// graded there. Requires ≥3 invoices to be meaningful; otherwise falls back to bank
// inflows with NAMED counterparties only (unnamed receipts excluded — see S4 note), and
// when less than half the inflow volume is attributable, the signal is honestly neutral.
function scoreConcentrationFromInvoices(invRows, inflows) {
  const invoiced = (invRows || []).filter((i) => Number(i.total_amount) > 0);
  if (invoiced.length >= 3) {
    const byCustomer = {};
    for (const i of invoiced) {
      const key = (i.customer_gstin && String(i.customer_gstin).trim().toUpperCase())
        || String(i.customer_name || "").trim().toLowerCase() || "unknown";
      byCustomer[key] = (byCustomer[key] || 0) + Number(i.total_amount);
    }
    const vals = Object.values(byCustomer).sort((a, b) => b - a);
    const total = vals.reduce((a, b) => a + b, 0);
    return concentrationBands(total > 0 ? vals[0] / total : 0);
  }
  return scoreConcentration(inflows);
}

function scoreConcentration(inflows) {
  if (!inflows.length) return 50;
  const named = inflows.filter((t) => t.merchant_name && String(t.merchant_name).trim());
  const namedVolume = named.reduce((s, t) => s + Number(t.amount), 0);
  const totalVolume = inflows.reduce((s, t) => s + Number(t.amount), 0);
  // Less than half the volume attributable to a named counterparty → concentration is
  // unknowable from this data; neutral, never penal.
  if (totalVolume <= 0 || namedVolume / totalVolume < 0.5) return 50;
  const byMerchant = {};
  for (const t of named) {
    const m = String(t.merchant_name).trim().toLowerCase();
    byMerchant[m] = (byMerchant[m] || 0) + Number(t.amount);
  }
  const vals = Object.values(byMerchant).sort((a, b) => b - a);
  return concentrationBands(vals[0] / namedVolume);
}

function scoreOverdraft(txns) {
  // Count days where running balance was negative
  let balance = 0;
  let overdraftDays = 0;
  let totalDays = 0;
  const sorted = [...txns].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
  let lastDate = null;
  for (const t of sorted) {
    const day = isoDate(t.transaction_date);
    if (lastDate !== day) { totalDays++; lastDate = day; }
    balance += Number(t.amount);
    if (balance < 0) overdraftDays++;
  }
  const rate = totalDays > 0 ? overdraftDays / totalDays : 0;
  return rate === 0 ? 100 : rate < 0.02 ? 85 : rate < 0.05 ? 65 : rate < 0.10 ? 40 : 15;
}

function scorePaymentBehavior(txns) {
  const recurring = txns.filter(t => t.is_recurring);
  if (!recurring.length) return 70;
  const outflows = recurring.filter(t => Number(t.amount) < 0).length;
  return outflows > 0 ? 80 : 70;
}

function calcApproved(score, monthlyRevenue) {
  if (score >= 80) return Math.round(monthlyRevenue * 3);
  if (score >= 65) return Math.round(monthlyRevenue * 2);
  if (score >= 50) return Math.round(monthlyRevenue * 1);
  if (score >= 35) return Math.round(monthlyRevenue * 0.5);
  return 0;
}

function recommendProduct(score, txns) {
  const hasInvoices = txns.some(t => t.category === "revenue" && Number(t.amount) > 50000);
  if (score >= 75) return hasInvoices ? "invoice_finance" : "revenue_advance";
  if (score >= 55) return "revenue_advance";
  if (score >= 40) return "credit_line";
  return null;
}

function sum(txns) {
  return txns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  score, scoreGst, receivablesHealth, gradeOf, decide, SCORECARD_VERSION,
  // pure signal fns exported for the DB-free unit suite
  isoDate, isoMonth, scoreConsistency, scoreConcentration, scoreConcentrationFromInvoices, scoreOverdraft,
};
