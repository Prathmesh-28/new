// Headroom Collab — Phase 1 data layer (REST messaging).
//
// Every function goes through withTenant() (see ./tenantContext.js): it opens a
// transaction with the app.current_tenant GUC set, so FORCE row-level security
// scopes every query to the tenant. RLS is the backstop; per-CONVERSATION
// membership is enforced here in the app layer (RLS only isolates tenants).
//
// IDs are time-sortable collab_uuidv7(), so message ordering and keyset pagination
// use the id directly: newest-first is `ORDER BY id DESC`, "before a cursor" is
// `id < $cursor`, gap-recovery ("after") is `id > $cursor ORDER BY id ASC`.

const { withTenant } = require("./tenantContext");
const { pool } = require("../../db");

// Teammates in the tenant (for member pickers / DMs). Available to every member —
// collaboration needs to know who's in the org. The users table isn't RLS'd, so this
// is a plain tenant-scoped read (not a collab_ table → no withTenant needed).
async function listTeammates(tenantId, selfId) {
  const { rows } = await pool.query(
    "SELECT id, email, display_name, full_name FROM users WHERE tenant_id=$1 ORDER BY COALESCE(display_name, full_name, email)",
    [tenantId]
  );
  return rows.map((r) => ({ id: r.id, name: r.display_name || r.full_name || r.email, email: r.email, self: r.id === selfId }));
}

class CollabError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}

const clampLimit = (n, def = 30, max = 100) => Math.min(Math.max(parseInt(n, 10) || def, 1), max);

async function isMember(c, conversationId, userId) {
  const { rows } = await c.query("SELECT 1 FROM collab_conversation_members WHERE conversation_id=$1 AND user_id=$2", [conversationId, userId]);
  return rows.length > 0;
}
async function requireMember(c, conversationId, userId) {
  if (!(await isMember(c, conversationId, userId))) throw new CollabError("FORBIDDEN", "Not a member of this conversation", 403);
}

// ── Teams ────────────────────────────────────────────────────────────────────
async function createTeam(tenantId, userId, { name, description, visibility } = {}) {
  const nm = String(name || "").trim();
  if (!nm) throw new CollabError("BAD_INPUT", "Team name is required", 400);
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `INSERT INTO collab_teams(tenant_id, name, description, visibility, created_by)
       VALUES($1,$2,$3,COALESCE($4,'private'),$5) RETURNING *`,
      [tenantId, nm, description || null, visibility, userId]
    );
    const team = rows[0];
    await c.query("INSERT INTO collab_team_members(team_id, user_id, tenant_id, role) VALUES($1,$2,$3,'owner')", [team.id, userId, tenantId]);
    return team;
  });
}

async function listTeams(tenantId, userId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT t.* FROM collab_teams t
         JOIN collab_team_members m ON m.team_id=t.id AND m.user_id=$1
        WHERE t.archived_at IS NULL ORDER BY t.created_at`,
      [userId]
    );
    return rows;
  });
}

async function addTeamMember(tenantId, userId, teamId, memberId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query("SELECT role FROM collab_team_members WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
    if (!rows[0]) throw new CollabError("FORBIDDEN", "Not a team member", 403);
    await c.query(
      "INSERT INTO collab_team_members(team_id, user_id, tenant_id, role) VALUES($1,$2,$3,'member') ON CONFLICT DO NOTHING",
      [teamId, memberId, tenantId]
    );
    return { ok: true };
  });
}

// ── Conversations ──────────────────────────────────────────────────────────────
// type: channel | group | dm. Creator is added as owner; memberIds added as members.
async function createConversation(tenantId, userId, { type, name, topic, teamId, visibility, memberIds } = {}) {
  if (!["channel", "group", "dm"].includes(type)) throw new CollabError("BAD_INPUT", "Invalid conversation type", 400);
  const members = Array.from(new Set([userId, ...(Array.isArray(memberIds) ? memberIds : [])]));
  return withTenant(tenantId, async (c) => {
    // DM dedupe: reuse an existing 1:1 between exactly these two users.
    if (type === "dm" && members.length === 2) {
      const { rows: ex } = await c.query(
        `SELECT m.conversation_id FROM collab_conversation_members m
           JOIN collab_conversations cv ON cv.id=m.conversation_id AND cv.type='dm'
          WHERE m.user_id = ANY($1::uuid[])
          GROUP BY m.conversation_id
         HAVING count(*) = 2 AND count(*) FILTER (WHERE m.user_id = ANY($1::uuid[])) = 2
          LIMIT 1`,
        [members]
      );
      if (ex[0]) return getConversation(tenantId, userId, ex[0].conversation_id);
    }
    const { rows } = await c.query(
      `INSERT INTO collab_conversations(tenant_id, type, team_id, name, topic, visibility, created_by)
       VALUES($1,$2,$3,$4,$5,COALESCE($6,'public'),$7) RETURNING *`,
      [tenantId, type, teamId || null, name || null, topic || null, visibility, userId]
    );
    const conv = rows[0];
    for (const uid of members) {
      await c.query(
        "INSERT INTO collab_conversation_members(conversation_id, user_id, tenant_id, role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [conv.id, uid, tenantId, uid === userId ? "owner" : "member"]
      );
    }
    return conv;
  });
}

// The user's conversations for the sidebar, newest-activity first, with unread counts.
async function listConversations(tenantId, userId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT c.id, c.type, c.team_id, c.name, c.topic, c.visibility, c.created_by,
              c.last_message_id, c.last_message_at, c.created_at, c.archived_at,
              m.last_read_message_id, m.notify_pref, m.muted_until,
              CASE WHEN c.type='dm' THEN (
                SELECT COALESCE(u.display_name, u.full_name, u.email)
                  FROM collab_conversation_members mm JOIN users u ON u.id=mm.user_id
                 WHERE mm.conversation_id=c.id AND mm.user_id <> $1 LIMIT 1)
              ELSE c.name END AS title,
              (SELECT count(*) FROM collab_messages msg
                 WHERE msg.conversation_id=c.id AND msg.deleted_at IS NULL
                   AND msg.sender_id <> $1
                   AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)) AS unread
         FROM collab_conversations c
         JOIN collab_conversation_members m ON m.conversation_id=c.id AND m.user_id=$1
        WHERE c.archived_at IS NULL
        ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [userId]
    );
    return rows.map((r) => ({ ...r, unread: Number(r.unread) }));
  });
}

async function getConversation(tenantId, userId, id) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, id, userId);
    const { rows } = await c.query("SELECT * FROM collab_conversations WHERE id=$1", [id]);
    if (!rows[0]) throw new CollabError("NOT_FOUND", "Conversation not found", 404);
    const { rows: members } = await c.query(
      `SELECT m.user_id, m.role, m.joined_at, u.email, u.display_name, u.full_name
         FROM collab_conversation_members m JOIN users u ON u.id=m.user_id
        WHERE m.conversation_id=$1 ORDER BY m.joined_at`,
      [id]
    );
    return { ...rows[0], members };
  });
}

async function updateConversation(tenantId, userId, id, patch = {}) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, id, userId);
    const sets = []; const params = [id];
    if (typeof patch.name === "string") { params.push(patch.name); sets.push(`name=$${params.length}`); }
    if (typeof patch.topic === "string") { params.push(patch.topic); sets.push(`topic=$${params.length}`); }
    if (typeof patch.archived === "boolean") sets.push(`archived_at=${patch.archived ? "now()" : "NULL"}`);
    if (!sets.length) { const { rows } = await c.query("SELECT * FROM collab_conversations WHERE id=$1", [id]); return rows[0]; }
    const { rows } = await c.query(`UPDATE collab_conversations SET ${sets.join(", ")} WHERE id=$1 RETURNING *`, params);
    return rows[0];
  });
}

async function addMember(tenantId, userId, conversationId, memberId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    await c.query(
      "INSERT INTO collab_conversation_members(conversation_id, user_id, tenant_id, role) VALUES($1,$2,$3,'member') ON CONFLICT DO NOTHING",
      [conversationId, memberId, tenantId]
    );
    return { ok: true };
  });
}

async function removeMember(tenantId, userId, conversationId, memberId) {
  return withTenant(tenantId, async (c) => {
    // A member may remove themselves (leave); owners may remove others.
    if (memberId !== userId) {
      const { rows } = await c.query("SELECT role FROM collab_conversation_members WHERE conversation_id=$1 AND user_id=$2", [conversationId, userId]);
      if (!rows[0] || !["owner", "admin"].includes(rows[0].role)) throw new CollabError("FORBIDDEN", "Only owners can remove members", 403);
    }
    await c.query("DELETE FROM collab_conversation_members WHERE conversation_id=$1 AND user_id=$2", [conversationId, memberId]);
    return { ok: true };
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────
async function postMessage(tenantId, userId, conversationId, { body, richContent, parentMessageId } = {}) {
  const text = body == null ? "" : String(body);
  if (!text.trim() && !richContent) throw new CollabError("BAD_INPUT", "Message body is required", 400);
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    const { rows } = await c.query(
      `INSERT INTO collab_messages(conversation_id, tenant_id, sender_id, parent_message_id, body, rich_content)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [conversationId, tenantId, userId, parentMessageId || null, text, richContent ? JSON.stringify(richContent) : null]
    );
    const msg = rows[0];
    await c.query("UPDATE collab_conversations SET last_message_id=$1, last_message_at=now() WHERE id=$2", [msg.id, conversationId]);
    if (parentMessageId) {
      await c.query("UPDATE collab_messages SET thread_reply_count=thread_reply_count+1, thread_last_reply_at=now() WHERE id=$1 AND conversation_id=$2", [parentMessageId, conversationId]);
    }
    // Advance the sender's own read pointer (they've "seen" their own message).
    await c.query("UPDATE collab_conversation_members SET last_read_message_id=$1, last_read_at=now() WHERE conversation_id=$2 AND user_id=$3", [msg.id, conversationId, userId]);
    return msg;
  });
}

// Keyset pagination. before → older page (id DESC); after → gap recovery (id ASC).
async function listMessages(tenantId, userId, conversationId, { before, after, limit } = {}) {
  const lim = clampLimit(limit, 50);
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    let rows;
    if (after) {
      ({ rows } = await c.query(
        `SELECT * FROM collab_messages WHERE conversation_id=$1 AND id > $2 ORDER BY id ASC LIMIT $3`,
        [conversationId, after, lim]
      ));
    } else {
      const params = [conversationId];
      let where = "conversation_id=$1";
      if (before) { params.push(before); where += ` AND id < $${params.length}`; }
      params.push(lim);
      ({ rows } = await c.query(
        `SELECT * FROM collab_messages WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
        params
      ));
    }
    const nextCursor = !after && rows.length === lim ? rows[rows.length - 1].id : null;
    return { messages: rows, nextCursor };
  });
}

async function editMessage(tenantId, userId, messageId, { body, richContent } = {}) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query("SELECT sender_id FROM collab_messages WHERE id=$1", [messageId]);
    if (!rows[0]) throw new CollabError("NOT_FOUND", "Message not found", 404);
    if (rows[0].sender_id !== userId) throw new CollabError("FORBIDDEN", "You can only edit your own messages", 403);
    const { rows: upd } = await c.query(
      "UPDATE collab_messages SET body=$1, rich_content=$2, edited_at=now() WHERE id=$3 RETURNING *",
      [body == null ? "" : String(body), richContent ? JSON.stringify(richContent) : null, messageId]
    );
    return upd[0];
  });
}

async function deleteMessage(tenantId, userId, messageId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query("SELECT sender_id FROM collab_messages WHERE id=$1", [messageId]);
    if (!rows[0]) throw new CollabError("NOT_FOUND", "Message not found", 404);
    if (rows[0].sender_id !== userId) throw new CollabError("FORBIDDEN", "You can only delete your own messages", 403);
    await c.query("UPDATE collab_messages SET deleted_at=now(), body='' WHERE id=$1", [messageId]);
    return { ok: true };
  });
}

// ── Read state ───────────────────────────────────────────────────────────────
async function advanceRead(tenantId, userId, conversationId, lastReadMessageId) {
  return withTenant(tenantId, async (c) => {
    const { rowCount } = await c.query(
      "UPDATE collab_conversation_members SET last_read_message_id=$1, last_read_at=now() WHERE conversation_id=$2 AND user_id=$3",
      [lastReadMessageId, conversationId, userId]
    );
    if (!rowCount) throw new CollabError("FORBIDDEN", "Not a member of this conversation", 403);
    return { ok: true };
  });
}

// Aggregate unread + (Phase 1) mention counts for badges.
async function unreads(tenantId, userId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT c.id,
              (SELECT count(*) FROM collab_messages msg
                 WHERE msg.conversation_id=c.id AND msg.deleted_at IS NULL AND msg.sender_id <> $1
                   AND (m.last_read_message_id IS NULL OR msg.id > m.last_read_message_id)) AS unread
         FROM collab_conversations c
         JOIN collab_conversation_members m ON m.conversation_id=c.id AND m.user_id=$1
        WHERE c.archived_at IS NULL`,
      [userId]
    );
    const byConversation = {};
    let totalUnread = 0;
    for (const r of rows) { const n = Number(r.unread); byConversation[r.id] = { unread: n, mentions: 0 }; totalUnread += n; }
    return { totalUnread, totalMentions: 0, byConversation };
  });
}

module.exports = {
  CollabError, listTeammates,
  createTeam, listTeams, addTeamMember,
  createConversation, listConversations, getConversation, updateConversation, addMember, removeMember,
  postMessage, listMessages, editMessage, deleteMessage,
  advanceRead, unreads,
};
