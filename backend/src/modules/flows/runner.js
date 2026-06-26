// Headroom Flows — the execution engine.
//
// Walks the flow graph in topological order with BRANCH REACHABILITY (a node runs
// only if it's a root or an incoming edge is "satisfied"; branch nodes gate their
// outgoing edges). Each node receives the accumulated context { trigger, nodes:{id→output} }
// and supports {{path}} templating against it. Every node's result is logged to the
// flow_run. Errors stop the run (the failing node + the reason are recorded).

const { pool } = require("../../db");
const flows = require("./index");
const { FlowError } = flows;

// ── templating ────────────────────────────────────────────────────────────────
function getPath(obj, path) {
  return String(path).split(".").reduce((o, k) => (o == null ? undefined : o[k.trim()]), obj);
}
function resolveTemplates(value, ctx) {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/); // single token → preserve type
    if (whole) { const v = getPath(ctx, whole[1]); return v === undefined ? "" : v; }
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => { const v = getPath(ctx, p); return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)); });
  }
  if (Array.isArray(value)) return value.map((v) => resolveTemplates(v, ctx));
  if (value && typeof value === "object") { const o = {}; for (const k of Object.keys(value)) o[k] = resolveTemplates(value[k], ctx); return o; }
  return value;
}

function evalCond(left, op, right) {
  const num = (x) => (typeof x === "number" ? x : x != null && x !== "" && !isNaN(Number(x)) ? Number(x) : NaN);
  switch (op) {
    case "==": return String(left) === String(right);
    case "!=": return String(left) !== String(right);
    case ">": return num(left) > num(right);
    case "<": return num(left) < num(right);
    case ">=": return num(left) >= num(right);
    case "<=": return num(left) <= num(right);
    case "contains": return String(left).toLowerCase().includes(String(right).toLowerCase());
    case "truthy": return !!left && left !== "false" && left !== "0";
    case "empty": return left == null || left === "" || (Array.isArray(left) && left.length === 0);
    default: return false;
  }
}

async function _actorRole(tenantId, actorId) {
  if (!actorId) return null;
  const { rows } = await pool.query("SELECT role FROM users WHERE id=$1 AND tenant_id=$2", [actorId, tenantId]);
  return rows[0] ? rows[0].role : null;
}

// ── node executors: (cfg, ctx, env) → output ─────────────────────────────────
const NODES = {
  async tool(cfg, ctx, env) {
    const tools = require("../books/agenttools");
    const name = cfg.tool;
    if (!name || !tools.TOOLS[name]) throw new FlowError("BAD_NODE", `Unknown tool '${name}'`, 400);
    if (tools.isWrite(name)) {
      const def = tools.TOOLS[name];
      const role = await _actorRole(env.tenantId, env.actorId);
      if (Array.isArray(def.role) && !def.role.includes(role)) throw new FlowError("FORBIDDEN", `Your role can't run the write tool '${name}'`, 403);
    }
    return tools.runTool(env.tenantId, name, cfg.args || {}, env.actorId);
  },
  async llm(cfg, ctx, env) {
    const llm = require("../books/llm");
    const res = await llm.chat(env.tenantId, { system: cfg.system || undefined, messages: [{ role: "user", content: String(cfg.prompt || "") }] });
    return { text: res.content || "" };
  },
  async agent(cfg, ctx, env) {
    const { agents } = require("../books");
    if (!cfg.agentId) throw new FlowError("BAD_NODE", "agent node needs an agentId", 400);
    const out = await agents.runAgent(env.tenantId, env.actorId, cfg.agentId, String(cfg.message || ""));
    return { reply: out.reply, pendingActions: out.pendingActions || [] };
  },
  async http(cfg) {
    const url = String(cfg.url || "");
    if (!/^https?:\/\//i.test(url)) throw new FlowError("BAD_INPUT", "http node needs an http(s) url", 400);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(url, {
        method: cfg.method || "GET",
        headers: cfg.headers && typeof cfg.headers === "object" ? cfg.headers : {},
        body: cfg.body != null && cfg.method && cfg.method !== "GET" ? (typeof cfg.body === "string" ? cfg.body : JSON.stringify(cfg.body)) : undefined,
        signal: ctrl.signal,
      });
      const text = await resp.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      return { status: resp.status, ok: resp.ok, body };
    } catch (e) {
      throw new FlowError("HTTP_FAILED", `HTTP request failed: ${e.message}`, 502);
    } finally { clearTimeout(timer); }
  },
  async branch(cfg) {
    const result = evalCond(cfg.left, cfg.op || "truthy", cfg.right);
    return { branch: result ? "true" : "false", value: result };
  },
  async set(cfg) {
    let v = cfg.values;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = { value: v }; } }
    return v && typeof v === "object" ? v : {};
  },
  async notify(cfg, ctx, env) {
    await pool.query(
      "INSERT INTO alerts(tenant_id, rule_id, severity, title, message) VALUES($1,'flow',$2,$3,$4)",
      [env.tenantId, ["low", "medium", "high"].includes(cfg.severity) ? cfg.severity : "medium", String(cfg.title || "Flow alert").slice(0, 200), String(cfg.message || "").slice(0, 1000)]
    );
    return { notified: true };
  },
};

// Catalogue the UI uses to render the node palette + config forms.
const NODE_CATALOG = [
  { type: "tool", label: "Run a tool", desc: "Read or write business data via an agent tool", fields: [{ key: "tool", type: "toolselect", label: "Tool" }, { key: "args", type: "json", label: "Arguments" }] },
  { type: "llm", label: "Ask AI", desc: "Prompt your engine; use {{...}} for upstream data", fields: [{ key: "system", type: "text", label: "System (optional)" }, { key: "prompt", type: "textarea", label: "Prompt" }] },
  { type: "agent", label: "Run an agent", desc: "Run one of your Agent Studio agents", fields: [{ key: "agentId", type: "agentselect", label: "Agent" }, { key: "message", type: "textarea", label: "Message" }] },
  { type: "http", label: "HTTP request", desc: "Call an external API", fields: [{ key: "method", type: "select", label: "Method", options: ["GET", "POST", "PUT", "DELETE"] }, { key: "url", type: "text", label: "URL" }, { key: "headers", type: "json", label: "Headers" }, { key: "body", type: "textarea", label: "Body" }] },
  { type: "branch", label: "If / branch", desc: "Route by a condition (edges labelled true/false)", fields: [{ key: "left", type: "text", label: "Left ({{...}})" }, { key: "op", type: "select", label: "Operator", options: ["==", "!=", ">", "<", ">=", "<=", "contains", "truthy", "empty"] }, { key: "right", type: "text", label: "Right" }] },
  { type: "set", label: "Set values", desc: "Build a small object for later nodes", fields: [{ key: "values", type: "json", label: "Values" }] },
  { type: "notify", label: "Create alert", desc: "Raise an in-app alert", fields: [{ key: "title", type: "text", label: "Title" }, { key: "severity", type: "select", label: "Severity", options: ["low", "medium", "high"] }, { key: "message", type: "textarea", label: "Message" }] },
];

// ── graph walk ────────────────────────────────────────────────────────────────
function topoOrder(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) throw new FlowError("BAD_GRAPH", "An edge references a missing node", 400);
    indeg.set(e.to, indeg.get(e.to) + 1);
    adj.get(e.from).push(e.to);
  }
  const q = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (q.length) { const id = q.shift(); order.push(id); for (const t of adj.get(id)) { indeg.set(t, indeg.get(t) - 1); if (indeg.get(t) === 0) q.push(t); } }
  if (order.length !== nodes.length) throw new FlowError("CYCLE", "Flow has a cycle", 400);
  return order;
}
const edgeSatisfied = (edge, srcOut) => (!edge.branch ? true : !!srcOut && srcOut.branch === edge.branch);

function capOutput(out) {
  try { const s = JSON.stringify(out); if (s.length > 20000) return { _truncated: true, preview: s.slice(0, 2000) }; } catch { return { _unserializable: true }; }
  return out;
}

async function runGraph(graph, ctx, env, record) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  if (!nodes.length) throw new FlowError("EMPTY", "This flow has no nodes", 400);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) incoming.get(e.to) && incoming.get(e.to).push(e);
  const order = topoOrder(nodes, edges);
  const okOut = new Map();
  let failed = null;
  for (const id of order) {
    const node = byId.get(id);
    const inc = incoming.get(id) || [];
    const isActive = inc.length === 0 || inc.some((e) => okOut.has(e.from) && edgeSatisfied(e, okOut.get(e.from)));
    if (failed || !isActive) { record(id, { type: node.type, status: "skipped" }); continue; }
    const started = Date.now();
    try {
      const exec = NODES[node.type];
      if (!exec) throw new FlowError("BAD_NODE", `Unknown node type '${node.type}'`, 400);
      const cfg = resolveTemplates(node.config || {}, ctx);
      const output = await exec(cfg, ctx, env);
      ctx.nodes[id] = output;
      okOut.set(id, output);
      record(id, { type: node.type, status: "success", output: capOutput(output), ms: Date.now() - started });
    } catch (e) {
      failed = e;
      record(id, { type: node.type, status: "failed", error: e.message || String(e), ms: Date.now() - started });
    }
  }
  if (failed) throw failed;
}

// ── public ────────────────────────────────────────────────────────────────────
async function runFlow(tenantId, flowId, { triggerKind = "manual", input = {}, actorId } = {}) {
  const flow = await flows.getFlow(tenantId, flowId);
  if (flow.enabled === false && triggerKind !== "manual") throw new FlowError("DISABLED", "Flow is disabled", 422);
  const run = await flows.createRun(tenantId, flowId, triggerKind, input);
  const ctx = { trigger: input || {}, nodes: {} };
  const results = {};
  const record = (id, r) => { results[id] = r; };
  let status = "success", error = null;
  try {
    await runGraph(flow.graph || {}, ctx, { tenantId, actorId: actorId || flow.created_by || null }, record);
  } catch (e) {
    status = "failed";
    error = e && e.message ? e.message : String(e);
  }
  await flows.markRan(flowId);
  return flows.finishRun(run.id, status, results, error);
}

function _sameUTCDay(a, b) { return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate(); }
function isDue(flow, now) {
  const c = (flow.trigger && flow.trigger.config) || {};
  const freq = c.frequency || "daily";
  const last = flow.last_run_at ? new Date(flow.last_run_at) : null;
  if (freq === "hourly") return !last || now - last >= 55 * 60 * 1000;
  const hour = Number.isInteger(c.hour) ? c.hour : 9;
  if (now.getUTCHours() !== hour) return false;
  if (freq === "weekly" && now.getUTCDay() !== (Number.isInteger(c.dow) ? c.dow : 1)) return false;
  return !last || !_sameUTCDay(last, now);
}

// Hourly cron entry: run every scheduled flow that's due.
async function runDueScheduled(now = new Date()) {
  let ran = 0;
  const scheduled = await flows.listScheduledFlows().catch(() => []);
  for (const flow of scheduled) {
    if (!isDue(flow, now)) continue;
    try { await runFlow(flow.tenant_id, flow.id, { triggerKind: "schedule" }); ran++; }
    catch (e) { console.error("[flows] scheduled run failed", flow.id, e.message); }
  }
  return { ran };
}

module.exports = { runFlow, runDueScheduled, NODE_CATALOG, NODES, resolveTemplates, isDue };
