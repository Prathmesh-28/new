// Overdue-invoice reminder job - the scheduled side of the automation engine.
// Runs daily: finds invoices that are past due and still unpaid, and raises an
// in-app alert (which the dashboard/Alerts page + WhatsApp digest surface) so the
// owner is actually nudged to collect. Idempotent: re-raises at most once / 7 days
// per invoice, so it never spams. Deliberately creates only NOTIFICATIONS - it does
// not post any financial entry (late fees stay a manual, reviewed action).
const { pool } = require("../db");
const { q } = require("./tenantDb");

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
      } catch (e) {
        console.error("[reminders] insert failed for", inv.id, e.message);
      }
    }
  }
  return created;
}

module.exports = { runOverdueReminders };
