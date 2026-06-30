// In-process, per-tenant SSE pub/sub for live cross-device sync.
//
// The backend runs as a single Node process (Render), so an in-memory map of
// open SSE responses is sufficient. If the API is ever scaled to multiple
// instances, this must move to a shared bus (Redis pub/sub or Postgres
// LISTEN/NOTIFY) so an event published on one instance reaches subscribers on
// another. Today every connection for a tenant lives in this one process.

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const channels = new Map();

function subscribe(tenantId, res) {
  let set = channels.get(tenantId);
  if (!set) { set = new Set(); channels.set(tenantId, set); }
  set.add(res);
  return function unsubscribe() {
    const s = channels.get(tenantId);
    if (!s) return;
    s.delete(res);
    if (s.size === 0) channels.delete(tenantId);
  };
}

// Broadcast a small event ({ ns, key, clientId, updatedAt }) to every open
// connection for a tenant. Clients use it as a "this namespace changed - refetch"
// signal; the originating client ignores its own echo via clientId.
function publish(tenantId, payload) {
  const set = channels.get(tenantId);
  if (!set || set.size === 0) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(line); } catch { /* dead socket - cleaned up on its own close */ }
  }
}

// Broadcast to EVERY open connection across all tenants - used for platform-wide
// events (e.g. a super-admin changed platform settings) so every user refetches live.
function publishAll(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const set of channels.values()) {
    for (const res of set) {
      try { res.write(line); } catch { /* dead socket - cleaned up on its own close */ }
    }
  }
}

module.exports = { subscribe, publish, publishAll };
