const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { assembleForecastInputs } = require("../lib/forecastInputs");
const { recordSnapshot } = require("../lib/forecastSnapshots");

// GET /api/forecast/inputs — the real-data drivers for the forecast engine
// (Books cash as start balance, open invoices as receivables, loan schedule as
// obligations). The client forecast engine merges these so it forecasts the
// tenant's actual money, not the hand-kept KV store.
router.get("/inputs", authenticate, async (req, res) => {
  try {
    res.json(await assembleForecastInputs(req.user.tenant_id));
  } catch (e) {
    require("../lib/logger").error("forecast_inputs_error", { msg: e.message });
    res.status(500).json({ error: "Could not assemble forecast inputs." });
  }
});

// POST /api/forecast/snapshot — best-effort record of today's real P50-at-+30-days
// prediction, so the public "forecast accuracy" stat is a real backtest instead of
// a fabricated number. Called by the client right after it computes a real forecast.
router.post("/snapshot", authenticate, async (req, res) => {
  const predictedP50 = Number(req.body?.predictedP50);
  if (!Number.isFinite(predictedP50)) return res.status(400).json({ error: "predictedP50 must be a number" });
  try {
    await recordSnapshot(req.user.tenant_id, predictedP50);
    res.json({ ok: true });
  } catch (e) {
    require("../lib/logger").error("forecast_snapshot_error", { msg: e.message });
    res.status(500).json({ error: "Could not record forecast snapshot." });
  }
});

module.exports = router;
