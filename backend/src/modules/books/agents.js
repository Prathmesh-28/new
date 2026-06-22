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

async function createAgent(tenantId, d) {
  d = d || {};
  if (!d.name) throw new PostError("BAD_INPUT", "name required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_agents(tenant_id,name,instructions,model,tools,enabled,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      tenantId,
      d.name,
      d.instructions || null,
      d.model || null,
      JSON.stringify(Array.isArray(d.tools) ? d.tools : []),
      d.enabled === false ? false : true,
      d.createdBy || d.created_by || null,
    ]
  );
  return rows[0];
}

async function updateAgent(tenantId, id, patch) {
  patch = patch || {};
  const tools = patch.tools === undefined ? null
    : JSON.stringify(Array.isArray(patch.tools) ? patch.tools : []);
  const { rows } = await pool.query(
    `UPDATE book_agents SET
        name=COALESCE($3,name),
        instructions=COALESCE($4,instructions),
        model=COALESCE($5,model),
        tools=COALESCE($6,tools),
        enabled=COALESCE($7,enabled),
        updated_at=now()
      WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [
      tenantId, id,
      patch.name ?? null,
      patch.instructions ?? null,
      patch.model ?? null,
      tools,
      patch.enabled ?? null,
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

  const llm = require("./llm");
  const tools = require("./agenttools");
  const rag = require("./agentrag");
  const allowed = Array.isArray(agent.tools) ? agent.tools : [];

  // Retrieve relevant knowledge for this query and prepend it to the system
  // prompt. retrieve() degrades to "" and never throws, so this never breaks a run.
  let system = agent.instructions || "";
  const ctx = await rag.retrieve(tenantId, agentId, userMessage, 5);
  if (ctx) {
    system = `${system}\n\n--- Relevant knowledge (retrieved from this agent's documents; cite it when useful) ---\n${ctx}`;
  }

  const messages = [{ role: "user", content: userMessage }];
  const steps = [];
  const pendingActions = [];
  let reply = null;
  let status = "ok";

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const message = await llm.chat(tenantId, {
        system,
        messages,
        tools: tools.toolSchemas(allowed),
        model: agent.model || undefined,
      });

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
  } catch (e) {
    status = "error";
    reply = e.message || String(e);
    await persistRun(tenantId, agentId, actorId, userMessage, reply, steps, status);
    throw e;
  }

  await persistRun(tenantId, agentId, actorId, userMessage, reply, steps, status);
  return { reply, steps, pendingActions };
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

async function persistRun(tenantId, agentId, actorId, input, reply, steps, status) {
  try {
    await pool.query(
      `INSERT INTO book_agent_runs(tenant_id,agent_id,actor_id,input,reply,steps,status)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [tenantId, agentId, actorId || null, input, reply, JSON.stringify(steps || []), status]
    );
  } catch (_) {
    // Persistence is best-effort audit; never let it mask the run's outcome.
  }
}

module.exports = {
  createAgent, listAgents, getAgent, updateAgent, deleteAgent, runAgent, confirmAction,
};
