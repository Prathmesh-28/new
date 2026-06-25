// Headroom Studio — App Builder, Phase 0 REST router.
// Mounted at /api/studio. Mirrors the books/crm module conventions: authenticate
// at the top, tenantOf() for super-admin cross-tenant override, per-domain
// WRITE_ROLES for write gating, fail() for typed errors. Reads are open to all
// members; writes (create/patch project, create version) require a write role.

const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const studio = require("./index");

router.use(authenticate);

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof studio.StudioError) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[studio]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// ── Projects ───────────────────────────────────────────────────────────────────
router.get("/projects", async (req, res) => {
  try { res.json(await studio.listProjects(tenantOf(req), { limit: req.query.limit, before: req.query.before })); } catch (e) { fail(res, e); }
});
router.post("/projects", canWrite, async (req, res) => {
  try { res.status(201).json(await studio.createProject(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/projects/:id", async (req, res) => {
  try { res.json(await studio.getProject(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.patch("/projects/:id", canWrite, async (req, res) => {
  try { res.json(await studio.updateProject(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});

// ── Versions ─────────────────────────────────────────────────────────────────
router.get("/projects/:id/versions", async (req, res) => {
  try { res.json(await studio.listVersions(tenantOf(req), req.params.id, { limit: req.query.limit, before: req.query.before })); } catch (e) { fail(res, e); }
});
router.post("/projects/:id/versions", canWrite, async (req, res) => {
  try { res.status(201).json(await studio.createVersion(tenantOf(req), req.params.id, req.user.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.get("/versions/:id", async (req, res) => {
  try { res.json(await studio.getVersion(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// ── Deployments (Phase 5 populates) ──────────────────────────────────────────
router.get("/projects/:id/deployments", async (req, res) => {
  try { res.json(await studio.listDeployments(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

module.exports = router;
