"use strict";
// Plan entitlements: PREMIUM-FEATURE access + monthly usage QUOTAS.
//
// Seats are NOT handled here — lib/plans.js is the single source of truth for seat
// limits and is already enforced in the invite flow. This module adds the two missing
// layers the audit flagged: (1) which premium modules a plan unlocks, (2) metered
// monthly usage caps. Enforcement is GATED behind ENTITLEMENTS_ENFORCE so this ships
// with ZERO behaviour change: usage is ALWAYS metered (so you can see who would hit a
// limit before turning it on), but features/quotas only BLOCK once enforcement is on.
const { pool } = require("../db");
const plans = require("./plans"); // seats + plan labels live here (don't duplicate)

const PLANS = ["free", "starter", "growth", "pro"];
// `features` = premium modules a plan unlocks (baseline — books, invoices, gst, crm,
// insights, analytics, kv, whatsapp, billing, account, users — is never gated).
// `quotas` = per-calendar-month caps. EDITABLE defaults; tune to your pricing.
const MATRIX = {
  free:    { features: [],                                                                            quotas: { agent_calls: 50,    flow_runs: 50,    studio_builds: 5 } },
  starter: { features: ["flows", "collab", "agents"],                                                 quotas: { agent_calls: 750,   flow_runs: 1000,  studio_builds: 25 } },
  growth:  { features: ["flows", "collab", "agents", "studio", "erp", "hrms", "campaigns", "lending"], quotas: { agent_calls: 7500,  flow_runs: 15000, studio_builds: 250 } },
  pro:     { features: ["flows", "collab", "agents", "studio", "erp", "hrms", "campaigns", "lending"], quotas: { agent_calls: 75000, flow_runs: 200000, studio_builds: 2500 } },
};

const enforcing = () => String(process.env.ENTITLEMENTS_ENFORCE).toLowerCase() === "true";
const planOf = (req) => { const p = req && req.user && req.user.subscription_plan; return PLANS.includes(p) ? p : "free"; };
const limitsFor = (plan) => MATRIX[plan] || MATRIX.free;
const hasFeature = (plan, feature) => limitsFor(plan).features.includes(feature);
const quotaFor = (plan, metric) => { const q = limitsFor(plan).quotas[metric]; return q == null ? Infinity : q; };
const currentPeriod = () => new Date().toISOString().slice(0, 7); // UTC YYYY-MM → auto-resets monthly

// Atomically add `cost` to this month's counter; return new total + the plan cap.
// Always meters, even when enforcement is off, so usage data accrues for tuning.
async function consume(tenantId, metric, plan, cost = 1) {
  const period = currentPeriod();
  const { rows } = await pool.query(
    `INSERT INTO usage_counters(tenant_id, metric, period, count) VALUES($1,$2,$3,$4)
     ON CONFLICT(tenant_id, metric, period) DO UPDATE SET count = usage_counters.count + $4, updated_at = now()
     RETURNING count`, [tenantId, metric, period, cost]
  );
  const count = Number(rows[0].count), limit = quotaFor(plan, metric);
  return { count, limit, over: count > limit, period };
}

async function usageOf(tenantId, metric) {
  const { rows } = await pool.query(
    "SELECT count FROM usage_counters WHERE tenant_id=$1 AND metric=$2 AND period=$3", [tenantId, metric, currentPeriod()]
  );
  return rows[0] ? Number(rows[0].count) : 0;
}

// ── Middleware ────────────────────────────────────────────────────────────────
// Gate a premium module. No-op (pass-through) until ENTITLEMENTS_ENFORCE=true.
function requireFeature(feature) {
  return (req, res, next) => {
    if (!enforcing() || hasFeature(planOf(req), feature)) return next();
    res.status(402).json({ error: `Your plan does not include ${feature}.`, code: "PLAN_FEATURE_LOCKED", feature, plan: planOf(req), upgrade: true });
  };
}
// Meter (always) + enforce a monthly quota (only when enforcing). Sets req.usage + an
// X-Usage header. Block is conservative: the over-limit request is counted then refused.
// Never lets a metering failure break the underlying request.
function enforceQuota(metric) {
  return async (req, res, next) => {
    try {
      const plan = planOf(req);
      const u = await consume(req.user.tenant_id, metric, plan);
      req.usage = u;
      if (Number.isFinite(u.count) && Number.isFinite(u.limit)) res.set("X-Usage", `${metric}=${u.count}/${u.limit}`);
      if (u.over && enforcing()) return res.status(429).json({ error: `Monthly ${metric.replace(/_/g, " ")} limit reached on the ${plan} plan.`, code: "PLAN_QUOTA_EXCEEDED", metric, used: u.count, limit: u.limit, upgrade: true });
      next();
    } catch (e) { console.error("[entitlements] metering failed (fail-open):", e.message); next(); } // never block a request because metering broke
  };
}

// Full entitlement snapshot for a tenant (powers the billing/usage UI). Seats come
// from plans.js (the single source of truth); features + quota usage from here.
async function snapshot(tenantId, plan) {
  const lim = limitsFor(plan), quotas = {};
  for (const m of Object.keys(lim.quotas)) quotas[m] = { used: await usageOf(tenantId, m), limit: lim.quotas[m] };
  const seat = await plans.tenantSeatInfo(tenantId);
  return { plan, enforcing: enforcing(), period: currentPeriod(), seats: { used: seat.used, limit: seat.limit }, features: lim.features, quotas };
}

module.exports = { PLANS, MATRIX, enforcing, planOf, limitsFor, hasFeature, quotaFor, currentPeriod, consume, usageOf, requireFeature, enforceQuota, snapshot };
