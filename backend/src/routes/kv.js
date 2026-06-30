const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { verifyAccess } = require("../lib/jwt");
const { subscribe, publish } = require("../lib/realtime");

// Must stay in sync with src/data/types.ts ROLE_NAMESPACES - otherwise a role
// gets 403 on its own data and the app silently fails to load/save for them.
const ROLE_NAMESPACES = {
  super_admin:        ["app", "forecast", "credit", "capital", "operations"],
  owner:              ["app", "forecast", "credit", "capital", "operations"],
  finance_manager:    ["app", "forecast", "credit", "operations"],
  accountant:         ["app", "forecast", "operations"],
  sales:              ["app"],
  operations_manager: ["app", "operations"],
  viewer:             ["app", "forecast"],
  investor:           ["app", "capital"],
};

function canAccess(role, ns) {
  return (ROLE_NAMESPACES[role] || []).includes(ns);
}

// Roles that may read their namespaces but must never write/delete, enforced
// server-side so a viewer can't mutate data by hitting the API directly.
const READONLY_ROLES = ["viewer"];

// Writes: a user writes their own tenant; only a super_admin may target another
// tenant (advisors stay read-only on client data).
async function resolveWriteTenantId(req) {
  const requested = req.query.tenant_id;
  if (!requested || requested === req.user.tenant_id) return req.user.tenant_id;
  if (req.user.role === "super_admin") return requested;
  return null;
}

// Resolve tenant: own data OR a linked client's data (accountants/super_admin only)
async function resolveTenantId(req) {
  const requested = req.query.tenant_id;
  if (!requested || requested === req.user.tenant_id) return req.user.tenant_id;
  if (req.user.role === "super_admin") return requested;
  if (req.user.role !== "accountant") return null;
  const { rows } = await pool.query(
    "SELECT 1 FROM advisor_client_links WHERE advisor_id=$1 AND client_tenant_id=$2",
    [req.user.id, requested]
  );
  return rows[0] ? requested : null;
}

// GET /api/kv/stream - live updates (Server-Sent Events).
// Must be declared BEFORE "/:ns" or Express matches "stream" as a namespace.
// EventSource cannot send Authorization headers, so the access token arrives as
// a query param; we verify it the same way as the authenticate middleware.
router.get("/stream", async (req, res) => {
  const token = req.query.token;
  let user;
  try {
    const payload = verifyAccess(String(token || ""));
    const { rows } = await pool.query("SELECT id, tenant_id, role FROM users WHERE id=$1", [payload.sub]);
    user = rows[0];
    if (!user) throw new Error("user not found");
  } catch {
    return res.status(401).end();
  }
  req.user = user;

  // Subscribe to the caller's own tenant, or a client tenant they may view.
  const tenantId = await resolveTenantId(req);
  if (!tenantId) return res.status(403).end();

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Disable proxy buffering (Render/nginx) so events flush immediately.
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write("retry: 5000\n\n");
  res.write(": connected\n\n");

  const unsubscribe = subscribe(tenantId, res);
  // Heartbeat keeps the connection alive through idle-timeout proxies.
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* closed */ }
  }, 25000);

  req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

// GET /api/kv/:ns - get all keys in namespace
router.get("/:ns", authenticate, async (req, res) => {
  const { ns } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    "SELECT key, value, updated_at FROM kv_store WHERE tenant_id=$1 AND namespace=$2",
    [tenantId, ns]
  );
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

// GET /api/kv/:ns/:key
router.get("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace=$2 AND key=$3",
    [tenantId, ns, key]
  );
  res.json(rows[0]?.value ?? null);
});

// PUT /api/kv/:ns/:key
router.put("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (READONLY_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Read-only role" });
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveWriteTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const value = req.body;
  await pool.query(`
    INSERT INTO kv_store(tenant_id, namespace, key, value, updated_at)
    VALUES($1,$2,$3,$4,now())
    ON CONFLICT(tenant_id, namespace, key) DO UPDATE SET value=$4, updated_at=now()
  `, [tenantId, ns, key, JSON.stringify(value)]);
  // Notify this tenant's other open clients to refetch this namespace live.
  publish(tenantId, { ns, key, clientId: req.headers["x-client-id"] || null, updatedAt: Date.now() });
  res.json({ ok: true });
});

// DELETE /api/kv/:ns/:key
router.delete("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (READONLY_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Read-only role" });
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveWriteTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  await pool.query(
    "DELETE FROM kv_store WHERE tenant_id=$1 AND namespace=$2 AND key=$3",
    [tenantId, ns, key]
  );
  publish(tenantId, { ns, key, clientId: req.headers["x-client-id"] || null, updatedAt: Date.now() });
  res.json({ ok: true });
});

module.exports = router;
