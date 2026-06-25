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
const { collabContext } = require("./tenantContext");
const collab = require("./index");

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

module.exports = router;
