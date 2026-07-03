"use strict";
// Public-API auth: authenticate a request by its API key (X-API-Key or Bearer), resolve the
// tenant + scopes, and apply a simple per-key rate limit. Distinct from the session `authenticate`
// middleware (JWT for the app). Sets req.apiTenant / req.apiScopes for the /api/v1 routes.
const apiKeys = require("../lib/apiKeys");

const LIMIT = Number(process.env.API_RATE_LIMIT_PER_MIN || 120);
const buckets = new Map(); // keyId → { count, resetAt }

function rateLimited(keyId) {
  const now = Date.now();
  let b = buckets.get(keyId);
  if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + 60000 }; buckets.set(keyId, b); }
  b.count += 1;
  return { limited: b.count > LIMIT, remaining: Math.max(0, LIMIT - b.count), resetAt: b.resetAt };
}

async function apiKeyAuth(req, res, next) {
  const raw = req.get("X-API-Key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!raw) return res.status(401).json({ error: "Missing API key. Send it as 'X-API-Key: <key>' or 'Authorization: Bearer <key>'." });
  let k;
  try { k = await apiKeys.resolveKey(raw); } catch { return res.status(500).json({ error: "Auth check failed" }); }
  if (!k) return res.status(401).json({ error: "Invalid or revoked API key." });
  const rl = rateLimited(k.id);
  res.set("X-RateLimit-Limit", String(LIMIT));
  res.set("X-RateLimit-Remaining", String(rl.remaining));
  res.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
  if (rl.limited) return res.status(429).json({ error: `Rate limit exceeded (${LIMIT}/min). Retry after the reset.` });
  req.apiTenant = k.tenantId;
  req.apiScopes = k.scopes;
  next();
}

// Guard a route by scope, e.g. requireScope("write").
const requireScope = (scope) => (req, res, next) =>
  (req.apiScopes || []).includes(scope) ? next() : res.status(403).json({ error: `This key lacks the '${scope}' scope.` });

module.exports = { apiKeyAuth, requireScope };
