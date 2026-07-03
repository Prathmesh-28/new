"use strict";
// Per-customer payment-behaviour scoring, computed from the tenant's own invoice history
// (issue date = created_at, due_date, paid date = paid_at — all real, set on both the manual
// mark-paid and the gateway-webhook paths). Produces, per customer, avg days-to-pay, on-time
// rate, outstanding/overdue, and a 0-100 score + A-E grade. Feeds (a) collections priority —
// chase the slow/at-risk payers first — and (b) a portfolio "receivables quality" summary that
// underwriting can fold in as a signal. Pure aggregation; the `invoices` table is not RLS'd, so
// a plain tenant-filtered query is correct (mirrors routes/collections.js).
const { pool } = require("../db");

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r2 = (x) => Math.round(Number(x) * 100) / 100;
const gradeOf = (s) => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "E");

// Score one customer's row of aggregates → { score, grade, label } + normalised numbers.
function scoreRow(row) {
  const paid = Number(row.paid) || 0;
  const paidWithDue = Number(row.paid_with_due) || 0;
  const onTime = Number(row.paid_ontime) || 0;
  const avgDtp = row.avg_dtp == null ? null : r2(row.avg_dtp);
  const onTimeRate = paidWithDue > 0 ? onTime / paidWithDue : null;
  const overdueAmt = Number(row.overdue_amt) || 0;

  const onTimeComp = onTimeRate != null ? onTimeRate * 100 : 60;              // no history → neutral 60
  const speedComp = avgDtp != null ? clamp(100 - Math.max(0, avgDtp) * 1.2, 0, 100) : 60; // ~0d→100, 30d→64, 83d→0
  let score = 0.6 * onTimeComp + 0.4 * speedComp;
  if (overdueAmt > 0) score *= 0.7;                                           // currently delinquent
  score = clamp(Math.round(score), 0, 100);

  const label = overdueAmt > 0 ? "At risk"
    : onTimeRate != null && onTimeRate >= 0.9 ? "Prompt"
    : score >= 65 ? "Reliable"
    : score >= 50 ? "Average" : "Slow";

  return {
    customer: row.customer_name,
    gstin: row.customer_gstin || null,
    invoices: Number(row.total) || 0,
    paid,
    open: Number(row.open_cnt) || 0,
    overdue: Number(row.overdue_cnt) || 0,
    billed: r2(row.billed || 0),
    outstanding: r2(row.outstanding || 0),
    overdue_amount: r2(overdueAmt),
    avg_days_to_pay: avgDtp,
    on_time_rate: onTimeRate == null ? null : r2(onTimeRate),
    score, grade: gradeOf(score), label,
  };
}

const AGG_SQL = `
  SELECT COALESCE(NULLIF(customer_gstin,''), customer_name) AS ckey,
         MAX(customer_name) AS customer_name,
         MAX(NULLIF(customer_gstin,'')) AS customer_gstin,
         COUNT(*) FILTER (WHERE status <> 'cancelled')                                              AS total,
         COUNT(*) FILTER (WHERE status = 'paid')                                                    AS paid,
         COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled'))                                 AS open_cnt,
         COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE)      AS overdue_cnt,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('paid','cancelled')),0)             AS outstanding,
         COALESCE(SUM(total_amount) FILTER (WHERE status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE),0) AS overdue_amt,
         COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'),0)                          AS billed,
         AVG(EXTRACT(EPOCH FROM (paid_at - created_at))/86400) FILTER (WHERE status='paid' AND paid_at IS NOT NULL) AS avg_dtp,
         COUNT(*) FILTER (WHERE status='paid' AND paid_at IS NOT NULL AND due_date IS NOT NULL)      AS paid_with_due,
         COUNT(*) FILTER (WHERE status='paid' AND paid_at IS NOT NULL AND due_date IS NOT NULL AND paid_at::date <= due_date) AS paid_ontime
    FROM invoices
   WHERE tenant_id=$1
   GROUP BY ckey`;

// Ranked per-customer scores (worst payers first — the collections work-list).
async function customerScores(tenantId, db = pool) {
  const { rows } = await require("./tenantDb").q(tenantId, AGG_SQL, [tenantId]); // invoices FORCE-RLS (0015) → q()
  const scored = rows.map(scoreRow)
    .sort((a, b) => (b.overdue_amount - a.overdue_amount) || (a.score - b.score));
  return scored;
}

// Portfolio-level receivables quality — a signal underwriting can consume.
async function receivablesQuality(tenantId, db = pool) {
  const scored = await customerScores(tenantId, db);
  const withHistory = scored.filter((s) => s.on_time_rate != null);
  const paidTotal = withHistory.reduce((s, c) => s + c.paid, 0);
  const weightedOnTime = paidTotal > 0
    ? r2(withHistory.reduce((s, c) => s + (c.on_time_rate || 0) * c.paid, 0) / paidTotal)
    : null;
  const dtpVals = scored.filter((s) => s.avg_days_to_pay != null);
  const avgDtp = dtpVals.length ? r2(dtpVals.reduce((s, c) => s + c.avg_days_to_pay, 0) / dtpVals.length) : null;
  const outstanding = r2(scored.reduce((s, c) => s + c.outstanding, 0));
  const overdue = r2(scored.reduce((s, c) => s + c.overdue_amount, 0));
  const atRisk = scored.filter((s) => s.overdue_amount > 0).length;
  return {
    customers: scored.length,
    weighted_on_time_rate: weightedOnTime,
    avg_days_to_pay: avgDtp,
    total_outstanding: outstanding,
    total_overdue: overdue,
    at_risk_customers: atRisk,
    overdue_ratio: outstanding > 0 ? r2(overdue / outstanding) : 0,
  };
}

module.exports = { customerScores, receivablesQuality, scoreRow, gradeOf };
