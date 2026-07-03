"use strict";
// Counterparty intelligence — data + lifecycle. Re-exposes the local ledger signals (entity-group
// dedup + payment-behaviour scores) as one surface, adds cached GATED external enrichment, and
// runs anchor-led invites. counterparty_* tables are FORCE-RLS (migration 0019) → access via q().
const crypto = require("crypto");
const { q } = require("../../lib/tenantDb");
const { enrichmentProvider, VALID } = require("./providers");
const dedupe = require("../../lib/counterpartyDedupe");
const score = require("../../lib/customerScore");
const email = require("../../lib/email");
const whatsapp = require("../../lib/whatsapp");

class CounterpartyError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }

// Local signals (already computed from the tenant's own ledger). Same calls collections.js makes.
async function dedupeGroups(tenantId) { return dedupe.entityGroups(tenantId); }
async function customerScores(tenantId) {
  const [customers, portfolio] = await Promise.all([score.customerScores(tenantId), score.receivablesQuality(tenantId)]);
  return { customers, portfolio };
}
async function riskSummary(tenantId) {
  const [groups, quality] = await Promise.all([dedupe.entityGroups(tenantId), score.receivablesQuality(tenantId)]);
  return { entity_groups: groups.summary || groups, receivables_quality: quality };
}

// Cached, gated enrichment. Returns fresh cache if within TTL; else calls the provider and stores
// the result (ok | gated | error). Never fabricates registry data.
async function enrich(tenantId, kind, identifier, { force = false } = {}) {
  if (!VALID.includes(kind)) throw new CounterpartyError("BAD_INPUT", `kind must be one of ${VALID.join(", ")}`, 400);
  if (!identifier) throw new CounterpartyError("BAD_INPUT", "identifier required", 400);
  const id = String(identifier).toUpperCase().trim();
  if (!force) {
    const { rows } = await q(tenantId,
      `SELECT * FROM counterparty_enrichments WHERE tenant_id=$1 AND kind=$2 AND identifier=$3
         AND fetched_at > now() - (ttl_days || ' days')::interval AND status='ok'
       ORDER BY fetched_at DESC LIMIT 1`, [tenantId, kind, id]);
    if (rows[0]) return { ...rows[0], cached: true };
  }
  const res = await enrichmentProvider.lookup(kind, id);
  const { rows } = await q(tenantId,
    `INSERT INTO counterparty_enrichments(tenant_id, kind, identifier, status, data, message)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, kind, id, res.status, JSON.stringify(res.data || {}), res.message || null]);
  return { ...rows[0], cached: false };
}
async function listEnrichments(tenantId, { kind } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (kind) { params.push(kind); where += ` AND kind=$${params.length}`; }
  const { rows } = await q(tenantId, `SELECT * FROM counterparty_enrichments WHERE ${where} ORDER BY fetched_at DESC LIMIT 100`, params);
  return rows;
}
function providerStatus() { return enrichmentProvider.status(); }

// Anchor-led invite: record it + send on whatever channels are configured (best-effort, never fakes).
async function inviteCounterparty(tenantId, actorId, { name, email: toEmail, phone, relation = "vendor" } = {}) {
  if (!toEmail && !phone) throw new CounterpartyError("BAD_INPUT", "email or phone required", 400);
  const token = crypto.randomBytes(18).toString("base64url");
  const link = `${(process.env.APP_BASE_URL || "https://app.headroom.example").replace(/\/$/, "")}/join/${token}`;
  const msg = `${name ? name + ", " : ""}you've been invited to connect on Headroom to exchange invoices and confirm balances. Join: ${link}`;
  const channels = [];
  if (toEmail) { try { await email.sendMail({ to: toEmail, subject: "You're invited to connect on Headroom", html: `<p>${msg}</p>` }); channels.push("email"); } catch { /* channel not configured */ } }
  if (phone) { try { await whatsapp.sendWhatsApp(phone, msg); channels.push("whatsapp"); } catch { /* channel not configured */ } }
  const { rows } = await q(tenantId,
    `INSERT INTO counterparty_invites(tenant_id, name, email, phone, relation, token, channels, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, name || null, toEmail || null, phone || null, relation, token, channels, actorId || null]);
  return { ...rows[0], link, sent_on: channels, note: channels.length ? undefined : "Recorded, but no messaging channel is configured — share the link manually." };
}
async function listInvites(tenantId) {
  const { rows } = await q(tenantId, "SELECT id, name, email, phone, relation, status, channels, created_at, accepted_at FROM counterparty_invites WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100", [tenantId]);
  return rows;
}

module.exports = {
  CounterpartyError,
  dedupeGroups, customerScores, riskSummary,
  enrich, listEnrichments, providerStatus,
  inviteCounterparty, listInvites,
};
