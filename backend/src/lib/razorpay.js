// Razorpay Standard Checkout - Orders API + payment-signature verification.
// Graceful + env-driven; reuses the same fetch + crypto pattern already used for
// Razorpay payment links in routes/collections.js, so the codebase has ONE way to
// talk to Razorpay (no extra SDK dependency).
//   - No keys set            → isConfigured()=false; routes return a clean 503.
//   - KEY_SECRET stays server-side only - never returned to the client.
const crypto = require("crypto");

const keyId     = () => (process.env.RAZORPAY_KEY_ID || "").trim();
const keySecret = () => (process.env.RAZORPAY_KEY_SECRET || "").trim();
const isConfigured = () => !!(keyId() && keySecret());

// Actionable reason billing-via-Razorpay can't run, or null if it's fine.
function configProblem() {
  if (!keyId() || !keySecret()) return "Razorpay isn't configured - set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.";
  if (!keyId().startsWith("rzp_")) return "RAZORPAY_KEY_ID looks wrong - it must start with rzp_.";
  return null;
}

// Create an order via the Razorpay REST API. amount is in the smallest unit
// (paise for INR) and must be >= 100. Throws with .statusCode on failure.
async function createOrder({ amount, currency = "INR", receipt, notes }) {
  if (!isConfigured()) throw new Error("Razorpay not configured");
  if (!Number.isInteger(amount) || amount < 100) {
    const e = new Error("amount must be an integer >= 100 paise");
    e.statusCode = 400;
    throw e;
  }
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  // Hard timeout so a stalled outbound connection fails fast (clean 500) instead
  // of leaving the request - and the client's button spinner - hanging forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount, currency, receipt, notes, payment_capture: 1 }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching Razorpay - please try again.");
    throw new Error(`Couldn't reach Razorpay: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(data?.error?.description || `Razorpay order failed (${resp.status})`);
    e.statusCode = resp.status;
    throw e;
  }
  return data; // { id, amount, currency, receipt, status, ... }
}

// Verify the payment signature returned by Checkout:
//   HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET) === razorpay_signature
// Constant-time comparison to avoid timing leaks.
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature || !keySecret()) return false;
  const expected = crypto.createHmac("sha256", keySecret()).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Subscription Checkout returns a DIFFERENT signature formula from Orders Checkout:
//   HMAC_SHA256(payment_id + "|" + subscription_id, KEY_SECRET) === razorpay_signature
function verifySubscriptionSignature({ paymentId, subscriptionId, signature }) {
  if (!paymentId || !subscriptionId || !signature || !keySecret()) return false;
  const expected = crypto.createHmac("sha256", keySecret()).update(`${paymentId}|${subscriptionId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Create a hosted Payment Link (Razorpay Payment Links API). amount in paise.
async function createPaymentLink({ amount, description, customer, notes, referenceId, callbackUrl }) {
  if (!isConfigured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount, currency: "INR", description, customer, notes, reference_id: referenceId, callback_url: callbackUrl, callback_method: callbackUrl ? "get" : undefined }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching Razorpay - please try again.");
    throw new Error(`Couldn't reach Razorpay: ${err.message}`);
  } finally { clearTimeout(timer); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(data?.error?.description || `Razorpay payment link failed (${resp.status})`); e.statusCode = resp.status; throw e; }
  return data; // { id, short_url, status, ... }
}

// Authoritatively fetch a payment link's state (the webhook confirms "paid" via
// this before posting a receipt - never trusts an unverified payload).
async function getPaymentLink(id) {
  if (!isConfigured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const resp = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}`, { headers: { Authorization: `Basic ${auth}` } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(data?.error?.description || `Razorpay link fetch failed (${resp.status})`); e.statusCode = resp.status; throw e; }
  return data;
}

// ── Subscriptions API (real recurring billing + UPI Autopay mandates) ───────
// API_BASE is overridable so tests can point at a local stub instead of the real
// Razorpay endpoint - the request/response shape is identical either way.
const API_BASE = () => (process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1").replace(/\/$/, "");

async function rpFetch(path, { method = "GET", body } = {}) {
  if (!isConfigured()) throw new Error("Razorpay not configured");
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch(`${API_BASE()}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching Razorpay - please try again.");
    throw new Error(`Couldn't reach Razorpay: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(data?.error?.description || `Razorpay ${method} ${path} failed (${resp.status})`);
    e.statusCode = resp.status;
    throw e;
  }
  return data;
}

// Plan objects are immutable once created - the caller (billing.js) caches the
// returned id in razorpay_plans so a given (name, period, amount) is created once.
async function createPlan({ period, interval = 1, name, amount, currency = "INR" }) {
  return rpFetch("/plans", { method: "POST", body: { period, interval, item: { name, amount, currency } } });
}

// total_count is required by the API (a subscription isn't literally "forever") -
// 120 monthly cycles (10y) / 10 annual cycles (10y) reads as "until cancelled" for
// any real SMB customer lifetime, while still satisfying the API's contract.
async function createSubscription({ planId, totalCount, tenantId, plan, cycle, customerNotify = 1 }) {
  return rpFetch("/subscriptions", {
    method: "POST",
    body: { plan_id: planId, total_count: totalCount, customer_notify: customerNotify, notes: { tenant_id: tenantId, plan, cycle } },
  });
}

async function cancelSubscription(id, { cancelAtCycleEnd = false } = {}) {
  return rpFetch(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0 } });
}

async function getSubscription(id) {
  return rpFetch(`/subscriptions/${encodeURIComponent(id)}`);
}

// Webhook signature: HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) === X-Razorpay-Signature.
// A DIFFERENT secret from the API key pair (set once when the webhook URL is
// registered in the Razorpay dashboard). Deliberately no insecure bypass when unset -
// this endpoint moves subscription state, unlike a read-only dev convenience.
function verifyWebhookSignature(rawBody, signature) {
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  keyId, isConfigured, configProblem, createOrder, verifyPaymentSignature, createPaymentLink, getPaymentLink,
  createPlan, createSubscription, cancelSubscription, getSubscription, verifyWebhookSignature, verifySubscriptionSignature,
};
