// Headroom Collab — shared contract (Phase 0), backend (JS) side.
//
// The build spec asks for a shared TypeScript types package imported by both
// server and client. Headroom's backend is CommonJS JS (not TS), so the contract
// lives in two mirrored files that MUST be kept in lockstep:
//   • this file — runtime constants (enum values, socket event names) the JS
//     server validates against, plus JSDoc typedefs for editor help.
//   • src/features/collab/types.ts — the canonical TypeScript types the React
//     client imports (Message, Conversation, ClientToServer/ServerToClient, …).
// When you change one, change the other. The enum string values and event names
// below are the single source of truth both sides agree on.

// ── Enum value sets (mirror the TEXT+CHECK constraints in schema.js) ──────────
const CONVERSATION_TYPES = ["channel", "group", "dm"];
const CONVERSATION_VISIBILITY = ["public", "private"];
const MEMBER_ROLES = ["owner", "admin", "member", "guest"];
const NOTIFY_PREFS = ["all", "mentions", "none"];
const MENTION_KINDS = ["user", "channel", "everyone"];
const MESSAGE_TYPES = ["normal", "system"];
const NOTIFICATION_KINDS = ["message", "mention", "reaction", "thread_reply", "system"];
const CONTEXTUAL_ENTITY_TYPES = ["client", "deal", "reconciliation", "invoice", "gst_filing"];
const PRESENCE_STATUS = ["online", "away", "offline"];

// ── Socket event names (spec §3) ──────────────────────────────────────────────
// client → server
const CLIENT_EVENTS = {
  MESSAGE_SEND: "message:send",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_DELETE: "message:delete",
  REACTION_ADD: "reaction:add",
  REACTION_REMOVE: "reaction:remove",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  READ_ADVANCE: "read:advance",
  CONVERSATION_JOIN: "conversation:join",
  CONVERSATION_LEAVE: "conversation:leave",
};

// server → client
const SERVER_EVENTS = {
  MESSAGE_NEW: "message:new",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  REACTION_UPDATED: "reaction:updated",
  TYPING: "typing",
  PRESENCE_UPDATE: "presence:update",
  READ_UPDATED: "read:updated",
  NOTIFICATION_NEW: "notification:new",
  CONVERSATION_UPDATED: "conversation:updated",
  MEMBER_CHANGED: "member:changed",
};

// Socket.IO room name helpers (spec §3 "Rooms").
const rooms = {
  user: (userId) => `user:${userId}`,
  conversation: (conversationId) => `conversation:${conversationId}`,
  tenant: (tenantId) => `tenant:${tenantId}`,
};

/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} fileKey
 * @property {string} fileName
 * @property {string} mimeType
 * @property {number} sizeBytes
 * @property {number|null} [width]
 * @property {number|null} [height]
 * @property {string|null} [thumbnailKey]
 *
 * @typedef {Object} Reaction
 * @property {string} emoji
 * @property {string[]} userIds
 *
 * @typedef {Object} Message
 * @property {string} id                       UUIDv7 — sortable, defines order
 * @property {string} conversationId
 * @property {string} senderId
 * @property {string|null} parentMessageId
 * @property {string} body
 * @property {unknown} [richContent]
 * @property {Attachment[]} attachments
 * @property {Reaction[]} reactions
 * @property {number} threadReplyCount
 * @property {string|null} editedAt
 * @property {string|null} deletedAt
 * @property {string} createdAt
 * @property {string} [clientMsgId]            echoed back so the sender reconciles its optimistic copy
 *
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {'channel'|'group'|'dm'} type
 * @property {string|null} teamId
 * @property {string|null} name
 * @property {string|null} topic
 * @property {'public'|'private'} visibility
 * @property {string|null} lastMessageId
 * @property {string|null} lastMessageAt
 * @property {number} [unreadCount]
 * @property {number} [mentionCount]
 */

module.exports = {
  CONVERSATION_TYPES,
  CONVERSATION_VISIBILITY,
  MEMBER_ROLES,
  NOTIFY_PREFS,
  MENTION_KINDS,
  MESSAGE_TYPES,
  NOTIFICATION_KINDS,
  CONTEXTUAL_ENTITY_TYPES,
  PRESENCE_STATUS,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  rooms,
};
