const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { sendPush } = require("../lib/push");

// POST /api/push/register — store this device's FCM/APNs token for the user/tenant
router.post("/register", authenticate, async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });
  await pool.query(`
    INSERT INTO push_tokens(token, tenant_id, user_id, platform)
    VALUES($1,$2,$3,$4)
    ON CONFLICT(token) DO UPDATE SET tenant_id=$2, user_id=$3, platform=$4, created_at=now()
  `, [token, req.user.tenant_id, req.user.id, (platform || "unknown").slice(0, 16)]);
  res.json({ ok: true });
});

// POST /api/push/unregister
router.post("/unregister", authenticate, async (req, res) => {
  const { token } = req.body || {};
  if (token) await pool.query("DELETE FROM push_tokens WHERE token=$1 AND tenant_id=$2", [token, req.user.tenant_id]);
  res.json({ ok: true });
});

// POST /api/push/test — send a test push to all of the tenant's devices
router.post("/test", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT token FROM push_tokens WHERE tenant_id=$1", [req.user.tenant_id]);
  const result = await sendPush(rows.map(r => r.token), {
    title: "Headroom", body: "🔔 Push notifications are working — you'll get cash-pressure alerts here.",
    data: { path: "/forecast" },
  });
  res.json(result);
});

module.exports = router;
