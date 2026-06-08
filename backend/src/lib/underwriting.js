/**
 * Underwriting engine — Node.js.
 * Scores a credit application 0-100 from 9 signals.
 */

const INDUSTRY_RISK = {
  restaurant: 1.15, retail: 1.1, construction: 1.12,
  software: 0.9, professional_services: 0.92, healthcare: 0.88,
  default: 1.0,
};

async function score(tenantId, pool) {
  const cutoff90  = daysAgo(90);
  const cutoff180 = daysAgo(180);

  // Fetch raw data
  const [txnRes, accountRes, loanRes, userRes] = await Promise.all([
    pool.query(
      "SELECT * FROM transactions WHERE tenant_id=$1 AND transaction_date>=$2 ORDER BY transaction_date",
      [tenantId, cutoff180]
    ),
    pool.query("SELECT * FROM bank_accounts WHERE tenant_id=$1 AND is_active=true", [tenantId]),
    pool.query("SELECT * FROM active_loans WHERE tenant_id=$1", [tenantId]),
    pool.query("SELECT created_at FROM users WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenantId]),
  ]);

  const txns     = txnRes.rows;
  const accounts = accountRes.rows;
  const loans    = loanRes.rows;
  const joinDate = userRes.rows[0]?.created_at || new Date();

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

  const raw = (
    s1 * 0.22 +
    s2 * 0.15 +
    s3 * 0.10 +
    s4 * 0.08 +
    s5 * 0.12 +
    s6 * 0.10 +
    s7 * 0.12 +
    s8 * 0.07 +
    activityScore * 0.04
  );

  const multiplier = INDUSTRY_RISK["default"];
  const finalScore = Math.min(100, Math.round(raw / multiplier));

  const approvedAmount = calcApproved(finalScore, monthlyRevenue90);
  const product = recommendProduct(finalScore, txns);

  return {
    score: finalScore,
    approved_amount: approvedAmount,
    recommended_product: product,
    breakdown: {
      monthly_revenue: Math.round(monthlyRevenue90),
      monthly_revenue_180: Math.round(monthlyRevenue180),
      age_months: Math.round(ageMonths),
      debt_service_ratio: Math.round(dsr * 100) / 100,
      runway_months: Math.round(runwayMonths * 10) / 10,
      current_balance: currentBalance,
      signals: { s1, s2, s3, s4, s5, s6, s7, s8, activity: activityScore },
    },
  };
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

module.exports = { score };
