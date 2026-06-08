const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { pool } = require("../db");
const { signAccess, signRefresh, verifyRefresh } = require("../lib/jwt");
const { authenticate } = require("../middleware/auth");
const { sendOtp, sendWelcome } = require("../lib/email");

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.json({
    access:  signAccess(payload),
    refresh: signRefresh(payload),
    user:    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, first_login: user.first_login },
  });
});

// POST /auth/refresh
router.post("/refresh", async (req, res) => {
  const { refresh } = req.body;
  if (!refresh) return res.status(400).json({ error: "Refresh token required" });
  try {
    const payload = verifyRefresh(refresh);
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    const u = rows[0];
    const p = { sub: u.id, role: u.role, tenant: u.tenant_id };
    res.json({ access: signAccess(p), refresh: signRefresh(p) });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// POST /auth/logout — stateless, client drops tokens
router.post("/logout", (_req, res) => res.json({ ok: true }));

// GET /auth/me
router.get("/me", authenticate, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, email: u.email, role: u.role, tenant_id: u.tenant_id, first_login: u.first_login });
});

// POST /auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email?.toLowerCase()]);
  if (!rows[0]) return res.json({ ok: true }); // don't leak existence
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await pool.query("UPDATE users SET password=$1 WHERE id=$2", [await bcrypt.hash(`OTP:${otp}:${expiry}`, 10), rows[0].id]);
  await sendOtp({ to: rows[0].email, otp });
  res.json({ ok: true });
});

// POST /auth/set-password
router.post("/set-password", authenticate, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: "Password too short" });
  const hash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password=$1, first_login=false WHERE id=$2", [hash, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
