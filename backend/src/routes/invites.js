const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { tenantSeatInfo, PLAN_LABEL } = require("../lib/plans");
const { writeAudit } = require("../lib/audit");
const { raiseAlert } = require("../lib/alerts");

// Team membership lifecycle - fully in-platform, no email.
//   • invite  : owner/admin → person ("join my team")            invitee accepts/rejects
//   • request : person → company ("let me join your team", B3)   owner approves/declines
// Either way, accepting moves the person into the tenant with the agreed role.

const ASSIGNABLE = ["owner", "finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor"];
// A person-initiated join REQUEST may only self-select a non-privileged seat — never
// 'owner' (an approver clicking "approve" must not be tricked into granting ownership).
// Adding a co-owner must go through the owner-initiated invite path, which uses ASSIGNABLE.
const REQUESTABLE = ["finance_manager", "accountant", "sales", "operations_manager", "viewer", "investor"];

function seatFullResponse(res, seat, who) {
  return res.status(402).json({
    error: `${who} is on the ${PLAN_LABEL[seat.plan] || seat.plan} plan (${seat.limit} seat${seat.limit === 1 ? "" : "s"}) and is full.`,
    code: "SEAT_LIMIT", seat,
  });
}

// ── GET /api/invites/companies?q= - find a company to request to join (B3) ────
router.get("/companies", authenticate, async (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const { rows } = await pool.query(
    `SELECT u.tenant_id,
            COUNT(*)::int AS member_count,
            MAX(CASE WHEN u.role IN ('owner','super_admin') THEN u.email END) AS owner_email,
            MAX(p.company_name) AS company_name
     FROM users u
     LEFT JOIN tenant_profile p ON p.tenant_id = u.tenant_id
     WHERE u.tenant_id <> $2
       AND (LOWER(u.tenant_id) LIKE $1 OR LOWER(COALESCE(p.company_name,'')) LIKE $1)
     GROUP BY u.tenant_id
     ORDER BY member_count DESC
     LIMIT 12`,
    [like, req.user.tenant_id]
  );
  res.json(rows);
});

// ── POST /api/invites - owner/admin creates an invite ─────────────────────────
router.post("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const actor = req.user;
  const { invitee_email, invitee_user_id, role, tenant_id, message } = req.body || {};
  const tid = actor.role === "super_admin" ? (tenant_id || actor.tenant_id) : actor.tenant_id;
  const newRole = ASSIGNABLE.includes(role) ? role : "finance_manager";
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

  const seat = await tenantSeatInfo(tid);
  if (seat.full) return seatFullResponse(res, seat, "Your team");

  const { rows: dup } = await pool.query(
    "SELECT id FROM team_invites WHERE tenant_id=$1 AND invitee_email=$2 AND kind='invite' AND status='pending'", [tid, email]
  );
  if (dup.length) return res.status(409).json({ error: "A pending invite already exists for this person" });
  const { rows } = await pool.query(
    `INSERT INTO team_invites(tenant_id, inviter_id, inviter_email, invitee_email, invitee_user_id, role, message, kind)
     VALUES($1,$2,$3,$4,$5,$6,$7,'invite') RETURNING *`,
    [tid, actor.id, actor.email, email, userId, newRole, (message || "").slice(0, 280)]
  );
  writeAudit(actor.id, "invite.create", "tenant", tid, { invitee: email, role: newRole });
  res.status(201).json(rows[0]);
});

// ── POST /api/invites/request - a person asks to join a company (B3) ──────────
router.post("/request", authenticate, async (req, res) => {
  const me = req.user;
  const tid = (req.body && req.body.tenant_id || "").toString().trim();
  const role = REQUESTABLE.includes(req.body && req.body.role) ? req.body.role : "viewer";
  const message = ((req.body && req.body.message) || "").slice(0, 280);
  if (!tid) return res.status(400).json({ error: "tenant_id required" });
  if (tid === me.tenant_id) return res.status(400).json({ error: "You're already in this workspace" });
  const { rows: exists } = await pool.query("SELECT 1 FROM users WHERE tenant_id=$1 LIMIT 1", [tid]);
  if (!exists.length) return res.status(404).json({ error: "Company not found" });
  const { rows: dup } = await pool.query(
    "SELECT id FROM team_invites WHERE tenant_id=$1 AND invitee_user_id=$2 AND kind='request' AND status='pending'", [tid, me.id]
  );
  if (dup.length) return res.status(409).json({ error: "You already have a pending request to join this company" });
  const { rows } = await pool.query(
    `INSERT INTO team_invites(tenant_id, inviter_id, inviter_email, invitee_email, invitee_user_id, role, message, kind)
     VALUES($1,$2,$3,$4,$5,$6,$7,'request') RETURNING *`,
    [tid, me.id, me.email, me.email, me.id, role, message]
  );
  writeAudit(me.id, "join.request", "tenant", tid, { role });
  res.status(201).json(rows[0]);
});

// ── GET /api/invites - everything relevant to me ──────────────────────────────
//   incoming : invites addressed to me (I accept/reject)
//   requests : join-requests into a tenant I own/admin (I approve/decline)
//   outgoing : invites my tenant sent (owner) or all (super)
//   myRequests: join-requests I sent
router.get("/", authenticate, async (req, res) => {
  const me = req.user;
  const { rows: incoming } = await pool.query(
    `SELECT * FROM team_invites
     WHERE kind='invite' AND status='pending' AND (invitee_user_id=$1 OR LOWER(invitee_email)=LOWER($2))
     ORDER BY created_at DESC`,
    [me.id, me.email]
  );
  const { rows: myRequests } = await pool.query(
    "SELECT * FROM team_invites WHERE kind='request' AND invitee_user_id=$1 ORDER BY created_at DESC LIMIT 50",
    [me.id]
  );
  let outgoing = [], requests = [];
  if (me.role === "super_admin") {
    outgoing = (await pool.query("SELECT * FROM team_invites WHERE kind='invite' ORDER BY created_at DESC LIMIT 500")).rows;
    requests = (await pool.query("SELECT * FROM team_invites WHERE kind='request' AND status='pending' ORDER BY created_at DESC LIMIT 500")).rows;
  } else if (me.role === "owner") {
    outgoing = (await pool.query("SELECT * FROM team_invites WHERE kind='invite' AND tenant_id=$1 ORDER BY created_at DESC", [me.tenant_id])).rows;
    requests = (await pool.query("SELECT * FROM team_invites WHERE kind='request' AND tenant_id=$1 AND status='pending' ORDER BY created_at DESC", [me.tenant_id])).rows;
  }
  res.json({ incoming, requests, outgoing, myRequests });
});

async function loadForInvitee(id, me) {
  const { rows } = await pool.query("SELECT * FROM team_invites WHERE id=$1", [id]);
  const inv = rows[0];
  if (!inv) return { code: 404 };
  const isInvitee = inv.invitee_user_id === me.id || (inv.invitee_email || "").toLowerCase() === (me.email || "").toLowerCase();
  if (!isInvitee && me.role !== "super_admin") return { code: 403 };
  return { inv };
}

// ── POST /api/invites/:id/accept - invitee joins (invite flow) ────────────────
router.post("/:id/accept", authenticate, async (req, res) => {
  const { inv, code } = await loadForInvitee(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.kind !== "invite") return res.status(400).json({ error: "Not an invite" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Invite already ${inv.status}` });
  const seat = await tenantSeatInfo(inv.tenant_id);
  if (seat.full) return seatFullResponse(res, seat, "This team");
  // Read the persistent HOME from the users table, NOT req.user.tenant_id — the latter
  // may be a firm the user is merely switched INTO (X-Active-Tenant), which would drop the
  // wrong membership.
  const { rows: self } = await pool.query("SELECT tenant_id FROM users WHERE id=$1", [req.user.id]);
  const oldHome = self[0] && self[0].tenant_id;
  await pool.query("UPDATE users SET tenant_id=$1, role=$2 WHERE id=$3", [inv.tenant_id, inv.role, req.user.id]);
  // Keep the membership set consistent with the move: leave the old firm (drops any stale
  // switch access to it) and join the new one (#197). Never strip a membership in a firm
  // the user OWNS — a multi-firm owner accepting an invite elsewhere keeps their firms.
  if (oldHome && oldHome !== inv.tenant_id) await pool.query("DELETE FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2 AND role <> 'owner'", [req.user.id, oldHome]);
  await pool.query("INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id, tenant_id) DO UPDATE SET role=EXCLUDED.role, status='active'", [req.user.id, inv.tenant_id, inv.role]);
  await pool.query("UPDATE team_invites SET status='accepted', resolved_at=now(), invitee_user_id=$2 WHERE id=$1", [inv.id, req.user.id]);
  writeAudit(req.user.id, "invite.accept", "tenant", inv.tenant_id, { role: inv.role });
  res.json({ ok: true, tenant_id: inv.tenant_id, role: inv.role });
});

// ── POST /api/invites/:id/reject - invitee declines (invite flow) ─────────────
router.post("/:id/reject", authenticate, async (req, res) => {
  const { inv, code } = await loadForInvitee(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Invite already ${inv.status}` });
  await pool.query("UPDATE team_invites SET status='rejected', resolved_at=now() WHERE id=$1", [inv.id]);
  res.json({ ok: true });
});

// Owner/admin of the target tenant (or super) may act on a join request.
async function loadRequestForApprover(id, me) {
  const { rows } = await pool.query("SELECT * FROM team_invites WHERE id=$1", [id]);
  const inv = rows[0];
  if (!inv || inv.kind !== "request") return { code: 404 };
  if (me.role !== "super_admin" && inv.tenant_id !== me.tenant_id) return { code: 403 };
  return { inv };
}

// ── POST /api/invites/:id/approve - owner approves a join request (B3) ─────────
router.post("/:id/approve", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { inv, code } = await loadRequestForApprover(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Request already ${inv.status}` });
  const seat = await tenantSeatInfo(inv.tenant_id);
  if (seat.full) return seatFullResponse(res, seat, "Your team");
  const { rows: tgt } = await pool.query("SELECT tenant_id FROM users WHERE id=$1", [inv.invitee_user_id]);
  const oldHome = tgt[0] && tgt[0].tenant_id;
  await pool.query("UPDATE users SET tenant_id=$1, role=$2 WHERE id=$3", [inv.tenant_id, inv.role, inv.invitee_user_id]);
  // Move the joining member's membership set to the new firm (drops the firm they left),
  // but never strip a firm they OWN (keeps a multi-firm owner's firms intact).
  if (oldHome && oldHome !== inv.tenant_id) await pool.query("DELETE FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2 AND role <> 'owner'", [inv.invitee_user_id, oldHome]);
  await pool.query("INSERT INTO tenant_memberships(user_id, tenant_id, role, status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id, tenant_id) DO UPDATE SET role=EXCLUDED.role, status='active'", [inv.invitee_user_id, inv.tenant_id, inv.role]);
  await pool.query("UPDATE team_invites SET status='accepted', resolved_at=now() WHERE id=$1", [inv.id]);
  writeAudit(req.user.id, "join.approve", "tenant", inv.tenant_id, { member: inv.invitee_email, role: inv.role });
  res.json({ ok: true });
});

// ── POST /api/invites/:id/decline - owner declines a join request ─────────────
router.post("/:id/decline", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { inv, code } = await loadRequestForApprover(req.params.id, req.user);
  if (code) return res.status(code).json({ error: code === 404 ? "Not found" : "Forbidden" });
  if (inv.status !== "pending") return res.status(409).json({ error: `Request already ${inv.status}` });
  await pool.query("UPDATE team_invites SET status='rejected', resolved_at=now() WHERE id=$1", [inv.id]);
  res.json({ ok: true });
});

// ── POST /api/invites/:id/resend - nudge a pending invite without cancel+recreate (B7) ─
// In-platform only (matches the invite flow itself, which is deliberately email-free): bumps
// reminded_at (owner sees "reminded Xm ago", 1/day cooldown to avoid spam) and — when the
// invitee is an existing user — raises an in-app alert so it surfaces on their next visit.
router.post("/:id/resend", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM team_invites WHERE id=$1", [req.params.id]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "Not found" });
  if (req.user.role !== "super_admin" && inv.tenant_id !== req.user.tenant_id) return res.status(403).json({ error: "Forbidden" });
  if (inv.kind !== "invite" || inv.status !== "pending") return res.status(409).json({ error: "Only a pending invite can be reminded" });
  if (inv.reminded_at && Date.now() - new Date(inv.reminded_at).getTime() < 24 * 60 * 60 * 1000) {
    return res.status(429).json({ error: "Already reminded in the last 24 hours" });
  }
  await pool.query("UPDATE team_invites SET reminded_at=now() WHERE id=$1", [inv.id]);
  if (inv.invitee_user_id) {
    // Alerts are read scoped to the reader's OWN tenant_id (routes/alerts.js) — the
    // invitee hasn't joined inv.tenant_id yet, so the notification must land in their
    // current workspace, not the one they're being invited into.
    const { rows: invitee } = await pool.query("SELECT tenant_id FROM users WHERE id=$1", [inv.invitee_user_id]);
    if (invitee[0]) {
      await raiseAlert(invitee[0].tenant_id, {
        ruleId: "team.invite_reminder", severity: "low",
        title: "You have a pending team invite",
        message: `${req.user.display_name || req.user.email} invited you to join as ${inv.role.replace(/_/g, " ")} — accept or decline from Settings.`,
        meta: { invite_id: inv.id },
      }).catch(() => {});
    }
  }
  writeAudit(req.user.id, "invite.resend", "tenant", inv.tenant_id, { invitee: inv.invitee_email });
  res.json({ ok: true, reminded_at: new Date().toISOString() });
});

// ── POST /api/invites/:id/cancel - inviter/owner/super withdraws a pending one ─
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
