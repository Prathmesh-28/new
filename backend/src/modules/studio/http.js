// Headroom Studio - App Builder, Phase 0 REST router.
// Mounted at /api/studio. Mirrors the books/crm module conventions: authenticate
// at the top, tenantOf() for super-admin cross-tenant override, per-domain
// WRITE_ROLES for write gating, fail() for typed errors. Reads are open to all
// members; writes (create/patch project, create version) require a write role.

const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const studio = require("./index");
const codegen = require("./codegen");

router.use(authenticate);

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof studio.StudioError || e instanceof codegen.CodegenError) return res.status(e.http).json({ error: e.message, code: e.code });
  if (e && e.http && e.message) return res.status(e.http).json({ error: e.message, code: e.code });   // PostError from the LLM gateway
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

// ── Codegen (Phase 1) - describe → plan or build a new version ────────────────
router.post("/projects/:id/generate", canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    res.json(await codegen.generate(tenantOf(req), req.user.id, req.params.id, { prompt: b.prompt, mode: b.mode || "build", model: b.model }));
  } catch (e) { fail(res, e); }
});

// Restore a past version (append-only: copies its tree into a new current version).
router.post("/projects/:id/restore/:versionId", canWrite, async (req, res) => {
  try { res.status(201).json(await studio.restoreVersion(tenantOf(req), req.params.id, req.params.versionId)); } catch (e) { fail(res, e); }
});

// ── Publish (v1) - serve the current version at a public /api/pub/:token link ──
router.post("/projects/:id/publish", canWrite, async (req, res) => {
  try { res.json(await studio.publish(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.get("/projects/:id/deployments", async (req, res) => {
  try { res.json(await studio.listDeployments(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// ── Agent bridge grants (P6) - which agents this app may embed ────────────────
router.get("/projects/:id/agents", async (req, res) => {
  try { res.json(await studio.listAppAgents(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.post("/projects/:id/agents", canWrite, async (req, res) => {
  try { res.json(await studio.grantAgent(tenantOf(req), req.params.id, (req.body || {}).agentId)); } catch (e) { fail(res, e); }
});
router.delete("/projects/:id/agents/:agentId", canWrite, async (req, res) => {
  try { res.json(await studio.revokeAgent(tenantOf(req), req.params.id, req.params.agentId)); } catch (e) { fail(res, e); }
});

// Delete (archive) a project.
router.delete("/projects/:id", canWrite, async (req, res) => {
  try { res.json(await studio.updateProject(tenantOf(req), req.params.id, { archived: true })); } catch (e) { fail(res, e); }
});

module.exports = router;
