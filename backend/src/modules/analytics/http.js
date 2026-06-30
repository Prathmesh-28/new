"use strict";
// Product analytics REST — mounted at /api/analytics. track() is open to any authed
// user (consent-gated in the data layer); profile writes use WRITE_ROLES; the
// overview dashboard is owner/super_admin only (owner → own tenant, super_admin →
// platform-wide).
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const analytics = require("./index");

router.use(authenticate);

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const ADMIN_ROLES = ["super_admin", "owner"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const canViewAnalytics = (req, res, next) => (ADMIN_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof analytics.AnalyticsError) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[analytics]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// Fire-and-forget event ingest (consent-gated in the data layer).
router.post("/track", async (req, res) => {
  try {
    res.json(await analytics.track(req.user.tenant_id, req.user.id, {
      event: req.body?.event, props: req.body?.props,
      sessionId: req.body?.session_id, path: req.body?.path, ua: req.headers["user-agent"],
    }));
  } catch (e) { fail(res, e); }
});

// Onboarding profile.
router.get("/profile", async (req, res) => {
  try { res.json((await analytics.getProfile(tenantOf(req))) || {}); } catch (e) { fail(res, e); }
});
router.post("/profile", canWrite, async (req, res) => {
  try { res.json(await analytics.saveProfile(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); }
});

// Admin dashboard data.
router.get("/overview", canViewAnalytics, async (req, res) => {
  try {
    const scope = req.user.role === "super_admin" ? (req.query.tenant_id ? String(req.query.tenant_id) : null) : req.user.tenant_id;
    res.json(await analytics.overview(scope, { days: req.query.days }));
  } catch (e) { fail(res, e); }
});

module.exports = router;
