const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const payouts = require("../modules/payouts/index");

const WRITE_ROLES = ["super_admin", "owner", "finance_manager"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

// GET / - EWA status for all employees this month
router.get("/", authenticate, canWrite, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { rows: employees } = await pool.query(
      "SELECT id, name, gross_salary, status FROM employees WHERE tenant_id=$1 AND status='active'",
      [tenantId]
    );
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const earnedFraction = dayOfMonth / daysInMonth;

    const result = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      gross_salary: emp.gross_salary,
      earned_to_date: Math.floor(emp.gross_salary * earnedFraction),
      max_advance: Math.floor(emp.gross_salary * earnedFraction * 0.5),
      advances_taken: 0,
    }));

    res.json({ day_of_month: dayOfMonth, employees: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load EWA data" });
  }
});

// POST /request - Request an EWA advance. Disburses to the employee via the shared payouts rail
// (gated: manual mode when no rail is configured — never faked). Capped at 50% of wages earned
// month-to-date. Idempotent per employee per month. NOTE: the payroll-deduction recovery in the
// next payslip is an HRMS follow-up (not auto-registered here); we don't pretend it is.
router.post("/request", authenticate, canWrite, async (req, res) => {
  const { employee_id, amount } = req.body;
  const amt = Number(amount);
  if (!employee_id || !(amt > 0)) return res.status(400).json({ error: "employee_id and a positive amount required" });
  try {
    const tenantId = req.user.tenant_id;
    const { rows } = await pool.query(
      "SELECT id, name, gross_salary, status FROM employees WHERE id=$1 AND tenant_id=$2",
      [employee_id, tenantId]
    );
    const emp = rows[0];
    if (!emp || emp.status !== "active") return res.status(404).json({ error: "Active employee not found" });

    // Earned-to-date cap: 50% of the fraction of the month worked.
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const maxAdvance = Math.floor(Number(emp.gross_salary || 0) * (now.getDate() / daysInMonth) * 0.5);
    if (amt > maxAdvance) return res.status(400).json({ error: `Advance exceeds earned-to-date limit (max ₹${maxAdvance.toLocaleString("en-IN")})` });

    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const payout = await payouts.requestPayout(tenantId, {
      kind: "ewa", amount: amt, beneficiary: { name: emp.name },
      purpose: `Earned-wage advance (${period})`, refType: "employee", refId: employee_id,
      idempotencyKey: `ewa:${employee_id}:${period}`, actorId: req.user.id,
    });
    res.status(201).json({
      success: true, payout: { id: payout.id, status: payout.status, provider: payout.provider, provider_configured: payout.provider_configured },
      recovery: "Deduct from the next payslip (register the deduction in Payroll).",
    });
  } catch (err) {
    console.error("[ewa]", err.message);
    res.status(err.http || 500).json({ error: err.message || "Failed to request advance" });
  }
});

module.exports = router;
