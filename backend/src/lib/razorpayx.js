"use strict";
// RazorpayX Payouts — outbound bank transfers (NEFT/RTGS/IMPS/UPI) to a beneficiary.
// Same fetch + Basic-auth pattern as lib/razorpay.js so the codebase has ONE way to talk to
// Razorpay (no SDK). This is a GATED rail: without creds isConfigured()=false and callers fall
// back to MANUAL mode — we never fabricate a payout. KEY_SECRET stays server-side only.
//   Needs: RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET (shared with collections) and the platform
//   source account RAZORPAYX_ACCOUNT_NUMBER (the RazorpayX virtual account funds move from).
const keyId      = () => (process.env.RAZORPAY_KEY_ID || "").trim();
const keySecret  = () => (process.env.RAZORPAY_KEY_SECRET || "").trim();
const accountNo  = () => (process.env.RAZORPAYX_ACCOUNT_NUMBER || "").trim();
const isConfigured = () => !!(keyId() && keySecret() && accountNo());

function configProblem() {
  if (!keyId() || !keySecret()) return "RazorpayX isn't configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.";
  if (!accountNo()) return "RazorpayX source account missing — set RAZORPAYX_ACCOUNT_NUMBER (the platform virtual account).";
  return null;
}

// Create a payout to a bank account (IMPS/NEFT/RTGS) or a UPI VPA. amount is in paise.
// notes carries { tenant_id, payout_id } so the settlement webhook can scope back to us.
// Throws with .statusCode on failure; caller records the payout as pending + retries.
async function createPayout({ amount, mode = "IMPS", account, ifsc, upi, name, referenceId, notes }) {
  if (!isConfigured()) { const e = new Error("RazorpayX not configured"); e.code = "NOT_CONFIGURED"; throw e; }
  if (!Number.isInteger(amount) || amount < 100) { const e = new Error("amount must be an integer >= 100 paise"); e.statusCode = 400; throw e; }
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  // Fund account: UPI VPA when given, else bank account+IFSC.
  const fund_account = upi
    ? { account_type: "vpa", vpa: { address: upi } }
    : { account_type: "bank_account", bank_account: { name: name || "Beneficiary", ifsc, account_number: account } };
  const body = {
    account_number: accountNo(),
    amount, currency: "INR",
    mode: upi ? "UPI" : mode,
    purpose: "payout",
    fund_account,
    reference_id: referenceId,
    notes: notes || {},
    queue_if_low_balance: true,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let resp;
  try {
    resp = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}`, "X-Payout-Idempotency": referenceId || "" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Timed out reaching RazorpayX — please retry.");
    throw new Error(`Couldn't reach RazorpayX: ${err.message}`);
  } finally { clearTimeout(timer); }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) { const e = new Error(data?.error?.description || `RazorpayX payout failed (${resp.status})`); e.statusCode = resp.status; throw e; }
  // status ∈ queued | pending | processing | processed | reversed | cancelled | failed
  return { id: data.id, status: data.status, utr: data.utr || null };
}

module.exports = { isConfigured, configProblem, createPayout };
