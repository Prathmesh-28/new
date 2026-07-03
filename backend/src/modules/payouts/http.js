"use strict";
// Payouts REST — mounted at /api/payouts (authenticated admin/finance surface) plus a public,
// signature-verified provider webhook (exported as .webhook, mounted at /webhook/payout). The
// four callers (lending/bnpl/ewa/treasury) use modules/payouts/index directly; this layer is
// for operator visibility, a generic vendor payout, and manual settlement when no rail is live.
const crypto = require("crypto");
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const payouts = require("./index");
const { payoutProvider, normalizeStatus, verifyWebhook } = require("./providers");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof payouts.PayoutError) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[payouts]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// Rail configuration status — the UI shows Live vs Manual honestly from this.
router.get("/providers", (req, res) => res.json(payoutProvider.status()));

router.get("/", async (req, res) => {
  try { res.json(await payouts.listPayouts(tenantOf(req), { kind: req.query.kind, status: req.query.status })); } catch (e) { fail(res, e); }
});
router.get("/:id", async (req, res) => {
  try { res.json(await payouts.getPayout(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// Generic operator-initiated payout (kind in the path, e.g. /api/payouts/vendor/request).
router.post("/:kind/request", canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    const out = await payouts.requestPayout(tenantOf(req), {
      kind: req.params.kind, amount: b.amount, purpose: b.purpose, refType: b.ref_type, refId: b.ref_id,
      idempotencyKey: b.idempotency_key, preferredProvider: b.provider, actorId: req.user.id,
      beneficiary: { name: b.beneficiary_name, account: b.beneficiary_account, ifsc: b.beneficiary_ifsc, upi: b.beneficiary_upi },
    });
    require("../analytics").track(req.user.tenant_id, req.user.id, { event: "payout_requested", props: { kind: req.params.kind, amount: out.amount } }).catch(() => {});
    res.status(201).json(out);
  } catch (e) { fail(res, e); }
});

// Manual settlement — the tested path when no rail is configured (operator confirms the transfer
// landed and enters the UTR). Posts the settlement GL.
router.post("/:id/settle", canWrite, async (req, res) => {
  try { res.json(await payouts.recordPayoutResult(tenantOf(req), req.params.id, "settled", { utr: (req.body || {}).utr, actorId: req.user.id, via: "manual_settle" })); } catch (e) { fail(res, e); }
});
router.post("/:id/fail", canWrite, async (req, res) => {
  try { res.json(await payouts.recordPayoutResult(tenantOf(req), req.params.id, "failed", { failureReason: (req.body || {}).reason, actorId: req.user.id, via: "manual_fail" })); } catch (e) { fail(res, e); }
});
router.post("/retry", canWrite, async (req, res) => {
  try { res.json(await payouts.retryPending(tenantOf(req))); } catch (e) { fail(res, e); }
});

// ── Provider webhook (public, signature-verified, fail-closed) ────────────────────
// Mounted separately at /webhook/payout. Detects the provider, verifies the HMAC over the exact
// raw bytes (req.rawBody, set globally in server.js), reads tenant_id + payout ref off the
// payload notes, and advances the payout. Never trusts an unsigned payload.
const webhook = require("express").Router();
function normalizeWebhook(provider, body) {
  if (provider === "razorpayx") {
    const e = body?.payload?.payout?.entity || {};
    const notes = e.notes || {};
    return { tenantId: notes.tenant_id || null, providerRef: e.id || null, rawStatus: e.status, utr: e.utr || null };
  }
  // setu
  const d = body?.data || body || {};
  const notes = d.additionalInfo || d.notes || {};
  return { tenantId: notes.tenant_id || null, providerRef: d.id || d.payoutId || null, rawStatus: d.status, utr: d.utr || null };
}
webhook.post("/", async (req, res) => {
  const provider = req.headers["x-setu-signature"] || String(req.query.provider || "") === "setu" ? "setu" : "razorpayx";
  const sigHeader = provider === "setu" ? String(req.headers["x-setu-signature"] || "") : String(req.headers["x-razorpay-signature"] || "");
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const signatureValid = verifyWebhook(provider, raw, sigHeader);
  if (!signatureValid) return res.status(403).json({ error: "Invalid or unconfigured signature" });
  try {
    const { tenantId, providerRef, rawStatus, utr } = normalizeWebhook(provider, req.body || {});
    if (!tenantId || !providerRef) return res.status(202).json({ ok: true, note: "missing tenant/ref notes" });
    const status = normalizeStatus(provider, rawStatus);
    if (!status) return res.status(202).json({ ok: true, note: `unmapped status ${rawStatus}` });
    const payloadHash = crypto.createHash("sha256").update(raw).digest("hex");
    await payouts.recordByProviderRef(tenantId, provider, providerRef, status, { utr, signatureValid: true, payloadHash });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof payouts.PayoutError && e.http === 404) return res.status(202).json({ ok: true, note: "unknown payout" });
    console.error("[payouts webhook]", e.message);
    res.status(500).json({ error: "processing failed" }); // 5xx → provider retries (recordPayoutResult is idempotent)
  }
});

router.webhook = webhook;
module.exports = router;
