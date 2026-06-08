const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const ROLE_NAMESPACES = {
  super_admin: ["app", "forecast", "credit", "capital"],
  owner:       ["app", "forecast", "credit", "capital"],
  accountant:  ["app", "forecast"],
  investor:    ["app", "capital"],
};

function canAccess(role, ns) {
  return (ROLE_NAMESPACES[role] || []).includes(ns);
}

// GET /api/kv/:ns — get all keys in namespace
router.get("/:ns", authenticate, async (req, res) => {
  const { ns } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    "SELECT key, value, updated_at FROM kv_store WHERE tenant_id=$1 AND namespace=$2",
    [req.user.tenant_id, ns]
  );
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

// GET /api/kv/:ns/:key
router.get("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace=$2 AND key=$3",
    [req.user.tenant_id, ns, key]
  );
  res.json(rows[0]?.value ?? null);
});

// PUT /api/kv/:ns/:key
router.put("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  const value = req.body;
  await pool.query(`
    INSERT INTO kv_store(tenant_id, namespace, key, value, updated_at)
    VALUES($1,$2,$3,$4,now())
    ON CONFLICT(tenant_id, namespace, key) DO UPDATE SET value=$4, updated_at=now()
  `, [req.user.tenant_id, ns, key, JSON.stringify(value)]);
  res.json({ ok: true });
});

// DELETE /api/kv/:ns/:key
router.delete("/:ns/:key", authenticate, async (req, res) => {
  const { ns, key } = req.params;
  if (!canAccess(req.user.role, ns)) return res.status(403).json({ error: "Forbidden" });

  await pool.query(
    "DELETE FROM kv_store WHERE tenant_id=$1 AND namespace=$2 AND key=$3",
    [req.user.tenant_id, ns, key]
  );
  res.json({ ok: true });
});

module.exports = router;
