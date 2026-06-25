// Book Agents — user-defined LLM agents with tool-use, scoped per tenant. An
// agent is a saved (instructions, model, allowed-tools) bundle; runAgent drives
// the OpenAI-style tool-use loop: ask the model, run any tool calls it requests,
// feed results back, repeat (bounded) until it answers in prose. Every run is
// recorded in book_agent_runs for audit. The LLM transport (llm.js) and the tool
// registry (agenttools.js) are required lazily so this module never couples to
// their load order or to whether a tenant has an LLM configured.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const MAX_STEPS = 6;

// ── CRUD ────────────────────────────────────────────────────────────────────
async function listAgents(tenantId) {
  const { rows } = await pool.query(
    "SELECT * FROM book_agents WHERE tenant_id=$1 ORDER BY name",
    [tenantId]
  );
  return rows;
}

async function getAgent(tenantId, id) {
  const { rows } = await pool.query(
    "SELECT * FROM book_agents WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Agent not found", 404);
  return rows[0];
}

// Normalise a schedule value to one of the accepted modes; anything else → 'off'.
function _normSchedule(v) {
  const s = String(v == null ? "off" : v).trim().toLowerCase();
  return s === "daily" || s === "weekly" ? s : "off";
}

async function createAgent(tenantId, d) {
  d = d || {};
  if (!d.name) throw new PostError("BAD_INPUT", "name required", 400);
  // Enforce the super-admin-set cap on agents per tenant (limits.maxAgentsPerTenant,
  // default 25; 0 = unlimited). Tunable live in the console.
  const cap = await require("../../lib/platformConfig").num("limits", "maxAgentsPerTenant", 25);
  if (cap > 0) {
    const { rows: cnt } = await pool.query("SELECT count(*)::int AS n FROM book_agents WHERE tenant_id=$1", [tenantId]);
    if ((cnt[0]?.n ?? 0) >= cap) {
      throw new PostError("AGENT_LIMIT", `Agent limit reached (${cap}). Delete an agent or ask your admin to raise the limit.`, 422);
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO book_agents
       (tenant_id,name,instructions,model,tools,enabled,created_by,
        schedule,schedule_hour,schedule_dow,trigger_prompt)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      tenantId,
      d.name,
      d.instructions || null,
      d.model || null,
      JSON.stringify(Array.isArray(d.tools) ? d.tools : []),
      d.enabled === false ? false : true,
      d.createdBy || d.created_by || null,
      _normSchedule(d.schedule),
      d.scheduleHour ?? d.schedule_hour ?? 9,
      d.scheduleDow ?? d.schedule_dow ?? null,
      d.triggerPrompt ?? d.trigger_prompt ?? null,
    ]
  );
  return rows[0];
}

async function updateAgent(tenantId, id, patch) {
  patch = patch || {};
  const tools = patch.tools === undefined ? null
    : JSON.stringify(Array.isArray(patch.tools) ? patch.tools : []);
  // schedule is normalised only when present in the patch (so COALESCE keeps the
  // stored value when the caller doesn't touch it).
  const schedule = (patch.schedule === undefined) ? null : _normSchedule(patch.schedule);
  const scheduleHour = patch.scheduleHour ?? patch.schedule_hour ?? null;
  const scheduleDow = patch.scheduleDow ?? patch.schedule_dow ?? null;
  const triggerPrompt = patch.triggerPrompt ?? patch.trigger_prompt ?? null;
  const { rows } = await pool.query(
    `UPDATE book_agents SET
        name=COALESCE($3,name),
        instructions=COALESCE($4,instructions),
        model=COALESCE($5,model),
        tools=COALESCE($6,tools),
        enabled=COALESCE($7,enabled),
        schedule=COALESCE($8,schedule),
        schedule_hour=COALESCE($9,schedule_hour),
        schedule_dow=COALESCE($10,schedule_dow),
        trigger_prompt=COALESCE($11,trigger_prompt),
        updated_at=now()
      WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [
      tenantId, id,
      patch.name ?? null,
      patch.instructions ?? null,
      patch.model ?? null,
      tools,
      patch.enabled ?? null,
      schedule,
      scheduleHour,
      scheduleDow,
      triggerPrompt,
    ]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Agent not found", 404);
  return rows[0];
}

async function deleteAgent(tenantId, id) {
  const { rowCount } = await pool.query(
    "DELETE FROM book_agents WHERE tenant_id=$1 AND id=$2",
    [tenantId, id]
  );
  if (!rowCount) throw new PostError("NOT_FOUND", "Agent not found", 404);
  return { deleted: true };
}

// ── Tool-use runtime ──────────────────────────────────────────────────────────
// Drives the OpenAI-style loop. On each turn we hand the model the agent's
// system prompt, the running message history and the JSON schemas of its allowed
// tools. If the model replies with tool_calls we execute each, append a matching
// {role:"tool"} message, record a step, and loop. A failing tool never aborts the
// run — its error becomes the tool result so the model can recover. We stop when
// the model answers in prose or after MAX_STEPS turns. Every run is persisted.
async function runAgent(tenantId, actorId, agentId, userMessage) {
  const agent = await getAgent(tenantId, agentId);
  if (agent.enabled === false) throw new PostError("AGENT_DISABLED", "This agent is disabled", 422);

  // Enforce the super-admin-set monthly AI token cap (limits.monthlyTokenCap; 0 = unlimited).
  const tokenCap = await require("../../lib/platformConfig").num("limits", "monthlyTokenCap", 0);
  if (tokenCap > 0) {
    const { rows: used } = await pool.query(
      "SELECT COALESCE(SUM(value),0)::bigint AS n FROM book_usage_events WHERE tenant_id=$1 AND metric='agent_tokens' AND event_time >= date_trunc('month', now())",
      [tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (Number(used[0]?.n ?? 0) >= tokenCap) {
      throw new PostError("TOKEN_CAP", `This month's AI usage cap (${tokenCap.toLocaleString("en-IN")} tokens) is reached. It resets next month, or your admin can raise it.`, 422);
    }
  }

  const runId = _newRunId();
  const steps = [];
  const pendingActions = [];
  let reply = null;
  let status = "ok";
  let totalTokens = 0;

  try {
    const out = await _driveLoop(tenantId, actorId, agent, userMessage, steps, pendingActions, false);
    reply = out.reply;
    totalTokens = out.totalTokens;
  } catch (e) {
    status = "error";
    reply = e.message || String(e);
    await persistRun(tenantId, agentId, actorId, userMessage, reply, steps, status);
    await _recordUsage(tenantId, runId, totalTokens);
    throw e;
  }

  await persistRun(tenantId, agentId, actorId, userMessage, reply, steps, status);
  // Best-effort token metering — must never throw or affect the run's result.
  await _recordUsage(tenantId, runId, totalTokens);
  return { reply, steps, pendingActions };
}

// Generate a stable per-run id used as the usage dedupKey (the runs table assigns
// its own UUID, so we keep an independent token-meter key here).
function _newRunId() {
  return `agentrun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Record agent token usage for the tenant. Best-effort: ingestUsage may reject (it
// requires a subscriptionId) or the table may be unavailable — either way we swallow
// it so metering never breaks or aborts an agent run.
async function _recordUsage(tenantId, runId, totalTokens) {
  try {
    await require("./usage").ingestUsage(tenantId, {
      metric: "agent_tokens",
      value: totalTokens || 0,
      dedupKey: runId,
    });
  } catch (_) {
    // metering is best-effort; ignore.
  }
}

// Shared tool-use loop. Drives the OpenAI-style turn loop, executing READ tools
// inline and collecting WRITE tools as pendingActions. `readOnly` (used by scheduled
// autonomous runs) forces ALL write tools to be recorded for human approval and never
// executed — the inline path already does this, so readOnly is reserved for clarity
// and to forbid any future inline-write behaviour. Returns { reply, totalTokens }.
async function _driveLoop(tenantId, actorId, agent, userMessage, steps, pendingActions, readOnly) {
  const llm = require("./llm");
  const tools = require("./agenttools");
  const rag = require("./agentrag");
  const allowed = Array.isArray(agent.tools) ? agent.tools : [];

  // Retrieve relevant knowledge for this query and prepend it to the system
  // prompt. retrieve() degrades to "" and never throws, so this never breaks a run.
  let system = agent.instructions || "";
  const ctx = await rag.retrieve(tenantId, agent.id, userMessage, 5);
  if (ctx) {
    system = `${system}\n\n--- Relevant knowledge (retrieved from this agent's documents; cite it when useful) ---\n${ctx}`;
  }

  const messages = [{ role: "user", content: userMessage }];
  let reply = null;
  let totalTokens = 0;

  for (let i = 0; i < MAX_STEPS; i++) {
    const message = await llm.chat(tenantId, {
      system,
      messages,
      tools: tools.toolSchemas(allowed),
      model: agent.model || undefined,
    });
    totalTokens += (message && message.usage && Number(message.usage.total_tokens)) || 0;

    const toolCalls = message && message.tool_calls;
    if (!toolCalls || !toolCalls.length) {
      reply = (message && message.content) || "";
      break;
    }

    // Keep the assistant turn (with its tool_calls) before the tool replies.
    messages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const fn = (call && call.function) || {};
      const name = fn.name;
      let args = {};
      let result;
      let parseError = false;
      try {
        args = fn.arguments ? JSON.parse(fn.arguments) : {};
      } catch (e) {
        args = {};
        result = { error: `Bad tool arguments: ${e.message}` };
        parseError = true;
      }

      // WRITE tools are NEVER executed inline — collect them for human approval
      // and feed the model an "awaiting_approval" result so it stops retrying.
      // (readOnly is true for autonomous scheduled runs; the inline path is already
      // read-only for writes, so behaviour is identical either way — writes are
      // never executed without an explicit confirmAction call.)
      if (!parseError && tools.isWrite(name)) {
        const id = `pa_${Date.now().toString(36)}_${pendingActions.length}`;
        const label = describeAction(name, args);
        pendingActions.push({ id, tool: name, args, label });
        result = { status: "awaiting_approval", message: "This action needs human approval before it runs.", tool: name };
      } else if (result === undefined) {
        // READ tool — execute inline. A bad tool must never abort the run.
        try {
          result = await tools.runTool(tenantId, name, args, actorId);
        } catch (e) {
          result = { error: e.message || String(e) };
        }
      }

      steps.push({ tool: name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Loop exhausted without a prose answer.
  if (reply === null) reply = "";
  return { reply, totalTokens };
}

// Human-readable one-liner for a pending write action, shown on the approval card.
function describeAction(tool, args) {
  const a = args || {};
  switch (tool) {
    case "create_sales_invoice":
      return `Create a sales invoice${a.subtotal ? ` for ₹${a.subtotal}` : ""}${a.partyLedgerId ? ` (party ${a.partyLedgerId})` : ""}`;
    case "create_ledger":
      return `Create ledger "${a.name || "?"}"${a.group ? ` under ${a.group}` : ""}`;
    case "create_item":
      return `Create item "${a.name || "?"}"${a.unit ? ` (${a.unit})` : ""}`;
    default:
      return `Run ${tool}`;
  }
}

// Resolve the role of an actor (user) within a tenant. Returns null if unknown.
async function _actorRole(tenantId, actorId) {
  if (!actorId) return null;
  try {
    const { rows } = await pool.query(
      "SELECT role FROM users WHERE id=$1 AND tenant_id=$2",
      [actorId, tenantId]
    );
    return rows[0] ? rows[0].role : null;
  } catch (_) {
    return null;
  }
}

// Confirm (approve) a pending WRITE action. Asserts the tool is a write tool and
// that the actor's role is in the tool's allow-list, executes the real write via
// runTool, and audits it to book_agent_runs with status 'write'. The actor's role
// is taken from the payload when the route passes it, else resolved from actorId.
async function confirmAction(tenantId, actorId, payload = {}) {
  const { tool, args } = payload;
  const tools = require("./agenttools");
  if (!tools.isWrite(tool)) throw new PostError("FORBIDDEN", `'${tool}' is not an approvable write action`, 403);

  // Prefer an explicitly-passed role (common key spellings); else look it up.
  const actorRole = payload.actorRole || payload.role || payload.userRole
    || await _actorRole(tenantId, actorId);
  const def = tools.TOOLS[tool];
  const roles = (def && def.role) || [];
  if (!roles.includes(actorRole)) {
    throw new PostError("FORBIDDEN", `Your role is not permitted to run '${tool}'`, 403);
  }

  const result = await tools.runTool(tenantId, tool, args || {}, actorId);
  await persistRun(
    tenantId, null, actorId,
    JSON.stringify({ tool, args: args || {} }),
    JSON.stringify(result),
    [{ tool, args: args || {}, result }],
    "write"
  );
  return result;
}

// ── Scheduled autonomous runs (GLOBAL scan) ───────────────────────────────────
// Default prompt used when a scheduled agent has no trigger_prompt set.
const DEFAULT_TRIGGER_PROMPT =
  "Run your scheduled review now. Use your read tools to assess the current state " +
  "of the books and report anything that needs attention. Do not make changes.";

// Is a scheduled agent DUE at `now`? daily: the configured hour matches now's hour
// and it hasn't already run today. weekly: the configured day-of-week and hour both
// match and it hasn't run since the start of this week. Times are evaluated in the
// process/server local timezone (consistent with new Date()).
function _isDue(agent, now) {
  const sched = String(agent.schedule || "off").toLowerCase();
  if (sched !== "daily" && sched !== "weekly") return false;
  const hour = agent.schedule_hour == null ? 9 : Number(agent.schedule_hour);
  if (Number(now.getHours()) !== hour) return false;

  const last = agent.last_run_at ? new Date(agent.last_run_at) : null;

  if (sched === "daily") {
    // Not already run today.
    return !(last && _sameDay(last, now));
  }
  // weekly: right day-of-week, and not run since the start of this week.
  if (Number(now.getDay()) !== Number(agent.schedule_dow)) return false;
  if (!last) return true;
  return last < _startOfWeek(now);
}

function _sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Midnight at the start of `now`'s week (week starts Sunday, matching getDay()).
function _startOfWeek(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// GLOBAL scan across all tenants: find enabled agents whose schedule is due at
// `now` and run each autonomously. Autonomous runs are READ-ONLY — any write tool
// the model requests is recorded as a pendingAction in the run row for a human to
// approve later (via confirmAction), never executed here. last_run_at is advanced
// to `now` for each agent that runs (so it won't re-fire this window). A failure in
// one agent never stops the scan. Returns { ran, skipped }.
async function runScheduledAgents(now = new Date()) {
  let ran = 0;
  let skipped = 0;
  let candidates = [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM book_agents WHERE enabled=true AND schedule IS NOT NULL AND schedule<>'off'`
    );
    candidates = rows;
  } catch (_) {
    return { ran, skipped };
  }

  for (const agent of candidates) {
    if (!_isDue(agent, now)) { skipped++; continue; }
    const tenantId = agent.tenant_id;
    const prompt = (agent.trigger_prompt && String(agent.trigger_prompt).trim())
      ? agent.trigger_prompt : DEFAULT_TRIGGER_PROMPT;
    const runId = _newRunId();
    const steps = [];
    const pendingActions = [];
    let reply = null;
    let status = "scheduled";
    let totalTokens = 0;

    try {
      const out = await _driveLoop(tenantId, agent.created_by || null, agent, prompt, steps, pendingActions, true);
      reply = out.reply;
      totalTokens = out.totalTokens;
    } catch (e) {
      status = "error";
      reply = e.message || String(e);
    }

    // Persist the run (with any pendingActions for later human approval), meter
    // tokens, and advance last_run_at — each step best-effort so one failure can't
    // stall the rest of the global scan.
    await persistRun(tenantId, agent.id, agent.created_by || null, prompt, reply, steps, status, pendingActions);
    await _recordUsage(tenantId, runId, totalTokens);
    try {
      await pool.query(
        "UPDATE book_agents SET last_run_at=$3 WHERE tenant_id=$1 AND id=$2",
        [tenantId, agent.id, now.toISOString()]
      );
    } catch (_) { /* best-effort */ }
    ran++;
  }

  return { ran, skipped };
}

async function persistRun(tenantId, agentId, actorId, input, reply, steps, status, pendingActions) {
  // pendingActions (autonomous scheduled runs) have no dedicated column, so they
  // ride along inside the steps JSONB as a single trailing marker entry. This keeps
  // them durably in the run row where a human approval UI can read them back.
  let stepsPayload = Array.isArray(steps) ? steps.slice() : [];
  if (Array.isArray(pendingActions) && pendingActions.length) {
    stepsPayload.push({ pendingActions });
  }
  try {
    await pool.query(
      `INSERT INTO book_agent_runs(tenant_id,agent_id,actor_id,input,reply,steps,status)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, agentId, actorId || null, input, reply, JSON.stringify(stepsPayload), status]
    );
  } catch (_) {
    // Persistence is best-effort audit; never let it mask the run's outcome.
  }
}

// ── Sub-agent swarm (task mode) ────────────────────────────────────────────────
// Kogo-style: a planner decomposes the goal into 2-4 SPECIALIST sub-agents, each with
// its own ROLE + a focused subset of the agent's tools. The specialists run IN
// PARALLEL (each through the tool-loop, read-only — writes become pending approvals),
// then a lead synthesises one answer. Returns { reply, plan[], subResults[], pendingActions[] }.
async function runSwarm(tenantId, actorId, agentId, userMessage) {
  const agent = await getAgent(tenantId, agentId);
  if (agent.enabled === false) throw new PostError("AGENT_DISABLED", "This agent is disabled", 422);

  const tokenCap = await require("../../lib/platformConfig").num("limits", "monthlyTokenCap", 0);
  if (tokenCap > 0) {
    const { rows: used } = await pool.query(
      "SELECT COALESCE(SUM(value),0)::bigint AS n FROM book_usage_events WHERE tenant_id=$1 AND metric='agent_tokens' AND event_time >= date_trunc('month', now())",
      [tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (Number(used[0]?.n ?? 0) >= tokenCap) throw new PostError("TOKEN_CAP", `This month's AI usage cap (${tokenCap.toLocaleString("en-IN")} tokens) is reached.`, 422);
  }

  const llm = require("./llm");
  const toolsLib = require("./agenttools");
  const runId = _newRunId();
  let totalTokens = 0;
  const allowed = Array.isArray(agent.tools) ? agent.tools : [];
  const catalogDesc = toolsLib.toolCatalog().filter((t) => allowed.includes(t.name)).map((t) => `${t.name} (${t.scope || "read"}): ${t.description || ""}`).join("\n");

  // 1) Plan — specialists with role, tool subset, AND dependencies (a small DAG).
  let plan = [];
  try {
    const planMsg = await llm.chat(tenantId, {
      system: `You are the lead of a SWARM of specialist sub-agents for an Indian SMB. Break the goal into 2-5 sub-tasks. Independent ones run in parallel; a sub-task that NEEDS another's output lists that other's id in "dependsOn". For each give: "id" (e.g. "t1"), a short "role" (e.g. "Collections analyst"), the "task", "tools" (ONLY from the available tools below; [] if none), and "dependsOn" (array of other ids; [] if independent). Return ONLY a JSON array: [{"id":"t1","role":"","task":"","tools":[],"dependsOn":[]}]. No prose.\n\nAvailable tools:\n${catalogDesc || "(none)"}`,
      messages: [{ role: "user", content: userMessage }],
      model: agent.model || undefined,
    });
    totalTokens += planMsg?.usage?.total_tokens || 0;
    const j = (planMsg.content || "[]").match(/\[[\s\S]*\]/)?.[0] ?? "[]";
    plan = JSON.parse(j);
  } catch { plan = []; }
  plan = (Array.isArray(plan) ? plan : [])
    .map((p, i) => ({
      id: String(p?.id || `t${i + 1}`),
      role: String(p?.role || "Specialist").slice(0, 40),
      task: String(p?.task || "").trim(),
      tools: Array.isArray(p?.tools) ? p.tools.filter((t) => allowed.includes(t)) : [],
      dependsOn: Array.isArray(p?.dependsOn) ? p.dependsOn.map(String) : [],
    }))
    .filter((p) => p.task)
    .slice(0, 5);
  if (!plan.length) plan = [{ id: "t1", role: "Generalist", task: userMessage, tools: allowed, dependsOn: [] }];
  // Keep only edges that point at real ids in this plan (and never self).
  const planIds = new Set(plan.map((p) => p.id));
  for (const p of plan) p.dependsOn = p.dependsOn.filter((d) => planIds.has(d) && d !== p.id);

  // 2) Execute the DAG — each "wave" of ready sub-tasks runs IN PARALLEL; a dependent
  //    sub-agent receives its upstream dependencies' findings as context (chained agents).
  const runOne = async (p, depContext) => {
    const steps = [];
    const pending = [];
    const ctx = depContext ? `\n\nUpstream sub-agent findings you must build on:\n${depContext}` : "";
    const subAgent = {
      ...agent,
      tools: p.tools.length ? p.tools : allowed,
      instructions: `${agent.instructions || ""}\n\nYou are the "${p.role}" sub-agent in a swarm. Focus ONLY on this sub-task: ${p.task}.${ctx}\nUse your tools and return a tight, factual result (with ₹ where relevant) the lead can synthesise.`,
    };
    try {
      const out = await _driveLoop(tenantId, actorId, subAgent, p.task, steps, pending, true);
      return { id: p.id, role: p.role, task: p.task, reply: out.reply, steps, tokens: out.totalTokens || 0, pending };
    } catch (e) {
      return { id: p.id, role: p.role, task: p.task, reply: `Error: ${e.message || String(e)}`, steps, tokens: 0, pending };
    }
  };
  const done = {};                 // id -> completed run result
  let remaining = plan.slice();
  let guard = 0;
  while (remaining.length && guard++ <= plan.length) {
    let ready = remaining.filter((p) => p.dependsOn.every((d) => done[d]));
    if (!ready.length) ready = remaining; // unsatisfiable/cycle — break it, run the rest
    const wave = await Promise.all(ready.map((p) => {
      const depContext = p.dependsOn.map((d) => done[d]).filter(Boolean).map((r) => `- ${r.role}: ${r.reply}`).join("\n");
      return runOne(p, depContext);
    }));
    for (const r of wave) done[r.id] = r;
    remaining = remaining.filter((p) => !ready.includes(p));
  }
  const subRuns = plan.map((p) => done[p.id]).filter(Boolean);
  for (const r of subRuns) totalTokens += r.tokens;
  const pendingActions = subRuns.flatMap((r) => r.pending);
  const subResults = subRuns.map((r) => ({ task: `${r.role}: ${r.task}`, reply: r.reply, steps: r.steps }));

  // 3) Discussion round — INTER-AGENT MESSAGING: each sub-agent reads the shared
  //    blackboard (all peers' findings) and posts one short cross-check / build-on /
  //    conflict note, so the agents actually engage with each other before synthesis.
  let messages = [];
  if (subRuns.length > 1) {
    const board = subRuns.map((r) => `[${r.role}] ${r.reply}`).join("\n\n");
    messages = (await Promise.all(subRuns.map(async (r) => {
      try {
        const m = await llm.chat(tenantId, {
          system: `You are the "${r.role}" sub-agent. Read your peers' findings and post ONE short message (1-2 sentences, no tools): cross-check against your own finding, build on a peer, or flag a conflict or gap. Be specific and useful to the lead.`,
          messages: [{ role: "user", content: `Goal: ${userMessage}\n\nAll findings:\n${board}\n\nYour own finding: ${r.reply}` }],
          model: agent.model || undefined,
        });
        totalTokens += m?.usage?.total_tokens || 0;
        const text = (m.content || "").trim();
        return text ? { role: r.role, message: text } : null;
      } catch { return null; }
    }))).filter(Boolean);
  }

  // 4) Synthesise, then 5) SELF-REVIEW / RETRY: a strict reviewer checks the draft;
  //    if it flags issues the lead revises (up to MAX_REVIEW rounds). Every round is
  //    recorded so the UI can show the self-correction transparently.
  const findingsBlock = subResults.map((r, i) => `Sub-agent ${i + 1} — ${r.task}\nFinding: ${r.reply}`).join("\n\n");
  const discussionBlock = messages.length ? `\n\nInter-agent discussion:\n${messages.map((m) => `- ${m.role}: ${m.message}`).join("\n")}` : "";
  const critiques = [];
  const MAX_REVIEW = 2;
  let reply = "";
  let critiqueNote = "";
  for (let round = 1; round <= MAX_REVIEW + 1; round++) {
    try {
      const synth = await llm.chat(tenantId, {
        system: "You are the lead agent. Produce ONE clear, actionable answer for an Indian SMB owner from the specialists' findings and their discussion. Be concise, use ₹ with Indian grouping, resolve conflicts, and use ONLY the findings provided." + (critiqueNote ? " A reviewer flagged issues with your previous draft — fix every one." : ""),
        messages: [{ role: "user", content: `Goal: ${userMessage}\n\n${findingsBlock}${discussionBlock}` + (critiqueNote ? `\n\nYour previous draft:\n${reply}\n\nReviewer's required fixes:\n${critiqueNote}` : "") }],
        model: agent.model || undefined,
      });
      totalTokens += synth?.usage?.total_tokens || 0;
      reply = synth.content || reply;
    } catch { /* keep prior draft */ }
    if (round > MAX_REVIEW) break; // already did the final allowed revision
    try {
      const crit = await llm.chat(tenantId, {
        system: 'You are a strict reviewer. Check the draft answers the goal FULLY and correctly using ONLY the findings (no invented numbers, no ignored sub-task, no unresolved conflict). Return ONLY JSON: {"approved": true or false, "issues": "concise required fixes, empty if approved"}.',
        messages: [{ role: "user", content: `Goal: ${userMessage}\n\nFindings:\n${findingsBlock}\n\nDraft answer:\n${reply}` }],
        model: agent.model || undefined,
      });
      totalTokens += crit?.usage?.total_tokens || 0;
      let verdict = { approved: true, issues: "" };
      try { verdict = JSON.parse((crit.content || "{}").match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* lenient: treat as approved */ }
      critiques.push({ round, approved: !!verdict.approved, issues: String(verdict.issues || "") });
      if (verdict.approved) break;
      critiqueNote = String(verdict.issues || "");
    } catch { break; }
  }
  if (!reply) reply = subResults.map((r) => `• ${r.task}: ${r.reply}`).join("\n");

  await persistRun(tenantId, agentId, actorId, userMessage, reply, subResults.flatMap((r) => r.steps), "swarm", pendingActions);
  await _recordUsage(tenantId, runId, totalTokens);
  return {
    reply,
    plan: plan.map((p) => `${p.role}: ${p.task}${p.dependsOn.length ? ` (after ${p.dependsOn.join(", ")})` : ""}`),
    subResults, messages, critiques, pendingActions,
  };
}

// Monthly agent usage for the workspace "credits" meter.
async function usageSummary(tenantId) {
  const cap = await require("../../lib/platformConfig").num("limits", "monthlyTokenCap", 0);
  let tokensThisMonth = 0, runs = 0;
  try {
    const { rows } = await pool.query("SELECT COALESCE(SUM(value),0)::bigint AS n FROM book_usage_events WHERE tenant_id=$1 AND metric='agent_tokens' AND event_time >= date_trunc('month', now())", [tenantId]);
    tokensThisMonth = Number(rows[0]?.n ?? 0);
    const r2 = await pool.query("SELECT count(*)::int AS c FROM book_agent_runs WHERE tenant_id=$1 AND created_at >= date_trunc('month', now())", [tenantId]).catch(() => ({ rows: [{ c: 0 }] }));
    runs = Number(r2.rows[0]?.c ?? 0);
  } catch { /* table may be empty/absent — return zeros */ }
  return { tokensThisMonth, cap, runs };
}

module.exports = {
  createAgent, listAgents, getAgent, updateAgent, deleteAgent, runAgent, confirmAction,
  runScheduledAgents, runSwarm, usageSummary,
};
