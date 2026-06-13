const router   = require("express").Router();
const crypto   = require("crypto");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { sendWhatsApp, validateSignature, normalizePhone } = require("../lib/whatsapp");

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n) {
  if (typeof n !== "number" || isNaN(n)) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function monthlyBurn(transactions = []) {
  const now    = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split("T")[0];
  const exp    = transactions.filter(t => t.amount < 0 && t.date >= cutoff);
  if (!exp.length) return 0;
  return Math.abs(exp.reduce((s, t) => s + t.amount, 0)) / 3;
}

function runwayDays(bankAccounts = [], burn) {
  const total = bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  return burn > 0 ? Math.floor((total / burn) * 30) : 999;
}

async function getTenantData(tenantId) {
  const { rows } = await pool.query(
    "SELECT namespace, value FROM kv_store WHERE tenant_id=$1 AND key='store'",
    [tenantId]
  );
  const merged = {};
  for (const row of rows) {
    const inner = row.value?.value ?? {};
    Object.assign(merged, inner);
  }
  return merged;
}

// Build a compact text summary of tenant financials for AI context
function buildContext(data) {
  const accounts = (data.bankAccounts ?? []).map(a => `${a.name}: ${fmt(a.balance)}`).join(", ");
  const burn     = monthlyBurn(data.transactions);
  const runway   = runwayDays(data.bankAccounts, burn);
  const alerts   = (data.alerts ?? []).filter(a => !a.isRead).length;
  const overdue  = (data.invoices ?? []).filter(i => i.status !== "paid" && i.dueDate < new Date().toISOString().split("T")[0]);
  const overdueAmt = overdue.reduce((s, i) => s + i.amount, 0);
  const topRevenue = Object.entries(
    (data.transactions ?? []).filter(t => t.amount > 0 && t.counterparty)
      .reduce((acc, t) => { acc[t.counterparty] = (acc[t.counterparty] ?? 0) + t.amount; return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}: ${fmt(v)}`).join(", ");
  return `Business data: cash balance ${accounts || "none"} | burn ${fmt(burn)}/mo | runway ${runway} days | ${alerts} unread alerts | overdue receivables ${fmt(overdueAmt)} | top revenue sources: ${topRevenue || "none"}`;
}

// Dispatch a command from WhatsApp text → response string
async function dispatch(text, data) {
  const cmd = text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");

  // Cash / balance
  if (/^(cash|balance|bal|money|funds?)$/.test(cmd)) {
    const accounts = data.bankAccounts ?? [];
    const total    = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    if (!accounts.length) return "No bank accounts connected yet. Add one at headroom-pi.vercel.app/dashboard";
    const lines    = accounts.map(a => `  ${a.name}: *${fmt(a.balance)}*`).join("\n");
    return `💰 *Cash balance: ${fmt(total)}*\n\n${lines}`;
  }

  // Runway
  if (/^(runway|run|days?|howlong)$/.test(cmd)) {
    const burn   = monthlyBurn(data.transactions);
    const runway = runwayDays(data.bankAccounts, burn);
    const total  = (data.bankAccounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
    const emoji  = runway < 30 ? "🚨" : runway < 90 ? "⚠️" : "✅";
    return `${emoji} *Cash runway: ${runway} days*\n\nBalance: ${fmt(total)} · Burn: ${fmt(burn)}/month`;
  }

  // Burn / expenses
  if (/^(burn|expense|expenses|spending)$/.test(cmd)) {
    const burn = monthlyBurn(data.transactions);
    return `🔥 *Monthly burn: ${fmt(burn)}*\nBased on average of last 3 months of expenses`;
  }

  // Alerts
  if (/^(alert|alerts|warning|warnings)$/.test(cmd)) {
    const unread = (data.alerts ?? []).filter(a => !a.isRead);
    if (!unread.length) return "✅ *No unread alerts* — your cash flow is looking healthy.";
    const lines = unread.slice(0, 5).map(a => `  ${a.severity === "critical" ? "🚨" : a.severity === "high" ? "⚠️" : "📌"} ${a.title}`).join("\n");
    return `🔔 *${unread.length} unread alert${unread.length > 1 ? "s" : ""}*\n\n${lines}`;
  }

  // Invoices / receivables
  if (/^(invoice|invoices|overdue|receivable|collect|chase)$/.test(cmd)) {
    const today   = new Date().toISOString().split("T")[0];
    const pending = (data.invoices ?? []).filter(i => i.status !== "paid");
    if (!pending.length) return "✅ *No outstanding invoices*";
    const overdue = pending.filter(i => i.dueDate < today);
    const current = pending.filter(i => i.dueDate >= today);
    const lines   = [];
    if (overdue.length) lines.push(`  🔴 Overdue: *${fmt(overdue.reduce((s, i) => s + i.amount, 0))}* (${overdue.length} invoices)`);
    if (current.length) lines.push(`  🟢 Current: *${fmt(current.reduce((s, i) => s + i.amount, 0))}* (${current.length} invoices)`);
    return `📋 *Receivables: ${fmt(pending.reduce((s, i) => s + i.amount, 0))}*\n\n${lines.join("\n")}`;
  }

  // Forecast
  if (/^(forecast|predict|future|next|trend)$/.test(cmd)) {
    const pts = (data.forecast ?? []).slice(0, 30);
    if (!pts.length) return "No forecast generated yet. Go to headroom-pi.vercel.app/forecast and click Generate.";
    const last = pts[pts.length - 1];
    const burn = monthlyBurn(data.transactions);
    const total = (data.bankAccounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
    return `📈 *30-day forecast*\n\nToday: *${fmt(total)}*\nIn 30 days (P50): *${fmt(last.p50)}*\nRange: ${fmt(last.p10)}–${fmt(last.p90)}\nBurn: ${fmt(burn)}/mo`;
  }

  // Credit
  if (/^(credit|loan|borrow|lend|apply)$/.test(cmd)) {
    const apps   = data.creditApplications ?? [];
    const loans  = data.activeLoans ?? [];
    if (!loans.length && !apps.length) {
      return `💳 *No active credit*\n\nRun a credit pre-qualification at headroom-pi.vercel.app/credit`;
    }
    const lines = [];
    for (const l of loans.slice(0, 3)) {
      lines.push(`  ${l.lender}: *${fmt(l.outstanding ?? l.principal)}* outstanding`);
    }
    return `💳 *Credit summary*\n\n${lines.join("\n") || "No active loans"}`;
  }

  // Help
  if (/^(help|hi|hello|helo|commands?|menu|start)$/.test(cmd)) {
    return `👋 *Headroom CFO Assistant*\n\nReply with:\n  *cash* — current balance\n  *runway* — how many days of cash\n  *burn* — monthly expenses\n  *alerts* — unread alerts\n  *invoices* — outstanding receivables\n  *forecast* — 30-day projection\n  *credit* — loan status\n\nOr ask anything in plain language:\n  "Should I take the credit offer?"\n  "Why is my burn so high?"`;
  }

  // AI fallback — anything else
  if (!process.env.ANTHROPIC_API_KEY) {
    return `I didn't understand "${text}". Reply *help* for available commands.`;
  }
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client    = new Anthropic.default();
    const context   = buildContext(data);
    const resp = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:     `You are a CFO assistant for an Indian SMB. Answer questions about their business finances concisely in 2-4 sentences. Use Indian number formatting (L for lakhs, Cr for crores). Do NOT use markdown. ${context}`,
      messages:   [{ role: "user", content: text }],
    });
    return resp.content[0]?.text ?? "Sorry, I could not process that.";
  } catch {
    return `Couldn't process that right now. Reply *help* for available commands.`;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/whatsapp/send-otp — send a real 6-digit code over WhatsApp
router.post("/send-otp", authenticate, async (req, res) => {
  const phone = normalizePhone(req.body.phone ?? "");
  if (!phone.match(/^\+[1-9]\d{6,14}$/)) {
    return res.status(400).json({ error: "Invalid phone — use a valid mobile number with country code." });
  }
  // 30-second resend cooldown
  const { rows: prev } = await pool.query(
    "SELECT created_at FROM whatsapp_otps WHERE phone=$1 AND expires_at > now()", [phone]
  );
  if (prev[0] && Date.now() - new Date(prev[0].created_at).getTime() < 30_000) {
    return res.status(429).json({ error: "Please wait a few seconds before requesting another code." });
  }

  const code    = crypto.randomInt(100000, 1000000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await pool.query(
    `INSERT INTO whatsapp_otps(phone, tenant_id, code, attempts, expires_at, created_at)
     VALUES($1,$2,$3,0,$4,now())
     ON CONFLICT(phone) DO UPDATE SET tenant_id=$2, code=$3, attempts=0, expires_at=$4, created_at=now()`,
    [phone, req.user.tenant_id, sha256(code), expires]
  );

  let delivered;
  try {
    delivered = await sendWhatsApp(phone,
      `🔐 Your Headroom verification code is *${code}*\n\nIt expires in 10 minutes. If you didn't request this, ignore this message.`);
  } catch (e) {
    console.error("[wa send-otp]", e.message);
    return res.status(502).json({ error: "Couldn't send the code. On the Twilio sandbox you must first send the join code to the sandbox number from this WhatsApp, then retry." });
  }
  if (!delivered) {
    return res.status(503).json({ error: "WhatsApp isn't configured on the server yet (missing Twilio keys)." });
  }
  res.json({ ok: true });
});

// POST /api/whatsapp/verify-otp — verify the code, then link the number
router.post("/verify-otp", authenticate, async (req, res) => {
  const phone = normalizePhone(req.body.phone ?? "");
  const code  = (req.body.code ?? "").trim();
  const { rows } = await pool.query(
    "SELECT code, attempts, expires_at FROM whatsapp_otps WHERE phone=$1 AND tenant_id=$2",
    [phone, req.user.tenant_id]
  );
  const rec = rows[0];
  if (!rec) return res.status(400).json({ error: "No code found — tap Send OTP first." });
  if (new Date(rec.expires_at) < new Date()) return res.status(400).json({ error: "Code expired — request a new one." });
  if (rec.attempts >= 5) return res.status(429).json({ error: "Too many wrong attempts — request a new code." });
  if (sha256(code) !== rec.code) {
    await pool.query("UPDATE whatsapp_otps SET attempts=attempts+1 WHERE phone=$1", [phone]);
    return res.status(400).json({ error: "Incorrect code." });
  }

  await pool.query(
    "INSERT INTO whatsapp_bindings(phone, tenant_id, user_id) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET tenant_id=$2, user_id=$3",
    [phone, req.user.tenant_id, req.user.id]
  );
  await pool.query("DELETE FROM whatsapp_otps WHERE phone=$1", [phone]);
  await sendWhatsApp(phone,
    `✅ *Headroom connected!*\n\nYou're all set. Reply *help* to see commands, or just ask your numbers in plain language — e.g. "What's my cash balance?"`
  ).catch(() => {});
  res.json({ ok: true, phone });
});

// POST /api/whatsapp/register — link a phone number to the authenticated user's tenant
router.post("/register", authenticate, async (req, res) => {
  const rawPhone = req.body.phone ?? "";
  const phone    = normalizePhone(rawPhone);
  if (!phone.match(/^\+[1-9]\d{6,14}$/)) {
    return res.status(400).json({ error: "Invalid phone — use E.164 format e.g. +919876543210" });
  }
  await pool.query(
    "INSERT INTO whatsapp_bindings(phone, tenant_id, user_id) VALUES($1,$2,$3) ON CONFLICT(phone) DO UPDATE SET tenant_id=$2, user_id=$3",
    [phone, req.user.tenant_id, req.user.id]
  );
  // Send welcome message
  await sendWhatsApp(phone,
    `✅ *Headroom connected!*\n\nYou're all set. Reply *help* to see available commands, or just ask your numbers in plain language.\n\nExample: "What's my cash balance?"`
  ).catch(() => {});
  res.json({ ok: true, phone });
});

// DELETE /api/whatsapp/register — unlink
router.delete("/register", authenticate, async (req, res) => {
  await pool.query(
    "DELETE FROM whatsapp_bindings WHERE tenant_id=$1",
    [req.user.tenant_id]
  );
  res.json({ ok: true });
});

// GET /api/whatsapp/status — check registration
router.get("/status", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT phone FROM whatsapp_bindings WHERE tenant_id=$1 LIMIT 1",
    [req.user.tenant_id]
  );
  res.json({ registered: rows.length > 0, phone: rows[0]?.phone ?? null });
});

// POST /api/whatsapp/send-digest — called by morning digest cron
router.post("/send-digest", async (req, res) => {
  // Internal call from cron — allow only from localhost or with a shared secret
  const secret = req.headers["x-internal-secret"];
  if (process.env.INTERNAL_CRON_SECRET && secret !== process.env.INTERNAL_CRON_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { rows: bindings } = await pool.query(
    "SELECT wb.phone, wb.tenant_id FROM whatsapp_bindings wb"
  );

  const todayISO = new Date().toISOString().split("T")[0];
  const within = (dateStr, days) => {
    if (!dateStr) return false;
    const d = (new Date(dateStr) - new Date(todayISO)) / 86400000;
    return d >= 0 && d <= days;
  };

  let sent = 0, failed = 0;
  for (const { phone, tenant_id } of bindings) {
    try {
      const data    = await getTenantData(tenant_id);
      // Per-tenant alert preferences (persisted in the KV 'app' namespace). The
      // morning brief honours each toggle; defaults match the UI.
      const prefs   = { low_cash: true, overdue: true, gst_due: true, credit_offer: false, payroll: true, weekly: true, ...(data.whatsappPreferences || {}) };
      const burn    = monthlyBurn(data.transactions);
      const runway  = runwayDays(data.bankAccounts, burn);
      const total   = (data.bankAccounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);
      const unread  = (data.alerts ?? []).filter(a => !a.isRead);
      const critical = unread.filter(a => a.severity === "critical" || a.severity === "high");
      const safetyDays = data.firm?.safetyThresholdDays ?? 30;

      const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      const emoji  = runway < 30 ? "🚨" : runway < 90 ? "⚠️" : "✅";
      let msg = `☀️ *Headroom Morning Brief — ${today}*\n\n`;
      msg += `💰 Cash: *${fmt(total)}*\n`;
      msg += `🔥 Burn: ${fmt(burn)}/month\n`;
      msg += `${emoji} Runway: *${runway} days*\n`;

      // Low-cash warning (gated)
      if (prefs.low_cash && runway < safetyDays) {
        msg += `\n🚨 *Low cash:* runway is under your ${safetyDays}-day safety threshold.\n`;
      }

      // Overdue receivables (gated)
      if (prefs.overdue) {
        const overdue = (data.invoices ?? []).filter(i => i.status !== "paid" && i.dueDate < todayISO);
        if (overdue.length) {
          msg += `\n🔴 *Overdue receivables: ${fmt(overdue.reduce((s, i) => s + (i.amount || 0), 0))}* (${overdue.length})\n`;
        }
      }

      // GST / tax due soon (gated)
      if (prefs.gst_due) {
        const taxDue = (data.obligations ?? []).filter(o => o.type === "tax" && within(o.dueDate, 14));
        if (taxDue.length) {
          const next = taxDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
          msg += `\n🧾 *${next.name}: ${fmt(next.amount)}* due ${next.dueDate}\n`;
        }
      }

      // Payroll due soon (gated)
      if (prefs.payroll) {
        const pay = (data.obligations ?? []).filter(o => o.type === "payroll" && within(o.dueDate, 7));
        if (pay.length) {
          msg += `\n👥 *Payroll ${fmt(pay.reduce((s, o) => s + (o.amount || 0), 0))}* due within 7 days\n`;
        }
      }

      // Credit offers available (gated)
      if (prefs.credit_offer) {
        const offers = (data.creditOffers ?? []).filter(o => o.status === "pending");
        if (offers.length) {
          msg += `\n💳 *${offers.length} credit offer${offers.length > 1 ? "s" : ""} available* — up to ${fmt(Math.max(...offers.map(o => o.amount || 0)))}\n`;
        }
      }

      if (critical.length) msg += `\n⚠️ *${critical.length} critical alert${critical.length > 1 ? "s" : ""}*\n${critical.slice(0, 2).map(a => `  • ${a.title}`).join("\n")}\n`;
      else msg += "\n✅ No critical alerts today\n";
      msg += `\nReply *help* for commands · manage alerts in Settings`;

      await sendWhatsApp(phone, msg);
      sent++;
    } catch (e) {
      console.error("[wa digest] failed for", phone, e.message);
      failed++;
    }
  }
  res.json({ sent, failed, total: bindings.length });
});

// POST /webhook/whatsapp — Twilio inbound webhook (mounted at root, no /api prefix)
router.post("/", async (req, res) => {
  // Twilio signature validation
  if (!validateSignature(req)) {
    return res.status(403).send("Forbidden");
  }

  const rawFrom = req.body.From ?? "";
  const body    = (req.body.Body ?? "").trim();
  const phone   = normalizePhone(rawFrom);

  // Look up binding
  const { rows } = await pool.query(
    "SELECT tenant_id FROM whatsapp_bindings WHERE phone=$1",
    [phone]
  );

  if (!rows[0]) {
    // Unknown sender — tell them how to register
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Your number isn't linked to a Headroom account yet. Open headroom-pi.vercel.app/settings and connect your WhatsApp number to get started.</Message></Response>`;
    return res.type("text/xml").send(twiml);
  }

  const { tenant_id } = rows[0];

  try {
    const data  = await getTenantData(tenant_id);
    const reply = await dispatch(body, data);
    const safe  = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("[wa webhook]", err.message);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Something went wrong. Try again in a moment.</Message></Response>`);
  }
});

module.exports = router;
