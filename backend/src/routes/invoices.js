const router    = require("express").Router();
const QRCode    = require("qrcode");
const { pool }  = require("../db");
const { q, withTenant } = require("../lib/tenantDb"); // invoices is FORCE-RLS (0015) — its access MUST set the tenant GUC
const { authenticate } = require("../middleware/auth");
const { sendMail } = require("../lib/email");
const { sendWhatsApp } = require("../lib/whatsapp");
const platformConfig = require("../lib/platformConfig");

const { round2, applyReceipt, remainingToSettle, effectiveTotal, creditableBalance } = require("../lib/invoicePaymentMath");
const listQuery = require("../lib/listQuery");
const trash = require("../lib/trash");
const { idempotent } = require("../middleware/idempotency");
const { writeAudit, auditReq } = require("../lib/audit");
const { computeInvoice } = require("../lib/invoiceTotals");
const { renderInvoicePdf } = require("../lib/invoicePdf");
const notifyLib = require("../lib/notify");
const { recordReceiptTx } = require("../lib/receipts");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant","sales"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
// Payment modes accepted on a receipt. Kept small + closed so the mode column stays reportable.
const PAY_MODES = new Set(["cash", "upi", "bank", "neft", "cheque", "card", "other"]);

// The SMB's own firm name - so a reminder a CUSTOMER receives is signed by the
// business, not the logged-in user's display name or a generic "your supplier".
async function firmNameOf(tenantId) {
  try {
    const { rows } = await pool.query("SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store'", [tenantId]);
    for (const r of rows) { const n = r.value?.value?.firm?.name; if (n) return n; }
  } catch { /* fall through */ }
  return null;
}

const { createInvoiceTx, sellerStateCode } = require("../lib/invoiceCreate"); // shared with the recurring-invoice cron

function computeAging(invoice) {
  if (invoice.status === "paid") return "paid";
  const today = new Date();
  const due   = new Date(invoice.due_date);
  const days  = Math.floor((today - due) / 86400000);
  if (days <= 0)  return "current";
  if (days <= 30) return "30d";
  if (days <= 60) return "60d";
  return "90d+";
}

// GET /api/invoices
// Paginated, sortable, searchable — the shared list contract (lib/listQuery.js).
// This endpoint previously selected EVERY invoice for the tenant with every line item
// joined, and the browser did the filtering: fine at 50 invoices, a timeout at 20,000.
//   ?page=1&limit=50&sort=due_date&order=asc&q=acme&status=sent
//   ?all=1  → the whole set (hard-capped), for the aggregate pages that still need it.
router.get("/", authenticate, async (req, res) => {
  const parsed = listQuery.parseList(req, {
    sortable: ["created_at", "invoice_number", "customer_name", "total_amount", "due_date", "status", "paid_amount"],
    defaultSort: "created_at",
    defaultOrder: "desc",
    searchable: ["invoice_number", "customer_name", "customer_gstin", "customer_email"],
  });

  const conditions = ["i.tenant_id = $1"];
  const vals = [req.user.tenant_id];

  if (req.query.status) { vals.push(String(req.query.status)); conditions.push(`i.status = $${vals.length}`); }
  if (req.query.from)   { vals.push(String(req.query.from));   conditions.push(`i.created_at >= $${vals.length}`); }
  if (req.query.to)     { vals.push(String(req.query.to));     conditions.push(`i.created_at <= $${vals.length}`); }
  if (req.query.minAmount) { vals.push(Number(req.query.minAmount)); conditions.push(`i.total_amount >= $${vals.length}`); }
  if (req.query.maxAmount) { vals.push(Number(req.query.maxAmount)); conditions.push(`i.total_amount <= $${vals.length}`); }
  if (req.query.unpaid === "1") conditions.push("i.status NOT IN ('paid','cancelled')");

  const srch = listQuery.search(parsed, "i", vals.length + 1);
  if (srch.clause) { conditions.push(srch.clause); vals.push(...srch.params); }
  const where = conditions.join(" AND ");

  const pageClause = listQuery.paginate(parsed, vals.length + 1);

  const [dataRes, countRes] = await Promise.all([
    q(req.user.tenant_id,
      `SELECT i.*, COALESCE(json_agg(ii ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]'::json) AS items
         FROM invoices i
         LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE ${where}
        GROUP BY i.id
        ${listQuery.orderBy(parsed, "i")}
        ${pageClause.clause}`,
      [...vals, ...pageClause.params]),
    q(req.user.tenant_id, `SELECT count(*)::int AS n FROM invoices i WHERE ${where}`, vals),
  ]);

  const data = dataRes.rows.map(r => ({ ...r, aging: computeAging(r), items: r.items ?? [] }));
  res.json(listQuery.envelope(data, countRes.rows[0].n, parsed));
});

// POST /api/invoices
router.post("/", authenticate, canWrite, idempotent(), async (req, res) => {
  const {
    customer_name, customer_gstin, customer_email, customer_phone, gst_rate = 18, due_date, items = [],
    // Wave 4 document fields. All optional: an invoice raised the old way still works, it
    // just gets today's date, the customer's place of supply and no discount/freight.
    customer_id, invoice_date, place_of_supply_code, reverse_charge, discount_amount,
    shipping_amount, currency, exchange_rate, po_number, reference, terms, notes, round_off_enabled,
  } = req.body;
  if (!customer_name || !items.length) return res.status(400).json({ error: "customer_name and items required" });
  // A malformed date used to reach Postgres and reject asynchronously with nothing
  // catching it: the request never answered and the caller hung until its own timeout.
  // Validate here and say which field is wrong.
  for (const [field, value] of [["due_date", due_date], ["invoice_date", invoice_date]]) {
    if (value != null && value !== "" && Number.isNaN(Date.parse(value)))
      return res.status(400).json({ error: `${field} "${value}" is not a valid date (use YYYY-MM-DD)`, errors: { [field]: "Use a date like 2026-09-01" } });
  }

  // One tenant-scoped transaction (RLS GUC set once): next-number read + invoice insert +
  // line items — atomic, via the factory shared with the recurring-invoice cron.
  let inv;
  try {
    inv = await withTenant(req.user.tenant_id, (client) =>
      createInvoiceTx(client, req.user.tenant_id, {
        customer_name, customer_gstin, customer_email, customer_phone, gst_rate, due_date, items,
        customer_id, invoice_date, place_of_supply_code, reverse_charge, discount_amount,
        shipping_amount, currency, exchange_rate, po_number, reference, terms, notes,
        round_off_enabled: round_off_enabled !== false,
      })
    );
  } catch (e) {
    // 22xxx = Postgres data exceptions (bad date, numeric overflow, …): the client sent
    // something unusable, so answer 400 with the reason rather than hanging or 500ing.
    if (String(e.code || "").startsWith("22")) return res.status(400).json({ error: `Couldn't save this invoice: ${e.message}` });
    console.error("[invoices] create failed:", e.message);
    return res.status(500).json({ error: "Couldn't save this invoice. Nothing was charged or recorded — try again." });
  }

  auditReq(req, "created", "invoice", inv.id, { invoice_number: inv.invoice_number, customer: customer_name, total: Number(inv.total_amount) });
  require("../modules/flows/runner").emitEvent(req.user.tenant_id, "invoice.created", { invoice: inv }).catch(() => {});
  require("../modules/analytics").track(req.user.tenant_id, req.user.id, { event: "invoice_created", props: { total: Number(inv.total_amount) } }).catch(() => {});
  res.status(201).json(inv);
});

// PATCH /api/invoices/:id - update status
router.patch("/:id", authenticate, canWrite, async (req, res) => {
  const { status } = req.body;
  const valid = ["draft", "sent", "paid", "cancelled"];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of: ${valid.join(", ")}` });
  const tenantId = req.user.tenant_id;

  // Marking paid must settle only the OUTSTANDING balance (partial receipts may already be
  // booked) and must be a no-op on an already-paid invoice — otherwise the settling receipt
  // double-posts against those partials or against a historical full receipt.
  if (status === "paid") {
    let outcome;
    try {
      outcome = await withTenant(tenantId, async (client) => {
      const { rows: [cur] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, tenantId]);
      if (!cur) return { notFound: true };
      if (cur.status === "paid") return { inv: cur, already: true }; // idempotent: nothing left to post
      const remaining = remainingToSettle({ total: cur.total_amount, paidAmount: cur.paid_amount || 0, creditedAmount: cur.credited_amount || 0 });
      // Record the settling remainder as a receipt so sum(invoice_payments)==paid_amount holds.
      // Strict > 0: amounts are paise-quantized, so even a 1-paise residual gets a settling
      // receipt — otherwise the GL debtor keeps an uncleared residual on a "paid" invoice.
      let settle = null;
      if (remaining > 0) {
        const { rows: [p] } = await client.query(
          "INSERT INTO invoice_payments(tenant_id, invoice_id, amount, mode, reference, created_by) VALUES($1,$2,$3,'other','Marked paid',$4) RETURNING *",
          [tenantId, cur.id, remaining, req.user.id || null]);
        settle = p;
      }
      const { rows: [upd] } = await client.query(
        // Paid means the customer settled the EFFECTIVE total (net of credit notes) — never
        // claim more cash was received than was actually collectible.
        "UPDATE invoices SET status='paid', paid_at=now(), paid_amount=total_amount-credited_amount WHERE id=$1 AND tenant_id=$2 RETURNING *",
        [cur.id, tenantId]);
      return { inv: upd, settle, remaining };
      });
    } catch (e) { console.error("[invoices] mark paid failed:", e.message); return res.status(500).json({ error: "Internal error" }); }
    if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
    if (!outcome.already) {
      require("../modules/flows/runner").emitEvent(tenantId, "invoice.paid", { invoice: outcome.inv }).catch(() => {});
      if (outcome.settle) // book only the remainder; shared :settle key so a concurrent manual-mark + Razorpay webhook dedup to one, while partial :p: keys never collide
        require("../lib/invoiceGl").postInvoiceReceipt(tenantId, outcome.inv, { amount: outcome.settle.amount, ref: outcome.inv.invoice_number, idempotencyKey: `recv:inv:${outcome.inv.id}:settle` }).catch(() => {});
      // Invoice-financing wedge (self-liquidating): if this invoice backs an active advance,
      // auto-recover the loan. The Razorpay webhook does the same; onInvoicePaid uses a stable
      // per-invoice recovery ref so a manual + webhook (or concurrent) double-fire dedups to one.
      require("../modules/lending").onInvoicePaid(tenantId, outcome.inv.id).catch(() => {});
    }
    return res.json(outcome.inv);
  }

  const { rows: [inv] } = await q(tenantId,
    "UPDATE invoices SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *",
    [status, req.params.id, tenantId]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (status === "sent") {
    require("../lib/invoiceGl").postInvoiceSale(req.user.tenant_id, inv).catch(() => {}); // accrual: recognise revenue + output GST on issue
    // Issued & unpaid = the moment an invoice becomes financeable. Flows can trigger on this
    // (e.g. the "issue invoice → offer an advance" automation).
    require("../modules/flows/runner").emitEvent(req.user.tenant_id, "invoice.sent", { invoice: inv }).catch(() => {});
  }
  res.json(inv);
});

// DELETE /api/invoices/:id - remove an invoice (and its line items), tenant-scoped.
// The Receivables page calls this to sync a deletion to the ledger.
// Goes to the 30-day bin instead of vanishing: the response carries the trashId so the
// client can show an Undo that restores the invoice, its line items, receipts, reminders
// and credit notes with the original id (lib/trash.js).
router.delete("/:id", authenticate, canWrite, async (req, res, next) => {
  try {
    const out = await trash.softDelete(req.user.tenant_id, "invoice", req.params.id, req.user.id);
    auditReq(req, "deleted", "invoice", req.params.id, { label: out.label });
    res.json({ ok: true, trashId: out.trashId, label: out.label, undoUntil: out.purgeAfter });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: "Invoice not found" });
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// GET /api/invoices/:id/pdf — rendered by lib/invoicePdf.js, which the customer portal
// uses too, so the copy a customer downloads is byte-for-byte the one the firm sees.
router.get("/:id/pdf", authenticate, async (req, res, next) => {
  try {
    const out = await renderInvoicePdf(req.user.tenant_id, req.params.id, res);
    if (out?.notFound) return res.status(404).json({ error: "Invoice not found" });
  } catch (e) { next(e); }
});

// POST /:id/remind - Send WhatsApp reminder with UPI link
router.post("/:id/remind", authenticate, canWrite, async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  try {
    // The invoice row already carries the customer's contact details - there is
    // no separate tenants table to join (the previous LEFT JOIN tenants crashed).
    const { rows } = await q(tenantId,
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    // Don't-contact list: a customer in a payment dispute, or one who asked to be left
    // alone, kept receiving automated chasers because nothing checked. Refuse clearly
    // rather than sending and hoping.
    const suppressed = await notifyLib.isSuppressed(tenantId, invoice.customer_id);
    if (suppressed.suppressed) {
      return res.status(409).json({
        error: `${suppressed.name || "This customer"} is marked do-not-contact${suppressed.reason ? ` (${suppressed.reason})` : ""}. Clear that on their record first.`,
        code: "DO_NOT_CONTACT",
      });
    }

    // Quiet hours: reminders used to go out whenever a cron happened to run. A chaser at
    // 03:00 costs more goodwill than the day it saves.
    if (await notifyLib.withinQuietHours(tenantId)) {
      return res.status(409).json({
        error: "It's outside the hours you set for messaging customers. Change the window in Settings → Notifications, or send it later.",
        code: "QUIET_HOURS",
      });
    }

    // Spam-guard: protect the SMB's relationship with its customer. The cap (per
    // 7-day window) is a super-admin-tunable platform setting, defaulting to 3.
    const reminderCap = await platformConfig.num("limits", "reminderMaxPer7d", 3);
    const { rows: recent } = await pool.query(
      "SELECT count(*)::int AS n FROM invoice_reminders WHERE invoice_id=$1 AND tenant_id=$2 AND created_at > now() - interval '7 days'",
      [id, tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (reminderCap > 0 && (recent[0]?.n ?? 0) >= reminderCap) {
      return res.status(429).json({ error: `You've already sent ${reminderCap} reminders for this invoice in the last 7 days - give the customer some space before nudging again.` });
    }

    const amount = Number(invoice.total_amount || 0);
    const sender = (await firmNameOf(tenantId)) || req.user.display_name || "your supplier";
    const baseMsg = `Reminder from ${sender}: invoice ${invoice.invoice_number} for ₹${amount.toLocaleString("en-IN")} is due${invoice.due_date ? ` on ${new Date(invoice.due_date).toLocaleDateString("en-IN")}` : ""}.`;
    const msg = baseMsg + (invoice.upi_link ? ` Pay here: ${invoice.upi_link}` : "");

    // Try WhatsApp first (if we have a phone), then email. Record what happened.
    let channel = null, delivered = false;
    if (invoice.customer_phone) {
      channel = "whatsapp";
      delivered = await sendWhatsApp(invoice.customer_phone, msg).catch(() => false);
    } else if (invoice.customer_email) {
      channel = "email";
      const esc = baseMsg.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const payBtn = invoice.upi_link
        ? `<p style="margin:18px 0"><a href="${invoice.upi_link}" style="background:#5FBE7C;color:#0d0d09;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none;display:inline-block">Pay ₹${amount.toLocaleString("en-IN")} now</a></p>`
        : "";
      delivered = await sendMail({
        to: invoice.customer_email,
        subject: `Payment reminder - invoice ${invoice.invoice_number}`,
        html: `<div style="font-family:system-ui,-apple-system,sans-serif"><p>${esc}</p>${payBtn}<p style="color:#8a8a8a;font-size:12px;margin-top:20px">Sent by ${sender}.</p></div>`,
      }).then(() => true).catch(() => false);
    }
    if (!channel) {
      return res.status(400).json({ error: "No customer phone or email on this invoice" });
    }

    await pool.query(
      `INSERT INTO invoice_reminders (invoice_id, tenant_id, channel, status)
       VALUES ($1, $2, $3, $4)`,
      [id, tenantId, channel, delivered ? "sent" : "queued"]
    ).catch(() => {});

    // Move a still-draft invoice to "sent" once a reminder goes out.
    if (invoice.status === "draft") {
      await q(tenantId, `UPDATE invoices SET status='sent' WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    }

    res.json({
      success: true,
      channel,
      delivered,
      message: delivered
        ? `Reminder sent via ${channel}`
        : `Reminder recorded (${channel} not delivered - provider not configured)`,
    });
  } catch (err) {
    console.error("remind error", err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

// GET /:id/reminders - Get reminder history
router.get("/:id/reminders", authenticate, async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM invoice_reminders WHERE invoice_id=$1 AND tenant_id=$2 ORDER BY reminded_at DESC LIMIT 10`,
      [id, tenantId]
    ).catch(() => ({ rows: [] }));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// ── AR balance confirmations (auditor-style, one letter per customer) ─────────
// The letter is composed SERVER-SIDE from that customer's real open invoice rows
// (never client-supplied text), so this can't be used as an open relay for arbitrary
// content. But the RECIPIENT is still caller-supplied (email/phone), and a write-role
// user can create unlimited fresh "customers" - so the per-customer cap alone is
// trivially bypassed by spinning a new customer name each time. A tenant-wide cap
// (below) bounds how much of the platform's SHARED Twilio/SMTP identity one tenant
// can spend, independent of how many distinct customer names it invents.

// GET /api/invoices/confirmations/log - latest confirmation sent per customer
router.get("/confirmations/log", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (customer_name) customer_name, channel, sent_to, as_of, total_amount, created_at
       FROM ar_confirmation_log WHERE tenant_id=$1
      ORDER BY customer_name, created_at DESC`,
    [req.user.tenant_id]
  ).catch(() => ({ rows: [] }));
  res.json(rows);
});

// POST /api/invoices/confirmations/send { customer, channel, asOf?, email?, phone? }
router.post("/confirmations/send", authenticate, canWrite, async (req, res) => {
  const tenantId = req.user.tenant_id;
  const customer = String(req.body?.customer || "").trim();
  const channel  = String(req.body?.channel || "").toLowerCase();
  if (!customer) return res.status(400).json({ error: "customer required" });
  if (channel !== "whatsapp" && channel !== "email") {
    return res.status(422).json({ error: "channel must be 'whatsapp' or 'email'" });
  }
  const asOfRaw = String(req.body?.asOf || "").slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : new Date().toISOString().slice(0, 10);

  try {
    // Validate any new contact BEFORE persisting anything - a rejected request must
    // never have a side effect of silently redirecting the customer's real contact.
    const newEmail = String(req.body?.email || "").trim();
    const newPhone = String(req.body?.phone || "").trim();
    let normalizedPhone = null;
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(422).json({ error: "Invalid email" });
    }
    if (newPhone) {
      const digits = newPhone.replace(/[^\d+]/g, "");
      if (!/^\+?[1-9]\d{7,14}$/.test(digits)) return res.status(422).json({ error: "Invalid phone - use country code, e.g. +919876543210" });
      normalizedPhone = digits.startsWith("+") ? digits : `+${digits}`;
    }

    const { rows: open } = await q(tenantId,
      `SELECT invoice_number, total_amount, due_date, created_at, customer_email, customer_phone
         FROM invoices
        WHERE tenant_id=$1 AND customer_name=$2 AND status NOT IN ('paid','cancelled')
        ORDER BY created_at ASC`,
      [tenantId, customer]
    );
    if (!open.length) return res.status(404).json({ error: "No open invoices for this customer" });

    // Spam-guard 1: max 2 confirmations per customer per 7 days.
    const { rows: recent } = await pool.query(
      "SELECT count(*)::int AS n FROM ar_confirmation_log WHERE tenant_id=$1 AND customer_name=$2 AND created_at > now() - interval '7 days'",
      [tenantId, customer]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((recent[0]?.n ?? 0) >= 2) {
      return res.status(429).json({ error: "Already sent 2 confirmations to this customer in the last 7 days." });
    }
    // Spam-guard 2: tenant-wide cap, independent of customer name (which the caller
    // fully controls) - bounds spend against the platform's shared sending identity.
    const tenantCap = await platformConfig.num("limits", "arConfirmationMaxPerTenantPerDay", 20);
    const { rows: tenantRecent } = await pool.query(
      "SELECT count(*)::int AS n FROM ar_confirmation_log WHERE tenant_id=$1 AND created_at > now() - interval '24 hours'",
      [tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (tenantCap > 0 && (tenantRecent[0]?.n ?? 0) >= tenantCap) {
      return res.status(429).json({ error: `This account has sent ${tenantCap} confirmations in the last 24 hours - please try again later.` });
    }

    const total = open.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const firm = (await firmNameOf(tenantId)) || "our company";
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const lines = open.map((r) => `  • ${r.invoice_number} dated ${fmtDate(r.created_at)} - ₹${Number(r.total_amount).toLocaleString("en-IN")}`).join("\n");
    const body = `Dear ${customer},\n\nFor audit purposes, please confirm the balance receivable by ${firm} from you as on ${fmtDate(asOf)}.\n\nAs per our books, the outstanding balance is ₹${total.toLocaleString("en-IN")}, comprising:\n${lines}\n\nKindly reply confirming whether this balance agrees with your records. If you note any discrepancy, please share details.\n\nThank you,\n${firm}`;
    const subject = `Balance confirmation request as on ${fmtDate(asOf)} - ${firm}`;

    let sentTo;
    if (channel === "whatsapp") {
      // Prefer what the caller just typed THIS request over a possibly-stale on-file
      // value - the contact write itself only happens after send succeeds (above),
      // so at send time "on file" may not reflect what the user meant to correct.
      const rawPhone = normalizedPhone || open.find((r) => r.customer_phone)?.customer_phone;
      if (!rawPhone) return res.status(422).json({ error: "No phone on file for this customer - enter one and retry." });
      // Normalize on-file values the same way dunning dispatch does (a stored
      // 10-digit number with no country code would otherwise reach Twilio raw).
      const phone = rawPhone.startsWith("+") ? rawPhone : `+91${rawPhone.replace(/^0+/, "")}`;
      const delivered = await sendWhatsApp(phone, `*${subject}*\n\n${body}`).catch(() => false);
      if (!delivered) return res.status(503).json({ error: "WhatsApp isn't configured on the server (missing Twilio keys) - nothing was sent." });
      sentTo = phone;
    } else {
      const email = newEmail || open.find((r) => r.customer_email)?.customer_email || null;
      if (!email) return res.status(422).json({ error: "No email on file for this customer - enter one and retry." });
      if (!process.env.SMTP_USER) return res.status(503).json({ error: "Email isn't configured on the server (missing SMTP keys) - nothing was sent." });
      const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await sendMail({
        to: email, subject,
        html: `<tr><td style="padding:24px 32px"><p style="font-size:14px;color:#e8e8dc;font-family:system-ui,sans-serif;white-space:pre-wrap;margin:0">${esc(body)}</p></td></tr>`,
      });
      sentTo = email;
    }

    // Only NOW - after every check passed and the send actually went out - persist
    // any new contact details onto the customer's invoice rows.
    if (newEmail) await q(tenantId, "UPDATE invoices SET customer_email=$1 WHERE tenant_id=$2 AND customer_name=$3", [newEmail, tenantId, customer]);
    if (normalizedPhone) await q(tenantId, "UPDATE invoices SET customer_phone=$1 WHERE tenant_id=$2 AND customer_name=$3", [normalizedPhone, tenantId, customer]);

    await pool.query(
      "INSERT INTO ar_confirmation_log(tenant_id, customer_name, channel, sent_to, as_of, total_amount) VALUES($1,$2,$3,$4,$5,$6)",
      [tenantId, customer, channel, sentTo, asOf, total]
    ).catch(() => {});
    res.json({ ok: true, channel, to: sentTo, total, invoices: open.length });
  } catch (err) {
    console.error("ar confirmation error", err);
    res.status(500).json({ error: "Failed to send confirmation" });
  }
});

// POST /api/invoices/:id/send - email invoice
router.post("/:id/send", authenticate, canWrite, async (req, res) => {
  const { rows: [inv] } = await q(req.user.tenant_id,
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (!inv.customer_email) return res.status(400).json({ error: "Invoice has no customer email" });

  // Maker-checker gate: if a "invoice" approval rule matches this amount, the
  // invoice can only be sent once an APPROVED book_approvals row exists for it.
  // This used to be entirely decorative - InvoicesPage.tsx's "route for approval"
  // toggle lived in local KV and this send handler never looked at it at all.
  const auto = require("../modules/books/automation");
  if (await auto.requiresApproval(req.user.tenant_id, "invoice", Number(inv.total_amount))) {
    const { rows: ap } = await pool.query(
      "SELECT 1 FROM book_approvals WHERE tenant_id=$1 AND entity_type='invoice' AND entity_id=$2 AND status='APPROVED' LIMIT 1",
      [req.user.tenant_id, inv.id]
    );
    if (!ap[0]) return res.status(409).json({ error: `This invoice (₹${Number(inv.total_amount).toLocaleString("en-IN")}) needs approval before it can be sent - request approval first`, code: "NEEDS_APPROVAL" });
  }

  // Real credit-limit gate (book_ledgers.credit_limit) - the same check
  // documents.js's convertDocument already applies to estimate/PO-derived
  // invoices, now also covering the direct invoice-create flow this route
  // serves. Gated at SEND, not create, because that's when postInvoiceSale
  // below actually books the receivable - a draft invoice doesn't yet consume
  // credit headroom. Pass overrideCreditLimit:true to push through anyway.
  if (!req.body?.overrideCreditLimit) {
    const { resolvePartyLedgerByName } = require("../modules/books/documents");
    const partyLedgerId = await resolvePartyLedgerByName(req.user.tenant_id, inv.customer_name, "SALES");
    const { rows: cl } = await pool.query("SELECT credit_limit FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [req.user.tenant_id, partyLedgerId]);
    const limit = cl[0] && cl[0].credit_limit ? Number(cl[0].credit_limit) : 0;
    if (limit > 0) {
      const { rows: o } = await pool.query(
        "SELECT COALESCE(SUM(e.debit-e.credit),0) AS bal FROM book_voucher_entries e JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false WHERE e.tenant_id=$1 AND e.ledger_id=$2",
        [req.user.tenant_id, partyLedgerId]
      );
      const outstanding = Number(o[0].bal) || 0;
      if (outstanding + Number(inv.total_amount) > limit) {
        return res.status(409).json({
          error: `Sending this invoice would put ${inv.customer_name} at ₹${(outstanding + Number(inv.total_amount)).toLocaleString("en-IN")} outstanding, over their ₹${limit.toLocaleString("en-IN")} credit limit`,
          code: "CREDIT_LIMIT_EXCEEDED",
        });
      }
    }
  }

  // Report delivery HONESTLY: sendMail silently no-ops when SMTP isn't configured,
  // and the old `.catch(() => {})` + unconditional ok:true told the user their
  // customer was emailed when nothing ever left the server. Status/GL still advance
  // (the invoice IS issued), but the response says whether the email went out.
  let delivered = false;
  if (process.env.SMTP_USER) {
    delivered = await sendMail({
      to:      inv.customer_email,
      subject: `Invoice ${inv.invoice_number} - ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}`,
      text:    `Please find your invoice ${inv.invoice_number} for ₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}. Due by ${inv.due_date || "on receipt"}.`,
      html:    `<p>Dear ${inv.customer_name},</p><p>Please find your invoice <strong>${inv.invoice_number}</strong> for <strong>₹${parseFloat(inv.total_amount).toLocaleString("en-IN")}</strong>.</p><p>Due date: <strong>${inv.due_date || "On receipt"}</strong></p><p>Thank you for your business.</p>`,
    }).then(() => true).catch(() => false);
  }

  await q(req.user.tenant_id, "UPDATE invoices SET status='sent' WHERE id=$1 AND tenant_id=$2", [inv.id, req.user.tenant_id]);
  require("../lib/invoiceGl").postInvoiceSale(req.user.tenant_id, { ...inv, status: "sent" }).catch(() => {}); // accrual: Dr Debtor / Cr Sales + Output GST on issue
  res.json({
    ok: true,
    delivered,
    message: delivered
      ? `Invoice emailed to ${inv.customer_email}`
      : "Invoice marked sent and booked - but the email was NOT delivered (email service not configured). Share the PDF or payment link with the customer yourself.",
  });
});

// POST /api/invoices/:id/upi-link - generate UPI QR (Razorpay optional, fallback to static UPI)
router.post("/:id/upi-link", authenticate, canWrite, async (req, res) => {
  const { rows: [inv] } = await q(req.user.tenant_id,
    "SELECT i.*, kv.value AS kv FROM invoices i LEFT JOIN kv_store kv ON kv.tenant_id=i.tenant_id AND kv.namespace='app' AND kv.key='store' WHERE i.id=$1 AND i.tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const firm = inv.kv?.value?.firm ?? {};
  // Never fabricate a payee VPA - a placeholder/wrong UPI id sends the customer's
  // money to the wrong place. Require the firm's real UPI ID (set in Settings).
  const upiId = firm.upiId || null;
  if (!upiId) return res.status(400).json({ error: "Add your UPI ID in Settings before generating a payment link - we won't send a placeholder account to your customer." });
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(firm.name || "")}&am=${inv.total_amount}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;

  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(upiLink, { width: 200 });
  } catch { /* ok */ }

  await q(req.user.tenant_id, "UPDATE invoices SET upi_link=$1 WHERE id=$2 AND tenant_id=$3", [upiLink, inv.id, req.user.tenant_id]);
  res.json({ upi_link: upiLink, qr: qrDataUrl });
});

// ── Payments / receipts (partial & advance both supported) ──
// GET /:id/payments — the receipt ledger for an invoice + its running balance.
router.get("/:id/payments", authenticate, async (req, res) => {
  try {
  const t = req.user.tenant_id;
  const rows = await withTenant(t, async (client) => {
    const { rows: [inv] } = await client.query("SELECT total_amount, paid_amount, credited_amount FROM invoices WHERE id=$1 AND tenant_id=$2", [req.params.id, t]);
    if (!inv) return null;
    const { rows: pays } = await client.query(
      "SELECT id, amount, mode, reference, received_at, created_at FROM invoice_payments WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY received_at, created_at",
      [t, req.params.id]);
    return {
      total_amount: Number(inv.total_amount), paid_amount: Number(inv.paid_amount || 0),
      credited_amount: Number(inv.credited_amount || 0),
      balance_due: remainingToSettle({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }),
      payments: pays,
    };
  });
  if (!rows) return res.status(404).json({ error: "Invoice not found" });
  res.json(rows);
  } catch (e) { console.error("[invoices] payments list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// POST /:id/payments — record a receipt (partial or full). Updates paid_amount, flips status to
// 'paid' only when fully settled, and posts a GL RECEIPT for THIS amount (idempotent per payment
// id) so the books track partial collection. Overpayment is refused so AR is never driven negative.
router.post("/:id/payments", authenticate, canWrite, idempotent(), async (req, res) => {
  try {
  const t = req.user.tenant_id;
  const amount = round2(req.body?.amount);
  const mode = String(req.body?.mode || "other").toLowerCase();
  const reference = req.body?.reference ? String(req.body.reference).slice(0, 120) : null;
  const receivedAt = req.body?.received_at ? String(req.body.received_at).slice(0, 10) : null;
  if (!(amount > 0)) return res.status(400).json({ error: "amount must be greater than 0" });
  if (!PAY_MODES.has(mode)) return res.status(400).json({ error: `mode must be one of: ${[...PAY_MODES].join(", ")}` });
  if (receivedAt && !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) return res.status(400).json({ error: "received_at must be YYYY-MM-DD" });

  // Shared recorder (lib/receipts.js) — the same code path bank-match uses, so the two
  // can never drift on numbering, guards or status transitions.
  let outcome;
  try {
    outcome = await withTenant(t, (client) =>
      recordReceiptTx(client, t, { invoiceId: req.params.id, amount, mode, reference, receivedAt, userId: req.user.id || null }));
  } catch (e) {
    if (e.code === "NOT_FOUND") return res.status(404).json({ error: "Invoice not found" });
    if (e.code === "CANCELLED" || e.code === "OVERPAYMENT") return res.status(400).json({ error: e.message });
    throw e;
  }

  // GL receipt for THIS payment only, keyed per payment id → no double-post vs the settling receipt.
  require("../lib/invoiceGl").postInvoiceReceipt(t, outcome.inv, { amount: outcome.pay.amount, ref: reference || outcome.inv.invoice_number, idempotencyKey: `recv:inv:${outcome.inv.id}:p:${outcome.pay.id}` }).catch(() => {});
  require("../modules/flows/runner").emitEvent(t, outcome.fullyPaid ? "invoice.paid" : "invoice.payment", { invoice: outcome.inv, payment: outcome.pay }).catch(() => {});
  if (outcome.fullyPaid) require("../modules/lending").onInvoicePaid(t, outcome.inv.id).catch(() => {});
  require("../modules/analytics").track(t, req.user.id, { event: "invoice_payment", props: { amount: outcome.pay.amount, fully_paid: outcome.fullyPaid } }).catch(() => {});
  res.status(201).json({ payment: outcome.pay, invoice: { ...outcome.inv, aging: computeAging(outcome.inv) }, balance_due: remainingToSettle({ total: outcome.inv.total_amount, paidAmount: outcome.inv.paid_amount, creditedAmount: outcome.inv.credited_amount || 0 }) });
  } catch (e) { console.error("[invoices] record payment failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── POST /api/invoices/:id/write-off — stop chasing what you'll never collect ─
// A residual balance (a short payment, a 40-paise round-off leftover, a customer who's
// gone) had no exit: it aged in the receivables report forever. This absorbs the
// outstanding into the invoice's settlement via credited_amount — the SAME field every
// existing aggregate already nets off, so no outstanding calculation anywhere changes —
// while invoice_writeoffs keeps the honest record and the GL books Dr Bad Debts.
// Deliberately NOT a credit note: bad debts don't reverse output GST.
router.post("/:id([0-9a-fA-F-]{36})/write-off", authenticate, canWrite, idempotent(), async (req, res, next) => {
  const t = req.user.tenant_id;
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "A reason is required — an auditor reads these", errors: { reason: "Say why this is being written off" } });
  try {
    const outcome = await withTenant(t, async (client) => {
      const { rows: [inv] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, t]);
      if (!inv) return { notFound: true };
      if (inv.status === "cancelled" || inv.voided_at) return { err: "This invoice is cancelled — there's nothing to write off." };
      const outstanding = remainingToSettle({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 });
      const amount = req.body?.amount != null ? round2(req.body.amount) : outstanding;
      if (!(amount > 0)) return { err: "Nothing is outstanding on this invoice." };
      if (amount > outstanding) return { err: `Only ₹${outstanding.toLocaleString("en-IN")} is outstanding — a write-off can't exceed that.` };

      const { rows: [wo] } = await client.query(
        "INSERT INTO invoice_writeoffs(tenant_id, invoice_id, amount, reason, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [t, inv.id, amount, reason.slice(0, 500), req.user.id]);

      const newCredited = round2(round2(inv.credited_amount || 0) + amount);
      const paid = round2(inv.paid_amount || 0);
      const balanceAfter = round2(round2(inv.total_amount) - newCredited - paid);
      // Same settle rule the credit-note path uses: zero balance with cash collected is
      // "paid"; zero balance with none is effectively closed out.
      const newStatus = balanceAfter <= 0 ? (paid > 0 ? "paid" : "cancelled") : inv.status;
      const { rows: [upd] } = await client.query(
        `UPDATE invoices SET credited_amount=$1, status=$2,
           paid_at=CASE WHEN $2='paid' AND paid_at IS NULL THEN now() ELSE paid_at END
         WHERE id=$3 AND tenant_id=$4 RETURNING *`,
        [newCredited, newStatus, inv.id, t]);
      return { inv: upd, wo, balanceAfter };
    });
    if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
    if (outcome.err) return res.status(400).json({ error: outcome.err });

    require("../lib/invoiceGl").postInvoiceWriteoff(t, outcome.inv, { amount: outcome.wo.amount, writeoffId: outcome.wo.id, reason }).catch(() => {});
    auditReq(req, "written_off", "invoice", req.params.id, { amount: Number(outcome.wo.amount), reason });
    res.status(201).json({ writeoff: outcome.wo, invoice: outcome.inv, balance_due: outcome.balanceAfter });
  } catch (e) { next(e); }
});

// ── Credit notes (real documents: numbered, GL-posted, GSTR-visible) ──
// GET /credit-notes/all — every note for the tenant (newest first), for the tool tab.
router.get("/credit-notes/all", authenticate, async (req, res) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      `SELECT cn.*, i.invoice_number, i.customer_name FROM invoice_credit_notes cn
       JOIN invoices i ON i.id = cn.invoice_id
       WHERE cn.tenant_id=$1 ORDER BY cn.created_at DESC LIMIT 200`,
      [req.user.tenant_id]);
    res.json(rows);
  } catch (e) { console.error("[invoices] credit notes list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// GET /:id/credit-notes — notes against one invoice + how much more is creditable.
router.get("/:id/credit-notes", authenticate, async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const out = await withTenant(t, async (client) => {
      const { rows: [inv] } = await client.query("SELECT total_amount, paid_amount, credited_amount FROM invoices WHERE id=$1 AND tenant_id=$2", [req.params.id, t]);
      if (!inv) return null;
      const { rows: notes } = await client.query(
        "SELECT id, note_number, reason, subtotal, gst_amount, total_amount, created_at FROM invoice_credit_notes WHERE tenant_id=$1 AND invoice_id=$2 ORDER BY created_at",
        [t, req.params.id]);
      return { credited_amount: Number(inv.credited_amount || 0), creditable: creditableBalance({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }), notes };
    });
    if (!out) return res.status(404).json({ error: "Invoice not found" });
    res.json(out);
  } catch (e) { console.error("[invoices] credit notes failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// POST /:id/credit-notes — issue a credit note for `amount` (GST-inclusive) with a reason.
// GST is carved out in the invoice's own proportion, the note gets a CN-YYYY-NNN number, the
// invoice's credited_amount rises (balance = total − paid − credited everywhere), and the GL
// books a CREDIT_NOTE voucher that flows into GSTR-1 CDNR / GSTR-3B 4I via the existing engine.
// Capped at the UNCOLLECTED balance: crediting money already received is a refund — a different,
// payout-gated flow we refuse to fake.
router.post("/:id/credit-notes", authenticate, canWrite, idempotent(), async (req, res) => {
  try {
    const t = req.user.tenant_id;
    const amount = round2(req.body?.amount);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!(amount > 0)) return res.status(400).json({ error: "amount must be greater than 0" });
    if (!reason) return res.status(400).json({ error: "A reason is required on a credit note (it appears on the GST document)." });

    const outcome = await withTenant(t, async (client) => {
      const { rows: [inv] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, t]);
      if (!inv) return { notFound: true };
      if (inv.status === "draft") return { err: "Send the invoice first — a credit note adjusts an ISSUED document." };
      if (inv.status === "cancelled") return { err: "Can't credit a cancelled invoice." };
      const creditable = creditableBalance({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 });
      if (amount > creditable) return { err: `Only ₹${creditable.toLocaleString("en-IN")} is still uncollected on this invoice — a credit note can't exceed that (refunding received money is a separate flow).` };

      // Carve GST out of the credited amount in the invoice's own proportion, so the note's
      // tax exactly reverses its share of the original output GST.
      const gstShare = Number(inv.total_amount) > 0 ? Number(inv.gst_amount) / Number(inv.total_amount) : 0;
      const noteGst = round2(amount * gstShare);
      const noteSubtotal = round2(amount - noteGst);

      // CN-YYYY-NNN per tenant, same style as invoice numbering - and the same
      // race-safety: advisory xact-lock serializes numbering, MAX over all rows,
      // unique index (migration 0031) as the backstop.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${t}:credit-note-number`]);
      const { rows: [mxCn] } = await client.query(
        `SELECT COALESCE(MAX((regexp_match(note_number, 'CN-\\d{4}-(\\d+)$'))[1]::int), 0) AS maxn
           FROM invoice_credit_notes WHERE tenant_id=$1`, [t]);
      const year = new Date().getFullYear();
      const note_number = `CN-${year}-${String(Number(mxCn.maxn) + 1).padStart(3, "0")}`;

      const { rows: [note] } = await client.query(
        "INSERT INTO invoice_credit_notes(tenant_id, invoice_id, note_number, reason, subtotal, gst_amount, total_amount, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [t, inv.id, note_number, reason, noteSubtotal, noteGst, amount, req.user.id || null]);

      const newCredited = round2(round2(inv.credited_amount || 0) + amount);
      const paid = round2(inv.paid_amount || 0);
      const balanceAfter = round2(round2(inv.total_amount) - newCredited - paid);
      // Fully credited with nothing collected → the invoice is voided by the note.
      // Balance zeroed with money collected → settled (cash + adjustment).
      const newStatus = balanceAfter <= 0 ? (paid > 0 ? "paid" : "cancelled") : inv.status;
      const { rows: [upd] } = await client.query(
        `UPDATE invoices SET credited_amount=$1, status=$2,
           paid_at=CASE WHEN $2='paid' AND paid_at IS NULL THEN now() ELSE paid_at END
         WHERE id=$3 AND tenant_id=$4 RETURNING *`,
        [newCredited, newStatus, inv.id, t]);
      return { inv: upd, note, balanceAfter };
    });
    if (outcome.notFound) return res.status(404).json({ error: "Invoice not found" });
    if (outcome.err) return res.status(400).json({ error: outcome.err });

    // GL CREDIT_NOTE voucher (Dr Sales + Output GST / Cr Debtor), idempotent per note id.
    require("../lib/invoiceGl").postInvoiceCreditNote(t, outcome.inv, outcome.note).catch(() => {});
    require("../modules/flows/runner").emitEvent(t, "invoice.credit_note", { invoice: outcome.inv, note: outcome.note }).catch(() => {});
    require("../modules/analytics").track(t, req.user.id, { event: "credit_note_issued", props: { amount: Number(outcome.note.total_amount) } }).catch(() => {});
    res.status(201).json({ note: outcome.note, invoice: { ...outcome.inv, aging: computeAging(outcome.inv) }, balance_due: outcome.balanceAfter });
  } catch (e) { console.error("[invoices] credit note failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Recurring invoice schedules (real generation via the daily books cron) ──
const CADENCES = new Set(["weekly", "monthly", "quarterly"]);

router.get("/recurring", authenticate, async (req, res) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      "SELECT * FROM invoice_recurring WHERE tenant_id=$1 ORDER BY created_at DESC", [req.user.tenant_id]);
    res.json(rows);
  } catch (e) { console.error("[invoices] recurring list failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.post("/recurring", authenticate, canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.filter((i) => i && i.description && parseFloat(i.quantity) > 0 && parseFloat(i.unit_price) >= 0) : [];
    if (!b.customer_name || !items.length) return res.status(400).json({ error: "customer_name and at least one item are required" });
    if (!CADENCES.has(b.cadence)) return res.status(400).json({ error: `cadence must be one of: ${[...CADENCES].join(", ")}` });
    const nextRun = String(b.next_run || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRun)) return res.status(400).json({ error: "next_run must be YYYY-MM-DD" });
    const dom = b.day_of_month != null ? Number(b.day_of_month) : Number(nextRun.slice(8, 10));
    if (!(dom >= 1 && dom <= 31)) return res.status(400).json({ error: "day_of_month must be 1-31" });
    if (b.auto_send && !b.customer_email) return res.status(400).json({ error: "auto_send needs a customer email to send to." });
    const { rows: [row] } = await q(req.user.tenant_id,
      `INSERT INTO invoice_recurring(tenant_id, customer_name, customer_gstin, customer_email, customer_phone,
         gst_rate, items, cadence, day_of_month, next_run, due_in_days, auto_send, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.tenant_id, String(b.customer_name).trim(), b.customer_gstin || null, b.customer_email || null,
       b.customer_phone || null, Number(b.gst_rate) || 18, JSON.stringify(items), b.cadence, dom, nextRun,
       Math.min(Math.max(Number(b.due_in_days) || 15, 0), 180), !!b.auto_send, req.user.id || null]);
    res.status(201).json(row);
  } catch (e) { console.error("[invoices] recurring create failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.patch("/recurring/:rid", authenticate, canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    // Only the safe, individually-validated fields are patchable.
    const sets = [], vals = [];
    const put = (col, val) => { vals.push(val); sets.push(`${col}=$${vals.length}`); };
    if (b.active != null) put("active", !!b.active);
    if (b.auto_send != null) put("auto_send", !!b.auto_send);
    if (b.next_run != null) {
      const d = String(b.next_run).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: "next_run must be YYYY-MM-DD" });
      put("next_run", d);
    }
    if (b.cadence != null) {
      if (!CADENCES.has(b.cadence)) return res.status(400).json({ error: `cadence must be one of: ${[...CADENCES].join(", ")}` });
      put("cadence", b.cadence);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
    vals.push(req.params.rid, req.user.tenant_id);
    const { rows: [row] } = await q(req.user.tenant_id,
      `UPDATE invoice_recurring SET ${sets.join(", ")} WHERE id=$${vals.length - 1} AND tenant_id=$${vals.length} RETURNING *`, vals);
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    res.json(row);
  } catch (e) { console.error("[invoices] recurring patch failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

router.delete("/recurring/:rid", authenticate, canWrite, async (req, res) => {
  try {
    const { rowCount } = await q(req.user.tenant_id,
      "DELETE FROM invoice_recurring WHERE id=$1 AND tenant_id=$2", [req.params.rid, req.user.tenant_id]);
    if (!rowCount) return res.status(404).json({ error: "Schedule not found" });
    res.status(204).end();
  } catch (e) { console.error("[invoices] recurring delete failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// Generate this schedule's invoice NOW (doesn't wait for the cron); advances next_run.
router.post("/recurring/:rid/run-now", authenticate, canWrite, async (req, res) => {
  try {
    const inv = await require("../lib/recurringInvoices").generateForSchedule(req.user.tenant_id, req.params.rid, { force: true });
    if (!inv) return res.status(400).json({ error: "Schedule not found, inactive, or has no items." });
    res.status(201).json(inv);
  } catch (e) { console.error("[invoices] recurring run-now failed:", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── PUT /api/invoices/:id — edit the document, keeping what it used to say ───
// Editing an invoice used to be impossible (PATCH only flipped status), so a typo in a
// customer's name or a wrong rate meant deleting and re-raising — which burned an invoice
// number. Now the PREVIOUS state is snapshotted into invoice_revisions first, so the trail
// can always reconstruct the document as it was issued.
//
// Refused once money or tax has moved: an invoice that has been paid, part-paid, credited
// or voided must be corrected with a credit note, not edited in place.
router.put("/:id([0-9a-fA-F-]{36})", authenticate, canWrite, async (req, res, next) => {
  const tenantId = req.user.tenant_id;
  try {
    const out = await withTenant(tenantId, async (client) => {
      const { rows: [cur] } = await client.query(
        "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, tenantId]);
      if (!cur) throw Object.assign(new Error("Invoice not found"), { status: 404 });
      if (cur.voided_at) throw Object.assign(new Error("This invoice is void and can't be edited"), { status: 409 });
      if (cur.status === "paid" || Number(cur.paid_amount) > 0 || Number(cur.credited_amount) > 0)
        throw Object.assign(new Error("Money has already moved against this invoice. Issue a credit note instead of editing it."), { status: 409 });

      const { rows: oldItems } = await client.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id", [cur.id]);
      await client.query(
        `INSERT INTO invoice_revisions(tenant_id, invoice_id, version, snapshot, reason, changed_by)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [tenantId, cur.id, cur.version, { invoice: cur, items: oldItems }, req.body?.reason || null, req.user.id]);

      const b = req.body || {};
      const items = Array.isArray(b.items) && b.items.length ? b.items : oldItems;
      const pos = b.place_of_supply_code !== undefined ? b.place_of_supply_code : cur.place_of_supply_code;
      const totals = computeInvoice({
        items,
        gst_rate: b.gst_rate ?? cur.gst_rate,
        discount_amount: b.discount_amount ?? cur.discount_amount,
        shipping_amount: b.shipping_amount ?? cur.shipping_amount,
        place_of_supply_code: pos,
        seller_state_code: await sellerStateCode(client, tenantId),
        reverse_charge: b.reverse_charge ?? cur.reverse_charge,
        round_off_enabled: b.round_off_enabled !== false,
      });

      const { rows: [upd] } = await client.query(
        `UPDATE invoices SET
           customer_name=$3, customer_gstin=$4, customer_email=$5, customer_phone=$6,
           invoice_date=$7, due_date=$8, gst_rate=$9, place_of_supply_code=$10, is_inter_state=$11,
           reverse_charge=$12, subtotal=$13, gst_amount=$14, cgst_amount=$15, sgst_amount=$16,
           igst_amount=$17, discount_amount=$18, shipping_amount=$19, round_off=$20, total_amount=$21,
           po_number=$22, reference=$23, terms=$24, notes=$25, currency=$26,
           version = version + 1, updated_at = now()
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [cur.id, tenantId,
         b.customer_name ?? cur.customer_name, b.customer_gstin ?? cur.customer_gstin,
         b.customer_email ?? cur.customer_email, b.customer_phone ?? cur.customer_phone,
         b.invoice_date ?? cur.invoice_date, b.due_date ?? cur.due_date,
         b.gst_rate ?? cur.gst_rate, pos, totals.is_inter_state,
         b.reverse_charge ?? cur.reverse_charge,
         totals.taxable_total, totals.gst_amount, totals.cgst_amount, totals.sgst_amount,
         totals.igst_amount, totals.discount_amount, totals.shipping_amount, totals.round_off, totals.total_amount,
         b.po_number ?? cur.po_number, b.reference ?? cur.reference,
         b.terms ?? cur.terms, b.notes ?? cur.notes, b.currency ?? cur.currency]);

      if (Array.isArray(b.items) && b.items.length) {
        await client.query("DELETE FROM invoice_items WHERE invoice_id=$1", [cur.id]);
        for (const line of totals.lines) {
          await client.query(
            `INSERT INTO invoice_items(invoice_id, description, hsn_sac, quantity, unit_price, gst_rate, amount,
               uom, discount_pct, discount_amount, taxable_value, tax_amount)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [cur.id, line.description, line.hsn_sac ?? null, line.quantity, line.unit_price, line.taxRate,
             line.taxable_value, line.uom ?? null, line.discount_pct, line.discount_amount, line.taxable_value, line.tax_amount]);
        }
      }
      return upd;
    });
    auditReq(req, "updated", "invoice", req.params.id, { version: out.version, reason: req.body?.reason || null });
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── GET /api/invoices/:id/revisions — what this invoice used to say ──────────
router.get("/:id([0-9a-fA-F-]{36})/revisions", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      `SELECT r.id, r.version, r.reason, r.changed_at, r.changed_by, u.email AS changed_by_email,
              r.snapshot->'invoice'->>'total_amount'   AS total_amount,
              r.snapshot->'invoice'->>'customer_name'  AS customer_name,
              r.snapshot->'invoice'->>'invoice_date'   AS invoice_date
         FROM invoice_revisions r LEFT JOIN users u ON u.id = r.changed_by
        WHERE r.invoice_id=$1 AND r.tenant_id=$2 ORDER BY r.version DESC`,
      [req.params.id, req.user.tenant_id]);
    res.json(rows);
  } catch (e) { next(e); }
});

// ── POST /api/invoices/:id/void — cancel WITHOUT destroying the number ───────
// "Cancelling" used to mean deleting, which punched a hole in the invoice sequence — the
// one thing a numbered statutory document must never have. A void keeps the number and the
// paper trail, and records who voided it and why.
router.post("/:id([0-9a-fA-F-]{36})/void", authenticate, canWrite, async (req, res, next) => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "A reason is required to void an invoice", errors: { reason: "Say why this is being voided" } });
  try {
    const out = await withTenant(req.user.tenant_id, async (client) => {
      const { rows: [cur] } = await client.query("SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [req.params.id, req.user.tenant_id]);
      if (!cur) throw Object.assign(new Error("Invoice not found"), { status: 404 });
      if (cur.voided_at) throw Object.assign(new Error("This invoice is already void"), { status: 409 });
      if (Number(cur.paid_amount) > 0)
        throw Object.assign(new Error(`${cur.invoice_number} has received payment. Refund it or raise a credit note — voiding would hide money that actually moved.`), { status: 409 });
      const { rows: [upd] } = await client.query(
        `UPDATE invoices SET status='cancelled', voided_at=now(), voided_by=$3, void_reason=$4, updated_at=now()
          WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [cur.id, req.user.tenant_id, req.user.id, reason.slice(0, 500)]);
      return upd;
    });
    auditReq(req, "voided", "invoice", req.params.id, { reason, invoice_number: out.invoice_number });
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ── GET /api/invoices/summary — the KPI numbers, computed in SQL ─────────────
// The Invoices page used to add up its own header figures by pulling EVERY invoice into
// the browser. Those three numbers are three aggregates; doing them here means the page
// can fetch one page of rows and still show totals for the whole book.
//
// Outstanding is total − received − credited, floored at zero, which is the same
// definition the per-row "due" figure uses (lib/invoicePaymentMath).
router.get("/summary", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id, `
      WITH o AS (
        SELECT status, due_date, total_amount, paid_amount, COALESCE(credited_amount,0) AS credited_amount,
               GREATEST(total_amount - paid_amount - COALESCE(credited_amount,0), 0) AS outstanding
          FROM invoices WHERE tenant_id=$1
      )
      SELECT
        count(*)::int                                                              AS total_count,
        count(*) FILTER (WHERE status NOT IN ('paid','cancelled'))::int            AS open_count,
        count(*) FILTER (WHERE status NOT IN ('paid','cancelled')
                           AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::int AS overdue_count,
        count(*) FILTER (WHERE status='paid')::int                                 AS paid_count,
        count(*) FILTER (WHERE status='draft')::int                                AS draft_count,
        COALESCE(sum(outstanding) FILTER (WHERE status NOT IN ('paid','cancelled')),0)   AS pending_amount,
        COALESCE(sum(outstanding) FILTER (WHERE status NOT IN ('paid','cancelled')
                           AND due_date IS NOT NULL AND due_date < CURRENT_DATE),0)      AS overdue_amount,
        COALESCE(sum(paid_amount) FILTER (WHERE status='paid'),0)                        AS paid_amount,
        -- Of the "pending" figure, how much is still an UNISSUED draft. A draft is not a
        -- legal claim on anyone, so counting it as a receivable overstates AR — the
        -- customer portal deliberately excludes drafts. Surfaced separately here rather
        -- than silently changing a number the whole app has always computed this way.
        COALESCE(sum(outstanding) FILTER (WHERE status='draft'),0)                       AS draft_amount
      FROM o`, [req.user.tenant_id]);
    const r = rows[0];
    res.json({
      counts: { total: r.total_count, open: r.open_count, overdue: r.overdue_count, paid: r.paid_count, draft: r.draft_count },
      pending: Number(r.pending_amount), overdue: Number(r.overdue_amount), paid: Number(r.paid_amount),
      draft_amount: Number(r.draft_amount),
      as_of: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

// ── GET /api/invoices/:id — one invoice, everything about it ─────────────────
// There was no way to fetch a single invoice: the UI had to pull the whole list and find
// the row client-side, which is also why no invoice had a URL of its own. Registered
// LAST and constrained to a UUID so it can never shadow /recurring, /credit-notes/all or
// /confirmations/log above.
router.get("/:id([0-9a-fA-F-]{36})", authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;
    const { rows } = await q(tenantId,
      `SELECT i.*, COALESCE(json_agg(ii ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]'::json) AS items
         FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE i.id=$1 AND i.tenant_id=$2 GROUP BY i.id`,
      [req.params.id, tenantId]);
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const [payments, notes, reminders] = await Promise.all([
      q(tenantId, "SELECT * FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2 ORDER BY received_at, created_at", [inv.id, tenantId]).then(r => r.rows).catch(() => []),
      q(tenantId, "SELECT * FROM invoice_credit_notes WHERE invoice_id=$1 AND tenant_id=$2 ORDER BY created_at", [inv.id, tenantId]).then(r => r.rows).catch(() => []),
      q(tenantId, "SELECT * FROM invoice_reminders WHERE invoice_id=$1 AND tenant_id=$2 ORDER BY reminded_at DESC LIMIT 20", [inv.id, tenantId]).then(r => r.rows).catch(() => []),
    ]);

    res.json({
      ...inv,
      aging: computeAging(inv),
      items: inv.items ?? [],
      payments, credit_notes: notes, reminders,
      outstanding: remainingToSettle({ total: inv.total_amount, paidAmount: inv.paid_amount || 0, creditedAmount: inv.credited_amount || 0 }),
    });
  } catch (e) { next(e); }
});

// ── GET /api/invoices/:id/payments/:paymentId/receipt — a receipt to hand over ─
// A customer who paid got no acknowledgement from the system. This is the printable
// proof: numbered, dated, amount in words, tied to its invoice.
router.get("/:id([0-9a-fA-F-]{36})/payments/:paymentId/receipt", authenticate, async (req, res, next) => {
  try {
    const t = req.user.tenant_id;
    const { rows: [p] } = await q(t,
      `SELECT p.*, i.invoice_number, i.customer_name, i.total_amount, i.paid_amount, i.credited_amount
         FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE p.id=$1 AND p.invoice_id=$2 AND p.tenant_id=$3`,
      [req.params.paymentId, req.params.id, t]);
    if (!p) return res.status(404).json({ error: "Receipt not found" });

    const { rows: kv } = await pool.query(
      "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store' LIMIT 1", [t]);
    const firm = kv[0]?.value?.value?.firm ?? {};
    const { renderReceiptPdf } = require("../lib/invoicePdf");
    renderReceiptPdf(res, { payment: p, firmName: firm.name || "Your Company", firmGstin: firm.gstNumber || null });
  } catch (e) { next(e); }
});

module.exports = router;
