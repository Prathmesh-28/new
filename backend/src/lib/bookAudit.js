"use strict";
// Tamper-evident, append-only ledger audit trail (MCA Rule 3(1)). Each record is chained
// per tenant: row_hash = SHA-256(prev_hash | canonical(row)). Any edit to a row or deletion
// of one breaks the chain, which verifyChain() detects — the evidence an auditor needs under
// Rule 11(g). The DB trigger from migration 0007 makes book_audit_log physically append-only
// (blocks UPDATE/DELETE/TRUNCATE); this module adds the chaining on write + verification on
// read. (Distinct from lib/audit.js writeAudit, which logs admin/org actions to audit_log.)
const crypto = require("crypto");

// Deterministic serialisation with recursively SORTED keys, so the hash is stable across a
// JSONB round-trip (Postgres does not preserve object key order).
function stableStringify(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

function canonical(rec) {
  return stableStringify({
    tenant_id: rec.tenantId ?? null,
    actor_id: rec.actorId ?? null,
    action: rec.action ?? null,
    entity: rec.entity ?? null,
    entity_id: rec.entityId ?? null,
    before: rec.before ?? null,
    after: rec.after ?? null,
    detail: rec.detail ?? null,
  });
}

function hashRow(prevHash, content) {
  return crypto.createHash("sha256").update(String(prevHash) + "|" + content).digest("hex");
}

// Append one immutable, hash-chained audit record within the caller's transaction (`client`).
// A per-tenant advisory xact lock serialises concurrent appends so the chain has no forks.
async function appendAudit(client, rec) {
  const { tenantId } = rec;
  if (!tenantId) throw new Error("appendAudit: tenantId required");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [String(tenantId)]);
  const { rows } = await client.query(
    "SELECT row_hash FROM book_audit_log WHERE tenant_id=$1 AND row_hash IS NOT NULL ORDER BY id DESC LIMIT 1",
    [tenantId]
  );
  const prev = rows[0]?.row_hash || "GENESIS";
  const rowHash = hashRow(prev, canonical(rec));
  await client.query(
    `INSERT INTO book_audit_log(tenant_id, actor_id, action, entity, entity_id, before, after, detail, prev_hash, row_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      tenantId, rec.actorId ?? null, rec.action, rec.entity, rec.entityId ?? null,
      rec.before == null ? null : JSON.stringify(rec.before), // match canonical()'s ?? null exactly (0/false/"" are stored, not nulled) so the hash round-trips
      rec.after == null ? null : JSON.stringify(rec.after),
      rec.detail == null ? null : JSON.stringify(rec.detail),
      prev, rowHash,
    ]
  );
  return rowHash;
}

// Recompute the tenant's chain and confirm nothing was altered or removed. Returns
// { ok, checked, head } or { ok:false, brokenAt, reason }. Rows predating the hash columns
// (legacy, row_hash NULL) are skipped — the chain begins at the first hashed append.
async function verifyChain(tenantId, db) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, actor_id, action, entity, entity_id, before, after, detail, prev_hash, row_hash
       FROM book_audit_log WHERE tenant_id=$1 AND row_hash IS NOT NULL ORDER BY id ASC`,
    [tenantId]
  );
  let prev = "GENESIS", checked = 0;
  for (const r of rows) {
    if ((r.prev_hash || "GENESIS") !== prev) return { ok: false, brokenAt: Number(r.id), reason: "prev_hash mismatch (a record was removed or reordered)", checked };
    const content = canonical({ tenantId: r.tenant_id, actorId: r.actor_id, action: r.action, entity: r.entity, entityId: r.entity_id, before: r.before, after: r.after, detail: r.detail });
    if (hashRow(prev, content) !== r.row_hash) return { ok: false, brokenAt: Number(r.id), reason: "row_hash mismatch (a record was altered)", checked };
    prev = r.row_hash;
    checked += 1;
  }
  return { ok: true, checked, head: prev === "GENESIS" ? null : prev };
}

module.exports = { appendAudit, verifyChain, hashRow, canonical };
