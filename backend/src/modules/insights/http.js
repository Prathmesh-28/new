// Insights API — /api/insights. Reuses Headroom auth (read-only KPIs + dashboards).
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const insights = require("./index");
const { financialYearFor } = require("../books/fy");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fyOf = (req) => (req.query.fy ? String(req.query.fy) : financialYearFor(new Date()));
const fail = (res, e) => { console.error("[insights]", e.message); res.status(500).json({ error: "Internal error" }); };

router.get("/overview", async (req, res) => { try { res.json(await insights.overview(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/metrics", async (_req, res) => { res.json(insights.metricsCatalog()); });
router.get("/dashboards", async (req, res) => { try { res.json(await insights.listDashboards(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/dashboards", async (req, res) => { try { res.status(201).json(await insights.createDashboard(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/dashboards/:id", async (req, res) => { try { res.json(await insights.deleteDashboard(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

module.exports = router;
