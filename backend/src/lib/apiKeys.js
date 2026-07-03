"use strict";
// Public-API key management (#185). Keys are minted as `hk_live_<random>`; only the SHA-256 hash
// is persisted. resolveKey() is the (cross-tenant) auth lookup by hash; create/list/revoke are
// tenant-scoped for the owner. last_used_at is updated at most once/min to avoid a write per call.
const crypto = require("crypto");
const { pool } = require("../db");

const hashOf = (raw) => crypto.createHash("sha256").update(String(raw)).digest("hex");
const VALID_SCOPES = ["read", "write"];

function mint() {
  const secret = crypto.randomBytes(24).toString("base64url");
  const key = `hk_live_${secret}`;
  return { key, prefix: key.slice(0, 14), hash: hashOf(key) };
}

async function createKey(tenantId, userId, { name, scopes } = {}) {
  const sc = Array.isArray(scopes) ? scopes.filter((s) => VALID_SCOPES.includes(s)) : ["read"];
  const { key, prefix, hash } = mint();
  const { rows } = await pool.query(
    "INSERT INTO api_keys(tenant_id, name, prefix, key_hash, scopes, created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, name, prefix, scopes, created_at",
    [tenantId, name || "API key", prefix, hash, sc.length ? sc : ["read"], userId || null]);
  return { ...rows[0], key }; // full key returned ONCE — never retrievable again
}
async function listKeys(tenantId) {
  const { rows } = await pool.query(
    "SELECT id, name, prefix, scopes, last_used_at, created_at, revoked_at FROM api_keys WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId]);
  return rows.map((r) => ({ ...r, revoked: !!r.revoked_at }));
}
async function revokeKey(tenantId, id) {
  const { rowCount } = await pool.query("UPDATE api_keys SET revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL", [tenantId, id]);
  return { revoked: rowCount > 0 };
}
// Auth lookup: hash → active key row (cross-tenant by capability). Throttled last_used_at update.
const _lastTouch = new Map();
async function resolveKey(rawKey) {
  if (!rawKey || !/^hk_live_/.test(rawKey)) return null;
  const { rows } = await pool.query("SELECT id, tenant_id, scopes FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL", [hashOf(rawKey)]);
  const k = rows[0];
  if (!k) return null;
  const now = Date.now();
  if (!_lastTouch.get(k.id) || now - _lastTouch.get(k.id) > 60000) {
    _lastTouch.set(k.id, now);
    pool.query("UPDATE api_keys SET last_used_at=now() WHERE id=$1", [k.id]).catch(() => {});
  }
  return { id: k.id, tenantId: k.tenant_id, scopes: k.scopes || ["read"] };
}

module.exports = { createKey, listKeys, revokeKey, resolveKey, hashOf };
