const router = require("express").Router();
const logger = require("../lib/logger");

// POST /api/telemetry/error - best-effort sink for frontend errors so client-side
// failures are visible in backend logs instead of vanishing in the browser.
// No auth (errors can happen pre-login); fields are length-capped and the route
// sits under the general /api rate limiter.
router.post("/error", (req, res) => {
  const b = req.body || {};
  // A short reference the user can quote. Previously a crash gave them a generic screen
  // and nothing to say to support beyond "it broke", and the log entry it produced could
  // not be tied back to their report.
  const ref = require("crypto").randomBytes(4).toString("hex").toUpperCase();
  logger.error("client_error", {
    ref,
    cmsg:    String(b.message || "").slice(0, 500),
    stack:   String(b.stack || "").slice(0, 2000),
    url:     String(b.url || "").slice(0, 300),
    release: String(b.release || "").slice(0, 40),
    ua:      String(req.headers["user-agent"] || "").slice(0, 200),
  });
  res.json({ ref });
});

module.exports = router;
