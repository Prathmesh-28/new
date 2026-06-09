const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

function computeTds(grossAnnual) {
  // Simplified new tax regime slab (FY 2024-25)
  if (grossAnnual <= 300000)  return 0;
  if (grossAnnual <= 600000)  return (grossAnnual - 300000) * 0.05;
  if (grossAnnual <= 900000)  return 15000 + (grossAnnual - 600000) * 0.10;
  if (grossAnnual <= 1200000) return 45000 + (grossAnnual - 900000) * 0.15;
  if (grossAnnual <= 1500000) return 90000 + (grossAnnual - 1200000) * 0.20;
  return 150000 + (grossAnnual - 1500000) * 0.30;
}

// GET /api/payroll/employees
router.get("/employees", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM employees WHERE tenant_id=$1 AND status='active' ORDER BY name",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/payroll/employees
router.post("/employees", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { name, email, pan, bank_account, bank_ifsc, gross_salary, joining_date } = req.body;
  if (!name || !gross_salary) return res.status(400).json({ error: "name and gross_salary required" });

  const annualSalary = parseFloat(gross_salary) * 12;
  const annualTds    = computeTds(annualSalary);
  const tds_monthly  = parseFloat((annualTds / 12).toFixed(2));

  const { rows: [emp] } = await pool.query(
    `INSERT INTO employees(tenant_id, name, email, pan, bank_account, bank_ifsc, gross_salary, tds_monthly, joining_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.tenant_id, name, email ?? null, pan ?? null, bank_account ?? null, bank_ifsc ?? null,
     gross_salary, tds_monthly, joining_date ?? null]
  );
  res.status(201).json(emp);
});

// PATCH /api/payroll/employees/:id
router.patch("/employees/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { name, email, gross_salary, bank_account, bank_ifsc, pan, status } = req.body;
  const { rows: [existing] } = await pool.query(
    "SELECT * FROM employees WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!existing) return res.status(404).json({ error: "Employee not found" });

  const newSalary = gross_salary ? parseFloat(gross_salary) : existing.gross_salary;
  const annualTds = computeTds(newSalary * 12);
  const tds_monthly = parseFloat((annualTds / 12).toFixed(2));

  const { rows: [updated] } = await pool.query(
    `UPDATE employees SET
       name=$1, email=$2, gross_salary=$3, tds_monthly=$4, bank_account=$5, bank_ifsc=$6,
       pan=$7, status=COALESCE($8, status)
     WHERE id=$9 AND tenant_id=$10 RETURNING *`,
    [name ?? existing.name, email ?? existing.email, newSalary, tds_monthly,
     bank_account ?? existing.bank_account, bank_ifsc ?? existing.bank_ifsc,
     pan ?? existing.pan, status ?? null, req.params.id, req.user.tenant_id]
  );
  res.json(updated);
});

// GET /api/payroll/runs
router.get("/runs", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM payroll_runs WHERE tenant_id=$1 ORDER BY run_year DESC, run_month DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/payroll/run — execute payroll for a month
router.post("/run", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { run_month, run_year } = req.body;
  const m = run_month ?? new Date().getMonth() + 1;
  const y = run_year  ?? new Date().getFullYear();

  const { rows: employees } = await pool.query(
    "SELECT * FROM employees WHERE tenant_id=$1 AND status='active'",
    [req.user.tenant_id]
  );
  if (!employees.length) return res.status(400).json({ error: "No active employees" });

  const total_gross = employees.reduce((s, e) => s + parseFloat(e.gross_salary), 0);
  const total_tds   = employees.reduce((s, e) => s + parseFloat(e.tds_monthly),  0);
  const total_net   = parseFloat((total_gross - total_tds).toFixed(2));

  const { rows: [run] } = await pool.query(
    `INSERT INTO payroll_runs(tenant_id, run_month, run_year, total_gross, total_tds, total_net, status)
     VALUES($1,$2,$3,$4,$5,$6,'draft')
     ON CONFLICT(tenant_id, run_month, run_year)
     DO UPDATE SET total_gross=$4, total_tds=$5, total_net=$6, status='draft'
     RETURNING *`,
    [req.user.tenant_id, m, y, total_gross, total_tds, total_net]
  );

  // In production: call Setu Payout API for each employee
  // SETU_CLIENT_ID / SETU_SECRET / SETU_PAYOUT_URL env vars
  // For now, just return the run with employee breakdown
  const breakdown = employees.map(e => ({
    employee_id: e.id, name: e.name,
    gross: parseFloat(e.gross_salary),
    tds:   parseFloat(e.tds_monthly),
    net:   parseFloat((parseFloat(e.gross_salary) - parseFloat(e.tds_monthly)).toFixed(2)),
    bank_account: e.bank_account, bank_ifsc: e.bank_ifsc,
  }));

  res.status(201).json({ ...run, breakdown });
});

// POST /api/payroll/runs/:id/disburse — mark as disbursed (production: trigger Setu bulk payout)
router.post("/runs/:id/disburse", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows: [run] } = await pool.query(
    "UPDATE payroll_runs SET status='disbursed', disbursed_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *",
    [req.params.id, req.user.tenant_id]
  );
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  res.json(run);
});

module.exports = router;
