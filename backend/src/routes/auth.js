const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { pool } = require("../db");
const { signAccess, signRefresh, verifyRefresh } = require("../lib/jwt");
const { authenticate } = require("../middleware/auth");
const { sendOtp, sendWelcome } = require("../lib/email");
const { validateBody } = require("../lib/validate");
const { requireHuman } = require("../lib/turnstile");

// POST /auth/signup
router.post("/signup", validateBody({
  email:        { type: "email",  required: true, maxLen: 254 },
  password:     { type: "string", required: true, minLen: 8, maxLen: 200 },
  company_name: { type: "string", maxLen: 120 },
  role:         { type: "string", enum: ["owner", "accountant", "investor"] },
}), async (req, res) => {
  if (!(await requireHuman(req, res))) return;   // Turnstile (no-op until configured)
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
  // Record the founding membership (owner of their own new firm) so the multi-firm
  // switcher (#197) lists it. users.tenant_id remains the home firm.
  await pool.query(
    "INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id, tenant_id) DO NOTHING",
    [user.id, user.tenant_id, user.role]
  ).catch(() => {});
  require("../modules/analytics").track(user.tenant_id, user.id, { event: "signup_completed", props: { role: user.role } }).catch(() => {});
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.status(201).json({ access: signAccess(payload), refresh: signRefresh(payload), user });
});

// POST /auth/login
router.post("/login", validateBody({
  email:    { type: "email",  required: true, maxLen: 254 },
  password: { type: "string", required: true, maxLen: 200 },
  mfa_code: { type: "string", required: false, maxLen: 16 },
}), async (req, res) => {
 try {
  if (!(await requireHuman(req, res))) return;   // Turnstile (no-op until configured)
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

  if (user.status === "suspended") return res.status(403).json({ error: "This account has been suspended. Contact support." });

  // Opt-in MFA: only users who enabled it must pass a second factor (TOTP or a backup
  // code). Wrong codes count toward the same 5-attempt lockout to stop brute force; a
  // missing code just asks for it (mfa_required) without burning an attempt.
  if (user.mfa_enabled) {
    const totp = require("../lib/totp");
    if (!user.mfa_secret_enc) return res.status(400).json({ error: "MFA setup is incomplete — reset your password to recover access." });
    const code = String((req.body && req.body.mfa_code) || "").trim();
    if (!code) return res.status(401).json({ error: "Enter your authenticator code.", mfa_required: true });
    // TOTP first, with anti-replay: never accept a step counter already used.
    const matched = totp.verifyTotpCounter(totp.decSecret(user.mfa_secret_enc), code, { after: Number(user.mfa_last_totp_counter || 0) });
    let mfaOk = matched > 0;
    if (!mfaOk && Array.isArray(user.mfa_backup_codes) && user.mfa_backup_codes.length) {
      const h = Buffer.from(totp.hashBackup(code));
      let isMember = false;
      for (const stored of user.mfa_backup_codes) { const sb = Buffer.from(String(stored)); if (sb.length === h.length && crypto.timingSafeEqual(sb, h)) isMember = true; }
      if (isMember) { // atomic single-use: only succeeds if the code is still present (race-safe)
        const del = await pool.query("UPDATE users SET mfa_backup_codes = array_remove(mfa_backup_codes, $1) WHERE id=$2 AND $1 = ANY(mfa_backup_codes)", [totp.hashBackup(code), user.id]);
        if (del.rowCount === 1) mfaOk = true;
      }
    }
    if (!mfaOk) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await pool.query("UPDATE users SET failed_attempts=$1, locked_until=$2 WHERE id=$3", [attempts, lockUntil, user.id]);
        return res.status(423).json({ error: "Too many failed codes. Account locked for 15 minutes." });
      }
      await pool.query("UPDATE users SET failed_attempts=$1 WHERE id=$2", [attempts, user.id]);
      return res.status(401).json({ error: "Invalid authenticator code.", mfa_required: true });
    }
    if (matched > 0) await pool.query("UPDATE users SET mfa_last_totp_counter=$1 WHERE id=$2", [matched, user.id]);
  }

  const firstLogin = viaResetOtp ? true : user.first_login;
  await pool.query(
    `UPDATE users SET failed_attempts=0, locked_until=NULL, reset_otp=NULL, reset_otp_expiry=NULL,
            first_login=$2, last_login_at=now(), last_active_at=now(), login_count=COALESCE(login_count,0)+1
     WHERE id=$1`,
    [user.id, firstLogin]
  );
  require("../modules/analytics").track(user.tenant_id, user.id, { event: "login" }).catch(() => {});
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.json({
    access:  signAccess(payload),
    refresh: signRefresh(payload),
    user:    { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, first_login: firstLogin, plan: user.subscription_plan || "free", locale: user.locale || null },
  });
 } catch (e) {
  // Login had NO error handling: any unexpected error (env/schema/DB) previously became an
  // opaque 500 or a hung request. Log the exact cause (→ stderr + ERROR_WEBHOOK_URL) and
  // return a distinct message so the failure is diagnosable and never hangs.
  require("../lib/logger").error("auth_login_error", { msg: e.message, code: e.code, stack: (e.stack || "").split("\n").slice(0, 5).join(" | ") });
  return res.status(500).json({ error: "Login failed. Please try again in a moment." });
 }
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

// POST /auth/logout - stateless, client drops tokens
router.post("/logout", (_req, res) => res.json({ ok: true }));

// ── Multi-firm switcher (#197) ────────────────────────────────────────────────
// GET /auth/my-firms - the firms this user may act in (populates the switcher UI).
router.get("/my-firms", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.tenant_id, m.role, COALESCE(NULLIF(tp.company_name,''), m.tenant_id) AS name
       FROM tenant_memberships m
       LEFT JOIN tenant_profile tp ON tp.tenant_id = m.tenant_id
      WHERE m.user_id=$1 AND m.status='active'
      ORDER BY name ASC`,
    [req.user.id]
  );
  // req.user.tenant_id is the currently-active firm (already resolved by authenticate,
  // reflecting any X-Active-Tenant switch); the UI marks it as selected.
  res.json({ firms: rows, active: req.user.tenant_id });
});

// POST /auth/switch-firm - authorize activating a firm the user is a member of. The
// actual scope switch is driven by the X-Active-Tenant header (re-checked every request);
// this endpoint gives the UI a clean 403 + the target firm's role/plan/name to display.
router.post("/switch-firm", authenticate, validateBody({
  tenant_id: { type: "string", required: true, maxLen: 120 },
}), async (req, res) => {
  const target = String(req.body.tenant_id);
  const { rows } = await pool.query(
    "SELECT role FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2 AND status='active'",
    [req.user.id, target]
  );
  if (!rows[0]) return res.status(403).json({ error: "You are not a member of that firm" });
  const { tenantPlan } = require("../lib/plans");
  const plan = await tenantPlan(target).catch(() => "free");
  const prof = await pool.query("SELECT company_name FROM tenant_profile WHERE tenant_id=$1", [target]).catch(() => ({ rows: [] }));
  require("../lib/audit").writeAudit(req.user.id, "firm.switch", "tenant", target, { role: rows[0].role });
  res.json({ ok: true, firm: { tenant_id: target, role: rows[0].role, plan, name: (prof.rows[0] && prof.rows[0].company_name) || target } });
});

// POST /auth/create-firm - spin up an ADDITIONAL firm under the same login (the owner
// of multiple businesses). The user keeps their home firm and gains an owner membership
// in the new one; email stays unique (no new users row). Capped to prevent abuse.
const MAX_OWNED_FIRMS = 10;
router.post("/create-firm", authenticate, validateBody({
  company_name: { type: "string", required: true, minLen: 1, maxLen: 120 },
}), async (req, res) => {
  const owned = await pool.query(
    "SELECT COUNT(*)::int AS n FROM tenant_memberships WHERE user_id=$1 AND role='owner' AND status='active'",
    [req.user.id]
  );
  if ((owned.rows[0]?.n || 0) >= MAX_OWNED_FIRMS) {
    return res.status(429).json({ error: `You can own at most ${MAX_OWNED_FIRMS} firms.` });
  }
  const slug = String(req.body.company_name).toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  // Generate an UNCLAIMED tenant_id. The membership INSERT's ON CONFLICT is on
  // (user_id, tenant_id), so it would NOT stop a collision with a DIFFERENT firm's id —
  // that would silently grant owner access to someone else's firm. So we must verify the
  // id belongs to no existing firm (users / memberships / profile) before claiming it, and
  // regenerate on the (astronomically rare) collision.
  let tenant_id = null;
  for (let attempt = 0; attempt < 5 && !tenant_id; attempt++) {
    const cand = `${slug || "firm"}-${crypto.randomBytes(6).toString("hex")}`;
    const clash = await pool.query(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM users WHERE tenant_id=$1)
                  OR EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id=$1)
                  OR EXISTS (SELECT 1 FROM tenant_profile WHERE tenant_id=$1) LIMIT 1`,
      [cand]
    );
    if (!clash.rows.length) tenant_id = cand;
  }
  if (!tenant_id) return res.status(500).json({ error: "Could not allocate a firm id, please retry" });
  await pool.query(
    "INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,'owner','active') ON CONFLICT (user_id, tenant_id) DO NOTHING",
    [req.user.id, tenant_id]
  );
  await pool.query(
    "INSERT INTO tenant_profile(tenant_id, company_name) VALUES($1,$2) ON CONFLICT (tenant_id) DO NOTHING",
    [tenant_id, String(req.body.company_name)]
  ).catch(() => {});
  require("../lib/audit").writeAudit(req.user.id, "firm.create", "tenant", tenant_id, { name: req.body.company_name });
  res.status(201).json({ ok: true, firm: { tenant_id, role: "owner", name: String(req.body.company_name) } });
});

// GET /auth/me
router.get("/me", authenticate, async (req, res) => {
  // When the user has switched into a membership firm (authenticate set switchedTenantId),
  // reflect that active firm's tenant/role/plan; otherwise report the home row unchanged.
  if (req.switchedTenantId) {
    return res.json({
      id: req.user.id, email: req.user.email, role: req.user.role,
      tenant_id: req.user.tenant_id, first_login: req.user.first_login,
      display_name: req.user.display_name, plan: req.user.subscription_plan || "free",
      locale: req.user.locale || null,
    });
  }
  const { rows } = await pool.query(
    "SELECT id, email, role, tenant_id, first_login, display_name, subscription_plan AS plan, locale FROM users WHERE id=$1",
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
  // Store the OTP in its own column - never overwrite `password` (doing so let
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

// PUT /auth/profile - update display name
router.put("/profile", authenticate, async (req, res) => {
  const { display_name } = req.body;
  if (!display_name || !display_name.trim()) return res.status(400).json({ error: "display_name required" });
  await pool.query(
    "UPDATE users SET display_name=$1 WHERE id=$2",
    [display_name.trim().slice(0, 64), req.user.id]
  );
  res.json({ ok: true });
});

// PUT /auth/locale - persist the user's UI language (#169 i18n) so it follows them
// across devices/logins. The frontend still writes localStorage for instant, no-flash
// startup; this makes the server the source of truth for a logged-in user.
const SUPPORTED_LOCALES = ["en", "hi", "mr", "bn", "ta", "te", "gu", "kn", "ml", "pa"];
router.put("/locale", authenticate, validateBody({
  locale: { type: "string", required: true, enum: SUPPORTED_LOCALES },
}), async (req, res) => {
  await pool.query("UPDATE users SET locale=$1 WHERE id=$2", [req.body.locale, req.user.id]);
  res.json({ ok: true, locale: req.body.locale });
});

// POST /auth/change-password - requires current password
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

// GET /auth/me - extend to include display_name
router.get("/me/profile", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, role, tenant_id, first_login, display_name FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json(rows[0]);
});

// ── MFA (opt-in TOTP) ─────────────────────────────────────────────────────────
const totp = require("../lib/totp");

// Status: is MFA on for this user, and how many backup codes remain.
router.get("/mfa/status", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT mfa_enabled, mfa_backup_codes FROM users WHERE id=$1", [req.user.id]);
  const u = rows[0] || {};
  res.json({ enabled: !!u.mfa_enabled, backup_codes_remaining: Array.isArray(u.mfa_backup_codes) ? u.mfa_backup_codes.length : 0 });
});

// Step 1 — generate a pending secret + otpauth URL (for the QR). NOT enabled until verified.
router.post("/mfa/setup", authenticate, async (req, res) => {
  const { rows } = await pool.query("SELECT email, mfa_enabled FROM users WHERE id=$1", [req.user.id]);
  if (rows[0] && rows[0].mfa_enabled) return res.status(409).json({ error: "MFA is already enabled. Disable it first to re-enroll." });
  const secret = totp.genSecret();
  await pool.query("UPDATE users SET mfa_secret_enc=$1, mfa_enabled=false WHERE id=$2", [totp.encSecret(secret), req.user.id]);
  res.json({ secret, otpauth_url: totp.otpauthURL(secret, rows[0] ? rows[0].email : req.user.id) });
});

// Step 2 — verify a code against the pending secret, then turn MFA on + issue backup codes (shown ONCE).
router.post("/mfa/enable", authenticate, async (req, res) => {
  const code = String((req.body && req.body.code) || "").trim();
  const { rows } = await pool.query("SELECT mfa_secret_enc, mfa_enabled FROM users WHERE id=$1", [req.user.id]);
  const u = rows[0] || {};
  if (u.mfa_enabled) return res.status(409).json({ error: "MFA is already enabled." });
  if (!u.mfa_secret_enc) return res.status(400).json({ error: "Start with /mfa/setup first." });
  if (!totp.verifyTotp(totp.decSecret(u.mfa_secret_enc), code)) return res.status(400).json({ error: "That code didn't match. Check your authenticator and try again." });
  const backup = totp.genBackupCodes();
  await pool.query("UPDATE users SET mfa_enabled=true, mfa_backup_codes=$1, mfa_last_totp_counter=0 WHERE id=$2", [backup.map(totp.hashBackup), req.user.id]);
  pool.query("INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,'mfa_enabled','user',$2,$3)", [req.user.id, req.user.id, { ip: req.ip }]).catch(() => {});
  res.set("Cache-Control", "no-store");
  res.json({ enabled: true, backup_codes: backup }); // shown once — the server only stores hashes
});

// Disable — requires the account PASSWORD plus a current code/backup code, so neither a
// hijacked session (no password) nor a glimpsed code alone can strip MFA.
router.post("/mfa/disable", authenticate, async (req, res) => {
  const code = String((req.body && req.body.code) || "").trim();
  const password = String((req.body && req.body.password) || "");
  const { rows } = await pool.query("SELECT password, mfa_secret_enc, mfa_enabled, mfa_backup_codes FROM users WHERE id=$1", [req.user.id]);
  const u = rows[0] || {};
  if (!u.mfa_enabled) return res.json({ enabled: false });
  if (!password || !(await bcrypt.compare(password, u.password))) return res.status(403).json({ error: "Enter your account password to disable MFA." });
  const okCode = (u.mfa_secret_enc && totp.verifyTotp(totp.decSecret(u.mfa_secret_enc), code)) ||
                 (Array.isArray(u.mfa_backup_codes) && u.mfa_backup_codes.includes(totp.hashBackup(code)));
  if (!okCode) return res.status(400).json({ error: "Enter a valid authenticator or backup code to disable MFA." });
  await pool.query("UPDATE users SET mfa_enabled=false, mfa_secret_enc=NULL, mfa_backup_codes='{}', mfa_last_totp_counter=0 WHERE id=$1", [req.user.id]);
  pool.query("INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,'mfa_disabled','user',$2,$3)", [req.user.id, req.user.id, { ip: req.ip }]).catch(() => {});
  res.json({ enabled: false });
});

module.exports = router;
