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

module.exports = router;
