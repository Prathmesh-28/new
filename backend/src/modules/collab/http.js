// Headroom Collab — Phase 1 REST router. Mounted at /api/collab.
//
// authenticate → collabContext stamps req.collab = { tenantId, userId } (tenantId
// already respects super-admin X-Tenant-Id impersonation via the auth middleware).
// Collaboration is open to every authenticated member of the tenant — there's no
// role gate (per "build for the SMB owner + small team, not enterprise RBAC");
// access is gated by CONVERSATION MEMBERSHIP in the data layer, with RLS as the
// cross-tenant backstop. Keyset pagination only (cursor = sortable message id).

const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const { verifyAccess } = require("../../lib/jwt");
const { pool } = require("../../db");
const { collabContext } = require("./tenantContext");
const collabRealtime = require("../../lib/collabRealtime");
const collab = require("./index");

// ── Realtime stream (SSE, Phase 2) ───────────────────────────────────────────
// Declared BEFORE the header-auth middleware: EventSource can't send Authorization,
// so the token rides as a query param (same pattern as /api/kv/stream). Per-user
// fan-out — a connection only receives events for conversations the user is in.
router.get("/stream", async (req, res) => {
  let user;
  try {
    const payload = verifyAccess(String(req.query.token || ""));
    const { rows } = await pool.query("SELECT id, tenant_id FROM users WHERE id=$1", [payload.sub]);
    user = rows[0];
    if (!user) throw new Error("user not found");
  } catch { return res.status(401).end(); }
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write("retry: 5000\n\n");
  res.write(": connected\n\n");
  // Snapshot of who's currently online (before we add ourselves), so the new client
  // can render presence immediately without waiting for the next presence:update.
  res.write(`data: ${JSON.stringify({ type: "presence:snapshot", userIds: collabRealtime.onlineUsers(user.tenant_id) })}\n\n`);
  const unsubscribe = collabRealtime.subscribe(user.tenant_id, user.id, res);
  const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 25000);
  req.on("close", () => { clearInterval(hb); unsubscribe(); });
});

router.use(authenticate, collabContext);

const T = (req) => req.collab.tenantId;
const U = (req) => req.collab.userId;
const fail = (res, e) => {
  if (e instanceof collab.CollabError) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[collab]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// ── Teams ────────────────────────────────────────────────────────────────────
router.get("/teams", async (req, res) => { try { res.json(await collab.listTeams(T(req), U(req))); } catch (e) { fail(res, e); } });
router.post("/teams", async (req, res) => { try { res.status(201).json(await collab.createTeam(T(req), U(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/teams/:id/members", async (req, res) => { try { res.json(await collab.addTeamMember(T(req), U(req), req.params.id, (req.body || {}).userId)); } catch (e) { fail(res, e); } });

// ── Conversations ──────────────────────────────────────────────────────────────
router.get("/conversations", async (req, res) => { try { res.json(await collab.listConversations(T(req), U(req))); } catch (e) { fail(res, e); } });
router.post("/conversations", async (req, res) => { try { res.status(201).json(await collab.createConversation(T(req), U(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/conversations/:id", async (req, res) => { try { res.json(await collab.getConversation(T(req), U(req), req.params.id)); } catch (e) { fail(res, e); } });
router.patch("/conversations/:id", async (req, res) => { try { res.json(await collab.updateConversation(T(req), U(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/conversations/:id/members", async (req, res) => { try { res.json(await collab.addMember(T(req), U(req), req.params.id, (req.body || {}).userId)); } catch (e) { fail(res, e); } });
router.delete("/conversations/:id/members/:userId", async (req, res) => { try { res.json(await collab.removeMember(T(req), U(req), req.params.id, req.params.userId)); } catch (e) { fail(res, e); } });

// ── Messages (keyset: ?before=<id> older · ?after=<id> gap-recovery) ──────────
router.get("/conversations/:id/messages", async (req, res) => {
  try { res.json(await collab.listMessages(T(req), U(req), req.params.id, { before: req.query.before, after: req.query.after, limit: req.query.limit })); } catch (e) { fail(res, e); }
});
router.post("/conversations/:id/messages", async (req, res) => {
  try { res.status(201).json(await collab.postMessage(T(req), U(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); }
});
router.patch("/messages/:id", async (req, res) => { try { res.json(await collab.editMessage(T(req), U(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/messages/:id", async (req, res) => { try { res.json(await collab.deleteMessage(T(req), U(req), req.params.id)); } catch (e) { fail(res, e); } });

// ── Read state ───────────────────────────────────────────────────────────────
router.post("/conversations/:id/read", async (req, res) => {
  try { res.json(await collab.advanceRead(T(req), U(req), req.params.id, (req.body || {}).lastReadMessageId)); } catch (e) { fail(res, e); }
});
router.get("/me/unreads", async (req, res) => { try { res.json(await collab.unreads(T(req), U(req))); } catch (e) { fail(res, e); } });
router.get("/members", async (req, res) => { try { res.json(await collab.listTeammates(T(req), U(req))); } catch (e) { fail(res, e); } });
router.post("/conversations/:id/typing", async (req, res) => { try { res.json(await collab.typing(T(req), U(req), req.params.id, (req.body || {}).typing)); } catch (e) { fail(res, e); } });

// ── Reactions ────────────────────────────────────────────────────────────────
router.put("/messages/:id/reactions/:emoji", async (req, res) => { try { res.json(await collab.addReaction(T(req), U(req), req.params.id, req.params.emoji)); } catch (e) { fail(res, e); } });
router.delete("/messages/:id/reactions/:emoji", async (req, res) => { try { res.json(await collab.removeReaction(T(req), U(req), req.params.id, req.params.emoji)); } catch (e) { fail(res, e); } });

// ── Threads ──────────────────────────────────────────────────────────────────
router.get("/messages/:id/thread", async (req, res) => { try { res.json(await collab.listThread(T(req), U(req), req.params.id)); } catch (e) { fail(res, e); } });

// ── Notifications ────────────────────────────────────────────────────────────
router.get("/notifications", async (req, res) => { try { res.json(await collab.listNotifications(T(req), U(req), { unreadOnly: req.query.unread === "1" })); } catch (e) { fail(res, e); } });
router.post("/notifications/read", async (req, res) => { try { res.json(await collab.markNotificationsRead(T(req), U(req), (req.body || {}).ids)); } catch (e) { fail(res, e); } });

// ── Pins ─────────────────────────────────────────────────────────────────────
router.get("/conversations/:id/pins", async (req, res) => { try { res.json(await collab.listPins(T(req), U(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/conversations/:id/pins", async (req, res) => { try { res.json(await collab.pinMessage(T(req), U(req), req.params.id, (req.body || {}).messageId)); } catch (e) { fail(res, e); } });
router.delete("/conversations/:id/pins/:messageId", async (req, res) => { try { res.json(await collab.unpinMessage(T(req), U(req), req.params.id, req.params.messageId)); } catch (e) { fail(res, e); } });

// ── Search ───────────────────────────────────────────────────────────────────
router.get("/search", async (req, res) => { try { res.json(await collab.searchMessages(T(req), U(req), req.query.q)); } catch (e) { fail(res, e); } });

// ── Contextual links (anchor a conversation to a financial object) ────────────
router.get("/conversations/:id/links", async (req, res) => { try { res.json(await collab.listLinks(T(req), U(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/conversations/:id/links", async (req, res) => { try { const b = req.body || {}; res.status(201).json(await collab.addLink(T(req), U(req), req.params.id, b.entityType, b.entityId)); } catch (e) { fail(res, e); } });
router.delete("/conversations/:id/links/:entityType/:entityId", async (req, res) => { try { res.json(await collab.removeLink(T(req), U(req), req.params.id, req.params.entityType, req.params.entityId)); } catch (e) { fail(res, e); } });
router.get("/entity-conversations", async (req, res) => { try { res.json(await collab.conversationsForEntity(T(req), U(req), req.query.type, req.query.id)); } catch (e) { fail(res, e); } });

module.exports = router;
