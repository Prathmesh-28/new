"use strict";
// Setu Payouts — the India-native alternative rail (referenced but never wired in the old
// bnpl.js / ewa.js stubs). Same shape as lib/razorpayx.js: GATED (needs SETU_CLIENT_ID +
// SETU_CLIENT_SECRET), otherwise callers use MANUAL mode. We never fabricate a payout.
//   SETU_PAYOUT_BASE overrides the base URL (sandbox vs prod); defaults to prod.
const clientId     = () => (process.env.SETU_CLIENT_ID || "").trim();
const clientSecret = () => (process.env.SETU_CLIENT_SECRET || "").trim();
const productInstance = () => (process.env.SETU_PAYOUT_PRODUCT_INSTANCE_ID || "").trim();
const baseUrl      = () => (process.env.SETU_PAYOUT_BASE || "https://prod.setu.co").replace(/\/$/, "");
const isConfigured = () => !!(clientId() && clientSecret());

function configProblem() {
  if (!clientId() || !clientSecret()) return "Setu payouts isn't configured — set SETU_CLIENT_ID and SETU_CLIENT_SECRET.";
  return null;
}

// Create a Setu payout. amount is in RUPEES here (Setu takes decimal rupees, unlike Razorpay's
// paise). notes/reference carries our payout_id + tenant_id for the settlement webhook.
async function createPayout({ amount, account, ifsc, upi, name, referenceId, notes }) {
  if (!isConfigured()) { const e = new Error("Setu payouts not configured"); e.code = "NOT_CONFIGURED"; throw e; }
  if (!(Number(amount) > 0)) { const e = new Error("amount must be > 0"); e.statusCode = 400; throw e; }
  const headers = {
    "Content-Type": "application/json",
    "x-client-id": clientId(),
    "x-client-secret": clientSecret(),
  };
  if (productInstance()) headers["x-product-instance-id"] = productInstance();
  const beneficiary = upi
    ? { vpa: upi, name: name || "Beneficiary" }
    : { accountNumber: account, ifsc, name: name || "Beneficiary" };
  const body = { amount: Number(amount), beneficiary, referenceId, additionalInfo: notes || {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch(`${baseUrl()}/api/payouts`, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching Setu — please retry.");
    throw new Error(`Couldn't reach Setu: ${err.message}`);
  } finally { clearTimeout(timer); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(data?.error?.detail || data?.error?.title || `Setu payout failed (${resp.status})`); e.statusCode = resp.status; throw e; }
  const d = data.data || data;
  return { id: d.id || d.payoutId || referenceId, status: (d.status || "PENDING").toLowerCase(), utr: d.utr || null };
}

module.exports = { isConfigured, configProblem, createPayout };
