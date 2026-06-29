"use strict";
// Rewards crowdfunding REST — mounted at /api/campaigns. Mirrors the studio/books
// conventions: public token routes declared BEFORE authenticate (like flows/webhook),
// then authenticate, tenantOf(), per-domain WRITE_ROLES, fail() for typed errors.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const crowd = require("./index");
const razorpay = require("../../lib/razorpay");

const fail = (res, e) => {
  if (e instanceof crowd.CrowdError) return res.status(e.http).json({ error: e.message, code: e.code });
  if (e && e.http && e.message) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[crowdfunding]", e.message);
  return res.status(500).json({ error: "Internal error" });
};
const paymentsLive = () => { try { return razorpay.isConfigured(); } catch { return false; } };

// ── PUBLIC (token-gated, no auth) — backer-facing campaign page + pledge ──────────
router.get("/public/:token", async (req, res) => {
  try { res.json(await crowd.publicCampaign(req.params.token)); } catch (e) { fail(res, e); }
});
router.post("/public/:token/pledge", async (req, res) => {
  try {
    const r = await crowd.publicPledge(req.params.token, req.body || {});
    let payUrl = null;
    if (paymentsLive()) {
      try {
        const link = await razorpay.createPaymentLink({
          amount: r.amount,
          description: "Crowdfunding pledge",
          notes: { k: "crowd", backer_id: r.backerId, campaign_id: r.campaignId, tenant_id: r.tenantId },
          referenceId: r.backerId,
          callbackUrl: `${process.env.BACKEND_URL ?? ""}/webhook/razorpay`,
        });
        payUrl = link?.short_url || link?.shortUrl || null;
        if (payUrl) await crowd.setBackerPayUrl(r.tenantId, r.backerId, payUrl);
      } catch (e) { console.warn("[crowdfunding] pay link failed:", e.message); }
    }
    res.status(201).json({ backerId: r.backerId, amount: r.amount, status: r.status, payUrl, payment_mode: payUrl ? "gateway" : "manual" });
  } catch (e) { fail(res, e); }
});

router.use(authenticate);

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const VET_ROLES = ["super_admin", "accountant"]; // compliance / CA
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const canVet = (req, res, next) => (VET_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden — vetting is for super_admin / accountant" }));

// ── Campaigns ──────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try { res.json(await crowd.listCampaigns(tenantOf(req), { limit: req.query.limit, before: req.query.before })); } catch (e) { fail(res, e); }
});
router.post("/", canWrite, async (req, res) => {
  try { res.status(201).json(await crowd.createCampaign(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/:id", async (req, res) => {
  try { res.json(await crowd.getCampaign(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.patch("/:id", canWrite, async (req, res) => {
  try { res.json(await crowd.updateCampaign(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});

// ── Lifecycle transitions ────────────────────────────────────────────────────
router.post("/:id/submit", canWrite, async (req, res) => {
  try { res.json(await crowd.submitForReview(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.post("/:id/vet", canVet, async (req, res) => {
  try { res.json(await crowd.vetCampaign(tenantOf(req), req.params.id, req.body?.approve !== false, req.body?.note)); } catch (e) { fail(res, e); }
});
router.post("/:id/publish", canWrite, async (req, res) => {
  try { res.json({ campaign: await crowd.publishCampaign(tenantOf(req), req.params.id, { paymentsConfigured: paymentsLive() }), payments_live: paymentsLive() }); } catch (e) { fail(res, e); }
});
router.post("/:id/close", canWrite, async (req, res) => {
  try { res.json(await crowd.closeCampaign(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// ── Perks ──────────────────────────────────────────────────────────────────────
router.post("/:id/perks", canWrite, async (req, res) => {
  try { res.status(201).json(await crowd.addPerk(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.delete("/:id/perks/:perkId", canWrite, async (req, res) => {
  try { res.json(await crowd.deletePerk(tenantOf(req), req.params.id, req.params.perkId)); } catch (e) { fail(res, e); }
});

// ── Backers / fulfilment / analytics ────────────────────────────────────────────
router.get("/:id/backers", async (req, res) => {
  try { res.json(await crowd.listBackers(tenantOf(req), req.params.id, { status: req.query.status, fulfillment: req.query.fulfillment })); } catch (e) { fail(res, e); }
});
// Manual mark-paid — for preview/cash pledges, or when no gateway is configured.
router.post("/:id/backers/:backerId/mark-paid", canWrite, async (req, res) => {
  try { res.json(await crowd.markPledgePaid(tenantOf(req), { backerId: req.params.backerId, paymentRef: req.body?.paymentRef, actorId: req.user.id })); } catch (e) { fail(res, e); }
});
router.patch("/:id/backers/:backerId/fulfilment", canWrite, async (req, res) => {
  try { res.json(await crowd.updateFulfilment(tenantOf(req), req.params.id, req.params.backerId, { status: req.body?.status, tracking: req.body?.tracking, actorId: req.user.id })); } catch (e) { fail(res, e); }
});
router.get("/:id/analytics", async (req, res) => {
  try { res.json(await crowd.analytics(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

module.exports = router;
