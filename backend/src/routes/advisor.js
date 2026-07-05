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

// GET /api/advisor/alerts - combined alert feed
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

// ── GST FILING BOARD - the CA's multi-client cockpit for a period ─────────────
// One call answers, for EVERY linked client at once: did this month have GST activity
// in the books, what's the live 3B liability, has the 3B been computed/filed (ARN),
// how many portal invoices are still un-actioned in IMS (deemed accepted on filing),
// and how much booked ITC the supplier hasn't filed (at risk). Batched: 4 queries
// total regardless of client count. Access = the advisor's own linked clients only.
router.get("/gst-board", authenticate, requireAdvisor, async (req, res) => {
  try {
    const period = /^\d{4}-\d{2}$/.test(String(req.query.period || "")) ? String(req.query.period) : new Date().toISOString().slice(0, 7);
    const [py, pm] = period.split("-").map(Number);
    const from = `${period}-01`;
    const to = `${period}-${String(new Date(Date.UTC(py, pm, 0)).getUTCDate()).padStart(2, "0")}`;

    const { rows: links } = await pool.query(
      "SELECT client_tenant_id, client_label FROM advisor_client_links WHERE advisor_id=$1 ORDER BY client_label NULLS LAST",
      [req.user.id]);
    if (!links.length) {
      return res.json({ period, due_gstr1: null, due_gstr3b: null, overdue_3b: false, clients: [], totals: { clients: 0, filed: 0, computed: 0, not_computed: 0, turnover: 0, net_liability_books: 0, ims_pending: 0, itc_at_risk: 0 } });
    }
    const ids = links.map((l) => l.client_tenant_id);

    const [{ rows: liab }, { rows: rets }, { rows: wb }] = await Promise.all([
      // Books-live GST for the period per client (from posted book_tax_entries).
      pool.query(
        `SELECT te.tenant_id,
                COALESCE(SUM(te.taxable_value) FILTER (WHERE te.is_input=false AND te.tax_kind IN ('CGST','IGST')),0) AS turnover,
                COALESCE(SUM(te.tax_amount) FILTER (WHERE te.is_input=false),0) AS output_tax,
                COALESCE(SUM(te.tax_amount) FILTER (WHERE te.is_input=true),0)  AS itc
           FROM book_tax_entries te
           JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
          WHERE te.tenant_id = ANY($1) AND v.voucher_date BETWEEN $2 AND $3
          GROUP BY te.tenant_id`, [ids, from, to]),
      // The 3B return record (computed/filed tracker) for the period.
      pool.query(
        `SELECT tenant_id, status, filed_at, net_liability, gstn_arn FROM gst_returns
          WHERE tenant_id = ANY($1) AND period_month=$2 AND period_year=$3 AND return_type='GSTR-3B'`,
        [ids, pm, py]),
      // 2B/IMS workbench summary (persisted match runs + decisions).
      pool.query(
        `SELECT tenant_id,
                COUNT(*) FILTER (WHERE decision='PENDING' AND bucket <> 'MISSING_IN_PORTAL')::int AS ims_pending,
                COALESCE(SUM(tax) FILTER (WHERE bucket='MISSING_IN_PORTAL'),0) AS itc_at_risk,
                MAX(run_at) AS last_2b_run
           FROM book_gstr2b_lines WHERE tenant_id = ANY($1) AND period=$2 GROUP BY tenant_id`, [ids, period]),
    ]);
    const liabBy = new Map(liab.map((r) => [r.tenant_id, r]));
    const retBy = new Map(rets.map((r) => [r.tenant_id, r]));
    const wbBy = new Map(wb.map((r) => [r.tenant_id, r]));

    // Statutory due dates for the period: GSTR-1 the 11th, GSTR-3B the 20th of the next month.
    const due_gstr1 = new Date(Date.UTC(py, pm, 11)).toISOString().slice(0, 10);
    const due_gstr3b = new Date(Date.UTC(py, pm, 20)).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const clients = links.map((l) => {
      const L = liabBy.get(l.client_tenant_id), R = retBy.get(l.client_tenant_id), W = wbBy.get(l.client_tenant_id);
      const output_tax = Number(L?.output_tax || 0), itc = Number(L?.itc || 0);
      return {
        tenant_id: l.client_tenant_id,
        label: l.client_label || l.client_tenant_id,
        has_activity: !!L,
        turnover: Number(L?.turnover || 0),
        output_tax, itc,
        net_liability_books: Math.max(0, Number((output_tax - itc).toFixed(2))),
        r3b_status: R ? (R.filed_at ? "filed" : R.status || "computed") : "not_computed",
        r3b_filed_at: R?.filed_at ?? null,
        r3b_arn: R?.gstn_arn ?? null,
        r3b_net_liability: R?.net_liability != null ? Number(R.net_liability) : null,
        ims_pending: Number(W?.ims_pending || 0),
        itc_at_risk: Number(W?.itc_at_risk || 0),
        last_2b_run: W?.last_2b_run ?? null,
      };
    }).sort((a, b) => {
      // Unfiled-with-activity first (the CA's actual worklist), biggest liability first.
      const rank = (c) => (c.r3b_status === "filed" ? 2 : c.has_activity ? 0 : 1);
      return rank(a) - rank(b) || b.net_liability_books - a.net_liability_books;
    });

    const totals = {
      clients: clients.length,
      filed: clients.filter((c) => c.r3b_status === "filed").length,
      computed: clients.filter((c) => c.r3b_status !== "filed" && c.r3b_status !== "not_computed").length,
      not_computed: clients.filter((c) => c.r3b_status === "not_computed").length,
      turnover: clients.reduce((s, c) => s + c.turnover, 0),
      net_liability_books: clients.reduce((s, c) => s + c.net_liability_books, 0),
      ims_pending: clients.reduce((s, c) => s + c.ims_pending, 0),
      itc_at_risk: clients.reduce((s, c) => s + c.itc_at_risk, 0),
    };
    res.json({ period, due_gstr1, due_gstr3b, overdue_3b: today > due_gstr3b, clients, totals });
  } catch (err) {
    console.error("[advisor] gst-board failed:", err.message);
    res.status(500).json({ error: "Failed to build the GST board" });
  }
});

// POST /gst-board/prepare - REAL bulk GSTR-3B compute for every linked client with books
// activity in the period. Upserts a 'draft' gst_returns record per client from the actual
// ledger — the same computation each client's own POST /api/gst/returns runs. This replaces
// the old UI's fake "Prepare All" (a setTimeout + success toast that computed nothing).
router.post("/gst-board/prepare", authenticate, requireAdvisor, async (req, res) => {
  try {
    const period = /^\d{4}-\d{2}$/.test(String((req.body || {}).period || "")) ? String(req.body.period) : new Date().toISOString().slice(0, 7);
    const [py, pm] = period.split("-").map(Number);
    const gst = require("../modules/books/gst");
    const round2 = (x) => parseFloat((Number(x) || 0).toFixed(2));
    const sumHeads = (o) => round2((Number(o.CGST) || 0) + (Number(o.SGST) || 0) + (Number(o.IGST) || 0) + (Number(o.CESS) || 0));

    const { rows: links } = await pool.query(
      "SELECT client_tenant_id, client_label FROM advisor_client_links WHERE advisor_id=$1", [req.user.id]);
    let prepared = 0, skipped = 0, failed = 0;
    for (const l of links) {
      try {
        // Never clobber an already-FILED return.
        const { rows: existing } = await pool.query(
          "SELECT filed_at FROM gst_returns WHERE tenant_id=$1 AND return_type='GSTR-3B' AND period_month=$2 AND period_year=$3",
          [l.client_tenant_id, pm, py]);
        if (existing[0]?.filed_at) { skipped++; continue; }

        const b3 = await gst.gstr3b(l.client_tenant_id, period);
        const output_tax = sumHeads(b3.outputTax);
        const input_tax_credit = sumHeads(b3.inputTaxCredit);
        if (output_tax === 0 && input_tax_credit === 0) { skipped++; continue; } // no GST activity → nothing to prepare
        const net_liability = round2(Math.max(0, output_tax - input_tax_credit));
        await pool.query(
          `INSERT INTO gst_returns(tenant_id, return_type, period_month, period_year, output_tax, input_tax_credit, net_liability, computed_data)
           VALUES($1,'GSTR-3B',$2,$3,$4,$5,$6,$7)
           ON CONFLICT(tenant_id, return_type, period_month, period_year)
           DO UPDATE SET output_tax=$4, input_tax_credit=$5, net_liability=$6, computed_data=$7, status='draft'`,
          [l.client_tenant_id, pm, py, output_tax, input_tax_credit, net_liability,
           JSON.stringify({ outputTax: b3.outputTax, inputTaxCredit: b3.inputTaxCredit, source: "books", prepared_by_advisor: req.user.id })]);
        prepared++;
      } catch (e) { console.error("[advisor] prepare failed for", l.client_tenant_id, e.message); failed++; }
    }
    res.json({ period, prepared, skipped, failed });
  } catch (err) {
    console.error("[advisor] gst-board prepare failed:", err.message);
    res.status(500).json({ error: "Bulk prepare failed" });
  }
});

// GET /marketplace - businesses looking for a CA (opted in, not yet linked). HONEST:
// an empty result returns an empty list. (This used to fabricate hardcoded business
// names — "Raj Traders", "Krishna Exports" — whenever the real query found nothing,
// presenting fake prospects as real leads. Never again.)
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
    ).catch(() => ({ rows: [] })); // tenants.seek_advisor may not exist on older DBs → honest empty
    res.json(rows);
  } catch {
    res.json([]);
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

// GET /api/advisor/workspace/:key - load a stored practice-management tracker
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

// PUT /api/advisor/workspace/:key - upsert a practice-management tracker
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
