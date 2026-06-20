// HRMS — employees, attendance, leave, salary, payroll. runPayroll posts the
// salary journal to the books ledger (Dr Salaries / Cr PF+TDS+Deductions+Payable).
const { pool } = require("../../db");
const books = require("../books");

class HrError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// Pure: net pay from a salary structure.
function computeNet(s) {
  const gross = Number(s.basic || 0) + Number(s.hra || 0) + Number(s.allowances || 0);
  const pf = Number(s.pf || 0), tds = Number(s.tds || 0), other = Number(s.other_deductions ?? s.otherDeductions ?? 0);
  return { gross, pf, tds, other, net: gross - pf - tds - other };
}

// ── Employees ────────────────────────────────────────────────────────────────
async function createEmployee(tenantId, e) {
  if (!e.name) throw new HrError("name required");
  const { rows } = await pool.query("INSERT INTO hrms_employees(tenant_id,name,email,phone,department,designation,date_of_joining) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [tenantId, e.name, e.email || null, e.phone || null, e.department || null, e.designation || null, e.dateOfJoining || null]);
  return rows[0];
}
const listEmployees = async (t) => (await pool.query("SELECT * FROM hrms_employees WHERE tenant_id=$1 ORDER BY name", [t])).rows;
async function setEmployeeStatus(tenantId, id, status) { await pool.query("UPDATE hrms_employees SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, status === "INACTIVE" ? "INACTIVE" : "ACTIVE"]); return { ok: true }; }

// ── Attendance ───────────────────────────────────────────────────────────────
async function markAttendance(tenantId, a) {
  if (!a.employeeId || !a.date) throw new HrError("employeeId and date required");
  const { rows } = await pool.query("INSERT INTO hrms_attendance(tenant_id,employee_id,att_date,status) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,employee_id,att_date) DO UPDATE SET status=EXCLUDED.status RETURNING *", [tenantId, a.employeeId, a.date, a.status || "PRESENT"]);
  return rows[0];
}
async function attendanceFor(tenantId, employeeId, month) {
  const { rows } = await pool.query("SELECT att_date, status FROM hrms_attendance WHERE tenant_id=$1 AND employee_id=$2 AND to_char(att_date,'YYYY-MM')=$3 ORDER BY att_date", [tenantId, employeeId, month]);
  return rows;
}

// ── Leave ────────────────────────────────────────────────────────────────────
async function setLeaveBalance(tenantId, employeeId, leaveType, balance) {
  const { rows } = await pool.query("INSERT INTO hrms_leave_balances(tenant_id,employee_id,leave_type,balance) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,employee_id,leave_type) DO UPDATE SET balance=EXCLUDED.balance RETURNING *", [tenantId, employeeId, leaveType, balance]);
  return rows[0];
}
async function requestLeave(tenantId, l) {
  if (!l.employeeId || !l.leaveType || !l.fromDate || !l.toDate) throw new HrError("employeeId, leaveType, fromDate, toDate required");
  const days = l.days || (Math.round((new Date(l.toDate) - new Date(l.fromDate)) / 86400000) + 1);
  const { rows } = await pool.query("INSERT INTO hrms_leave_requests(tenant_id,employee_id,leave_type,from_date,to_date,days,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [tenantId, l.employeeId, l.leaveType, l.fromDate, l.toDate, days, l.reason || null]);
  return rows[0];
}
async function decideLeave(tenantId, id, approve) {
  const { rows: lr } = await pool.query("SELECT * FROM hrms_leave_requests WHERE tenant_id=$1 AND id=$2 AND status='PENDING'", [tenantId, id]);
  const req = lr[0];
  if (!req) throw new HrError("Leave request not found or already decided", 409);
  await pool.query("UPDATE hrms_leave_requests SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, approve ? "APPROVED" : "REJECTED"]);
  if (approve) await pool.query("INSERT INTO hrms_leave_balances(tenant_id,employee_id,leave_type,balance) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,employee_id,leave_type) DO UPDATE SET balance=hrms_leave_balances.balance - $4", [tenantId, req.employee_id, req.leave_type, req.days]);
  return { ok: true, status: approve ? "APPROVED" : "REJECTED" };
}
const listLeave = async (t) => (await pool.query("SELECT * FROM hrms_leave_requests WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;

// ── Salary + payroll ─────────────────────────────────────────────────────────
async function setSalaryStructure(tenantId, employeeId, s) {
  const { rows } = await pool.query(
    "INSERT INTO hrms_salary_structures(tenant_id,employee_id,basic,hra,allowances,pf,tds,other_deductions) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,employee_id) DO UPDATE SET basic=EXCLUDED.basic,hra=EXCLUDED.hra,allowances=EXCLUDED.allowances,pf=EXCLUDED.pf,tds=EXCLUDED.tds,other_deductions=EXCLUDED.other_deductions RETURNING *",
    [tenantId, employeeId, s.basic || 0, s.hra || 0, s.allowances || 0, s.pf || 0, s.tds || 0, s.otherDeductions || 0]
  );
  return rows[0];
}
async function runPayroll(tenantId, actorId, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new HrError("month=YYYY-MM required");
  const { rows: ex } = await pool.query("SELECT id FROM hrms_payroll_runs WHERE tenant_id=$1 AND run_month=$2", [tenantId, month]);
  if (ex[0]) throw new HrError("Payroll already run for this month", 409);
  const { rows: emps } = await pool.query(
    "SELECT e.id, e.name, s.* FROM hrms_employees e JOIN hrms_salary_structures s ON s.employee_id=e.id WHERE e.tenant_id=$1 AND e.status='ACTIVE'", [tenantId]
  );
  if (!emps.length) throw new HrError("No active employees with a salary structure", 422);
  let gross = 0, pf = 0, tds = 0, other = 0, net = 0;
  const slips = [];
  for (const e of emps) { const c = computeNet(e); gross += c.gross; pf += c.pf; tds += c.tds; other += c.other; net += c.net; slips.push({ employeeId: e.id, ...c }); }

  // Resolve GL ledgers (seeded by books) and post the salary journal.
  const L = async (n) => books.ledgerIdByName(tenantId, n);
  const [salaries, pfPayable, tdsPayable, deductions, salPayable] = await Promise.all([L("Salaries"), L("PF Payable"), L("TDS Payable"), L("Staff Deductions"), L("Salaries Payable")]);
  if (!salaries || !salPayable) throw new HrError("Payroll GL ledgers missing — run the books setup (seed) first", 422);
  const date = `${month}-28`;
  const entries = [{ ledgerId: salaries, debit: gross.toFixed(2), credit: "0" }];
  if (pf > 0) entries.push({ ledgerId: pfPayable, debit: "0", credit: pf.toFixed(2) });
  if (tds > 0) entries.push({ ledgerId: tdsPayable, debit: "0", credit: tds.toFixed(2) });
  if (other > 0) entries.push({ ledgerId: deductions, debit: "0", credit: other.toFixed(2) });
  entries.push({ ledgerId: salPayable, debit: "0", credit: net.toFixed(2) });
  const voucher = await books.postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: date, narration: `Payroll ${month}`, source: "payroll" }, entries);

  const { rows: rr } = await pool.query("INSERT INTO hrms_payroll_runs(tenant_id,run_month,gross,net,voucher_id) VALUES($1,$2,$3,$4,$5) RETURNING *", [tenantId, month, gross.toFixed(2), net.toFixed(2), voucher.voucherId]);
  const run = rr[0];
  for (const s of slips) await pool.query("INSERT INTO hrms_payslips(tenant_id,run_id,employee_id,gross,deductions,net) VALUES($1,$2,$3,$4,$5,$6)", [tenantId, run.id, s.employeeId, s.gross.toFixed(2), (s.pf + s.tds + s.other).toFixed(2), s.net.toFixed(2)]);
  return { run, voucher, employees: slips.length, gross: gross.toFixed(2), net: net.toFixed(2) };
}
const listPayrollRuns = async (t) => (await pool.query("SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 ORDER BY run_month DESC", [t])).rows;

module.exports = {
  computeNet, HrError,
  createEmployee, listEmployees, setEmployeeStatus,
  markAttendance, attendanceFor,
  setLeaveBalance, requestLeave, decideLeave, listLeave,
  setSalaryStructure, runPayroll, listPayrollRuns,
};
