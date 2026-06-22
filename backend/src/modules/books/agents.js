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
  const allowed = Array.isArray(agent.tools) ? agent.tools : [];

  const messages = [{ role: "user", content: userMessage }];
  const steps = [];
  let reply = null;
  let status = "ok";

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const message = await llm.chat(tenantId, {
        system: agent.instructions,
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
        try {
          args = fn.arguments ? JSON.parse(fn.arguments) : {};
        } catch (e) {
          args = {};
          result = { error: `Bad tool arguments: ${e.message}` };
        }
        if (result === undefined) {
          try {
            result = await tools.runTool(tenantId, name, args);
          } catch (e) {
            // A bad tool must never abort the run — surface it as the result.
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
  return { reply, steps };
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
  createAgent, listAgents, getAgent, updateAgent, deleteAgent, runAgent,
};
