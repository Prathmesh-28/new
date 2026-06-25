// Headroom Collab — shared contract (Phase 0), client (TypeScript) side.
//
// Canonical TypeScript types for the collaboration layer (Teams-style chat). The
// backend mirrors the enum string values and socket event names in
// backend/src/modules/collab/contract.js — keep the two in lockstep.
//
// Wire shapes are tenant-agnostic on purpose: the server resolves the tenant from
// the JWT and enforces it (org membership + RLS), so no tenant/org id travels on
// the wire. Ordering is by the sortable `id` (UUIDv7); clients sort locally by id.

// ── Enums (mirror the TEXT+CHECK constraints in schema.js) ────────────────────
export type ConversationType = "channel" | "group" | "dm";
export type ConversationVisibility = "public" | "private";
export type MemberRole = "owner" | "admin" | "member" | "guest";
export type NotifyPref = "all" | "mentions" | "none";
export type MentionKind = "user" | "channel" | "everyone";
export type MessageType = "normal" | "system";
export type NotificationKind = "message" | "mention" | "reaction" | "thread_reply" | "system";
export type ContextualEntityType = "client" | "deal" | "reconciliation" | "invoice" | "gst_filing";
export type PresenceStatus = "online" | "away" | "offline";

// ── Core entities ─────────────────────────────────────────────────────────────
export interface Team {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  visibility: ConversationVisibility;
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: MemberRole;
  joinedAt: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  teamId: string | null;
  name: string | null;
  topic: string | null;
  visibility: ConversationVisibility;
  createdBy: string;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  archivedAt: string | null;
  /** Derived for the sidebar: unread/mention badges (from the read pointer). */
  unreadCount?: number;
  mentionCount?: number;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  role: MemberRole;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  notifyPref: NotifyPref;
  mutedUntil: string | null;
  joinedAt: string;
}

export interface Attachment {
  id: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  thumbnailKey?: string | null;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Mention {
  kind: MentionKind;
  mentionedUserId: string | null;
}

export interface Message {
  id: string; // UUIDv7 (sortable) — defines ordering
  conversationId: string;
  senderId: string;
  parentMessageId: string | null; // set => thread reply
  body: string;
  richContent?: unknown; // sanitized structured blocks, never raw HTML
  attachments: Attachment[];
  reactions: Reaction[];
  threadReplyCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  clientMsgId?: string; // echoed back so the sender reconciles its optimistic copy
}

export interface PinnedMessage {
  conversationId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
}

export interface ContextualLink {
  conversationId: string;
  entityType: ContextualEntityType;
  entityId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  conversationId: string | null;
  sourceMessageId: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Unreads {
  totalUnread: number;
  totalMentions: number;
  byConversation: Record<string, { unread: number; mentions: number }>;
}

// ── Socket event contract (spec §3) ───────────────────────────────────────────
// Optimistic-send reconciliation is keyed on clientMsgId; the socket carries only
// live deltas — history & gap-recovery go through REST.
export interface ClientToServerEvents {
  "message:send": (
    p: {
      conversationId: string;
      clientMsgId: string; // client-generated idempotency key (UUID)
      body: string;
      richContent?: unknown;
      parentMessageId?: string;
      attachmentKeys?: string[];
    },
    ack: (r: { ok: true; message: Message } | { ok: false; error: string }) => void
  ) => void;
  "message:edit": (p: { messageId: string; body: string; richContent?: unknown }) => void;
  "message:delete": (p: { messageId: string }) => void;
  "reaction:add": (p: { messageId: string; emoji: string }) => void;
  "reaction:remove": (p: { messageId: string; emoji: string }) => void;
  "typing:start": (p: { conversationId: string }) => void;
  "typing:stop": (p: { conversationId: string }) => void;
  "read:advance": (p: { conversationId: string; lastReadMessageId: string }) => void;
  "conversation:join": (p: { conversationId: string }) => void;
  "conversation:leave": (p: { conversationId: string }) => void;
}

export interface ServerToClientEvents {
  "message:new": (m: Message) => void;
  "message:updated": (m: Message) => void;
  "message:deleted": (p: { messageId: string; conversationId: string }) => void;
  "reaction:updated": (p: { messageId: string; emoji: string; userId: string; added: boolean }) => void;
  "typing": (p: { conversationId: string; userId: string; typing: boolean }) => void;
  "presence:update": (p: { userId: string; status: PresenceStatus; lastSeen?: string }) => void;
  "read:updated": (p: { conversationId: string; userId: string; lastReadMessageId: string }) => void;
  "notification:new": (n: Notification) => void;
  "conversation:updated": (c: Conversation) => void;
  "member:changed": (p: { conversationId: string; userId: string; action: "joined" | "left" }) => void;
}

// Event-name constants (mirror backend contract.js) for emit/on call sites.
export const CLIENT_EVENTS = {
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
} as const;

export const SERVER_EVENTS = {
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
} as const;
