// Provider-agnostic LLM gateway. Talks to any OpenAI-compatible /chat/completions
// endpoint (default OpenRouter). Per-tenant config lives in tenant_llm_config; the
// API key is encrypted at rest (AES-256-GCM) and only decrypted server-side for the
// outbound call - getTenantLlm NEVER returns the key, only hasKey.
const crypto = require("node:crypto");
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
// Free by default so the app works on a zero-credit OpenRouter account. owl-alpha is
// a free, ~1M-context text model - used for ALL chat (insights, assistant, CFO brief,
// WhatsApp, categorizer). Override per-tenant in Books → AI Agents, or globally via
// the AGENT_MODEL env var (e.g. a paid Claude model once credits are added).
const DEFAULT_MODEL = () => process.env.AGENT_MODEL || "openrouter/owl-alpha";
// Receipt/document capture needs image input; the chat model may be text-only, so
// vision uses its own free image-capable default. Override via AGENT_VISION_MODEL.
const DEFAULT_VISION_MODEL = () => process.env.AGENT_VISION_MODEL || "openrouter/free";
const DEFAULT_EMBED_MODEL = () => process.env.AGENT_EMBED_MODEL || "openai/text-embedding-3-small";

// --- encryption at rest (AES-256-GCM, scrypt-derived key) ---------------------
// The stored blob is iv(12) | tag(16) | ciphertext, base64-encoded. The key is
// derived from the agent secret via scrypt with a fixed salt so the same secret
// always reproduces the same key (no salt column needed).
function _key() {
  const secret = process.env.AGENT_KEY_SECRET || process.env.JWT_SECRET || "dev-secret";
  return crypto.scryptSync(secret, "headroom-llm-config", 32);
}

function encryptKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", _key(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

function decryptKey(blob) {
  if (!blob) return null;
  try {
    const buf = Buffer.from(blob, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", _key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null; // tampered / wrong secret - treat as no key
  }
}

// --- tenant config ------------------------------------------------------------
// Returns the public view of a tenant's LLM config. Never includes the key -
// only hasKey, which is true if either a tenant key is stored or the env
// fallback (OPENROUTER_API_KEY) is present.
async function getTenantLlm(tenantId) {
  const { rows } = await pool.query(
    "SELECT base_url, model, embed_model, api_key_enc FROM tenant_llm_config WHERE tenant_id=$1",
    [tenantId]
  );
  const row = rows[0] || {};
  const hasTenantKey = !!decryptKey(row.api_key_enc);
  return {
    baseUrl: row.base_url || DEFAULT_BASE_URL,
    model: row.model || DEFAULT_MODEL(),
    embedModel: row.embed_model || DEFAULT_EMBED_MODEL(),
    hasKey: hasTenantKey || !!process.env.OPENROUTER_API_KEY,
  };
}

// Upsert a tenant's LLM config. A blank/omitted apiKey leaves any existing
// encrypted key untouched; a non-empty apiKey replaces it.
async function setTenantLlm(tenantId, { baseUrl, model, apiKey, embedModel } = {}) {
  const enc = apiKey ? encryptKey(apiKey) : null;
  await pool.query(
    `INSERT INTO tenant_llm_config(tenant_id, base_url, model, embed_model, api_key_enc, updated_at)
       VALUES($1,$2,$3,$4,$5,now())
     ON CONFLICT(tenant_id) DO UPDATE SET
       base_url=COALESCE($2, tenant_llm_config.base_url),
       model=COALESCE($3, tenant_llm_config.model),
       embed_model=COALESCE($4, tenant_llm_config.embed_model),
       api_key_enc=COALESCE($5, tenant_llm_config.api_key_enc),
       updated_at=now()`,
    [tenantId, baseUrl || null, model || null, embedModel || null, enc]
  );
  return getTenantLlm(tenantId);
}

// Resolve the secret key for an outbound call: tenant key first, env fallback next.
async function _resolveSecret(tenantId) {
  const { rows } = await pool.query(
    "SELECT base_url, model, embed_model, api_key_enc FROM tenant_llm_config WHERE tenant_id=$1",
    [tenantId]
  );
  const row = rows[0] || {};
  const tenantKey = decryptKey(row.api_key_enc);
  return {
    baseUrl: row.base_url || DEFAULT_BASE_URL,
    model: row.model || DEFAULT_MODEL(),
    embedModel: row.embed_model || DEFAULT_EMBED_MODEL(),
    key: tenantKey || process.env.OPENROUTER_API_KEY || null,
  };
}

// --- usage --------------------------------------------------------------------
// Normalize a provider response's data.usage into a stable shape. OpenAI-compatible
// endpoints (OpenRouter included) return { prompt_tokens, completion_tokens,
// total_tokens }; any field may be absent, so default each to 0.
function parseUsage(data) {
  const u = (data && data.usage) || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    prompt_tokens: n(u.prompt_tokens),
    completion_tokens: n(u.completion_tokens),
    total_tokens: n(u.total_tokens),
  };
}

// Is this error a billing/out-of-credits failure we should recover from by
// retrying on the free default model? (402 Payment Required / "insufficient credits")
function _isPaymentError(e) {
  if (!e) return false;
  if (e.providerStatus === 402) return true;
  return /insufficient credit|payment required|\(402\)|\b402\b/i.test(e.providerText || e.message || "");
}

// --- Gemini fallback ----------------------------------------------------------
// Google's Gemini exposes an OpenAI-COMPATIBLE endpoint, so it slots into the same
// attempt() path as a fallback provider. Used when the primary (OpenRouter) fails, or
// as the engine when no OpenRouter key is configured at all. Platform-level key (env).
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
function geminiProvider() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return { baseUrl: GEMINI_BASE, key, model: process.env.GEMINI_MODEL || "gemini-2.0-flash" };
}

// --- chat ---------------------------------------------------------------------
// Maps our { system, messages, tools } onto an OpenAI chat-completions request and
// returns the assistant message { content, tool_calls, usage }. Throws PostError on
// any non-2xx so callers get a consistent, surfaceable error. If the configured model
// is out of credits (402), retries ONCE on the free default model so the app keeps
// working without a paid balance - unless the configured model already IS the default.
async function chat(tenantId, { system, messages = [], tools, model: modelOverride } = {}) {
  const { baseUrl, model: tenantModel, key } = await _resolveSecret(tenantId);
  const requestedModel = modelOverride || tenantModel;   // per-agent / tenant model wins
  const gem = geminiProvider();
  if (!key && !gem) {
    throw new PostError(
      "LLM_NOT_CONFIGURED",
      "Connect an LLM provider (OpenRouter key) in Agents settings",
      422
    );
  }

  const oaMessages = [];
  if (system) oaMessages.push({ role: "system", content: String(system) });
  for (const m of messages) oaMessages.push({ role: m.role, content: m.content });

  // attempt() targets the tenant's OpenRouter by default, or an override provider
  // (e.g. Gemini) when one is passed.
  const attempt = async (useModel, provider) => {
    const pBase = provider ? provider.baseUrl : baseUrl;
    const pKey = provider ? provider.key : key;
    const pModel = provider ? provider.model : useModel;
    const url = pBase.replace(/\/+$/, "") + "/chat/completions";
    const body = { model: pModel, messages: oaMessages };
    if (tools && tools.length) body.tools = tools;
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pKey}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new PostError("LLM_NETWORK", `LLM request failed: ${e.message}`, 502);
    }
    if (!resp.ok) {
      let text;
      try { text = await resp.text(); } catch { text = ""; }
      const err = new PostError("LLM_ERROR", `LLM provider error (${resp.status}): ${text}`, 502);
      err.providerStatus = resp.status;
      err.providerText = text;
      throw err;
    }
    const data = await resp.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new PostError("LLM_ERROR", "LLM returned no message", 502);
    return { content: msg.content || "", tool_calls: msg.tool_calls, usage: parseUsage(data) };
  };

  // No OpenRouter key but Gemini is configured → Gemini is the engine.
  if (!key && gem) return await attempt(null, gem);

  try {
    return await attempt(requestedModel);
  } catch (e) {
    const freeModel = DEFAULT_MODEL();
    if (_isPaymentError(e) && requestedModel !== freeModel) {
      try { console.warn(`[llm] model "${requestedModel}" out of credits - falling back to free "${freeModel}"`); } catch {}
      try { return await attempt(freeModel); } catch (e2) { e = e2; }
    }
    // Last resort: Gemini fallback when the primary provider is failing.
    if (gem) {
      try { console.warn(`[llm] primary failed (${e.providerStatus || e.code || ""}) - falling back to Gemini`); } catch {}
      try { return await attempt(null, gem); } catch { /* Gemini also failed → surface the original error */ }
    }
    throw e;
  }
}

// --- streaming chat -----------------------------------------------------------
// Same contract as chat() but streams the completion: calls onDelta({type:"token",
// text}) for each content fragment as it arrives, and returns the fully-assembled
// { content, tool_calls, usage } once the stream ends. Used to show the agent's
// reasoning live (vs. an opaque spinner). Preserves the tool-use message protocol
// (assistant tool_calls turns + tool results) and keeps the 402→free-model fallback
// for the pre-stream phase. `signal` lets the caller abort on client disconnect.
async function chatStream(tenantId, { system, messages = [], tools, model: modelOverride, signal } = {}, onDelta) {
  const { baseUrl, model: tenantModel, key } = await _resolveSecret(tenantId);
  const requestedModel = modelOverride || tenantModel;
  const gem = geminiProvider();
  if (!key && !gem) throw new PostError("LLM_NOT_CONFIGURED", "Connect an LLM provider (OpenRouter key) in Agents settings", 422);

  const oaMessages = [];
  if (system) oaMessages.push({ role: "system", content: String(system) });
  for (const m of messages) {
    const msg = { role: m.role };
    if (m.content !== undefined) msg.content = m.content;
    if (m.tool_calls) msg.tool_calls = m.tool_calls;       // preserve the tool-use protocol
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    oaMessages.push(msg);
  }

  const attempt = async (useModel, provider) => {
    const pBase = provider ? provider.baseUrl : baseUrl;
    const pKey = provider ? provider.key : key;
    const pModel = provider ? provider.model : useModel;
    const url = pBase.replace(/\/+$/, "") + "/chat/completions";
    const body = { model: pModel, messages: oaMessages, stream: true, stream_options: { include_usage: true } };
    if (tools && tools.length) body.tools = tools;
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new PostError("LLM_NETWORK", `LLM request failed: ${e.message}`, 502);
    }
    if (!resp.ok || !resp.body) {
      let text; try { text = await resp.text(); } catch { text = ""; }
      const err = new PostError("LLM_ERROR", `LLM provider error (${resp.status}): ${text}`, 502);
      err.providerStatus = resp.status; err.providerText = text; throw err;
    }
    let content = "";
    const acc = [];          // tool_calls accumulated by index across fragments
    let usage = null;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // Parse one SSE block (one or more "data:" lines), accumulating into closures.
    const consume = (block) => {
      for (const line of block.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let j; try { j = JSON.parse(payload); } catch { continue; }
        if (j.usage) usage = j.usage;
        const d = j.choices && j.choices[0] && j.choices[0].delta;
        if (!d) continue;
        if (d.content) { content += d.content; if (onDelta) { try { onDelta({ type: "token", text: d.content }); } catch { /* ignore sink errors */ } } }
        if (Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            const i = Number.isInteger(tc.index) ? tc.index : 0;
            if (!acc[i]) acc[i] = { id: tc.id || `call_${i}`, type: "function", function: { name: "", arguments: "" } };
            if (tc.id) acc[i].id = tc.id;
            if (tc.function && tc.function.name) acc[i].function.name += tc.function.name;
            if (tc.function && tc.function.arguments) acc[i].function.arguments += tc.function.arguments;
          }
        }
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n\n")) >= 0) {
        consume(buf.slice(0, nl)); buf = buf.slice(nl + 2);
      }
    }
    if (buf.trim()) consume(buf);   // flush a trailing frame not terminated by \n\n
    const tool_calls = acc.filter(Boolean);
    return { content, tool_calls: tool_calls.length ? tool_calls : undefined, usage: parseUsage({ usage }) };
  };

  // No OpenRouter key but Gemini is configured → Gemini is the engine.
  if (!key && gem) return await attempt(null, gem);

  // A fallback is only safe BEFORE any token is emitted (a pre-stream error:
  // a non-2xx response sets providerStatus, a fetch failure carries LLM_NETWORK).
  // A mid-stream break must not retry - that would replay already-shown tokens.
  const preStream = (e) => e && (e.providerStatus || e.code === "LLM_NETWORK");

  try {
    return await attempt(requestedModel);
  } catch (e) {
    if (e.name === "AbortError") throw e;
    const freeModel = DEFAULT_MODEL();
    if (_isPaymentError(e) && requestedModel !== freeModel) {
      try { return await attempt(freeModel); } catch (e2) { if (e2.name === "AbortError") throw e2; e = e2; }
    }
    if (gem && preStream(e)) {
      try { console.warn(`[llm] stream primary failed (${e.providerStatus || e.code || ""}) - falling back to Gemini`); } catch {}
      try { return await attempt(null, gem); } catch { /* Gemini also failed → surface the original error */ }
    }
    throw e;
  }
}

// --- embeddings ---------------------------------------------------------------
// Maps texts[] onto an OpenAI-shape /embeddings request and returns a parallel
// array of vectors (number[][]). Uses the tenant's embed model. Throws a typed
// PostError on ANY failure (no key, network, non-2xx, bad shape) so the RAG layer
// (agentrag.js) can catch it and degrade gracefully instead of breaking a run.
async function embed(tenantId, texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t == null ? "" : t));
  if (!list.length) return [];
  const { baseUrl, embedModel, key } = await _resolveSecret(tenantId);
  if (!key) throw new PostError("LLM_NOT_CONFIGURED", "No LLM key configured for embeddings", 422);

  const url = baseUrl.replace(/\/+$/, "") + "/embeddings";
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: embedModel, input: list }),
    });
  } catch (e) {
    throw new PostError("EMBED_NETWORK", `Embedding request failed: ${e.message}`, 502);
  }
  if (!resp.ok) {
    let text;
    try { text = await resp.text(); } catch { text = ""; }
    throw new PostError("EMBED_ERROR", `Embedding provider error (${resp.status}): ${text}`, 502);
  }
  const data = await resp.json();
  const rows = data && Array.isArray(data.data) ? data.data : null;
  if (!rows || rows.length !== list.length) throw new PostError("EMBED_ERROR", "Embedding provider returned an unexpected shape", 502);
  // Preserve request order (OpenAI returns an index per row).
  const out = new Array(list.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const idx = Number.isInteger(r.index) ? r.index : i;
    if (!Array.isArray(r.embedding)) throw new PostError("EMBED_ERROR", "Embedding provider returned no vector", 502);
    out[idx] = r.embedding.map(Number);
  }
  // Vectors stay the primary return value (number[][]); expose usage non-enumerably
  // so existing callers that index/iterate the array are unaffected.
  Object.defineProperty(out, "usage", { value: parseUsage(data), enumerable: false });
  return out;
}

// --- vision (image → text/JSON) ----------------------------------------------
// OpenAI-compatible multimodal call: an image (data URL) + prompt to the tenant's
// model (must be vision-capable, e.g. Claude Sonnet via OpenRouter). Same engine as
// chat() - used for receipt/document capture. Returns the assistant text.
async function vision(tenantId, { system, prompt, imageDataUrl, model: modelOverride, maxTokens = 600 } = {}) {
  const { baseUrl, key } = await _resolveSecret(tenantId);
  // The tenant's chat model may be text-only, so default to the free image-capable
  // model for vision unless the caller explicitly passes a model override.
  const model = modelOverride || DEFAULT_VISION_MODEL();
  if (!key) throw new PostError("LLM_NOT_CONFIGURED", "Connect an LLM provider (OpenRouter key) in Agents settings", 422);
  const userContent = [];
  if (prompt) userContent.push({ type: "text", text: prompt });
  userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userContent });
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";

  const attempt = async (useModel) => {
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: useModel, messages, max_tokens: maxTokens }),
      });
    } catch (e) { throw new PostError("LLM_NETWORK", `LLM request failed: ${e.message}`, 502); }
    if (!resp.ok) {
      let t; try { t = await resp.text(); } catch { t = ""; }
      const err = new PostError("LLM_ERROR", `LLM provider error (${resp.status}): ${t}`, 502);
      err.providerStatus = resp.status; err.providerText = t;
      throw err;
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || "";
  };

  try {
    return await attempt(model);
  } catch (e) {
    const freeVision = DEFAULT_VISION_MODEL();
    if (_isPaymentError(e) && model !== freeVision) {
      try { console.warn(`[llm] vision model "${model}" out of credits - falling back to free "${freeVision}"`); } catch {}
      return await attempt(freeVision);
    }
    throw e;
  }
}

module.exports = { getTenantLlm, setTenantLlm, chat, chatStream, embed, vision, encryptKey, decryptKey };
