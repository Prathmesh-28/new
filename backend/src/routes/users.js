const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { sendWelcome } = require("../lib/email");

// Roles a workspace owner may hand out. super_admin is reserved for super_admins.
const ASSIGNABLE_ROLES = ["owner", "finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor"];
const ALL_ROLES = [...ASSIGNABLE_ROLES, "super_admin"];

// Serialize mutations that could remove the last super_admin. Locking the
// super_admin row set inside a transaction makes the count-then-act atomic, so
// two concurrent demotions/deletes can't both pass the ">=1 remaining" check.
async function withSuperAdminGuard(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE role='super_admin' FOR UPDATE");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
async function countSuperAdmins(client) {
  const { rows } = await (client || pool).query("SELECT COUNT(*)::int AS n FROM users WHERE role='super_admin'");
  return rows[0].n;
}

// GET /api/users — super_admin sees all; owner sees own tenant. Lower roles blocked.
router.get("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const isSuperAdmin = req.user.role === "super_admin";
  const { rows } = isSuperAdmin
    ? await pool.query("SELECT id,email,role,tenant_id,first_login,created_at FROM users ORDER BY created_at DESC")
    : await pool.query("SELECT id,email,role,tenant_id,first_login,created_at FROM users WHERE tenant_id=$1 ORDER BY created_at DESC", [req.user.tenant_id]);
  res.json(rows);
});

// POST /api/users — owner (own tenant, non-super roles) or super_admin (any tenant/role)
router.post("/", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });
  const { email, role, tenant_id } = req.body;
  if (!email || !role) return res.status(400).json({ error: "email and role required" });

  let tid;
  if (actor.role === "super_admin") {
    if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    tid = tenant_id || actor.tenant_id;
  } else {
    if (!ASSIGNABLE_ROLES.includes(role)) return res.status(403).json({ error: "Owners cannot assign that role" });
    tid = actor.tenant_id;
  }

  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
  if (existing[0]) return res.status(409).json({ error: "A user with this email already exists" });

  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash     = await bcrypt.hash(tempPass, 10);
  const { rows } = await pool.query(
    "INSERT INTO users(email,password,role,tenant_id) VALUES($1,$2,$3,$4) RETURNING id,email,role,tenant_id,first_login",
    [email.toLowerCase(), hash, role, tid]
  );
  sendWelcome({ to: email, password: tempPass }).catch(() => {});
  res.status(201).json(rows[0]);
});

// PATCH /api/users/:id — change role (scoped + privilege-guarded + lockout-safe)
router.patch("/:id", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: "role required" });

  const { rows: t } = await pool.query("SELECT id,role,tenant_id FROM users WHERE id=$1", [req.params.id]);
  const target = t[0];
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't change your own role" });

  if (actor.role === "owner") {
    if (target.tenant_id !== actor.tenant_id) return res.status(403).json({ error: "Forbidden" });
    if (target.role === "super_admin")        return res.status(403).json({ error: "Forbidden" });
    if (!ASSIGNABLE_ROLES.includes(role))     return res.status(403).json({ error: "Owners cannot assign that role" });
  } else if (!ALL_ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  // Demoting a super_admin must not drop the count to zero — do it atomically.
  if (target.role === "super_admin" && role !== "super_admin") {
    const out = await withSuperAdminGuard(async (client) => {
      if ((await countSuperAdmins(client)) <= 1) return null;
      const { rows } = await client.query("UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role,tenant_id", [role, req.params.id]);
      return rows[0];
    });
    if (!out) return res.status(409).json({ error: "Can't demote the last super admin" });
    return res.json(out);
  }

  const { rows } = await pool.query("UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role,tenant_id", [role, req.params.id]);
  res.json(rows[0]);
});

// DELETE /api/users/:id — owner (own tenant, non-super) or super_admin (any but self / last admin)
router.delete("/:id", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });

  const { rows: t } = await pool.query("SELECT id,role,tenant_id FROM users WHERE id=$1", [req.params.id]);
  const target = t[0];
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't remove yourself" });

  if (actor.role === "owner") {
    if (target.tenant_id !== actor.tenant_id) return res.status(403).json({ error: "Forbidden" });
    if (target.role === "super_admin")        return res.status(403).json({ error: "Forbidden" });
  }

  // Deleting a super_admin must not drop the count to zero — do it atomically.
  if (target.role === "super_admin") {
    const ok = await withSuperAdminGuard(async (client) => {
      if ((await countSuperAdmins(client)) <= 1) return false;
      await client.query("DELETE FROM users WHERE id=$1", [req.params.id]);
      return true;
    });
    if (!ok) return res.status(409).json({ error: "Can't remove the last super admin" });
    return res.json({ ok: true });
  }

  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
