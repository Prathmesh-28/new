// §10 — Reporting layer. Everything reads from book_voucher_entries (cancelled
// vouchers excluded) so reports always reconcile to the ledger. Signed balances
// are debit-positive (§10.1): >0 = net debit, <0 = net credit.
const { pool } = require("../../db");
const { money, toRupees, eq } = require("./money");

// Per-ledger closing (opening ± movement) for an FY, optionally as-of a date.
async function _ledgerClosings(tenantId, fy, asOf) {
  const params = [tenantId, fy];
  let dateClause = "";
  if (asOf) { params.push(asOf); dateClause = ` AND v.voucher_date <= $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.opening_balance, l.opening_is_debit, g.nature, g.affects_pl,
            COALESCE(SUM(CASE WHEN v.financial_year=$2 AND v.is_cancelled=false${dateClause} THEN e.debit  ELSE 0 END),0) AS dr,
            COALESCE(SUM(CASE WHEN v.financial_year=$2 AND v.is_cancelled=false${dateClause} THEN e.credit ELSE 0 END),0) AS cr
       FROM book_ledgers l
       JOIN book_account_groups g ON g.id = l.group_id
       LEFT JOIN book_voucher_entries e ON e.ledger_id = l.id AND e.tenant_id = l.tenant_id
       LEFT JOIN book_vouchers v ON v.id = e.voucher_id
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.name, l.opening_balance, l.opening_is_debit, g.nature, g.affects_pl
      ORDER BY g.nature, l.name`,
    params
  );
  return rows.map((r) => {
    const opening = r.opening_is_debit ? money(r.opening_balance) : money(r.opening_balance).neg();
    const signed = opening.plus(money(r.dr)).minus(money(r.cr));
    return { ledgerId: r.id, name: r.name, nature: r.nature, affectsPl: r.affects_pl, dr: money(r.dr), cr: money(r.cr), signed };
  });
}

// §10.3 — Trial Balance. The correctness oracle: total debit MUST equal total credit.
async function trialBalance(tenantId, fy, asOf) {
  const cls = await _ledgerClosings(tenantId, fy, asOf);
  let td = money(0), tc = money(0);
  const ledgers = cls.map((c) => {
    const debit = c.signed.greaterThan(0) ? c.signed : money(0);
    const credit = c.signed.lessThan(0) ? c.signed.neg() : money(0);
    td = td.plus(debit); tc = tc.plus(credit);
    return { ledgerId: c.ledgerId, name: c.name, nature: c.nature, debit: toRupees(debit), credit: toRupees(credit) };
  });
  return { financialYear: fy, asOf: asOf || null, ledgers, totalDebit: toRupees(td), totalCredit: toRupees(tc), balanced: eq(td, tc) };
}

// §10.4 — Profit & Loss (affects_pl ledgers only).
async function profitLoss(tenantId, fy, asOf) {
  const cls = (await _ledgerClosings(tenantId, fy, asOf)).filter((c) => c.affectsPl);
  let income = money(0), expense = money(0);
  const incomeRows = [], expenseRows = [];
  for (const c of cls) {
    if (c.nature === "INCOME") { const amt = c.signed.neg(); income = income.plus(amt); incomeRows.push({ name: c.name, amount: toRupees(amt) }); }
    else if (c.nature === "EXPENSE") { const amt = c.signed; expense = expense.plus(amt); expenseRows.push({ name: c.name, amount: toRupees(amt) }); }
  }
  const net = income.minus(expense);
  return { financialYear: fy, asOf: asOf || null, income: incomeRows, expense: expenseRows, totalIncome: toRupees(income), totalExpense: toRupees(expense), netProfit: toRupees(net) };
}

// §10.5 — Balance Sheet (non-P&L ledgers + net profit into equity).
async function balanceSheet(tenantId, fy, asOf) {
  const all = await _ledgerClosings(tenantId, fy, asOf);
  const bs = all.filter((c) => !c.affectsPl);
  let assets = money(0), liabilities = money(0), equity = money(0);
  const assetRows = [], liabilityRows = [], equityRows = [];
  for (const c of bs) {
    if (c.nature === "ASSET") { assets = assets.plus(c.signed); assetRows.push({ name: c.name, amount: toRupees(c.signed) }); }
    else if (c.nature === "LIABILITY") { const v = c.signed.neg(); liabilities = liabilities.plus(v); liabilityRows.push({ name: c.name, amount: toRupees(v) }); }
    else if (c.nature === "EQUITY") { const v = c.signed.neg(); equity = equity.plus(v); equityRows.push({ name: c.name, amount: toRupees(v) }); }
  }
  // Net profit (current FY) lands in equity.
  const pl = all.filter((c) => c.affectsPl);
  let net = money(0);
  for (const c of pl) net = net.plus(c.nature === "INCOME" ? c.signed.neg() : c.signed.neg());
  // net = -Σ signed(P&L) = income - expense
  equity = equity.plus(net);
  equityRows.push({ name: "Net Profit (current period)", amount: toRupees(net) });
  return {
    financialYear: fy, asOf: asOf || null,
    assets: assetRows, liabilities: liabilityRows, equity: equityRows,
    totalAssets: toRupees(assets), totalLiabilities: toRupees(liabilities), totalEquity: toRupees(equity),
    balanced: eq(assets, liabilities.plus(equity)),
  };
}

// §10.6 — Day Book: vouchers in a date range, newest first, with their lines.
async function dayBook(tenantId, from, to) {
  const { rows: vs } = await pool.query(
    `SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date, v.narration, v.reference, v.is_cancelled
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.voucher_date BETWEEN $2 AND $3
      ORDER BY v.voucher_date DESC, v.created_at DESC LIMIT 1000`,
    [tenantId, from, to]
  );
  const ids = vs.map((v) => v.id);
  let lines = [];
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT e.voucher_id, l.name AS ledger, e.debit, e.credit
         FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id
        WHERE e.voucher_id = ANY($1::uuid[]) ORDER BY e.entry_order`,
      [ids]
    );
    lines = rows;
  }
  return vs.map((v) => ({
    ...v,
    entries: lines.filter((l) => l.voucher_id === v.id).map((l) => ({ ledger: l.ledger, debit: toRupees(l.debit), credit: toRupees(l.credit) })),
  }));
}

// §10.6 — Ledger Statement: all entries hitting one ledger with a running signed balance.
async function ledgerStatement(tenantId, ledgerId, fy) {
  const { rows: lg } = await pool.query("SELECT name, opening_balance, opening_is_debit FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, ledgerId]);
  if (!lg[0]) return null;
  const { rows } = await pool.query(
    `SELECT v.voucher_date, v.voucher_type, v.voucher_number, v.narration, e.debit, e.credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false AND v.financial_year=$3
      WHERE e.tenant_id=$1 AND e.ledger_id=$2
      ORDER BY v.voucher_date, v.voucher_number`,
    [tenantId, ledgerId, fy]
  );
  let running = lg[0].opening_is_debit ? money(lg[0].opening_balance) : money(lg[0].opening_balance).neg();
  const out = rows.map((r) => {
    running = running.plus(money(r.debit)).minus(money(r.credit));
    return { date: r.voucher_date, type: r.voucher_type, number: r.voucher_number, narration: r.narration, debit: toRupees(r.debit), credit: toRupees(r.credit), balance: toRupees(running) };
  });
  return { ledger: lg[0].name, financialYear: fy, openingBalance: toRupees(lg[0].opening_is_debit ? money(lg[0].opening_balance) : money(lg[0].opening_balance).neg()), entries: out, closingBalance: toRupees(running) };
}

// §10 (M6) — Cash Flow Statement (direct, activity-classified). Cash/bank movement
// in the period, each voucher's cash leg attributed to Operating/Investing/Financing
// by its counter legs' groups. Reconciles to the net change in cash.
const INVESTING_GROUPS = new Set(["Fixed Assets", "Investments"]);
const FINANCING_GROUPS = new Set(["Capital Account", "Reserves & Surplus", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Bank OD A/c"]);
function cashFlowActivity(groupName) {
  if (INVESTING_GROUPS.has(groupName)) return "INVESTING";
  if (FINANCING_GROUPS.has(groupName)) return "FINANCING";
  return "OPERATING";
}
const isCashRow = (r) => r.is_bank || r.group_name === "Cash-in-hand";

async function cashFlow(tenantId, from, to) {
  const { rows: vids } = await pool.query(
    `SELECT DISTINCT v.id FROM book_vouchers v
       JOIN book_voucher_entries e ON e.voucher_id=v.id
       JOIN book_ledgers l ON l.id=e.ledger_id
       LEFT JOIN book_account_groups g ON g.id=l.group_id
      WHERE v.tenant_id=$1 AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3 AND (l.is_bank OR g.name='Cash-in-hand')`,
    [tenantId, from, to]
  );
  const buckets = { OPERATING: money(0), INVESTING: money(0), FINANCING: money(0) };
  let net = money(0);
  if (vids.length) {
    const { rows } = await pool.query(
      `SELECT e.voucher_id, e.debit, e.credit, l.is_bank, g.name AS group_name
         FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id LEFT JOIN book_account_groups g ON g.id=l.group_id
        WHERE e.voucher_id = ANY($1::uuid[])`,
      [vids.map((v) => v.id)]
    );
    const byV = new Map();
    for (const r of rows) { const a = byV.get(r.voucher_id) || []; a.push(r); byV.set(r.voucher_id, a); }
    for (const [, ents] of byV) {
      const cashDelta = ents.filter(isCashRow).reduce((s, r) => s.plus(money(r.debit)).minus(money(r.credit)), money(0));
      if (cashDelta.isZero()) continue;
      net = net.plus(cashDelta);
      const counters = ents.filter((r) => !isCashRow(r)).map((r) => ({ activity: cashFlowActivity(r.group_name), weight: money(r.debit).plus(money(r.credit)) }));
      const total = counters.reduce((s, c) => s.plus(c.weight), money(0));
      if (total.isZero()) { buckets.OPERATING = buckets.OPERATING.plus(cashDelta); continue; }
      for (const c of counters) buckets[c.activity] = buckets[c.activity].plus(cashDelta.mul(c.weight).div(total));
    }
  }
  return { from, to, operating: toRupees(buckets.OPERATING), investing: toRupees(buckets.INVESTING), financing: toRupees(buckets.FINANCING), netCashFlow: toRupees(net) };
}

function prevFyOf(fy) { const [a] = String(fy).split("-").map(Number); return `${a - 1}-${String(a % 100).padStart(2, "0")}`; }
async function comparativePL(tenantId, fy) {
  const cur = await profitLoss(tenantId, fy);
  const prevFy = prevFyOf(fy);
  const prev = await profitLoss(tenantId, prevFy);
  return {
    current: { fy, totalIncome: cur.totalIncome, totalExpense: cur.totalExpense, netProfit: cur.netProfit },
    previous: { fy: prevFy, totalIncome: prev.totalIncome, totalExpense: prev.totalExpense, netProfit: prev.netProfit },
  };
}

// Reporting tags / dimensions — net profit grouped by a tag dimension (project/location/class).
async function byTag(tenantId, fy, dimension) {
  const { rows } = await pool.query(
    `SELECT COALESCE(e.tags->>$3,'(untagged)') AS tag,
            COALESCE(SUM(e.debit),0) AS dr, COALESCE(SUM(e.credit),0) AS cr
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
       JOIN book_ledgers l ON l.id=e.ledger_id
       JOIN book_account_groups g ON g.id=l.group_id AND g.affects_pl=true
      WHERE e.tenant_id=$1
      GROUP BY tag`,
    [tenantId, fy, dimension]
  );
  return { financialYear: fy, dimension, rows: rows.map((r) => ({ tag: r.tag, netProfit: toRupees(money(r.dr).minus(money(r.cr)).neg()) })) };
}

// Budgets.
async function createTag(tenantId, dimension, value) {
  const { rows } = await pool.query("INSERT INTO book_tags(tenant_id,dimension,value) VALUES($1,$2,$3) ON CONFLICT(tenant_id,dimension,value) DO NOTHING RETURNING *", [tenantId, dimension, value]);
  return rows[0] || { tenant_id: tenantId, dimension, value };
}
async function createBudget(tenantId, b) {
  const { rows } = await pool.query(
    "INSERT INTO book_budgets(tenant_id,financial_year,ledger_id,period_month,amount) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,financial_year,ledger_id,period_month) DO UPDATE SET amount=EXCLUDED.amount RETURNING *",
    [tenantId, b.financialYear, b.ledgerId, b.periodMonth || 0, toDb(b.amount)]
  );
  return rows[0];
}
async function budgetVsActual(tenantId, fy) {
  const { rows } = await pool.query(
    `SELECT bg.ledger_id, l.name, bg.amount AS budget,
            COALESCE((SELECT SUM(e.debit)-SUM(e.credit) FROM book_voucher_entries e
                        JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
                       WHERE e.ledger_id=bg.ledger_id),0) AS actual_signed
       FROM book_budgets bg JOIN book_ledgers l ON l.id=bg.ledger_id
      WHERE bg.tenant_id=$1 AND bg.financial_year=$2 AND bg.period_month=0 ORDER BY l.name`,
    [tenantId, fy]
  );
  return {
    financialYear: fy,
    rows: rows.map((r) => { const actual = money(r.actual_signed).abs(); const budget = money(r.budget); return { ledger: r.name, budget: toRupees(budget), actual: toRupees(actual), variance: toRupees(budget.minus(actual)) }; }),
  };
}

module.exports = { trialBalance, profitLoss, balanceSheet, dayBook, ledgerStatement, cashFlow, cashFlowActivity, comparativePL, byTag, createTag, createBudget, budgetVsActual };
