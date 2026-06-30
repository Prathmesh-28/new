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
    // Tag every client event with the stakeholder's role for segmentation.
    const props = { ...(req.body?.props && typeof req.body.props === "object" ? req.body.props : {}), role: req.user.role };
    res.json(await analytics.track(req.user.tenant_id, req.user.id, {
      event: req.body?.event, props,
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
const scopeOf = (req) => (req.user.role === "super_admin" ? (req.query.tenant_id ? String(req.query.tenant_id) : null) : req.user.tenant_id);
router.get("/overview", canViewAnalytics, async (req, res) => {
  try { res.json(await analytics.overview(scopeOf(req), { days: req.query.days })); } catch (e) { fail(res, e); }
});
router.get("/retention", canViewAnalytics, async (req, res) => {
  try { res.json(await analytics.retention(scopeOf(req), { weeks: req.query.weeks, role: req.query.role })); } catch (e) { fail(res, e); }
});

// Win-back: who's gone quiet, and a button to nudge them. Owner → own tenant only;
// super_admin → platform-wide. The daily cron in server.js runs the platform sweep.
router.get("/dormant", canViewAnalytics, async (req, res) => {
  try { res.json({ dormant: await analytics.findDormant(scopeOf(req), { idleDays: req.query.idle_days, cooldownDays: req.query.cooldown_days }) }); } catch (e) { fail(res, e); }
});
router.post("/winback/run", canViewAnalytics, async (req, res) => {
  try {
    res.json(await analytics.runWinback({
      scopeTenantId: scopeOf(req),
      idleDays: req.body?.idle_days, cooldownDays: req.body?.cooldown_days,
      dryRun: req.body?.dry_run === true,
    }));
  } catch (e) { fail(res, e); }
});

module.exports = router;
