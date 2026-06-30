const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// GET /api/capital/raises
router.get("/raises", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM capital_raises WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// GET /api/capital/raises/public - all active raises across tenants (investor marketplace)
router.get("/raises/public", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, raise_type, target_amount, raised_amount, status, closes_at, created_at FROM capital_raises WHERE status='active' ORDER BY created_at DESC"
  );
  res.json(rows);
});

// POST /api/capital/raises/:id/commit - investor commits to a raise
router.post("/raises/:id/commit", authenticate, async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Positive amount required" });

  const { rows: raiseRows } = await pool.query(
    "SELECT * FROM capital_raises WHERE id=$1 AND status='active'",
    [req.params.id]
  );
  if (!raiseRows[0]) return res.status(404).json({ error: "Active raise not found" });

  const raise = raiseRows[0];
  const equityPct = (Number(amount) / Number(raise.target_amount)) * 100;

  const { rows: invRows } = await pool.query(
    "INSERT INTO investors(tenant_id, raise_id, name, email, amount, status) VALUES($1,$2,$3,$4,$5,'committed') RETURNING *",
    [raise.tenant_id, req.params.id, req.user.email, req.user.email, amount]
  );

  await pool.query(
    "UPDATE capital_raises SET raised_amount = (SELECT COALESCE(SUM(amount),0) FROM investors WHERE raise_id=$1 AND status='committed') WHERE id=$1",
    [req.params.id]
  );

  res.status(201).json({ ...invRows[0], equity_pct: equityPct });
});

// GET /api/capital/raises/:id
router.get("/raises/:id", authenticate, async (req, res) => {
  const { rows: raiseRows } = await pool.query(
    "SELECT * FROM capital_raises WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!raiseRows[0]) return res.status(404).json({ error: "Not found" });

  const { rows: investors } = await pool.query(
    "SELECT * FROM investors WHERE raise_id=$1 ORDER BY invested_at DESC",
    [req.params.id]
  );

  res.json({ raise: raiseRows[0], investors });
});

// POST /api/capital/raises
router.post("/raises", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { name, raise_type = "rev_share", target_amount, closes_at } = req.body;
  if (!name || !target_amount) return res.status(400).json({ error: "name and target_amount required" });

  const { rows } = await pool.query(
    "INSERT INTO capital_raises(tenant_id, name, raise_type, target_amount, closes_at) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [req.user.tenant_id, name, raise_type, target_amount, closes_at || null]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/capital/raises/:id
router.patch("/raises/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { name, status, target_amount, closes_at } = req.body;
  const { rows: existing } = await pool.query(
    "SELECT * FROM capital_raises WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  const updates = [];
  const vals = [];
  let i = 1;
  if (name          !== undefined) { updates.push(`name=$${i++}`);          vals.push(name); }
  if (status        !== undefined) { updates.push(`status=$${i++}`);        vals.push(status); }
  if (target_amount !== undefined) { updates.push(`target_amount=$${i++}`); vals.push(target_amount); }
  if (closes_at     !== undefined) { updates.push(`closes_at=$${i++}`);     vals.push(closes_at); }
  if (status === "active" && !existing[0].started_at) { updates.push(`started_at=now()`); }

  if (!updates.length) return res.json(existing[0]);

  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE capital_raises SET ${updates.join(",")} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// DELETE /api/capital/raises/:id
router.delete("/raises/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM capital_raises WHERE id=$1 AND tenant_id=$2 AND status='draft'",
    [req.params.id, req.user.tenant_id]
  );
  if (!rowCount) return res.status(400).json({ error: "Only draft raises can be deleted" });
  res.json({ ok: true });
});

// POST /api/capital/raises/:id/investors - record an investor commitment
router.post("/raises/:id/investors", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { name, email, amount, status = "committed" } = req.body;
  if (!name || !amount) return res.status(400).json({ error: "name and amount required" });

  const { rows: raiseRows } = await pool.query(
    "SELECT * FROM capital_raises WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!raiseRows[0]) return res.status(404).json({ error: "Raise not found" });

  const { rows: invRows } = await pool.query(
    "INSERT INTO investors(tenant_id, raise_id, name, email, amount, status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [req.user.tenant_id, req.params.id, name, email || null, amount, status]
  );

  // Update raised_amount
  await pool.query(
    "UPDATE capital_raises SET raised_amount = (SELECT COALESCE(SUM(amount),0) FROM investors WHERE raise_id=$1 AND status='committed') WHERE id=$1",
    [req.params.id]
  );

  res.status(201).json(invRows[0]);
});

// DELETE /api/capital/raises/:id/investors/:invId
router.delete("/raises/:id/investors/:invId", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM investors WHERE id=$1 AND raise_id=$2 AND tenant_id=$3",
    [req.params.invId, req.params.id, req.user.tenant_id]
  );
  if (!rowCount) return res.status(404).json({ error: "Not found" });

  await pool.query(
    "UPDATE capital_raises SET raised_amount = (SELECT COALESCE(SUM(amount),0) FROM investors WHERE raise_id=$1 AND status='committed') WHERE id=$1",
    [req.params.id]
  );

  res.json({ ok: true });
});

module.exports = router;
