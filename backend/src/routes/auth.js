const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { pool } = require("../db");
const { signAccess, signRefresh, verifyRefresh } = require("../lib/jwt");
const { authenticate } = require("../middleware/auth");
const { sendOtp, sendWelcome } = require("../lib/email");
const { validateBody } = require("../lib/validate");

// POST /auth/signup
router.post("/signup", validateBody({
  email:        { type: "email",  required: true, maxLen: 254 },
  password:     { type: "string", required: true, minLen: 8, maxLen: 200 },
  company_name: { type: "string", maxLen: 120 },
  role:         { type: "string", enum: ["owner", "accountant", "investor"] },
}), async (req, res) => {
  const { email, password, company_name, role = "owner" } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (!["owner", "accountant", "investor"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
  if (existing[0]) return res.status(409).json({ error: "An account with this email already exists" });

  const hash = await bcrypt.hash(password, 10);
  const slug = (company_name || email.split("@")[0])
    .toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const tenant_id = `${slug}-${crypto.randomBytes(3).toString("hex")}`;

  const { rows } = await pool.query(
    "INSERT INTO users(email,password,role,tenant_id,first_login) VALUES($1,$2,$3,$4,false) RETURNING id,email,role,tenant_id,first_login",
    [email.toLowerCase(), hash, role, tenant_id]
  );
  const user = rows[0];
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.status(201).json({ access: signAccess(payload), refresh: signRefresh(payload), user });
});

// POST /auth/login
router.post("/login", validateBody({
  email:    { type: "email",  required: true, maxLen: 254 },
  password: { type: "string", required: true, maxLen: 200 },
}), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return res.status(423).json({ error: `Account locked. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` });
  }

  let ok = await bcrypt.compare(password, user.password);
  // Fallback: allow a valid, unexpired password-reset OTP as a one-time login.
  // The user is then forced to set a new password (first_login=true), and the
  // OTP is consumed. This recovers access without ever overwriting `password`.
  let viaResetOtp = false;
  if (!ok && user.reset_otp && user.reset_otp_expiry && new Date(user.reset_otp_expiry) > new Date()) {
    if (await bcrypt.compare(password, user.reset_otp)) { ok = true; viaResetOtp = true; }
  }
  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    if (attempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await pool.query("UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3", [attempts, lockUntil, user.id]);
      return res.status(423).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
    }
    await pool.query("UPDATE users SET failed_attempts=$1 WHERE id=$2", [attempts, user.id]);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const firstLogin = viaResetOtp ? true : user.first_login;
  await pool.query(
    "UPDATE users SET failed_attempts=0, locked_until=NULL, reset_otp=NULL, reset_otp_expiry=NULL, first_login=$2 WHERE id=$1",
    [user.id, firstLogin]
  );
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.json({
    access:  signAccess(payload),
    refresh: signRefresh(payload),
    user:    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, first_login: firstLogin, plan: user.subscription_plan || "free" },
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
router.get("/me", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, role, tenant_id, first_login, display_name, subscription_plan AS plan FROM users WHERE id=$1",
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

// POST /auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email?.toLowerCase()]);
  if (!rows[0]) return res.json({ ok: true }); // don't leak existence
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  // Store the OTP in its own column — never overwrite `password` (doing so let
  // anyone DoS an account via /forgot-password). Also clear any lockout so the
  // legitimate owner, who alone receives the emailed OTP, can recover at once.
  await pool.query(
    "UPDATE users SET reset_otp=$1, reset_otp_expiry=$2, failed_attempts=0, locked_until=NULL WHERE id=$3",
    [await bcrypt.hash(otp, 10), expiry, rows[0].id]
  );
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

// PUT /auth/profile — update display name
router.put("/profile", authenticate, async (req, res) => {
  const { display_name } = req.body;
  if (!display_name || !display_name.trim()) return res.status(400).json({ error: "display_name required" });
  await pool.query(
    "UPDATE users SET display_name=$1 WHERE id=$2",
    [display_name.trim().slice(0, 64), req.user.id]
  );
  res.json({ ok: true });
});

// POST /auth/change-password — requires current password
router.post("/change-password", authenticate, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "Both passwords required" });
  if (new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const { rows } = await pool.query("SELECT password FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });

  const ok = await bcrypt.compare(current_password, rows[0].password);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(new_password, 10);
  await pool.query("UPDATE users SET password=$1 WHERE id=$2", [hash, req.user.id]);
  res.json({ ok: true });
});

// GET /auth/me — extend to include display_name
router.get("/me/profile", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, role, tenant_id, first_login, display_name FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

module.exports = router;
