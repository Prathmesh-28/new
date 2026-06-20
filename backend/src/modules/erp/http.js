// ERP API — /api/erp (BOMs + work orders). Reuses Headroom auth.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const erp = require("./index");

router.use(authenticate);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "operations_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fail = (res, e) => { if (e instanceof erp.ErpError || e.http) return res.status(e.http || 422).json({ error: e.message }); console.error("[erp]", e.message); return res.status(500).json({ error: "Internal error" }); };

router.get("/boms", async (req, res) => { try { res.json(await erp.listBoms(tenantOf(req))); } catch (e) { fail(res, e); } });
router.get("/boms/:id", async (req, res) => { try { res.json(await erp.getBom(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/boms", canWrite, async (req, res) => { try { res.status(201).json(await erp.createBom(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

router.get("/work-orders", async (req, res) => { try { res.json(await erp.listWorkOrders(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/work-orders", canWrite, async (req, res) => { try { res.status(201).json(await erp.createWorkOrder(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.post("/work-orders/:id/start", canWrite, async (req, res) => { try { res.json(await erp.startWorkOrder(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });
router.post("/work-orders/:id/complete", canWrite, async (req, res) => { try { res.json(await erp.completeWorkOrder(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

module.exports = router;
