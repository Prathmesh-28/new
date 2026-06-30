const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

// GET /api/alerts?unread=true&page=1
router.get("/", authenticate, async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const conditions = ["tenant_id=$1"];
  const vals = [req.user.tenant_id];
  let p = 2;

  if (req.query.unread === "true")  { conditions.push(`is_read=false`); }
  if (req.query.severity)          { conditions.push(`severity=$${p++}`); vals.push(req.query.severity); }

  const where = conditions.join(" AND ");

  const [dataRes, countRes] = await Promise.all([
    pool.query(
      `SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p+1}`,
      [...vals, limit, offset]
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM alerts WHERE ${where}`, vals),
  ]);

  res.json({ data: dataRes.rows, total: countRes.rows[0].total, page, limit });
});

// GET /api/alerts/unread-count
router.get("/unread-count", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM alerts WHERE tenant_id=$1 AND is_read=false AND is_resolved=false",
    [req.user.tenant_id]
  );
  res.json({ count: rows[0].count });
});

// PATCH /api/alerts/:id - mark read or resolved
router.patch("/:id", authenticate, async (req, res) => {
  const { is_read, is_resolved } = req.body;
  const { rows: existing } = await pool.query(
    "SELECT * FROM alerts WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  const updates = [];
  const vals = [];
  let i = 1;
  if (is_read     !== undefined) { updates.push(`is_read=$${i++}`);     vals.push(is_read); }
  if (is_resolved !== undefined) { updates.push(`is_resolved=$${i++}`); vals.push(is_resolved); }

  if (!updates.length) return res.json(existing[0]);

  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE alerts SET ${updates.join(",")} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// POST /api/alerts/mark-all-read
router.post("/mark-all-read", authenticate, async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE alerts SET is_read=true WHERE tenant_id=$1 AND is_read=false",
    [req.user.tenant_id]
  );
  res.json({ updated: rowCount });
});

module.exports = router;
