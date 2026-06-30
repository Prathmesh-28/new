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

module.exports = { keyId, isConfigured, configProblem, createOrder, verifyPaymentSignature, createPaymentLink, getPaymentLink };
