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
const realtime = require("../../lib/collabRealtime");

// Member ids of a conversation (for realtime fan-out). Runs on the given client so it
// shares the caller's tenant GUC.
async function memberIds(c, conversationId) {
  const { rows } = await c.query("SELECT user_id FROM collab_conversation_members WHERE conversation_id=$1", [conversationId]);
  return rows.map((r) => r.user_id);
}

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
              CASE WHEN c.type='dm' THEN (
                SELECT mm.user_id FROM collab_conversation_members mm
                 WHERE mm.conversation_id=c.id AND mm.user_id <> $1 LIMIT 1)
              END AS dm_peer_id,
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
// Create in-app notifications for recipients (skipping the actor) + push notification:new.
async function _notify(c, tenantId, recipients, { kind, conversationId, sourceMessageId, actorId }) {
  for (const uid of Array.from(new Set(recipients))) {
    if (!uid || uid === actorId) continue;
    const { rows } = await c.query(
      `INSERT INTO collab_notifications(tenant_id, user_id, kind, conversation_id, source_message_id, actor_id)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, uid, kind, conversationId || null, sourceMessageId || null, actorId || null]
    );
    realtime.emitToUsers(tenantId, [uid], { type: "notification:new", notification: rows[0] });
  }
}

// mentions: array of member user-ids the client resolved from "@" tokens (+ optional
// "everyone" string → all members). Mentions always notify; plain messages drive unread.
async function postMessage(tenantId, userId, conversationId, { body, richContent, parentMessageId, mentions } = {}) {
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
    msg.reactions = [];
    await c.query("UPDATE collab_conversations SET last_message_id=$1, last_message_at=now() WHERE id=$2", [msg.id, conversationId]);
    if (parentMessageId) {
      await c.query("UPDATE collab_messages SET thread_reply_count=thread_reply_count+1, thread_last_reply_at=now() WHERE id=$1 AND conversation_id=$2", [parentMessageId, conversationId]);
    }
    await c.query("UPDATE collab_conversation_members SET last_read_message_id=$1, last_read_at=now() WHERE conversation_id=$2 AND user_id=$3", [msg.id, conversationId, userId]);

    const members = await memberIds(c, conversationId);
    // @mentions
    const wantsEveryone = Array.isArray(mentions) && mentions.includes("everyone");
    const userMentions = Array.isArray(mentions) ? mentions.filter((m) => m !== "everyone" && members.includes(m)) : [];
    for (const mid of userMentions) {
      await c.query("INSERT INTO collab_message_mentions(message_id, mentioned_user_id, tenant_id, kind) VALUES($1,$2,$3,'user') ON CONFLICT DO NOTHING", [msg.id, mid, tenantId]);
    }
    if (wantsEveryone) await c.query("INSERT INTO collab_message_mentions(message_id, mentioned_user_id, tenant_id, kind) VALUES($1,NULL,$2,'everyone') ON CONFLICT DO NOTHING", [msg.id, tenantId]);
    const mentionRecipients = wantsEveryone ? members : userMentions;
    await _notify(c, tenantId, mentionRecipients, { kind: "mention", conversationId, sourceMessageId: msg.id, actorId: userId });
    // thread-reply notification to the parent's author
    if (parentMessageId) {
      const { rows: par } = await c.query("SELECT sender_id FROM collab_messages WHERE id=$1", [parentMessageId]);
      if (par[0]) await _notify(c, tenantId, [par[0].sender_id], { kind: "thread_reply", conversationId, sourceMessageId: msg.id, actorId: userId });
    }
    realtime.emitToUsers(tenantId, members, { type: "message:new", conversationId, message: msg });
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
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const { rows: rx } = await c.query(
        "SELECT message_id, emoji, array_agg(user_id) AS user_ids FROM collab_message_reactions WHERE message_id = ANY($1::uuid[]) GROUP BY message_id, emoji",
        [ids]
      );
      const byMsg = {};
      for (const r of rx) (byMsg[r.message_id] ||= []).push({ emoji: r.emoji, userIds: r.user_ids });
      for (const m of rows) m.reactions = byMsg[m.id] || [];
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
    realtime.emitToUsers(tenantId, await memberIds(c, upd[0].conversation_id), { type: "message:updated", conversationId: upd[0].conversation_id, message: upd[0] });
    return upd[0];
  });
}

async function deleteMessage(tenantId, userId, messageId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query("SELECT sender_id, conversation_id FROM collab_messages WHERE id=$1", [messageId]);
    if (!rows[0]) throw new CollabError("NOT_FOUND", "Message not found", 404);
    if (rows[0].sender_id !== userId) throw new CollabError("FORBIDDEN", "You can only delete your own messages", 403);
    await c.query("UPDATE collab_messages SET deleted_at=now(), body='' WHERE id=$1", [messageId]);
    realtime.emitToUsers(tenantId, await memberIds(c, rows[0].conversation_id), { type: "message:deleted", conversationId: rows[0].conversation_id, messageId });
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

// ── Typing indicator (ephemeral — never persisted) ──────────────────────────
async function typing(tenantId, userId, conversationId, isTyping) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    const others = (await memberIds(c, conversationId)).filter((id) => id !== userId);
    realtime.emitToUsers(tenantId, others, { type: "typing", conversationId, userId, typing: !!isTyping });
    return { ok: true };
  });
}

// ── Reactions ────────────────────────────────────────────────────────────────
async function _convOfMessage(c, messageId) {
  const { rows } = await c.query("SELECT conversation_id, sender_id FROM collab_messages WHERE id=$1", [messageId]);
  if (!rows[0]) throw new CollabError("NOT_FOUND", "Message not found", 404);
  return rows[0];
}
async function addReaction(tenantId, userId, messageId, emoji) {
  const e = String(emoji || "").slice(0, 16);
  if (!e) throw new CollabError("BAD_INPUT", "emoji required", 400);
  return withTenant(tenantId, async (c) => {
    const { conversation_id } = await _convOfMessage(c, messageId);
    await requireMember(c, conversation_id, userId);
    await c.query("INSERT INTO collab_message_reactions(message_id, user_id, tenant_id, emoji) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [messageId, userId, tenantId, e]);
    realtime.emitToUsers(tenantId, await memberIds(c, conversation_id), { type: "reaction:updated", conversationId: conversation_id, messageId, emoji: e, userId, added: true });
    return { ok: true };
  });
}
async function removeReaction(tenantId, userId, messageId, emoji) {
  const e = String(emoji || "").slice(0, 16);
  return withTenant(tenantId, async (c) => {
    const { conversation_id } = await _convOfMessage(c, messageId);
    await requireMember(c, conversation_id, userId);
    await c.query("DELETE FROM collab_message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3", [messageId, userId, e]);
    realtime.emitToUsers(tenantId, await memberIds(c, conversation_id), { type: "reaction:updated", conversationId: conversation_id, messageId, emoji: e, userId, added: false });
    return { ok: true };
  });
}

// ── Threads ──────────────────────────────────────────────────────────────────
async function listThread(tenantId, userId, parentId) {
  return withTenant(tenantId, async (c) => {
    const { conversation_id } = await _convOfMessage(c, parentId);
    await requireMember(c, conversation_id, userId);
    const { rows } = await c.query("SELECT * FROM collab_messages WHERE parent_message_id=$1 ORDER BY id ASC LIMIT 200", [parentId]);
    return { messages: rows };
  });
}

// ── Notifications ────────────────────────────────────────────────────────────
async function listNotifications(tenantId, userId, { unreadOnly } = {}) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM collab_notifications WHERE user_id=$1 ${unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    const { rows: cnt } = await c.query("SELECT count(*)::int n FROM collab_notifications WHERE user_id=$1 AND read_at IS NULL", [userId]);
    return { notifications: rows, unread: cnt[0].n };
  });
}
async function markNotificationsRead(tenantId, userId, ids) {
  return withTenant(tenantId, async (c) => {
    if (Array.isArray(ids) && ids.length) await c.query("UPDATE collab_notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2::uuid[])", [userId, ids]);
    else await c.query("UPDATE collab_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL", [userId]);
    return { ok: true };
  });
}

// ── Pinned messages ──────────────────────────────────────────────────────────
async function pinMessage(tenantId, userId, conversationId, messageId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    await c.query("INSERT INTO collab_pinned_messages(conversation_id, message_id, tenant_id, pinned_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [conversationId, messageId, tenantId, userId]);
    return { ok: true };
  });
}
async function unpinMessage(tenantId, userId, conversationId, messageId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    await c.query("DELETE FROM collab_pinned_messages WHERE conversation_id=$1 AND message_id=$2", [conversationId, messageId]);
    return { ok: true };
  });
}
async function listPins(tenantId, userId, conversationId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    const { rows } = await c.query(
      `SELECT m.* FROM collab_pinned_messages p JOIN collab_messages m ON m.id=p.message_id
        WHERE p.conversation_id=$1 ORDER BY p.pinned_at DESC`,
      [conversationId]
    );
    return { pins: rows };
  });
}

// ── Full-text search (scoped to the user's conversations) ────────────────────
async function searchMessages(tenantId, userId, q) {
  const term = String(q || "").trim();
  if (!term) return { results: [] };
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, c.name, c.type
         FROM collab_messages m
         JOIN collab_conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$1
         JOIN collab_conversations c ON c.id=m.conversation_id
        WHERE m.deleted_at IS NULL AND m.search_tsv @@ websearch_to_tsquery('simple', $2)
        ORDER BY m.id DESC LIMIT 30`,
      [userId, term]
    );
    return { results: rows };
  });
}

// ── Contextual links (the Headroom differentiator) ───────────────────────────
const ENTITY_TYPES = ["client", "deal", "reconciliation", "invoice", "gst_filing"];
async function addLink(tenantId, userId, conversationId, entityType, entityId) {
  if (!ENTITY_TYPES.includes(entityType)) throw new CollabError("BAD_INPUT", "Invalid entity type", 400);
  if (!entityId) throw new CollabError("BAD_INPUT", "entityId required", 400);
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    await c.query(
      "INSERT INTO collab_contextual_links(conversation_id, tenant_id, entity_type, entity_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [conversationId, tenantId, entityType, String(entityId)]
    );
    return { ok: true };
  });
}
async function removeLink(tenantId, userId, conversationId, entityType, entityId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    await c.query("DELETE FROM collab_contextual_links WHERE conversation_id=$1 AND entity_type=$2 AND entity_id=$3", [conversationId, entityType, String(entityId)]);
    return { ok: true };
  });
}
async function listLinks(tenantId, userId, conversationId) {
  return withTenant(tenantId, async (c) => {
    await requireMember(c, conversationId, userId);
    const { rows } = await c.query("SELECT entity_type, entity_id, created_at FROM collab_contextual_links WHERE conversation_id=$1 ORDER BY created_at DESC", [conversationId]);
    return { links: rows };
  });
}
// Reverse lookup: the user's conversations anchored to a given financial object (for
// an "Discuss" affordance on invoice/client/etc. pages). Membership-scoped.
async function conversationsForEntity(tenantId, userId, entityType, entityId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT c.id, c.type, c.name FROM collab_contextual_links l
         JOIN collab_conversations c ON c.id=l.conversation_id
         JOIN collab_conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1
        WHERE l.entity_type=$2 AND l.entity_id=$3`,
      [userId, entityType, String(entityId)]
    );
    return { conversations: rows };
  });
}

module.exports = {
  CollabError, listTeammates, typing,
  addReaction, removeReaction, listThread,
  listNotifications, markNotificationsRead,
  pinMessage, unpinMessage, listPins,
  searchMessages,
  addLink, removeLink, listLinks, conversationsForEntity,
  createTeam, listTeams, addTeamMember,
  createConversation, listConversations, getConversation, updateConversation, addMember, removeMember,
  postMessage, listMessages, editMessage, deleteMessage,
  advanceRead, unreads,
};
