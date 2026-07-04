"use strict";
// Recurring-invoice generation — the scheduled side of the invoice engine. Runs daily from the
// books cron: for every active schedule whose next_run has arrived, generate ONE real invoice
// (same factory as POST /api/invoices), advance next_run past today (missed periods are
// SKIPPED and logged, never back-billed as a surprise catch-up), and optionally auto-send.
//
// invoice_recurring and invoices are FORCE-RLS: enumerate tenants from users (non-RLS), then
// work PER TENANT under its GUC — the sanctioned cron pattern (see lib/reminders.js).
// Idempotency: the schedule row is locked FOR UPDATE and next_run is re-checked under the
// lock, so overlapping cron runs can't double-generate.
const { pool } = require("../db");
const { q, withTenant } = require("./tenantDb");
const { createInvoiceTx } = require("./invoiceCreate");
const { advancePastToday } = require("./recurringDates");
const { sendMail } = require("./email");

const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// Generate for ONE schedule (already validated as due by the caller). Runs the whole
// create+advance atomically; returns the new invoice row or null if it lost the re-check.
async function generateForSchedule(tenantId, scheduleId, { force = false } = {}) {
  const out = await withTenant(tenantId, async (client) => {
    const { rows: [s] } = await client.query(
      "SELECT * FROM invoice_recurring WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [scheduleId, tenantId]);
    if (!s || !s.active) return null;
    const today = todayISO();
    if (!force && String(s.next_run).slice(0, 10) > today) return null; // lost the re-check → another run got it

    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) return null;
    const autoSend = !!(s.auto_send && s.customer_email);
    const inv = await createInvoiceTx(client, tenantId, {
      customer_name: s.customer_name, customer_gstin: s.customer_gstin,
      customer_email: s.customer_email, customer_phone: s.customer_phone,
      gst_rate: Number(s.gst_rate) || 18, due_date: plusDaysISO(Number(s.due_in_days) || 15),
      items, status: autoSend ? "sent" : "draft",
    });
    const { next, skipped } = advancePastToday(String(s.next_run).slice(0, 10), today, s.cadence, s.day_of_month);
    if (skipped > 0) console.warn(`[recurring-invoices] schedule ${s.id}: skipped ${skipped} missed period(s) (never back-billing) — next run ${next}`);
    await client.query(
      "UPDATE invoice_recurring SET last_run=$1, next_run=$2, last_invoice_id=$3 WHERE id=$4 AND tenant_id=$5",
      [today, next, inv.id, s.id, tenantId]);
    return { inv, schedule: s, autoSend };
  });
  if (!out) return null;

  // Post-commit side effects — identical to the manual paths, all best-effort.
  const { inv, autoSend } = out;
  require("../modules/flows/runner").emitEvent(tenantId, "invoice.created", { invoice: inv, recurring: true }).catch(() => {});
  if (autoSend) {
    require("./invoiceGl").postInvoiceSale(tenantId, inv).catch(() => {}); // accrual on issue, same as /send
    require("../modules/flows/runner").emitEvent(tenantId, "invoice.sent", { invoice: inv, recurring: true }).catch(() => {});
    sendMail({
      to: inv.customer_email,
      subject: `Invoice ${inv.invoice_number} - ₹${Number(inv.total_amount).toLocaleString("en-IN")}`,
      html: `<p>Dear ${inv.customer_name},</p><p>Please find your invoice <strong>${inv.invoice_number}</strong> for <strong>₹${Number(inv.total_amount).toLocaleString("en-IN")}</strong>.</p><p>Due date: <strong>${inv.due_date || "On receipt"}</strong></p><p>Thank you for your business.</p>`,
    }).catch(() => {});
  }
  return inv;
}

// The daily cron entry point. Returns how many invoices were generated.
async function runDueRecurringInvoices() {
  const { rows: tenants } = await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL");
  let generated = 0;
  for (const { tenant_id: tenantId } of tenants) {
    let due = [];
    try {
      ({ rows: due } = await q(tenantId,
        "SELECT id FROM invoice_recurring WHERE tenant_id=$1 AND active=true AND next_run <= CURRENT_DATE ORDER BY next_run LIMIT 200",
        [tenantId]));
    } catch (e) {
      // Table may predate this feature on a not-yet-migrated DB; anything else is real.
      if (!/invoice_recurring.*does not exist/i.test(e.message)) console.error("[recurring-invoices] scan failed for", tenantId, e.message);
      continue;
    }
    for (const { id } of due) {
      try {
        const inv = await generateForSchedule(tenantId, id);
        if (inv) { generated++; console.log(`[recurring-invoices] generated ${inv.invoice_number} (tenant ${tenantId})`); }
      } catch (e) { console.error("[recurring-invoices] generate failed for schedule", id, e.message); }
    }
  }
  return generated;
}

module.exports = { runDueRecurringInvoices, generateForSchedule };
