const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { sendWelcome } = require("../lib/email");

// GET /api/users — super_admin sees all, others see own tenant
router.get("/", authenticate, async (req, res) => {
  const isSuperAdmin = req.user.role === "super_admin";
  const { rows } = isSuperAdmin
    ? await pool.query("SELECT id,email,role,tenant_id,first_login,created_at FROM users ORDER BY created_at DESC")
    : await pool.query("SELECT id,email,role,tenant_id,first_login,created_at FROM users WHERE tenant_id=$1 ORDER BY created_at DESC", [req.user.tenant_id]);
  res.json(rows);
});

// POST /api/users — owner or super_admin
router.post("/", authenticate, async (req, res) => {
  if (!["super_admin", "owner"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const { email, role, tenant_id } = req.body;
  if (!email || !role) return res.status(400).json({ error: "email and role required" });

  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash     = await bcrypt.hash(tempPass, 10);
  const tid      = req.user.role === "super_admin" ? (tenant_id || req.user.tenant_id) : req.user.tenant_id;

  const { rows } = await pool.query(
    "INSERT INTO users(email,password,role,tenant_id) VALUES($1,$2,$3,$4) RETURNING id,email,role,tenant_id,first_login",
    [email.toLowerCase(), hash, role, tid]
  );
  await sendWelcome({ to: email, password: tempPass });
  res.status(201).json(rows[0]);
});

// PATCH /api/users/:id
router.patch("/:id", authenticate, async (req, res) => {
  if (!["super_admin", "owner"].includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  const { role } = req.body;
  const { rows } = await pool.query(
    "UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role,tenant_id",
    [role, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/users/:id
router.delete("/:id", authenticate, requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
