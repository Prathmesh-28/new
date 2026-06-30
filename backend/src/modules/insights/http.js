// Insights API - /api/insights. Reuses Headroom auth.
//   - Live cross-module KPIs + saved dashboards (existing).
//   - A SAFE query engine: datasets catalogue, saved queries, run (saved or inline),
//     and saved charts. Compilation/validation lives in index.js - every query is a
//     structured model over a whitelisted dataset, never raw SQL.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const insights = require("./index");
const { pool } = require("../../db");
const { financialYearFor } = require("../books/fy");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fyOf = (req) => (req.query.fy ? String(req.query.fy) : financialYearFor(new Date()));
const fail = (res, e) => { console.error("[insights]", e.message); res.status(500).json({ error: "Internal error" }); };

// Creator-scoped delete guard: a user may only delete saved objects they created.
// Verifies the row's created_by matches the caller before the delete proceeds
// (tables store a created_by column - see modules/insights/index.js). super_admin is
// exempt so platform admins can still clean up. Returns true if the caller may delete.
const ALLOWED_DELETE_TABLES = new Set(["insights_dashboards", "insights_queries", "insights_charts"]);
async function ownsObject(req, table, id) {
  if (req.user.role === "super_admin") return true;
  if (!ALLOWED_DELETE_TABLES.has(table)) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM ${table} WHERE tenant_id=$1 AND id=$2 AND created_by=$3`,
    [tenantOf(req), id, req.user.id]
  );
  return rows.length > 0;
}
// Bad-request for user-facing validation errors (unknown dataset/column/operator etc.)
// so the query builder can surface the exact reason without leaking internals.
const failBad = (res, e) => { res.status(400).json({ error: e.message || "Bad request" }); };

// ── Live overview + dashboards (existing) ────────────────────────────────────
router.get("/overview", async (req, res) => { try { res.json(await insights.overview(tenantOf(req), fyOf(req))); } catch (e) { fail(res, e); } });
router.get("/metrics", async (_req, res) => { res.json(insights.metricsCatalog()); });
router.get("/dashboards", async (req, res) => { try { res.json(await insights.listDashboards(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/dashboards", async (req, res) => { try { res.status(201).json(await insights.createDashboard(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });
router.delete("/dashboards/:id", async (req, res) => { try { if (!(await ownsObject(req, "insights_dashboards", req.params.id))) return res.status(403).json({ error: "You can only delete your own dashboards" }); res.json(await insights.deleteDashboard(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

// ── Query engine ─────────────────────────────────────────────────────────────
// Dataset whitelist catalogue (safe metadata only).
router.get("/datasets", async (_req, res) => { res.json(insights.datasetsCatalog()); });

// Run an inline model without saving it.
router.post("/query/run", async (req, res) => {
  try { res.json(await insights.runQuery(tenantOf(req), req.body || {})); }
  catch (e) { failBad(res, e); }
});

// Saved queries.
router.get("/queries", async (req, res) => { try { res.json(await insights.listQueries(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/queries", async (req, res) => {
  try { res.status(201).json(await insights.saveQuery(tenantOf(req), req.user.id, req.body || {})); }
  catch (e) { failBad(res, e); }
});
router.post("/queries/:id/run", async (req, res) => {
  try { res.json(await insights.runSavedQuery(tenantOf(req), req.params.id)); }
  catch (e) { failBad(res, e); }
});
router.delete("/queries/:id", async (req, res) => { try { if (!(await ownsObject(req, "insights_queries", req.params.id))) return res.status(403).json({ error: "You can only delete your own queries" }); res.json(await insights.deleteQuery(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

// Saved charts (reference a query + a render config).
router.get("/charts", async (req, res) => { try { res.json(await insights.listCharts(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/charts", async (req, res) => {
  try { res.status(201).json(await insights.saveChart(tenantOf(req), req.user.id, req.body || {})); }
  catch (e) { failBad(res, e); }
});
router.delete("/charts/:id", async (req, res) => { try { if (!(await ownsObject(req, "insights_charts", req.params.id))) return res.status(403).json({ error: "You can only delete your own charts" }); res.json(await insights.deleteChart(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

module.exports = router;
