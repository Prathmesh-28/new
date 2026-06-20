// CRM API — /api/crm. Tenant-scoped; reuses Headroom auth. Writes allowed to
// owner/super_admin/finance_manager/accountant/sales (CRM is a sales surface).
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const crm = require("./index");

router.use(authenticate);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fail = (res, e) => { if (e instanceof crm.CrmError) return res.status(e.http).json({ error: e.message }); console.error("[crm]", e.message); return res.status(500).json({ error: "Internal error" }); };

router.get("/pipeline", async (req, res) => { try { res.json(await crm.pipeline(tenantOf(req))); } catch (e) { fail(res, e); } });
// stage→probability + status vocabulary metadata (for the UI)
router.get("/meta", async (req, res) => {
  try {
    res.json({
      leadStatuses: crm.LEAD_STATUSES, dealStatuses: crm.DEAL_STATUSES, stageOrder: crm.OPEN_STAGES,
      taskStatuses: crm.TASK_STATUSES, taskPriorities: crm.TASK_PRIORITIES,
    });
  } catch (e) { fail(res, e); }
});

// ── SLA config ─────────────────────────────────────────────────────────────────────
router.get("/slas", async (req, res) => { try { res.json(await crm.listSlas(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/slas", canWrite, async (req, res) => { try { res.status(201).json(await crm.createSla(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── Accounts / contacts ──────────────────────────────────────────────────────────────
router.get("/accounts", async (req, res) => { try { res.json(await crm.listAccounts(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/accounts", canWrite, async (req, res) => { try { res.status(201).json(await crm.createAccount(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/contacts", async (req, res) => { try { res.json(await crm.listContacts(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/contacts", canWrite, async (req, res) => { try { res.status(201).json(await crm.createContact(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── Leads ────────────────────────────────────────────────────────────────────────────
router.get("/leads", async (req, res) => { try { res.json(await crm.listLeads(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/leads", canWrite, async (req, res) => { try { res.status(201).json(await crm.createLead(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/leads/:id", async (req, res) => { try { res.json(await crm.getLead(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/leads/:id/status", canWrite, async (req, res) => { try { res.json(await crm.setLeadStatus(tenantOf(req), req.user.id, req.params.id, (req.body || {}).status)); } catch (e) { fail(res, e); } });
router.post("/leads/:id/lost-reason", canWrite, async (req, res) => { try { res.json(await crm.setLeadLostReason(tenantOf(req), req.params.id, (req.body || {}).reason)); } catch (e) { fail(res, e); } });
router.post("/leads/:id/convert", canWrite, async (req, res) => { try { res.status(201).json(await crm.convertLead(tenantOf(req), req.user.id, req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/leads/:id/timeline", async (req, res) => { try { res.json(await crm.timeline(tenantOf(req), "LEAD", req.params.id)); } catch (e) { fail(res, e); } });

// ── Deals / pipeline ─────────────────────────────────────────────────────────────────
router.get("/deals", async (req, res) => { try { res.json(await crm.listDeals(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/deals", canWrite, async (req, res) => { try { res.status(201).json(await crm.createDeal(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/deals/:id", async (req, res) => { try { res.json(await crm.getDeal(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/deals/:id/stage", canWrite, async (req, res) => { try { res.json(await crm.moveStage(tenantOf(req), req.user.id, req.params.id, (req.body || {}).stage, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/deals/:id/win", canWrite, async (req, res) => { try { res.json(await crm.winDeal(tenantOf(req), req.user.id, req.params.id)); } catch (e) { fail(res, e); } });
router.post("/deals/:id/primary-contact", canWrite, async (req, res) => { try { res.json(await crm.setPrimaryContact(tenantOf(req), req.params.id, (req.body || {}).contactId)); } catch (e) { fail(res, e); } });
router.get("/deals/:id/timeline", async (req, res) => { try { res.json(await crm.timeline(tenantOf(req), "DEAL", req.params.id)); } catch (e) { fail(res, e); } });

// ── Tasks ──────────────────────────────────────────────────────────────────────────
router.get("/tasks", async (req, res) => { try { res.json(await crm.listTasks(tenantOf(req), { referenceType: req.query.referenceType, referenceId: req.query.referenceId })); } catch (e) { fail(res, e); } });
router.post("/tasks", canWrite, async (req, res) => { try { res.status(201).json(await crm.createTask(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/tasks/:id/status", canWrite, async (req, res) => { try { res.json(await crm.setTaskStatus(tenantOf(req), req.params.id, (req.body || {}).status)); } catch (e) { fail(res, e); } });
router.post("/tasks/:id/done", canWrite, async (req, res) => { try { res.json(await crm.completeTask(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

// ── Notes ────────────────────────────────────────────────────────────────────────────
router.get("/notes", async (req, res) => { try { res.json(await crm.listNotes(tenantOf(req), { referenceType: req.query.referenceType, referenceId: req.query.referenceId })); } catch (e) { fail(res, e); } });
router.post("/notes", canWrite, async (req, res) => { try { res.status(201).json(await crm.createNote(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });

// ── Activities ───────────────────────────────────────────────────────────────────────
router.get("/activities", async (req, res) => { try { res.json(await crm.listActivities(tenantOf(req), { dealId: req.query.dealId, leadId: req.query.leadId })); } catch (e) { fail(res, e); } });
router.post("/activities", canWrite, async (req, res) => { try { res.status(201).json(await crm.logActivity(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/activities/:id/done", canWrite, async (req, res) => { try { res.json(await crm.completeActivity(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

module.exports = router;
