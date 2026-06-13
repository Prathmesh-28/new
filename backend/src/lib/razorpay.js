// Razorpay Standard Checkout — Orders API + payment-signature verification.
// Mirrors lib/stripe.js (graceful + env-driven) and reuses the same fetch + crypto
// pattern already used for Razorpay payment links in routes/collections.js, so the
// codebase has ONE way to talk to Razorpay (no extra SDK dependency).
//   - No keys set            → isConfigured()=false; routes return a clean 503.
//   - KEY_SECRET stays server-side only — never returned to the client.
const crypto = require("crypto");

const keyId     = () => (process.env.RAZORPAY_KEY_ID || "").trim();
const keySecret = () => (process.env.RAZORPAY_KEY_SECRET || "").trim();
const isConfigured = () => !!(keyId() && keySecret());

// Actionable reason billing-via-Razorpay can't run, or null if it's fine.
function configProblem() {
  if (!keyId() || !keySecret()) return "Razorpay isn't configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.";
  if (!keyId().startsWith("rzp_")) return "RAZORPAY_KEY_ID looks wrong — it must start with rzp_.";
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
  const resp = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount, currency, receipt, notes, payment_capture: 1 }),
  });
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

module.exports = { keyId, isConfigured, configProblem, createOrder, verifyPaymentSignature };
