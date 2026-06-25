// Headroom Studio — codegen orchestrator (App Builder, Phase 1).
//
// Turns a natural-language prompt into a real, runnable app and persists it as a
// project version. Runs on the tenant's own LLM engine (books/llm.js → OpenRouter),
// NOT the Anthropic SDK. v1 emits a SELF-CONTAINED single HTML document (inline
// CSS/JS, CDN libs allowed) so the preview runs instantly in a sandboxed iframe on
// web AND in the native app — no WebContainers/build step (see project_studio
// decision; multi-file React→WebContainers is a later upgrade).
//
// Grounding: a best-effort business snapshot (the same kv-store data the agents,
// CFO brief and WhatsApp use) is inlined so a "build my VC dashboard" prompt fills
// the app with the tenant's REAL cash / receivables / runway, not invented numbers.

const llm = require("../books/llm");
const agenttools = require("../books/agenttools");
const studio = require("./index");
const { pool } = require("../../db");

class CodegenError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}

const BUILD_SYSTEM = `You are Headroom's app-builder. You generate a COMPLETE, SELF-CONTAINED single-file web app as ONE HTML document.

Hard rules:
- Output ONLY the HTML document, starting with <!doctype html>. No markdown, no code fences, no commentary before or after.
- Put everything inline in that one file: CSS in <style>, JS in <script>. You MAY load libraries (React, Tailwind, Chart.js, etc.) from a public https CDN, but the app must work as a single self-contained file.
- The app runs inside a sandboxed iframe with no access to the host page, cookies, or our backend. Do NOT call our APIs or any private endpoint — inline the data provided below as JS constants.
- Build a polished, responsive, genuinely usable UI (cards, tables, charts, filters) — not a wireframe. A clean modern dark theme works well.
- Use the REAL business data provided. Never fabricate specific financial figures beyond what is given; show a sensible empty state when data is missing.
- Format Indian currency as ₹ with lakh/crore grouping where natural.`;

const PLAN_SYSTEM = `You are Headroom's app-builder, planning step. Given the user's request, return a SHORT plan (3 to 6 concise bullet points) describing the app you will build: its purpose, the key sections/screens, and which business data it will use. Plain text bullets only — no code, no HTML.`;

// Pull a best-effort business snapshot to ground the generated app. Never throws.
async function businessContext(tenantId, actorId) {
  try {
    const snap = await agenttools.runTool(tenantId, "get_business_snapshot", {}, actorId);
    const json = JSON.stringify(snap);
    return json.length > 8000 ? json.slice(0, 8000) + "…(truncated)" : json;
  } catch (_) {
    return null;
  }
}

// Robustly pull a full HTML document out of the model's reply.
function extractHtml(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : raw;
  const lower = body.toLowerCase();
  const start = lower.indexOf("<!doctype");
  const htmlStart = start >= 0 ? start : lower.indexOf("<html");
  if (htmlStart >= 0) {
    const end = lower.lastIndexOf("</html>");
    return end >= 0 ? body.slice(htmlStart, end + 7) : body.slice(htmlStart);
  }
  // Fallback: the model returned prose/markup without a full doc — wrap it so it still renders.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;background:#101830;color:#E8EDF6;margin:0;padding:24px;line-height:1.6}</style></head><body>${body}</body></html>`;
}

async function _checkTokenCap(tenantId) {
  const tokenCap = await require("../../lib/platformConfig").num("limits", "monthlyTokenCap", 0);
  if (tokenCap > 0) {
    const { rows } = await pool.query(
      "SELECT COALESCE(SUM(value),0)::bigint AS n FROM book_usage_events WHERE tenant_id=$1 AND metric='agent_tokens' AND event_time >= date_trunc('month', now())",
      [tenantId]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (Number(rows[0]?.n ?? 0) >= tokenCap) {
      throw new CodegenError("TOKEN_CAP", `This month's AI usage cap (${tokenCap.toLocaleString("en-IN")} tokens) is reached. It resets next month, or your admin can raise it.`, 422);
    }
  }
}

async function _meter(tenantId, totalTokens) {
  try {
    await require("../books/usage").ingestUsage(tenantId, {
      metric: "agent_tokens",
      value: totalTokens || 0,
      dedupKey: `studiogen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    });
  } catch (_) { /* metering is best-effort */ }
}

/**
 * Generate (or plan) an app for a project.
 * @param {object} opts { prompt, mode: "plan"|"build", model? }
 * @returns plan mode → { mode:"plan", plan }. build mode → { mode:"build", version, html, summary }.
 */
async function generate(tenantId, actorId, projectId, { prompt, mode = "build", model } = {}) {
  const ask = String(prompt || "").trim();
  if (!ask) throw new CodegenError("EMPTY_PROMPT", "Describe what you want to build", 400);

  // Tenant scope + ownership: resolve the project (throws NOT_FOUND across tenants).
  const project = await studio.getProject(tenantId, projectId);
  await _checkTokenCap(tenantId);

  if (mode === "plan") {
    const res = await llm.chat(tenantId, {
      system: PLAN_SYSTEM,
      messages: [{ role: "user", content: ask }],
      model: model || undefined,
    });
    await _meter(tenantId, res?.usage?.total_tokens);
    return { mode: "plan", plan: (res?.content || "").trim() };
  }

  const ctx = await businessContext(tenantId, actorId);
  const currentRaw = project.current_version && project.current_version.file_tree && project.current_version.file_tree["index.html"];
  // Cap the fed-back HTML so an ever-growing app can't blow the model's context/cost.
  // Generous (self-contained apps are usually well under this); only pathological sizes truncate.
  const MAX_CONTEXT_HTML = 60000;
  const current = currentRaw && currentRaw.length > MAX_CONTEXT_HTML ? currentRaw.slice(0, MAX_CONTEXT_HTML) + "\n<!-- …truncated for length; preserve overall structure --> " : currentRaw;
  let system = BUILD_SYSTEM;
  if (ctx) system += `\n\n--- Business data (real; inline what's relevant) ---\n${ctx}`;

  // Agent bridge: if this project has granted agents, tell the model how to embed them.
  const grants = await studio.listAppAgents(tenantId, projectId).then((g) => g.granted).catch(() => []);
  if (grants && grants.length) {
    system += `\n\n--- Embeddable agents (this app may call these) ---\n`
      + `When the user asks for a chatbot/assistant/"ask" feature, add a chat widget that calls:\n`
      + `  window.HEADROOM.askAgent(agentId, message)  // returns a Promise<{reply:string}>\n`
      + `(window.HEADROOM is injected at runtime; guard with: if (window.HEADROOM) { ... } else show "Publish to enable the assistant".)\n`
      + `Available agents: ${grants.map((a) => `"${a.name}" (id ${a.id})`).join(", ")}.`;
  }
  if (current) system += `\n\n--- Current app HTML (apply the requested change and return the FULL updated document) ---\n${current}`;

  const res = await llm.chat(tenantId, {
    system,
    messages: [{ role: "user", content: ask }],
    model: model || undefined,
  });
  await _meter(tenantId, res?.usage?.total_tokens);

  const html = extractHtml(res?.content);
  if (!html || html.length < 40) throw new CodegenError("EMPTY_OUTPUT", "The engine returned no usable app — try rephrasing.", 502);

  const summary = ask.length > 90 ? ask.slice(0, 90) + "…" : ask;
  const version = await studio.createVersion(tenantId, projectId, actorId, {
    file_tree: { "index.html": html },
    prompt: ask,
    summary,
  });
  return { mode: "build", version, html, summary };
}

module.exports = { generate, CodegenError, extractHtml };
