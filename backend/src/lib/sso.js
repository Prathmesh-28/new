"use strict";
// OIDC single sign-on (#188) — the gated framework. Each tenant configures its own IdP (issuer +
// client id/secret); without that, SSO is inert. Standard authorization-code flow: discover
// endpoints, build the auth URL with a signed short-lived state + nonce (CSRF/replay protection),
// exchange the code, read userinfo. No secrets are logged; client_secret is decrypted only here.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const fc = require("./fieldcrypto");

const STATE_SECRET = (process.env.JWT_SECRET || "dev-sso-state-change-in-prod");
// Public mailbox providers can't prove tenant ownership — never let a tenant claim them.
const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "icloud.com", "proton.me", "protonmail.com", "rediffmail.com", "aol.com"]);

const isConfigured = (c) => !!(c && c.enabled && c.issuer && c.client_id && c.client_secret);
const isPublicDomain = (d) => PUBLIC_DOMAINS.has(String(d || "").toLowerCase().trim());

async function getConfig(tenantId, { withSecret = false } = {}) {
  const { rows } = await pool.query("SELECT * FROM sso_config WHERE tenant_id=$1", [tenantId]);
  const c = rows[0];
  if (!c) return null;
  if (withSecret && c.client_secret) { try { c.client_secret = fc.decrypt(c.client_secret); } catch { c.client_secret = null; } }
  return c;
}
// Resolve which enabled tenant owns an email domain (for /sso/start). One tenant per domain.
async function configForDomain(domain) {
  const d = String(domain || "").toLowerCase().trim();
  if (!d || isPublicDomain(d)) return null;
  const { rows } = await pool.query("SELECT * FROM sso_config WHERE enabled=true AND $1 = ANY(allowed_domains) LIMIT 1", [d]);
  return rows[0] || null;
}

// Signed, short-lived state so the callback can trust the tenant + detect replay/CSRF.
function signState(tenantId) {
  const nonce = crypto.randomBytes(12).toString("hex");
  return jwt.sign({ tenant: tenantId, nonce, purpose: "sso-state" }, STATE_SECRET, { expiresIn: "10m" });
}
function verifyState(token) {
  const p = jwt.verify(token, STATE_SECRET);
  if (p.purpose !== "sso-state" || !p.tenant) throw new Error("Bad SSO state");
  return p;
}

// Cache the IdP's discovery doc briefly (issuer endpoints rarely change).
const _disc = new Map();
async function discover(issuer) {
  const key = issuer;
  const hit = _disc.get(key);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const url = issuer.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`OIDC discovery failed (${r.status})`);
    const doc = await r.json();
    _disc.set(key, { doc, exp: Date.now() + 3600000 });
    return doc;
  } finally { clearTimeout(timer); }
}

function buildAuthUrl(cfg, doc, { state, redirectUri }) {
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set("client_id", cfg.client_id);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

async function exchangeCode(cfg, doc, code, redirectUri) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: cfg.client_id, client_secret: cfg.client_secret });
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(doc.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.error || `Token exchange failed (${r.status})`);
    return data; // { access_token, id_token, ... }
  } finally { clearTimeout(timer); }
}

async function fetchUserinfo(doc, accessToken) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(doc.userinfo_endpoint, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Userinfo failed (${r.status})`);
    return data; // { email, name, email_verified, ... }
  } finally { clearTimeout(timer); }
}

module.exports = { isConfigured, isPublicDomain, getConfig, configForDomain, signState, verifyState, discover, buildAuthUrl, exchangeCode, fetchUserinfo, encryptSecret: (s) => fc.encrypt(s) };
