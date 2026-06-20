// ERP API — /api/erp — manufacturing: BOMs (with operations + cost rollup +
// multi-level explosion), work orders (lifecycle: transfer → manufacture), job
// cards (per-operation time logging), material requests + reorder report.
// Reuses Headroom auth; stock + valuation truth stays in the books module.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const erp = require("./index");

router.use(authenticate);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fail = (res, e) => {
  if (e instanceof erp.ErpError || e.http) return res.status(e.http || 422).json({ error: e.message });
  console.error("[erp]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// ── BOMs ──────────────────────────────────────────────────────────────────────
router.get("/boms", async (req, res) => { try { res.json(await erp.listBoms(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/boms/:id", async (req, res) => { try { res.json(await erp.getBom(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.get("/boms/:id/explode", async (req, res) => { try { res.json(await erp.explodedBom(tenantOf(req), req.params.id, req.query.qty)); } catch (e) { fail(res, e); } });
router.post("/boms", canWrite, async (req, res) => { try { res.status(201).json(await erp.createBom(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── Work orders ─────────────────────────────────────────────────────────────
router.get("/work-orders", async (req, res) => { try { res.json(await erp.listWorkOrders(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/work-orders/:id", async (req, res) => { try { res.json(await erp.getWorkOrder(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/work-orders", canWrite, async (req, res) => { try { res.status(201).json(await erp.createWorkOrder(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
// lifecycle: transfer materials into WIP (NOT_STARTED → IN_PROCESS)
router.post("/work-orders/:id/transfer", canWrite, async (req, res) => { try { res.json(await erp.transferMaterials(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
// lifecycle: manufacture — receive finished good at component+operating cost (→ COMPLETED)
router.post("/work-orders/:id/manufacture", canWrite, async (req, res) => { try { res.json(await erp.manufacture(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
// back-compat aliases for the older /start /complete verbs
router.post("/work-orders/:id/start", canWrite, async (req, res) => { try { res.json(await erp.transferMaterials(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/work-orders/:id/complete", canWrite, async (req, res) => { try { res.json(await erp.manufacture(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });

// ── Job cards ─────────────────────────────────────────────────────────────────
router.post("/work-orders/:id/job-cards/start", canWrite, async (req, res) => { try { res.status(201).json(await erp.startJobCard(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/job-cards/:id/complete", canWrite, async (req, res) => { try { res.json(await erp.completeJobCard(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });

// ── Material requests + reorder ───────────────────────────────────────────────
router.get("/material-requests", async (req, res) => { try { res.json(await erp.listMaterialRequests(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/material-requests", canWrite, async (req, res) => { try { res.status(201).json(await erp.createMaterialRequest(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/material-requests/:id/order", canWrite, async (req, res) => { try { res.json(await erp.markOrdered(tenantOf(req), req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
router.get("/reorder", async (req, res) => { try { res.json(await erp.reorderReport(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/reorder/raise", canWrite, async (req, res) => { try { res.status(201).json(await erp.raiseReorderRequest(tenantOf(req), req.user.id)); } catch (e) { fail(res, e); } });

module.exports = router;
