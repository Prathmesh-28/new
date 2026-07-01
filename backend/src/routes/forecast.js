const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { assembleForecastInputs } = require("../lib/forecastInputs");

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

module.exports = router;
