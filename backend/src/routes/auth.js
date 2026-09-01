const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { pool } = require("../db");
const { signAccess, signRefresh, verifyRefresh } = require("../lib/jwt");
const jwt = require("jsonwebtoken");
// Device-trust tokens get their own derived secret, so neither access nor refresh tokens
// can ever be replayed as one.
const MFA_TRUST_SECRET = crypto.createHash("sha256").update("hr-mfa-trust:" + (process.env.JWT_SECRET || "dev-secret-change-in-prod")).digest("hex");
const { authenticate } = require("../middleware/auth");
const { sendOtp, sendWelcome, sendPasswordResetSuccess, sendMail } = require("../lib/email");
const { writeAudit } = require("../lib/audit");
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

  // Email verification (B2 gap audit 2026-07): gate full access on proving control of the
  // address, but ONLY when SMTP is actually configured — without it the OTP would never
  // arrive and every signup would brick. Same "gated, never fake/broken" rule as every other
  // credentialed integration in this codebase.
  const emailConfigured = !!process.env.SMTP_USER;
  let otpHash = null, otpExpiry = null, otp = null;
  if (emailConfigured) {
    otp = crypto.randomInt(100000, 999999).toString();
    otpHash = await bcrypt.hash(otp, 10);
    otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  }

  const { rows } = await pool.query(
    `INSERT INTO users(email,password,role,tenant_id,first_login,email_verified,email_verify_otp,email_verify_otp_expiry)
     VALUES($1,$2,$3,$4,false,$5,$6,$7) RETURNING id,email,role,tenant_id,first_login,email_verified`,
    [email.toLowerCase(), hash, role, tenant_id, !emailConfigured, otpHash, otpExpiry]
  );
  const user = rows[0];

  if (emailConfigured) {
    await sendOtp({ to: user.email, otp });
    return res.status(201).json({ verify_required: true, email: user.email });
  }

  await finishSignup(user);
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.status(201).json({ access: signAccess(payload), refresh: signRefresh(payload), user });
});

// Side effects that must only happen once an account is actually usable (i.e. after
// verification, or immediately when verification is skipped because SMTP isn't
// configured) — never for an unverified signup attempt that may never complete.
async function finishSignup(user) {
  // Record the founding membership (owner of their own new firm) so the multi-firm
  // switcher (#197) lists it. users.tenant_id remains the home firm.
  await pool.query(
    "INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id, tenant_id) DO NOTHING",
    [user.id, user.tenant_id, user.role]
  ).catch(() => {});
  // 14-day trial of the flagship (Growth) plan - the pricing page's headline offer.
  // ON CONFLICT DO NOTHING inside startTrial makes this safe to call once per tenant.
  await require("../lib/billingLifecycle").startTrial(user.tenant_id).catch((e) => console.error("[signup] trial start failed:", e.message));
  require("../modules/analytics").track(user.tenant_id, user.id, { event: "signup_completed", props: { role: user.role } }).catch(() => {});
}

// POST /auth/verify-signup - complete signup by proving control of the email (B2)
router.post("/verify-signup", async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: "Email and code required" });
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(400).json({ error: "Invalid or expired code" });
  if (user.email_verified) return res.status(409).json({ error: "This account is already verified — sign in instead." });
  if (!user.email_verify_otp || !user.email_verify_otp_expiry || new Date(user.email_verify_otp_expiry) < new Date()) {
    return res.status(400).json({ error: "This code has expired. Request a new one." });
  }
  const ok = await bcrypt.compare(String(otp), user.email_verify_otp);
  if (!ok) return res.status(400).json({ error: "Invalid or expired code" });

  await pool.query(
    "UPDATE users SET email_verified=true, email_verify_otp=NULL, email_verify_otp_expiry=NULL WHERE id=$1",
    [user.id]
  );
  await finishSignup(user);
  const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  res.json({
    access: signAccess(payload), refresh: signRefresh(payload),
    user: { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, first_login: user.first_login },
  });
});

// POST /auth/resend-signup-otp - re-send the verification code (60s cooldown)
router.post("/resend-signup-otp", async (req, res) => {
  const { email } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [(email || "").toLowerCase()]);
  const user = rows[0];
  if (!user || user.email_verified) return res.json({ ok: true }); // don't leak existence/state
  if (user.email_verify_otp_expiry && new Date(user.email_verify_otp_expiry).getTime() - Date.now() > 9 * 60 * 1000) {
    return res.status(429).json({ error: "A code was just sent — check your inbox (or wait a minute to resend)." });
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  await pool.query(
    "UPDATE users SET email_verify_otp=$1, email_verify_otp_expiry=$2 WHERE id=$3",
    [await bcrypt.hash(otp, 10), new Date(Date.now() + 10 * 60 * 1000).toISOString(), user.id]
  );
  await sendOtp({ to: user.email, otp });
  res.json({ ok: true });
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
    // Remember-device (Wave 18): a signed trust token from a previous successful code
    // skips the OTP prompt on THIS device for 30 days. The password is still required
    // every login — trust replaces the second factor's prompt, never the first factor.
    // mfa_trust_version lets "sign out everywhere"-grade recovery invalidate all trusted
    // devices at once by bumping the counter.
    let trusted = false;
    const trustToken = String((req.body && req.body.mfa_trust) || "").trim();
    if (!code && trustToken) {
      try {
        const p = jwt.verify(trustToken, MFA_TRUST_SECRET);
        trusted = p.typ === "mfa_trust" && p.sub === user.id && Number(p.v) === Number(user.mfa_trust_version || 1);
      } catch { trusted = false; }
    }
    if (!code && !trusted) return res.status(401).json({ error: "Enter your authenticator code.", mfa_required: true });
    if (!code && trusted) { /* second factor satisfied by device trust; fall through */ }
    else {
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
      // Anti-replay: matched is only in scope on the code path — a trusted device never
      // consumed a TOTP step, so there is nothing to burn.
      if (matched > 0) await pool.query("UPDATE users SET mfa_last_totp_counter=$1 WHERE id=$2", [matched, user.id]);
    }
  }

  // Password (and MFA) are correct but the signup email was never verified. Only enforce
  // if SMTP is still configured today — if it was turned off after this account signed up,
  // fail OPEN rather than lock someone out with no way to ever receive a code. Auto-resend
  // a fresh code so the frontend can drop them straight into the verify screen.
  if (!user.email_verified && process.env.SMTP_USER) {
    if (!user.email_verify_otp_expiry || new Date(user.email_verify_otp_expiry) < new Date()) {
      const otp = crypto.randomInt(100000, 999999).toString();
      await pool.query(
        "UPDATE users SET email_verify_otp=$1, email_verify_otp_expiry=$2 WHERE id=$3",
        [await bcrypt.hash(otp, 10), new Date(Date.now() + 10 * 60 * 1000).toISOString(), user.id]
      );
      await sendOtp({ to: user.email, otp });
    }
    return res.status(403).json({ error: "Verify your email to continue — we've sent a fresh code.", verify_required: true, email: user.email });
  }

  const firstLogin = viaResetOtp ? true : user.first_login;
  await pool.query(
    `UPDATE users SET failed_attempts=0, locked_until=NULL, reset_otp=NULL, reset_otp_expiry=NULL,
            first_login=$2, last_login_at=now(), last_active_at=now(), login_count=COALESCE(login_count,0)+1
     WHERE id=$1`,
    [user.id, firstLogin]
  );
  require("../modules/analytics").track(user.tenant_id, user.id, { event: "login" }).catch(() => {});
  pool.query(
    "INSERT INTO login_events(user_id, tenant_id, ip, user_agent) VALUES($1,$2,$3,$4)",
    [user.id, user.tenant_id, req.ip || null, (req.headers["user-agent"] || "").slice(0, 300)]
  ).catch(() => {});
  // A session row per sign-in: it is what makes "where am I signed in?" and "log out
  // everywhere" possible at all, and it lets a replayed refresh token be spotted.
  const sessions = require("../lib/sessions");
  const { isNew, label } = await sessions.isNewDevice(user.id, req.headers["user-agent"]);
  const basePayload = { sub: user.id, role: user.role, tenant: user.tenant_id };
  // The session id has to be inside the refresh token, so the token is minted first with a
  // placeholder-free two-step: create the row, then sign with its id.
  const session = await sessions.createSession({
    userId: user.id, tenantId: user.tenant_id, ip: req.ip,
    userAgent: req.headers["user-agent"], refreshToken: "pending",
  });
  const payload = { ...basePayload, sid: session.id };
  const refreshToken = signRefresh(payload);
  await pool.query("UPDATE user_sessions SET refresh_hash=$2 WHERE id=$1", [session.id, sessions.hash(refreshToken)]);

  pool.query("UPDATE login_events SET session_id=$2, new_device=$3 WHERE user_id=$1 AND session_id IS NULL",
    [user.id, session.id, isNew]).catch(() => {});

  // Tell the account owner when their credentials are used somewhere new. login_events has
  // been recorded for months and shown to nobody.
  if (isNew) {
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    sendMail({
      to: user.email,
      subject: "New sign-in to your Headroom account",
      html: `<p>Your Headroom account was signed in to from a device we haven't seen before.</p>
             <p><strong>${label}</strong><br>${when} (IST)${req.ip ? `<br>IP ${req.ip}` : ""}</p>
             <p>If this was you, nothing to do. If it wasn't, change your password and use
             <strong>Sign out everywhere</strong> in Settings → Security straight away.</p>`,
    }).catch(() => { /* a missed alert must never block a valid sign-in */ });
  }

  // Hand back a device-trust token only when 2FA was actually passed this login and the
  // user asked to be remembered on this device.
  let mfaTrust;
  if (user.mfa_enabled && req.body?.remember_device && String(req.body?.mfa_code || "").trim()) {
    mfaTrust = jwt.sign({ sub: user.id, typ: "mfa_trust", v: Number(user.mfa_trust_version || 1) }, MFA_TRUST_SECRET, { expiresIn: "30d" });
  }

  res.json({
    access:  signAccess(payload),
    refresh: refreshToken,
    mfa_trust: mfaTrust,
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
    const sessions = require("../lib/sessions");

    // Tokens minted before sessions existed have no sid. Rather than force everyone to
    // sign in again on deploy, they are honoured once and upgraded to a real session.
    if (!payload.sid) {
      const session = await sessions.createSession({
        userId: u.id, tenantId: u.tenant_id, ip: req.ip,
        userAgent: req.headers["user-agent"], refreshToken: "pending",
      });
      const p = { sub: u.id, role: u.role, tenant: u.tenant_id, sid: session.id };
      const newRefresh = signRefresh(p);
      await pool.query("UPDATE user_sessions SET refresh_hash=$2 WHERE id=$1", [session.id, sessions.hash(newRefresh)]);
      return res.json({ access: signAccess(p), refresh: newRefresh });
    }

    const p = { sub: u.id, role: u.role, tenant: u.tenant_id, sid: payload.sid };
    const newRefresh = signRefresh(p);
    const check = await sessions.rotate({ sessionId: payload.sid, presentedToken: refresh, newToken: newRefresh, ip: req.ip });
    if (!check.ok) {
      const why = {
        reuse:   "This session was ended for security — that sign-in token had already been used. Please sign in again.",
        revoked: "That session was signed out. Please sign in again.",
        expired: "That session expired. Please sign in again.",
        missing: "Please sign in again.",
      }[check.reason];
      return res.status(401).json({ error: why, code: check.reason.toUpperCase() });
    }
    res.json({ access: signAccess(p), refresh: newRefresh });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

// POST /auth/logout - stateless, client drops tokens
// POST /auth/logout — ends the session server-side, not just in the client's storage.
// It used to be a no-op, so a token copied off a shared machine kept working for 7 days
// after the user "logged out".
router.post("/logout", async (req, res) => {
  try {
    const token = req.body?.refresh;
    if (token) {
      const p = require("../lib/jwt").verifyRefresh(token);
      if (p?.sid) await require("../lib/sessions").revoke(p.sid, "signed out");
    }
  } catch { /* an unreadable token is already useless */ }
  res.json({ ok: true });
});

// ── Step-up auth (Wave 18) ───────────────────────────────────────────────────
// Re-enter the password, get 10 minutes of "elevated" on THIS session. The handful of
// actions with no undo (permanent purge, sign-out-everywhere) demand it via
// requireFreshAuth — so a walked-away-from laptop can't perform them.
router.post("/reauth", authenticate, async (req, res, next) => {
  try {
    const { rows: [u] } = await pool.query("SELECT password FROM users WHERE id=$1", [req.user.id]);
    if (!u || !(await bcrypt.compare(String(req.body?.password || ""), u.password)))
      return res.status(403).json({ error: "That password didn't match", errors: { password: "Wrong password" } });
    if (!req.sessionId) return res.status(400).json({ error: "This session predates step-up auth — sign in again once and it will work." });
    await pool.query("UPDATE user_sessions SET elevated_until = now() + interval '10 minutes' WHERE id=$1", [req.sessionId]);
    writeAudit(req.user.id, "reauth", "user", req.user.id, null, req.user.tenant_id);
    res.json({ ok: true, elevated_for_seconds: 600 });
  } catch (e) { next(e); }
});

// ── Change the sign-in email (Wave 14) ──────────────────────────────────────
// There was no way to change your email at all. Two steps, both mandatory:
//   1. prove you are you (current password),
//   2. prove the NEW address is yours (OTP sent to it) — before it becomes the login.
// The old address is notified either way, because a silent email change is exactly what
// an account thief does first.
router.post("/change-email", authenticate, async (req, res, next) => {
  try {
    const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) return res.status(400).json({ error: "That doesn't look like an email address", errors: { newEmail: "Check the address" } });
    const { rows: [u] } = await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id]);
    if (!u || !(await bcrypt.compare(password, u.password))) return res.status(403).json({ error: "Your current password didn't match", errors: { password: "Wrong password" } });
    if (newEmail === u.email) return res.status(400).json({ error: "That's already your email" });
    const taken = await pool.query("SELECT 1 FROM users WHERE lower(email)=$1", [newEmail]);
    if (taken.rows[0]) return res.status(409).json({ error: "That address is already used by another account" });

    const otp = crypto.randomInt(100000, 999999).toString();
    await pool.query(
      "UPDATE users SET pending_email=$2, pending_email_otp=$3, pending_email_otp_expiry=now() + interval '15 minutes' WHERE id=$1",
      [u.id, newEmail, await bcrypt.hash(otp, 10)]);
    await sendMail({ to: newEmail, subject: "Confirm your new Headroom email",
      html: `<p>Enter this code in Headroom to make <strong>${newEmail}</strong> your sign-in email:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>It expires in 15 minutes. If you didn't ask for this, ignore it — nothing changes without the code.</p>` });
    res.json({ ok: true, sent_to: newEmail });
  } catch (e) { next(e); }
});

router.post("/confirm-change-email", authenticate, async (req, res, next) => {
  try {
    const otp = String(req.body?.otp || "").trim();
    const { rows: [u] } = await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id]);
    if (!u?.pending_email || !u.pending_email_otp) return res.status(400).json({ error: "There's no email change in progress" });
    if (new Date(u.pending_email_otp_expiry) < new Date()) return res.status(400).json({ error: "That code expired — start again" });
    if (!(await bcrypt.compare(otp, u.pending_email_otp))) return res.status(400).json({ error: "That code isn't right", errors: { otp: "Check the code" } });

    const oldEmail = u.email;
    await pool.query(
      "UPDATE users SET email=$2, pending_email=NULL, pending_email_otp=NULL, pending_email_otp_expiry=NULL WHERE id=$1",
      [u.id, u.pending_email]);
    writeAudit(u.id, "email_changed", "user", u.id, { from: oldEmail, to: u.pending_email }, u.tenant_id);
    // Tell the OLD address — the person a thief locked out deserves to find out immediately.
    sendMail({ to: oldEmail, subject: "Your Headroom sign-in email was changed",
      html: `<p>Your sign-in email was changed to <strong>${u.pending_email}</strong>. If this was you, no action needed. If it wasn't, reply to this email straight away and change your password from a device where you're still signed in.</p>` }).catch(() => {});
    res.json({ ok: true, email: u.pending_email });
  } catch (e) { next(e); }
});

// ── GET /auth/sessions — where am I signed in? ──────────────────────────────
router.get("/sessions", authenticate, async (req, res, next) => {
  try {
    const rows = await require("../lib/sessions").list(req.user.id);
    res.json(rows.map((r) => ({ ...r, current: r.id === req.sessionId })));
  } catch (e) { next(e); }
});

// DELETE /auth/sessions/:id — end one device.
router.delete("/sessions/:id", authenticate, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE user_sessions SET revoked_at=now(), revoked_reason='ended by user' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
      [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: "That session is already ended" });
    writeAudit(req.user.id, "session_revoked", "session", req.params.id, null, req.user.tenant_id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /auth/sessions/revoke-all — sign out everywhere. Keeps the current device unless
// asked otherwise, because signing yourself out while trying to secure the account is a
// surprise, not a feature.
router.post("/sessions/revoke-all", authenticate, require("../middleware/auth").requireFreshAuth, async (req, res, next) => {
  try {
    const keepCurrent = req.body?.keepCurrent !== false;
    const n = await require("../lib/sessions").revokeAll(req.user.id, {
      exceptSessionId: keepCurrent ? req.sessionId : null,
      reason: "signed out everywhere by the user",
    });
    writeAudit(req.user.id, "sessions_revoked_all", "user", req.user.id, { count: n }, req.user.tenant_id);
    res.json({ ended: n });
  } catch (e) { next(e); }
});

// GET /auth/login-history — recorded since forever, shown to the account owner for the
// first time.
router.get("/login-history", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, ip, user_agent, new_device, created_at FROM login_events
        WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    const { deviceLabel } = require("../lib/sessions");
    res.json(rows.map((r) => ({ ...r, device_label: deviceLabel(r.user_agent) })));
  } catch (e) { next(e); }
});

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
  const { rows } = await pool.query(
    "UPDATE users SET password=$1, first_login=false WHERE id=$2 RETURNING email, display_name",
    [hash, req.user.id]
  );
  if (rows[0]) sendPasswordResetSuccess({ to: rows[0].email, name: rows[0].display_name }).catch(() => {});
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
  sendPasswordResetSuccess({ to: req.user.email, name: req.user.display_name }).catch(() => {});
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
