"use strict";
// Cloudflare Turnstile verification for auth endpoints (signup/login).
// GATED: if TURNSTILE_SECRET is not set this is a NO-OP (returns ok), so the app
// keeps working unchanged until you create a Turnstile widget and add the keys.
// The frontend sends the token in the `cf-turnstile-response` header.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const isConfigured = () => !!(process.env.TURNSTILE_SECRET && String(process.env.TURNSTILE_SECRET).trim());

// Returns { ok, skipped?, codes? }. ok=true when not configured (no-op) or when
// Cloudflare confirms a human; ok=false only when configured AND the token is
// missing/invalid.
async function verifyTurnstile(token, remoteip) {
  if (!isConfigured()) return { ok: true, skipped: true };
  if (!token) return { ok: false, codes: ["missing-input-response"] };
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: String(token) });
    if (remoteip) body.append("remoteip", String(remoteip));
    const r = await fetch(SITEVERIFY, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await r.json().catch(() => ({}));
    return { ok: !!data.success, codes: data["error-codes"] || [] };
  } catch (e) {
    // Fail OPEN on a network error to Cloudflare so a Turnstile outage can't lock
    // every user out of login. (Bots are still blocked by the WAF + rate limits.)
    try { console.warn("[turnstile] verify failed, allowing:", e.message); } catch {}
    return { ok: true, degraded: true };
  }
}

// Express guard usable at the top of a handler.
async function requireHuman(req, res) {
  const ts = await verifyTurnstile(req.headers["cf-turnstile-response"], req.ip);
  if (!ts.ok) { res.status(403).json({ error: "Verification failed - please complete the challenge and try again." }); return false; }
  return true;
}

module.exports = { verifyTurnstile, requireHuman, isConfigured };
