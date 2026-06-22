// Provider-agnostic LLM gateway. Talks to any OpenAI-compatible /chat/completions
// endpoint (default OpenRouter). Per-tenant config lives in tenant_llm_config; the
// API key is encrypted at rest (AES-256-GCM) and only decrypted server-side for the
// outbound call — getTenantLlm NEVER returns the key, only hasKey.
const crypto = require("node:crypto");
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = () => process.env.AGENT_MODEL || "anthropic/claude-sonnet-4.6";
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
    return null; // tampered / wrong secret — treat as no key
  }
}

// --- tenant config ------------------------------------------------------------
// Returns the public view of a tenant's LLM config. Never includes the key —
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

// --- chat ---------------------------------------------------------------------
// Maps our { system, messages, tools } onto an OpenAI chat-completions request and
// returns the assistant message { content, tool_calls }. Throws PostError on any
// non-2xx so callers get a consistent, surfaceable error.
async function chat(tenantId, { system, messages = [], tools, model: modelOverride } = {}) {
  const { baseUrl, model: tenantModel, key } = await _resolveSecret(tenantId);
  const model = modelOverride || tenantModel;   // per-agent model override wins
  if (!key) {
    throw new PostError(
      "LLM_NOT_CONFIGURED",
      "Connect an LLM provider (OpenRouter key) in Agents settings",
      422
    );
  }

  const oaMessages = [];
  if (system) oaMessages.push({ role: "system", content: String(system) });
  for (const m of messages) oaMessages.push({ role: m.role, content: m.content });

  const body = { model, messages: oaMessages };
  if (tools && tools.length) body.tools = tools;

  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new PostError("LLM_NETWORK", `LLM request failed: ${e.message}`, 502);
  }

  if (!resp.ok) {
    let text;
    try { text = await resp.text(); } catch { text = ""; }
    throw new PostError("LLM_ERROR", `LLM provider error (${resp.status}): ${text}`, 502);
  }

  const data = await resp.json();
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new PostError("LLM_ERROR", "LLM returned no message", 502);
  return { content: msg.content || "", tool_calls: msg.tool_calls };
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
  return out;
}

module.exports = { getTenantLlm, setTenantLlm, chat, embed, encryptKey, decryptKey };
