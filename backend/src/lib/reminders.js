// Overdue-invoice reminder job - the scheduled side of the automation engine.
// Runs daily: finds invoices that are past due and still unpaid, and raises an
// in-app alert (which the dashboard/Alerts page + WhatsApp digest surface) so the
// owner is actually nudged to collect. Idempotent: re-raises at most once / 7 days
// per invoice, so it never spams. Deliberately creates only NOTIFICATIONS - it does
// not post any financial entry (late fees stay a manual, reviewed action).
const { pool } = require("../db");
const { q } = require("./tenantDb");

// High-severity alerts also email the tenant's owner(s) — sendAlertEmail existed but was
// never called from anywhere (2026-07 gap audit, B11). Best-effort: a mail failure must
// never break alert creation; gated only by the SMTP_* env already used for OTP/welcome mail.
async function notifyOwnersByEmail(tenantId, { title, message, severity }) {
  if (severity !== "high" && severity !== "critical") return;
  try {
    const { rows: owners } = await pool.query(
      "SELECT email, display_name FROM users WHERE tenant_id=$1 AND role='owner'", [tenantId]);
    const { sendAlertEmail } = require("./email");
    for (const o of owners) await sendAlertEmail({ to: o.email, title, message, severity }).catch(() => {});
  } catch (e) { console.error("[reminders] owner alert email failed for", tenantId, e.message); }
}

async function runOverdueReminders() {
  // invoices is FORCE-RLS (0015): a single cross-tenant scan returns 0 rows under RLS. So
  // enumerate tenants from a non-RLS source (users — every tenant has ≥1) and scan + alert
  // PER TENANT under its GUC. Keeps the once-per-7-days idempotency, now tenant-scoped.
  const { rows: tenants } = await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL");
  let created = 0;
  for (const { tenant_id: tenantId } of tenants) {
    let overdue = [];
    try {
      ({ rows: overdue } = await q(tenantId, `
        SELECT i.id, i.tenant_id, i.invoice_number, i.customer_name, i.total_amount, i.due_date
        FROM invoices i
        WHERE i.tenant_id = $1
          AND i.due_date < CURRENT_DATE
          AND i.status NOT IN ('paid', 'cancelled', 'draft')
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
            WHERE a.tenant_id = i.tenant_id
              AND a.rule_id = 'invoice.overdue'
              AND a.meta->>'invoice_id' = i.id::text
              AND a.created_at > now() - interval '7 days'
          )
        ORDER BY i.due_date
        LIMIT 1000`, [tenantId]));
    } catch (e) { console.error("[reminders] scan failed for tenant", tenantId, e.message); continue; }

    for (const inv of overdue) {
      const days = Math.max(1, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000));
      const severity = days > 30 ? "high" : "medium";
      const amount = Number(inv.total_amount || 0).toLocaleString("en-IN");
      try {
        await q(tenantId,
          `INSERT INTO alerts (tenant_id, rule_id, severity, title, message, meta)
           VALUES ($1, 'invoice.overdue', $2, $3, $4, $5)`,
          [
            tenantId,
            severity,
            `Invoice ${inv.invoice_number} is overdue`,
            `${inv.customer_name} - ₹${amount} is ${days} day${days === 1 ? "" : "s"} overdue. Send a reminder or chase the payment.`,
            JSON.stringify({ invoice_id: inv.id, days_overdue: days, amount: Number(inv.total_amount || 0) }),
          ]
        );
        created++;
        require("../modules/flows/runner").emitEvent(tenantId, "invoice.overdue", { invoice: inv, days_overdue: days }).catch(() => {});
        const title = `Invoice ${inv.invoice_number} is overdue`;
        const message = `${inv.customer_name} - ₹${amount} is ${days} day${days === 1 ? "" : "s"} overdue. Send a reminder or chase the payment.`;
        notifyOwnersByEmail(tenantId, { title, message, severity }).catch(() => {});
      } catch (e) {
        console.error("[reminders] insert failed for", inv.id, e.message);
      }
    }
  }
  return created;
}

// Expiry/renewal reminders (#178/#183): scans book_expiry_items (licenses, DSCs, AMCs,
// registrations, insurance) and raises an in-app alert as each nears/passes its expiry, within
// its own reminder window. DSC items ('dsc' kind) get a distinct rule so the UI can style them.
// Idempotent: at most one alert per item per 7 days. book_expiry_items is a non-RLS book_ table
// (explicit tenant filter); alerts are written via q(tenantId) like runOverdueReminders.
async function runExpiryReminders() {
  const { rows: tenants } = await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL");
  let created = 0;
  for (const { tenant_id: tenantId } of tenants) {
    let due = [];
    try {
      ({ rows: due } = await pool.query(`
        SELECT id, kind, name, identifier, expires_on, reminder_days
        FROM book_expiry_items
        WHERE tenant_id = $1 AND status = 'active'
          AND expires_on <= CURRENT_DATE + ((COALESCE(reminder_days,30))::text || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM alerts a
            WHERE a.tenant_id = $1 AND a.rule_id IN ('expiry.due','dsc.expiring')
              AND a.meta->>'expiry_id' = id::text AND a.created_at > now() - interval '7 days')
        ORDER BY expires_on LIMIT 1000`, [tenantId]));
    } catch (e) { console.error("[reminders] expiry scan failed for tenant", tenantId, e.message); continue; }

    for (const it of due) {
      const days = Math.ceil((new Date(it.expires_on).getTime() - Date.now()) / 86400000);
      const severity = days <= 7 ? "high" : "medium";
      const isDsc = it.kind === "dsc";
      const when = days < 0 ? `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` : `expires in ${days} day${days === 1 ? "" : "s"}`;
      try {
        await q(tenantId,
          `INSERT INTO alerts (tenant_id, rule_id, severity, title, message, meta) VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, isDsc ? "dsc.expiring" : "expiry.due", severity,
            `${isDsc ? "DSC" : (it.kind || "Item")} ${it.name} ${days < 0 ? "expired" : "expiring"}`,
            `${it.name}${it.identifier ? ` (${it.identifier})` : ""} ${when}. Renew it to stay compliant.`,
            JSON.stringify({ expiry_id: it.id, kind: it.kind, days_to_expiry: days })]);
        created++;
        require("../modules/flows/runner").emitEvent(tenantId, isDsc ? "dsc.expiring" : "expiry.due", { item: it, days_to_expiry: days }).catch(() => {});
        const title = `${isDsc ? "DSC" : (it.kind || "Item")} ${it.name} ${days < 0 ? "expired" : "expiring"}`;
        const message = `${it.name}${it.identifier ? ` (${it.identifier})` : ""} ${when}. Renew it to stay compliant.`;
        notifyOwnersByEmail(tenantId, { title, message, severity }).catch(() => {});
      } catch (e) { console.error("[reminders] expiry alert insert failed for", it.id, e.message); }
    }
  }
  return created;
}

module.exports = { runOverdueReminders, runExpiryReminders };
