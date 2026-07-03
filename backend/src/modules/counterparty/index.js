"use strict";
// Counterparty intelligence — data + lifecycle. Re-exposes the local ledger signals (entity-group
// dedup + payment-behaviour scores) as one surface, adds cached GATED external enrichment, and
// runs anchor-led invites. counterparty_* tables are FORCE-RLS (migration 0019) → access via q().
const crypto = require("crypto");
const { pool } = require("../../db");
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

// Post-transaction ratings (#167): a tenant rates a counterparty; ratingsSummary aggregates them.
async function rateCounterparty(tenantId, actorId, { counterparty, gstin, category = "overall", rating, comment, txnRef } = {}) {
  if (!counterparty) throw new CounterpartyError("BAD_INPUT", "counterparty required", 400);
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) throw new CounterpartyError("BAD_INPUT", "rating must be 1-5", 400);
  const { rows } = await q(tenantId,
    `INSERT INTO counterparty_ratings(tenant_id, counterparty, gstin, category, rating, comment, txn_ref, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, counterparty, gstin || null, category, r, comment || null, txnRef || null, actorId || null]);
  return rows[0];
}
async function ratingsSummary(tenantId, { counterparty } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (counterparty) { params.push(counterparty); where += ` AND counterparty=$${params.length}`; }
  const { rows } = await q(tenantId,
    `SELECT counterparty, ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS n,
            ROUND(AVG(rating) FILTER (WHERE category='payment')::numeric, 2) AS avg_payment,
            ROUND(AVG(rating) FILTER (WHERE category='quality')::numeric, 2) AS avg_quality,
            ROUND(AVG(rating) FILTER (WHERE category='delivery')::numeric, 2) AS avg_delivery,
            MAX(created_at) AS last_rated
       FROM counterparty_ratings WHERE ${where} GROUP BY counterparty ORDER BY AVG(rating) DESC`, params);
  return rows.map((r) => ({ ...r, avg_rating: r.avg_rating == null ? null : Number(r.avg_rating) }));
}
async function listRatings(tenantId, { counterparty } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (counterparty) { params.push(counterparty); where += ` AND counterparty=$${params.length}`; }
  const { rows } = await q(tenantId, `SELECT * FROM counterparty_ratings WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows;
}

// ── Cross-tenant network (#163/#164): trade references + default flags ──
// network_signals is NOT RLS'd (cross-tenant by design). WRITES are always scoped to the
// publisher; the aggregate lookup returns COUNTS ONLY — never publisher identity or raw detail.
async function publishSignal(tenantId, actorId, { subjectGstin, subjectPan, subjectName, signalType, detail, amount, shared = true } = {}) {
  if (!["trade_reference", "default_flag", "dispute"].includes(signalType)) throw new CounterpartyError("BAD_INPUT", "invalid signal_type", 400);
  if (!subjectGstin && !subjectPan && !subjectName) throw new CounterpartyError("BAD_INPUT", "identify the counterparty (GSTIN / PAN / name)", 400);
  const { rows } = await pool.query(
    `INSERT INTO network_signals(publisher_tenant_id, subject_gstin, subject_pan, subject_name, signal_type, detail, amount, shared, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, signal_type, subject_gstin, subject_name, shared, status, created_at`,
    [tenantId, subjectGstin ? String(subjectGstin).toUpperCase() : null, subjectPan ? String(subjectPan).toUpperCase() : null, subjectName || null, signalType, detail || null, amount != null ? Number(amount) : null, shared !== false, actorId || null]);
  return rows[0];
}
async function withdrawSignal(tenantId, id) {
  const { rowCount } = await pool.query("UPDATE network_signals SET status='withdrawn' WHERE publisher_tenant_id=$1 AND id=$2", [tenantId, id]); // scoped to publisher
  if (!rowCount) throw new CounterpartyError("NOT_FOUND", "Signal not found", 404);
  return { withdrawn: true };
}
async function mySignals(tenantId) {
  const { rows } = await pool.query("SELECT id, subject_gstin, subject_name, signal_type, detail, amount, shared, status, created_at FROM network_signals WHERE publisher_tenant_id=$1 ORDER BY created_at DESC LIMIT 200", [tenantId]);
  return rows.map((r) => ({ ...r, amount: r.amount == null ? null : Number(r.amount) }));
}
// Aggregate network reputation for a counterparty. COUNTS ONLY — no publisher identity/detail.
async function networkLookup(tenantId, { gstin, pan } = {}) {
  const g = gstin ? String(gstin).toUpperCase() : null;
  const p = pan ? String(pan).toUpperCase() : null;
  if (!g && !p) throw new CounterpartyError("BAD_INPUT", "gstin or pan required", 400);
  // @tenant-safe: intentional cross-tenant aggregate (network reputation). Returns per-type COUNTS
  // and a distinct-reporter count only — never publisher_tenant_id, identity, or raw detail.
  const { rows } = await pool.query(
    `SELECT signal_type, COUNT(*)::int AS n, COUNT(DISTINCT publisher_tenant_id)::int AS reporters
       FROM network_signals
      WHERE status='active' AND shared=true AND ( ($1 IS NOT NULL AND subject_gstin=$1) OR ($2 IS NOT NULL AND subject_pan=$2) )
      GROUP BY signal_type`, [g, p]);
  const agg = { trade_reference: 0, default_flag: 0, dispute: 0 };
  let reporters = 0;
  for (const r of rows) { agg[r.signal_type] = r.n; reporters = Math.max(reporters, r.reporters); }
  return {
    subject: g || p, trade_references: agg.trade_reference, default_flags: agg.default_flag, disputes: agg.dispute, reporters,
    signal: agg.default_flag > 0 ? "caution" : agg.trade_reference > 0 ? "positive" : "no_data",
    note: "Aggregate, consent-based network signal — counts only, contributor identities are never disclosed.",
  };
}

module.exports = {
  CounterpartyError,
  dedupeGroups, customerScores, riskSummary,
  enrich, listEnrichments, providerStatus,
  inviteCounterparty, listInvites,
  rateCounterparty, ratingsSummary, listRatings,
  publishSignal, withdrawSignal, mySignals, networkLookup,
};
