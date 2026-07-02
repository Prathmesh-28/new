const { verifyAccess } = require("../lib/jwt");
const { pool } = require("../db");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = verifyAccess(token);
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    req.user = rows[0];

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

module.exports = { authenticate, requireAdmin, requireOwnerOrAdmin, audit };
