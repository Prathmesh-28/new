const { verifyAccess } = require("../lib/jwt");
const { pool } = require("../db");
// Per-process caches for the IP allowlist check: policy per tenant (60s) and a violation
// throttle, so monitor mode can't flood the logs.
const ipAllowlistCache = new Map();
const ipViolationSeen = new Map();

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = verifyAccess(token);
    // The session's revocation state rides along on the query this middleware already ran,
    // so "sign out everywhere" takes effect on the NEXT request rather than up to 15
    // minutes later when the access token happens to expire — and it costs no extra
    // round-trip. Tokens minted before sessions existed (no sid) simply have no row and
    // keep working until they expire.
    const { rows } = await pool.query(
      `SELECT u.*, s.revoked_at AS session_revoked_at, s.id AS session_id
         FROM users u
         LEFT JOIN user_sessions s ON s.id = $2::uuid AND s.user_id = u.id
        WHERE u.id = $1`,
      [payload.sub, payload.sid || null]
    );
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    if (payload.sid && rows[0].session_id && rows[0].session_revoked_at) {
      return res.status(401).json({ error: "That session was signed out. Please sign in again.", code: "SESSION_REVOKED" });
    }
    req.sessionId = payload.sid || null;
    req.user = rows[0];

    // ── IP allowlist (Wave 18) ────────────────────────────────────────────────
    // Owner-set, per firm. Ships in MONITOR mode: violations are logged and alerted but
    // not blocked, because a fat-fingered entry in enforce mode locks the whole firm out.
    // Enforcement is an explicit second step in Settings. Matching is exact IP or prefix
    // ("103.25." matches 103.25.x.x) — documented, deliberately simpler than CIDR.
    try {
      const tenantId = req.user.tenant_id;
      const cached = ipAllowlistCache.get(tenantId);
      let policy = cached && cached.at > Date.now() - 60_000 ? cached.policy : null;
      if (!policy) {
        const { rows: p } = await pool.query(
          "SELECT ip_allowlist, ip_allowlist_mode FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
        policy = { list: p[0]?.ip_allowlist || [], mode: p[0]?.ip_allowlist_mode || "monitor" };
        ipAllowlistCache.set(tenantId, { at: Date.now(), policy });
      }
      if (policy.list.length) {
        const ip = String(req.ip || "").replace(/^::ffff:/, "");
        const ok = policy.list.some((e) => ip === e || (e.endsWith(".") && ip.startsWith(e)) || (e.endsWith("*") && ip.startsWith(e.slice(0, -1))));
        if (!ok) {
          if (policy.mode === "enforce") {
            return res.status(403).json({ error: "This firm only allows sign-ins from approved network addresses.", code: "IP_NOT_ALLOWED" });
          }
          // monitor: visible, throttled to one log per user+ip per 10 minutes.
          const k = `${req.user.id}:${ip}`;
          if (!ipViolationSeen.has(k) || ipViolationSeen.get(k) < Date.now() - 600_000) {
            ipViolationSeen.set(k, Date.now());
            console.warn(`[ip-allowlist] ${req.user.email} from ${ip} is outside ${tenantId}'s allowlist (monitor mode)`);
          }
        }
      }
    } catch { /* the allowlist must never take down auth itself */ }

    // ── Super-admin impersonation ("ombudsman" god-mode) ───────────────────────
    // When the platform owner opens a tenant from the admin console, the client
    // sends X-Tenant-Id. We transparently make EVERY downstream route act on that
    // tenant (read AND write), without touching each route - they all read
    // req.user.tenant_id. STRICTLY gated: only a real super_admin, only when the
    // target differs. Mutations are recorded in audit_log for accountability.
    const target = req.headers["x-tenant-id"];
    if (target && rows[0].role === "super_admin" && String(target) !== rows[0].tenant_id) {
      req.realTenantId = rows[0].tenant_id;
      req.impersonatedTenantId = String(target);
      req.user = { ...rows[0], tenant_id: String(target) };
      // Reflect the impersonated tenant's plan so entitlement checks gate on THEIR
      // plan, not the admin's (else a super_admin would mis-gate the tenant).
      try { req.user.subscription_plan = await require("../lib/plans").tenantPlan(String(target)); } catch { req.user.subscription_plan = "free"; }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.on("finish", () => {
          if (res.statusCode < 400) {
            pool.query(
              "INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,$2,$3,$4,$5)",
              [rows[0].id, "impersonated_write", "tenant", String(target), { method: req.method, path: req.path, realTenant: rows[0].tenant_id }]
            ).catch(() => {});
          }
        });
      }
    } else {
      // ── Multi-firm switch (#197) ─────────────────────────────────────────────
      // A member (not super_admin) selects an active firm via X-Active-Tenant. It is
      // honored ONLY when an active tenant_memberships row exists for (user, target) —
      // verified here on EVERY request, never trusted from the header/token alone. No
      // membership row ⇒ the header is silently ignored and the user stays on their home
      // firm (exactly how a non-super_admin's X-Tenant-Id is dropped above). The role
      // is taken from the membership row, so a user's reach in the target firm is that
      // firm's assigned role — never their role elsewhere.
      const active = req.headers["x-active-tenant"];
      if (active && String(active) !== rows[0].tenant_id) {
        const m = await pool.query(
          "SELECT role FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2 AND status='active'",
          [rows[0].id, String(active)]
        );
        if (m.rows[0]) {
          req.realTenantId = rows[0].tenant_id;
          req.switchedTenantId = String(active);
          req.user = { ...rows[0], tenant_id: String(active), role: m.rows[0].role };
          // Gate entitlements on the TARGET firm's plan, not the user's home plan.
          try { req.user.subscription_plan = await require("../lib/plans").tenantPlan(String(active)); } catch { req.user.subscription_plan = "free"; }
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.on("finish", () => {
              if (res.statusCode < 400) {
                pool.query(
                  "INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,$2,$3,$4,$5)",
                  [rows[0].id, "member_switch_write", "tenant", String(active), { method: req.method, path: req.path, realTenant: rows[0].tenant_id, role: m.rows[0].role }]
                ).catch(() => {});
              }
            });
          }
        }
      }
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  next();
}

function requireOwnerOrAdmin(req, res, next) {
  if (!["super_admin", "owner"].includes(req.user?.role)) return res.status(403).json({ error: "Forbidden" });
  next();
}

async function audit(action, entity, entityId) {
  return (req, res, next) => {
    res.on("finish", async () => {
      if (res.statusCode < 400 && req.user) {
        try {
          await pool.query(
            "INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,$2,$3,$4,$5)",
            [req.user.id, action, entity, entityId || null, { method: req.method, path: req.path }]
          );
        } catch {}
      }
    });
    next();
  };
}


// ── Step-up gate (Wave 18) ─────────────────────────────────────────────────────
// For the handful of actions with no undo. The session must have re-entered the password
// (POST /auth/reauth) within the last 10 minutes; the client treats REAUTH_REQUIRED as
// "show the password prompt, then retry".
function requireFreshAuth(req, res, next) {
  // Pre-session tokens can't be elevated; the honest answer is to sign in again once.
  if (!req.sessionId) return res.status(403).json({ error: "Confirm your password to do this.", code: "REAUTH_REQUIRED" });
  pool.query("SELECT elevated_until FROM user_sessions WHERE id=$1", [req.sessionId])
    .then(({ rows }) => {
      if (rows[0]?.elevated_until && new Date(rows[0].elevated_until) > new Date()) return next();
      res.status(403).json({ error: "Confirm your password to do this.", code: "REAUTH_REQUIRED" });
    })
    .catch(next);
}

module.exports = { authenticate, requireAdmin, requireOwnerOrAdmin, audit, requireFreshAuth };
