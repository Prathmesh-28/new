const router   = require("express").Router();
const QRCode   = require("qrcode");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const crypto   = require("crypto");

// POST /api/collections/upi-link
router.post("/upi-link", authenticate, requireOwnerOrAdmin, async (req, res) => {
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

  // Fallback: static UPI deep-link
  const upiId   = firm.upiId || "headroom@upi";
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(firm.name || "Headroom")}&am=${payAmt}&tn=${encodeURIComponent(inv.invoice_number)}&cu=INR`;
  const qr      = await QRCode.toDataURL(razorpay_url || upiLink, { width: 200 }).catch(() => null);

  await pool.query("UPDATE invoices SET upi_link=$1 WHERE id=$2", [razorpay_url || upiLink, inv.id]);
  res.json({ url: razorpay_url || upiLink, qr, provider: razorpay_url ? "razorpay" : "upi", demo: !razorpay_url });
});

// POST /webhook/razorpay — Razorpay payment captured webhook
router.post("/", async (req, res) => {
  // Verify signature
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  if (secret && signature) {
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (expected !== signature) return res.status(403).json({ error: "Invalid signature" });
  }

  const event   = req.body.event;
  const payment = req.body.payload?.payment?.entity;

  if (event === "payment.captured" && payment) {
    const invoiceNumber = payment.description?.match(/INV-\d{4}-\d+/)?.[0] ?? payment.notes?.invoice_number;
    if (invoiceNumber) {
      const { rows: [inv] } = await pool.query(
        "SELECT * FROM invoices WHERE invoice_number=$1 AND status != 'paid' LIMIT 1",
        [invoiceNumber]
      );
      if (inv) {
        await pool.query(
          "UPDATE invoices SET status='paid', paid_at=now() WHERE id=$1",
          [inv.id]
        );
        // Create revenue transaction in KV store is done client-side via polling
        // Could also push via Server-Sent Events or WebSocket in production
        console.log(`[razorpay] Invoice ${invoiceNumber} marked paid — ₹${payment.amount / 100}`);
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
