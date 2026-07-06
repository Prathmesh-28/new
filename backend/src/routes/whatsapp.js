const router   = require("express").Router();
const crypto   = require("crypto");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { sendWhatsApp, validateSignature, normalizePhone } = require("../lib/whatsapp");
const { sendPush } = require("../lib/push");
// Plain-language replies run on the tenant's own engine (OpenRouter / self-host) - no direct Anthropic.
const llm = require("../modules/books/llm");
const ops = require("../modules/books/ops");
const { parseExpenseText } = require("../modules/books/voiceExpense");
const { q, withTenant } = require("../lib/tenantDb"); // invoices is FORCE-RLS
const { createInvoiceTx } = require("../lib/invoiceCreate");

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

// ── Voice/text expense capture ("paid 800 to electrician") ─────────────────────
// The read-side commands below answer questions from the cached KV snapshot; booking a
// real expense must hit the actual GL (book_ledgers / postVoucher), never the KV cache.
const EXPENSE_TRIGGER = /\b(paid|spent|kharch|kharcha|kharcho)\b/i;
// Kept short deliberately: a stray "ok"/"y" typed as idle chat could otherwise get
// consumed as a confirmation of a draft the user has forgotten about. 3 minutes (not
// 10) bounds how long an old, half-remembered draft stays armed for a later reply.
const PENDING_TTL_MS  = 3 * 60 * 1000;

// A different-kind draft (expense vs sale) already pending for this phone must never
// be silently clobbered - tell the user to resolve it first instead of losing it.
async function conflictingPending(phone, tenantId, newKind) {
  const { rows } = await pool.query(
    "SELECT kind, payload, expires_at FROM whatsapp_pending_actions WHERE phone=$1 AND tenant_id=$2", [phone, tenantId]
  );
  const existing = rows[0];
  if (!existing || existing.kind === newKind || new Date(existing.expires_at) < new Date()) return null;
  const p = existing.payload;
  const summary = existing.kind === "expense"
    ? `${fmt(p.amount)} expense (${p.description})`
    : `${fmt(p.amount)} sale to ${p.customer}`;
  return `You still have a pending ${summary} awaiting *YES*/*NO*. Reply to that first, then try again.`;
}

async function loadExpenseLedgers(tenantId) {
  const [{ rows: ledgers }, { rows: groups }] = await Promise.all([
    pool.query("SELECT id,name,group_id,is_bank,is_active FROM book_ledgers WHERE tenant_id=$1", [tenantId]),
    pool.query("SELECT id,nature FROM book_account_groups WHERE tenant_id=$1", [tenantId]),
  ]);
  const nature = Object.fromEntries(groups.map(g => [g.id, g.nature]));
  const expenseLedgers = ledgers.filter(l => l.is_active !== false && nature[l.group_id] === "EXPENSE");
  const cashLedger =
    ledgers.find(l => !l.is_bank && nature[l.group_id] === "ASSET" && /cash/i.test(l.name)) ||
    ledgers.find(l => l.is_bank && nature[l.group_id] === "ASSET") ||
    ledgers.find(l => nature[l.group_id] === "ASSET") ||
    null;
  return { expenseLedgers, cashLedger };
}

// Returns a reply string if the message looks like a bookable expense note, else null
// (falls through to the normal command/AI dispatch untouched).
async function captureExpenseDraft(text, tenantId, userId, phone) {
  if (!EXPENSE_TRIGGER.test(text)) return null;
  const parsed = await parseExpenseText(tenantId, text).catch(() => null);
  if (!parsed || !parsed.amount) return null;

  const { expenseLedgers, cashLedger } = await loadExpenseLedgers(tenantId);
  if (!expenseLedgers.length || !cashLedger) {
    return "Your chart of accounts isn't set up yet - visit headroom-pi.vercel.app/books to get started, then I can book expenses from chat.";
  }
  const catLc = parsed.category.toLowerCase();
  const match = expenseLedgers.find(l => l.name.toLowerCase().includes(catLc) || catLc.includes(l.name.toLowerCase()));
  if (!match) {
    return `🧾 I caught *${fmt(parsed.amount)}* for "${parsed.description}" but couldn't confidently match it to one of your expense ledgers. Log it at headroom-pi.vercel.app/books, or try again naming the category, e.g. "paid 800 fuel to electrician".`;
  }
  const conflict = await conflictingPending(phone, tenantId, "expense");
  if (conflict) return conflict;

  await pool.query(
    `INSERT INTO whatsapp_pending_actions(phone,tenant_id,user_id,kind,payload,expires_at)
     VALUES($1,$2,$3,'expense',$4,$5)
     ON CONFLICT(phone) DO UPDATE SET tenant_id=$2, user_id=$3, kind='expense', payload=$4, expires_at=$5`,
    [phone, tenantId, userId, JSON.stringify({
      amount: parsed.amount, description: parsed.description,
      categoryLedgerId: match.id, categoryLedgerName: match.name,
      paidFromLedgerId: cashLedger.id, paidFromLedgerName: cashLedger.name,
    }), new Date(Date.now() + PENDING_TTL_MS).toISOString()]
  );
  return `🧾 *Expense detected*\n\n${fmt(parsed.amount)} - ${parsed.description}\nCategory: *${match.name}*\nPaid from: *${cashLedger.name}*\n\nReply *YES* to book this, or *NO* to cancel.`;
}

// ── Sales capture ("sold 5000 to Sharma Traders") → real invoice on confirm ───
// "sales" (plural) is deliberately excluded: it's almost always a noun/adjective
// ("sales tax", "sales commission"), not a transaction verb, and would otherwise
// hijack ordinary expense notes like "paid 800 sales tax" before expense-capture
// ever runs (sale-capture is checked first).
const SALE_TRIGGER = /\b(sold|sale|becha)\b/i;

// Anchors on the LAST "to <name>" in the message (the customer is named once, at
// the end, in every real phrasing) and refuses to let the captured name itself
// contain another "to" - so "sold 5000, need to send invoice to Sharma" resolves
// to "Sharma", not "send invoice to Sharma". The amount is then read from the text
// BEFORE that clause, taking the number closest to it - so "sold 5 packs for 5000
// to Sharma" reads 5000 (the price), not 5 (the quantity).
function parseSale(text) {
  const t = String(text || "");
  const toMatches = [...t.matchAll(/\bto\s+((?:(?!\bto\b)[A-Za-z][A-Za-z.&'-]*)(?:\s+(?!\bto\b)[A-Za-z.&'-]+){0,5})/gi)];
  const lastTo = toMatches[toMatches.length - 1];
  const customer = lastTo ? lastTo[1].trim().replace(/\s+/g, " ") : null;
  const amountText = (lastTo ? t.slice(0, lastTo.index) : t).toLowerCase();

  let amount = null;
  const lakh = amountText.match(/(\d+(?:\.\d+)?)\s*(lakhs?|lac|lakh)\b/);
  const k = amountText.match(/(\d+(?:\.\d+)?)\s*(k|hazaar|hazar|thousand)\b/);
  const plainAll = [...amountText.matchAll(/(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?/g)];
  const plain = plainAll[plainAll.length - 1];
  if (lakh) amount = parseFloat(lakh[1]) * 100000;
  else if (k) amount = parseFloat(k[1]) * 1000;
  else if (plain) amount = parseFloat(plain[1].replace(/,/g, ""));
  return { amount, customer };
}

// Returns a reply string if the message looks like a sale, else null.
async function captureSaleDraft(text, tenantId, userId, phone) {
  if (!SALE_TRIGGER.test(text)) return null;
  const { amount, customer } = parseSale(text);
  if (!amount) return null;
  if (!customer) {
    // Ambiguous with an ordinary expense note ("spent 500 on sale commission") -
    // let expense-capture have a shot instead of dead-ending on a sale nudge.
    if (EXPENSE_TRIGGER.test(text)) return null;
    return `🧾 I caught a sale of *${fmt(amount)}* but no customer name. Include one, e.g. "sold ${amount} to Sharma Traders".`;
  }
  const conflict = await conflictingPending(phone, tenantId, "sale");
  if (conflict) return conflict;
  await pool.query(
    `INSERT INTO whatsapp_pending_actions(phone,tenant_id,user_id,kind,payload,expires_at)
     VALUES($1,$2,$3,'sale',$4,$5)
     ON CONFLICT(phone) DO UPDATE SET tenant_id=$2, user_id=$3, kind='sale', payload=$4, expires_at=$5`,
    [phone, tenantId, userId, JSON.stringify({ amount, customer }),
     new Date(Date.now() + PENDING_TTL_MS).toISOString()]
  );
  return `🧾 *Sale detected*\n\n${fmt(amount)} to *${customer}*\n\nReply *YES* to raise the invoice (no GST applied - edit it later if taxable), or *NO* to cancel.`;
}

// Returns a reply string if `cmd` resolves an outstanding pending action, else null.
// "ok"/"y"/"okay" were deliberately dropped from the confirm set - they're common
// enough as idle chat filler that a stray one could otherwise silently confirm a
// draft the user has forgotten about within the TTL window.
async function resolvePendingAction(cmd, tenantId, phone) {
  const isYes = /^(yes|confirm|book)$/.test(cmd);
  const isNo  = /^(no|n|cancel)$/.test(cmd);
  if (!isYes && !isNo) return null;

  // Atomic claim: DELETE...RETURNING is one statement, so of two concurrent "YES"
  // requests for the same phone (a Twilio webhook retry, or a double-tap send)
  // only the one that actually deletes-and-returns the row proceeds to book; the
  // other finds the row already gone and bails - instead of both booking.
  const { rows } = await pool.query(
    "DELETE FROM whatsapp_pending_actions WHERE phone=$1 AND tenant_id=$2 RETURNING *", [phone, tenantId]
  );
  const pending = rows[0];
  if (!pending) return null;
  if (isNo) return "Cancelled - nothing was booked.";
  if (new Date(pending.expires_at) < new Date()) return "That draft expired - send it again.";

  const p = pending.payload;
  if (pending.kind === "sale") {
    try {
      // Same path as the recurring-invoice cron: create inside a tenant-scoped txn,
      // then recognise revenue on issue (accrual), identical to POST /invoices + /send.
      const inv = await withTenant(tenantId, (client) => createInvoiceTx(client, tenantId, {
        customer_name: p.customer, gst_rate: 0, status: "sent",
        items: [{ description: "Sale (captured via WhatsApp)", quantity: 1, unit_price: p.amount }],
      }));
      require("../lib/invoiceGl").postInvoiceSale(tenantId, inv).catch(() => {});
      return `✅ Invoice *${inv.invoice_number}* raised: ${fmt(p.amount)} to ${p.customer}.\n\nManage it (add GST, send a payment link) at headroom-pi.vercel.app/invoices`;
    } catch (e) {
      console.error("[wa sale confirm]", e.message);
      return "Couldn't raise that invoice - please create it at headroom-pi.vercel.app/invoices.";
    }
  }
  try {
    await ops.createExpense(tenantId, pending.user_id, {
      categoryLedgerId: p.categoryLedgerId, amount: p.amount,
      date: new Date().toISOString().split("T")[0],
      paidFromLedgerId: p.paidFromLedgerId, note: p.description,
    });
    return `✅ Booked ${fmt(p.amount)} to *${p.categoryLedgerName}* (paid from ${p.paidFromLedgerName}).`;
  } catch (e) {
    console.error("[wa expense confirm]", e.message);
    return "Couldn't book that expense - please log it manually at headroom-pi.vercel.app/books.";
  }
}

// Dispatch a command from WhatsApp text → response string
async function dispatch(text, data, tenantId) {
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
    if (!unread.length) return "✅ *No unread alerts* - your cash flow is looking healthy.";
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
    return `📈 *30-day forecast*\n\nToday: *${fmt(total)}*\nIn 30 days (P50): *${fmt(last.p50)}*\nRange: ${fmt(last.p10)}-${fmt(last.p90)}\nBurn: ${fmt(burn)}/mo`;
  }

  // Statement-on-demand: "statement" → outstanding by customer; "statement sharma"
  // → that customer's open-invoice ledger. Reads the REAL invoices table (FORCE-RLS).
  if (/^(statement|ledger|khata)\b/.test(cmd) && tenantId) {
    const name = cmd.replace(/^(statement|ledger|khata)\s*/, "").trim();
    const { rows } = await q(tenantId,
      `SELECT customer_name, invoice_number, total_amount, due_date
         FROM invoices
        WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled')
        ORDER BY created_at ASC`,
      [tenantId]
    );
    if (!rows.length) return "✅ No outstanding invoices - every customer is settled.";
    if (!name) {
      const byCust = {};
      for (const r of rows) byCust[r.customer_name] = (byCust[r.customer_name] || 0) + Number(r.total_amount);
      const top = Object.entries(byCust).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const totalAll = Object.values(byCust).reduce((s, v) => s + v, 0);
      return `📒 *Outstanding: ${fmt(totalAll)}*\n\n${top.map(([c, v]) => `  ${c}: *${fmt(v)}*`).join("\n")}\n\nReply "statement <name>" for one customer's detail.`;
    }
    const match = rows.find(r => r.customer_name.toLowerCase().includes(name));
    if (!match) return `No open invoices found for a customer matching "${name}".`;
    const custRows = rows.filter(r => r.customer_name === match.customer_name);
    const total = custRows.reduce((s, r) => s + Number(r.total_amount), 0);
    const lines = custRows.slice(0, 10).map(r =>
      `  • ${r.invoice_number} - ${fmt(Number(r.total_amount))}${r.due_date ? ` (due ${new Date(r.due_date).toLocaleDateString("en-IN")})` : ""}`);
    const more = custRows.length > 10 ? `\n  …and ${custRows.length - 10} more` : "";
    return `📒 *${match.customer_name} - outstanding ${fmt(total)}*\n\n${lines.join("\n")}${more}`;
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
    return `👋 *Headroom CFO Assistant*\n\nReply with:\n  *cash* - current balance\n  *runway* - how many days of cash\n  *burn* - monthly expenses\n  *alerts* - unread alerts\n  *invoices* - outstanding receivables\n  *statement <name>* - a customer's open-invoice ledger\n  *forecast* - 30-day projection\n  *credit* - loan status\n\nOr just tell me what happened:\n  "paid 800 to electrician" - books the expense\n  "sold 5000 to Sharma Traders" - raises an invoice\n\nOr ask anything in plain language:\n  "Should I take the credit offer?"`;
  }

  // AI fallback - anything else. Runs on the tenant's own engine; if no engine is
  // configured (gateway throws LLM_NOT_CONFIGURED) we degrade to the command hint.
  if (!tenantId) {
    return `I didn't understand "${text}". Reply *help* for available commands.`;
  }
  try {
    const context = buildContext(data);
    const out = await llm.chat(tenantId, {
      system:   `You are a CFO assistant for an Indian SMB. Answer questions about their business finances concisely in 2-4 sentences. Use Indian number formatting (L for lakhs, Cr for crores). Do NOT use markdown. ${context}`,
      messages: [{ role: "user", content: text }],
    });
    return out?.content || `I didn't understand "${text}". Reply *help* for available commands.`;
  } catch {
    return `Couldn't process that right now. Reply *help* for available commands.`;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/whatsapp/send-otp - send a real 6-digit code over WhatsApp
router.post("/send-otp", authenticate, async (req, res) => {
  const phone = normalizePhone(req.body.phone ?? "");
  if (!phone.match(/^\+[1-9]\d{6,14}$/)) {
    return res.status(400).json({ error: "Invalid phone - use a valid mobile number with country code." });
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

// POST /api/whatsapp/verify-otp - verify the code, then link the number
router.post("/verify-otp", authenticate, async (req, res) => {
  const phone = normalizePhone(req.body.phone ?? "");
  const code  = (req.body.code ?? "").trim();
  const { rows } = await pool.query(
    "SELECT code, attempts, expires_at FROM whatsapp_otps WHERE phone=$1 AND tenant_id=$2",
    [phone, req.user.tenant_id]
  );
  const rec = rows[0];
  if (!rec) return res.status(400).json({ error: "No code found - tap Send OTP first." });
  if (new Date(rec.expires_at) < new Date()) return res.status(400).json({ error: "Code expired - request a new one." });
  if (rec.attempts >= 5) return res.status(429).json({ error: "Too many wrong attempts - request a new code." });
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
    `✅ *Headroom connected!*\n\nYou're all set. Reply *help* to see commands, or just ask your numbers in plain language - e.g. "What's my cash balance?"`
  ).catch(() => {});
  res.json({ ok: true, phone });
});

// POST /api/whatsapp/register - link a phone number to the authenticated user's tenant
router.post("/register", authenticate, async (req, res) => {
  const rawPhone = req.body.phone ?? "";
  const phone    = normalizePhone(rawPhone);
  if (!phone.match(/^\+[1-9]\d{6,14}$/)) {
    return res.status(400).json({ error: "Invalid phone - use E.164 format e.g. +919876543210" });
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

// DELETE /api/whatsapp/register - unlink
router.delete("/register", authenticate, async (req, res) => {
  await pool.query(
    "DELETE FROM whatsapp_bindings WHERE tenant_id=$1",
    [req.user.tenant_id]
  );
  res.json({ ok: true });
});

// GET /api/whatsapp/status - check registration
router.get("/status", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT phone FROM whatsapp_bindings WHERE tenant_id=$1 LIMIT 1",
    [req.user.tenant_id]
  );
  res.json({ registered: rows.length > 0, phone: rows[0]?.phone ?? null });
});

// POST /api/whatsapp/send-digest - called by the morning digest cron only.
// FAIL CLOSED: requires a matching shared secret. server.js guarantees
// INTERNAL_CRON_SECRET is always set (env in prod, generated at boot otherwise),
// so the in-process cron self-call always carries it while the public internet
// cannot - this endpoint fans out WhatsApp + push to every tenant, so it must
// never be world-callable (was previously skipped entirely when the env was unset).
router.post("/send-digest", async (req, res) => {
  const expected = process.env.INTERNAL_CRON_SECRET || "";
  const provided = String(req.headers["x-internal-secret"] || "");
  const expBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(provided);
  const okSecret = expected.length > 0 && expBuf.length === gotBuf.length &&
    crypto.timingSafeEqual(expBuf, gotBuf);
  if (!okSecret) {
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
  const pushedTenants = new Set();
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
      let msg = `☀️ *Headroom Morning Brief - ${today}*\n\n`;
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
          msg += `\n💳 *${offers.length} credit offer${offers.length > 1 ? "s" : ""} available* - up to ${fmt(Math.max(...offers.map(o => o.amount || 0)))}\n`;
        }
      }

      if (critical.length) msg += `\n⚠️ *${critical.length} critical alert${critical.length > 1 ? "s" : ""}*\n${critical.slice(0, 2).map(a => `  • ${a.title}`).join("\n")}\n`;
      else msg += "\n✅ No critical alerts today\n";
      msg += `\nReply *help* for commands · manage alerts in Settings`;

      await sendWhatsApp(phone, msg);
      sent++;

      // Mirror the brief to a native push (once per tenant) if devices are registered.
      if (!pushedTenants.has(tenant_id)) {
        pushedTenants.add(tenant_id);
        try {
          const { rows: toks } = await pool.query("SELECT token FROM push_tokens WHERE tenant_id=$1", [tenant_id]);
          if (toks.length) {
            await sendPush(toks.map(t => t.token), {
              title: `Cash ${fmt(total)} · ${runway}d runway`,
              body: critical.length ? `⚠️ ${critical.length} alert${critical.length > 1 ? "s" : ""} need attention` : "You're on track today.",
              data: { path: "/dashboard" },
            });
          }
        } catch (e) { console.error("[push digest]", e.message); }
      }
    } catch (e) {
      console.error("[wa digest] failed for", phone, e.message);
      failed++;
    }
  }
  res.json({ sent, failed, total: bindings.length });
});

// POST /webhook/whatsapp - Twilio inbound webhook (mounted at root, no /api prefix)
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
    "SELECT tenant_id, user_id FROM whatsapp_bindings WHERE phone=$1",
    [phone]
  );

  if (!rows[0]) {
    // Unknown sender - tell them how to register
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Your number isn't linked to a Headroom account yet. Open headroom-pi.vercel.app/settings and connect your WhatsApp number to get started.</Message></Response>`;
    return res.type("text/xml").send(twiml);
  }

  const { tenant_id, user_id } = rows[0];

  try {
    const cmd = body.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
    // Sale first: "sold 5000 to Sharma, paid cash" mentions both - "sold" is the
    // more specific signal ("paid" often appears as a mode-of-payment modifier).
    const reply =
      (await resolvePendingAction(cmd, tenant_id, phone)) ??
      (await captureSaleDraft(body, tenant_id, user_id, phone)) ??
      (await captureExpenseDraft(body, tenant_id, user_id, phone)) ??
      (await dispatch(body, await getTenantData(tenant_id), tenant_id));
    const safe  = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("[wa webhook]", err.message);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Something went wrong. Try again in a moment.</Message></Response>`);
  }
});

module.exports = router;
