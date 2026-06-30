// §M-USAGE - USAGE / METERED BILLING. A from-scratch re-implementation of the
// metered-billing aggregation that OpenMeter (openmeterio/openmeter) and Lago
// (lago-org/lago) provide. Those projects are Apache-2.0 / AGPL, so NONE of their
// code is copied - only the *concept* is ported: raw usage events are ingested
// idempotently into an event log (book_usage_events), then collapsed per billing
// window with an aggregation function (SUM / COUNT / MAX / UNIQUE_COUNT). A metered
// plan (book_subscription_plans.metric/unit_price/aggregation) turns those collapsed
// units into a money charge = units × unit_price, which subscriptions.js folds into
// the period invoice alongside the recurring base fee.
//
//   ingest  : append one event; ON CONFLICT (tenant_id, dedup_key) DO NOTHING so a
//             retried/duplicate webhook is a no-op (OpenMeter's dedup_key semantics).
//   aggregate: collapse [from, to) for one (subscription, metric) under an aggregation.
//   charge  : read the plan's metric/unit_price/aggregation, aggregate, price it.
//
// CommonJS. Money strictly through ./money (decimal.js) - never JS number math.
// Event window is half-open [from, to): from inclusive, to exclusive, matching the
// way subscriptions.js bills "the just-closed period" without double-counting the
// boundary instant.
const { pool } = require("../../db");
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

// Supported aggregation functions (normalised upper-case). UNIQUE_COUNT counts the
// number of DISTINCT event values in the window (OpenMeter's "unique count" - e.g.
// number of distinct active users / distinct API keys), as opposed to COUNT which
// counts rows. SUM/MAX operate on the numeric value column.
const AGGREGATIONS = new Set(["SUM", "COUNT", "MAX", "UNIQUE_COUNT"]);
function normalizeAggregation(agg) {
  const a = String(agg || "SUM").trim().toUpperCase();
  if (!AGGREGATIONS.has(a)) {
    throw new PostError("BAD_AGGREGATION", `unknown aggregation ${agg} (SUM|COUNT|MAX|UNIQUE_COUNT)`, 422);
  }
  return a;
}

// Parse a timestamp argument to an ISO string for a TIMESTAMPTZ column. Accepts a
// Date, an ISO string, or null (→ defaults to now() at ingest, or an open bound at
// aggregate). Throws on a non-empty but unparseable value.
function parseTs(v, label) {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) throw new PostError("BAD_INPUT", `invalid ${label} ${v}`, 400);
  return d.toISOString();
}

// ── (1) INGEST ────────────────────────────────────────────────────────────────
// Append a single usage event for a (subscription, metric). Idempotent: if a
// dedup_key is supplied and already exists for this tenant, the insert is a no-op
// and the existing row is returned (deduplicated:true), so re-delivered webhooks /
// at-least-once event pipelines never double-count usage.
async function ingestUsage(tenantId, { subscriptionId, metric, value, eventTime, dedupKey } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  // subscriptionId is optional: subscription metering passes it; platform metering
  // (e.g. agent token usage) records subscription-less events (column is nullable).
  if (!metric || !String(metric).trim()) throw new PostError("BAD_INPUT", "metric required", 422);
  const val = money(value == null ? 0 : value);
  if (val.lessThan(0)) throw new PostError("BAD_AMOUNT", "value cannot be negative", 422);
  const ts = parseTs(eventTime, "eventTime"); // null → DB default now()
  const dk = dedupKey == null || dedupKey === "" ? null : String(dedupKey);

  const { rows } = await pool.query(
    `INSERT INTO book_usage_events(tenant_id, subscription_id, metric, value, event_time, dedup_key)
       VALUES($1,$2,$3,$4,COALESCE($5::timestamptz, now()),$6)
     ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
     RETURNING id, subscription_id, metric, value, event_time, dedup_key, created_at`,
    [tenantId, subscriptionId || null, String(metric).trim(), toDb(val), ts, dk]
  );

  if (rows[0]) return { ...rows[0], deduplicated: false };
  // No row returned → the dedup_key collided (DO NOTHING). Return the existing event.
  const { rows: existing } = await pool.query(
    `SELECT id, subscription_id, metric, value, event_time, dedup_key, created_at
       FROM book_usage_events WHERE tenant_id=$1 AND dedup_key=$2`,
    [tenantId, dk]
  );
  return { ...(existing[0] || null), deduplicated: true };
}

// ── (2) AGGREGATE ──────────────────────────────────────────────────────────────
// Collapse all events for one (subscription, metric) in the half-open window
// [from, to) under the given aggregation. `from`/`to` are optional bounds (null =
// open). Returns the aggregated number of units as a money-string (toDb), so the
// caller can multiply by a unit price without losing precision.
async function aggregateUsage(tenantId, { subscriptionId, metric, from, to, aggregation } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!subscriptionId) throw new PostError("BAD_INPUT", "subscriptionId required", 422);
  if (!metric || !String(metric).trim()) throw new PostError("BAD_INPUT", "metric required", 422);
  const agg = normalizeAggregation(aggregation);
  const fromTs = parseTs(from, "from");
  const toTs = parseTs(to, "to");

  // event_time >= from (inclusive) AND event_time < to (exclusive); each bound is
  // skipped when null, so an open-ended window aggregates everything on that side.
  const params = [tenantId, subscriptionId, String(metric).trim()];
  let where = "tenant_id=$1 AND subscription_id=$2 AND metric=$3";
  if (fromTs) {
    params.push(fromTs);
    where += ` AND event_time >= $${params.length}::timestamptz`;
  }
  if (toTs) {
    params.push(toTs);
    where += ` AND event_time < $${params.length}::timestamptz`;
  }

  // Each aggregation maps to a single SQL reducer over the value column. COALESCE so
  // an empty window yields 0 units (not NULL) - an unused metered plan bills nothing.
  const expr =
    agg === "SUM" ? "COALESCE(SUM(value),0)"
    : agg === "COUNT" ? "COUNT(*)"
    : agg === "MAX" ? "COALESCE(MAX(value),0)"
    : "COUNT(DISTINCT value)"; // UNIQUE_COUNT

  const { rows } = await pool.query(
    `SELECT ${expr} AS units FROM book_usage_events WHERE ${where}`,
    params
  );
  const units = money(rows[0] ? rows[0].units : 0);
  return { metric: String(metric).trim(), aggregation: agg, units: toDb(units) };
}

// ── (3) CHARGE FOR PERIOD ───────────────────────────────────────────────────────
// For a subscription's plan, read its metric / unit_price / aggregation, aggregate
// the subscription's usage over [from, to), and price it: amount = units × unit_price.
// Returns { metric, units, unitPrice, amount } as money-strings. A plan with no metric
// or no unit_price is not metered → returns null (caller bills the base fee only).
async function usageChargeForPeriod(tenantId, subscriptionId, from, to) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!subscriptionId) throw new PostError("BAD_INPUT", "subscriptionId required", 422);

  const { rows } = await pool.query(
    `SELECT p.metric, p.unit_price, p.aggregation
       FROM book_subscriptions s
       JOIN book_subscription_plans p ON p.id = s.plan_id AND p.tenant_id = s.tenant_id
      WHERE s.tenant_id=$1 AND s.id=$2`,
    [tenantId, subscriptionId]
  );
  const plan = rows[0];
  if (!plan) throw new PostError("NOT_FOUND", `subscription ${subscriptionId} not found`, 404);

  // Not a metered plan: no metric or no unit price → nothing metered to charge.
  if (!plan.metric || !String(plan.metric).trim() || plan.unit_price == null) return null;

  const unitPrice = money(plan.unit_price);
  const agg = normalizeAggregation(plan.aggregation);
  const { units } = await aggregateUsage(tenantId, {
    subscriptionId,
    metric: plan.metric,
    from,
    to,
    aggregation: agg,
  });
  const amount = money(units).times(unitPrice);

  return {
    metric: String(plan.metric).trim(),
    units: toDb(money(units)),
    unitPrice: toRupees(unitPrice),
    amount: toRupees(amount),
  };
}

module.exports = {
  ingestUsage,
  aggregateUsage,
  usageChargeForPeriod,
};
