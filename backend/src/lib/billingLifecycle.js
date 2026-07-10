"use strict";
// Trial start + the daily expiry sweep. Kept separate from subscriptionLifecycle.js
// (which only reacts to Razorpay events) since this side runs on a clock, not a webhook.
const { pool } = require("../db");

const TRIAL_DAYS = 14;
const TRIAL_PLAN = "growth"; // preview the flagship tier, matching the pricing page's "14 days free"

// Called once, right when a brand-new tenant's account becomes usable (finishSignup).
// ON CONFLICT DO NOTHING: never clobbers an existing billing row (idempotent against
// a retried signup-completion call).
async function startTrial(tenantId) {
  // TRIAL_DAYS is a trusted in-code constant (never user input) - safe to interpolate
  // into the interval literal; keeps the query a plain, correctly-typed `interval`.
  await pool.query(
    `INSERT INTO tenant_billing(tenant_id, plan, provider, status, current_period_end, trial_started_at, updated_at)
     VALUES($1, $2, 'trial', 'trialing', now() + interval '${TRIAL_DAYS} days', now(), now())
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId, TRIAL_PLAN]
  );
  await pool.query(
    `UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2 AND subscription_plan='free'`,
    [TRIAL_PLAN, tenantId]
  );
}

// Daily sweep: trials that ran out, and cancelled/halted subscriptions past the
// period Razorpay already billed for - both fall back to 'free', never mid-plan.
async function runExpirySweep() {
  const { rows: expired } = await pool.query(
    `UPDATE tenant_billing SET plan='free', status='expired', updated_at=now()
      WHERE status IN ('trialing','cancelled','halted') AND current_period_end < now()
      RETURNING tenant_id`
  );
  if (expired.length) {
    const ids = expired.map(r => r.tenant_id);
    await pool.query("UPDATE users SET subscription_plan='free' WHERE tenant_id = ANY($1::text[])", [ids]);
  }
  return expired.length;
}

module.exports = { TRIAL_DAYS, TRIAL_PLAN, startTrial, runExpirySweep };
