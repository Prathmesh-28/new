// Headroom Flows - REST router. Mounted at /api/flows.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const flows = require("./index");
const runner = require("./runner");

// ── Public webhook trigger (no auth - the token is the capability) ────────────
// Declared before router.use(authenticate). POST the payload; it becomes ctx.trigger.
router.post("/webhook/:token", async (req, res) => {
  try {
    const flow = await flows.getFlowByWebhookToken(req.params.token);
    if (!flow) return res.status(404).json({ error: "Unknown or disabled webhook" });
    // Meter webhook-triggered runs too (the authed run path is metered by enforceQuota).
    // Resolve the owner tenant's plan; block only when enforcement is on and over quota.
    const ent = require("../../lib/entitlements");
    try {
      const { rows } = await require("../../db").pool.query("SELECT COALESCE(MAX(subscription_plan),'free') AS plan FROM users WHERE tenant_id=$1", [flow.tenant_id]);
      const u = await ent.consume(flow.tenant_id, "flow_runs", rows[0] ? rows[0].plan : "free");
      if (u.over && ent.enforcing()) return res.status(429).json({ error: "Monthly flow-run limit reached.", code: "PLAN_QUOTA_EXCEEDED", metric: "flow_runs", used: u.count, limit: u.limit });
    } catch (e) { console.error("[flows-webhook] metering", e.message); } // fail-open
    const run = await runner.runFlow(flow.tenant_id, flow.id, { triggerKind: "webhook", input: req.body || {} });
    return res.json({ ok: true, runId: run.id, status: run.status });
  } catch (e) {
    if (e && e.http) return res.status(e.http).json({ error: e.message, code: e.code });
    console.error("[flows-webhook]", e.message);
    return res.status(500).json({ error: "Internal error" });
  }
});

router.use(authenticate);
router.use(require("../../lib/entitlements").requireFeature("flows"));

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof flows.FlowError || (e && e.http && e.message)) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[flows]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// Node palette + tool/agent pickers for the builder UI.
router.get("/catalog", async (req, res) => {
  try {
    const agenttools = require("../books/agenttools");
    const { agents } = require("../books");
    const list = await agents.listAgents(tenantOf(req)).catch(() => []);
    res.json({
      nodes: runner.NODE_CATALOG,
      events: runner.EVENT_CATALOG,
      templates: require("./templates").FLOW_TEMPLATES,
      tools: agenttools.toolCatalog(),
      agents: (Array.isArray(list) ? list : []).map((a) => ({ id: a.id, name: a.name })),
    });
  } catch (e) { fail(res, e); }
});

router.get("/flows", async (req, res) => { try { res.json(await flows.listFlows(tenantOf(req), { limit: req.query.limit, before: req.query.before })); } catch (e) { fail(res, e); } });
router.post("/flows", canWrite, async (req, res) => { try { res.status(201).json(await flows.createFlow(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/flows/:id", async (req, res) => { try { res.json(await flows.getFlow(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.patch("/flows/:id", canWrite, async (req, res) => { try { res.json(await flows.updateFlow(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/flows/:id", canWrite, async (req, res) => { try { res.json(await flows.deleteFlow(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

// Run now (manual trigger).
router.post("/flows/:id/run", canWrite, require("../../lib/entitlements").enforceQuota("flow_runs"), async (req, res) => {
  try { res.json(await runner.runFlow(tenantOf(req), req.params.id, { triggerKind: "manual", input: (req.body || {}).input || {}, actorId: req.user.id })); }
  catch (e) { fail(res, e); }
});

// Run history + per-run detail (the execution log).
router.get("/flows/:id/runs", async (req, res) => { try { res.json(await flows.listRuns(tenantOf(req), req.params.id, { limit: req.query.limit, before: req.query.before })); } catch (e) { fail(res, e); } });
router.get("/runs/:id", async (req, res) => { try { res.json(await flows.getRun(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

module.exports = router;
