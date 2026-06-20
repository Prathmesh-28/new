// §10 — Reporting layer. Everything reads from book_voucher_entries (cancelled
// vouchers excluded) so reports always reconcile to the ledger. Signed balances
// are debit-positive (§10.1): >0 = net debit, <0 = net credit.
const { pool } = require("../../db");
const { money, toRupees, eq, gt } = require("./money");

// Per-ledger closing (opening ± movement) for an FY, optionally as-of a date.
async function _ledgerClosings(tenantId, fy, asOf) {
  const params = [tenantId, fy];
  let dateClause = "";
  if (asOf) { params.push(asOf); dateClause = ` AND v.voucher_date <= $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT l.id, l.name, l.opening_balance, l.opening_is_debit, g.nature, g.affects_pl,
            COALESCE(SUM(CASE WHEN v.financial_year=$2 AND v.is_cancelled=false${dateClause} THEN e.debit  ELSE 0 END),0) AS dr,
            COALESCE(SUM(CASE WHEN v.financial_year=$2 AND v.is_cancelled=false${dateClause} THEN e.credit ELSE 0 END),0) AS cr,
            COALESCE(SUM(CASE WHEN v.financial_year<$2 AND v.is_cancelled=false THEN e.debit  ELSE 0 END),0) AS prior_dr,
            COALESCE(SUM(CASE WHEN v.financial_year<$2 AND v.is_cancelled=false THEN e.credit ELSE 0 END),0) AS prior_cr
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
    const bookOpening = r.opening_is_debit ? money(r.opening_balance) : money(r.opening_balance).neg();
    // Permanent (balance-sheet) ledgers carry their balance across FYs: the opening
    // for the selected FY is the book opening plus the net movement of ALL prior FYs.
    // P&L ledgers reset every FY, so they take the book opening only (no carry-forward).
    const opening = r.affects_pl
      ? bookOpening
      : bookOpening.plus(money(r.prior_dr)).minus(money(r.prior_cr));
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

// §10 (M9) — Receivables / Payables aging. Outstanding per open invoice/bill is the
// gross movement against the PARTY ledger on its own voucher minus allocations booked
// against that voucher (same shape as automation.overdue). We bucket the OUTSTANDING
// (not the gross) by age computed from the due date (voucher_date + credit_period_days)
// vs asOf, then aggregate per party ledger. Direction differs only in which side of the
// party ledger holds the balance: debit for debtors (SALES), credit for creditors (PURCHASE).
const AGING_BUCKETS = () => ({ notDue: money(0), d0_30: money(0), d31_60: money(0), d61_90: money(0), d90plus: money(0) });
function _bucketFor(dueMs, asOfMs) {
  if (asOfMs <= dueMs) return "notDue";
  const days = Math.round((asOfMs - dueMs) / 86400000);
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}
async function _aging(tenantId, asOf, voucherType, groupName, partySide) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const asOfMs = new Date(today).getTime();
  // movementExpr: debit-credit for debtors (debit-positive), credit-debit for creditors.
  const movementExpr = partySide === "debit"
    ? "SUM(e.debit) - SUM(e.credit)"
    : "SUM(e.credit) - SUM(e.debit)";
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_date, v.party_ledger_id AS ledger_id, pl.name AS party_name,
            COALESCE(pl.credit_period_days, 0) AS credit_period_days,
            COALESCE((SELECT ${movementExpr} FROM book_voucher_entries e
                        WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
       JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
       JOIN book_account_groups g ON g.id=pl.group_id
      WHERE v.tenant_id=$1 AND v.voucher_type=$2 AND v.is_cancelled=false
        AND v.voucher_date <= $3 AND v.party_ledger_id IS NOT NULL AND g.name=$4`,
    [tenantId, voucherType, today, groupName]
  );
  const byParty = new Map();
  const totals = AGING_BUCKETS();
  for (const r of rows) {
    const outstanding = money(r.gross).minus(money(r.allocated));
    if (!gt(outstanding, 0)) continue;
    const creditDays = Number(r.credit_period_days) || 0;
    const dueMs = new Date(r.voucher_date).getTime() + creditDays * 86400000;
    const bucket = _bucketFor(dueMs, asOfMs);
    let p = byParty.get(r.ledger_id);
    if (!p) { p = { ledgerId: r.ledger_id, name: r.party_name, ...AGING_BUCKETS() }; byParty.set(r.ledger_id, p); }
    p[bucket] = p[bucket].plus(outstanding);
    totals[bucket] = totals[bucket].plus(outstanding);
  }
  const parties = [...byParty.values()]
    .map((p) => {
      const total = p.notDue.plus(p.d0_30).plus(p.d31_60).plus(p.d61_90).plus(p.d90plus);
      return { ledgerId: p.ledgerId, name: p.name, notDue: toRupees(p.notDue), d0_30: toRupees(p.d0_30), d31_60: toRupees(p.d31_60), d61_90: toRupees(p.d61_90), d90plus: toRupees(p.d90plus), total: toRupees(total) };
    })
    .sort((a, b) => money(b.total).comparedTo(money(a.total)));
  const grand = totals.notDue.plus(totals.d0_30).plus(totals.d31_60).plus(totals.d61_90).plus(totals.d90plus);
  return {
    asOf: today,
    parties,
    totals: { notDue: toRupees(totals.notDue), d0_30: toRupees(totals.d0_30), d31_60: toRupees(totals.d31_60), d61_90: toRupees(totals.d61_90), d90plus: toRupees(totals.d90plus), total: toRupees(grand) },
  };
}
async function arAging(tenantId, asOf) { return _aging(tenantId, asOf, "SALES", "Sundry Debtors", "debit"); }
async function apAging(tenantId, asOf) { return _aging(tenantId, asOf, "PURCHASE", "Sundry Creditors", "credit"); }

// §10 (M9) — Party statement: date-range ledger statement for one party. Opening is the
// signed balance (debit-positive) as of the day before `from`; lines are every voucher
// entry hitting this ledger within from..to with a running balance; closing is the final
// running balance. Modeled on ledgerStatement but bounded by date range, not FY.
async function partyStatement(tenantId, ledgerId, from, to) {
  const { rows: lg } = await pool.query("SELECT id, name, opening_balance, opening_is_debit FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, ledgerId]);
  if (!lg[0]) return null;
  const bookOpening = lg[0].opening_is_debit ? money(lg[0].opening_balance) : money(lg[0].opening_balance).neg();
  // Opening as of `from` = book opening + net movement of everything strictly before `from`.
  const { rows: pre } = await pool.query(
    `SELECT COALESCE(SUM(e.debit),0) AS dr, COALESCE(SUM(e.credit),0) AS cr
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false
      WHERE e.tenant_id=$1 AND e.ledger_id=$2 AND v.voucher_date < $3`,
    [tenantId, ledgerId, from]
  );
  const opening = bookOpening.plus(money(pre[0].dr)).minus(money(pre[0].cr));
  const { rows } = await pool.query(
    `SELECT v.voucher_date, v.voucher_type, v.voucher_number, v.narration, e.debit, e.credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false
      WHERE e.tenant_id=$1 AND e.ledger_id=$2 AND v.voucher_date BETWEEN $3 AND $4
      ORDER BY v.voucher_date, v.voucher_number`,
    [tenantId, ledgerId, from, to]
  );
  let running = opening;
  const lines = rows.map((r) => {
    running = running.plus(money(r.debit)).minus(money(r.credit));
    return { date: r.voucher_date, voucherType: r.voucher_type, number: r.voucher_number, narration: r.narration, debit: toRupees(r.debit), credit: toRupees(r.credit), balance: toRupees(running) };
  });
  return { ledger: { id: lg[0].id, name: lg[0].name }, from, to, opening: toRupees(opening), lines, closing: toRupees(running) };
}

// §10 (M3) — Stock Summary: item-wise stock movement & valuation over [from,to].
// Ported from ERPNext's Stock Balance report logic: per item we compute opening
// (item master opening_qty/value + all movements strictly before `from`), inward /
// outward within the window, and closing = opening + inward − outward. Effective
// movement date is the linked voucher's voucher_date, falling back to the movement's
// own created_at::date for manual (voucher-less) receive/issue. Value follows the same
// signed flow as the running valuation (inward adds value, outward removes it), so
// closingValue reconciles to the item's tracked valuation. A per-warehouse qty sub-list
// is attached from the book_stock_balances snapshot when warehouses are in use.
async function stockSummary(tenantId, fromDate, toDate) {
  // Effective date of each movement: prefer the voucher date, else the movement's own date.
  const effDate = "COALESCE(v.voucher_date, m.created_at::date)";
  const { rows: items } = await pool.query(
    `SELECT i.id, i.name, i.unit, i.opening_qty, i.opening_value,
            i.current_qty, i.current_value, i.valuation_method,
            COALESCE(SUM(CASE WHEN ${effDate} <  $2 THEN m.qty_in  ELSE 0 END),0) AS pre_in_qty,
            COALESCE(SUM(CASE WHEN ${effDate} <  $2 THEN m.qty_out ELSE 0 END),0) AS pre_out_qty,
            COALESCE(SUM(CASE WHEN ${effDate} <  $2 THEN (m.qty_in*m.rate) ELSE 0 END),0) AS pre_in_val,
            COALESCE(SUM(CASE WHEN ${effDate} <  $2 THEN (m.qty_out*m.rate) ELSE 0 END),0) AS pre_out_val,
            COALESCE(SUM(CASE WHEN ${effDate} BETWEEN $2 AND $3 THEN m.qty_in  ELSE 0 END),0) AS in_qty,
            COALESCE(SUM(CASE WHEN ${effDate} BETWEEN $2 AND $3 THEN m.qty_out ELSE 0 END),0) AS out_qty,
            COALESCE(SUM(CASE WHEN ${effDate} BETWEEN $2 AND $3 THEN (m.qty_in*m.rate)  ELSE 0 END),0) AS in_val,
            COALESCE(SUM(CASE WHEN ${effDate} BETWEEN $2 AND $3 THEN (m.qty_out*m.rate) ELSE 0 END),0) AS out_val
       FROM book_stock_items i
       LEFT JOIN book_stock_movements m ON m.item_id=i.id AND m.tenant_id=i.tenant_id
       LEFT JOIN book_vouchers v ON v.id=m.voucher_id AND v.is_cancelled=false
      WHERE i.tenant_id=$1 AND i.is_active=true
      GROUP BY i.id, i.name, i.unit, i.opening_qty, i.opening_value, i.current_qty, i.current_value, i.valuation_method
      ORDER BY i.name`,
    [tenantId, fromDate, toDate]
  );

  // Per-warehouse qty snapshot (current balances; value tracked at item level).
  const { rows: balRows } = await pool.query(
    `SELECT b.item_id, b.warehouse_id, w.name AS warehouse_name, b.qty
       FROM book_stock_balances b
       LEFT JOIN book_warehouses w ON w.id=b.warehouse_id AND w.tenant_id=b.tenant_id
      WHERE b.tenant_id=$1
      ORDER BY w.name`,
    [tenantId]
  );
  const balByItem = new Map();
  for (const b of balRows) {
    const a = balByItem.get(b.item_id) || [];
    a.push({ warehouseId: b.warehouse_id, name: b.warehouse_name || null, qty: toRupees(money(b.qty)) });
    balByItem.set(b.item_id, a);
  }

  const totals = {
    openingQty: money(0), openingValue: money(0),
    inwardQty: money(0), inwardValue: money(0),
    outwardQty: money(0), outwardValue: money(0),
    closingQty: money(0), closingValue: money(0),
    currentValue: money(0),
  };
  const out = items.map((r) => {
    const openingQty = money(r.opening_qty).plus(money(r.pre_in_qty)).minus(money(r.pre_out_qty));
    const openingValue = money(r.opening_value).plus(money(r.pre_in_val)).minus(money(r.pre_out_val));
    const inwardQty = money(r.in_qty), inwardValue = money(r.in_val);
    const outwardQty = money(r.out_qty), outwardValue = money(r.out_val);
    const closingQty = openingQty.plus(inwardQty).minus(outwardQty);
    const closingValue = openingValue.plus(inwardValue).minus(outwardValue);
    totals.openingQty = totals.openingQty.plus(openingQty);
    totals.openingValue = totals.openingValue.plus(openingValue);
    totals.inwardQty = totals.inwardQty.plus(inwardQty);
    totals.inwardValue = totals.inwardValue.plus(inwardValue);
    totals.outwardQty = totals.outwardQty.plus(outwardQty);
    totals.outwardValue = totals.outwardValue.plus(outwardValue);
    totals.closingQty = totals.closingQty.plus(closingQty);
    totals.closingValue = totals.closingValue.plus(closingValue);
    totals.currentValue = totals.currentValue.plus(money(r.current_value));
    return {
      itemId: r.id, name: r.name, unit: r.unit,
      valuationMethod: r.valuation_method,
      openingQty: toRupees(openingQty), openingValue: toRupees(openingValue),
      inwardQty: toRupees(inwardQty), inwardValue: toRupees(inwardValue),
      outwardQty: toRupees(outwardQty), outwardValue: toRupees(outwardValue),
      closingQty: toRupees(closingQty), closingValue: toRupees(closingValue),
      currentValue: toRupees(money(r.current_value)),
      warehouses: balByItem.get(r.id) || [],
    };
  });

  return {
    from: fromDate, to: toDate,
    items: out,
    totals: {
      openingQty: toRupees(totals.openingQty), openingValue: toRupees(totals.openingValue),
      inwardQty: toRupees(totals.inwardQty), inwardValue: toRupees(totals.inwardValue),
      outwardQty: toRupees(totals.outwardQty), outwardValue: toRupees(totals.outwardValue),
      closingQty: toRupees(totals.closingQty), closingValue: toRupees(totals.closingValue),
      currentValue: toRupees(totals.currentValue),
    },
  };
}

module.exports = { trialBalance, profitLoss, balanceSheet, dayBook, ledgerStatement, cashFlow, cashFlowActivity, comparativePL, byTag, createTag, createBudget, budgetVsActual, arAging, apAging, partyStatement, stockSummary };
