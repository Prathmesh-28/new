const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// GET /api/accounts
router.get("/", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM bank_accounts WHERE tenant_id=$1 AND is_active=true ORDER BY is_primary DESC, created_at",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// GET /api/accounts/:id
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM bank_accounts WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// POST /api/accounts
router.post("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { account_name, account_type = "checking", provider = "manual", currency = "INR", current_balance = 0, is_primary = false } = req.body;
  if (!account_name) return res.status(400).json({ error: "account_name required" });

  if (is_primary) {
    await pool.query("UPDATE bank_accounts SET is_primary=false WHERE tenant_id=$1", [req.user.tenant_id]);
  }

  const { rows } = await pool.query(
    `INSERT INTO bank_accounts(tenant_id, account_name, account_type, provider, currency, current_balance, is_primary)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.tenant_id, account_name, account_type, provider, currency, current_balance, is_primary]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/accounts/:id
router.patch("/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { account_name, current_balance, is_primary, is_active } = req.body;

  const { rows: existing } = await pool.query(
    "SELECT * FROM bank_accounts WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing[0]) return res.status(404).json({ error: "Not found" });

  if (is_primary) {
    await pool.query("UPDATE bank_accounts SET is_primary=false WHERE tenant_id=$1", [req.user.tenant_id]);
  }

  const updates = [];
  const vals = [];
  let i = 1;
  if (account_name  !== undefined) { updates.push(`account_name=$${i++}`);  vals.push(account_name); }
  if (current_balance !== undefined) { updates.push(`current_balance=$${i++}`, `balance_as_of=now()`); vals.push(current_balance); }
  if (is_primary  !== undefined) { updates.push(`is_primary=$${i++}`);  vals.push(is_primary); }
  if (is_active   !== undefined) { updates.push(`is_active=$${i++}`);   vals.push(is_active); }

  if (!updates.length) return res.json(existing[0]);

  vals.push(req.params.id, req.user.tenant_id);
  const { rows } = await pool.query(
    `UPDATE bank_accounts SET ${updates.join(",")} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

// DELETE /api/accounts/:id
router.delete("/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  await pool.query(
    "UPDATE bank_accounts SET is_active=false WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  res.json({ ok: true });
});

module.exports = router;
