// Stripe integration — graceful by design (mirrors lib/whatsapp.js):
//  - No STRIPE_SECRET_KEY  → getClient() returns null; callers return a clean 503
//    "not configured" instead of crashing. The whole app still boots + runs.
//  - Inline price_data      → works with ONLY a test secret key (sk_test_*); you do
//    NOT need to pre-create Products/Prices in the Stripe Dashboard. Amounts mirror
//    the HomePage pricing exactly (INR for India, USD elsewhere).
//  - Webhook signature       → verified when STRIPE_WEBHOOK_SECRET is set; skipped
//    (with a warning) when it isn't, so local/test works before you wire the CLI.
let _stripe = null;
let _triedInit = false;

function getClient() {
  if (_triedInit) return _stripe;
  _triedInit = true;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.log("[stripe] STRIPE_SECRET_KEY not set — billing runs in MOCK mode.");
    return null;
  }
  try {
    // Lazy require so a missing dependency never crashes the server at boot.
    const Stripe = require("stripe");
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  } catch (e) {
    console.error("[stripe] failed to init:", e.message);
    _stripe = null;
  }
  return _stripe;
}

function isLive() {
  return (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
}

// Plan catalog — amounts in the smallest currency unit (paise / cents).
// MUST stay in sync with src/pages/HomePage.tsx pricing.
const PLAN_PRICING = {
  growth: { inr: 99900,  usd: 3900,  label: "Headroom Growth" },   // ₹999 / $39 per month
  pro:    { inr: 299900, usd: 9900,  label: "Headroom Pro"    },   // ₹2,999 / $99 per month
};

const PLAN_RANK = { free: 0, growth: 1, pro: 2 };

// Build a recurring (monthly) subscription Checkout Session using inline price_data.
async function createSubscriptionCheckout({ plan, currency, tenantId, email, successUrl, cancelUrl }) {
  const c = getClient();
  if (!c) return null;
  const cur = currency === "inr" ? "inr" : "usd";
  const pricing = PLAN_PRICING[plan];
  if (!pricing) throw new Error(`Unknown plan: ${plan}`);
  const unit_amount = cur === "inr" ? pricing.inr : pricing.usd;

  return c.checkout.sessions.create({
    mode: "subscription",
    customer_email: email || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: cur,
        unit_amount,
        recurring: { interval: "month" },
        product_data: { name: `${pricing.label} (monthly)` },
      },
    }],
    // metadata travels to the webhook + the confirm-on-return lookup
    metadata: { tenant_id: tenantId, plan },
    subscription_data: { metadata: { tenant_id: tenantId, plan } },
    client_reference_id: tenantId,
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// One-time payment Checkout Session for collecting on a specific invoice.
async function createInvoiceCheckout({ invoiceNumber, amount, currency, customerEmail, successUrl, cancelUrl, tenantId }) {
  const c = getClient();
  if (!c) return null;
  const cur = currency === "usd" ? "usd" : "inr";
  return c.checkout.sessions.create({
    mode: "payment",
    customer_email: customerEmail || undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: cur,
        unit_amount: Math.round(Number(amount) * 100),
        product_data: { name: `Invoice ${invoiceNumber}` },
      },
    }],
    metadata: { tenant_id: tenantId, invoice_number: invoiceNumber, kind: "invoice" },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// Stripe customer-portal session so a customer can manage/cancel their subscription.
async function createPortalSession({ customerId, returnUrl }) {
  const c = getClient();
  if (!c || !customerId) return null;
  return c.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

async function retrieveSession(sessionId) {
  const c = getClient();
  if (!c) return null;
  return c.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
}

// Verify + parse a webhook payload. rawBody must be the unparsed Buffer/string.
function constructEvent(rawBody, signature) {
  const c = getClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (c && secret && signature) {
    return c.webhooks.constructEvent(rawBody, signature, secret); // throws on bad signature
  }
  // No secret configured (test/local) — parse without verifying, but warn loudly.
  console.warn("[stripe] STRIPE_WEBHOOK_SECRET not set — accepting webhook WITHOUT signature verification (test mode).");
  return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
}

module.exports = {
  getClient, isLive, PLAN_PRICING, PLAN_RANK,
  createSubscriptionCheckout, createInvoiceCheckout, createPortalSession,
  retrieveSession, constructEvent,
};
