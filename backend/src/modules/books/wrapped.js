"use strict";
// Business Wrapped (#199) — a "year in review" computed entirely from the ledger: revenue &
// growth, best month, top customer, invoices raised, GST collected, collection punctuality, and
// a couple of fun superlatives. Read-only, no external data. Shareable as a screenshot/page.
const { pool } = require("../../db");
const reports = require("./reports");

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fyOf(dateOrFy) {
  if (dateOrFy && /^\d{4}-\d{2}$/.test(dateOrFy)) return dateOrFy; // already an FY
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function businessWrapped(tenantId, { fy } = {}) {
  const useFy = fyOf(fy);
  const startY = Number(useFy.slice(0, 4));
  const from = `${startY}-04-01`, to = `${startY + 1}-03-31`;
  const priorFy = `${startY - 1}-${String(startY % 100).padStart(2, "0")}`;

  const [pl, plPrior] = await Promise.all([
    reports.profitLoss(tenantId, useFy).catch(() => ({ totalIncome: 0, netProfit: 0 })),
    reports.profitLoss(tenantId, priorFy).catch(() => ({ totalIncome: 0 })),
  ]);
  const revenue = n(pl.totalIncome), netProfit = n(pl.netProfit), priorRevenue = n(plPrior.totalIncome);
  const growthPct = priorRevenue > 0 ? r2(((revenue - priorRevenue) / priorRevenue) * 100) : null;

  // SALES per month + per customer + count, in one pass.
  const { rows: sales } = await pool.query(
    `SELECT v.id, v.voucher_date, COALESCE(pl.name,'(walk-in)') AS party,
            COALESCE((SELECT SUM(e.credit)-SUM(e.debit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS amt
       FROM book_vouchers v LEFT JOIN book_ledgers pl ON pl.id=v.party_ledger_id
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3`,
    [tenantId, from, to]).catch(() => ({ rows: [] }));
  const byMonth = new Array(12).fill(0);   // index 0=Apr … 11=Mar
  const byParty = new Map();
  let biggest = { party: null, amount: 0 };
  for (const s of sales) {
    const amt = Math.abs(n(s.amt));
    const m = new Date(s.voucher_date).getMonth();          // 0=Jan
    byMonth[(m + 9) % 12] += amt;                            // shift so Apr→0
    byParty.set(s.party, r2((byParty.get(s.party) || 0) + amt));
    if (amt > biggest.amount) biggest = { party: s.party, amount: r2(amt) };
  }
  const bestIdx = byMonth.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  const bestMonthLabel = MONTHS[(bestIdx + 3) % 12];        // 0→Apr
  const topCustomer = [...byParty.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  // GST collected (output tax) in the FY.
  const { rows: gst } = await pool.query(
    `SELECT COALESCE(SUM(te.tax_amount),0) AS collected
       FROM book_tax_entries te JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=false AND v.voucher_date BETWEEN $2 AND $3`,
    [tenantId, from, to]).catch(() => ({ rows: [{ collected: 0 }] }));

  // Collection punctuality from the receivables-quality signal (reused).
  let onTimePct = null;
  try { const q = await require("../../lib/customerScore").receivablesQuality(tenantId); onTimePct = q.on_time_rate != null ? Math.round(q.on_time_rate) : (q.onTimeRate != null ? Math.round(q.onTimeRate) : null); } catch { /* optional */ }

  return {
    fy: useFy,
    revenue: r2(revenue), net_profit: r2(netProfit), prior_revenue: r2(priorRevenue), growth_pct: growthPct,
    invoices_raised: sales.length,
    best_month: { month: bestMonthLabel, revenue: r2(byMonth[bestIdx]) },
    top_customer: topCustomer ? { name: topCustomer[0], revenue: topCustomer[1] } : null,
    biggest_invoice: biggest.party ? biggest : null,
    unique_customers: byParty.size,
    gst_collected: r2(n(gst[0].collected)),
    collection_on_time_pct: onTimePct,
    monthly_revenue: byMonth.map((v, i) => ({ month: MONTHS[(i + 3) % 12], revenue: r2(v) })),
    note: "Your year, computed from your own books.",
  };
}

module.exports = { businessWrapped };
