const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { sendWelcome } = require("../lib/email");
const { tenantSeatInfo, PLAN_LABEL } = require("../lib/plans");
const { writeAudit } = require("../lib/audit");
const { addMembership, removeMembership } = require("../lib/memberships");

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

// GET /api/users - super_admin sees all; owner sees own tenant. Lower roles blocked.
router.get("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const isSuperAdmin = req.user.role === "super_admin";
  if (isSuperAdmin) {
    const cols = "id,email,role,tenant_id,first_login,created_at,display_name,status,last_login_at,last_active_at,COALESCE(login_count,0) AS login_count,COALESCE(subscription_plan,'free') AS subscription_plan";
    const { rows } = await pool.query(`SELECT ${cols} FROM users ORDER BY created_at DESC`);
    return res.json(rows);
  }
  // Team list = the active MEMBERS of this firm (role from the membership, so a firm's
  // creator/guest shows even without a users row homed here). 0014 backfill keeps this
  // identical to the old users-based list for existing single-firm tenants.
  const { rows } = await pool.query(
    `SELECT u.id, u.email, m.role AS role, m.tenant_id AS tenant_id, u.first_login, u.created_at,
            u.display_name, u.status, u.last_login_at, u.last_active_at,
            COALESCE(u.login_count,0) AS login_count, COALESCE(u.subscription_plan,'free') AS subscription_plan
       FROM tenant_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id=$1 AND m.status='active'
      ORDER BY u.created_at DESC`,
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/users - owner (own tenant, non-super roles) or super_admin (any tenant/role)
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

  // Seat-cap: owners are bounded by their plan's included seats; super_admin is not.
  if (actor.role !== "super_admin") {
    const seat = await tenantSeatInfo(tid);
    if (seat.full) {
      return res.status(402).json({
        error: `Your ${PLAN_LABEL[seat.plan] || seat.plan} plan includes ${seat.limit} seat${seat.limit === 1 ? "" : "s"} and you've used all of them.`,
        code: "SEAT_LIMIT", seat,
      });
    }
  }

  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash     = await bcrypt.hash(tempPass, 10);
  const { rows } = await pool.query(
    "INSERT INTO users(email,password,role,tenant_id) VALUES($1,$2,$3,$4) RETURNING id,email,role,tenant_id,first_login",
    [email.toLowerCase(), hash, role, tid]
  );
  await addMembership(rows[0].id, tid, role);
  sendWelcome({ to: email, password: tempPass }).catch(() => {});
  writeAudit(actor.id, "user.create", "user", rows[0].id, { email: email.toLowerCase(), role, tenant_id: tid });
  res.status(201).json(rows[0]);
});

// PATCH /api/users/:id - change role (scoped + privilege-guarded + lockout-safe)
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

  // Demoting a super_admin must not drop the count to zero - do it atomically.
  if (target.role === "super_admin" && role !== "super_admin") {
    const out = await withSuperAdminGuard(async (client) => {
      if ((await countSuperAdmins(client)) <= 1) return null;
      const { rows } = await client.query("UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role,tenant_id", [role, req.params.id]);
      await addMembership(req.params.id, target.tenant_id, role, client);   // upsert = self-healing
      return rows[0];
    });
    if (!out) return res.status(409).json({ error: "Can't demote the last super admin" });
    return res.json(out);
  }

  const { rows } = await pool.query("UPDATE users SET role=$1 WHERE id=$2 RETURNING id,email,role,tenant_id", [role, req.params.id]);
  // Keep the member's role in this firm in sync (the team list reads the membership role);
  // upsert so a missing membership row self-heals.
  await addMembership(req.params.id, target.tenant_id, role);
  writeAudit(actor.id, "user.role_change", "user", req.params.id, { from: target.role, to: role });
  res.json(rows[0]);
});

// POST /api/users/:id/status - activate / deactivate a single user. A suspended
// user is blocked at login (auth.js checks user.status). Per-user (not tenant-wide).
router.post("/:id/status", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });
  const status = (req.body && req.body.status) === "suspended" ? "suspended" : "active";
  const { rows: t } = await pool.query("SELECT id,role,tenant_id,email FROM users WHERE id=$1", [req.params.id]);
  const target = t[0];
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't deactivate yourself" });
  if (actor.role === "owner") {
    if (target.tenant_id !== actor.tenant_id) return res.status(403).json({ error: "Forbidden" });
    if (target.role === "super_admin")        return res.status(403).json({ error: "Forbidden" });
  }
  await pool.query("UPDATE users SET status=$1 WHERE id=$2", [status, target.id]);
  writeAudit(actor.id, status === "suspended" ? "user.deactivate" : "user.activate", "user", target.id, { email: target.email });
  res.json({ ok: true, status });
});

// POST /api/users/:id/make-owner - promote a teammate to owner (continuity / backup admin).
// Owner can promote anyone in their own tenant; super_admin anywhere. Co-owners are allowed.
router.post("/:id/make-owner", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });
  const { rows: t } = await pool.query("SELECT id,role,tenant_id,email FROM users WHERE id=$1", [req.params.id]);
  const target = t[0];
  if (!target) return res.status(404).json({ error: "Not found" });
  if (actor.role === "owner" && target.tenant_id !== actor.tenant_id) return res.status(403).json({ error: "Forbidden" });
  if (target.role === "super_admin") return res.status(403).json({ error: "Forbidden" });
  await pool.query("UPDATE users SET role='owner' WHERE id=$1", [target.id]);
  await addMembership(target.id, target.tenant_id, "owner");
  writeAudit(actor.id, "user.make_owner", "user", target.id, { email: target.email, tenant_id: target.tenant_id });
  res.json({ ok: true, id: target.id, role: "owner" });
});

// POST /api/users/leave - a member leaves their current tenant and gets a fresh
// solo workspace. Blocked if they're the last owner (would orphan the company).
router.post("/leave", authenticate, async (req, res) => {
  const me = req.user;
  if (me.role === "super_admin") return res.status(400).json({ error: "Super admins can't leave a tenant" });
  if (me.role === "owner") {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE tenant_id=$1 AND role='owner' AND id<>$2", [me.tenant_id, me.id]
    );
    if (rows[0].n === 0) return res.status(409).json({ error: "You're the last owner - transfer ownership before leaving." });
  }
  const { rows: u } = await pool.query("SELECT email FROM users WHERE id=$1", [me.id]);
  const slug = (u[0]?.email || "user").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const newTid = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
  await pool.query("UPDATE users SET tenant_id=$1, role='owner' WHERE id=$2", [newTid, me.id]);
  // Leave the old firm (drop that membership) and own the fresh solo workspace.
  await removeMembership(me.id, me.tenant_id);
  await addMembership(me.id, newTid, "owner");
  writeAudit(me.id, "user.leave_tenant", "tenant", me.tenant_id, { newTenant: newTid });
  res.json({ ok: true, tenant_id: newTid });
});

// PATCH /api/users/:id/profile - super-admin edits a user's email / display name.
// Parameterised (no hardcoded values); email uniqueness enforced.
router.patch("/:id/profile", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  const { email, display_name } = req.body || {};
  const sets = [], vals = [];
  if (typeof email === "string" && email.trim()) {
    const e = email.trim().toLowerCase();
    const { rows: dup } = await pool.query("SELECT id FROM users WHERE email=$1 AND id<>$2", [e, req.params.id]);
    if (dup.length) return res.status(409).json({ error: "Email already in use" });
    sets.push(`email=$${sets.length + 1}`); vals.push(e);
  }
  if (typeof display_name === "string") { sets.push(`display_name=$${sets.length + 1}`); vals.push(display_name.trim()); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  vals.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id=$${vals.length}
     RETURNING id,email,role,tenant_id,first_login,created_at,display_name,COALESCE(subscription_plan,'free') AS subscription_plan`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  writeAudit(req.user.id, "user.edit_profile", "user", req.params.id, { email: typeof email === "string" ? email.trim().toLowerCase() : undefined, display_name });
  res.json(rows[0]);
});

// DELETE /api/users/:id - owner (own tenant, non-super) or super_admin (any but self / last admin)
router.delete("/:id", authenticate, async (req, res) => {
  const actor = req.user;
  if (!["super_admin", "owner"].includes(actor.role)) return res.status(403).json({ error: "Forbidden" });

  const { rows: t } = await pool.query("SELECT id,role,tenant_id,email FROM users WHERE id=$1", [req.params.id]);
  const target = t[0];
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.id === actor.id) return res.status(400).json({ error: "You can't remove yourself" });

  if (actor.role === "owner") {
    if (target.tenant_id !== actor.tenant_id) return res.status(403).json({ error: "Forbidden" });
    if (target.role === "super_admin")        return res.status(403).json({ error: "Forbidden" });
  }

  // Deleting a tenant's sole owner would orphan the company (mirrors the self-service
  // leave guard above) — block it for both an owner removing a co-owner and a
  // super_admin acting cross-tenant from the admin console.
  if (target.role === "owner") {
    const { rows: co } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE tenant_id=$1 AND role='owner' AND id<>$2", [target.tenant_id, target.id]
    );
    if (co[0].n === 0) return res.status(409).json({ error: "This is the only owner of that company — promote another member to owner first, or the org will be orphaned." });
  }

  // Deleting a super_admin must not drop the count to zero - do it atomically.
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
  writeAudit(actor.id, "user.delete", "user", req.params.id, { email: target.email, tenant_id: target.tenant_id });
  res.json({ ok: true });
});

module.exports = router;
