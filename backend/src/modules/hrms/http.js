// HRMS API — /api/hrms. Reuses Headroom auth.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const hr = require("./index");

router.use(authenticate);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fail = (res, e) => { if (e instanceof hr.HrError || e.http) return res.status(e.http || 422).json({ error: e.message }); console.error("[hrms]", e.message); return res.status(500).json({ error: "Internal error" }); };

router.get("/employees", async (req, res) => { try { res.json(await hr.listEmployees(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/employees", canWrite, async (req, res) => { try { res.status(201).json(await hr.createEmployee(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/employees/:id/status", canWrite, async (req, res) => { try { res.json(await hr.setEmployeeStatus(tenantOf(req), req.params.id, (req.body || {}).status)); } catch (e) { fail(res, e); } });

router.post("/attendance", canWrite, async (req, res) => { try { res.status(201).json(await hr.markAttendance(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/attendance", async (req, res) => { try { res.json(await hr.attendanceFor(tenantOf(req), req.query.employeeId, req.query.month)); } catch (e) { fail(res, e); } });

router.get("/leave", async (req, res) => { try { res.json(await hr.listLeave(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/leave", canWrite, async (req, res) => { try { res.status(201).json(await hr.requestLeave(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/leave/:id/decide", canWrite, async (req, res) => { try { res.json(await hr.decideLeave(tenantOf(req), req.params.id, !!(req.body || {}).approve)); } catch (e) { fail(res, e); } });
router.post("/leave-balance", canWrite, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await hr.setLeaveBalance(tenantOf(req), b.employeeId, b.leaveType, b.balance)); } catch (e) { fail(res, e); } });

router.post("/salary-structure", canWrite, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await hr.setSalaryStructure(tenantOf(req), b.employeeId, b)); } catch (e) { fail(res, e); } });
router.get("/payroll", async (req, res) => { try { res.json(await hr.listPayrollRuns(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/payroll/run", canWrite, async (req, res) => { try { res.status(201).json(await hr.runPayroll(tenantOf(req), req.user.id, (req.body || {}).month)); } catch (e) { fail(res, e); } });

module.exports = router;
