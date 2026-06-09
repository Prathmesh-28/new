const { pool }           = require("../db");
const { sendMail }       = require("./email");
const { sendWhatsApp }   = require("./whatsapp");
const { generateCFOBrief } = require("./cfo_brief");

function monthlyBurn(transactions) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split("T")[0];
  const expenses = transactions.filter(t => t.amount < 0 && t.date >= cutoff);
  if (!expenses.length) return 0;
  return Math.abs(expenses.reduce((s, t) => s + t.amount, 0)) / 3;
}

function runwayDays(balances, burn) {
  const total = balances.reduce((s, b) => s + b, 0);
  return burn > 0 ? Math.floor((total / burn) * 30) : 999;
}

function fmt(n) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

async function sendDailyDigest() {
  // Get all owner emails and their tenant IDs
  const { rows: owners } = await pool.query(
    "SELECT id, email, tenant_id FROM users WHERE role = 'owner'"
  );

  for (const owner of owners) {
    try {
      // Fetch their KV store for the 'app' namespace
      const { rows: kvRows } = await pool.query(
        "SELECT value FROM kv_store WHERE tenant_id = $1 AND namespace = 'app' AND key = 'store' LIMIT 1",
        [owner.tenant_id]
      );

      const kv = kvRows[0]?.value?.value ?? {};
      const bankAccounts  = kv.bankAccounts  ?? [];
      const transactions  = kv.transactions  ?? [];
      const alerts        = kv.alerts        ?? [];
      const invoices      = kv.invoices      ?? [];

      if (!bankAccounts.length) continue; // Skip users with no data

      const totalCash = bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
      const burn      = monthlyBurn(transactions);
      const runway    = runwayDays(bankAccounts.map(a => a.balance ?? 0), burn);

      // Invoices due this week
      const today = new Date();
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
      const todayStr    = today.toISOString().split("T")[0];
      const weekEndStr  = weekEnd.toISOString().split("T")[0];
      const dueSoon = invoices.filter(inv =>
        inv.status !== "paid" && inv.dueDate >= todayStr && inv.dueDate <= weekEndStr
      );
      const overdueInvoices = invoices.filter(inv =>
        inv.status !== "paid" && inv.dueDate < todayStr
      );

      const unreadAlerts = alerts.filter(a => !a.isRead);
      const criticalAlerts = unreadAlerts.filter(a => a.severity === "critical" || a.severity === "high");

      const runwayColor = runway < 30 ? "#ef4444" : runway < 90 ? "#eab308" : "#22c55e";

      // Build email rows
      const rows = [
        { label: "Cash balance", value: fmt(totalCash),      color: "#C9A227" },
        { label: "Monthly burn",  value: fmt(burn),           color: "#9a9a70" },
        { label: "Cash runway",   value: `${runway} days`,    color: runwayColor },
      ];

      const rowsHtml = rows.map(r => `
        <tr>
          <td style="padding:10px 20px;border-bottom:1px solid #1a1a10;font-size:13px;color:#9a9a70;font-family:system-ui,sans-serif">${r.label}</td>
          <td style="padding:10px 20px;border-bottom:1px solid #1a1a10;font-size:14px;font-weight:700;color:${r.color};font-family:monospace;text-align:right">${r.value}</td>
        </tr>
      `).join("");

      let alertsSection = "";
      if (criticalAlerts.length > 0) {
        alertsSection = `
          <tr><td style="padding:16px 32px 0">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#f97316;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px">
              ${criticalAlerts.length} Action Required
            </p>
            ${criticalAlerts.slice(0, 3).map(a => `
              <p style="margin:0 0 6px;font-size:13px;color:#9a9a70;font-family:system-ui,sans-serif">
                ⚠ <strong style="color:#ffffff">${a.title}</strong>
              </p>
            `).join("")}
          </td></tr>
        `;
      } else {
        alertsSection = `
          <tr><td style="padding:16px 32px 0">
            <p style="margin:0;font-size:13px;color:#22c55e;font-family:system-ui,sans-serif">
              ✓ No critical alerts — your cash flow looks healthy today.
            </p>
          </td></tr>
        `;
      }

      let invoicesSection = "";
      if (dueSoon.length > 0 || overdueInvoices.length > 0) {
        const overdueAmt = overdueInvoices.reduce((s, i) => s + i.amount, 0);
        const dueAmt     = dueSoon.reduce((s, i) => s + i.amount, 0);
        invoicesSection = `
          <tr><td style="padding:12px 32px 0">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9a9a70;font-family:system-ui,sans-serif;text-transform:uppercase;letter-spacing:1px">Receivables</p>
            ${overdueInvoices.length > 0 ? `<p style="margin:0 0 4px;font-size:13px;color:#ef4444;font-family:system-ui,sans-serif">⚠ ${overdueInvoices.length} overdue (${fmt(overdueAmt)})</p>` : ""}
            ${dueSoon.length > 0 ? `<p style="margin:0;font-size:13px;color:#eab308;font-family:system-ui,sans-serif">📅 ${dueSoon.length} due this week (${fmt(dueAmt)})</p>` : ""}
          </td></tr>
        `;
      }

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d09;padding:32px 0">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#16160f;border:1px solid #2a2a1a;border-radius:12px;overflow:hidden">
              <tr><td style="padding:24px 32px;border-bottom:1px solid #2a2a1a">
                <span style="font-size:20px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">
                  Head<span style="color:#C9A227">room</span>
                </span>
                <span style="margin-left:12px;font-size:12px;color:#5a5a40;font-family:system-ui,sans-serif">Morning Digest</span>
              </td></tr>
              <tr><td style="padding:24px 32px 12px">
                <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">
                  Good morning — here's your cash snapshot
                </p>
                <p style="margin:6px 0 0;font-size:13px;color:#5a5a40;font-family:system-ui,sans-serif">
                  ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              </td></tr>
              <tr><td style="padding:0 32px">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d09;border:1px solid #2a2a1a;border-radius:8px">
                  ${rowsHtml}
                </table>
              </td></tr>
              ${alertsSection}
              ${invoicesSection}
              <tr><td style="padding:24px 32px 32px">
                <a href="${process.env.FRONTEND_URL || "https://headroom-pi.vercel.app"}/dashboard"
                  style="display:inline-block;background:#C9A227;color:#0d0d09;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">
                  Open Dashboard →
                </a>
              </td></tr>
              <tr><td style="padding:20px 32px;border-top:1px solid #2a2a1a;text-align:center">
                <p style="margin:0;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif">
                  Headroom — Cash flow intelligence for Indian SMBs<br>
                  This digest is sent at 7:00 AM IST every day.
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`;

      await sendMail({ to: owner.email, subject: `Your morning cash snapshot — ${fmt(totalCash)}, ${runway} days runway`, html });

      // WhatsApp digest — send if user has a bound number
      const { rows: waRows } = await pool.query(
        "SELECT phone FROM whatsapp_bindings WHERE tenant_id=$1 LIMIT 1",
        [owner.tenant_id]
      );
      if (waRows[0]) {
        const runwayEmoji = runway < 30 ? "🚨" : runway < 90 ? "⚠️" : "✅";
        const alertLine   = criticalAlerts.length
          ? `⚠️ *${criticalAlerts.length} alert${criticalAlerts.length > 1 ? "s" : ""} need attention*`
          : `✅ No critical alerts`;
        const overdueAmt  = overdueInvoices.reduce((s, i) => s + i.amount, 0);
        const invoiceLine = overdueAmt > 0 ? `\n📋 Overdue invoices: *${fmt(overdueAmt)}*` : "";
        const waMsg = `☀️ *Good morning — Headroom snapshot*\n${new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}\n\n💰 Cash: *${fmt(totalCash)}*\n🔥 Burn: *${fmt(burn)}/mo*\n${runwayEmoji} Runway: *${runway} days*\n\n${alertLine}${invoiceLine}\n\nReply *cash*, *runway*, *alerts*, or *help*`;
        await sendWhatsApp(waRows[0].phone, waMsg).catch(e => console.error("[digest wa]", e.message));
      }

      console.log(`[digest] sent to ${owner.email}`);
    } catch (err) {
      console.error(`[digest] failed for ${owner.email}:`, err.message);
    }
  }
}

// ── Monday CFO Brief ──────────────────────────────────────────────────────────

async function sendMondayBrief() {
  const { rows: owners } = await pool.query(
    "SELECT id, email, tenant_id FROM users WHERE role = 'owner'"
  );

  for (const owner of owners) {
    try {
      const { rows: kvRows } = await pool.query(
        "SELECT value FROM kv_store WHERE tenant_id = $1 AND namespace = 'app' AND key = 'store' LIMIT 1",
        [owner.tenant_id]
      );
      const kv   = kvRows[0]?.value?.value ?? {};
      if (!(kv.bankAccounts ?? []).length) continue;

      const items = await generateCFOBrief(kv);
      const weekOf = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

      const itemsHtml = items.map((item, i) => `
        <tr><td style="padding:12px 20px;border-bottom:1px solid #1a1a10">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="min-width:22px;height:22px;background:#C9A227;color:#0d0d09;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;flex-shrink:0;margin-top:1px">${i + 1}</span>
            <p style="margin:0;font-size:13px;color:#d0d0b0;font-family:system-ui,sans-serif;line-height:1.5">${item}</p>
          </div>
        </td></tr>
      `).join("");

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d09;padding:32px 0">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#16160f;border:1px solid #2a2a1a;border-radius:12px;overflow:hidden">
              <tr><td style="padding:24px 32px;border-bottom:1px solid #2a2a1a">
                <span style="font-size:20px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">
                  Head<span style="color:#C9A227">room</span>
                </span>
                <span style="margin-left:12px;font-size:12px;color:#5a5a40;font-family:system-ui,sans-serif">Monday CFO Brief</span>
              </td></tr>
              <tr><td style="padding:24px 32px 16px">
                <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#ffffff;font-family:system-ui,sans-serif">
                  3 things to do this week
                </p>
                <p style="margin:0;font-size:13px;color:#5a5a40;font-family:system-ui,sans-serif">Week of ${weekOf}</p>
              </td></tr>
              <tr><td style="padding:0 32px">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d09;border:1px solid #2a2a1a;border-radius:8px;overflow:hidden">
                  ${itemsHtml}
                </table>
              </td></tr>
              <tr><td style="padding:24px 32px 32px">
                <a href="${process.env.FRONTEND_URL || "https://headroom-pi.vercel.app"}/dashboard"
                  style="display:inline-block;background:#C9A227;color:#0d0d09;font-weight:700;font-size:13px;padding:12px 24px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">
                  Open Dashboard →
                </a>
              </td></tr>
              <tr><td style="padding:20px 32px;border-top:1px solid #2a2a1a;text-align:center">
                <p style="margin:0;font-size:11px;color:#5a5a40;font-family:system-ui,sans-serif">
                  Headroom — Cash flow intelligence for Indian SMBs<br>
                  Monday CFO Brief is sent at 8:00 AM IST every Monday.
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`;

      await sendMail({ to: owner.email, subject: `Your Monday CFO Brief — 3 things this week`, html });

      // WhatsApp Monday brief
      const { rows: waRows } = await pool.query(
        "SELECT phone FROM whatsapp_bindings WHERE tenant_id=$1 LIMIT 1",
        [owner.tenant_id]
      );
      if (waRows[0]) {
        const emojis = ["1️⃣", "2️⃣", "3️⃣"];
        const waLines = items.map((item, i) => `${emojis[i]} ${item}`).join("\n");
        const waMsg = `📋 *Monday CFO Brief*\nWeek of ${weekOf}\n\n${waLines}\n\nReply *cash*, *runway*, or *help* for live data`;
        await sendWhatsApp(waRows[0].phone, waMsg).catch(e => console.error("[brief wa]", e.message));
      }

      console.log(`[brief] sent to ${owner.email}`);
    } catch (err) {
      console.error(`[brief] failed for ${owner.email}:`, err.message);
    }
  }
}

module.exports = { sendDailyDigest, sendMondayBrief };
