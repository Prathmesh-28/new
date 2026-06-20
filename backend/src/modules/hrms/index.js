// HRMS — domain logic ported from Frappe HR (payroll / leave / attendance).
//
// What is faithful to Frappe here:
//  • Salary COMPONENT model: type (earning|deduction), amount | formula | condition,
//    amount_based_on_formula, depends_on_payment_days, statutory, abbr, round_to_integer.
//  • SAFE formula/condition evaluator — Frappe uses a Python AST-denylist _safe_eval;
//    we use a hand-written tokenizer + shunting-yard arithmetic evaluator over a scoped
//    variable map (base, payment_days, working_days, lop_days, and component abbrs).
//    NO eval()/new Function() ever touches user input.  (Frappe: salary_slip.eval_condition_and_formula
//    -> _safe_eval; SSA.get_evaluated_components evaluates each row's formula ONCE.)
//  • SALARY SLIP computation (salary_slip.get_working_days_details + calculate_net_pay):
//    total_working_days, LOP from attendance, payment_days = working_days − LOP,
//    proration of depends_on_payment_days components by payment_days/working_days,
//    gross = Σ earnings, total_deduction = Σ deductions, net = gross − deductions,
//    rounded to the nearest rupee (Frappe rounded()).
//  • India statutory: PF (12% of basic, capped), ESI (0.75% employee if gross ≤ 21000),
//    Professional Tax (monthly slab), TDS (carried from the structure).
//  • PAYROLL ENTRY (payroll_entry.make_accrual_jv_entry): batch all active assigned
//    employees → build slips → post ONE consolidated journal: Dr Salaries (gross),
//    Cr PF Payable / Cr TDS Payable / Cr Staff Deductions / Cr Salaries Payable (net).
//  • LEAVE: allocation → +ledger; approved application → −ledger; balance = Σ ledger
//    (leave_ledger_entry / leave_allocation / leave_application.get_leave_balance_on).
const { pool } = require("../../db");
const books = require("../books");
const { money, sum, toRupees } = require("../books/money");

class HrError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// ─────────────────────────────────────────────────────────────────────────────
// SAFE EXPRESSION EVALUATOR  (port of Frappe's _safe_eval, JS-style)
//
// Supports: numbers, variable names, + - * /, parentheses, unary minus, and the
// comparison/logical operators used by component CONDITIONS (> >= < <= == != and or).
// Variables resolve from a scope object {base, payment_days, ...abbrs}; an unknown
// name resolves to 0 (Frappe seeds every component abbr to 0 in the eval context).
// There is NO function-call, NO attribute access, NO eval — only the grammar below.
// ─────────────────────────────────────────────────────────────────────────────
const _OPS = {
  "or": { prec: 1, fn: (a, b) => (a || b ? 1 : 0) },
  "and": { prec: 2, fn: (a, b) => (a && b ? 1 : 0) },
  "==": { prec: 3, fn: (a, b) => (a === b ? 1 : 0) },
  "!=": { prec: 3, fn: (a, b) => (a !== b ? 1 : 0) },
  "<": { prec: 4, fn: (a, b) => (a < b ? 1 : 0) },
  "<=": { prec: 4, fn: (a, b) => (a <= b ? 1 : 0) },
  ">": { prec: 4, fn: (a, b) => (a > b ? 1 : 0) },
  ">=": { prec: 4, fn: (a, b) => (a >= b ? 1 : 0) },
  "+": { prec: 5, fn: (a, b) => a + b },
  "-": { prec: 5, fn: (a, b) => a - b },
  "*": { prec: 6, fn: (a, b) => a * b },
  "/": { prec: 6, fn: (a, b) => (b === 0 ? 0 : a / b) },
};
const _MULTI = ["==", "!=", "<=", ">="]; // two-char operators

function tokenize(expr) {
  const src = String(expr);
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") { i += 1; continue; }
    // numbers (with optional decimal)
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const num = src.slice(i, j);
      if ((num.match(/\./g) || []).length > 1) throw new HrError(`Malformed number "${num}" in formula`);
      tokens.push({ t: "num", v: Number(num) });
      i = j;
      continue;
    }
    // identifiers (variable names + word operators and/or)
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      if (word === "and" || word === "or") tokens.push({ t: "op", v: word });
      else tokens.push({ t: "var", v: word });
      i = j;
      continue;
    }
    if (ch === "(") { tokens.push({ t: "lp" }); i += 1; continue; }
    if (ch === ")") { tokens.push({ t: "rp" }); i += 1; continue; }
    // operators: try two-char first
    const two = src.slice(i, i + 2);
    if (_MULTI.includes(two)) { tokens.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/<>".includes(ch)) { tokens.push({ t: "op", v: ch }); i += 1; continue; }
    if (ch === "=") throw new HrError(`Use == for comparison in formula (got "=")`);
    throw new HrError(`Illegal character "${ch}" in formula`);
  }
  return tokens;
}

// Shunting-yard → RPN, then evaluate. Unary minus handled by detecting a "-" that
// appears where a value is expected (start, after another op, or after "(").
function evalExpr(expr, scope) {
  if (expr == null || String(expr).trim() === "") return 0;
  const tokens = tokenize(expr);
  const output = []; // RPN
  const ops = [];
  let expectValue = true; // true when the next token should be a value (for unary minus)

  const popWhile = (test) => { while (ops.length && test(ops[ops.length - 1])) output.push(ops.pop()); };

  for (const tk of tokens) {
    if (tk.t === "num") { output.push(tk); expectValue = false; continue; }
    if (tk.t === "var") { output.push(tk); expectValue = false; continue; }
    if (tk.t === "lp") { ops.push(tk); expectValue = true; continue; }
    if (tk.t === "rp") {
      popWhile((o) => o.t !== "lp");
      if (!ops.length) throw new HrError("Mismatched parenthesis in formula");
      ops.pop(); // discard "("
      expectValue = false;
      continue;
    }
    if (tk.t === "op") {
      if (tk.v === "-" && expectValue) { output.push({ t: "num", v: 0 }); /* 0 - x */ }
      else if (tk.v === "+" && expectValue) { expectValue = true; continue; } // unary plus = no-op
      const o = _OPS[tk.v];
      if (!o) throw new HrError(`Unknown operator "${tk.v}"`);
      popWhile((x) => x.t === "op" && _OPS[x.v] && _OPS[x.v].prec >= o.prec);
      ops.push(tk);
      expectValue = true;
      continue;
    }
  }
  while (ops.length) { const o = ops.pop(); if (o.t === "lp" || o.t === "rp") throw new HrError("Mismatched parenthesis in formula"); output.push(o); }

  const st = [];
  for (const tk of output) {
    if (tk.t === "num") { st.push(tk.v); continue; }
    if (tk.t === "var") {
      const v = scope[tk.v];
      st.push(v == null ? 0 : Number(v)); // unknown var → 0 (Frappe abbr default)
      continue;
    }
    if (tk.t === "op") {
      const b = st.pop(); const a = st.pop();
      if (a === undefined || b === undefined) throw new HrError(`Malformed formula near "${tk.v}"`);
      st.push(_OPS[tk.v].fn(a, b));
      continue;
    }
  }
  if (st.length !== 1) throw new HrError("Malformed formula");
  const r = st[0];
  return Number.isFinite(r) ? r : 0;
}

// Truthiness of a condition expression (Frappe: `if condition and not _safe_eval(...)`).
function evalCondition(cond, scope) {
  if (cond == null || String(cond).trim() === "") return true;
  return evalExpr(cond, scope) ? true : false;
}

// Round to N decimals using half-up money math (mirrors Frappe flt(x, precision)).
const flt = (x, p = 2) => Number(money(Number(x) || 0).toFixed(p));
// Round to nearest rupee — Frappe rounded() for net/rounded_total.
const roundRupee = (x) => Number(money(Number(x) || 0).toFixed(0));

// Default abbreviation for a component name (Frappe auto-abbr: first letter of each word).
function abbrOf(name) {
  return String(name || "").trim().split(/\s+/).map((w) => w[0] || "").join("").toUpperCase() || "X";
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT EVALUATION  (port of SSA.get_evaluated_components + slip proration)
//
// A component row: { name, type:'earning'|'deduction', amount, formula, condition,
//                    depends_on_payment_days, statutory, abbr, round }.
// We evaluate earnings first then deductions, sharing one scope so a deduction can
// reference an earning's abbr (Frappe exposes gross_pay + earning abbrs to deductions).
// `base` is the structure-assignment base salary. payment_days/working_days drive proration.
// ─────────────────────────────────────────────────────────────────────────────
function evaluateComponents(components, ctx) {
  // ctx: { base, working_days, payment_days, lop_days }
  const scope = {
    base: Number(ctx.base) || 0,
    working_days: Number(ctx.working_days) || 0,
    total_working_days: Number(ctx.working_days) || 0,
    payment_days: Number(ctx.payment_days) || 0,
    lop_days: Number(ctx.lop_days) || 0,
  };
  const out = { earnings: [], deductions: [] };
  const proration = ctx.working_days > 0 ? Number(ctx.payment_days) / Number(ctx.working_days) : 0;

  // Two passes so deductions see earning abbrs (and gross_pay).
  const passOrder = ["earning", "deduction"];
  // First seed all abbrs to 0 (Frappe get_component_abbr_map).
  for (const c of components) scope[c.abbr || abbrOf(c.name)] = 0;

  for (const phase of passOrder) {
    if (phase === "deduction") {
      // expose gross_pay before deductions (Frappe behaviour)
      scope.gross_pay = out.earnings.reduce((a, e) => a + e.amount, 0);
    }
    for (const c of components) {
      const type = c.type === "deduction" ? "deduction" : "earning";
      if (type !== phase) continue;
      const abbr = c.abbr || abbrOf(c.name);

      // 1. CONDITION gate — falsy condition skips the row entirely.
      if (!evalCondition(c.condition, scope)) { scope[abbr] = 0; continue; }

      // 2. AMOUNT: formula (amount_based_on_formula) else static amount.
      let amount;
      if (c.formula && String(c.formula).trim() !== "") amount = flt(evalExpr(c.formula, scope), 2);
      else amount = flt(c.amount, 2);

      // expose the full (unprorated) value so later components reference the full figure
      scope[abbr] = amount;

      // 3. PRORATION: components flagged depends_on_payment_days scale by payment/working.
      let final = amount;
      if (c.depends_on_payment_days) final = flt(amount * proration, 2);
      if (c.round) final = roundRupee(final);

      // Frappe removes zero-valued rows (remove_if_zero_valued default true).
      if (final === 0 && !c.formula) continue;

      out[type + "s"].push({
        name: c.name, abbr, type,
        amount: final, default_amount: amount,
        depends_on_payment_days: !!c.depends_on_payment_days,
        statutory: !!c.statutory,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUTORY  (India). Configurable ceilings with sane defaults.
// PF: 12% of basic, capped at a PF wage ceiling (15000 → 1800/mo by default).
// ESI: 0.75% of gross IF gross ≤ ₹21,000 (the ESI wage threshold).
// PT: a small monthly slab on gross.
// ─────────────────────────────────────────────────────────────────────────────
const STATUTORY = {
  PF_RATE: 0.12,
  PF_WAGE_CEILING: 15000, // PF computed on min(basic, ceiling)
  ESI_RATE: 0.0075,
  ESI_GROSS_THRESHOLD: 21000,
};

function pfAmount(basic, cfg = {}) {
  const ceiling = cfg.pfWageCeiling ?? STATUTORY.PF_WAGE_CEILING;
  const rate = cfg.pfRate ?? STATUTORY.PF_RATE;
  const wage = Math.min(Number(basic) || 0, ceiling);
  return roundRupee(wage * rate);
}
function esiAmount(gross, cfg = {}) {
  const threshold = cfg.esiThreshold ?? STATUTORY.ESI_GROSS_THRESHOLD;
  const rate = cfg.esiRate ?? STATUTORY.ESI_RATE;
  if ((Number(gross) || 0) > threshold) return 0;
  return roundRupee((Number(gross) || 0) * rate);
}
// Maharashtra-style monthly Professional Tax slab (a common default).
function ptAmount(gross) {
  const g = Number(gross) || 0;
  if (g <= 7500) return 0;
  if (g <= 10000) return 175;
  return 200; // ₹300 in Feb in real MH PT; flat 200 here for the monthly model
}

// ─────────────────────────────────────────────────────────────────────────────
// SALARY SLIP  (port of salary_slip.get_working_days_details + calculate_net_pay)
// ─────────────────────────────────────────────────────────────────────────────
function daysInMonth(month) { // 'YYYY-MM'
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Derive working days / LOP / payment days from the month's attendance rows.
// Frappe: payment_days = (working days) − LWP − absent − half-day-absent fraction.
// We treat ABSENT as 1 LOP day, unpaid-LEAVE as 1 LOP day, and an ABSENT half-day as 0.5.
function workingDayDetails(month, attendance, paidLeaveTypes) {
  const working_days = daysInMonth(month);
  let lop = 0;
  const paid = new Set((paidLeaveTypes || []).map((s) => String(s)));
  for (const a of attendance) {
    if (a.status === "ABSENT") lop += 1;
    else if (a.status === "HALF_DAY") {
      // an absent half-day costs 0.5; a present half-day costs 0
      if (a.half_day_status === "ABSENT") lop += 0.5;
      else lop += 0; // present half day fully paid in this simplified model
    } else if (a.status === "LEAVE") {
      // unpaid leave types count as LOP; paid leave does not
      if (a.leave_type && !paid.has(String(a.leave_type))) lop += 1;
    }
  }
  lop = flt(lop, 2);
  const payment_days = flt(Math.max(0, working_days - lop), 2);
  return { working_days, lop_days: lop, payment_days };
}

// Build one salary slip: evaluate components against the month's working days, append
// statutory deductions, and total it up (gross / total_deduction / net, rounded).
function computeSlip({ base, components, month, attendance, structure, paidLeaveTypes, statutoryCfg }) {
  const { working_days, lop_days, payment_days } =
    workingDayDetails(month, attendance || [], paidLeaveTypes);

  const ev = evaluateComponents(components || [], { base, working_days, payment_days, lop_days });

  // basic = the component abbreviated BS / named "Basic" (PF base). Fall back to base.
  const basicComp = ev.earnings.find((e) => /basic/i.test(e.name) || e.abbr === "BS");
  const basicForPf = basicComp ? basicComp.amount : flt(base * (payment_days / (working_days || 1)), 2);

  let gross = flt(sum(ev.earnings.map((e) => e.amount)).toFixed(2), 2);

  const deductions = [...ev.deductions];

  // Statutory deductions appended (Frappe add_tax_components / statutory components).
  if (structure.apply_pf) {
    const pf = pfAmount(basicForPf, statutoryCfg);
    if (pf > 0) deductions.push({ name: "Provident Fund", abbr: "PF", type: "deduction", amount: pf, statutory: true });
  }
  if (structure.apply_esi) {
    const esi = esiAmount(gross, statutoryCfg);
    if (esi > 0) deductions.push({ name: "ESI", abbr: "ESI", type: "deduction", amount: esi, statutory: true });
  }
  if (structure.apply_pt) {
    const pt = ptAmount(gross);
    if (pt > 0) deductions.push({ name: "Professional Tax", abbr: "PT", type: "deduction", amount: pt, statutory: true });
  }

  const total_deduction = flt(sum(deductions.map((d) => d.amount)).toFixed(2), 2);
  const net = roundRupee(gross - total_deduction); // round to nearest rupee (Frappe rounded())

  return {
    total_working_days: working_days, payment_days, lop_days,
    earnings: ev.earnings, deductions,
    gross, total_deduction, net,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────────────────────
async function createEmployee(tenantId, e) {
  if (!e.name) throw new HrError("name required");
  const { rows } = await pool.query(
    "INSERT INTO hrms_employees(tenant_id,name,email,phone,department,designation,date_of_joining) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [tenantId, e.name, e.email || null, e.phone || null, e.department || null, e.designation || null, e.dateOfJoining || null]
  );
  return rows[0];
}
const listEmployees = async (t) => (await pool.query("SELECT * FROM hrms_employees WHERE tenant_id=$1 ORDER BY name", [t])).rows;
async function setEmployeeStatus(tenantId, id, status) {
  await pool.query("UPDATE hrms_employees SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, status === "INACTIVE" ? "INACTIVE" : "ACTIVE"]);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE  (Frappe statuses; bulk mark + monthly summary feeding the slip)
// ─────────────────────────────────────────────────────────────────────────────
const ATT_STATUSES = ["PRESENT", "ABSENT", "LEAVE", "HALF_DAY", "WFH", "HOLIDAY"];
async function markAttendance(tenantId, a) {
  if (!a.employeeId || !a.date) throw new HrError("employeeId and date required");
  const status = ATT_STATUSES.includes(a.status) ? a.status : "PRESENT";
  const half = status === "HALF_DAY" ? (a.halfDayStatus === "PRESENT" ? "PRESENT" : "ABSENT") : null;
  const { rows } = await pool.query(
    `INSERT INTO hrms_attendance(tenant_id,employee_id,att_date,status,half_day_status,leave_type)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(tenant_id,employee_id,att_date)
     DO UPDATE SET status=EXCLUDED.status, half_day_status=EXCLUDED.half_day_status, leave_type=EXCLUDED.leave_type
     RETURNING *`,
    [tenantId, a.employeeId, a.date, status, half, a.leaveType || null]
  );
  return rows[0];
}
// Bulk mark a set of {date,status} for one employee (Frappe mark_bulk_attendance).
async function bulkMarkAttendance(tenantId, employeeId, days) {
  if (!employeeId || !Array.isArray(days)) throw new HrError("employeeId and days[] required");
  const out = [];
  for (const d of days) out.push(await markAttendance(tenantId, { employeeId, date: d.date, status: d.status, halfDayStatus: d.halfDayStatus, leaveType: d.leaveType }));
  return { marked: out.length };
}
async function attendanceFor(tenantId, employeeId, month) {
  const { rows } = await pool.query(
    "SELECT att_date, status, half_day_status, leave_type FROM hrms_attendance WHERE tenant_id=$1 AND employee_id=$2 AND to_char(att_date,'YYYY-MM')=$3 ORDER BY att_date",
    [tenantId, employeeId, month]
  );
  return rows;
}
// Monthly summary (present/absent/lop/leave/half-day counts) feeding the slip.
async function attendanceSummary(tenantId, employeeId, month) {
  const rows = await attendanceFor(tenantId, employeeId, month);
  const paid = await paidLeaveTypeNames(tenantId);
  const counts = { present: 0, absent: 0, leave: 0, half_day: 0, wfh: 0, holiday: 0 };
  for (const r of rows) {
    if (r.status === "PRESENT") counts.present += 1;
    else if (r.status === "ABSENT") counts.absent += 1;
    else if (r.status === "LEAVE") counts.leave += 1;
    else if (r.status === "HALF_DAY") counts.half_day += 1;
    else if (r.status === "WFH") counts.wfh += 1;
    else if (r.status === "HOLIDAY") counts.holiday += 1;
  }
  const { working_days, lop_days, payment_days } = workingDayDetails(month, rows, paid);
  return { month, counts, working_days, lop_days, payment_days };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE  (types → allocation → ledger → application; balance = Σ ledger)
// ─────────────────────────────────────────────────────────────────────────────
async function createLeaveType(tenantId, t) {
  if (!t.leaveTypeName) throw new HrError("leaveTypeName required");
  const { rows } = await pool.query(
    `INSERT INTO hrms_leave_types(tenant_id,leave_type_name,annual_allocation,is_lwp,include_holiday)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,leave_type_name) DO UPDATE SET annual_allocation=EXCLUDED.annual_allocation, is_lwp=EXCLUDED.is_lwp, include_holiday=EXCLUDED.include_holiday
     RETURNING *`,
    [tenantId, t.leaveTypeName, t.annualAllocation || 0, !!t.isLwp, !!t.includeHoliday]
  );
  return rows[0];
}
const listLeaveTypes = async (t) => (await pool.query("SELECT * FROM hrms_leave_types WHERE tenant_id=$1 ORDER BY leave_type_name", [t])).rows;
async function paidLeaveTypeNames(tenantId) {
  const { rows } = await pool.query("SELECT leave_type_name FROM hrms_leave_types WHERE tenant_id=$1 AND is_lwp=false", [tenantId]);
  return rows.map((r) => r.leave_type_name);
}

// Allocation → a +ledger entry (Frappe leave_allocation.create_leave_ledger_entry).
async function allocateLeave(tenantId, a) {
  if (!a.employeeId || !a.leaveType || !a.fromDate || !a.toDate) throw new HrError("employeeId, leaveType, fromDate, toDate required");
  const leaves = Number(a.newLeavesAllocated || 0);
  if (!(leaves > 0)) throw new HrError("newLeavesAllocated must be > 0");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO hrms_leave_allocations(tenant_id,employee_id,leave_type,from_date,to_date,new_leaves_allocated) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [tenantId, a.employeeId, a.leaveType, a.fromDate, a.toDate, leaves]
    );
    const alloc = rows[0];
    await client.query(
      "INSERT INTO hrms_leave_ledger(tenant_id,employee_id,leave_type,transaction_type,transaction_id,leaves,from_date,to_date) VALUES($1,$2,$3,'ALLOCATION',$4,$5,$6,$7)",
      [tenantId, a.employeeId, a.leaveType, alloc.id, leaves, a.fromDate, a.toDate]
    );
    await client.query("COMMIT");
    return alloc;
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

// balance = Σ leaves in the ledger (allocations positive, consumption negative).
async function leaveBalance(tenantId, employeeId, leaveType) {
  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(leaves),0) AS bal FROM hrms_leave_ledger WHERE tenant_id=$1 AND employee_id=$2 AND leave_type=$3",
    [tenantId, employeeId, leaveType]
  );
  return flt(rows[0].bal, 2);
}
async function leaveBalances(tenantId, employeeId) {
  const { rows } = await pool.query(
    "SELECT leave_type, COALESCE(SUM(leaves),0) AS balance FROM hrms_leave_ledger WHERE tenant_id=$1 AND employee_id=$2 GROUP BY leave_type ORDER BY leave_type",
    [tenantId, employeeId]
  );
  return rows.map((r) => ({ leave_type: r.leave_type, balance: flt(r.balance, 2) }));
}

// Frappe get_number_of_leave_days: inclusive day span, −0.5 for a half-day.
function leaveDayCount(fromDate, toDate, halfDay) {
  const span = Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;
  let days = span;
  if (halfDay) days -= 0.5;
  return flt(Math.max(0, days), 2);
}

async function requestLeave(tenantId, l) {
  if (!l.employeeId || !l.leaveType || !l.fromDate || !l.toDate) throw new HrError("employeeId, leaveType, fromDate, toDate required");
  const days = leaveDayCount(l.fromDate, l.toDate, !!l.halfDay);
  const { rows } = await pool.query(
    "INSERT INTO hrms_leave_requests(tenant_id,employee_id,leave_type,from_date,to_date,half_day,days,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [tenantId, l.employeeId, l.leaveType, l.fromDate, l.toDate, !!l.halfDay, days, l.reason || null]
  );
  return rows[0];
}

// Approve → a −ledger entry (consumption). Reject → no ledger impact.
// (Frappe leave_application.create_leave_ledger_entry: leaves = total_leave_days * -1.)
async function decideLeave(tenantId, id, approve) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: lr } = await client.query("SELECT * FROM hrms_leave_requests WHERE tenant_id=$1 AND id=$2 AND status='PENDING' FOR UPDATE", [tenantId, id]);
    const req = lr[0];
    if (!req) throw new HrError("Leave request not found or already decided", 409);
    await client.query("UPDATE hrms_leave_requests SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, approve ? "APPROVED" : "REJECTED"]);
    if (approve) {
      await client.query(
        "INSERT INTO hrms_leave_ledger(tenant_id,employee_id,leave_type,transaction_type,transaction_id,leaves,from_date,to_date) VALUES($1,$2,$3,'APPLICATION',$4,$5,$6,$7)",
        [tenantId, req.employee_id, req.leave_type, req.id, -Number(req.days), req.from_date, req.to_date]
      );
    }
    await client.query("COMMIT");
    return { ok: true, status: approve ? "APPROVED" : "REJECTED" };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}
const listLeave = async (t) => (await pool.query("SELECT * FROM hrms_leave_requests WHERE tenant_id=$1 ORDER BY created_at DESC", [t])).rows;

// ─────────────────────────────────────────────────────────────────────────────
// SALARY STRUCTURES + ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────
function normalizeComponents(components) {
  if (!Array.isArray(components)) throw new HrError("components must be an array");
  return components.map((c) => {
    if (!c.name) throw new HrError("each component needs a name");
    const type = c.type === "deduction" ? "deduction" : "earning";
    // Validate any provided formula/condition compiles (and is safe) up front.
    if (c.formula) tokenize(c.formula);
    if (c.condition) tokenize(c.condition);
    return {
      name: String(c.name),
      abbr: c.abbr ? String(c.abbr) : abbrOf(c.name),
      type,
      amount: flt(c.amount || 0, 2),
      formula: c.formula ? String(c.formula) : null,
      condition: c.condition ? String(c.condition) : null,
      depends_on_payment_days: c.dependsOnPaymentDays ?? c.depends_on_payment_days ?? true,
      statutory: !!(c.statutory),
      round: !!(c.round),
    };
  });
}

async function createStructure(tenantId, s) {
  if (!s.name) throw new HrError("structure name required");
  const components = normalizeComponents(s.components || []);
  const { rows } = await pool.query(
    `INSERT INTO hrms_salary_structures(tenant_id,name,payroll_frequency,components,apply_pf,apply_esi,apply_pt,is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(tenant_id,name) DO UPDATE SET payroll_frequency=EXCLUDED.payroll_frequency, components=EXCLUDED.components,
        apply_pf=EXCLUDED.apply_pf, apply_esi=EXCLUDED.apply_esi, apply_pt=EXCLUDED.apply_pt, is_active=EXCLUDED.is_active
     RETURNING *`,
    [tenantId, s.name, s.payrollFrequency || "Monthly", JSON.stringify(components),
     s.applyPf ?? true, s.applyEsi ?? true, s.applyPt ?? true, s.isActive ?? true]
  );
  return rows[0];
}
const listStructures = async (t) => (await pool.query("SELECT * FROM hrms_salary_structures WHERE tenant_id=$1 ORDER BY name", [t])).rows;

async function assignStructure(tenantId, a) {
  if (!a.employeeId || !a.structureId || !a.fromDate) throw new HrError("employeeId, structureId, fromDate required");
  const { rows: st } = await pool.query("SELECT id FROM hrms_salary_structures WHERE tenant_id=$1 AND id=$2", [tenantId, a.structureId]);
  if (!st[0]) throw new HrError("Salary structure not found", 404);
  const { rows } = await pool.query(
    "INSERT INTO hrms_structure_assignments(tenant_id,employee_id,structure_id,base,from_date) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [tenantId, a.employeeId, a.structureId, flt(a.base || 0, 2), a.fromDate]
  );
  return rows[0];
}
const listAssignments = async (t) => (await pool.query(
  `SELECT a.*, e.name AS employee_name, s.name AS structure_name
     FROM hrms_structure_assignments a
     JOIN hrms_employees e ON e.id=a.employee_id
     JOIN hrms_salary_structures s ON s.id=a.structure_id
    WHERE a.tenant_id=$1 ORDER BY a.from_date DESC`, [t])).rows;

// The latest assignment effective on/before a date (Frappe SSA "from_date <= date desc limit 1").
async function activeAssignment(tenantId, employeeId, onDate) {
  const { rows } = await pool.query(
    `SELECT a.*, s.components, s.apply_pf, s.apply_esi, s.apply_pt, s.payroll_frequency, s.name AS structure_name, s.is_active
       FROM hrms_structure_assignments a JOIN hrms_salary_structures s ON s.id=a.structure_id
      WHERE a.tenant_id=$1 AND a.employee_id=$2 AND a.from_date<=$3
      ORDER BY a.from_date DESC LIMIT 1`,
    [tenantId, employeeId, onDate]
  );
  return rows[0] || null;
}

// Preview a single employee's slip for a month without persisting (drives the UI breakdown).
async function previewSlip(tenantId, employeeId, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new HrError("month=YYYY-MM required");
  const onDate = `${month}-28`;
  const ssa = await activeAssignment(tenantId, employeeId, onDate);
  if (!ssa) throw new HrError("No salary structure assignment for this employee/month", 422);
  const attendance = await attendanceFor(tenantId, employeeId, month);
  const paid = await paidLeaveTypeNames(tenantId);
  const slip = computeSlip({
    base: Number(ssa.base), components: ssa.components, month, attendance,
    structure: { apply_pf: ssa.apply_pf, apply_esi: ssa.apply_esi, apply_pt: ssa.apply_pt },
    paidLeaveTypes: paid,
  });
  return { employeeId, structure: ssa.structure_name, base: Number(ssa.base), ...slip };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL ENTRY / RUN  (batch → slips → ONE consolidated salary journal)
// ─────────────────────────────────────────────────────────────────────────────
async function runPayroll(tenantId, actorId, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new HrError("month=YYYY-MM required");
  const { rows: ex } = await pool.query("SELECT id FROM hrms_payroll_runs WHERE tenant_id=$1 AND run_month=$2", [tenantId, month]);
  if (ex[0]) throw new HrError("Payroll already run for this month", 409);

  const onDate = `${month}-28`;
  const paid = await paidLeaveTypeNames(tenantId);

  // Batch: active employees who have a structure assignment effective on/before the period.
  const { rows: emps } = await pool.query("SELECT id, name FROM hrms_employees WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY name", [tenantId]);

  const slips = [];
  for (const e of emps) {
    const ssa = await activeAssignment(tenantId, e.id, onDate);
    if (!ssa || ssa.is_active === false) continue;
    const attendance = await attendanceFor(tenantId, e.id, month);
    const slip = computeSlip({
      base: Number(ssa.base), components: ssa.components, month, attendance,
      structure: { apply_pf: ssa.apply_pf, apply_esi: ssa.apply_esi, apply_pt: ssa.apply_pt },
      paidLeaveTypes: paid,
    });
    slips.push({ employeeId: e.id, employeeName: e.name, ...slip });
  }
  if (!slips.length) throw new HrError("No active employees with a salary structure assignment for this month", 422);

  // Aggregate the consolidated journal. Frappe make_accrual_jv_entry sums components by
  // account: Dr earnings (Salaries), Cr each deduction account, Cr net payable.
  let gross = money(0), pf = money(0), tds = money(0), esi = money(0), pt = money(0), otherDed = money(0), net = money(0);
  for (const s of slips) {
    gross = gross.plus(s.gross);
    net = net.plus(s.net);
    for (const d of s.deductions) {
      if (d.abbr === "PF" || /provident/i.test(d.name)) pf = pf.plus(d.amount);
      else if (d.abbr === "TDS" || /tds|income tax/i.test(d.name)) tds = tds.plus(d.amount);
      else if (d.abbr === "ESI" || /esi/i.test(d.name)) esi = esi.plus(d.amount);
      else if (d.abbr === "PT" || /professional/i.test(d.name)) pt = pt.plus(d.amount);
      else otherDed = otherDed.plus(d.amount);
    }
  }
  const totalDeduction = pf.plus(tds).plus(esi).plus(pt).plus(otherDed);

  // Resolve seeded GL ledgers and post the balanced salary journal.
  const L = (n) => books.ledgerIdByName(tenantId, n);
  const [salaries, pfPayable, tdsPayable, deductionsLed, salPayable] = await Promise.all([
    L("Salaries"), L("PF Payable"), L("TDS Payable"), L("Staff Deductions"), L("Salaries Payable"),
  ]);
  if (!salaries || !salPayable) throw new HrError("Payroll GL ledgers missing — run the books setup (seed) first", 422);

  // ESI + Professional Tax (no dedicated seeded ledger) fold into Staff Deductions.
  const staffDeductions = esi.plus(pt).plus(otherDed);

  const entries = [{ ledgerId: salaries, debit: toRupees(gross), credit: "0" }];
  if (pf.greaterThan(0)) entries.push({ ledgerId: pfPayable, debit: "0", credit: toRupees(pf) });
  if (tds.greaterThan(0)) entries.push({ ledgerId: tdsPayable, debit: "0", credit: toRupees(tds) });
  if (staffDeductions.greaterThan(0)) entries.push({ ledgerId: deductionsLed, debit: "0", credit: toRupees(staffDeductions) });
  entries.push({ ledgerId: salPayable, debit: "0", credit: toRupees(net) });

  const voucher = await books.postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: onDate, narration: `Payroll ${month}`, source: "payroll" }, entries);

  // Persist run + payslips with the full breakdown JSON.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: rr } = await client.query(
      "INSERT INTO hrms_payroll_runs(tenant_id,run_month,gross,total_deduction,net,voucher_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [tenantId, month, toRupees(gross), toRupees(totalDeduction), toRupees(net), voucher.voucherId]
    );
    const run = rr[0];
    for (const s of slips) {
      await client.query(
        `INSERT INTO hrms_payslips(tenant_id,run_id,employee_id,employee_name,total_working_days,payment_days,lop_days,earnings,deductions,gross,total_deduction,net)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tenantId, run.id, s.employeeId, s.employeeName, s.total_working_days, s.payment_days, s.lop_days,
         JSON.stringify(s.earnings), JSON.stringify(s.deductions), s.gross, s.total_deduction, s.net]
      );
    }
    await client.query("COMMIT");
    return {
      run, voucher, employees: slips.length,
      gross: toRupees(gross), total_deduction: toRupees(totalDeduction), net: toRupees(net),
      breakdown: { pf: toRupees(pf), tds: toRupees(tds), esi: toRupees(esi), pt: toRupees(pt), other: toRupees(otherDed) },
      slips,
    };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
  finally { client.release(); }
}

const listPayrollRuns = async (t) => (await pool.query("SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 ORDER BY run_month DESC", [t])).rows;
async function payslipsForRun(tenantId, runId) {
  const { rows } = await pool.query("SELECT * FROM hrms_payslips WHERE tenant_id=$1 AND run_id=$2 ORDER BY employee_name", [tenantId, runId]);
  return rows;
}

module.exports = {
  HrError,
  // pure logic (exported for asserts/tests)
  evalExpr, evalCondition, evaluateComponents, computeSlip, workingDayDetails,
  pfAmount, esiAmount, ptAmount, leaveDayCount, abbrOf, roundRupee, flt,
  // employees
  createEmployee, listEmployees, setEmployeeStatus,
  // attendance
  markAttendance, bulkMarkAttendance, attendanceFor, attendanceSummary,
  // leave
  createLeaveType, listLeaveTypes, allocateLeave, leaveBalance, leaveBalances,
  requestLeave, decideLeave, listLeave,
  // structures / assignments / slips
  createStructure, listStructures, assignStructure, listAssignments, previewSlip,
  // payroll
  runPayroll, listPayrollRuns, payslipsForRun,
};
