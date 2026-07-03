"use strict";
// Counterparty intelligence REST — mounted at /api/counterparty. Read surfaces (dedup groups,
// customer scores, risk summary, provider status) are open to any authed member; writes
// (enrich, invite) are role-gated. External enrichment is honestly reported as gated when a
// provider isn't configured.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const cp = require("./index");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof cp.CounterpartyError) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[counterparty]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

router.get("/providers", (req, res) => res.json(cp.providerStatus()));
router.get("/dedupe-groups", async (req, res) => { try { res.json(await cp.dedupeGroups(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/scores", async (req, res) => { try { res.json(await cp.customerScores(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/risk-summary", async (req, res) => { try { res.json(await cp.riskSummary(tenantOf(req))); } catch (e) { fail(res, e); } });

router.get("/enrichments", async (req, res) => { try { res.json(await cp.listEnrichments(tenantOf(req), { kind: req.query.kind })); } catch (e) { fail(res, e); } });
router.post("/enrich", canWrite, async (req, res) => {
  try { const b = req.body || {}; res.json(await cp.enrich(tenantOf(req), b.kind, b.identifier, { force: !!b.force })); } catch (e) { fail(res, e); }
});

router.get("/invites", async (req, res) => { try { res.json(await cp.listInvites(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/invite", canWrite, async (req, res) => {
  try {
    const b = req.body || {};
    const out = await cp.inviteCounterparty(tenantOf(req), req.user.id, { name: b.name, email: b.email, phone: b.phone, relation: b.relation });
    require("../analytics").track(req.user.tenant_id, req.user.id, { event: "counterparty_invited", props: { relation: b.relation, channels: out.sent_on } }).catch(() => {});
    res.status(201).json(out);
  } catch (e) { fail(res, e); }
});

module.exports = router;
