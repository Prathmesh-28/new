const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

// Resolve the tenant scope: super_admin may target any tenant via ?tenant_id /
// body.tenant_id; everyone else is pinned to their own tenant.
function scopeTenant(req, fallback) {
  if (req.user?.role === "super_admin") {
    return req.query.tenant_id || (req.body && req.body.tenant_id) || fallback || req.user.tenant_id;
  }
  return req.user.tenant_id;
}

// POST /applications - borrower submits a real loan application for their tenant.
router.post("/applications", authenticate, async (req, res) => {
  try {
    const { company_name, amount, purpose, tenure_months } = req.body || {};
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: "A positive loan amount is required" });
    const tenant_id = scopeTenant(req);
    const tenure = Number.isFinite(Number(tenure_months)) && Number(tenure_months) > 0 ? Math.round(Number(tenure_months)) : 12;
    const { rows } = await pool.query(
      `INSERT INTO lender_applications (tenant_id, company_name, amount, purpose, tenure_months, status, created_by)
       VALUES ($1,$2,$3,$4,$5,'open',$6)
       RETURNING id, tenant_id, company_name, amount, purpose, tenure_months, status, created_by, created_at`,
      [tenant_id, company_name || null, amt, purpose || null, tenure, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Could not submit application" });
  }
});

// GET /applications/mine - the caller's own applications, each with its bids.
router.get("/applications/mine", authenticate, async (req, res) => {
  try {
    const tenant_id = scopeTenant(req);
    const { rows: apps } = await pool.query(
      `SELECT id, tenant_id, company_name, amount, purpose, tenure_months, status, created_by, created_at
         FROM lender_applications
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [tenant_id]
    );
    if (apps.length === 0) return res.json([]);
    const ids = apps.map(a => a.id);
    const { rows: bids } = await pool.query(
      `SELECT id, application_id, lender_id, lender_label, rate, amount, note, created_at
         FROM lender_bids
        WHERE application_id = ANY($1::uuid[])
        ORDER BY created_at DESC`,
      [ids]
    );
    const byApp = {};
    for (const b of bids) (byApp[b.application_id] = byApp[b.application_id] || []).push(b);
    res.json(apps.map(a => ({ ...a, bids: byApp[a.id] || [] })));
  } catch (e) {
    res.status(500).json({ error: "Could not load your applications" });
  }
});

// GET /queue - open applications across all tenants for lenders to browse, each
// annotated with how many bids it already has.
router.get("/queue", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.tenant_id, a.company_name, a.amount, a.purpose, a.tenure_months,
              a.status, a.created_at,
              COUNT(b.id)::int AS bid_count
         FROM lender_applications a
         LEFT JOIN lender_bids b ON b.application_id = a.id
        WHERE a.status = 'open'
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Could not load the queue" });
  }
});

// POST /applications/:id/bid - a lender persists a bid on an application.
router.post("/applications/:id/bid", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rate, amount, note, lender_label } = req.body || {};
    const rt = Number(rate);
    if (!rt || rt <= 0) return res.status(400).json({ error: "A positive interest rate is required" });
    const { rows: appRows } = await pool.query(
      `SELECT id FROM lender_applications WHERE id = $1`, [id]
    );
    if (!appRows[0]) return res.status(404).json({ error: "Application not found" });
    const amt = Number(amount);
    const { rows } = await pool.query(
      `INSERT INTO lender_bids (application_id, lender_id, lender_label, rate, amount, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, application_id, lender_id, lender_label, rate, amount, note, created_at`,
      [id, req.user.id, lender_label || req.user.display_name || req.user.email || "Lender",
       rt, Number.isFinite(amt) && amt > 0 ? amt : null, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Could not place bid" });
  }
});

// GET /applications/:id/bids - all bids on a single application.
router.get("/applications/:id/bids", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, application_id, lender_id, lender_label, rate, amount, note, created_at
         FROM lender_bids
        WHERE application_id = $1
        ORDER BY created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Could not load bids" });
  }
});

module.exports = router;
