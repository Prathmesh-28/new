// Headroom Flows — data layer. Tenant-scoped (app-layer, like books/crm/studio).
const { pool } = require("../../db");
const crypto = require("crypto");

class FlowError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
const clampLimit = (n) => Math.min(Math.max(parseInt(n, 10) || 30, 1), 100);
const newWebhookToken = () => "whk_" + crypto.randomBytes(12).toString("hex");

function normGraph(g) {
  const graph = g && typeof g === "object" ? g : {};
  return { nodes: Array.isArray(graph.nodes) ? graph.nodes : [], edges: Array.isArray(graph.edges) ? graph.edges : [] };
}
function normTrigger(t) {
  const tr = t && typeof t === "object" ? t : {};
  const type = ["manual", "schedule", "event", "webhook"].includes(tr.type) ? tr.type : "manual";
  return { type, config: tr.config && typeof tr.config === "object" ? tr.config : {} };
}

async function createFlow(tenantId, createdBy, { name, description, trigger, graph } = {}) {
  const nm = String(name || "").trim() || "Untitled flow";
  const tr = normTrigger(trigger);
  const { rows } = await pool.query(
    `INSERT INTO flows(tenant_id, name, description, trigger, graph, webhook_token, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, nm, description || null, JSON.stringify(tr), JSON.stringify(normGraph(graph)), tr.type === "webhook" ? newWebhookToken() : null, createdBy || null]
  );
  return rows[0];
}

async function listFlows(tenantId, { limit, before } = {}) {
  const lim = clampLimit(limit);
  const params = [tenantId];
  let where = "tenant_id=$1 AND archived_at IS NULL";
  if (before) { params.push(before); where += ` AND id < $${params.length}`; }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT id, name, description, enabled, trigger, last_run_at, created_at, updated_at
       FROM flows WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  return { flows: rows, nextCursor: rows.length === lim ? rows[rows.length - 1].id : null };
}

async function getFlow(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM flows WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new FlowError("NOT_FOUND", "Flow not found", 404);
  return rows[0];
}

async function updateFlow(tenantId, id, patch = {}) {
  const cur = await getFlow(tenantId, id);
  const sets = [], params = [tenantId, id];
  const add = (col, val) => { params.push(val); sets.push(`${col}=$${params.length}`); };
  if (typeof patch.name === "string") add("name", patch.name.trim() || "Untitled flow");
  if (typeof patch.description === "string") add("description", patch.description);
  if (typeof patch.enabled === "boolean") add("enabled", patch.enabled);
  if (patch.graph !== undefined) add("graph", JSON.stringify(normGraph(patch.graph)));
  if (patch.trigger !== undefined) {
    const tr = normTrigger(patch.trigger);
    add("trigger", JSON.stringify(tr));
    // (re)issue or clear a webhook token when the trigger type changes
    if (tr.type === "webhook" && !cur.webhook_token) add("webhook_token", newWebhookToken());
    if (tr.type !== "webhook" && cur.webhook_token) add("webhook_token", null);
  }
  if (!sets.length) return cur;
  sets.push("updated_at=now()");
  const { rows } = await pool.query(`UPDATE flows SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, params);
  return rows[0];
}

async function deleteFlow(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM flows WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new FlowError("NOT_FOUND", "Flow not found", 404);
  return { ok: true };
}

async function listRuns(tenantId, flowId, { limit, before } = {}) {
  await getFlow(tenantId, flowId); // tenant/ownership check
  const lim = clampLimit(limit);
  const params = [tenantId, flowId];
  let where = "tenant_id=$1 AND flow_id=$2";
  if (before) { params.push(before); where += ` AND id < $${params.length}`; }
  params.push(lim);
  const { rows } = await pool.query(
    `SELECT id, status, trigger_kind, error, created_at, finished_at FROM flow_runs
      WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
  return { runs: rows, nextCursor: rows.length === lim ? rows[rows.length - 1].id : null };
}

async function getRun(tenantId, runId) {
  const { rows } = await pool.query("SELECT * FROM flow_runs WHERE tenant_id=$1 AND id=$2", [tenantId, runId]);
  if (!rows[0]) throw new FlowError("NOT_FOUND", "Run not found", 404);
  return rows[0];
}

async function getFlowByWebhookToken(token) {
  if (!token) return null;
  const { rows } = await pool.query("SELECT * FROM flows WHERE webhook_token=$1 AND enabled=true AND archived_at IS NULL", [token]);
  return rows[0] || null;
}

// Used by the runner to bracket an execution.
async function createRun(tenantId, flowId, triggerKind, input) {
  const { rows } = await pool.query(
    `INSERT INTO flow_runs(tenant_id, flow_id, status, trigger_kind, input) VALUES($1,$2,'running',$3,$4) RETURNING *`,
    [tenantId, flowId, triggerKind || "manual", input ? JSON.stringify(input) : null]
  );
  return rows[0];
}
async function finishRun(runId, status, results, error) {
  const { rows } = await pool.query(
    `UPDATE flow_runs SET status=$2, results=$3, error=$4, finished_at=now() WHERE id=$1 RETURNING *`,
    [runId, status, results ? JSON.stringify(results) : null, error || null]
  );
  return rows[0];
}
async function markRan(flowId) {
  await pool.query("UPDATE flows SET last_run_at=now() WHERE id=$1", [flowId]).catch(() => {});
}

// Enabled, scheduled flows (the cron filters by due-ness via the runner's _isDue).
async function listScheduledFlows() {
  const { rows } = await pool.query(
    "SELECT * FROM flows WHERE enabled=true AND archived_at IS NULL AND trigger->>'type'='schedule'"
  );
  return rows;
}

module.exports = {
  FlowError, createFlow, listFlows, getFlow, updateFlow, deleteFlow,
  listRuns, getRun, getFlowByWebhookToken, createRun, finishRun, markRan, listScheduledFlows,
};
