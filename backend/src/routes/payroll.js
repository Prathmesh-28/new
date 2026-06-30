const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const fc = require("../lib/fieldcrypto");

// Employee PII encrypted at rest: PAN + bank account. Encrypt on write, decrypt on read
// (authorised finance roles still see plaintext via the API; this protects the DB itself).
const EMP_PII = ["pan", "bank_account"];
const decEmp = (r) => fc.decryptFields(r, EMP_PII);

const WRITE_ROLES = ["super_admin", "owner", "finance_manager"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

// New-regime FY25-26 slabs (matches the frontend computeStatutoryNet engine):
// ₹75,000 standard deduction, 87A rebate (≤ ₹7L taxable → nil), + 4% cess.
const TDS_STD_DEDUCTION = 75000;
const NEW_REGIME_SLABS = [
  [300000, 0], [700000, 0.05], [1000000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30],
];
function computeTds(grossAnnual) {
  const taxable = Math.max(0, grossAnnual - TDS_STD_DEDUCTION);
  let tax = 0, prev = 0;
  for (const [upTo, rate] of NEW_REGIME_SLABS) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
  }
  if (taxable <= 700000) tax = 0;        // 87A rebate
  return tax * 1.04;                     // + 4% health & education cess
}

// GET /api/payroll/employees - salary + PAN is sensitive; restrict reads to
// owner/admin (matches the create/update/run guards below) so a sales/ops
// teammate can't read the whole payroll.
router.get("/employees", authenticate, canWrite, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM employees WHERE tenant_id=$1 AND status='active' ORDER BY name",
    [req.user.tenant_id]
  );
  res.json(rows.map(decEmp));
});

// POST /api/payroll/employees
router.post("/employees", authenticate, canWrite, async (req, res) => {
  const { name, email, pan, bank_account, bank_ifsc, gross_salary, joining_date } = req.body;
  if (!name || !gross_salary) return res.status(400).json({ error: "name and gross_salary required" });

  const annualSalary = parseFloat(gross_salary) * 12;
  const annualTds    = computeTds(annualSalary);
  const tds_monthly  = parseFloat((annualTds / 12).toFixed(2));

  const { rows: [emp] } = await pool.query(
    `INSERT INTO employees(tenant_id, name, email, pan, bank_account, bank_ifsc, gross_salary, tds_monthly, joining_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.tenant_id, name, email ?? null, fc.encrypt(pan ?? null), fc.encrypt(bank_account ?? null), bank_ifsc ?? null,
     gross_salary, tds_monthly, joining_date ?? null]
  );
  res.status(201).json(decEmp(emp));
});

// PATCH /api/payroll/employees/:id
router.patch("/employees/:id", authenticate, canWrite, async (req, res) => {
  const { name, email, gross_salary, bank_account, bank_ifsc, pan, status } = req.body;
  const { rows: exRows } = await pool.query(
    "SELECT * FROM employees WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  const existing = exRows[0] ? decEmp(exRows[0]) : null; // plaintext, so fallbacks re-encrypt cleanly
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
     fc.encrypt(bank_account ?? existing.bank_account), bank_ifsc ?? existing.bank_ifsc,
     fc.encrypt(pan ?? existing.pan), status ?? null, req.params.id, req.user.tenant_id]
  );
  res.json(decEmp(updated));
});

// GET /api/payroll/runs - payroll totals expose pay data; owner/admin only.
router.get("/runs", authenticate, canWrite, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM payroll_runs WHERE tenant_id=$1 ORDER BY run_year DESC, run_month DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/payroll/run - execute payroll for a month
router.post("/run", authenticate, canWrite, async (req, res) => {
  const { run_month, run_year } = req.body;
  const m = run_month ?? new Date().getMonth() + 1;
  const y = run_year  ?? new Date().getFullYear();

  const { rows: empRows } = await pool.query(
    "SELECT * FROM employees WHERE tenant_id=$1 AND status='active'",
    [req.user.tenant_id]
  );
  const employees = empRows.map(decEmp);
  if (!employees.length) return res.status(400).json({ error: "No active employees" });

  const total_gross = employees.reduce((s, e) => s + parseFloat(e.gross_salary), 0);
  const total_tds   = employees.reduce((s, e) => s + parseFloat(e.tds_monthly),  0);
  const total_net   = parseFloat((total_gross - total_tds).toFixed(2));

  // Per-employee breakdown persisted so the run survives reload. The frontend
  // re-derives PF/ESI/PT/net from `gross` via its single computeStatutoryNet
  // engine, so we store the raw gross + employer-recorded TDS here.
  const breakdown = employees.map(e => ({
    employee_id: e.id, name: e.name,
    gross: parseFloat(e.gross_salary),
    tds:   parseFloat(e.tds_monthly),
    net:   parseFloat((parseFloat(e.gross_salary) - parseFloat(e.tds_monthly)).toFixed(2)),
    bank_account: e.bank_account, bank_ifsc: e.bank_ifsc,
  }));

  const { rows: [run] } = await pool.query(
    `INSERT INTO payroll_runs(tenant_id, run_month, run_year, total_gross, total_tds, total_net, breakdown, status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'draft')
     ON CONFLICT(tenant_id, run_month, run_year)
     DO UPDATE SET total_gross=$4, total_tds=$5, total_net=$6, breakdown=$7, status='draft'
     RETURNING *`,
    [req.user.tenant_id, m, y, total_gross, total_tds, total_net, JSON.stringify(breakdown)]
  );

  // In production: call Setu Payout API for each employee
  // SETU_CLIENT_ID / SETU_SECRET / SETU_PAYOUT_URL env vars
  res.status(201).json(run);
});

// POST /api/payroll/runs/:id/disburse - mark as disbursed (production: trigger Setu bulk payout)
router.post("/runs/:id/disburse", authenticate, canWrite, async (req, res) => {
  const { rows: [run] } = await pool.query(
    "UPDATE payroll_runs SET status='disbursed', disbursed_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *",
    [req.params.id, req.user.tenant_id]
  );
  if (!run) return res.status(404).json({ error: "Payroll run not found" });
  res.json(run);
});

module.exports = router;
