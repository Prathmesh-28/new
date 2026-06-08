const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { buildForecast } = require("../lib/forecast");

// GET /api/forecast — returns current forecast datapoints
router.get("/", authenticate, async (req, res) => {
  // Find the most recent current forecast
  const { rows: fRows } = await pool.query(
    "SELECT * FROM forecasts WHERE tenant_id=$1 AND is_current=true ORDER BY generated_at DESC LIMIT 1",
    [req.user.tenant_id]
  );

  if (!fRows[0]) {
    // Auto-generate if none exists
    return generateAndReturn(req.user.tenant_id, res);
  }

  const { rows: dp } = await pool.query(
    "SELECT * FROM forecast_datapoints WHERE forecast_id=$1 ORDER BY forecast_date",
    [fRows[0].id]
  );

  res.json({ forecast: fRows[0], datapoints: dp });
});

// POST /api/forecast/trigger — force recalculate
router.post("/trigger", authenticate, async (req, res) => {
  await generateAndReturn(req.user.tenant_id, res);
});

// GET /api/forecast/scenarios
router.get("/scenarios", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM forecast_scenarios WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/forecast/scenarios
router.post("/scenarios", authenticate, async (req, res) => {
  const { name, type, parameters } = req.body;
  if (!name || !type) return res.status(400).json({ error: "name and type required" });

  const { rows } = await pool.query(
    "INSERT INTO forecast_scenarios(tenant_id,name,type,parameters) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.tenant_id, name, type, JSON.stringify(parameters || {})]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/forecast/scenarios/:id — toggle active
router.patch("/scenarios/:id", authenticate, async (req, res) => {
  const { is_active, parameters, name } = req.body;
  const { rows: existing } = await pool.query(
    "SELECT * FROM forecast_scenarios WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  const updates = [];
  const vals = [];
  let i = 1;
  if (is_active   !== undefined) { updates.push(`is_active=$${i++}`);   vals.push(is_active); }
  if (parameters  !== undefined) { updates.push(`parameters=$${i++}`);  vals.push(JSON.stringify(parameters)); }
  if (name        !== undefined) { updates.push(`name=$${i++}`);        vals.push(name); }

  if (!updates.length) return res.json(existing[0]);

  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE forecast_scenarios SET ${updates.join(",")} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// DELETE /api/forecast/scenarios/:id
router.delete("/scenarios/:id", authenticate, async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM forecast_scenarios WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rowCount) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ── Internal helper ──────────────────────────────────────────────────────────

async function generateAndReturn(tenantId, res) {
  try {
    // Fetch transactions (last 180 days)
    const { rows: txns } = await pool.query(
      "SELECT * FROM transactions WHERE tenant_id=$1 AND transaction_date >= CURRENT_DATE - 180 ORDER BY transaction_date",
      [tenantId]
    );

    // Current balance from primary account, else sum of all
    const { rows: accounts } = await pool.query(
      "SELECT current_balance FROM bank_accounts WHERE tenant_id=$1 AND is_active=true",
      [tenantId]
    );
    const startBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

    const datapoints = buildForecast(txns, startBalance, 90);

    // Mark old forecasts as not current
    await pool.query(
      "UPDATE forecasts SET is_current=false WHERE tenant_id=$1",
      [tenantId]
    );

    // Insert new forecast
    const { rows: fRows } = await pool.query(
      "INSERT INTO forecasts(tenant_id, horizon_days, model_version, is_current) VALUES($1,90,'v1',true) RETURNING *",
      [tenantId]
    );
    const forecastId = fRows[0].id;

    // Insert datapoints in a single query
    if (datapoints.length) {
      const vals = datapoints.flatMap(dp => [forecastId, dp.date, dp.p10, dp.p50, dp.p90, dp.inflow, dp.outflow]);
      const placeholders = datapoints.map((_, i) => {
        const b = i * 7;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`;
      }).join(",");
      await pool.query(
        `INSERT INTO forecast_datapoints(forecast_id, forecast_date, balance_p10, balance_p50, balance_p90, inflow_expected, outflow_expected) VALUES ${placeholders}`,
        vals
      );
    }

    // Fire alert engine after generation
    await runAlertEngine(tenantId, forecastId, datapoints, startBalance);

    res.json({ forecast: fRows[0], datapoints });
  } catch (err) {
    console.error("[forecast] generation error", err);
    res.status(500).json({ error: "Forecast generation failed" });
  }
}

async function runAlertEngine(tenantId, forecastId, datapoints, startBalance) {
  const alerts = [];

  // Rule: cash goes negative within 30 days
  const negativeDay = datapoints.find(dp => dp.p50 < 0);
  if (negativeDay) {
    const daysOut = datapoints.indexOf(negativeDay) + 1;
    if (daysOut <= 30) {
      alerts.push({
        rule_id: "cash_negative_30d",
        severity: "critical",
        title: "Cash will go negative",
        message: `Your cash position is forecast to go negative in ${daysOut} days (expected case).`,
        meta: { days_out: daysOut, forecast_id: forecastId },
      });
    }
  }

  // Rule: balance drops below 10% of current within 45 days
  const safetyThreshold = startBalance * 0.10;
  const belowSafety = datapoints.slice(0, 45).find(dp => dp.p50 < safetyThreshold && safetyThreshold > 0);
  if (belowSafety && !negativeDay) {
    const daysOut = datapoints.indexOf(belowSafety) + 1;
    alerts.push({
      rule_id: "below_safety_threshold",
      severity: "high",
      title: "Approaching safety threshold",
      message: `Cash drops below your safety buffer (₹${Math.round(safetyThreshold).toLocaleString("en-IN")}) in ${daysOut} days.`,
      meta: { days_out: daysOut, threshold: safetyThreshold },
    });
  }

  // Rule: runway > 60 days — positive signal
  const lowestPoint = Math.min(...datapoints.map(d => d.p50));
  if (lowestPoint > 0 && !negativeDay && !belowSafety) {
    alerts.push({
      rule_id: "healthy_runway",
      severity: "low",
      title: "Healthy cash runway",
      message: `Your 90-day forecast looks healthy. Lowest projected balance: ₹${Math.round(lowestPoint).toLocaleString("en-IN")}.`,
      meta: { lowest_balance: lowestPoint },
    });
  }

  // Deduplicate: don't re-insert the same rule if already active & unread
  for (const alert of alerts) {
    const { rows: existing } = await pool.query(
      "SELECT id FROM alerts WHERE tenant_id=$1 AND rule_id=$2 AND is_read=false AND is_resolved=false",
      [tenantId, alert.rule_id]
    );
    if (!existing[0]) {
      await pool.query(
        "INSERT INTO alerts(tenant_id, rule_id, severity, title, message, meta) VALUES($1,$2,$3,$4,$5,$6)",
        [tenantId, alert.rule_id, alert.severity, alert.title, alert.message, JSON.stringify(alert.meta)]
      );
    }
  }
}

module.exports = router;
