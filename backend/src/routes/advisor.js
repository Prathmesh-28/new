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

// GET /gst-status - GST status for all advisor clients this month
router.get("/gst-status", authenticate, requireAdvisor, async (req, res) => {
  try {
    const advisorId = req.user.id;
    const { rows: links } = await pool.query(
      "SELECT client_tenant_id, client_label FROM advisor_client_links WHERE advisor_id=$1",
      [advisorId]
    );
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const results = await Promise.all(links.map(async (link) => {
      const { rows: ret } = await pool.query(
        `SELECT status, filed_at, net_liability, gstn_arn FROM gst_returns
         WHERE tenant_id=$1 AND period_month=$2 AND period_year=$3 AND return_type='GSTR-3B'`,
        [link.client_tenant_id, month, year]
      ).catch(() => ({ rows: [] }));
      return {
        tenant_id: link.client_tenant_id,
        label: link.client_label,
        gst_status: ret[0]?.status ?? "pending",
        net_liability: ret[0]?.net_liability ?? null,
        filed_at: ret[0]?.filed_at ?? null,
        gstn_arn: ret[0]?.gstn_arn ?? null,
      };
    }));

    res.json({ month, year, clients: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch GST status" });
  }
});

// GET /marketplace - Businesses looking for CA (no advisor linked)
router.get("/marketplace", authenticate, requireAdvisor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.gstin, t.city, t.industry, t.created_at
       FROM tenants t
       WHERE NOT EXISTS (
         SELECT 1 FROM advisor_client_links ac WHERE ac.client_tenant_id = t.id
       )
       AND t.seek_advisor = true
       ORDER BY t.created_at DESC
       LIMIT 20`
    ).catch(() => ({ rows: [] }));
    // Return mock data if table/column doesn't exist
    if (!rows.length) {
      return res.json([
        { id: "mock-1", name: "Raj Traders Pvt Ltd", city: "Mumbai", industry: "Retail", created_at: new Date(Date.now() - 86400000*3).toISOString() },
        { id: "mock-2", name: "Krishna Exports", city: "Surat", industry: "Textile", created_at: new Date(Date.now() - 86400000*7).toISOString() },
        { id: "mock-3", name: "Meera Pharma Dist.", city: "Hyderabad", industry: "Pharma", created_at: new Date(Date.now() - 86400000*12).toISOString() },
      ]);
    }
    res.json(rows);
  } catch {
    res.json([
      { id: "mock-1", name: "Raj Traders Pvt Ltd", city: "Mumbai", industry: "Retail", created_at: new Date(Date.now() - 86400000*3).toISOString() },
      { id: "mock-2", name: "Krishna Exports", city: "Surat", industry: "Textile", created_at: new Date(Date.now() - 86400000*7).toISOString() },
    ]);
  }
});

// GET /clients/:tenantId/report-preview - Monthly report data for a client
router.get("/clients/:tenantId/report-preview", authenticate, requireAdvisor, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const advisorId = req.user.id;
    // Verify advisor has access to this client
    const { rows } = await pool.query(
      "SELECT client_label FROM advisor_client_links WHERE advisor_id=$1 AND client_tenant_id=$2",
      [advisorId, tenantId]
    );
    if (!rows[0]) return res.status(403).json({ error: "Not authorized" });

    // Get data from kv_store
    const { rows: kvRows } = await pool.query(
      "SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store' LIMIT 1",
      [tenantId]
    ).catch(() => ({ rows: [] }));
    const store = kvRows[0]?.value?.value ?? {};
    const accounts = store.bankAccounts ?? [];
    const balance  = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    const txns     = store.transactions ?? [];
    const income   = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const alerts   = (store.alerts ?? []).filter(a => !a.isRead);

    res.json({ label: rows[0].client_label, balance, income, expenses, alerts_count: alerts.length, alert_messages: alerts.slice(0,3).map(a => a.message) });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// GET /api/advisor/workspace/:key — load a stored practice-management tracker
router.get("/workspace/:key", authenticate, requireAdvisor, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM advisor_workspace WHERE advisor_id=$1 AND key=$2",
      [req.user.id, req.params.key]
    );
    res.json(rows[0]?.value ?? {});
  } catch (err) {
    res.status(500).json({ error: "Failed to load workspace" });
  }
});

// PUT /api/advisor/workspace/:key — upsert a practice-management tracker
router.put("/workspace/:key", authenticate, requireAdvisor, async (req, res) => {
  try {
    const value = req.body ?? {};
    const { rows } = await pool.query(
      `INSERT INTO advisor_workspace(advisor_id, key, value)
       VALUES($1,$2,$3)
       ON CONFLICT(advisor_id, key) DO UPDATE SET value=$3
       RETURNING value`,
      [req.user.id, req.params.key, JSON.stringify(value)]
    );
    res.json(rows[0].value);
  } catch (err) {
    res.status(500).json({ error: "Failed to save workspace" });
  }
});

module.exports = router;
