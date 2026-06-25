// Collab realtime (Phase 2) — in-process, PER-USER SSE fan-out.
//
// Unlike lib/realtime.js (per-tenant broadcast), collab events must reach only the
// MEMBERS of a conversation — a DM or private channel can't leak to every user in the
// tenant. So connections are keyed by (tenantId, userId) and the data layer emits to
// the specific member ids. Single Node process on Render → an in-memory map suffices;
// if the API is ever multi-instance this must move to a shared bus (Redis / LISTEN-NOTIFY).

/** @type {Map<string, Set<import('http').ServerResponse>>} key = `${tenantId}|${userId}` */
const channels = new Map();
const keyOf = (tenantId, userId) => `${tenantId}|${userId}`;

function subscribe(tenantId, userId, res) {
  const k = keyOf(tenantId, userId);
  let set = channels.get(k);
  if (!set) { set = new Set(); channels.set(k, set); }
  set.add(res);
  return function unsubscribe() {
    const s = channels.get(k);
    if (!s) return;
    s.delete(res);
    if (s.size === 0) channels.delete(k);
  };
}

// Emit one event to a set of users within a tenant (e.g. a conversation's members).
function emitToUsers(tenantId, userIds, event) {
  if (!Array.isArray(userIds) || !userIds.length) return;
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const userId of userIds) {
    const set = channels.get(keyOf(tenantId, userId));
    if (!set) continue;
    for (const res of set) {
      try { res.write(line); } catch { /* dead socket — cleaned up on its own close */ }
    }
  }
}

module.exports = { subscribe, emitToUsers };
