"use strict";
// ── Cross-entity record services ─────────────────────────────────────────────
// Every record in the product was a dead end: you could not say WHY you changed it,
// could not see who changed it before you, could not follow it, and the product forgot
// you had ever opened it. audit_log was written on every mutation and never shown.
//
//   GET    /api/records/:entity/:id/activity   → merged audit + comment timeline
//   GET    /api/records/:entity/:id/comments
//   POST   /api/records/:entity/:id/comments   { body, mentions[] }
//   PATCH  /api/records/comments/:commentId    { body }
//   DELETE /api/records/comments/:commentId
//   GET    /api/records/:entity/:id/followers
//   POST   /api/records/:entity/:id/follow     (toggle)
//   GET    /api/records/recent                 → this user's recently viewed
//   POST   /api/records/recent                 { entity, id, label, href }
//   GET    /api/records/mentionable            → teammates for the @ autocomplete
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { pool } = require("../db");
const { q } = require("../lib/tenantDb");
const { raiseAlert } = require("../lib/alerts");

const ENTITY_RE = /^[a-z_]{2,40}$/;
const okEntity = (e) => ENTITY_RE.test(String(e || ""));

// ── Comments ─────────────────────────────────────────────────────────────────
router.get("/:entity/:id/comments", authenticate, async (req, res) => {
  if (!okEntity(req.params.entity)) return res.status(400).json({ error: "Bad entity" });
  const { rows } = await pool.query(
    `SELECT n.id, n.body, n.mentions, n.created_at, n.edited_at, n.author_id,
            u.email AS author_email, COALESCE(u.display_name, u.full_name) AS author_name
       FROM notes n LEFT JOIN users u ON u.id = n.author_id
      WHERE n.tenant_id=$1 AND n.entity=$2 AND n.entity_id=$3 AND n.deleted_at IS NULL
      ORDER BY n.created_at ASC`,
    [req.user.tenant_id, req.params.entity, String(req.params.id)]
  );
  res.json(rows);
});

router.post("/:entity/:id/comments", authenticate, async (req, res) => {
  if (!okEntity(req.params.entity)) return res.status(400).json({ error: "Bad entity" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Write something first" });
  if (body.length > 5000) return res.status(400).json({ error: "Comment is too long (max 5000 characters)" });

  // Only accept mentions of people who are actually in this firm — a client could
  // otherwise notify any user id it guessed.
  const asked = Array.isArray(req.body?.mentions) ? req.body.mentions.slice(0, 20) : [];
  let mentions = [];
  if (asked.length) {
    const { rows } = await pool.query(
      `SELECT u.id FROM users u WHERE u.id = ANY($1::uuid[]) AND (u.tenant_id=$2
          OR EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.user_id=u.id AND m.tenant_id=$2 AND m.status='active'))`,
      [asked, req.user.tenant_id]
    );
    mentions = rows.map((r) => r.id);
  }

  const { rows } = await pool.query(
    `INSERT INTO notes(tenant_id, author_id, entity, entity_id, body, mentions)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.tenant_id, req.user.id, req.params.entity, String(req.params.id), body, mentions]
  );

  // Tell the mentioned people, and everyone watching the record (never the author).
  const watchers = await q(req.user.tenant_id,
    "SELECT user_id FROM record_follows WHERE tenant_id=$1 AND entity=$2 AND entity_id=$3",
    [req.user.tenant_id, req.params.entity, String(req.params.id)]);
  const notify = new Set([...mentions, ...watchers.rows.map((r) => r.user_id)]);
  notify.delete(req.user.id);
  const who = req.user.display_name || req.user.full_name || req.user.email;
  for (const uid of notify) {
    raiseAlert(req.user.tenant_id, {
      ruleId: mentions.includes(uid) ? "comment.mention" : "comment.new",
      severity: "low",
      title: mentions.includes(uid) ? `${who} mentioned you` : `${who} commented`,
      message: body.slice(0, 160),
      userId: uid,
      entity: req.params.entity,
      entityId: String(req.params.id),
    }).catch(() => {});
  }

  res.status(201).json({ ...rows[0], author_email: req.user.email, author_name: req.user.name });
});

router.patch("/comments/:commentId", authenticate, async (req, res) => {
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comment cannot be empty" });
  const { rows } = await pool.query(
    `UPDATE notes SET body=$4, edited_at=now()
      WHERE id=$1 AND tenant_id=$2 AND author_id=$3 AND deleted_at IS NULL RETURNING *`,
    [req.params.commentId, req.user.tenant_id, req.user.id, body]
  );
  if (!rows[0]) return res.status(404).json({ error: "Comment not found (you can only edit your own)" });
  res.json(rows[0]);
});

router.delete("/comments/:commentId", authenticate, async (req, res) => {
  // Soft delete: a conversation with a hole in it is harder to read than one that says
  // a comment was removed, and admins may need the history.
  const { rows } = await pool.query(
    `UPDATE notes SET deleted_at=now()
      WHERE id=$1 AND tenant_id=$2 AND (author_id=$3 OR $4 IN ('owner','admin','super_admin')) AND deleted_at IS NULL
      RETURNING id`,
    [req.params.commentId, req.user.tenant_id, req.user.id, req.user.role]
  );
  if (!rows[0]) return res.status(404).json({ error: "Comment not found" });
  res.json({ ok: true });
});

// ── Activity timeline (audit + comments, merged) ─────────────────────────────
router.get("/:entity/:id/activity", authenticate, async (req, res) => {
  if (!okEntity(req.params.entity)) return res.status(400).json({ error: "Bad entity" });
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT a.created_at, 'audit' AS kind, a.action AS title, a.meta,
              a.user_id, u.email AS actor_email, COALESCE(u.display_name, u.full_name) AS actor_name, NULL::text AS body
         FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.tenant_id=$1 AND a.entity=$2 AND a.entity_id=$3
       UNION ALL
       SELECT n.created_at, 'comment' AS kind, 'commented' AS title, NULL::jsonb AS meta,
              n.author_id AS user_id, u2.email AS actor_email, COALESCE(u2.display_name, u2.full_name) AS actor_name, n.body
         FROM notes n LEFT JOIN users u2 ON u2.id=n.author_id
        WHERE n.tenant_id=$1 AND n.entity=$2 AND n.entity_id=$3 AND n.deleted_at IS NULL
     ) t ORDER BY created_at DESC LIMIT $4`,
    [req.user.tenant_id, req.params.entity, String(req.params.id), limit]
  );
  res.json(rows);
});

// ── Follow / watch ───────────────────────────────────────────────────────────
router.get("/:entity/:id/followers", authenticate, async (req, res) => {
  const { rows } = await q(req.user.tenant_id,
    `SELECT f.user_id, f.created_at FROM record_follows f
      WHERE f.tenant_id=$1 AND f.entity=$2 AND f.entity_id=$3`,
    [req.user.tenant_id, req.params.entity, String(req.params.id)]);
  const ids = rows.map((r) => r.user_id);
  const people = ids.length
    ? (await pool.query("SELECT id, email, COALESCE(display_name, full_name) AS name FROM users WHERE id = ANY($1::uuid[])", [ids])).rows
    : [];
  res.json({ followers: people, following: ids.includes(req.user.id) });
});

router.post("/:entity/:id/follow", authenticate, async (req, res) => {
  if (!okEntity(req.params.entity)) return res.status(400).json({ error: "Bad entity" });
  const on = req.body?.follow !== false;
  if (on) {
    await q(req.user.tenant_id,
      `INSERT INTO record_follows(tenant_id,entity,entity_id,user_id) VALUES($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [req.user.tenant_id, req.params.entity, String(req.params.id), req.user.id]);
  } else {
    await q(req.user.tenant_id,
      "DELETE FROM record_follows WHERE tenant_id=$1 AND entity=$2 AND entity_id=$3 AND user_id=$4",
      [req.user.tenant_id, req.params.entity, String(req.params.id), req.user.id]);
  }
  res.json({ following: on });
});

// ── Recently viewed ──────────────────────────────────────────────────────────
router.get("/recent", authenticate, async (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 12);
  const { rows } = await q(req.user.tenant_id,
    `SELECT entity, entity_id, label, href, viewed_at FROM recently_viewed
      WHERE tenant_id=$1 AND user_id=$2 ORDER BY viewed_at DESC LIMIT $3`,
    [req.user.tenant_id, req.user.id, limit]);
  res.json(rows);
});

router.post("/recent", authenticate, async (req, res) => {
  const { entity, id, label = "", href = "" } = req.body || {};
  if (!okEntity(entity) || !id) return res.status(400).json({ error: "entity and id are required" });
  await q(req.user.tenant_id,
    `INSERT INTO recently_viewed(tenant_id,user_id,entity,entity_id,label,href)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id,user_id,entity,entity_id)
     DO UPDATE SET viewed_at=now(), label=EXCLUDED.label, href=EXCLUDED.href`,
    [req.user.tenant_id, req.user.id, entity, String(id), String(label).slice(0, 160), String(href).slice(0, 300)]);
  // Keep the list short per user rather than growing forever.
  await q(req.user.tenant_id,
    `DELETE FROM recently_viewed r
      WHERE r.tenant_id=$1 AND r.user_id=$2
        AND r.viewed_at < (SELECT min(viewed_at) FROM (
              SELECT viewed_at FROM recently_viewed WHERE tenant_id=$1 AND user_id=$2
               ORDER BY viewed_at DESC LIMIT 40) keep)`,
    [req.user.tenant_id, req.user.id]);
  res.json({ ok: true });
});

// ── Who can be @mentioned ────────────────────────────────────────────────────
router.get("/mentionable", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.email, COALESCE(u.display_name, u.full_name) AS name, u.role FROM users u
      WHERE u.tenant_id=$1
         OR EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.user_id=u.id AND m.tenant_id=$1 AND m.status='active')
      ORDER BY 3 NULLS LAST, u.email LIMIT 100`,
    [req.user.tenant_id]
  );
  res.json(rows);
});

module.exports = router;
