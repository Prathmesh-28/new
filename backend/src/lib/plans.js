const { pool } = require("../db");

// Seats included per marketing plan. Mirrors the pricing page / entitlements.
// Adding a teammate beyond the cap is blocked with an upgrade hint.
const PLAN_SEATS = { free: 1, starter: 2, growth: 5, pro: 10 };
const PLAN_LABEL = { free: "Free", starter: "Starter", growth: "Growth", pro: "Pro" };
const NEXT_PLAN  = { free: "starter", starter: "growth", growth: "pro", pro: null };

function seatLimit(plan) {
  return PLAN_SEATS[plan] || PLAN_SEATS.free;
}

// A tenant's plan is the highest plan held by any of its users (super-admin
// overrides write the same plan onto every user, so MAX is correct).
async function tenantPlan(tenant_id) {
  const { rows } = await pool.query(
    "SELECT COALESCE(MAX(subscription_plan), 'free') AS plan FROM users WHERE tenant_id=$1",
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
