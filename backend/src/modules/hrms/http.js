// HRMS API - /api/hrms. Reuses Headroom auth.
//
// Domain (Frappe HR port): employees, attendance (mark/bulk/summary), leave (types →
// allocation → ledger → application → balance), salary STRUCTURES with component rows,
// structure ASSIGNMENTS (base salary), slip PREVIEW, and payroll RUN (consolidated journal).
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const hr = require("./index");

router.use(authenticate);
router.use(require("../../lib/entitlements").requireFeature("hrms"));
const WRITE_ROLES = ["super_admin", "owner", "finance_manager"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const fail = (res, e) => {
  if (e instanceof hr.HrError || e.http) return res.status(e.http || 422).json({ error: e.message });
  console.error("[hrms]", e.message);
  return res.status(500).json({ error: "Internal error" });
};

// ── Employees ────────────────────────────────────────────────────────────────
router.get("/employees", async (req, res) => { try { res.json(await hr.listEmployees(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/employees", canWrite, async (req, res) => { try { res.status(201).json(await hr.createEmployee(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/employees/bulk", canWrite, async (req, res) => { try { res.status(201).json(await hr.bulkCreateEmployees(tenantOf(req), req.user.id, (req.body || {}).rows || [])); } catch (e) { fail(res, e); } });
router.post("/employees/:id/status", canWrite, async (req, res) => { try { res.json(await hr.setEmployeeStatus(tenantOf(req), req.params.id, (req.body || {}).status)); } catch (e) { fail(res, e); } });

// ── Attendance ───────────────────────────────────────────────────────────────
router.post("/attendance", canWrite, async (req, res) => { try { res.status(201).json(await hr.markAttendance(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/attendance/bulk", canWrite, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await hr.bulkMarkAttendance(tenantOf(req), b.employeeId, b.days || [])); } catch (e) { fail(res, e); } });
router.get("/attendance", async (req, res) => { try { res.json(await hr.attendanceFor(tenantOf(req), req.query.employeeId, req.query.month)); } catch (e) { fail(res, e); } });
router.get("/attendance/summary", async (req, res) => { try { res.json(await hr.attendanceSummary(tenantOf(req), req.query.employeeId, req.query.month)); } catch (e) { fail(res, e); } });

// ── Leave types / allocation / balance / applications ──────────────────────────
router.get("/leave-types", async (req, res) => { try { res.json(await hr.listLeaveTypes(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/leave-types", canWrite, async (req, res) => { try { res.status(201).json(await hr.createLeaveType(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/leave-allocations", canWrite, async (req, res) => { try { res.status(201).json(await hr.allocateLeave(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/leave-balances", async (req, res) => { try { res.json(await hr.leaveBalances(tenantOf(req), req.query.employeeId)); } catch (e) { fail(res, e); } });

router.get("/leave", async (req, res) => { try { res.json(await hr.listLeave(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/leave", canWrite, async (req, res) => { try { res.status(201).json(await hr.requestLeave(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/leave/:id/decide", canWrite, async (req, res) => { try { res.json(await hr.decideLeave(tenantOf(req), req.params.id, !!(req.body || {}).approve)); } catch (e) { fail(res, e); } });

// ── Salary structures + assignments + slip preview ─────────────────────────────
router.get("/structures", async (req, res) => { try { res.json(await hr.listStructures(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/structures", canWrite, async (req, res) => { try { res.status(201).json(await hr.createStructure(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/assignments", async (req, res) => { try { res.json(await hr.listAssignments(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/assignments", canWrite, async (req, res) => { try { res.status(201).json(await hr.assignStructure(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/slip-preview", async (req, res) => { try { res.json(await hr.previewSlip(tenantOf(req), req.query.employeeId, req.query.month)); } catch (e) { fail(res, e); } });

// ── Payroll runs (two-stage GL: accrual on run, payment on pay) ─────────────────
router.get("/payroll", async (req, res) => { try { res.json(await hr.listPayrollRuns(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/payroll/run", canWrite, async (req, res) => { try { const b = req.body || {}; res.status(201).json(await hr.runPayroll(tenantOf(req), req.user.id, b.month, { costCentreId: b.costCentreId })); } catch (e) { fail(res, e); } });
router.post("/payroll/:id/pay", canWrite, async (req, res) => { try { const b = req.body || {}; res.json(await hr.payPayrollRun(tenantOf(req), req.user.id, req.params.id, { bankLedger: b.bankLedger, date: b.date })); } catch (e) { fail(res, e); } });
router.get("/payroll/:id/payslips", async (req, res) => { try { res.json(await hr.payslipsForRun(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); } });

// ── (3) Formula-driven salary components ────────────────────────────────────────
router.get("/components", async (req, res) => { try { res.json(await hr.listSalaryComponents(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/components", canWrite, async (req, res) => { try { res.status(201).json(await hr.createSalaryComponent(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/components/validate", async (req, res) => { try { res.json(hr.validateComponentSet((req.body || {}).components || [])); } catch (e) { fail(res, e); } });

// ── (1) Payroll period config + annualized TDS projection ───────────────────────
router.get("/payroll-period", async (req, res) => { try { res.json(await hr.getOrCreatePayrollPeriod(tenantOf(req), req.query.fy)); } catch (e) { fail(res, e); } });
router.post("/payroll-period", canWrite, async (req, res) => { try { const b = req.body || {}; res.json(await hr.setPayrollPeriod(tenantOf(req), b.fy, { regime: b.regime, standardDeduction: b.standardDeduction })); } catch (e) { fail(res, e); } });
router.get("/tds/projections", async (req, res) => { try { res.json(await hr.listTdsProjections(tenantOf(req), req.query.fy)); } catch (e) { fail(res, e); } });
router.get("/tds/projection", async (req, res) => { try { res.json(await hr.getTdsProjection(tenantOf(req), req.query.employeeId, req.query.fy)); } catch (e) { fail(res, e); } });
router.post("/tds/project", canWrite, async (req, res) => { try { const b = req.body || {}; res.json(b.employeeId ? await hr.computeTdsProjection(tenantOf(req), b.employeeId, b.fy, { regime: b.regime }) : await hr.projectTdsForYear(tenantOf(req), b.fy)); } catch (e) { fail(res, e); } });

// ── (2) Investment declaration + proof lifecycle ────────────────────────────────
router.get("/declarations", async (req, res) => { try { res.json(await hr.listDeclarations(tenantOf(req), req.query.fy)); } catch (e) { fail(res, e); } });
router.get("/declaration", async (req, res) => { try { res.json(await hr.getDeclaration(tenantOf(req), req.query.employeeId, req.query.fy)); } catch (e) { fail(res, e); } });
router.post("/declaration", canWrite, async (req, res) => { try { res.status(201).json(await hr.saveDeclaration(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.post("/declaration/advance", canWrite, async (req, res) => { try { res.json(await hr.advanceDeclaration(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── (4b) Gratuity slabs + computation ───────────────────────────────────────────
router.get("/gratuity/slabs", async (req, res) => { try { res.json(await hr.listGratuitySlabs(tenantOf(req), req.query.region)); } catch (e) { fail(res, e); } });
router.post("/gratuity/slabs", canWrite, async (req, res) => { try { res.status(201).json(await hr.upsertGratuitySlab(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });
router.get("/gratuity/compute", async (req, res) => { try { res.json(await hr.computeGratuity(tenantOf(req), req.query.employeeId, req.query.relievingDate, { region: req.query.region })); } catch (e) { fail(res, e); } });

// ── (4c) Employee loans ─────────────────────────────────────────────────────────
router.get("/loans", async (req, res) => { try { res.json(await hr.loansFor(tenantOf(req), req.query.employeeId)); } catch (e) { fail(res, e); } });
router.post("/loans", canWrite, async (req, res) => { try { res.status(201).json(await hr.createLoan(tenantOf(req), req.body || {})); } catch (e) { fail(res, e); } });

// ── (4d) Full & final settlement ────────────────────────────────────────────────
router.get("/full-and-final", async (req, res) => { try { res.json(await hr.listFullAndFinal(tenantOf(req))); } catch (e) { fail(res, e); } });
router.post("/full-and-final", canWrite, async (req, res) => { try { res.status(201).json(await hr.fullAndFinal(tenantOf(req), req.user.id, req.body || {})); } catch (e) { fail(res, e); } });

module.exports = router;
