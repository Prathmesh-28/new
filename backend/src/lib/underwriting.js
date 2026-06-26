/**
 * Underwriting engine — Node.js.
 * Scores a credit application 0-100 from 9 signals.
 */

const INDUSTRY_RISK = {
  restaurant: 1.15, retail: 1.1, construction: 1.12,
  software: 0.9, professional_services: 0.92, healthcare: 0.88,
  default: 1.0,
};

async function score(tenantId, pool, enrichment) {
  const cutoff90  = daysAgo(90);
  const cutoff180 = daysAgo(180);

  // Fetch raw data. GST + receivables are SMB-specific signals Headroom uniquely has.
  const [txnRes, accountRes, loanRes, userRes, gstRes, invRes] = await Promise.all([
    pool.query(
      "SELECT * FROM transactions WHERE tenant_id=$1 AND transaction_date>=$2 ORDER BY transaction_date",
      [tenantId, cutoff180]
    ),
    pool.query("SELECT * FROM bank_accounts WHERE tenant_id=$1 AND is_active=true", [tenantId]),
    pool.query("SELECT * FROM active_loans WHERE tenant_id=$1", [tenantId]),
    pool.query("SELECT created_at FROM users WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId]),
    pool.query("SELECT period_year, period_month, status, filed_at, output_tax FROM gst_returns WHERE tenant_id=$1 ORDER BY period_year DESC, period_month DESC LIMIT 24", [tenantId]).catch(() => ({ rows: [] })),
    pool.query("SELECT total_amount, status, due_date FROM invoices WHERE tenant_id=$1 AND status <> 'cancelled'", [tenantId]).catch(() => ({ rows: [] })),
  ]);

  const txns     = txnRes.rows;
  const accounts = accountRes.rows;
  const loans    = loanRes.rows;
  const joinDate = userRes.rows[0]?.created_at || new Date();
  const gstRows  = gstRes.rows;
  const invRows  = invRes.rows;

  const currentBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

  // ── Signal helpers ──────────────────────────────────────────────────────────
  const inflows90  = txns.filter(t => Number(t.amount) > 0 && new Date(t.transaction_date) >= cutoff90);
  const outflows90 = txns.filter(t => Number(t.amount) < 0 && new Date(t.transaction_date) >= cutoff90);
  const inflows180 = txns.filter(t => Number(t.amount) > 0);
  const outflows180 = txns.filter(t => Number(t.amount) < 0);

  const monthlyRevenue90  = sum(inflows90)  / 3;
  const monthlyRevenue180 = sum(inflows180) / 6;

  // S1 — Average monthly revenue (last 3 months)
  const s1 = scoreRevenue(monthlyRevenue90);

  // S2 — Revenue consistency (CoV of monthly inflows)
  const s2 = scoreConsistency(inflows180);

  // S3 — Business age in months
  const ageMonths = (Date.now() - new Date(joinDate)) / (1000 * 60 * 60 * 24 * 30);
  const s3 = scoreAge(ageMonths);

  // S4 — Revenue concentration (top customer %)
  const s4 = scoreConcentration(inflows90);

  // S5 — Overdraft frequency (transactions that cause balance to go <0)
  const s5 = scoreOverdraft(txns);

  // S6 — Debt service ratio
  const monthlyLoanRepayment = loans.reduce((s, l) => {
    // Estimate monthly from outstanding balance
    return s + (Number(l.outstanding_balance) * 0.05);
  }, 0);
  const dsr = monthlyRevenue90 > 0 ? monthlyLoanRepayment / monthlyRevenue90 : 0;
  const s6 = dsr < 0.15 ? 100 : dsr < 0.30 ? 80 : dsr < 0.45 ? 60 : dsr < 0.60 ? 40 : 20;

  // S7 — Current balance vs monthly burn
  const monthlyBurn = Math.abs(sum(outflows90)) / 3;
  const runwayMonths = monthlyBurn > 0 ? currentBalance / monthlyBurn : 6;
  const s7 = runwayMonths >= 3 ? 100 : runwayMonths >= 1.5 ? 70 : runwayMonths >= 0.5 ? 40 : 10;

  // S8 — Payment behaviour (outflows vs expected recurring)
  const s8 = scorePaymentBehavior(txns);

  // S9 — Volume / activity signal
  const activityScore = Math.min(100, txns.length / 2);

  // S10 — GST filing regularity (compliance + verifiable, lender-trusted turnover)
  const s10 = scoreGst(gstRows);

  // S11 — Receivables health (overdue as a share of what's outstanding)
  const recv = receivablesHealth(invRows);
  const s11 = recv.score;

  // Explainable, weighted factors — single source of truth for both the score and the
  // per-factor breakdown the owner sees (label · weight · status · how to improve).
  const factorDefs = [
    { key: "revenue",      label: "Monthly revenue",        score: s1,  weight: 0.20, hint: "Higher, steadier sales lift eligibility the most." },
    { key: "consistency",  label: "Revenue consistency",    score: s2,  weight: 0.13, hint: "Smooth out lumpy month-to-month inflows." },
    { key: "overdraft",    label: "Account conduct",        score: s5,  weight: 0.10, hint: "Avoid letting the balance dip negative." },
    { key: "debt_service", label: "Debt-service ratio",     score: s6,  weight: 0.10, hint: "Carry less existing-loan load vs revenue." },
    { key: "runway",       label: "Cash runway",            score: s7,  weight: 0.10, hint: "Keep a bigger cash buffer vs monthly burn." },
    { key: "gst",          label: "GST filing regularity",  score: s10, weight: 0.08, hint: "File GST returns on time, every period." },
    { key: "age",          label: "Business vintage",       score: s3,  weight: 0.08, hint: "Track record builds with age — automatic over time." },
    { key: "concentration",label: "Customer diversity",     score: s4,  weight: 0.07, hint: "Reduce reliance on one large customer." },
    { key: "receivables",  label: "Receivables health",     score: s11, weight: 0.07, hint: "Collect overdue invoices to cut your overdue %." },
    { key: "payments",     label: "Payment behaviour",      score: s8,  weight: 0.05, hint: "Keep regular, on-time recurring payments." },
    { key: "activity",     label: "Account activity",       score: Math.round(activityScore), weight: 0.02, hint: "More transaction history strengthens the picture." },
  ];
  // Optional FinBox/bureau enrichment — adds a credit-bureau factor when available, then
  // renormalizes weights to 1.0. Absent → scorecard is exactly the internal-data version.
  if (enrichment && enrichment.bureau && enrichment.bureau.score != null) {
    factorDefs.push({ key: "bureau", label: "Credit bureau score", score: bureauToScore(enrichment.bureau.score), weight: 0.25, hint: "Keep your CIBIL / commercial bureau score healthy." });
    const wsum0 = factorDefs.reduce((s, f) => s + f.weight, 0);
    factorDefs.forEach((f) => (f.weight = f.weight / wsum0));
  }
  const raw = factorDefs.reduce((s, f) => s + f.score * f.weight, 0); // weights sum to 1.0

  const multiplier = INDUSTRY_RISK["default"];
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
      monthly_revenue_180: Math.round(monthlyRevenue180),
      age_months: Math.round(ageMonths),
      debt_service_ratio: Math.round(dsr * 100) / 100,
      runway_months: Math.round(runwayMonths * 10) / 10,
      current_balance: currentBalance,
      gst_periods_filed: recv ? s10 : 0,
      overdue_ratio: Math.round(recv.overdueRatio * 100) / 100,
      outstanding_receivables: recv.outstanding,
      overdue_receivables: recv.overdue,
      signals: { s1, s2, s3, s4, s5, s6, s7, s8, gst: s10, receivables: s11, activity: activityScore },
    },
  };
  result.decision = decide(result);
  return result;
}

// Grade bands for a human-readable risk tier.
function gradeOf(s) { return s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "E"; }

// Map a 300–900 bureau score (CIBIL / commercial) to our 0–100 factor scale.
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
  else if (grade === "D") { outcome = "refer"; reasons.push({ code: "borderline", text: `Grade ${grade} — borderline; a manual review is recommended.` }); }
  else { outcome = "pre_qualified"; reasons.push({ code: "qualified", text: `Grade ${grade} — pre-qualified up to ₹${amt.toLocaleString("en-IN")}.` }); }
  if (overdue > 0.4) reasons.push({ code: "high_overdue", text: `High overdue receivables (${Math.round(overdue * 100)}%) — collections risk.` });
  if (gstScore <= 5) reasons.push({ code: "no_gst", text: "No recent GST filing track record — verifiable turnover is limited." });
  return {
    outcome,
    label: outcome === "pre_qualified" ? "Pre-qualified" : outcome === "refer" ? "Refer for review" : "Not yet eligible",
    reasons,
    eligible_amount: amt,
  };
}

// GST filing regularity — distinct GST periods FILED in the last ~7 months. Filing on
// time signals compliance and gives a lender verifiable turnover. No returns → no track record.
function scoreGst(rows) {
  if (!rows.length) return 0;
  const cut = new Date(); cut.setMonth(cut.getMonth() - 7);
  const recentFiled = new Set(
    rows
      .filter((r) => r.filed_at || ["filed", "accepted"].includes(r.status))
      .filter((r) => new Date(r.period_year, (r.period_month || 1) - 1, 1) >= cut)
      .map((r) => `${r.period_year}-${r.period_month}`)
  );
  const n = recentFiled.size;
  return n >= 6 ? 100 : n === 5 ? 88 : n === 4 ? 70 : n === 3 ? 50 : n === 2 ? 30 : n === 1 ? 15 : 5;
}

// Receivables health — overdue as a share of outstanding. No open invoices → neutral.
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
    const m = t.transaction_date.toString().slice(0, 7);
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

function scoreConcentration(inflows) {
  if (!inflows.length) return 50;
  const byMerchant = {};
  for (const t of inflows) {
    const m = t.merchant_name || "unknown";
    byMerchant[m] = (byMerchant[m] || 0) + Number(t.amount);
  }
  const vals = Object.values(byMerchant).sort((a, b) => b - a);
  const total = vals.reduce((a, b) => a + b, 0);
  const topPct = total > 0 ? vals[0] / total : 0;
  return topPct < 0.2 ? 100 : topPct < 0.35 ? 80 : topPct < 0.5 ? 60 : topPct < 0.7 ? 40 : 20;
}

function scoreOverdraft(txns) {
  // Count days where running balance was negative
  let balance = 0;
  let overdraftDays = 0;
  let totalDays = 0;
  const sorted = [...txns].sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));
  let lastDate = null;
  for (const t of sorted) {
    if (lastDate !== t.transaction_date.toString().slice(0, 10)) {
      totalDays++;
      lastDate = t.transaction_date.toString().slice(0, 10);
    }
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

module.exports = { score, scoreGst, receivablesHealth, gradeOf, decide };
