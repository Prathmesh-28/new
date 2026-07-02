// HRMS - domain logic ported from Frappe HR (payroll / leave / attendance).
//
// What is faithful to Frappe here:
//  • Salary COMPONENT model: type (earning|deduction), amount | formula | condition,
//    amount_based_on_formula, depends_on_payment_days, statutory, abbr, round_to_integer.
//  • SAFE formula/condition evaluator - Frappe uses a Python AST-denylist _safe_eval;
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
const { withTenant, q } = require("../../lib/tenantDb"); // RLS Phase 4
// RLS rollout: hrms_* tables are FORCE-RLS (migration 0005). Simple reads/writes go
// through q(tenantId,...); the 4 multi-statement transactions (allocateLeave, decideLeave,
// runPayroll, fullAndFinal) use withTenant(tenantId, client => ...). Payroll GL posting
// (books.postVoucher / ledgerIdByName) stays on its own connection (book_* not RLS'd) and
// is called OUTSIDE the withTenant txn, so nothing nests. runPayroll's post-commit TDS
// refresh also runs OUTSIDE the txn.
const books = require("../books");
const { money, sum, toRupees } = require("../books/money");
const fc = require("../../lib/fieldcrypto"); // decrypt the legacy employees.pan for statutory returns

class HrError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// ─────────────────────────────────────────────────────────────────────────────
// SAFE EXPRESSION EVALUATOR  (port of Frappe's _safe_eval, JS-style)
//
// Supports: numbers, variable names, + - * /, parentheses, unary minus, and the
// comparison/logical operators used by component CONDITIONS (> >= < <= == != and or).
// Variables resolve from a scope object {base, payment_days, ...abbrs}; an unknown
// name resolves to 0 (Frappe seeds every component abbr to 0 in the eval context).
// There is NO function-call, NO attribute access, NO eval - only the grammar below.
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
// Round to nearest rupee - Frappe rounded() for net/rounded_total.
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

      // 1. CONDITION gate - falsy condition skips the row entirely.
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
// (3) DEPENDENCY-ORDERED COMPONENT EVALUATION  (Frappe SSA component ordering)
//
// Frappe's evaluateComponents above runs a fixed earning→deduction order and seeds
// every abbr to 0. That works when a formula references an abbr defined EARLIER in
// the list. The richer "formula-driven component" model lets a component's formula
// reference ANY other component's abbr regardless of list order - so we must compute
// a topological order from the formula/condition dependencies and evaluate in that
// order (Frappe does this implicitly by repeated passes; we make it explicit).
//
// We extract the variable names a formula/condition references (its abbr deps),
// build a DAG over the components, topo-sort it, and evaluate each in order against
// a shared scope. STATISTICAL components (is_statistical) are evaluated and exposed
// to the scope but NOT emitted into earnings/deductions (they are pure inputs).
// A dependency cycle throws.
// ─────────────────────────────────────────────────────────────────────────────

// Collect the identifier tokens (variable references) in an expression.
function referencedVars(expr) {
  if (expr == null || String(expr).trim() === "") return [];
  const out = [];
  for (const t of tokenize(expr)) if (t.t === "var") out.push(t.v);
  return out;
}

// Topologically order components so every component is evaluated AFTER the ones its
// formula/condition references. base/payment_days/etc are not components → ignored.
function orderComponentsByDependency(components) {
  const byAbbr = new Map();
  for (const c of components) byAbbr.set(c.abbr || abbrOf(c.component_name || c.name), c);
  const visited = new Map(); // abbr → 0 visiting / 1 done
  const ordered = [];
  const visit = (c, stack) => {
    const abbr = c.abbr || abbrOf(c.component_name || c.name);
    if (visited.get(abbr) === 1) return;
    if (visited.get(abbr) === 0) throw new HrError(`Circular dependency in salary components at "${abbr}"`);
    visited.set(abbr, 0);
    const deps = [...referencedVars(c.formula), ...referencedVars(c.condition)];
    for (const d of deps) {
      const dep = byAbbr.get(d);
      if (dep && dep !== c) visit(dep, [...stack, abbr]);
    }
    visited.set(abbr, 1);
    ordered.push(c);
  };
  for (const c of components) visit(c, []);
  return ordered;
}

// Evaluate a set of FORMULA-DRIVEN components in dependency order. Returns
// { earnings, deductions, statistical, scope }. ctx carries base + day counts +
// any seed variables (e.g. taxable salary for a TDS row). Statistical components
// resolve into scope but are not paid. Mirrors Frappe SSA.get_evaluated_components
// but with explicit topo ordering and statistical-component support.
function evaluateFormulaComponents(components, ctx) {
  const scope = {
    base: Number(ctx.base) || 0,
    working_days: Number(ctx.working_days) || 0,
    total_working_days: Number(ctx.working_days) || 0,
    payment_days: Number(ctx.payment_days) || 0,
    lop_days: Number(ctx.lop_days) || 0,
  };
  // caller-supplied seeds (e.g. annual_taxable_salary, monthly_tds)
  for (const [k, v] of Object.entries(ctx.seed || {})) scope[k] = Number(v) || 0;
  for (const c of components) scope[c.abbr || abbrOf(c.component_name || c.name)] = 0;

  const proration = ctx.working_days > 0 ? Number(ctx.payment_days) / Number(ctx.working_days) : 0;
  const ordered = orderComponentsByDependency(components);
  const out = { earnings: [], deductions: [], statistical: [] };

  for (const c of ordered) {
    const name = c.component_name || c.name;
    const abbr = c.abbr || abbrOf(name);
    const type = c.type === "deduction" ? "deduction" : "earning";
    const stat = !!(c.is_statistical ?? c.statistical_only);
    // expose gross_pay (sum of earnings so far) to any later component (Frappe behaviour)
    scope.gross_pay = out.earnings.reduce((a, e) => a + e.amount, 0);

    if (!evalCondition(c.condition, scope)) { scope[abbr] = 0; continue; }
    let amount;
    if (c.formula && String(c.formula).trim() !== "") amount = flt(evalExpr(c.formula, scope), 2);
    else amount = flt(c.amount, 2);
    scope[abbr] = amount; // full (unprorated) value visible to dependents

    let final = amount;
    if (c.depends_on_payment_days) final = flt(amount * proration, 2);
    if (c.round_to_integer || c.round) final = roundRupee(final);

    const row = {
      name, abbr, type, amount: final, default_amount: amount,
      depends_on_payment_days: !!c.depends_on_payment_days,
      statutory: !!c.statutory, statistical: stat,
      is_tax_applicable: c.is_tax_applicable !== false,
    };
    if (stat) { out.statistical.push(row); continue; }   // input-only, not paid
    if (final === 0 && !c.formula) continue;
    out[type + "s"].push(row);
  }
  return { ...out, scope };
}

// ── Salary-component MASTER CRUD (first-class entities) ──────────────────────
function normalizeComponentMaster(c) {
  const name = c.componentName || c.component_name || c.name;
  if (!name) throw new HrError("componentName required");
  const type = c.type === "deduction" ? "deduction" : "earning";
  if (c.formula) tokenize(c.formula);     // compile-check (safe-eval grammar)
  if (c.condition) tokenize(c.condition);
  return {
    component_name: String(name),
    abbr: c.abbr ? String(c.abbr) : abbrOf(name),
    type,
    formula: c.formula ? String(c.formula) : null,
    condition: c.condition ? String(c.condition) : null,
    amount: flt(c.amount || 0, 2),
    depends_on_payment_days: c.dependsOnPaymentDays ?? c.depends_on_payment_days ?? true,
    is_statistical: !!(c.isStatistical ?? c.is_statistical),
    is_tax_applicable: c.isTaxApplicable ?? c.is_tax_applicable ?? true,
    statutory: !!(c.statutory),
    variable_based_on_taxable_salary: !!(c.variableBasedOnTaxableSalary ?? c.variable_based_on_taxable_salary),
    round_to_integer: !!(c.roundToInteger ?? c.round_to_integer ?? c.round),
  };
}
async function createSalaryComponent(tenantId, c) {
  const n = normalizeComponentMaster(c);
  const { rows } = await q(tenantId,
    `INSERT INTO hrms_salary_components
      (tenant_id,component_name,abbr,type,formula,condition,amount,depends_on_payment_days,
       is_statistical,is_tax_applicable,statutory,variable_based_on_taxable_salary,round_to_integer)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT(tenant_id,component_name) DO UPDATE SET
       abbr=EXCLUDED.abbr, type=EXCLUDED.type, formula=EXCLUDED.formula, condition=EXCLUDED.condition,
       amount=EXCLUDED.amount, depends_on_payment_days=EXCLUDED.depends_on_payment_days,
       is_statistical=EXCLUDED.is_statistical, is_tax_applicable=EXCLUDED.is_tax_applicable,
       statutory=EXCLUDED.statutory, variable_based_on_taxable_salary=EXCLUDED.variable_based_on_taxable_salary,
       round_to_integer=EXCLUDED.round_to_integer
     RETURNING *`,
    [tenantId, n.component_name, n.abbr, n.type, n.formula, n.condition, n.amount, n.depends_on_payment_days,
     n.is_statistical, n.is_tax_applicable, n.statutory, n.variable_based_on_taxable_salary, n.round_to_integer]
  );
  return rows[0];
}
const listSalaryComponents = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_salary_components WHERE tenant_id=$1 ORDER BY type,component_name", [tenantId])).rows;

// Validate (and topo-order) a set of component rows without persisting - surfaces
// circular dependencies / formula errors to the UI before a structure is saved.
function validateComponentSet(components) {
  const norm = (Array.isArray(components) ? components : []).map(normalizeComponentMaster);
  const ordered = orderComponentsByDependency(norm);
  return { ok: true, order: ordered.map((c) => c.abbr) };
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
// Per-state monthly Professional Tax. PT is a STATE levy, so the slab depends on the
// employee's / firm's work state — not one hardcoded Maharashtra slab. Covers the major
// employment states with their current monthly slabs; states that levy no PT return 0;
// unknown/unset state defaults to Maharashtra (back-compat). Half-yearly states (TN/KL)
// are modelled as an approximate monthly figure. Rates are policy data — keep updated.
const isFeb = (month) => String(month || "").slice(5, 7) === "02"; // 'YYYY-MM'
const PT_STATE = {
  MH: (g, m) => (g <= 7500 ? 0 : g <= 10000 ? 175 : isFeb(m) ? 300 : 200),   // MH annual cap 2500 (Feb 300)
  KA: (g) => (g < 25000 ? 0 : 200),
  WB: (g) => (g <= 10000 ? 0 : g <= 15000 ? 110 : g <= 25000 ? 130 : g <= 40000 ? 150 : 200),
  AP: (g) => (g <= 15000 ? 0 : g <= 20000 ? 150 : 200),
  TG: (g) => (g <= 15000 ? 0 : g <= 20000 ? 150 : 200),                       // Telangana = AP slabs
  GJ: (g) => (g < 12000 ? 0 : 200),                                            // Gujarat: nil <12k, 200 above (2022 revision)
  MP: (g, m) => (g <= 18750 ? 0 : g <= 25000 ? 125 : g <= 33333 ? 167 : isFeb(m) ? 212 : 208),
  BR: (g) => (g <= 25000 ? 0 : g <= 41666 ? 83 : g <= 83333 ? 166 : 208),     // Bihar (annual /12)
  OD: (g) => (g <= 13304 ? 0 : g <= 25000 ? 125 : 200),                        // Odisha (Feb 300 cap 2500)
  AS: (g) => (g <= 10000 ? 0 : g <= 15000 ? 150 : g <= 25000 ? 180 : 208),     // Assam
  TN: (g) => { const h = g * 6; const hy = h <= 21000 ? 0 : h <= 30000 ? 135 : h <= 45000 ? 315 : h <= 60000 ? 690 : h <= 75000 ? 1025 : 1250; return Math.round(hy / 6); }, // TN half-yearly → monthly approx
};
const NON_PT_STATES = new Set(["DL", "HR", "UP", "RJ", "UK", "HP", "JK", "CH", "AN", "GA", "LD", "DN"]); // states/UTs with no PT
const STATE_ALIASES = {
  maharashtra: "MH", karnataka: "KA", "west bengal": "WB", westbengal: "WB", "andhra pradesh": "AP", andhrapradesh: "AP",
  telangana: "TG", gujarat: "GJ", "madhya pradesh": "MP", madhyapradesh: "MP", bihar: "BR", odisha: "OD", orissa: "OD",
  assam: "AS", "tamil nadu": "TN", tamilnadu: "TN", delhi: "DL", haryana: "HR", "uttar pradesh": "UP", uttarpradesh: "UP",
  rajasthan: "RJ", uttarakhand: "UK", "himachal pradesh": "HP", goa: "GA",
};
function normalizeState(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^[A-Za-z]{2,3}$/.test(t)) return t.toUpperCase().replace(/&/g, "");       // already a code
  return STATE_ALIASES[t.toLowerCase()] || null;
}
// Back-compat default when no work-state is configured: the pre-per-state flat slab (NO Feb
// bump). Only an EXPLICIT state gets its real slab (e.g. MH's Feb ₹300) — otherwise a Feb
// payroll for an unconfigured tenant would silently over-deduct 200→300 (a money/GL regression).
const DEFAULT_PT = (g) => (g <= 7500 ? 0 : g <= 10000 ? 175 : 200);
function ptAmount(gross, state, month) {
  const g = Number(gross) || 0;
  const code = normalizeState(state);
  if (code && NON_PT_STATES.has(code)) return 0;        // state levies no PT
  const fn = (code && PT_STATE[code]) || DEFAULT_PT;    // explicit state → its slab; unknown/unset → flat default (no regression)
  return fn(g, month);
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
    const pt = ptAmount(gross, statutoryCfg?.ptState || structure.pt_state, month);
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
  const { rows } = await q(tenantId,
    "INSERT INTO hrms_employees(tenant_id,name,email,phone,department,designation,date_of_joining) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [tenantId, e.name, e.email || null, e.phone || null, e.department || null, e.designation || null, e.dateOfJoining || null]
  );
  return rows[0];
}
// Bulk create - each row in its own try/catch so one bad row can't abort the rest.
// createEmployee is a single INSERT (no transaction), so per-row is correct here.
async function bulkCreateEmployees(tenantId, actorId, rows) {
  if (!Array.isArray(rows)) throw new HrError("rows[] required");
  let created = 0, failed = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    try { await createEmployee(tenantId, rows[i] || {}); created += 1; }
    catch (e) { failed += 1; errors.push({ row: i + 1, error: e.message }); }
  }
  return { created, failed, errors };
}
const listEmployees = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_employees WHERE tenant_id=$1 ORDER BY name", [tenantId])).rows;
async function setEmployeeStatus(tenantId, id, status) {
  await q(tenantId,"UPDATE hrms_employees SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, status === "INACTIVE" ? "INACTIVE" : "ACTIVE"]);
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
  const { rows } = await q(tenantId,
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
  const { rows } = await q(tenantId,
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
  const { rows } = await q(tenantId,
    `INSERT INTO hrms_leave_types(tenant_id,leave_type_name,annual_allocation,is_lwp,include_holiday)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,leave_type_name) DO UPDATE SET annual_allocation=EXCLUDED.annual_allocation, is_lwp=EXCLUDED.is_lwp, include_holiday=EXCLUDED.include_holiday
     RETURNING *`,
    [tenantId, t.leaveTypeName, t.annualAllocation || 0, !!t.isLwp, !!t.includeHoliday]
  );
  return rows[0];
}
const listLeaveTypes = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_leave_types WHERE tenant_id=$1 ORDER BY leave_type_name", [tenantId])).rows;
async function paidLeaveTypeNames(tenantId) {
  const { rows } = await q(tenantId,"SELECT leave_type_name FROM hrms_leave_types WHERE tenant_id=$1 AND is_lwp=false", [tenantId]);
  return rows.map((r) => r.leave_type_name);
}

// Allocation → a +ledger entry (Frappe leave_allocation.create_leave_ledger_entry).
async function allocateLeave(tenantId, a) {
  if (!a.employeeId || !a.leaveType || !a.fromDate || !a.toDate) throw new HrError("employeeId, leaveType, fromDate, toDate required");
  const leaves = Number(a.newLeavesAllocated || 0);
  if (!(leaves > 0)) throw new HrError("newLeavesAllocated must be > 0");
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      "INSERT INTO hrms_leave_allocations(tenant_id,employee_id,leave_type,from_date,to_date,new_leaves_allocated) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [tenantId, a.employeeId, a.leaveType, a.fromDate, a.toDate, leaves]
    );
    const alloc = rows[0];
    await client.query(
      "INSERT INTO hrms_leave_ledger(tenant_id,employee_id,leave_type,transaction_type,transaction_id,leaves,from_date,to_date) VALUES($1,$2,$3,'ALLOCATION',$4,$5,$6,$7)",
      [tenantId, a.employeeId, a.leaveType, alloc.id, leaves, a.fromDate, a.toDate]
    );
    return alloc;
  });
}

// balance = Σ leaves in the ledger (allocations positive, consumption negative).
async function leaveBalance(tenantId, employeeId, leaveType) {
  const { rows } = await q(tenantId,
    "SELECT COALESCE(SUM(leaves),0) AS bal FROM hrms_leave_ledger WHERE tenant_id=$1 AND employee_id=$2 AND leave_type=$3",
    [tenantId, employeeId, leaveType]
  );
  return flt(rows[0].bal, 2);
}
async function leaveBalances(tenantId, employeeId) {
  const { rows } = await q(tenantId,
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
  const { rows } = await q(tenantId,
    "INSERT INTO hrms_leave_requests(tenant_id,employee_id,leave_type,from_date,to_date,half_day,days,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [tenantId, l.employeeId, l.leaveType, l.fromDate, l.toDate, !!l.halfDay, days, l.reason || null]
  );
  return rows[0];
}

// Approve → a −ledger entry (consumption). Reject → no ledger impact.
// (Frappe leave_application.create_leave_ledger_entry: leaves = total_leave_days * -1.)
async function decideLeave(tenantId, id, approve) {
  return withTenant(tenantId, async (client) => {
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
    return { ok: true, status: approve ? "APPROVED" : "REJECTED" };
  });
}
const listLeave = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_leave_requests WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId])).rows;

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
  const { rows } = await q(tenantId,
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
const listStructures = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_salary_structures WHERE tenant_id=$1 ORDER BY name", [tenantId])).rows;

async function assignStructure(tenantId, a) {
  if (!a.employeeId || !a.structureId || !a.fromDate) throw new HrError("employeeId, structureId, fromDate required");
  const { rows: st } = await q(tenantId,"SELECT id FROM hrms_salary_structures WHERE tenant_id=$1 AND id=$2", [tenantId, a.structureId]);
  if (!st[0]) throw new HrError("Salary structure not found", 404);
  const { rows } = await q(tenantId,
    "INSERT INTO hrms_structure_assignments(tenant_id,employee_id,structure_id,base,from_date) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [tenantId, a.employeeId, a.structureId, flt(a.base || 0, 2), a.fromDate]
  );
  return rows[0];
}
const listAssignments = async (tenantId) => (await q(tenantId,
  `SELECT a.*, e.name AS employee_name, s.name AS structure_name
     FROM hrms_structure_assignments a
     JOIN hrms_employees e ON e.id=a.employee_id
     JOIN hrms_salary_structures s ON s.id=a.structure_id
    WHERE a.tenant_id=$1 ORDER BY a.from_date DESC`, [tenantId])).rows;

// The latest assignment effective on/before a date (Frappe SSA "from_date <= date desc limit 1").
async function activeAssignment(tenantId, employeeId, onDate) {
  const { rows } = await q(tenantId,
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
async function runPayroll(tenantId, actorId, month, opts = {}) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new HrError("month=YYYY-MM required");
  const { rows: ex } = await q(tenantId,"SELECT id FROM hrms_payroll_runs WHERE tenant_id=$1 AND run_month=$2", [tenantId, month]);
  if (ex[0]) throw new HrError("Payroll already run for this month", 409);

  const onDate = `${month}-28`;
  const paid = await paidLeaveTypeNames(tenantId);
  const costCentreId = opts.costCentreId || null;

  // Batch: active employees who have a structure assignment effective on/before the period.
  const { rows: emps } = await q(tenantId,"SELECT id, name FROM hrms_employees WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY name", [tenantId]);

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
    // (1) ANNUALIZED TDS: deduct the stored per-month projected TDS (mid-year true-up).
    // If a TDS row already exists on the structure, the projection takes precedence.
    const monthlyTds = money(await monthlyTdsFor(tenantId, e.id, month));
    let slipTds = money(0);
    if (monthlyTds.greaterThan(0)) {
      slip.deductions = slip.deductions.filter((d) => !(d.abbr === "TDS" || /tds|income tax/i.test(d.name)));
      slip.deductions.push({ name: "TDS", abbr: "TDS", type: "deduction", amount: Number(toRupees(monthlyTds)), statutory: true });
      slipTds = monthlyTds;
      slip.total_deduction = Number(toRupees(money(sum(slip.deductions.map((d) => d.amount)))));
      slip.net = roundRupee(slip.gross - slip.total_deduction);
    } else {
      const existing = slip.deductions.find((d) => d.abbr === "TDS" || /tds|income tax/i.test(d.name));
      if (existing) slipTds = money(existing.amount);
    }
    slips.push({ employeeId: e.id, employeeName: e.name, tds: toRupees(slipTds), ...slip });
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
  if (!salaries || !salPayable) throw new HrError("Payroll GL ledgers missing - run the books setup (seed) first", 422);

  // ESI + Professional Tax (no dedicated seeded ledger) fold into Staff Deductions.
  const staffDeductions = esi.plus(pt).plus(otherDed);

  // (4a) ACCRUAL journal - Dr expense heads, Cr payables. Cost-centre tags the
  // expense (Salaries) line so cost-centre-wise P&L attributes the payroll cost.
  const entries = [{ ledgerId: salaries, debit: toRupees(gross), credit: "0", costCentreId }];
  if (pf.greaterThan(0)) entries.push({ ledgerId: pfPayable, debit: "0", credit: toRupees(pf) });
  if (tds.greaterThan(0)) entries.push({ ledgerId: tdsPayable, debit: "0", credit: toRupees(tds) });
  if (staffDeductions.greaterThan(0)) entries.push({ ledgerId: deductionsLed, debit: "0", credit: toRupees(staffDeductions) });
  entries.push({ ledgerId: salPayable, debit: "0", credit: toRupees(net) });

  const voucher = await books.postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: onDate, narration: `Payroll accrual ${month}`, source: "payroll" },
    entries, { idempotencyKey: `payroll-accrual:${tenantId}:${month}` });

  // Persist run + payslips with the full breakdown JSON.
  const run = await withTenant(tenantId, async (client) => {
    const { rows: rr } = await client.query(
      `INSERT INTO hrms_payroll_runs(tenant_id,run_month,gross,total_deduction,net,voucher_id,accrual_voucher_id,cost_centre_id,pay_status)
       VALUES($1,$2,$3,$4,$5,$6,$6,$7,'ACCRUED') RETURNING *`,
      [tenantId, month, toRupees(gross), toRupees(totalDeduction), toRupees(net), voucher.voucherId, costCentreId]
    );
    const r = rr[0];
    for (const s of slips) {
      await client.query(
        `INSERT INTO hrms_payslips(tenant_id,run_id,employee_id,employee_name,total_working_days,payment_days,lop_days,earnings,deductions,gross,total_deduction,net,tds)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [tenantId, r.id, s.employeeId, s.employeeName, s.total_working_days, s.payment_days, s.lop_days,
         JSON.stringify(s.earnings), JSON.stringify(s.deductions), s.gross, s.total_deduction, s.net, s.tds || "0.00"]
      );
    }
    return r;
  });
  // Refresh each employee's projection OUTSIDE the txn (computeTdsProjection runs its own
  // tenant-scoped queries; it must not nest inside the withTenant transaction).
  const fy = fyForMonth(month);
  for (const s of slips) await computeTdsProjection(tenantId, s.employeeId, fy).catch(() => {});
  return {
    run, voucher, accrual_voucher: voucher, employees: slips.length, pay_status: "ACCRUED",
    gross: toRupees(gross), total_deduction: toRupees(totalDeduction), net: toRupees(net),
    breakdown: { pf: toRupees(pf), tds: toRupees(tds), esi: toRupees(esi), pt: toRupees(pt), other: toRupees(otherDed) },
    slips,
  };
}

const listPayrollRuns = async (tenantId) => (await q(tenantId,"SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 ORDER BY run_month DESC", [tenantId])).rows;
async function payslipsForRun(tenantId, runId) {
  const { rows } = await q(tenantId,"SELECT * FROM hrms_payslips WHERE tenant_id=$1 AND run_id=$2 ORDER BY employee_name", [tenantId, runId]);
  return rows;
}

// ═════════════════════════════════════════════════════════════════════════════
// (1) ANNUALIZED TDS PROJECTION  (port of frappe/hrms income_tax_computation +
//     salary_slip.compute_year_to_date / get_income_tax_deducted_till_date)
//
// India payroll deducts TDS on salary MONTHLY, but the amount is derived from the
// projected ANNUAL liability: project each employee's full-year taxable salary,
// subtract exemptions (standard deduction + HRA) and Chapter VI-A declarations,
// run the slab+surcharge+cess engine (../books/incometax) for the regime, then
// SPREAD the remaining tax across the months left in the payroll year - a mid-year
// TRUE-UP: (annual_tax − tds_already_deducted) / remaining_months. The result is
// stored so monthly payroll deducts the stored per-month figure.
// ═════════════════════════════════════════════════════════════════════════════
const incometax = require("../books/incometax");

// Payroll year runs 1-Apr (year Y) → 31-Mar (Y+1). 'fy' is "YYYY-YY" (start year).
function payrollYearBounds(fy) {
  const startYear = Number(String(fy).slice(0, 4));
  if (!Number.isFinite(startYear)) throw new HrError(`bad payroll year "${fy}"`);
  return { startYear, start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}
// AY = FY start year + 1 expressed "YYYY-YY". FY 2024-25 → AY 2025-26.
function ayForFy(fy) {
  const s = Number(String(fy).slice(0, 4));
  return `${s + 1}-${String((s + 2) % 100).padStart(2, "0")}`;
}
// Which payroll-year month index (1..12, Apr=1) a 'YYYY-MM' falls in; 0 if outside.
function payrollMonthIndex(fy, month) {
  const { startYear } = payrollYearBounds(fy);
  const [y, m] = month.split("-").map(Number);
  const idx = (y - startYear) * 12 + (m - 4) + 1;
  return idx >= 1 && idx <= 12 ? idx : 0;
}
// The FY that a 'YYYY-MM' payroll month belongs to (Apr-Mar). Returns "YYYY-YY".
function fyForMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

async function getOrCreatePayrollPeriod(tenantId, fy) {
  const { rows } = await q(tenantId,"SELECT * FROM hrms_payroll_periods WHERE tenant_id=$1 AND fy=$2", [tenantId, fy]);
  if (rows[0]) return rows[0];
  const b = payrollYearBounds(fy);
  const { rows: ins } = await q(tenantId,
    `INSERT INTO hrms_payroll_periods(tenant_id,fy,assessment_year,start_date,end_date,regime)
     VALUES($1,$2,$3,$4,$5,'new')
     ON CONFLICT(tenant_id,fy) DO UPDATE SET assessment_year=EXCLUDED.assessment_year RETURNING *`,
    [tenantId, fy, ayForFy(fy), b.start, b.end]
  );
  return ins[0];
}
async function setPayrollPeriod(tenantId, fy, opts = {}) {
  const period = await getOrCreatePayrollPeriod(tenantId, fy);
  const { rows } = await q(tenantId,
    `UPDATE hrms_payroll_periods SET regime=COALESCE($3,regime), standard_deduction=COALESCE($4,standard_deduction)
       WHERE tenant_id=$1 AND fy=$2 RETURNING *`,
    [tenantId, fy, opts.regime === "old" || opts.regime === "new" ? opts.regime : null,
     opts.standardDeduction != null ? flt(opts.standardDeduction, 2) : null]
  );
  return rows[0] || period;
}

// Least-of-three HRA exemption (s.10(13A) + Rule 2A):
//   min( actual HRA received, rent − 10% of basic, 50%/40% of basic ).
// Metro cities → 50% of basic, else 40%. Annualized figures.
function hraExemption({ annualBasic, annualHraReceived, annualRent, isMetro }) {
  const basic = money(annualBasic || 0);
  const hra = money(annualHraReceived || 0);
  const rent = money(annualRent || 0);
  if (rent.lessThanOrEqualTo(0)) return money(0);
  const cityPct = isMetro ? 50 : 40;
  const cap1 = hra;
  const cap2 = rent.minus(basic.times(10).div(100));
  const cap3 = basic.times(cityPct).div(100);
  let least = cap1;
  if (cap2.lessThan(least)) least = cap2;
  if (cap3.lessThan(least)) least = cap3;
  if (least.lessThan(0)) least = money(0);
  return least;
}

// Sum the Chapter VI-A deductions from a declaration's section map, applying the
// statutory caps that matter most in India: 80C ≤ 150000, 80CCD(1B) ≤ 50000,
// 80D ≤ 100000 (generous parent-incl. cap). Other sections passed through.
function chapterVIA(sections = {}) {
  const cap = (key, limit) => {
    const v = money(sections[key] || 0);
    return v.greaterThan(limit) ? money(limit) : v;
  };
  let total = money(0);
  const capped = {};
  const CAPS = { "80C": 150000, "80CCC": 150000, "80CCD1B": 50000, "80D": 100000, "80E": Infinity, "80G": Infinity, "80TTA": 10000, "80TTB": 50000 };
  // 80C + 80CCC + 80CCD(1) share a 1.5L ceiling; treat declared 80C as the combined.
  for (const [k, raw] of Object.entries(sections)) {
    const lim = CAPS[k] != null ? CAPS[k] : Infinity;
    const c = lim === Infinity ? money(raw || 0) : cap(k, lim);
    capped[k] = toRupees(c);
    total = total.plus(c);
  }
  return { total, capped };
}

// Build the per-employee annual projection. Pulls the active structure assignment
// effective at the payroll year start, evaluates a FULL-month (no LOP) slip to get
// the monthly gross / basic / HRA, annualizes them, applies the regime's exemptions
// and the employee's declaration, runs the income-tax engine, and spreads the
// remaining tax over the remaining months (mid-year true-up).
async function computeTdsProjection(tenantId, employeeId, fy, opts = {}) {
  const period = await getOrCreatePayrollPeriod(tenantId, fy);
  const regime = opts.regime || period.regime || "new";
  const ay = period.assessment_year || ayForFy(fy);
  const b = payrollYearBounds(fy);

  const ssa = await activeAssignment(tenantId, employeeId, b.start);
  if (!ssa) {
    // try the earliest assignment within the year if none effective at 1-Apr
    const { rows } = await q(tenantId,
      `SELECT a.*, s.components, s.apply_pf, s.apply_esi, s.apply_pt
         FROM hrms_structure_assignments a JOIN hrms_salary_structures s ON s.id=a.structure_id
        WHERE a.tenant_id=$1 AND a.employee_id=$2 AND a.from_date<=$3 ORDER BY a.from_date DESC LIMIT 1`,
      [tenantId, employeeId, b.end]
    );
    if (!rows[0]) throw new HrError("No salary structure assignment for this employee in the payroll year", 422);
  }
  const a = ssa || (await activeAssignment(tenantId, employeeId, b.end));
  if (!a) throw new HrError("No salary structure assignment for this employee in the payroll year", 422);

  // A full (no-LOP) monthly slip to read recurring gross / basic / HRA.
  const fullSlip = computeSlip({
    base: Number(a.base), components: a.components, month: `${b.startYear}-04`, attendance: [],
    structure: { apply_pf: a.apply_pf, apply_esi: a.apply_esi, apply_pt: a.apply_pt },
    paidLeaveTypes: [],
  });
  const monthlyGross = money(fullSlip.gross);
  const basicComp = fullSlip.earnings.find((e) => /basic/i.test(e.name) || e.abbr === "BS");
  const hraComp = fullSlip.earnings.find((e) => /hra|house rent/i.test(e.name) || e.abbr === "HRA");
  // taxable-applicable earnings only (exclude flagged non-taxable rows)
  const monthlyTaxableEarn = sum(fullSlip.earnings.filter((e) => e.is_tax_applicable !== false).map((e) => e.amount));

  const months = 12;
  const annualGross = money(monthlyTaxableEarn).times(months);
  const annualBasic = money(basicComp ? basicComp.amount : 0).times(months);
  const annualHra = money(hraComp ? hraComp.amount : 0).times(months);

  // Declaration → HRA inputs + Chapter VI-A (proofs override declared once verified).
  const { rows: dr } = await q(tenantId,"SELECT * FROM hrms_investment_declarations WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3", [tenantId, employeeId, fy]);
  const decl = dr[0] || null;
  const useProofs = decl && (decl.status === "PROOF_SUBMITTED" || decl.status === "VERIFIED");
  const sections = decl ? (useProofs ? decl.proofs : decl.declared) || {} : {};
  const monthlyRent = decl ? money(decl.monthly_rent) : money(0);
  const isMetro = decl ? !!decl.is_metro : false;

  // Standard deduction applies to the NEW regime too (post-FY2023-24). HRA exemption
  // only under the OLD regime (new regime forgoes most exemptions).
  const stdDed = money(period.standard_deduction || 50000);
  let exemptions = stdDed;
  let hraEx = money(0);
  let via = { total: money(0), capped: {} };
  if (regime === "old") {
    hraEx = hraExemption({
      annualBasic: toRupees(annualBasic),
      annualHraReceived: toRupees(annualHra),
      annualRent: toRupees(monthlyRent.times(12)),
      isMetro,
    });
    exemptions = exemptions.plus(hraEx);
    via = chapterVIA(sections);
  }

  let taxable = annualGross.minus(exemptions).minus(via.total);
  if (taxable.lessThan(0)) taxable = money(0);

  const tax = incometax.computeIncomeTax({ taxableIncome: toRupees(taxable), regime, entityType: "individual", ay });
  const annualTax = money(tax.total);

  // How much TDS has ALREADY been deducted in this payroll year (mid-year true-up).
  const { rows: paidRows } = await q(tenantId,
    `SELECT COALESCE(SUM(p.tds),0) AS paid
       FROM hrms_payslips p JOIN hrms_payroll_runs r ON r.id=p.run_id
      WHERE p.tenant_id=$1 AND p.employee_id=$2 AND r.run_month BETWEEN $3 AND $4`,
    [tenantId, employeeId, `${b.startYear}-04`, `${b.startYear + 1}-03`]
  );
  const paid = money(paidRows[0].paid);

  // Remaining months: from the next un-run month to Mar. Count payslips already run.
  const ranMonths = Number((await q(tenantId,
    `SELECT COUNT(*) AS n FROM hrms_payslips p JOIN hrms_payroll_runs r ON r.id=p.run_id
      WHERE p.tenant_id=$1 AND p.employee_id=$2 AND r.run_month BETWEEN $3 AND $4`,
    [tenantId, employeeId, `${b.startYear}-04`, `${b.startYear + 1}-03`]
  )).rows[0].n);
  const remaining = Math.max(1, months - ranMonths);

  let perMonth = annualTax.minus(paid).div(remaining);
  if (perMonth.lessThan(0)) perMonth = money(0);
  perMonth = money(roundRupee(toRupees(perMonth)));

  const computation = {
    monthlyGross: toRupees(monthlyGross), annualGross: toRupees(annualGross),
    annualBasic: toRupees(annualBasic), annualHra: toRupees(annualHra),
    standardDeduction: toRupees(stdDed), hraExemption: toRupees(hraEx),
    chapterVIA: via.capped, chapterVIATotal: toRupees(via.total),
    taxable: toRupees(taxable), tax, ay, regime,
    paidToDate: toRupees(paid), remainingMonths: remaining,
    usedProofs: !!useProofs,
  };

  const { rows: up } = await q(tenantId,
    `INSERT INTO hrms_tds_projections
      (tenant_id,employee_id,fy,regime,projected_gross,total_exemptions,chapter_via,
       projected_taxable,annual_tax,tds_paid_to_date,remaining_months,tds_per_month,computation,computed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     ON CONFLICT(tenant_id,employee_id,fy) DO UPDATE SET
       regime=EXCLUDED.regime, projected_gross=EXCLUDED.projected_gross, total_exemptions=EXCLUDED.total_exemptions,
       chapter_via=EXCLUDED.chapter_via, projected_taxable=EXCLUDED.projected_taxable, annual_tax=EXCLUDED.annual_tax,
       tds_paid_to_date=EXCLUDED.tds_paid_to_date, remaining_months=EXCLUDED.remaining_months,
       tds_per_month=EXCLUDED.tds_per_month, computation=EXCLUDED.computation, computed_at=now()
     RETURNING *`,
    [tenantId, employeeId, fy, regime, toRupees(annualGross), toRupees(exemptions), toRupees(via.total),
     toRupees(taxable), toRupees(annualTax), toRupees(paid), remaining, toRupees(perMonth), JSON.stringify(computation)]
  );
  return up[0];
}

// Recompute projections for all assigned active employees for a payroll year.
async function projectTdsForYear(tenantId, fy) {
  const { rows: emps } = await q(tenantId,"SELECT id FROM hrms_employees WHERE tenant_id=$1 AND status='ACTIVE'", [tenantId]);
  const out = [];
  for (const e of emps) {
    try { out.push(await computeTdsProjection(tenantId, e.id, fy)); }
    catch (err) { if (!(err instanceof HrError)) throw err; }  // skip employees with no SSA
  }
  return { fy, projected: out.length, projections: out };
}
async function getTdsProjection(tenantId, employeeId, fy) {
  const { rows } = await q(tenantId,"SELECT * FROM hrms_tds_projections WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3", [tenantId, employeeId, fy]);
  return rows[0] || null;
}
const listTdsProjections = async (tenantId, fy) => (await q(tenantId,
  `SELECT pr.*, e.name AS employee_name FROM hrms_tds_projections pr JOIN hrms_employees e ON e.id=pr.employee_id
    WHERE pr.tenant_id=$1 AND pr.fy=$2 ORDER BY e.name`, [tenantId, fy])).rows;

// The per-month TDS to deduct for an employee in a given payroll month. Reads the
// stored projection (computing one if absent). Returns a money string.
async function monthlyTdsFor(tenantId, employeeId, month) {
  const fy = fyForMonth(month);
  let proj = await getTdsProjection(tenantId, employeeId, fy);
  if (!proj) { try { proj = await computeTdsProjection(tenantId, employeeId, fy); } catch { return "0.00"; } }
  return toRupees(money(proj.tds_per_month));
}

// ═════════════════════════════════════════════════════════════════════════════
// (2) INVESTMENT DECLARATION + PROOF lifecycle
//   DRAFT → SUBMITTED (planned) → PROOF_SUBMITTED → VERIFIED.
// Declared amounts feed the TDS projection; once proofs are submitted/verified the
// projection uses the proof figures instead. Saving/advancing re-projects TDS.
// ═════════════════════════════════════════════════════════════════════════════
async function saveDeclaration(tenantId, d) {
  if (!d.employeeId || !d.fy) throw new HrError("employeeId and fy required");
  const declared = d.declared && typeof d.declared === "object" ? d.declared : {};
  const { rows } = await q(tenantId,
    `INSERT INTO hrms_investment_declarations(tenant_id,employee_id,fy,monthly_rent,is_metro,declared,status)
     VALUES($1,$2,$3,$4,$5,$6,'DRAFT')
     ON CONFLICT(tenant_id,employee_id,fy) DO UPDATE SET
       monthly_rent=EXCLUDED.monthly_rent, is_metro=EXCLUDED.is_metro, declared=EXCLUDED.declared
     RETURNING *`,
    [tenantId, d.employeeId, d.fy, flt(d.monthlyRent || 0, 2), !!d.isMetro, JSON.stringify(declared)]
  );
  return rows[0];
}
// Advance the lifecycle. SUBMIT stamps the planned declaration; SUBMIT_PROOF stores
// actual proofs; VERIFY marks proofs accepted. Each transition re-projects TDS.
async function advanceDeclaration(tenantId, d) {
  if (!d.employeeId || !d.fy || !d.action) throw new HrError("employeeId, fy, action required");
  const { rows: cur } = await q(tenantId,"SELECT * FROM hrms_investment_declarations WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3", [tenantId, d.employeeId, d.fy]);
  if (!cur[0]) throw new HrError("Declaration not found - save it first", 404);
  const action = d.action;
  let sql, params;
  if (action === "SUBMIT") {
    sql = "UPDATE hrms_investment_declarations SET status='SUBMITTED', submitted_at=now() WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3 AND status='DRAFT' RETURNING *";
    params = [tenantId, d.employeeId, d.fy];
  } else if (action === "SUBMIT_PROOF") {
    const proofs = d.proofs && typeof d.proofs === "object" ? d.proofs : {};
    sql = "UPDATE hrms_investment_declarations SET status='PROOF_SUBMITTED', proofs=$4, proof_submitted_at=now() WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3 AND status IN ('SUBMITTED','PROOF_SUBMITTED') RETURNING *";
    params = [tenantId, d.employeeId, d.fy, JSON.stringify(proofs)];
  } else if (action === "VERIFY") {
    sql = "UPDATE hrms_investment_declarations SET status='VERIFIED', verified_at=now() WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3 AND status='PROOF_SUBMITTED' RETURNING *";
    params = [tenantId, d.employeeId, d.fy];
  } else throw new HrError(`Unknown action "${action}" (SUBMIT|SUBMIT_PROOF|VERIFY)`);
  const { rows } = await q(tenantId,sql, params);
  if (!rows[0]) throw new HrError(`Cannot ${action} from current status "${cur[0].status}"`, 409);
  // Re-project so the new figures flow into monthly TDS.
  await computeTdsProjection(tenantId, d.employeeId, d.fy).catch(() => {});
  return rows[0];
}
async function getDeclaration(tenantId, employeeId, fy) {
  const { rows } = await q(tenantId,"SELECT * FROM hrms_investment_declarations WHERE tenant_id=$1 AND employee_id=$2 AND fy=$3", [tenantId, employeeId, fy]);
  return rows[0] || null;
}
const listDeclarations = async (tenantId, fy) => (await q(tenantId,
  `SELECT d.*, e.name AS employee_name FROM hrms_investment_declarations d JOIN hrms_employees e ON e.id=d.employee_id
    WHERE d.tenant_id=$1 AND d.fy=$2 ORDER BY e.name`, [tenantId, fy])).rows;

// ═════════════════════════════════════════════════════════════════════════════
// (4a) Two-stage payroll → GL  (Frappe payroll_entry.make_accrual_jv_entry +
//      make_payment_entry). runPayroll posts the ACCRUAL journal; this posts the
//      consolidated bank PAYMENT for a run (Dr payable, Cr bank), once.
// ═════════════════════════════════════════════════════════════════════════════
// Resolve a GL ledger by name, falling back through a list (so unseeded payroll
// ledgers degrade to a seeded one rather than throwing).
async function resolveLedger(tenantId, names) {
  for (const n of names) { const id = await books.ledgerIdByName(tenantId, n); if (id) return id; }
  return null;
}
async function payPayrollRun(tenantId, actorId, runId, opts = {}) {
  const { rows: rr } = await q(tenantId,"SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 AND id=$2", [tenantId, runId]);
  const run = rr[0];
  if (!run) throw new HrError("Payroll run not found", 404);
  if (run.pay_status === "PAID") throw new HrError("Payroll run already paid", 409);

  const net = money(run.net);
  const bank = await resolveLedger(tenantId, [opts.bankLedger, "Bank Accounts", "Bank", "Cash"].filter(Boolean));
  const salPayable = await resolveLedger(tenantId, ["Salaries Payable"]);
  if (!bank || !salPayable) throw new HrError("Bank / Salaries Payable ledger missing - seed books first", 422);

  const payDate = opts.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : `${run.run_month}-28`;
  const entries = [
    { ledgerId: salPayable, debit: toRupees(net), credit: "0", costCentreId: run.cost_centre_id || null },
    { ledgerId: bank, debit: "0", credit: toRupees(net) },
  ];
  const voucher = await books.postVoucher(tenantId, actorId,
    { voucherType: "PAYMENT", voucherDate: payDate, narration: `Payroll payment ${run.run_month}`, source: "payroll" },
    entries, { idempotencyKey: `payroll-pay:${tenantId}:${runId}` });

  await q(tenantId,"UPDATE hrms_payroll_runs SET pay_status='PAID', payment_voucher_id=$3 WHERE tenant_id=$1 AND id=$2",
    [tenantId, runId, voucher.voucherId]);
  return { runId, pay_status: "PAID", payment_voucher: voucher, net: toRupees(net) };
}

// ═════════════════════════════════════════════════════════════════════════════
// (4b) Region-based GRATUITY  (Frappe Gratuity Rule + gratuity computation)
//   gratuity = fraction_per_year × last_drawn_basic × completed_years, eligible
//   only after min_years of service, capped at the statutory max. Seeds India's
//   default 15/26-per-year (Payment of Gratuity Act) slab on first read.
// ═════════════════════════════════════════════════════════════════════════════
async function ensureGratuitySlabs(tenantId) {
  const { rows } = await q(tenantId,"SELECT 1 FROM hrms_gratuity_slabs WHERE tenant_id=$1 LIMIT 1", [tenantId]);
  if (rows[0]) return;
  // India: 15 days' wages per completed year on a 26-day month = 15/26 per year,
  // eligible after 5 years, capped ₹20,00,000.
  await q(tenantId,
    `INSERT INTO hrms_gratuity_slabs(tenant_id,region,from_year,to_year,fraction_per_year,min_years,max_amount)
     VALUES($1,'India',0,NULL,$2,5,2000000)`,
    [tenantId, 15 / 26]
  );
}
async function listGratuitySlabs(tenantId, region) {
  await ensureGratuitySlabs(tenantId);
  const { rows } = await q(tenantId,
    "SELECT * FROM hrms_gratuity_slabs WHERE tenant_id=$1 AND ($2::text IS NULL OR region=$2) ORDER BY region, from_year",
    [tenantId, region || null]);
  return rows;
}
async function upsertGratuitySlab(tenantId, s) {
  const { rows } = await q(tenantId,
    `INSERT INTO hrms_gratuity_slabs(tenant_id,region,from_year,to_year,fraction_per_year,min_years,max_amount)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, s.region || "India", flt(s.fromYear || 0, 2), s.toYear != null ? flt(s.toYear, 2) : null,
     Number(s.fractionPerYear || 0), flt(s.minYears != null ? s.minYears : 5, 2), s.maxAmount != null ? flt(s.maxAmount, 2) : null]);
  return rows[0];
}
function yearsBetween(fromDate, toDate) {
  const ms = new Date(toDate) - new Date(fromDate);
  return Math.max(0, ms / (365.25 * 86400000));
}
// Pure gratuity computation against a region's slab set.
function gratuityAmount({ lastBasic, completedYears, slabs, region = "India" }) {
  const applicable = (slabs || []).filter((s) => String(s.region) === String(region))
    .sort((a, b) => Number(a.from_year) - Number(b.from_year));
  // pick the band covering completedYears (last from_year ≤ years)
  let band = null;
  for (const s of applicable) {
    if (Number(s.from_year) <= completedYears && (s.to_year == null || completedYears <= Number(s.to_year))) band = s;
  }
  if (!band) band = applicable[applicable.length - 1] || null;
  if (!band) return { eligible: false, amount: "0.00", reason: "no gratuity slab configured" };
  const minY = Number(band.min_years || 0);
  if (completedYears < minY) return { eligible: false, amount: "0.00", reason: `service < ${minY} years` };
  const years = Math.floor(completedYears); // completed years only
  let amt = money(lastBasic).times(band.fraction_per_year).times(years);
  if (band.max_amount != null && amt.greaterThan(band.max_amount)) amt = money(band.max_amount);
  return { eligible: true, amount: toRupees(amt), completedYears: years, fractionPerYear: Number(band.fraction_per_year), cappedAt: band.max_amount };
}
// DB-backed gratuity for an employee as of a relieving date.
async function computeGratuity(tenantId, employeeId, relievingDate, opts = {}) {
  const { rows: er } = await q(tenantId,"SELECT * FROM hrms_employees WHERE tenant_id=$1 AND id=$2", [tenantId, employeeId]);
  const emp = er[0];
  if (!emp) throw new HrError("Employee not found", 404);
  if (!emp.date_of_joining) throw new HrError("Employee has no date_of_joining", 422);
  const slabs = await listGratuitySlabs(tenantId, opts.region || "India");
  // last drawn basic: from the latest assignment's structure (a full-month slip).
  let lastBasic = money(opts.lastBasic || 0);
  if (lastBasic.lessThanOrEqualTo(0)) {
    const a = await activeAssignment(tenantId, employeeId, relievingDate);
    if (a) {
      const fs = computeSlip({ base: Number(a.base), components: a.components, month: String(relievingDate).slice(0, 7),
        structure: { apply_pf: a.apply_pf, apply_esi: a.apply_esi, apply_pt: a.apply_pt }, attendance: [], paidLeaveTypes: [] });
      const bc = fs.earnings.find((e) => /basic/i.test(e.name) || e.abbr === "BS");
      lastBasic = money(bc ? bc.amount : a.base);
    }
  }
  const completed = yearsBetween(emp.date_of_joining, relievingDate);
  return { employeeId, region: opts.region || "India", lastBasic: toRupees(lastBasic),
    serviceYears: flt(completed, 2), ...gratuityAmount({ lastBasic: toRupees(lastBasic), completedYears: completed, slabs, region: opts.region || "India" }) };
}

// ═════════════════════════════════════════════════════════════════════════════
// (4c) EMPLOYEE LOANS (for F&F recovery)
// ═════════════════════════════════════════════════════════════════════════════
// Resolve (or create) the asset ledger a staff loan is disbursed into, under the seeded
// "Loans & Advances (Asset)" group. Returns null if the books aren't seeded.
async function ensureStaffAdvanceLedger(tenantId) {
  const existing = await resolveLedger(tenantId, ["Staff Loans & Advances", "Employee Advances", "Staff Advances"]);
  if (existing) return existing;
  const { rows: g } = await pool.query(
    "SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name='Loans & Advances (Asset)' LIMIT 1", [tenantId]);
  if (!g[0]) return null;
  const { rows: ins } = await pool.query(
    "INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,'Staff Loans & Advances',$2) ON CONFLICT(tenant_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [tenantId, g[0].id]);
  return ins[0].id;
}

async function createLoan(tenantId, l) {
  if (!l.employeeId || !(Number(l.principal) > 0)) throw new HrError("employeeId and principal>0 required");
  const { rows } = await q(tenantId,
    "INSERT INTO hrms_employee_loans(tenant_id,employee_id,principal,outstanding) VALUES($1,$2,$3,$3) RETURNING *",
    [tenantId, l.employeeId, flt(l.principal, 2)]);
  const loan = rows[0];
  // Post the disbursement to the GL (best-effort, idempotent): Dr Staff Loans & Advances / Cr Bank.
  // Previously createLoan only inserted a row — the money never hit the ledger.
  try {
    const bank = await resolveLedger(tenantId, [l.bankLedger, "Bank Accounts", "Bank", "Cash"].filter(Boolean));
    const advance = await ensureStaffAdvanceLedger(tenantId);
    if (bank && advance) {
      await books.postVoucher(tenantId, l.actorId || null,
        { voucherType: "PAYMENT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Staff loan disbursed (employee ${l.employeeId})`, source: "hrms" },
        [{ ledgerId: advance, debit: flt(l.principal, 2), credit: 0 }, { ledgerId: bank, debit: 0, credit: flt(l.principal, 2) }],
        { idempotencyKey: `emp_loan_disburse:${loan.id}` });
    }
  } catch (e) { console.warn("[hrms] loan disbursement GL skipped:", e && e.message); }
  return loan;
}
const loansFor = async (tenantId, e) => (await q(tenantId,"SELECT * FROM hrms_employee_loans WHERE tenant_id=$1 AND employee_id=$2 AND status='OPEN' ORDER BY created_at", [tenantId, e])).rows;

// ═════════════════════════════════════════════════════════════════════════════
// (4d) FULL & FINAL SETTLEMENT  (Frappe "Full and Final Statement")
//   net = pending salary + other dues + gratuity + leave encashment
//         − loan recovery − other deductions.
//   Posts a GL voucher (Dr Salaries/expense for earnings, Cr Salaries Payable net,
//   Dr loan recovery against the payable etc.) and marks the employee relieved.
// ═════════════════════════════════════════════════════════════════════════════
// Leave encashment = encashable leave balance × per-day basic (last basic / 30).
function leaveEncashmentAmount({ encashableDays, lastBasic, perDayDivisor = 30 }) {
  if (!(Number(encashableDays) > 0)) return money(0);
  const perDay = money(lastBasic).div(perDayDivisor);
  return perDay.times(encashableDays);
}
async function fullAndFinal(tenantId, actorId, d) {
  if (!d.employeeId || !d.relievingDate) throw new HrError("employeeId and relievingDate required");
  const { rows: er } = await q(tenantId,"SELECT * FROM hrms_employees WHERE tenant_id=$1 AND id=$2", [tenantId, d.employeeId]);
  const emp = er[0];
  if (!emp) throw new HrError("Employee not found", 404);

  // 1. Gratuity (region-based).
  const grat = await computeGratuity(tenantId, d.employeeId, d.relievingDate, { region: d.region });
  const gratuity = money(grat.eligible ? grat.amount : 0);

  // 2. Leave encashment: sum of positive leave balances × per-day basic.
  let encashDays = Number(d.encashableDays || 0);
  if (d.encashableDays == null) {
    const bals = await leaveBalances(tenantId, d.employeeId);
    encashDays = bals.reduce((a, b) => a + Math.max(0, Number(b.balance)), 0);
  }
  const leaveEnc = leaveEncashmentAmount({ encashableDays: encashDays, lastBasic: grat.lastBasic, perDayDivisor: d.perDayDivisor || 30 });

  // 3. Dues + recoveries.
  const pendingSalary = money(d.pendingSalary || 0);
  const otherDues = money(d.otherDues || 0);
  const otherDeductions = money(d.otherDeductions || 0);

  // 4. Loan recovery: outstanding open loans (or caller override).
  let loanRecovery = money(d.loanRecovery || 0);
  if (d.loanRecovery == null) {
    const loans = await loansFor(tenantId, d.employeeId);
    loanRecovery = loans.reduce((a, l) => a.plus(l.outstanding), money(0));
  }

  const earningsTotal = pendingSalary.plus(otherDues).plus(gratuity).plus(leaveEnc);
  const deductionsTotal = loanRecovery.plus(otherDeductions);
  let net = earningsTotal.minus(deductionsTotal);
  if (net.lessThan(0)) net = money(0);

  const breakdown = {
    gratuity: toRupees(gratuity), gratuityDetail: grat,
    leaveEncashment: toRupees(leaveEnc), encashableDays: encashDays,
    pendingSalary: toRupees(pendingSalary), otherDues: toRupees(otherDues),
    loanRecovery: toRupees(loanRecovery), otherDeductions: toRupees(otherDeductions),
    earningsTotal: toRupees(earningsTotal), deductionsTotal: toRupees(deductionsTotal),
    netPayable: toRupees(net),
  };

  // GL: Dr Salaries (earnings) + Dr Staff Deductions reversal for recoveries, Cr
  // Salaries Payable (net) + Cr Staff Deductions (recoveries/other deductions).
  const salaries = await resolveLedger(tenantId, ["Salaries"]);
  const salPayable = await resolveLedger(tenantId, ["Salaries Payable"]);
  const staffDed = await resolveLedger(tenantId, ["Staff Deductions"]);
  if (!salaries || !salPayable) throw new HrError("Payroll GL ledgers missing - seed books first", 422);

  const entries = [{ ledgerId: salaries, debit: toRupees(earningsTotal), credit: "0", costCentreId: d.costCentreId || null }];
  if (deductionsTotal.greaterThan(0)) entries.push({ ledgerId: staffDed || salPayable, debit: "0", credit: toRupees(deductionsTotal) });
  if (net.greaterThan(0)) entries.push({ ledgerId: salPayable, debit: "0", credit: toRupees(net) });
  // balance guard: if earnings == deductions (net 0) the two lines balance already.

  let voucher = null;
  if (earningsTotal.greaterThan(0)) {
    voucher = await books.postVoucher(tenantId, actorId,
      { voucherType: "JOURNAL", voucherDate: d.relievingDate, narration: `Full & Final - ${emp.name}`, source: "payroll" },
      entries, { idempotencyKey: `fnf:${tenantId}:${d.employeeId}:${d.relievingDate}` });
  }

  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO hrms_full_and_final
        (tenant_id,employee_id,relieving_date,gratuity,leave_encashment,pending_salary,other_dues,
         loan_recovery,other_deductions,net_payable,breakdown,voucher_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tenantId, d.employeeId, d.relievingDate, toRupees(gratuity), toRupees(leaveEnc), toRupees(pendingSalary),
       toRupees(otherDues), toRupees(loanRecovery), toRupees(otherDeductions), toRupees(net),
       JSON.stringify(breakdown), voucher ? voucher.voucherId : null]);
    // close recovered loans + relieve the employee
    if (loanRecovery.greaterThan(0) && d.loanRecovery == null) {
      await client.query("UPDATE hrms_employee_loans SET outstanding=0, status='CLOSED' WHERE tenant_id=$1 AND employee_id=$2 AND status='OPEN'", [tenantId, d.employeeId]);
    }
    await client.query("UPDATE hrms_employees SET status='INACTIVE', relieving_date=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, d.employeeId, d.relievingDate]);
    return { ...rows[0], breakdown, voucher };
  });
}
const listFullAndFinal = async (tenantId) => (await q(tenantId,
  `SELECT f.*, e.name AS employee_name FROM hrms_full_and_final f JOIN hrms_employees e ON e.id=f.employee_id
    WHERE f.tenant_id=$1 ORDER BY f.created_at DESC`, [tenantId])).rows;

// ─────────────────────────────────────────────────────────────────────────────
// EPFO ECR (Electronic Challan cum Return) file generation for a payroll run.
// Reads the persisted payslips, derives each PF member's EPF/EPS/EDLI wages + the
// EE(12%)/EPS(8.33%)/ER(3.67%) split from the deducted PF, and emits the standard
// #~#-delimited ECR lines the employer uploads to the EPFO portal. Generation only —
// the actual EPFO upload is credential-gated and NOT performed here.
async function generateEcr(tenantId, runId) {
  const { rows: rr } = await q(tenantId, "SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 AND id=$2", [tenantId, runId]);
  const run = rr[0];
  if (!run) throw new HrError("Payroll run not found", 404);
  const { rows: slips } = await q(tenantId,
    `SELECT p.employee_name, p.gross, p.lop_days, p.deductions, e.uan
       FROM hrms_payslips p JOIN hrms_employees e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id
      WHERE p.tenant_id=$1 AND p.run_id=$2 ORDER BY p.employee_name`, [tenantId, runId]);

  const R = (x) => Math.round(Number(x) || 0);
  const lines = [];
  let members = 0, membersWithoutUan = 0;
  const totals = { gross: 0, epf_wages: 0, eps_wages: 0, ee: 0, eps: 0, er: 0 };
  for (const s of slips) {
    const deds = Array.isArray(s.deductions) ? s.deductions : [];
    const pf = deds.find((d) => d.abbr === "PF" || /provident/i.test(d.name || ""));
    const pfAmt = pf ? R(pf.amount) : 0;
    if (pfAmt <= 0) continue; // not a contributing PF member this month → excluded from the ECR
    members += 1;
    const epfWages = R(pfAmt / STATUTORY.PF_RATE);                 // wages PF was computed on (already ≤ ceiling)
    const epsWages = Math.min(epfWages, STATUTORY.PF_WAGE_CEILING);
    const ee  = pfAmt;                                             // EE 12%
    const eps = R(epsWages * 0.0833);                              // EPS 8.33%
    const er  = ee - eps;                                          // ER PF share (3.67%)
    const ncp = R(s.lop_days || 0);                                // non-contributory period days
    const uan = String(s.uan || "").trim();
    if (!uan) membersWithoutUan += 1;
    // 11 ECR fields: UAN, Name, GrossWages, EPFWages, EPSWages, EDLIWages, EE, EPS, ER, NCP, RefundAdvances
    lines.push([uan, String(s.employee_name || "").toUpperCase(), R(s.gross), epfWages, epsWages, epsWages, ee, eps, er, ncp, 0].join("#~#"));
    totals.gross += R(s.gross); totals.epf_wages += epfWages; totals.eps_wages += epsWages;
    totals.ee += ee; totals.eps += eps; totals.er += er;
  }
  return {
    run_month: run.run_month,
    file_name: `ECR_${tenantId}_${run.run_month}.txt`,
    content: lines.join("\n") + (lines.length ? "\n" : ""),
    member_count: members,
    members_without_uan: membersWithoutUan,   // employer must fill UAN before uploading these
    totals,
    upload: "gated", // EPFO portal upload requires the employer's establishment credentials
  };
}

// ESIC monthly contribution return for a payroll run. For each ESI member (gross within
// the ESI threshold → ESI deducted) emits the IP-wise contribution row (IP number, name,
// paid days, wages) as the CSV the employer uploads to the ESIC portal. EE is the 0.75%
// deducted; ER is 3.25% of wages. Generation only — the ESIC portal upload is gated.
async function generateEsicReturn(tenantId, runId) {
  const { rows: rr } = await q(tenantId, "SELECT * FROM hrms_payroll_runs WHERE tenant_id=$1 AND id=$2", [tenantId, runId]);
  const run = rr[0];
  if (!run) throw new HrError("Payroll run not found", 404);
  const { rows: slips } = await q(tenantId,
    `SELECT p.employee_name, p.gross, p.payment_days, p.deductions, e.esic_ip
       FROM hrms_payslips p JOIN hrms_employees e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id
      WHERE p.tenant_id=$1 AND p.run_id=$2 ORDER BY p.employee_name`, [tenantId, runId]);
  const R = (x) => Math.round(Number(x) || 0);
  const rows = [["IPNumber", "IPName", "NoOfDays", "TotalMonthlyWages", "ReasonCode", "LastWorkingDay"]];
  let members = 0, membersWithoutIp = 0;
  const totals = { wages: 0, ee: 0, er: 0 };
  for (const s of slips) {
    const deds = Array.isArray(s.deductions) ? s.deductions : [];
    const esi = deds.find((d) => d.abbr === "ESI" || /employee state insurance|^esi/i.test(d.name || ""));
    const eeAmt = esi ? R(esi.amount) : 0;
    if (eeAmt <= 0) continue; // not an ESI member this month → excluded
    members += 1;
    const wages = R(s.gross);
    const days = R(s.payment_days || 0);
    const ip = String(s.esic_ip || "").trim();
    if (!ip) membersWithoutIp += 1;
    rows.push([ip, String(s.employee_name || "").toUpperCase(), days, wages, 0, ""]);
    totals.wages += wages; totals.ee += eeAmt; totals.er += Math.round(wages * 0.0325);
  }
  return {
    run_month: run.run_month,
    file_name: `ESIC_${tenantId}_${run.run_month}.csv`,
    content: rows.map((r) => r.join(",")).join("\n") + "\n",
    member_count: members,
    members_without_ip: membersWithoutIp,   // employer must fill the ESIC IP number before uploading
    totals,
    upload: "gated", // ESIC portal upload requires the employer's establishment credentials
  };
}

// Form 24Q quarterly deductee-wise TDS statement (salary, §192). Aggregates the quarter's
// payslips per employee into the deductee schedule an employer/CA completes with PANs and
// feeds into the NSDL RPU/FVU utility to produce the filing. Correct by construction — TDS
// and salary are keyed to the same hrms_employee. NOTE: PAN is NOT sourced here (it lives on
// a separate legacy `employees` table with no reliable join), so it is left for completion;
// the FVU file build + TRACES upload are deferred/gated, never faked.
// Link each HRMS employee to its legacy payroll `employees` record by EXACT email match
// (exactly one → link; zero or many → leave unlinked, never guess). Idempotent: only touches
// still-unlinked rows. This is what lets 24Q/Form-16 pull the correct PAN.
async function linkPayrollEmployees(tenantId) {
  const { rows: hemps } = await q(tenantId,
    "SELECT id, email FROM hrms_employees WHERE tenant_id=$1 AND legacy_employee_id IS NULL AND email IS NOT NULL AND email <> ''", [tenantId]);
  let linked = 0, ambiguous = 0;
  for (const h of hemps) {
    const { rows: m } = await pool.query("SELECT id FROM employees WHERE tenant_id=$1 AND LOWER(email)=LOWER($2)", [tenantId, h.email]); // legacy table, not RLS'd
    if (m.length === 1) { await q(tenantId, "UPDATE hrms_employees SET legacy_employee_id=$2 WHERE tenant_id=$1 AND id=$3", [tenantId, m[0].id, h.id]); linked += 1; }
    else if (m.length > 1) ambiguous += 1; // multiple legacy records with the same email → manual
  }
  const { rows: un } = await q(tenantId, "SELECT COUNT(*)::int AS n FROM hrms_employees WHERE tenant_id=$1 AND legacy_employee_id IS NULL", [tenantId]);
  return { linked, ambiguous, still_unlinked: un[0].n };
}

const Q_MONTHS = { 1: ["04", "05", "06"], 2: ["07", "08", "09"], 3: ["10", "11", "12"], 4: ["01", "02", "03"] };
async function generateForm24QStatement(tenantId, fyStartYear, quarter) {
  const y = parseInt(fyStartYear, 10);
  const qn = parseInt(quarter, 10);
  if (!(y > 1900) || !Q_MONTHS[qn]) throw new HrError("valid fyStartYear + quarter (1-4) required", 400);
  const yr = qn === 4 ? y + 1 : y; // Q4 (Jan-Mar) falls in the next calendar year
  const months = Q_MONTHS[qn].map((m) => `${yr}-${m}`);
  // PAN comes from the linked legacy `employees` record (encrypted) — no name-guessing.
  const { rows } = await q(tenantId,
    `SELECT p.employee_name, le.pan AS pan_enc,
            COALESCE(SUM(p.gross),0) AS salary, COALESCE(SUM(p.tds),0) AS tds
       FROM hrms_payslips p
       JOIN hrms_payroll_runs r ON r.id=p.run_id AND r.tenant_id=p.tenant_id
       JOIN hrms_employees e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id
       LEFT JOIN employees le ON le.id=e.legacy_employee_id AND le.tenant_id=$1
      WHERE p.tenant_id=$1 AND r.run_month = ANY($2::text[])
      GROUP BY p.employee_id, p.employee_name, le.pan
      HAVING COALESCE(SUM(p.tds),0) > 0
      ORDER BY p.employee_name`, [tenantId, months]);
  const R = (x) => Math.round(Number(x) || 0);
  let deducteesWithoutPan = 0;
  const deductees = rows.map((r2) => {
    const pan = r2.pan_enc ? String(fc.decrypt(r2.pan_enc)).trim() || null : null;
    if (!pan) deducteesWithoutPan += 1;
    return { pan, name: r2.employee_name, section: "192B", salary_paid: R(r2.salary), tds_deducted: R(r2.tds) };
  });
  return {
    form: "24Q",
    financial_year: `${y}-${y + 1}`,
    quarter: `Q${qn}`,
    months,
    deductees,
    deductee_count: deductees.length,
    deductees_without_pan: deducteesWithoutPan, // run POST /payroll/link-legacy, or add the PAN on the payroll record
    total_salary: deductees.reduce((s, d) => s + d.salary_paid, 0),
    total_tds: deductees.reduce((s, d) => s + d.tds_deducted, 0),
    note: "Deductee-wise TDS (§192) statement for the quarter. PANs are pulled from linked payroll records; complete any missing, then generate the FVU via the NSDL RPU utility and file on TRACES.",
    fvu: "deferred",   // NSDL FVU multi-record file build is a dedicated task
    upload: "gated",   // TRACES filing needs the deductor's credentials
  };
}

// Form 16 Part B — the EMPLOYER-generated salary-TDS annexure (Part A, with the TRACES
// digital signature, is downloaded from TRACES and attached; Part B is NOT filed anywhere,
// so this is a complete, non-gated deliverable). Assembles the annual breakup per employee
// straight from the figures the TDS true-up already computed (hrms_tds_projections) + actual
// FY payslip totals + the investment declaration. The §10 exemption is derived as the residual
// so the statement always reconciles to the engine's own taxable-income figure.
const fyMonthList = (y) => [4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => `${y}-${String(m).padStart(2, "0")}`)
  .concat([1, 2, 3].map((m) => `${y + 1}-${String(m).padStart(2, "0")}`));

async function generateForm16B(tenantId, fyStartYear) {
  const y = parseInt(fyStartYear, 10);
  if (!(y > 1900)) throw new HrError("valid fyStartYear (e.g. 2024) required", 400);
  const fy = `${y}-${String(y + 1).slice(-2)}`;               // '2024-25'
  const months = fyMonthList(y);
  const R = (x) => Math.round(Number(x) || 0);

  const [paid, projs, decls, pt, periods] = await Promise.all([
    q(tenantId,
      `SELECT e.id, e.name AS employee_name, le.pan AS pan_enc,
              COALESCE(SUM(ps.gross),0) AS gross_paid, COALESCE(SUM(ps.tds),0) AS tds_deducted
         FROM hrms_employees e
         LEFT JOIN hrms_payroll_runs r ON r.tenant_id=e.tenant_id AND r.run_month = ANY($2::text[])
         LEFT JOIN hrms_payslips ps ON ps.run_id=r.id AND ps.employee_id=e.id AND ps.tenant_id=e.tenant_id
         LEFT JOIN employees le ON le.id=e.legacy_employee_id AND le.tenant_id=e.tenant_id
        WHERE e.tenant_id=$1
        GROUP BY e.id, e.name, le.pan
        HAVING COALESCE(SUM(ps.gross),0) > 0
        ORDER BY e.name`, [tenantId, months]),
    q(tenantId, "SELECT employee_id, regime, projected_gross, chapter_via, projected_taxable, annual_tax FROM hrms_tds_projections WHERE tenant_id=$1 AND fy=$2", [tenantId, fy]),
    q(tenantId, "SELECT employee_id, monthly_rent, is_metro, status, declared, proofs FROM hrms_investment_declarations WHERE tenant_id=$1 AND fy=$2", [tenantId, fy]),
    q(tenantId,
      `SELECT ps.employee_id, COALESCE(SUM((d->>'amount')::numeric),0) AS pt
         FROM hrms_payslips ps
         JOIN hrms_payroll_runs r ON r.id=ps.run_id AND r.tenant_id=ps.tenant_id
         CROSS JOIN LATERAL jsonb_array_elements(ps.deductions) d
        WHERE ps.tenant_id=$1 AND r.run_month = ANY($2::text[])
          AND (d->>'component_name' ILIKE '%professional%' OR d->>'name' ILIKE '%professional%' OR upper(COALESCE(d->>'abbr','')) = 'PT')
        GROUP BY ps.employee_id`, [tenantId, months]),
    q(tenantId, "SELECT standard_deduction, assessment_year, regime FROM hrms_payroll_periods WHERE tenant_id=$1 AND fy=$2", [tenantId, fy]),
  ]);

  const projBy = new Map(projs.rows.map((r) => [r.employee_id, r]));
  const declBy = new Map(decls.rows.map((r) => [r.employee_id, r]));
  const ptBy = new Map(pt.rows.map((r) => [r.employee_id, Number(r.pt) || 0]));
  const period = periods.rows[0] || {};
  const stdDed = R(period.standard_deduction) || 50000;

  let withoutPan = 0;
  const employees = paid.rows.map((r) => {
    const pan = r.pan_enc ? String(fc.decrypt(r.pan_enc)).trim() || null : null;
    if (!pan) withoutPan += 1;
    const p = projBy.get(r.id) || {};
    const d = declBy.get(r.id) || null;
    const grossAnnual = R(p.projected_gross) > 0 ? R(p.projected_gross) : R(r.gross_paid);
    const chapterVia = R(p.chapter_via);
    const taxable = p.projected_taxable != null ? R(p.projected_taxable) : null;
    const employmentTax = R(ptBy.get(r.id));
    // §10 exemptions (HRA/LTA etc) as the residual so the statement reconciles to `taxable`.
    const exemptions10 = taxable != null ? Math.max(0, grossAnnual - stdDed - employmentTax - chapterVia - taxable) : null;
    const chapterViaDetail = d ? (d.status === "VERIFIED" && d.proofs && Object.keys(d.proofs).length ? d.proofs : d.declared) : {};
    const totalTax = p.annual_tax != null ? R(p.annual_tax) : null;
    return {
      pan, name: r.employee_name, regime: p.regime || period.regime || "new",
      gross_salary_17: grossAnnual,               // §17(1) salary
      exemptions_u_s_10: exemptions10,             // HRA/LTA etc (derived residual)
      deductions_u_s_16: { standard_deduction: stdDed, professional_tax: employmentTax },
      income_from_salary: exemptions10 != null ? Math.max(0, grossAnnual - exemptions10 - stdDed - employmentTax) : null,
      chapter_vi_a_total: chapterVia,
      chapter_vi_a_detail: chapterViaDetail,       // {80C, 80D, 80CCD1B, ...}
      total_taxable_income: taxable,
      total_tax: totalTax,                         // tax + rebate 87A + cess, as computed by the engine
      tds_deducted: R(r.tds_deducted),             // actual TDS deducted across the FY
      balance_tax_payable: totalTax != null ? totalTax - R(r.tds_deducted) : null,
      hra: d ? { monthly_rent: R(d.monthly_rent), metro: !!d.is_metro } : null,
    };
  });

  return {
    form: "16", part: "B",
    financial_year: `${y}-${y + 1}`,
    assessment_year: period.assessment_year || `${y + 1}-${y + 2}`,
    employees,
    employee_count: employees.length,
    employees_without_pan: withoutPan,   // run POST /payroll/link-legacy, or add the PAN on the record
    note: "Part B is employer-generated. Download Part A (carrying the TRACES digital signature) from the TRACES portal and attach it. Figures are from the annual TDS true-up; §10 exemptions are derived so the statement reconciles to the computed taxable income — verify against final proofs before issuing.",
  };
}

module.exports = {
  HrError,
  ptAmount, // per-state Professional Tax (exported for tests)
  generateEcr, // EPFO ECR file generation
  generateEsicReturn, // ESIC monthly contribution file
  generateForm24QStatement, // 24Q quarterly deductee TDS statement
  generateForm16B, // Form 16 Part B (employer-generated salary-TDS annexure)
  linkPayrollEmployees, // link hrms_employees ↔ legacy employees (PAN) by email
  // pure logic (exported for asserts/tests)
  evalExpr, evalCondition, evaluateComponents, computeSlip, workingDayDetails,
  pfAmount, esiAmount, ptAmount, leaveDayCount, abbrOf, roundRupee, flt,
  // (3) formula-driven components
  referencedVars, orderComponentsByDependency, evaluateFormulaComponents,
  createSalaryComponent, listSalaryComponents, validateComponentSet,
  // employees
  createEmployee, bulkCreateEmployees, listEmployees, setEmployeeStatus,
  // attendance
  markAttendance, bulkMarkAttendance, attendanceFor, attendanceSummary,
  // leave
  createLeaveType, listLeaveTypes, allocateLeave, leaveBalance, leaveBalances,
  requestLeave, decideLeave, listLeave,
  // structures / assignments / slips
  createStructure, listStructures, assignStructure, listAssignments, previewSlip,
  // payroll (two-stage GL)
  runPayroll, listPayrollRuns, payslipsForRun, payPayrollRun,
  // (1) annualized TDS projection
  payrollYearBounds, ayForFy, fyForMonth, payrollMonthIndex, hraExemption, chapterVIA,
  getOrCreatePayrollPeriod, setPayrollPeriod,
  computeTdsProjection, projectTdsForYear, getTdsProjection, listTdsProjections, monthlyTdsFor,
  // (2) investment declaration + proof lifecycle
  saveDeclaration, advanceDeclaration, getDeclaration, listDeclarations,
  // (4b) gratuity
  gratuityAmount, computeGratuity, listGratuitySlabs, upsertGratuitySlab, yearsBetween,
  // (4c) loans + (4d) full & final
  createLoan, loansFor, leaveEncashmentAmount, fullAndFinal, listFullAndFinal,
};
