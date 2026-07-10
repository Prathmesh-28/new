"use strict";
// Real forecast-accuracy backtest. A tenant's own browser computes the actual 90-day
// Monte-Carlo forecast (src/lib/forecastEngine.ts) - this module only records what it
// predicted and, 30 days later, what really happened, so accuracy is a real measurement
// instead of a marketing number.
const { pool } = require("../db");

function todayIso() { return new Date().toISOString().slice(0, 10); }
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Called (best-effort) whenever a tenant's client computes a real forecast. One row
// per (tenant, day) - a tenant loading the page twice in a day just updates the same
// prediction, never inflating the sample count.
async function recordSnapshot(tenantId, predictedP50) {
  if (!tenantId || !Number.isFinite(predictedP50)) return;
  const snapshotDate = todayIso();
  const targetDate = addDays(snapshotDate, 30);
  await pool.query(
    `INSERT INTO forecast_snapshots(tenant_id, snapshot_date, target_date, predicted_p50)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET predicted_p50=$4`,
    [tenantId, snapshotDate, targetDate, predictedP50]
  );
}

// A tenant's REAL current cash balance, summed the same way lib/platformStats.js sums
// it for the "cash tracked" stat - the tenant's own KV-synced bank accounts.
async function realBalanceOf(tenantId) {
  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store'", [tenantId]
  );
  let total = 0;
  for (const r of rows) {
    const accounts = r.value?.value?.bankAccounts;
    if (Array.isArray(accounts)) total += accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }
  return total;
}

// Daily cron: mature every snapshot whose target_date has arrived, filling in the
// REAL balance observed today. Never back-fills a guess - a snapshot with no real
// data on its target date just stays unmatured forever (excluded from accuracy).
async function matureDueSnapshots() {
  const { rows: due } = await pool.query(
    "SELECT id, tenant_id FROM forecast_snapshots WHERE matured=false AND target_date <= CURRENT_DATE"
  );
  let matured = 0;
  for (const row of due) {
    try {
      const actual = await realBalanceOf(row.tenant_id);
      await pool.query(
        "UPDATE forecast_snapshots SET actual_balance=$1, matured=true WHERE id=$2",
        [actual, row.id]
      );
      matured++;
    } catch (e) {
      console.error("[forecast-snapshots] mature failed for", row.tenant_id, e.message);
    }
  }
  return matured;
}

module.exports = { recordSnapshot, matureDueSnapshots };
