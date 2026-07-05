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

// Full statutory split for ONE employee-month — an exact server-side mirror of the
// frontend's computeStatutoryNet (PayrollPage.tsx), same Math.round semantics, so the
// GL voucher posted below can never disagree with the numbers the run tab displays.
// basicPct/capPf come from the caller (the page passes its configured structure).
function computeStatutory(grossMonthly, { basicPct = 50, capPf = true } = {}) {
  const gross = Math.max(0, Math.round(Number(grossMonthly) || 0));
  const basic = Math.round(gross * (basicPct / 100));
  const hra = Math.round(basic * 0.4);                     // HRA = 40% of Basic
  const allowances = Math.max(0, gross - basic - hra);
  const pfWage = capPf ? Math.min(basic, 15000) : basic;   // 12% of Basic, ₹15k ceiling optional
  const pf = Math.round(pfWage * 0.12);
  const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
  const pt = gross >= 15000 ? 200 : (gross > 7500 ? 100 : 0);
  const annualTax = Math.round(computeTds(gross * 12));
  const tds = Math.round(annualTax / 12);
  const totalDeductions = pf + esi + pt + tds;
  const net = Math.max(0, gross - totalDeductions);
  return { gross, basic, hra, allowances, pf, esi, pt, tds, totalDeductions, net };
}

// ── GL bridge (payroll→HRMS convergence) ──────────────────────────────────────
// The run used to insert a payroll_runs row and STOP — salary expense, PF/TDS
// liabilities and net payable never reached the books from this page (the audit's
// top payroll finding). These helpers post the same consolidated vouchers the HRMS
// engine posts, from this run's own numbers. Best-effort by design: a payroll run
// must still succeed when the books chart isn't seeded — the response then says so
// honestly instead of failing or silently skipping.
const { postVoucher, reverseVoucher } = require("../modules/books/posting-engine");
const { ledgerIdByName } = require("../modules/books/seed");
const crypto = require("crypto");
const lastDayOfMonth = (y, m) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

// Accrual: Dr Salaries (gross) / Cr PF Payable + TDS Payable + Staff Deductions (ESI+PT)
// + Salaries Payable (net). Any head whose ledger is missing folds into Salaries Payable
// so the voucher still balances on a partially-seeded chart (commented misattribution
// beats not posting at all). Idempotency key includes a hash of the totals: an HTTP retry
// with identical numbers replays; a RE-RUN with different numbers first reverses the
// previous accrual (tracked on the run row) and posts fresh — never double-counts.
async function postPayrollAccrual(tenantId, actorId, { y, m, gross, pf, tds, staff, net, priorVoucherId }) {
  const L = (n) => ledgerIdByName(tenantId, n);
  const [salaries, pfPay, tdsPay, staffDed, salPay] = await Promise.all([
    L("Salaries"), L("PF Payable"), L("TDS Payable"), L("Staff Deductions"), L("Salaries Payable"),
  ]);
  if (!salaries || !salPay) return { posted: false, reason: "Books chart not seeded (Salaries / Salaries Payable missing) — run Books setup, then re-run payroll to post it to the GL." };

  const hash = crypto.createHash("sha1").update(JSON.stringify({ gross, pf, tds, staff, net })).digest("hex").slice(0, 12);
  const idempotencyKey = `legacy-payroll-accrual:${tenantId}:${y}-${m}:${hash}`;

  // Amounts changed since the last posting for this month → reverse the old voucher first.
  if (priorVoucherId) {
    const { rows: pv } = await pool.query(
      "SELECT id, idempotency_key, is_cancelled FROM book_vouchers WHERE tenant_id=$1 AND id=$2", [tenantId, priorVoucherId]);
    if (pv[0] && !pv[0].is_cancelled && pv[0].idempotency_key !== idempotencyKey) {
      await reverseVoucher(tenantId, actorId, priorVoucherId, {}).catch((e) => console.warn("[payroll] prior accrual reverse skipped:", e.message));
    } else if (pv[0] && !pv[0].is_cancelled && pv[0].idempotency_key === idempotencyKey) {
      return { posted: true, voucherId: pv[0].id, replayed: true }; // identical re-run → same voucher
    }
  }

  const entries = [{ ledgerId: salaries, debit: gross.toFixed(2), credit: "0" }];
  if (pf > 0 && pfPay) entries.push({ ledgerId: pfPay, debit: "0", credit: pf.toFixed(2) });
  if (tds > 0 && tdsPay) entries.push({ ledgerId: tdsPay, debit: "0", credit: tds.toFixed(2) });
  if (staff > 0 && staffDed) entries.push({ ledgerId: staffDed, debit: "0", credit: staff.toFixed(2) });
  const otherCredits = entries.slice(1).reduce((s, e) => s + Number(e.credit), 0);
  entries.push({ ledgerId: salPay, debit: "0", credit: (gross - otherCredits).toFixed(2) }); // net + any missing-ledger heads

  const v = await postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: lastDayOfMonth(y, m), narration: `Payroll accrual ${y}-${String(m).padStart(2, "0")} (payroll page)`, source: "payroll" },
    entries, { idempotencyKey });
  return { posted: true, voucherId: v.voucherId, voucherNumber: v.voucherNumber, replayed: !!v.replayed };
}

// Disburse: Dr Salaries Payable (net) / Cr the chosen bank ledger. PF/TDS/deduction
// heads stay as liabilities until their challans are paid — correct, and matches HRMS.
async function postPayrollPayment(tenantId, actorId, run, bankLedgerId) {
  const salPay = await ledgerIdByName(tenantId, "Salaries Payable");
  if (!salPay) return { posted: false, reason: "Books chart not seeded (Salaries Payable missing)." };
  const { rows: bl } = await pool.query(
    "SELECT id FROM book_ledgers WHERE tenant_id=$1 AND id=$2 AND is_active=true", [tenantId, bankLedgerId]);
  if (!bl[0]) return { posted: false, reason: "Bank ledger not found." };
  const net = Number(run.total_net) || 0;
  if (!(net > 0)) return { posted: false, reason: "Run has no net payable." };
  const v = await postVoucher(tenantId, actorId,
    { voucherType: "PAYMENT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Salary payment ${run.run_year}-${String(run.run_month).padStart(2, "0")}`, source: "payroll" },
    [
      { ledgerId: salPay, debit: net.toFixed(2), credit: "0" },
      { ledgerId: bankLedgerId, debit: "0", credit: net.toFixed(2) },
    ],
    { idempotencyKey: `legacy-payroll-payment:${tenantId}:${run.id}` });
  return { posted: true, voucherId: v.voucherId, voucherNumber: v.voucherNumber, replayed: !!v.replayed };
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

// POST /api/payroll/run - execute payroll for a month. Computes the FULL statutory split
// (PF/ESI/PT/TDS) server-side per employee — identical math to what the page displays —
// persists it in the breakdown, and posts the accrual JOURNAL to the books.
router.post("/run", authenticate, canWrite, async (req, res) => {
  try {
    const { run_month, run_year, basic_pct, cap_pf } = req.body || {};
    const m = run_month ?? new Date().getMonth() + 1;
    const y = run_year  ?? new Date().getFullYear();
    const cfg = { basicPct: Number(basic_pct) > 0 && Number(basic_pct) <= 100 ? Number(basic_pct) : 50, capPf: cap_pf !== false };

    const { rows: empRows } = await pool.query(
      "SELECT * FROM employees WHERE tenant_id=$1 AND status='active'",
      [req.user.tenant_id]
    );
    const employees = empRows.map(decEmp);
    if (!employees.length) return res.status(400).json({ error: "No active employees" });

    const breakdown = employees.map(e => {
      const s = computeStatutory(parseFloat(e.gross_salary), cfg);
      return {
        employee_id: e.id, name: e.name,
        gross: s.gross, basic: s.basic, hra: s.hra, allowances: s.allowances,
        pf: s.pf, esi: s.esi, pt: s.pt, tds: s.tds, net: s.net,
        bank_account: e.bank_account, bank_ifsc: e.bank_ifsc,
      };
    });
    const sum = (k) => breakdown.reduce((s, b) => s + b[k], 0);
    const total_gross = sum("gross"), total_tds = sum("tds"), total_pf = sum("pf");
    const total_staff = sum("esi") + sum("pt"); // ESI + PT fold into Staff Deductions, same as HRMS
    const total_net = sum("net");

    // Prior accrual for this month (re-run with changed numbers → reverse + repost).
    const { rows: prior } = await pool.query(
      "SELECT accrual_voucher_id FROM payroll_runs WHERE tenant_id=$1 AND run_month=$2 AND run_year=$3",
      [req.user.tenant_id, m, y]);

    const { rows: [run] } = await pool.query(
      `INSERT INTO payroll_runs(tenant_id, run_month, run_year, total_gross, total_tds, total_net, breakdown, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'draft')
       ON CONFLICT(tenant_id, run_month, run_year)
       DO UPDATE SET total_gross=$4, total_tds=$5, total_net=$6, breakdown=$7, status='draft'
       RETURNING *`,
      [req.user.tenant_id, m, y, total_gross, total_tds, total_net, JSON.stringify(breakdown)]
    );

    // Post the accrual to the books (best-effort, honest on failure — see helper).
    let gl = { posted: false, reason: "GL posting failed" };
    try {
      gl = await postPayrollAccrual(req.user.tenant_id, req.user.id, {
        y, m, gross: total_gross, pf: total_pf, tds: total_tds, staff: total_staff, net: total_net,
        priorVoucherId: prior[0]?.accrual_voucher_id || null,
      });
    } catch (e) { gl = { posted: false, reason: e.message }; }
    if (gl.posted) {
      await pool.query("UPDATE payroll_runs SET accrual_voucher_id=$1 WHERE id=$2 AND tenant_id=$3", [gl.voucherId, run.id, req.user.tenant_id]).catch(() => {});
      run.accrual_voucher_id = gl.voucherId;
    }

    res.status(201).json({ ...run, gl });
  } catch (e) {
    console.error("[payroll] run failed:", e.message);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/payroll/runs/:id/disburse - mark as disbursed. When a bank_ledger_id is sent,
// also posts the real PAYMENT voucher (Dr Salaries Payable / Cr bank); the actual bank
// payout API remains credential-gated and is never faked.
router.post("/runs/:id/disburse", authenticate, canWrite, async (req, res) => {
  try {
    const { rows: [run] } = await pool.query(
      "UPDATE payroll_runs SET status='disbursed', disbursed_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING *",
      [req.params.id, req.user.tenant_id]
    );
    if (!run) return res.status(404).json({ error: "Payroll run not found" });

    let gl = { posted: false, reason: "Pick a bank account to also post the payment voucher to the books." };
    const bankLedgerId = (req.body || {}).bank_ledger_id;
    if (bankLedgerId) {
      try { gl = await postPayrollPayment(req.user.tenant_id, req.user.id, run, String(bankLedgerId)); }
      catch (e) { gl = { posted: false, reason: e.message }; }
      if (gl.posted) {
        await pool.query("UPDATE payroll_runs SET payment_voucher_id=$1 WHERE id=$2 AND tenant_id=$3", [gl.voucherId, run.id, req.user.tenant_id]).catch(() => {});
        run.payment_voucher_id = gl.voucherId;
      }
    }
    res.json({ ...run, gl });
  } catch (e) {
    console.error("[payroll] disburse failed:", e.message);
    res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
