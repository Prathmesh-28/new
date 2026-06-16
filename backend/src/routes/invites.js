const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// Team invites — a request/accept/reject lifecycle for joining a company (tenant).
// Owner/admin (own tenant) or super-admin (any tenant) sends an invite by email or
// user-id; the invitee accepts (joins the team with the invited role) or rejects.

// POST /api/invites — create a pending invite
router.post("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const actor = req.user;
  const { invitee_email, invitee_user_id, role, tenant_id, message } = req.body || {};
  const tid = actor.role === "super_admin" ? (tenant_id || actor.tenant_id) : actor.tenant_id;
  const newRole = role || "finance_manager";
  let email = (invitee_email || "").trim().toLowerCase();
  let userId = invitee_user_id || null;
  if (userId && !email) {
    const { rows } = await pool.query("SELECT email FROM users WHERE id=$1", [userId]);
    if (!rows.length) return res.status(404).json({ error: "Invitee user-id not found" });
    email = rows[0].email;
  } else if (email && !userId) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (rows.length) userId = rows[0].id;
  }
  if (!email) return res.status(400).json({ error: "Provide an invitee email or user id" });
  const { rows: dup } = await pool.query(
    "SELECT id FROM team_invites WHERE tenant_id=$1 AND invitee_email=$2 AND status='pending'", [tid, email]
  );
  if (dup.length) return res.status(409).json({ error: "A pending invite already exists for this person" });
  const { rows } = await pool.query(
    `INSERT INTO team_invites(tenant_id, inviter_id, inviter_email, invitee_email, invitee_user_id, role, message)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tid, actor.id, actor.email, email, userId, newRole, (message || "").slice(0, 280)]
  );
  res.status(201).json(rows[0]);
});

// GET /api/invites — { incoming: pending for me, outgoing: my tenant (super: all) }
router.get("/", authenticate, async (req, res) => {
  const me = req.user;
  const { rows: incoming } = await pool.query(
    `SELECT * FROM team_invites
     WHERE status='pending' AND (invitee_user_id=$1 OR LOWER(invitee_email)=LOWER($2))
     ORDER BY created_at DESC`,
    [me.id, me.email]
  );
  let outgoing = [];
  if (me.role === "super_admin") {
    outgoing = (await pool.query("SELECT * FROM team_invites ORDER BY created_at DESC LIMIT 500")).rows;
  } else if (me.role === "owner") {
    outgoing = (await pool.query("SELECT * FROM team_invites WHERE tenant_id=$1 ORDER BY created_at DESC", [me.tenant_id])).rows;
  }
  res.json({ incoming, outgoing });
});

async function loadForInvitee(id, me) {
  const { rows } = await pool.query("SELECT * FROM team_invites WHERE id=$1", [id]);
  const inv = rows[0];
  if (!inv) return { code: 404 };
  const isInvitee = inv.invitee_user_id === me.id || (inv.invitee_email || "").toLowerCase() === (me.email || "").toLowerCase();
  if (!isInvitee && me.role !== "super_admin") return { code: 403 };
  return { inv };
}

// POST /api/invites/:id/accept — invitee joins the team with the invited role
router.post("/:id/accept", authenticate, async (req, res) => {
  const { inv, code } = await loadForInvitee(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Invite already ${inv.status}` });
  await pool.query("UPDATE users SET tenant_id=$1, role=$2 WHERE id=$3", [inv.tenant_id, inv.role, req.user.id]);
  await pool.query("UPDATE team_invites SET status='accepted', resolved_at=now(), invitee_user_id=$2 WHERE id=$1", [inv.id, req.user.id]);
  res.json({ ok: true, tenant_id: inv.tenant_id, role: inv.role });
});

// POST /api/invites/:id/reject
router.post("/:id/reject", authenticate, async (req, res) => {
  const { inv, code } = await loadForInvitee(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Invite already ${inv.status}` });
  await pool.query("UPDATE team_invites SET status='rejected', resolved_at=now() WHERE id=$1", [inv.id]);
  res.json({ ok: true });
});

// POST /api/invites/:id/cancel — inviter / owner / super withdraws a pending invite
router.post("/:id/cancel", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM team_invites WHERE id=$1", [req.params.id]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Not found" });
  if (req.user.role !== "super_admin" && inv.tenant_id !== req.user.tenant_id) return res.status(403).json({ error: "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Invite already ${inv.status}` });
  await pool.query("UPDATE team_invites SET status='cancelled', resolved_at=now() WHERE id=$1", [inv.id]);
  res.json({ ok: true });
});

module.exports = router;
