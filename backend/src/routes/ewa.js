const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// GET / - EWA status for all employees this month
router.get("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { rows: employees } = await pool.query(
      "SELECT id, name, gross_salary, status FROM payroll_employees WHERE tenant_id=$1 AND status='active'",
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

// POST /request - Request an EWA advance
router.post("/request", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { employee_id, amount } = req.body;
  if (!employee_id || !amount) return res.status(400).json({ error: "employee_id and amount required" });
  // In a real system, this would create a disbursement and register a payroll deduction
  res.json({ success: true, message: `Advance of ₹${amount.toLocaleString()} approved for next business day transfer.`, disbursement_date: new Date(Date.now() + 86400000).toISOString().split("T")[0] });
});

module.exports = router;
