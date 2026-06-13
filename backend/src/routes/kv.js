const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

// Must stay in sync with src/data/types.ts ROLE_NAMESPACES — otherwise a role
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

// GET /api/kv/:ns — get all keys in namespace
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
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveWriteTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  const value = req.body;
  await pool.query(`
    INSERT INTO kv_store(tenant_id, namespace, key, value, updated_at)
    VALUES($1,$2,$3,$4,now())
    ON CONFLICT(tenant_id, namespace, key) DO UPDATE SET value=$4, updated_at=now()
  `, [tenantId, ns, key, JSON.stringify(value)]);
  res.json({ ok: true });
});

// DELETE /api/kv/:ns/:key
router.delete("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const tenantId = await resolveWriteTenantId(req);
  if (!tenantId) return res.status(403).json({ error: "Forbidden" });

  await pool.query(
    "DELETE FROM kv_store WHERE tenant_id=$1 AND namespace=$2 AND key=$3",
    [tenantId, ns, key]
  );
  res.json({ ok: true });
});

module.exports = router;
