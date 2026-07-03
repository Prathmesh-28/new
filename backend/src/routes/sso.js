"use strict";
// SSO (#188) REST. Owner config (session-authed) + the public OIDC authorization-code flow
// (/start → IdP → /callback). Security: signed short-lived state (CSRF/replay), the SSO email's
// domain MUST be in the tenant's allowed_domains, an existing email MUST already belong to that
// tenant (email is globally unique, so no cross-tenant takeover), and JIT users get an unusable
// random password. The existing password login is completely untouched.
const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { signAccess, signRefresh } = require("../lib/jwt");
const sso = require("../lib/sso");

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const callbackUri = (req) => `${req.protocol}://${req.get("host")}/api/sso/callback`;
const frontend = () => (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const bounce = (res, req, hash) => res.redirect(`${frontend() || ""}${hash}`);

// ── Owner config (session-authed) ──
router.get("/config", authenticate, async (req, res) => {
  try {
    const c = await sso.getConfig(tenantOf(req));
    if (!c) return res.json({ enabled: false, allowed_domains: [], default_role: "finance_manager", jit_provision: true });
    res.json({ enabled: c.enabled, issuer: c.issuer, client_id: c.client_id, has_secret: !!c.client_secret, allowed_domains: c.allowed_domains, default_role: c.default_role, jit_provision: c.jit_provision });
  } catch (e) { console.error("[sso]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.put("/config", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const domains = (Array.isArray(b.allowed_domains) ? b.allowed_domains : String(b.allowed_domains || "").split(","))
      .map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    const bad = domains.find((d) => sso.isPublicDomain(d));
    if (bad) return res.status(400).json({ error: `Can't use a public email domain (${bad}) — SSO domains must be ones your organisation owns.` });
    if (b.enabled && (!b.issuer || !b.client_id || (!b.client_secret && !(await sso.getConfig(tenantOf(req)))?.client_secret)))
      return res.status(400).json({ error: "issuer, client_id and client_secret are required to enable SSO." });
    // Keep the existing secret if the client didn't send a new one.
    const existing = await sso.getConfig(tenantOf(req));
    const secretEnc = b.client_secret ? sso.encryptSecret(String(b.client_secret)) : (existing ? existing.client_secret : null);
    await pool.query(
      `INSERT INTO sso_config(tenant_id, issuer, client_id, client_secret, allowed_domains, default_role, jit_provision, enabled, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (tenant_id) DO UPDATE SET issuer=$2, client_id=$3, client_secret=$4, allowed_domains=$5, default_role=$6, jit_provision=$7, enabled=$8, updated_at=now()`,
      [tenantOf(req), b.issuer || null, b.client_id || null, secretEnc, domains, b.default_role || "finance_manager", b.jit_provision !== false, !!b.enabled]);
    res.json({ ok: true });
  } catch (e) { console.error("[sso]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Public OIDC flow ──
// Start: resolve the tenant that owns the email domain, then redirect to its IdP.
router.get("/start", async (req, res) => {
  try {
    const domain = String(req.query.email || "").split("@")[1] || String(req.query.domain || "");
    const cfg = await sso.configForDomain(domain);
    if (!sso.isConfigured(cfg)) return bounce(res, req, "/login?sso_error=not_configured");
    const cfgFull = await sso.getConfig(cfg.tenant_id, { withSecret: true });
    const doc = await sso.discover(cfgFull.issuer);
    const url = sso.buildAuthUrl(cfgFull, doc, { state: sso.signState(cfg.tenant_id), redirectUri: callbackUri(req) });
    res.redirect(url);
  } catch (e) { console.error("[sso start]", e.message); bounce(res, req, "/login?sso_error=start_failed"); }
});
// Callback: verify state, exchange code, provision/authenticate, issue app tokens.
router.get("/callback", async (req, res) => {
  try {
    if (req.query.error) return bounce(res, req, `/login?sso_error=${encodeURIComponent(String(req.query.error).slice(0, 40))}`);
    const st = sso.verifyState(String(req.query.state || ""));
    const cfg = await sso.getConfig(st.tenant, { withSecret: true });
    if (!sso.isConfigured(cfg)) return bounce(res, req, "/login?sso_error=not_configured");
    const doc = await sso.discover(cfg.issuer);
    const tokens = await sso.exchangeCode(cfg, doc, String(req.query.code || ""), callbackUri(req));
    const info = await sso.fetchUserinfo(doc, tokens.access_token);
    const email = String(info.email || "").toLowerCase().trim();
    if (!email) return bounce(res, req, "/login?sso_error=no_email");
    const domain = email.split("@")[1];
    if (!(cfg.allowed_domains || []).includes(domain)) return bounce(res, req, "/login?sso_error=domain_not_allowed");

    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    let user = rows[0];
    if (user) {
      // Email is globally unique → its tenant is fixed. Only allow SSO into the owning tenant.
      if (user.tenant_id !== st.tenant) return bounce(res, req, "/login?sso_error=wrong_workspace");
    } else {
      if (!cfg.jit_provision) return bounce(res, req, "/login?sso_error=no_account");
      const unusable = await bcrypt.hash("sso:" + crypto.randomBytes(24).toString("hex"), 10); // password login impossible for SSO users
      const ins = await pool.query(
        "INSERT INTO users(email, password, role, tenant_id, first_login, full_name) VALUES($1,$2,$3,$4,false,$5) RETURNING *",
        [email, unusable, cfg.default_role || "finance_manager", st.tenant, info.name || info.given_name || null]);
      user = ins.rows[0];
      await pool.query("INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id, tenant_id) DO NOTHING", [user.id, st.tenant, user.role]);
    }
    require("../modules/analytics").track(user.tenant_id, user.id, { event: "login", props: { via: "sso" } }).catch(() => {});
    const payload = { sub: user.id, role: user.role, tenant: user.tenant_id };
    const access = signAccess(payload), refresh = signRefresh(payload);
    bounce(res, req, `/sso-callback#access=${access}&refresh=${refresh}`);
  } catch (e) { console.error("[sso callback]", e.message); bounce(res, req, "/login?sso_error=callback_failed"); }
});

module.exports = router;
