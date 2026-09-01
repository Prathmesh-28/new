"use strict";
// ── The Reports home (Wave 12) ───────────────────────────────────────────────
// Reports were scattered across 72 pages with no front door, nothing schedulable and no
// way to send one to yourself. The catalog is server-side so the page and the mailer can
// never disagree about what exists.
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { q } = require("../lib/tenantDb");
const { sendReport, REPORTS } = require("../lib/reportMailer");

const CATALOG = [
  // Subscribable (composed by lib/reportMailer from live SQL)
  { key: "business_summary", title: "Business summary", group: "Email me", desc: "Receivables, overdue, and 30-day cash in/out.", schedulable: true },
  { key: "receivables",      title: "Who owes you the most", group: "Email me", desc: "Top 10 customers by outstanding balance.", schedulable: true },
  { key: "cashflow",         title: "Cash by week", group: "Email me", desc: "Inflow and outflow, week by week, last 8 weeks.", schedulable: true },
  // In-app destinations that already exist — the front door they never had
  { key: "statements",  title: "P&L, balance sheet & cash flow", group: "Statements", path: "/statements", desc: "The financial statements, from the ledger." },
  { key: "trial_balance", title: "Trial balance & GL reports", group: "Statements", path: "/books?tab=reports", desc: "Ledger-level reporting from Books." },
  { key: "gst",         title: "GST returns", group: "Compliance", path: "/gst?tab=returns", desc: "GSTR-1, 3B, 9 preparation." },
  { key: "tds",         title: "TDS & direct tax", group: "Compliance", path: "/tax", desc: "TDS registers and advance tax." },
  { key: "aging",       title: "Receivables ageing", group: "Money", path: "/receivables", desc: "Ageing buckets and the collections pipeline." },
  { key: "spend",       title: "Spend & budgets", group: "Money", path: "/spend", desc: "Where the money goes, against budget." },
  { key: "analytics",   title: "Trends & analytics", group: "Money", path: "/analytics", desc: "Revenue, margins, benchmarks." },
  { key: "payroll",     title: "Payroll registers", group: "People", path: "/payroll?tab=reports", desc: "Salary registers, PF/ESI, Form 16." },
];

router.get("/catalog", authenticate, (_req, res) => res.json(CATALOG));

router.get("/schedules", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      "SELECT * FROM report_schedules WHERE tenant_id=$1 AND user_id=$2 ORDER BY report_key",
      [req.user.tenant_id, req.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put("/schedules/:reportKey", authenticate, async (req, res, next) => {
  const key = String(req.params.reportKey);
  if (!REPORTS[key]) return res.status(400).json({ error: "That report can't be scheduled" });
  const cadence = req.body?.cadence === "weekly" ? "weekly" : "daily";
  const hour = Math.min(23, Math.max(0, parseInt(req.body?.sendHour, 10) || 8));
  try {
    const { rows } = await q(req.user.tenant_id,
      `INSERT INTO report_schedules(tenant_id, user_id, report_key, cadence, send_hour)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, user_id, report_key) DO UPDATE SET cadence=EXCLUDED.cadence, send_hour=EXCLUDED.send_hour
       RETURNING *`,
      [req.user.tenant_id, req.user.id, key, cadence, hour]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete("/schedules/:reportKey", authenticate, async (req, res, next) => {
  try {
    const { rowCount } = await q(req.user.tenant_id,
      "DELETE FROM report_schedules WHERE tenant_id=$1 AND user_id=$2 AND report_key=$3",
      [req.user.tenant_id, req.user.id, String(req.params.reportKey)]);
    if (!rowCount) return res.status(404).json({ error: "You weren't subscribed to that" });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Prove delivery instead of promising it: sends THIS report to the caller right now and
// says whether the email actually left (SMTP may be unconfigured).
router.post("/send-now/:reportKey", authenticate, async (req, res, next) => {
  try {
    const out = await sendReport(req.user.tenant_id, String(req.params.reportKey), req.user.email);
    res.json({ delivered: out.delivered, preview: out.report });
  } catch (e) {
    if (/Unknown report/.test(e.message)) return res.status(400).json({ error: e.message });
    next(e);
  }
});


// ── GET /api/reports/compare — this month against last, with the WHY (Wave 17) ─
// Every report in the product showed one period in isolation; "are we up or down, and
// because of whom?" required two exports and a spreadsheet. Revenue is by invoice_date
// (the document date Wave 4 added), cash by transaction_date, drafts excluded — a draft
// is not revenue.
router.get("/compare", authenticate, async (req, res, next) => {
  try {
    const t = req.user.tenant_id;
    const { pool } = require("../db");
    const { rows: [r] } = await pool.query(`
      WITH cur AS (SELECT date_trunc('month', CURRENT_DATE)::date AS s),
      inv AS (
        SELECT date_trunc('month', invoice_date::timestamp)::date AS m,
               SUM(total_amount) AS revenue, COUNT(*) AS n
          FROM invoices
         WHERE tenant_id=$1 AND status NOT IN ('draft','cancelled') AND voided_at IS NULL
           AND invoice_date >= (SELECT s FROM cur) - interval '1 month'
         GROUP BY 1),
      cash AS (
        SELECT date_trunc('month', transaction_date::timestamp)::date AS m,
               COALESCE(SUM(amount) FILTER (WHERE amount > 0),0) AS inflow,
               COALESCE(-SUM(amount) FILTER (WHERE amount < 0),0) AS outflow
          FROM transactions
         WHERE tenant_id=$1 AND transaction_date >= (SELECT s FROM cur) - interval '1 month'
         GROUP BY 1)
      SELECT
        (SELECT s FROM cur) AS cur_month,
        (SELECT revenue FROM inv WHERE m = (SELECT s FROM cur)) AS rev_cur,
        (SELECT revenue FROM inv WHERE m = (SELECT s FROM cur) - interval '1 month') AS rev_prev,
        (SELECT n FROM inv WHERE m = (SELECT s FROM cur)) AS n_cur,
        (SELECT n FROM inv WHERE m = (SELECT s FROM cur) - interval '1 month') AS n_prev,
        (SELECT inflow FROM cash WHERE m = (SELECT s FROM cur)) AS in_cur,
        (SELECT inflow FROM cash WHERE m = (SELECT s FROM cur) - interval '1 month') AS in_prev,
        (SELECT outflow FROM cash WHERE m = (SELECT s FROM cur)) AS out_cur,
        (SELECT outflow FROM cash WHERE m = (SELECT s FROM cur) - interval '1 month') AS out_prev
    `, [t]);

    // The variance explainer: which customers moved the revenue number, either way.
    const { rows: drivers } = await pool.query(`
      SELECT COALESCE(NULLIF(btrim(customer_name), ''), '(unnamed)') AS customer,
             COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE)),0) AS cur,
             COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE) - interval '1 month'),0) AS prev
        FROM invoices
       WHERE tenant_id=$1 AND status NOT IN ('draft','cancelled') AND voided_at IS NULL
         AND invoice_date >= (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
       GROUP BY 1
       HAVING ABS(COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE)),0)
                - COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE) - interval '1 month'),0)) > 0.005
       ORDER BY ABS(COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE)),0)
                  - COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('month', invoice_date::timestamp) = date_trunc('month', CURRENT_DATE) - interval '1 month'),0)) DESC
       LIMIT 8`, [t]);

    const row = (label, cur, prev, link) => {
      const c = Number(cur) || 0, p = Number(prev) || 0;
      return { label, current: c, previous: p, delta: Math.round((c - p) * 100) / 100,
               pct: p !== 0 ? Math.round(((c - p) / Math.abs(p)) * 1000) / 10 : null, link };
    };
    res.json({
      // Comparing a part-month against a whole month without saying so is how dashboards
      // lie; the caller is told exactly what the current period covers.
      note: `Current period is ${String(r.cur_month).slice(0, 7)} to date — not a full month yet.`,
      rows: [
        row("Invoiced (excl. drafts)", r.rev_cur, r.rev_prev, "/invoices"),
        row("Invoices raised", r.n_cur, r.n_prev, "/invoices"),
        row("Cash in", r.in_cur, r.in_prev, "/transactions?direction=in"),
        row("Cash out", r.out_cur, r.out_prev, "/transactions?direction=out"),
      ],
      drivers: drivers.map((d) => ({
        customer: d.customer, current: Number(d.cur), previous: Number(d.prev),
        delta: Math.round((Number(d.cur) - Number(d.prev)) * 100) / 100,
      })),
    });
  } catch (e) { next(e); }
});

// ── GET /api/reports/consolidated — every firm you belong to, one view (Wave 17)
// The multi-firm switcher (#197) let one login act across firms, but numbers stayed
// siloed: seeing the group meant switching N times and remembering. Membership is
// verified per firm HERE — never trusted from the client.
router.get("/consolidated", authenticate, async (req, res, next) => {
  try {
    const { pool } = require("../db");
    const { rows: firms } = await pool.query(`
      SELECT DISTINCT tenant_id FROM (
        SELECT tenant_id FROM users WHERE id=$1
        UNION
        SELECT tenant_id FROM tenant_memberships WHERE user_id=$1 AND status='active'
      ) f`, [req.user.id]);

    const out = [];
    for (const f of firms) {
      const { rows: [prof] } = await pool.query(
        "SELECT company_name FROM tenant_profile WHERE tenant_id=$1", [f.tenant_id]).catch(() => ({ rows: [{}] }));
      const { rows: [m] } = await pool.query(`
        WITH o AS (SELECT status, due_date, GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0),0) AS out
                     FROM invoices WHERE tenant_id=$1)
        SELECT COALESCE(SUM(out) FILTER (WHERE status NOT IN ('paid','cancelled','draft')),0) AS receivables,
               COALESCE(SUM(out) FILTER (WHERE status NOT IN ('paid','cancelled','draft') AND due_date < CURRENT_DATE),0) AS overdue
          FROM o`, [f.tenant_id]);
      const { rows: [c] } = await pool.query(`
        SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0),0) AS inflow,
               COALESCE(-SUM(amount) FILTER (WHERE amount < 0),0) AS outflow
          FROM transactions WHERE tenant_id=$1 AND transaction_date >= CURRENT_DATE - 30`, [f.tenant_id]);
      out.push({
        tenant_id: f.tenant_id,
        name: prof?.company_name || f.tenant_id,
        receivables: Number(m.receivables), overdue: Number(m.overdue),
        cash_in_30d: Number(c.inflow), cash_out_30d: Number(c.outflow),
      });
    }
    const sum = (k) => Math.round(out.reduce((s, x) => s + x[k], 0) * 100) / 100;
    res.json({
      firms: out,
      group: { receivables: sum("receivables"), overdue: sum("overdue"), cash_in_30d: sum("cash_in_30d"), cash_out_30d: sum("cash_out_30d") },
      note: out.length === 1 ? "You belong to one firm — the group view grows as you're added to more." : undefined,
    });
  } catch (e) { next(e); }
});

module.exports = router;
