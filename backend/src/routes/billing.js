const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const razorpay = require("../lib/razorpay");

const VALID_PLANS = ["growth", "pro"];

// Plan pricing in the smallest currency unit (paise for INR). Must match the
// amounts shown on the landing page / billing card.
const PLAN_PRICING = {
  growth: { inr: 99900 },  // ₹999 / month
  pro:    { inr: 299900 }, // ₹2,999 / month
};

// Persist a plan to a tenant: updates the billing record AND every user in the
// tenant (so each team member's entitlements reflect the company subscription).
async function applyPlan(tenantId, plan, { provider = "razorpay", razorpayPaymentId, status, periodEnd } = {}) {
  await pool.query(`
    INSERT INTO tenant_billing(tenant_id, plan, provider, razorpay_payment_id, status, current_period_end, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT(tenant_id) DO UPDATE SET
      plan=$2,
      provider=$3,
      razorpay_payment_id=COALESCE($4, tenant_billing.razorpay_payment_id),
      status=COALESCE($5, tenant_billing.status),
      current_period_end=COALESCE($6, tenant_billing.current_period_end),
      updated_at=now()
  `, [tenantId, plan, provider, razorpayPaymentId || null, status || null,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null]);
  await pool.query("UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2", [plan, tenantId]);
}

// GET /api/billing/current — the tenant's current plan + status
router.get("/current", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT plan, status, current_period_end, provider FROM tenant_billing WHERE tenant_id=$1",
    [req.user.tenant_id]
  );
  const b = rows[0] || {};
  res.json({
    plan: b.plan || req.user.subscription_plan || "free",
    status: b.status || null,
    current_period_end: b.current_period_end || null,
    provider: b.provider || null,
    configured: razorpay.isConfigured(),
  });
});

// ── Razorpay Standard Checkout (subscription upgrades) ──────────────────────
// India-first gateway: UPI / cards / netbanking / wallets. One-time Standard
// Checkout per period; the signature is verified server-side before the plan applies.

// POST /api/billing/razorpay/order — create an order for a plan (amount in paise, INR)
router.post("/razorpay/order", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan } = req.body || {};
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  const problem = razorpay.configProblem();
  if (problem) return res.status(503).json({ error: problem });
  const amount = PLAN_PRICING[plan] && PLAN_PRICING[plan].inr; // paise, INR
  if (!amount || amount < 100) return res.status(400).json({ error: "Invalid amount" });
  try {
    const order = await razorpay.createOrder({
      amount,
      currency: "INR",
      receipt: `sub_${plan}_${Date.now()}`.slice(0, 40),
      notes: { tenant_id: req.user.tenant_id, plan },
    });
    // key_id is public and safe to return; the SECRET never leaves the server.
    res.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: razorpay.keyId(), plan });
  } catch (e) {
    console.error("[billing] razorpay order", e.statusCode, e.message);
    if (e.statusCode === 401) return res.status(401).json({ error: "Razorpay auth failed — check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on the server." });
    res.status(500).json({ error: `Razorpay: ${e.message || "could not create order"}` });
  }
});

// POST /api/billing/razorpay/verify — verify the payment signature, then apply the plan
router.post("/razorpay/verify", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: "Missing payment fields" });
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  const ok = razorpay.verifyPaymentSignature({ orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature });
  if (!ok) return res.status(400).json({ error: "Payment verification failed — signature mismatch." });
  // Verified — apply the plan (~30-day period for this one-time Standard Checkout).
  await applyPlan(req.user.tenant_id, plan, {
    provider: "razorpay",
    razorpayPaymentId: razorpay_payment_id,
    status: "active",
    periodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
  res.json({ ok: true, plan });
});

module.exports = router;
