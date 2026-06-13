const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const stripe = require("../lib/stripe");

const APP_URL = (process.env.FRONTEND_URL || "https://headroom-pi.vercel.app").replace(/\/$/, "");
const VALID_PLANS = ["growth", "pro"];

// Persist a plan to a tenant: updates the billing record AND every user in the
// tenant (so each team member's entitlements reflect the company subscription).
async function applyPlan(tenantId, plan, { customerId, subscriptionId, status, periodEnd } = {}) {
  await pool.query(`
    INSERT INTO tenant_billing(tenant_id, plan, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT(tenant_id) DO UPDATE SET
      plan=$2,
      stripe_customer_id=COALESCE($3, tenant_billing.stripe_customer_id),
      stripe_subscription_id=COALESCE($4, tenant_billing.stripe_subscription_id),
      status=COALESCE($5, tenant_billing.status),
      current_period_end=COALESCE($6, tenant_billing.current_period_end),
      updated_at=now()
  `, [tenantId, plan, customerId || null, subscriptionId || null, status || null,
      periodEnd ? new Date(periodEnd * 1000).toISOString() : null]);
  await pool.query("UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2", [plan, tenantId]);
}

// GET /api/billing/current — the tenant's current plan + subscription status
router.get("/current", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT plan, status, current_period_end, stripe_customer_id FROM tenant_billing WHERE tenant_id=$1",
    [req.user.tenant_id]
  );
  const b = rows[0] || {};
  res.json({
    plan: b.plan || req.user.subscription_plan || "free",
    status: b.status || null,
    current_period_end: b.current_period_end || null,
    has_customer: !!b.stripe_customer_id,
    configured: !!stripe.getClient(),
    live: stripe.isLive(),
  });
});

// POST /api/billing/checkout-session — start a subscription upgrade
// body: { plan: 'growth'|'pro', currency: 'inr'|'usd' }
router.post("/checkout-session", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { plan, currency } = req.body || {};
  if (!VALID_PLANS.includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  if (!stripe.getClient()) {
    return res.status(503).json({ error: "Payments are not configured yet. Add STRIPE_SECRET_KEY to enable upgrades." });
  }
  try {
    const session = await stripe.createSubscriptionCheckout({
      plan,
      currency: currency === "inr" ? "inr" : "usd",
      tenantId: req.user.tenant_id,
      email: req.user.email,
      successUrl: `${APP_URL}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${APP_URL}/settings?billing=cancelled`,
    });
    res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("[billing] checkout-session", e.message);
    res.status(502).json({ error: "Could not start checkout. Please try again." });
  }
});

// POST /api/billing/confirm — verify a returning Checkout session and apply the plan
// immediately (so upgrades reflect even before the webhook is wired). body: { session_id }
router.post("/confirm", authenticate, async (req, res) => {
  const { session_id } = req.body || {};
  if (!session_id) return res.status(400).json({ error: "session_id required" });
  if (!stripe.getClient()) return res.status(503).json({ error: "Payments not configured" });
  try {
    const session = await stripe.retrieveSession(session_id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    // Only trust sessions that belong to this tenant.
    const tenantId = session.metadata?.tenant_id || session.client_reference_id;
    if (tenantId !== req.user.tenant_id) return res.status(403).json({ error: "Forbidden" });
    const paid = session.payment_status === "paid" || session.status === "complete";
    const plan = session.metadata?.plan;
    if (paid && VALID_PLANS.includes(plan)) {
      const sub = session.subscription;
      await applyPlan(tenantId, plan, {
        customerId: session.customer,
        subscriptionId: typeof sub === "string" ? sub : sub?.id,
        status: typeof sub === "object" ? sub?.status : "active",
        periodEnd: typeof sub === "object" ? sub?.current_period_end : null,
      });
      return res.json({ plan, applied: true });
    }
    res.json({ plan: req.user.subscription_plan || "free", applied: false });
  } catch (e) {
    console.error("[billing] confirm", e.message);
    res.status(502).json({ error: "Could not confirm payment" });
  }
});

// POST /api/billing/portal — open the Stripe customer portal to manage/cancel
router.post("/portal", authenticate, requireOwnerOrAdmin, async (req, res) => {
  if (!stripe.getClient()) return res.status(503).json({ error: "Payments not configured" });
  const { rows } = await pool.query(
    "SELECT stripe_customer_id FROM tenant_billing WHERE tenant_id=$1", [req.user.tenant_id]
  );
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: "No active subscription to manage yet." });
  try {
    const session = await stripe.createPortalSession({ customerId, returnUrl: `${APP_URL}/settings` });
    res.json({ url: session.url });
  } catch (e) {
    console.error("[billing] portal", e.message);
    res.status(502).json({ error: "Could not open billing portal" });
  }
});

// POST /api/billing/invoice-link — create a Stripe payment link for an invoice
// body: { invoice_id, currency? }
router.post("/invoice-link", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { invoice_id, currency } = req.body || {};
  if (!invoice_id) return res.status(400).json({ error: "invoice_id required" });
  if (!stripe.getClient()) return res.status(503).json({ error: "Payments not configured" });

  const { rows: [inv] } = await pool.query(
    "SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2", [invoice_id, req.user.tenant_id]
  );
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  try {
    const session = await stripe.createInvoiceCheckout({
      invoiceNumber: inv.invoice_number,
      amount: inv.total_amount,
      currency: currency === "usd" ? "usd" : "inr",
      customerEmail: inv.customer_email,
      tenantId: req.user.tenant_id,
      successUrl: `${APP_URL}/invoices?paid=${encodeURIComponent(inv.invoice_number)}`,
      cancelUrl: `${APP_URL}/invoices`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error("[billing] invoice-link", e.message);
    res.status(502).json({ error: "Could not create payment link" });
  }
});

// Webhook handler — mounted with express.raw() on /webhook/stripe (see server.js).
// Authoritative source of truth for subscription state.
async function webhookHandler(req, res) {
  let event;
  try {
    event = stripe.constructEvent(req.body, req.headers["stripe-signature"]);
  } catch (e) {
    console.error("[stripe] webhook signature failed:", e.message);
    return res.status(400).json({ error: "Invalid signature" });
  }
  try {
    const obj = event.data?.object || {};
    switch (event.type) {
      case "checkout.session.completed": {
        const tenantId = obj.metadata?.tenant_id || obj.client_reference_id;
        if (obj.mode === "subscription" && tenantId && VALID_PLANS.includes(obj.metadata?.plan)) {
          await applyPlan(tenantId, obj.metadata.plan, {
            customerId: obj.customer,
            subscriptionId: obj.subscription,
            status: "active",
          });
        } else if (obj.mode === "payment" && obj.metadata?.invoice_number) {
          await pool.query(
            "UPDATE invoices SET status='paid', paid_at=now() WHERE invoice_number=$1 AND tenant_id=$2 AND status!='paid'",
            [obj.metadata.invoice_number, tenantId]
          );
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const tenantId = obj.metadata?.tenant_id;
        const active = obj.status === "active" || obj.status === "trialing";
        const plan = event.type === "customer.subscription.deleted" || !active ? "free" : (obj.metadata?.plan || "growth");
        if (tenantId) {
          await applyPlan(tenantId, plan, {
            customerId: obj.customer,
            subscriptionId: obj.id,
            status: obj.status,
            periodEnd: obj.current_period_end,
          });
        }
        break;
      }
      default: break;
    }
  } catch (e) {
    console.error("[stripe] webhook handler error:", e.message);
  }
  res.json({ received: true });
}

router.webhookHandler = webhookHandler;
module.exports = router;
