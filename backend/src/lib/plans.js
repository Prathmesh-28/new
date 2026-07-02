const { pool } = require("../db");

// Seats included per marketing plan. Mirrors the pricing page / entitlements.
// Adding a teammate beyond the cap is blocked with an upgrade hint.
const PLAN_SEATS = { free: 1, starter: 2, growth: 5, pro: 10 };
const PLAN_LABEL = { free: "Free", starter: "Starter", growth: "Growth", pro: "Pro" };
const NEXT_PLAN  = { free: "starter", starter: "growth", growth: "pro", pro: null };

function seatLimit(plan) {
  return PLAN_SEATS[plan] || PLAN_SEATS.free;
}

// A tenant's plan comes from tenant_billing (the authoritative per-tenant record written
// on every upgrade in server.js / billing.js). users.subscription_plan is a denormalized
// mirror; reading tenant_billing first means a firm created via /auth/create-firm — which
// has no users row of its own — still carries the plan it was upgraded to (#197 follow-up).
// Falls back to the users mirror (covers any tenant seeded without a billing row), then free.
async function tenantPlan(tenant_id) {
  const { rows } = await pool.query(
    `SELECT COALESCE(
       (SELECT plan FROM tenant_billing WHERE tenant_id=$1),
       (SELECT MAX(subscription_plan) FROM users WHERE tenant_id=$1),
       'free') AS plan`,
    [tenant_id]
  );
  return rows[0]?.plan || "free";
}

async function tenantSeatInfo(tenant_id) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE tenant_id=$1", [tenant_id]);
  const plan = await tenantPlan(tenant_id);
  const used = rows[0]?.n || 0;
  const limit = seatLimit(plan);
  return { plan, used, limit, full: used >= limit, remaining: Math.max(0, limit - used), nextPlan: NEXT_PLAN[plan] };
}

module.exports = { PLAN_SEATS, PLAN_LABEL, NEXT_PLAN, seatLimit, tenantPlan, tenantSeatInfo };
