const router   = require("express").Router();
const QRCode   = require("qrcode");
const { pool } = require("../db");
const { q, withTenant } = require("../lib/tenantDb"); // invoices is FORCE-RLS (0015) — access sets the tenant GUC
const { round2, remainingToSettle, effectiveTotal } = require("../lib/invoicePaymentMath");
const { authenticate } = require("../middleware/auth");
const crypto   = require("crypto");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant","sales"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

// POST /api/collections/upi-link
router.post("/upi-link", authenticate, canWrite, async (req, res) => {
  const { invoice_id, amount } = req.body;
  if (!invoice_id) return res.status(400).json({ error: "invoice_id required" });

  const { rows: [inv] } = await q(req.user.tenant_id,
    "SELECT i.*, kv.value AS kv FROM invoices i LEFT JOIN kv_store kv ON kv.tenant_id=i.tenant_id AND kv.namespace='app' AND kv.key='store' WHERE i.id=$1 AND i.tenant_id=$2",
    [invoice_id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const payAmt = amount ?? inv.total_amount;
  const firm   = inv.kv?.value?.firm ?? {};

  // Production: call Razorpay Payment Links API
  // POST https://api.razorpay.com/v1/payment_links
  // auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET }
  let razorpay_url = null;
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
      const resp = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        },
        body: JSON.stringify({
          amount:      Math.round(payAmt * 100), // paise
          currency:    "INR",
          description: `Payment for ${inv.invoice_number}`,
          reference_id: inv.invoice_number,
          // Carry the tenant so the webhook matches the RIGHT tenant's invoice -
          // invoice_number is not globally unique across tenants.
          notes: { invoice_number: inv.invoice_number, tenant_id: req.user.tenant_id },
          callback_url:  `${process.env.BACKEND_URL ?? ""}/webhook/razorpay`,
          callback_method: "get",
          notify: { sms: false, email: !!inv.customer_email },
          customer: inv.customer_email ? { email: inv.customer_email, name: inv.customer_name } : undefined,
        }),
      });
      const data = await resp.json();
      razorpay_url = data.short_url ?? null;
    } catch { /* fallback to UPI */ }
  }

  // Fallback: static UPI deep-link, using ONLY the firm's own UPI ID. This used to
  // also fall back to a platform-wide super-admin-configured UPI ID when the firm
  // hadn't set one - meaning a customer paying a tenant's invoice could have their
  // money land in an account that ISN'T that tenant's, with no reconciliation
  // mechanism anywhere to get it back to them. Hard-fail instead: never send a
  // customer's payment anywhere but the business's own, explicitly-configured VPA.
  const upiId   = firm.upiId || null;
  const payee   = firm.name || "";
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${payAmt}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`
    : null;
  const payUrl  = razorpay_url || upiLink;
  if (!payUrl) {
    return res.status(400).json({ error: "No payment method set up yet - add your own UPI ID in Settings, or connect Razorpay." });
  }
  const qr = await QRCode.toDataURL(payUrl, { width: 200 }).catch(() => null);

  await q(req.user.tenant_id, "UPDATE invoices SET upi_link=$1 WHERE id=$2 AND tenant_id=$3", [payUrl, inv.id, req.user.tenant_id]);
  res.json({ url: payUrl, qr, provider: razorpay_url ? "razorpay" : "upi", demo: !razorpay_url });
});

// POST /webhook/razorpay - Razorpay payment captured webhook.
// FAIL CLOSED: a "payment.captured" event marks an invoice paid, so we must not
// trust it unless the HMAC signature verifies. Without a configured webhook
// secret we cannot verify authenticity → refuse (else anyone could forge a
// captured event and mark any invoice paid).
router.post("/", async (req, res) => {
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = String(req.headers["x-razorpay-signature"] || "");
  if (!secret) return res.status(503).json({ error: "Webhook not configured" });
  // HMAC over the exact raw bytes Razorpay signed (set in server.js).
  const payload  = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signature);
  if (expBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expBuf, gotBuf)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  const event   = req.body.event;
  const payment = req.body.payload?.payment?.entity;

  // Crowdfunding pledge settlement - notes set by /api/campaigns/public/:token/pledge.
  // markPledgePaid is idempotent (status<>'paid' guard + unique payment_ref) and
  // tenant-scoped (updates only a backer in notes.tenant_id whose id matches), so a
  // webhook retry or a forged note can't double-count or cross tenants.
  if (event === "payment.captured" && payment && payment.notes?.k === "crowd" && payment.notes?.backer_id && payment.notes?.tenant_id) {
    try {
      const crowd = require("../modules/crowdfunding");
      const r = await crowd.markPledgePaid(payment.notes.tenant_id, { backerId: payment.notes.backer_id, paymentRef: payment.id });
      return res.json({ ok: true, kind: "crowdfunding", ...r });
    } catch (e) {
      console.error("[razorpay] crowdfunding settle failed:", e.message);
      return res.status(500).json({ error: "settle failed" }); // 5xx → Razorpay retries (idempotent)
    }
  }

  if (event === "payment.captured" && payment) {
    const invoiceNumber = payment.description?.match(/INV-\d{4}-\d+/)?.[0] ?? payment.notes?.invoice_number;
    const noteTenant    = payment.notes?.tenant_id ?? null;
    if (invoiceNumber) {
      // invoice_number is NOT globally unique, so matching it alone could mark a
      // DIFFERENT tenant's invoice paid. Prefer the tenant from the link's notes;
      // legacy links with no tenant note cannot be resolved safely under FORCE-RLS.
      if (!noteTenant) {
        console.warn(`[razorpay] payment for ${invoiceNumber} has no tenant note - cannot reconcile under RLS; skipping (use a current-generation payment link).`);
      } else {
        // Apply the capture as a RECEIPT under a row lock, exactly like the manual partial
        // path, so a concurrent partial/mark-paid can never double-book (the lock serializes
        // them; each books only what is outstanding at ITS turn). Records what the customer
        // ACTUALLY paid (payment.amount, capped at the balance), inserts the invoice_payments
        // row so sum(receipts)==paid_amount stays true, and flips to 'paid' only when settled.
        const ref = `rzp_${payment.id}`;
        const outcome = await withTenant(noteTenant, async (client) => {
          const { rows: [cur] } = await client.query(
            "SELECT * FROM invoices WHERE invoice_number=$1 AND tenant_id=$2 LIMIT 1 FOR UPDATE",
            [invoiceNumber, noteTenant]);
          if (!cur) return null;
          // A cancelled invoice must NOT be resurrected by a late capture on an old link.
          if (cur.status === "paid" || cur.status === "cancelled") return { skip: cur.status };
          // Webhook retry dedup: this Razorpay payment id is already recorded on this invoice.
          const { rows: dup } = await client.query(
            "SELECT 1 FROM invoice_payments WHERE tenant_id=$1 AND invoice_id=$2 AND reference=$3 LIMIT 1",
            [noteTenant, cur.id, ref]);
          if (dup[0]) return { skip: "duplicate" };
          const remaining = remainingToSettle({ total: cur.total_amount, paidAmount: cur.paid_amount || 0, creditedAmount: cur.credited_amount || 0 });
          // Cap at the outstanding balance so AR is never driven negative even if partial
          // receipts landed after the link was minted for the full amount.
          const received = round2((Number(payment.amount) || 0) / 100);
          const applied = Math.min(received, remaining);
          if (!(applied > 0)) return { skip: "nothing_outstanding" };
          const { rows: [pay] } = await client.query(
            "INSERT INTO invoice_payments(tenant_id, invoice_id, amount, mode, reference) VALUES($1,$2,$3,'upi',$4) RETURNING *",
            [noteTenant, cur.id, applied, ref]);
          const newPaid = round2(round2(cur.paid_amount || 0) + applied);
          const fullyPaid = newPaid >= effectiveTotal({ total: cur.total_amount, creditedAmount: cur.credited_amount || 0 });
          const { rows: [upd] } = await client.query(
            `UPDATE invoices SET paid_amount=$1,
               status=CASE WHEN $2 THEN 'paid' WHEN status='draft' THEN 'sent' ELSE status END,
               paid_at=CASE WHEN $2 THEN now() ELSE paid_at END
             WHERE id=$3 AND tenant_id=$4 RETURNING *`,
            [newPaid, fullyPaid, cur.id, noteTenant]);
          return { inv: upd, pay, fullyPaid, overCapture: round2(received - applied) };
        }).catch((e) => { console.error("[razorpay] settle failed:", e.message); return null; });

        if (outcome?.inv) {
          const { inv, pay, fullyPaid, overCapture } = outcome;
          if (overCapture > 0) console.warn(`[razorpay] ${invoiceNumber}: captured ₹${overCapture} more than the outstanding balance — recorded only the balance; reconcile the excess manually.`);
          require("../modules/flows/runner").emitEvent(inv.tenant_id, fullyPaid ? "invoice.paid" : "invoice.payment", { invoice: inv, payment: pay }).catch(() => {});
          // GL receipt for THIS capture only (books the SALES voucher first if needed). Keyed per
          // invoice_payments row — unique like the manual partial path; retries were already
          // deduped by the reference check above. Best-effort: never blocks the 200 to Razorpay.
          require("../lib/invoiceGl").postInvoiceReceipt(inv.tenant_id, inv, { amount: pay.amount, ref, idempotencyKey: `recv:inv:${inv.id}:p:${pay.id}` }).catch(() => {});
          // Invoice-financing wedge: if this invoice backs an active advance, auto-recover it
          // (self-liquidating). onInvoicePaid self-dedups vs the manual mark-paid path.
          if (fullyPaid) require("../modules/lending").onInvoicePaid(inv.tenant_id, inv.id).catch(() => {});
          console.log(`[razorpay] Invoice ${invoiceNumber} (tenant ${inv.tenant_id}) received ₹${pay.amount}${fullyPaid ? " - fully paid" : ` - ₹${round2(Number(inv.total_amount) - Number(inv.paid_amount))} still due`}`);
        } else if (outcome?.skip) {
          console.log(`[razorpay] Invoice ${invoiceNumber}: capture skipped (${outcome.skip}).`);
        }
      }
    }
  }

  // ── Subscription lifecycle (Headroom's OWN plan billing, not a customer invoice) ──
  // Same signature already verified above. Dedup via X-Razorpay-Event-Id (Razorpay
  // retries on any non-2xx/timeout) - when the header is absent we still process, since
  // every branch below writes an ABSOLUTE new state (not an increment), so a duplicate
  // delivery is harmless rather than double-applying.
  if (event && event.startsWith("subscription.")) {
    const eventId = req.headers["x-razorpay-event-id"];
    if (eventId) {
      const { rows: ins } = await pool.query(
        "INSERT INTO razorpay_webhook_events(event_id, event_type) VALUES($1,$2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
        [eventId, event]
      );
      if (!ins.length) return res.json({ ok: true, dedup: true });
    }
    const sub = req.body.payload?.subscription?.entity;
    const chargedPayment = req.body.payload?.payment?.entity; // present on subscription.charged - the actual per-cycle charge
    const subId = sub?.id;
    if (subId) {
      try { await require("../lib/subscriptionLifecycle").handleWebhookEvent(event, sub, chargedPayment); }
      catch (e) { console.error(`[razorpay] subscription event ${event} for ${subId} failed:`, e.message); return res.status(500).json({ error: "handler failed" }); }
    }
  }

  res.json({ ok: true });
});

// GET /api/collections/pending
router.get("/pending", authenticate, async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const { rows } = await q(req.user.tenant_id,
    `SELECT *, CURRENT_DATE - due_date::date AS days_overdue
     FROM invoices
     WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled')
     ORDER BY due_date ASC NULLS LAST`,
    [req.user.tenant_id]
  );
  res.json(rows.map(r => ({
    ...r,
    aging: !r.due_date ? "no_due_date"
         : r.due_date > today ? "current"
         : r.days_overdue <= 30 ? "30d"
         : r.days_overdue <= 60 ? "60d"
         : "90d+",
  })));
});

// Counterparty PAN-dedupe / entity-group detection (same PAN across GSTINs or name variants).
router.get("/entity-groups", authenticate, async (req, res) => {
  try { res.json(await require("../lib/counterpartyDedupe").entityGroups(req.user.tenant_id)); }
  catch (e) { console.error("[collections] entity-groups", e.message); res.status(500).json({ error: "Internal error" }); }
});
// Per-customer payment-behaviour scores (worst payers first) + a portfolio receivables-quality
// summary — the collections work-list, and a signal underwriting can fold in.
router.get("/customer-scores", authenticate, async (req, res) => {
  try {
    const cs = require("../lib/customerScore");
    const [customers, portfolio] = await Promise.all([
      cs.customerScores(req.user.tenant_id),
      cs.receivablesQuality(req.user.tenant_id),
    ]);
    res.json({ customers, portfolio });
  } catch (e) { console.error("[collections] customer-scores", e.message); res.status(500).json({ error: "Internal error" }); }
});

module.exports = router;
