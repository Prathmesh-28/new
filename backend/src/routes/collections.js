const router   = require("express").Router();
const QRCode   = require("qrcode");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const crypto   = require("crypto");

const WRITE_ROLES = ["super_admin","owner","finance_manager","accountant","sales"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

// Platform-default collection details the super-admin sets in the console
// (Admin → Payments & collections). Used when a business hasn't set its own UPI.
async function platformPayments() {
  try {
    const { rows } = await pool.query("SELECT value FROM platform_settings WHERE key='payments'");
    return rows[0]?.value || {};
  } catch { return {}; }
}

// POST /api/collections/upi-link
router.post("/upi-link", authenticate, canWrite, async (req, res) => {
  const { invoice_id, amount } = req.body;
  if (!invoice_id) return res.status(400).json({ error: "invoice_id required" });

  const { rows: [inv] } = await pool.query(
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
          // Carry the tenant so the webhook matches the RIGHT tenant's invoice —
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

  // Fallback: static UPI deep-link. Use the firm's own UPI ID first, else the
  // platform default the super-admin set in the console. Never a placeholder — a
  // wrong VPA would send the customer's money to the wrong place.
  const platformPay = await platformPayments();
  const upiId   = firm.upiId || platformPay.upiId || null;
  const payee   = firm.name || platformPay.payeeName || "";
  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=${payAmt}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`
    : null;
  const payUrl  = razorpay_url || upiLink;
  if (!payUrl) {
    return res.status(400).json({ error: "No payment method set up yet — add your UPI ID in Settings, or ask your admin to set a default UPI ID in the console (Admin → Payments), or connect Razorpay." });
  }
  const qr = await QRCode.toDataURL(payUrl, { width: 200 }).catch(() => null);

  await pool.query("UPDATE invoices SET upi_link=$1 WHERE id=$2 AND tenant_id=$3", [payUrl, inv.id, req.user.tenant_id]);
  res.json({ url: payUrl, qr, provider: razorpay_url ? "razorpay" : "upi", demo: !razorpay_url });
});

// POST /webhook/razorpay — Razorpay payment captured webhook.
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

  if (event === "payment.captured" && payment) {
    const invoiceNumber = payment.description?.match(/INV-\d{4}-\d+/)?.[0] ?? payment.notes?.invoice_number;
    const noteTenant    = payment.notes?.tenant_id ?? null;
    if (invoiceNumber) {
      // invoice_number is NOT globally unique, so matching it alone could mark a
      // DIFFERENT tenant's invoice paid. Prefer the tenant from the link's notes;
      // for legacy links with no tenant, only proceed if exactly ONE invoice matches.
      let inv = null;
      if (noteTenant) {
        const { rows } = await pool.query(
          "SELECT * FROM invoices WHERE invoice_number=$1 AND tenant_id=$2 AND status != 'paid' LIMIT 1",
          [invoiceNumber, noteTenant]
        );
        inv = rows[0] ?? null;
      } else {
        const { rows } = await pool.query(
          "SELECT * FROM invoices WHERE invoice_number=$1 AND status != 'paid'",
          [invoiceNumber]
        );
        if (rows.length === 1) inv = rows[0];
        else if (rows.length > 1) console.warn(`[razorpay] invoice_number ${invoiceNumber} is ambiguous across ${rows.length} tenants and the payment has no tenant note — skipping to avoid a cross-tenant write`);
      }
      if (inv) {
        await pool.query(
          "UPDATE invoices SET status='paid', paid_at=now() WHERE id=$1 AND tenant_id=$2",
          [inv.id, inv.tenant_id]
        );
        // Create revenue transaction in KV store is done client-side via polling
        // Could also push via Server-Sent Events or WebSocket in production
        console.log(`[razorpay] Invoice ${invoiceNumber} (tenant ${inv.tenant_id}) marked paid — ₹${payment.amount / 100}`);
      }
    }
  }

  res.json({ ok: true });
});

// GET /api/collections/pending
router.get("/pending", authenticate, async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const { rows } = await pool.query(
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

module.exports = router;
