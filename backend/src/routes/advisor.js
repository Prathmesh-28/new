const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

function requireAdvisor(req, res, next) {
  if (!["accountant", "super_admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Advisor access required" });
  }
  next();
}

// GET /api/advisor/clients
router.get("/clients", authenticate, requireAdvisor, async (req, res) => {
  const { rows: links } = await pool.query(
    "SELECT * FROM advisor_client_links WHERE advisor_id=$1 ORDER BY linked_at DESC",
    [req.user.id]
  );
  if (!links.length) return res.json({ clients: [] });

  const clients = await Promise.all(links.map(async link => {
    const tenantId = link.client_tenant_id;

    const [{ rows: acc }, { rows: alertCount }, { rows: topAlert }, { rows: dp }] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(current_balance),0) AS total FROM bank_accounts WHERE tenant_id=$1 AND is_active=true", [tenantId]),
      pool.query("SELECT COUNT(*) AS cnt FROM alerts WHERE tenant_id=$1 AND is_read=false AND is_resolved=false", [tenantId]),
      pool.query(`SELECT severity, message FROM alerts WHERE tenant_id=$1 AND is_read=false ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END LIMIT 1`, [tenantId]),
      pool.query(`SELECT fd.balance_p50, fd.forecast_date FROM forecast_datapoints fd JOIN forecasts f ON f.id=fd.forecast_id WHERE f.tenant_id=$1 AND f.is_current=true ORDER BY fd.forecast_date LIMIT 90`, [tenantId]),
    ]);

    const balance = Number(acc[0]?.total || 0);
    const negIdx  = dp.findIndex(r => Number(r.balance_p50) < 0);
    const runway  = negIdx >= 0 ? negIdx : dp.length ? 90 : null;

    const { rows: creditApp } = await pool.query(
      "SELECT underwriting_score FROM credit_applications WHERE tenant_id=$1 AND status='pre_qualified' ORDER BY created_at DESC LIMIT 1",
      [tenantId]
    );

    return {
      tenant_id:           tenantId,
      label:               link.client_label || tenantId,
      balance,
      runway,
      unread_alerts:       Number(alertCount[0]?.cnt || 0),
      top_alert:           topAlert[0] || null,
      last_forecast_at:    dp[0]?.forecast_date || null,
      credit_prequalified: !!creditApp[0],
      credit_score:        creditApp[0]?.underwriting_score || null,
    };
  }));

  res.json({ clients });
});

// POST /api/advisor/clients
router.post("/clients", authenticate, requireAdvisor, async (req, res) => {
  const { client_tenant_id, client_label } = req.body;
  if (!client_tenant_id) return res.status(400).json({ error: "client_tenant_id required" });

  const { rows: exists } = await pool.query(
    "SELECT COUNT(*) AS cnt FROM users WHERE tenant_id=$1", [client_tenant_id]
  );
  if (!Number(exists[0]?.cnt)) {
    return res.status(404).json({ error: "No business found with that Tenant ID. Ask the owner to share it from Settings." });
  }

  const { rows } = await pool.query(
    `INSERT INTO advisor_client_links(advisor_id, client_tenant_id, client_label)
     VALUES($1,$2,$3)
     ON CONFLICT(advisor_id, client_tenant_id) DO UPDATE SET client_label=$3
     RETURNING *`,
    [req.user.id, client_tenant_id, client_label || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/advisor/alerts — combined alert feed
router.get("/alerts", authenticate, requireAdvisor, async (req, res) => {
  const { rows: links } = await pool.query(
    "SELECT client_tenant_id, client_label FROM advisor_client_links WHERE advisor_id=$1", [req.user.id]
  );
  if (!links.length) return res.json([]);

  const ids = links.map(l => l.client_tenant_id);
  const ph  = ids.map((_, i) => `$${i + 2}`).join(",");
  const { rows } = await pool.query(
    `SELECT a.*, l.client_label
     FROM alerts a
     JOIN advisor_client_links l ON l.client_tenant_id=a.tenant_id AND l.advisor_id=$1
     WHERE a.tenant_id IN (${ph}) AND a.is_resolved=false
     ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, a.created_at DESC
     LIMIT 100`,
    [req.user.id, ...ids]
  );
  res.json(rows);
});

// DELETE /api/advisor/clients/:tenantId
router.delete("/clients/:tenantId", authenticate, requireAdvisor, async (req, res) => {
  await pool.query(
    "DELETE FROM advisor_client_links WHERE advisor_id=$1 AND client_tenant_id=$2",
    [req.user.id, req.params.tenantId]
  );
  res.json({ ok: true });
});

module.exports = router;
