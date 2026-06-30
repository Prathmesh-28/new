const router = require("express").Router();
const logger = require("../lib/logger");

// POST /api/telemetry/error - best-effort sink for frontend errors so client-side
// failures are visible in backend logs instead of vanishing in the browser.
// No auth (errors can happen pre-login); fields are length-capped and the route
// sits under the general /api rate limiter.
router.post("/error", (req, res) => {
  const b = req.body || {};
  logger.error("client_error", {
    cmsg:    String(b.message || "").slice(0, 500),
    stack:   String(b.stack || "").slice(0, 2000),
    url:     String(b.url || "").slice(0, 300),
    release: String(b.release || "").slice(0, 40),
    ua:      String(req.headers["user-agent"] || "").slice(0, 200),
  });
  res.status(204).end();
});

module.exports = router;
