// Collab realtime (Phase 2/3) - in-process, PER-USER SSE fan-out + presence.
//
// Unlike lib/realtime.js (per-tenant broadcast), collab events must reach only the
// MEMBERS of a conversation - a DM or private channel can't leak to every user in the
// tenant. Connections are keyed by (tenantId, userId). Presence is derived from "has
// at least one open SSE connection", with a short grace on disconnect so a reload /
// navigation doesn't flap online→offline→online. Single Node process on Render →
// in-memory; if multi-instance, move to a shared bus (Redis / LISTEN-NOTIFY).

/** @type {Map<string, Set<import('http').ServerResponse>>} key = `${tenantId}|${userId}` */
const channels = new Map();
/** @type {Map<string, Map<string, number>>} tenantId -> (userId -> open-connection count) */
const online = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} pending offline announcements, key `${tenantId}|${userId}` */
const pendingOffline = new Map();
const OFFLINE_GRACE_MS = 5000;

const keyOf = (tenantId, userId) => `${tenantId}|${userId}`;

function emitToUsers(tenantId, userIds, event) {
  if (!Array.isArray(userIds) || !userIds.length) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const userId of userIds) {
    const set = channels.get(keyOf(tenantId, userId));
    if (!set) continue;
    for (const res of set) { try { res.write(line); } catch { /* dead socket */ } }
  }
}

function onlineUsers(tenantId) {
  const m = online.get(tenantId);
  return m ? [...m.keys()] : [];
}

// Broadcast to every connected user in a tenant (optionally excluding one).
function emitToTenant(tenantId, event, exceptUserId) {
  emitToUsers(tenantId, onlineUsers(tenantId).filter((u) => u !== exceptUserId), event);
}

function subscribe(tenantId, userId, res) {
  const k = keyOf(tenantId, userId);
  let set = channels.get(k);
  if (!set) { set = new Set(); channels.set(k, set); }
  set.add(res);

  let tmap = online.get(tenantId);
  if (!tmap) { tmap = new Map(); online.set(tenantId, tmap); }
  const prevCount = tmap.get(userId) || 0;
  tmap.set(userId, prevCount + 1);
  const po = pendingOffline.get(k);
  if (po) { clearTimeout(po); pendingOffline.delete(k); }
  if (prevCount === 0) emitToTenant(tenantId, { type: "presence:update", userId, status: "online" }, userId);

  return function unsubscribe() {
    const s = channels.get(k);
    if (s) { s.delete(res); if (s.size === 0) channels.delete(k); }
    const tm = online.get(tenantId);
    if (!tm) return;
    const c = (tm.get(userId) || 1) - 1;
    if (c > 0) { tm.set(userId, c); return; }
    tm.delete(userId);
    if (tm.size === 0) online.delete(tenantId);
    // Grace: only announce offline if they haven't reconnected within the window.
    const t = setTimeout(() => {
      pendingOffline.delete(k);
      if (!online.get(tenantId)?.has(userId)) emitToTenant(tenantId, { type: "presence:update", userId, status: "offline" }, userId);
    }, OFFLINE_GRACE_MS);
    pendingOffline.set(k, t);
  };
}

module.exports = { subscribe, emitToUsers, emitToTenant, onlineUsers };
