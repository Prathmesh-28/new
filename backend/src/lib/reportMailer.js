"use strict";
// ── Scheduled report emails (Wave 12) ────────────────────────────────────────
// Composes and sends the three subscribable reports from live SQL — the same definitions
// the in-app pages use (outstanding = total − received − credited, floored at zero; drafts
// disclosed separately, since a draft is not a claim on anyone).
const { pool } = require("../db");
const { sendMail } = require("./email");

const fmt = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function businessSummary(tenantId) {
  const inv = (await pool.query(`
    WITH o AS (SELECT status, due_date, GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0),0) AS out
                 FROM invoices WHERE tenant_id=$1)
    SELECT COALESCE(sum(out) FILTER (WHERE status NOT IN ('paid','cancelled')),0)                        AS pending,
           COALESCE(sum(out) FILTER (WHERE status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE),0) AS overdue,
           COALESCE(sum(out) FILTER (WHERE status = 'draft'),0)                                          AS draft
      FROM o`, [tenantId])).rows[0];
  const cash = (await pool.query(`
    SELECT COALESCE(sum(amount) FILTER (WHERE amount > 0),0) AS inflow,
           COALESCE(-sum(amount) FILTER (WHERE amount < 0),0) AS outflow
      FROM transactions WHERE tenant_id=$1 AND transaction_date >= CURRENT_DATE - 30`, [tenantId])).rows[0];
  return { title: "Your business summary", rows: [
    ["Receivables outstanding", fmt(inv.pending)],
    ["…of which overdue", fmt(inv.overdue)],
    ["…still in draft (not yet sent)", fmt(inv.draft)],
    ["Cash in, last 30 days", fmt(cash.inflow)],
    ["Cash out, last 30 days", fmt(cash.outflow)],
  ]};
}

async function receivables(tenantId) {
  const { rows } = await pool.query(`
    SELECT customer_name, sum(GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0),0)) AS due
      FROM invoices WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled','draft')
     GROUP BY customer_name HAVING sum(GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0),0)) > 0
     ORDER BY due DESC LIMIT 10`, [tenantId]);
  return { title: "Who owes you the most", rows: rows.map((r) => [r.customer_name, fmt(r.due)]) };
}

async function cashflow(tenantId) {
  const { rows } = await pool.query(`
    SELECT to_char(date_trunc('week', transaction_date), 'DD Mon') AS wk,
           COALESCE(sum(amount) FILTER (WHERE amount > 0),0) AS inflow,
           COALESCE(-sum(amount) FILTER (WHERE amount < 0),0) AS outflow
      FROM transactions WHERE tenant_id=$1 AND transaction_date >= CURRENT_DATE - 56
     GROUP BY 1 ORDER BY min(transaction_date)`, [tenantId]);
  return { title: "Cash by week, last 8 weeks", rows: rows.map((r) => [`Week of ${r.wk}`, `${fmt(r.inflow)} in · ${fmt(r.outflow)} out`]) };
}

const REPORTS = { business_summary: businessSummary, receivables, cashflow };

async function sendReport(tenantId, reportKey, toEmail) {
  const build = REPORTS[reportKey];
  if (!build) throw new Error(`Unknown report "${reportKey}"`);
  const r = await build(tenantId);
  const table = r.rows.length
    ? `<table style="border-collapse:collapse">${r.rows.map(([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#555">${k}</td><td style="padding:4px 0;font-weight:600;text-align:right">${v}</td></tr>`).join("")}</table>`
    : "<p>Nothing to report yet.</p>";
  // sendMail is a silent no-op when SMTP isn't configured (it logs and returns undefined),
  // so "delivered" must be decided by configuration, not by the call not throwing —
  // otherwise this endpoint would claim delivery on a deployment that cannot send email.
  const configured = !!process.env.SMTP_USER;
  await sendMail({
    to: toEmail,
    subject: `${r.title} — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`,
    html: `<h3>${r.title}</h3>${table}
           <p style="color:#888;font-size:12px;margin-top:16px">Scheduled from Headroom → Reports. Unsubscribe there any time.</p>`,
  });
  return { delivered: configured, report: r };
}

// Hourly cron: send every schedule whose local hour has arrived and hasn't gone today
// (this week, for weekly). Crosses tenants, so plain pool.query with explicit scoping.
async function runDueSchedules() {
  const hourIST = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const dowIST = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  const { rows } = await pool.query(`
    SELECT s.*, u.email FROM report_schedules s JOIN users u ON u.id = s.user_id
     WHERE s.send_hour = $1
       AND (s.last_sent_at IS NULL OR s.last_sent_at < (now() AT TIME ZONE 'Asia/Kolkata')::date)
       AND (s.cadence = 'daily' OR (s.cadence = 'weekly' AND $2 = 'Mon'))`, [hourIST, dowIST]);
  let sent = 0;
  for (const s of rows) {
    try {
      await sendReport(s.tenant_id, s.report_key, s.email);
      await pool.query("UPDATE report_schedules SET last_sent_at=now() WHERE id=$1", [s.id]);
      sent++;
    } catch (e) { console.warn("[reports] schedule failed", s.id, e.message); }
  }
  return sent;
}

module.exports = { sendReport, runDueSchedules, REPORTS };
