"use strict";
// Real, computed platform-wide stats for the public marketing site. An audit found
// src/pages/HomePage.tsx hardcoding fabricated numbers ("91% forecast accuracy",
// "12,000+ SMBs", "Rs340Cr+ tracked", "4.8 days to insight") with zero data source.
// This module replaces every one of them with a real query. Two metrics need enough
// historical observations before they mean anything - they honestly report null until
// a minimum sample size is reached, exactly like every other "not enough data yet"
// state elsewhere in this app (never a placeholder number).
const { pool } = require("../db");

const MIN_ACCURACY_SAMPLES = 20;
const MIN_INSIGHT_SAMPLES = 10;
// "Accurate" = the tenant's real balance 30 days later landed within this fraction of
// the predicted P50 - a disclosed, defensible threshold (not tuned to flatter the number).
const ACCURACY_TOLERANCE = 0.15;

async function smbCount() {
  const { rows } = await pool.query("SELECT count(DISTINCT tenant_id)::int AS n FROM users");
  return rows[0]?.n || 0;
}

// Sum of every tenant's own KV-synced bank-account balances - the exact same figures
// the forecast engine itself starts from (src/lib/liveForecast.ts), never a separate
// number invented for marketing purposes.
async function cashTrackedInr() {
  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE namespace='app' AND key='store'"
  );
  let total = 0;
  for (const r of rows) {
    const accounts = r.value?.value?.bankAccounts;
    if (Array.isArray(accounts)) total += accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }
  return Math.round(total);
}

async function forecastAccuracy() {
  const { rows } = await pool.query(
    "SELECT predicted_p50, actual_balance FROM forecast_snapshots WHERE matured=true AND actual_balance IS NOT NULL"
  );
  if (rows.length < MIN_ACCURACY_SAMPLES) return { pct: null, samples: rows.length };
  const within = rows.filter((r) => {
    const pred = Number(r.predicted_p50), act = Number(r.actual_balance);
    const base = Math.max(Math.abs(pred), 1);
    return Math.abs(act - pred) / base <= ACCURACY_TOLERANCE;
  }).length;
  return { pct: Math.round((within / rows.length) * 100), samples: rows.length };
}

// Real proxy for "time to first insight": days between signup and that tenant's first
// subsequent login (an existing tracked event) - a defensible measure of how long it
// took someone to come back and actually look at what Headroom showed them.
async function avgDaysToFirstInsight() {
  const { rows } = await pool.query(`
    SELECT u.created_at AS signup_at, MIN(e.created_at) AS first_login_at
      FROM users u
      JOIN analytics_events e ON e.tenant_id = u.tenant_id AND e.event = 'login' AND e.created_at > u.created_at
     GROUP BY u.id, u.created_at
    HAVING MIN(e.created_at) IS NOT NULL
  `);
  if (rows.length < MIN_INSIGHT_SAMPLES) return { avg: null, samples: rows.length };
  const days = rows.map((r) => (new Date(r.first_login_at) - new Date(r.signup_at)) / 86400000);
  const avg = days.reduce((s, d) => s + d, 0) / days.length;
  return { avg: Math.round(avg * 10) / 10, samples: rows.length };
}

async function computeStats() {
  const [smb, cash, accuracy, insight] = await Promise.all([
    smbCount(), cashTrackedInr(), forecastAccuracy(), avgDaysToFirstInsight(),
  ]);
  const stats = {
    smbCount: smb,
    cashTrackedInr: cash,
    forecastAccuracyPct: accuracy.pct,
    forecastAccuracySamples: accuracy.samples,
    avgDaysToFirstInsight: insight.avg,
    avgDaysToFirstInsightSamples: insight.samples,
    // Disclosed thresholds, not editable - so the admin console can render real
    // progress ("12/20 samples") without a second hardcoded copy of these numbers.
    minAccuracySamples: MIN_ACCURACY_SAMPLES,
    minInsightSamples: MIN_INSIGHT_SAMPLES,
    computedAt: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO platform_settings(key, value, updated_at) VALUES('stats', $1, now())
     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()`,
    [JSON.stringify(stats)]
  );
  return stats;
}

module.exports = { computeStats, MIN_ACCURACY_SAMPLES, MIN_INSIGHT_SAMPLES, ACCURACY_TOLERANCE };
