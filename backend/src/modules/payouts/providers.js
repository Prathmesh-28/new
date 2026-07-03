"use strict";
// Provider seam for the payouts rail. Picks a configured provider, normalizes each provider's
// status vocabulary to our state machine, dispatches the create call, and verifies inbound
// webhook signatures (fail-closed). 'manual' is always available (operator confirms an offline
// transfer); a real rail is used only when its creds are present. Mirrors lending's
// mandateProvider.isConfigured pattern — we never fabricate a settlement.
const crypto = require("crypto");
const razorpayx = require("../../lib/razorpayx");
const setu = require("../../lib/setuPayout");

const payoutProvider = {
  isConfigured(provider) {
    if (provider === "razorpayx") return razorpayx.isConfigured();
    if (provider === "setu") return setu.isConfigured();
    return provider === "manual"; // manual is always usable
  },
  // The provider a new payout should use: an explicit configured choice, else the first
  // configured rail, else 'manual'. Never returns a configured-but-credless provider.
  resolve(preferred) {
    if (preferred && this.isConfigured(preferred)) return preferred;
    if (razorpayx.isConfigured()) return "razorpayx";
    if (setu.isConfigured()) return "setu";
    return "manual";
  },
  status() {
    return {
      razorpayx: { configured: razorpayx.isConfigured(), problem: razorpayx.configProblem() },
      setu: { configured: setu.isConfigured(), problem: setu.configProblem() },
      manual: { configured: true, problem: null },
    };
  },
};

// Map a provider's raw status onto our enum: pending | queued | processing | settled | failed | reversed | cancelled.
function normalizeStatus(provider, raw) {
  const s = String(raw || "").toLowerCase();
  if (provider === "razorpayx") {
    if (["processed"].includes(s)) return "settled";
    if (["queued"].includes(s)) return "queued";
    if (["pending", "processing", "scheduled"].includes(s)) return "processing";
    if (["reversed"].includes(s)) return "reversed";
    if (["cancelled", "rejected"].includes(s)) return "cancelled";
    if (["failed"].includes(s)) return "failed";
  }
  if (provider === "setu") {
    if (["successful", "success", "completed", "processed"].includes(s)) return "settled";
    if (["pending", "initiated", "processing"].includes(s)) return "processing";
    if (["reversed", "refunded"].includes(s)) return "reversed";
    if (["failed", "rejected"].includes(s)) return "failed";
  }
  return null; // unknown → caller keeps current status
}

// Kick off the actual transfer with the resolved provider. Returns { provider, providerRef,
// status } on success. For 'manual' there is no external call — the payout waits for an
// operator. Amount is passed in rupees; the adapter converts to the rail's unit.
async function createProviderPayout(provider, { amountRupees, account, ifsc, upi, name, referenceId, notes }) {
  if (provider === "razorpayx") {
    const r = await razorpayx.createPayout({ amount: Math.round(Number(amountRupees) * 100), account, ifsc, upi, name, referenceId, notes });
    return { provider, providerRef: r.id, status: normalizeStatus("razorpayx", r.status) || "queued", utr: r.utr };
  }
  if (provider === "setu") {
    const r = await setu.createPayout({ amount: Number(amountRupees), account, ifsc, upi, name, referenceId, notes });
    return { provider, providerRef: r.id, status: normalizeStatus("setu", r.status) || "processing", utr: r.utr };
  }
  return { provider: "manual", providerRef: null, status: "pending", utr: null }; // awaits operator confirmation
}

// Verify an inbound webhook. Fail-closed: if the provider's webhook secret isn't set, we reject
// (return false) rather than trust an unsigned payload. rawBody is the exact bytes received.
function verifyWebhook(provider, rawBody, signature) {
  if (!signature) return false;
  let secret = "";
  if (provider === "razorpayx") secret = (process.env.RAZORPAYX_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  else if (provider === "setu") secret = (process.env.SETU_WEBHOOK_SECRET || "").trim();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { payoutProvider, normalizeStatus, createProviderPayout, verifyWebhook };
