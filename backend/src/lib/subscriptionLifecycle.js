"use strict";
// Single place that turns a Razorpay subscription event (webhook OR the initial
// post-Checkout verify call) into a tenant_billing state transition, so the two
// paths - first charge vs every later renewal - can never drift apart.
const { pool } = require("../db");
const subscriptionInvoice = require("./subscriptionInvoice");

async function findTenantBySubscription(subscriptionId) {
  const { rows } = await pool.query(
    "SELECT tenant_id, plan, cycle FROM tenant_billing WHERE razorpay_subscription_id=$1", [subscriptionId]
  );
  return rows[0] || null;
}

// periodEndUnix: Razorpay's own `current_end` (unix seconds) from the subscription
// entity - authoritative, so we never compute "add 30 days" ourselves and drift
// from what was actually billed.
async function setBillingState(tenantId, { status, periodEndUnix }) {
  await pool.query(
    `UPDATE tenant_billing SET status=$1, current_period_end=COALESCE(to_timestamp($2::double precision), current_period_end), updated_at=now()
     WHERE tenant_id=$3`,
    [status, periodEndUnix || null, tenantId]
  );
}

// eventType: 'subscription.activated' | '.charged' | '.cancelled' | '.halted' | '.completed'
// `sub` is the Razorpay subscription entity (payload.subscription.entity); `payment`
// is the paired payload.payment.entity, present on subscription.charged - the
// authoritative per-cycle charge (id + amount), used to mint that renewal's GST invoice.
async function handleWebhookEvent(eventType, sub, payment) {
  const row = await findTenantBySubscription(sub.id);
  if (!row) { console.warn(`[subscription] no tenant_billing row for subscription ${sub.id} - ignoring`); return; }
  const periodEndUnix = sub.current_end || null;
  const STATUS_BY_EVENT = {
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.cancelled": "cancelled",
    "subscription.halted": "halted",
    "subscription.completed": "completed",
  };
  const status = STATUS_BY_EVENT[eventType];
  if (!status) return; // unrecognised/irrelevant subscription.* event - ignore, don't guess
  await setBillingState(row.tenant_id, { status, periodEndUnix });

  if (eventType === "subscription.charged" && payment?.id && Number.isFinite(payment.amount)) {
    await subscriptionInvoice.recordInvoice(row.tenant_id, {
      plan: row.plan, cycle: row.cycle || "monthly", amountPaise: payment.amount, razorpayPaymentId: payment.id,
    }).catch((e) => console.error("[subscription] invoice record failed:", e.message));
  }
}

module.exports = { findTenantBySubscription, setBillingState, handleWebhookEvent };
