// §10 - Reporting layer. Everything reads from book_voucher_entries (cancelled
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

// §10.3 - Trial Balance. The correctness oracle: total debit MUST equal total credit.
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

// §10.4 - Profit & Loss (affects_pl ledgers only).
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

// §10.5 - Balance Sheet (non-P&L ledgers + net profit into equity).
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

// §10.6 - Day Book: vouchers in a date range, newest first, with their lines.
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

// §10.6 - Ledger Statement: all entries hitting one ledger with a running signed balance.
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

// §10 (M6) - Cash Flow Statement (TRUE indirect method). Ported from the logic in
// ERPNext's Cash Flow report and Tryton's account_statement: rather than guessing each
// voucher's activity from hardcoded group names, we reconstruct the statement the way
// an accountant does - start from net profit, reverse non-cash charges, then explain the
// rest of the period's cash movement through the actual MOVEMENT of every balance-sheet
// account between two dates, each account routed to Operating / Investing / Financing by
// its ROOT TYPE + nature (not by a hardcoded leaf-group name, so it survives renames).
//
//   Operating = Net profit
//             + non-cash add-backs (depreciation / amortisation / provision charges)
//             − Δ(operating current assets: debtors, inventory, prepaid, advances, …)
//             + Δ(operating current liabilities: creditors, duties & taxes, provisions, …)
//   Investing = − Δ(non-current assets: fixed assets, CWIP, investments, …)
//   Financing =   Δ(equity) + Δ(borrowings: secured/unsecured loans, bank OD, …)
//
// Working-capital signs come straight from debit-positive movement: an asset whose
// debit balance rose used cash (outflow); a liability whose credit balance rose
// released cash (inflow). The three buckets are constructed to RECONCILE to the actual
// net movement of cash & cash-equivalents in the window; `reconciles`/`unexplained`
// surface any residual (e.g. an opening-balance asymmetry) instead of hiding it.

// Cash-flow activity for a balance-sheet account, decided from its nature and the NAME
// of the PRIMARY (root) group it rolls up to. We classify by root type so a leaf-group
// rename (e.g. "Sundry Debtors" → "Trade Receivables") can't misroute the account: the
// root primary groups are the 15 system groups seeded in §5.1 and are stable. Falls back
// to nature alone if a root is itself renamed, so nothing is silently dropped.
//   FINANCING ← EQUITY of any kind, and "loan/borrowing" liability roots.
//   INVESTING ← "non-current" asset roots (fixed assets, investments, branches, misc).
//   OPERATING ← everything else on the balance sheet (working capital).
const _FINANCING_LIAB_ROOTS = new Set(["Loans (Liability)"]);                 // secured/unsecured/bank-OD live under this
const _INVESTING_ASSET_ROOTS = new Set(["Fixed Assets", "Investments", "Branch / Divisions", "Misc. Expenses (Asset)"]);
function _bsActivity(nature, rootName) {
  if (nature === "EQUITY") return "FINANCING";
  if (nature === "LIABILITY") return _FINANCING_LIAB_ROOTS.has(rootName) ? "FINANCING" : "OPERATING";
  if (nature === "ASSET") return _INVESTING_ASSET_ROOTS.has(rootName) ? "INVESTING" : "OPERATING";
  return "OPERATING";
}

// Legacy name-based classifier kept for callers/selftest that map a single group name to
// an activity. The indirect statement above does NOT depend on this - it uses root type +
// nature - but the mapping is preserved so existing behaviour and tests are unchanged.
const INVESTING_GROUPS = new Set(["Fixed Assets", "Investments"]);
const FINANCING_GROUPS = new Set(["Capital Account", "Reserves & Surplus", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Bank OD A/c"]);
function cashFlowActivity(groupName) {
  if (INVESTING_GROUPS.has(groupName)) return "INVESTING";
  if (FINANCING_GROUPS.has(groupName)) return "FINANCING";
  return "OPERATING";
}

// Per-ledger signed MOVEMENT (Δ debit-positive) over [from,to], with each ledger's
// nature, P&L flag, whether it is cash/cash-equivalent, and the NAME of its primary
// (root) group resolved via a recursive walk up parent_id. One round-trip; cancelled
// vouchers excluded so the result reconciles to the ledger.
async function _ledgerMovements(tenantId, from, to) {
  const { rows } = await pool.query(
    `WITH RECURSIVE roots AS (
        SELECT id, name, parent_id, name AS root_name
          FROM book_account_groups WHERE tenant_id=$1 AND parent_id IS NULL
        UNION ALL
        SELECT g.id, g.name, g.parent_id, r.root_name
          FROM book_account_groups g JOIN roots r ON g.parent_id = r.id
       )
       SELECT l.id, l.name, l.is_bank, g.nature, g.affects_pl,
              r.root_name AS root_name,
              COALESCE(SUM(CASE WHEN v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3 THEN e.debit  ELSE 0 END),0) AS dr,
              COALESCE(SUM(CASE WHEN v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3 THEN e.credit ELSE 0 END),0) AS cr
         FROM book_ledgers l
         JOIN book_account_groups g ON g.id = l.group_id
         JOIN roots r ON r.id = g.id
         LEFT JOIN book_voucher_entries e ON e.ledger_id = l.id AND e.tenant_id = l.tenant_id
         LEFT JOIN book_vouchers v ON v.id = e.voucher_id
        WHERE l.tenant_id = $1
        GROUP BY l.id, l.name, l.is_bank, g.nature, g.affects_pl, r.root_name`,
    [tenantId, from, to]
  );
  return rows.map((r) => ({
    ledgerId: r.id, name: r.name, nature: r.nature, affectsPl: r.affects_pl,
    rootName: r.root_name,
    // Cash & cash-equivalents: any bank ledger, or a ledger rooted in the Cash-in-hand
    // family. Bank OD is intentionally NOT cash here - it's a borrowing (financing).
    isCash: r.is_bank || r.root_name === "Cash-in-hand" || r.name === "Cash-in-hand",
    delta: money(r.dr).minus(money(r.cr)), // debit-positive movement in the window
  }));
}

// Heuristic to recognise non-cash P&L charges to add back (depreciation, amortisation,
// provision/impairment write-offs). Driven by ledger/root NAME keywords - robust to the
// account sitting under any expense group. Only EXPENSE-nature ledgers are considered.
function _isNonCashCharge(name, rootName) {
  const s = `${name} ${rootName}`.toLowerCase();
  return /\b(deprecia|amorti[sz]|impair|provision|written?\s*off|write[-\s]?off|bad\s*debt)\b/.test(s);
}

async function cashFlow(tenantId, from, to) {
  const moves = await _ledgerMovements(tenantId, from, to);

  // (0) Oracle - actual net change in cash & cash-equivalents over the window.
  let netCash = money(0);
  for (const m of moves) if (m.isCash) netCash = netCash.plus(m.delta);

  // (1) Net profit for the period = −Σ signed-movement of P&L ledgers (income is credit,
  // expense is debit; debit-positive movement of P&L nets to −profit).
  let netProfit = money(0);
  let nonCashAddBacks = money(0);
  const nonCashLines = [];
  for (const m of moves) {
    if (!m.affectsPl) continue;
    netProfit = netProfit.minus(m.delta); // credit (income) raises profit, debit (expense) lowers it
    // Non-cash EXPENSE charges (depreciation etc.) are added back to operating cash.
    if (m.nature === "EXPENSE" && !m.delta.isZero() && _isNonCashCharge(m.name, m.rootName)) {
      const charge = m.delta; // expense is debit-positive
      nonCashAddBacks = nonCashAddBacks.plus(charge);
      nonCashLines.push({ name: m.name, amount: toRupees(charge) });
    }
  }

  // (2) Working-capital movements + investing + financing, from the actual MOVEMENT of
  // every non-cash balance-sheet ledger, routed by root type + nature.
  let wcChange = money(0);          // net cash effect of working-capital movements
  let investing = money(0);          // outflow negative
  let financing = money(0);          // inflow positive
  const wcLines = [], investLines = [], financeLines = [];
  for (const m of moves) {
    if (m.affectsPl || m.isCash || m.delta.isZero()) continue;
    const activity = _bsActivity(m.nature, m.rootName);
    if (activity === "INVESTING") {
      // Asset acquired (debit ↑, delta>0) ⇒ cash outflow; disposal ⇒ inflow.
      const cashEffect = m.delta.neg();
      investing = investing.plus(cashEffect);
      investLines.push({ name: m.name, root: m.rootName, amount: toRupees(cashEffect) });
    } else if (activity === "FINANCING") {
      // Equity/borrowing raised (credit ↑, delta<0) ⇒ inflow; repaid/withdrawn ⇒ outflow.
      const cashEffect = m.delta.neg();
      financing = financing.plus(cashEffect);
      financeLines.push({ name: m.name, root: m.rootName, amount: toRupees(cashEffect) });
    } else {
      // Operating working capital. A current asset rising (delta>0) consumes cash; a
      // current liability rising (delta<0) provides cash - both captured by −delta.
      const cashEffect = m.delta.neg();
      wcChange = wcChange.plus(cashEffect);
      wcLines.push({ name: m.name, root: m.rootName, nature: m.nature, amount: toRupees(cashEffect) });
    }
  }

  const operating = netProfit.plus(nonCashAddBacks).plus(wcChange);
  const computed = operating.plus(investing).plus(financing);
  // Residual the three activity buckets fail to explain vs the real cash movement (should
  // be ~0 for a self-balancing ledger; surfaced rather than absorbed silently).
  const unexplained = netCash.minus(computed);

  return {
    from, to,
    operating: toRupees(operating),
    investing: toRupees(investing),
    financing: toRupees(financing),
    netCashFlow: toRupees(netCash),
    // Indirect-method detail so the UI can present the full reconciliation.
    detail: {
      netProfit: toRupees(netProfit),
      nonCashAddBacks: toRupees(nonCashAddBacks),
      nonCashItems: nonCashLines,
      workingCapitalChange: toRupees(wcChange),
      workingCapital: wcLines,
      investingItems: investLines,
      financingItems: financeLines,
    },
    computedCashFlow: toRupees(computed),
    unexplained: toRupees(unexplained),
    reconciles: eq(netCash, computed),
  };
}

// §10.7 - Branch-scoped closings. Same shape as _ledgerClosings but every movement
// is filtered to vouchers whose branch_id matches `branchId` (book_vouchers.branch_id,
// added in schema §M7). Used for per-branch / per-GSTIN P&L and Trial Balance - today
// no other report filters by branch. The prior-FY carry-forward column is also scoped
// to the branch so a branch's permanent ledgers carry only that branch's history.
async function _branchLedgerClosings(tenantId, fy, branchId, asOf) {
  const params = [tenantId, fy, branchId];
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
       LEFT JOIN book_vouchers v ON v.id = e.voucher_id AND v.branch_id = $3
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.name, l.opening_balance, l.opening_is_debit, g.nature, g.affects_pl
      ORDER BY g.nature, l.name`,
    params
  );
  return rows.map((r) => {
    // Per-branch view: opening balances are book-level (not split per branch), so a
    // branch ledger's "opening" is the book opening plus that branch's prior-FY movement.
    const bookOpening = r.opening_is_debit ? money(r.opening_balance) : money(r.opening_balance).neg();
    const opening = r.affects_pl
      ? bookOpening
      : bookOpening.plus(money(r.prior_dr)).minus(money(r.prior_cr));
    const signed = opening.plus(money(r.dr)).minus(money(r.cr));
    return { ledgerId: r.id, name: r.name, nature: r.nature, affectsPl: r.affects_pl, dr: money(r.dr), cr: money(r.cr), signed };
  });
}

// §10.7 - Per-branch Trial Balance. Same return shape as trialBalance, scoped to one
// branch_id (per-GSTIN if branches map to GSTINs). Total debit MUST equal total credit
// for the branch only if the branch's books self-balance; we still report `balanced`.
async function branchTrialBalance(tenantId, fy, branchId, asOf) {
  const cls = await _branchLedgerClosings(tenantId, fy, branchId, asOf);
  let td = money(0), tc = money(0);
  const ledgers = cls
    .filter((c) => !c.dr.isZero() || !c.cr.isZero() || !c.signed.isZero())
    .map((c) => {
      const debit = c.signed.greaterThan(0) ? c.signed : money(0);
      const credit = c.signed.lessThan(0) ? c.signed.neg() : money(0);
      td = td.plus(debit); tc = tc.plus(credit);
      return { ledgerId: c.ledgerId, name: c.name, nature: c.nature, debit: toRupees(debit), credit: toRupees(credit) };
    });
  return { financialYear: fy, branchId, asOf: asOf || null, ledgers, totalDebit: toRupees(td), totalCredit: toRupees(tc), balanced: eq(td, tc) };
}

// §10.7 - Per-branch Profit & Loss. Same return shape as profitLoss, scoped to branch_id.
async function branchPL(tenantId, fy, branchId, asOf) {
  const cls = (await _branchLedgerClosings(tenantId, fy, branchId, asOf)).filter((c) => c.affectsPl);
  let income = money(0), expense = money(0);
  const incomeRows = [], expenseRows = [];
  for (const c of cls) {
    if (c.nature === "INCOME") { const amt = c.signed.neg(); if (amt.isZero()) continue; income = income.plus(amt); incomeRows.push({ name: c.name, amount: toRupees(amt) }); }
    else if (c.nature === "EXPENSE") { const amt = c.signed; if (amt.isZero()) continue; expense = expense.plus(amt); expenseRows.push({ name: c.name, amount: toRupees(amt) }); }
  }
  const net = income.minus(expense);
  return { financialYear: fy, branchId, asOf: asOf || null, income: incomeRows, expense: expenseRows, totalIncome: toRupees(income), totalExpense: toRupees(expense), netProfit: toRupees(net) };
}

// §10.8 - Companies Act, 2013 Schedule III financial statements. Ported from ERPNext's
// Schedule-III layout: the Balance Sheet is presented as Equity & Liabilities
// (Shareholders' funds, Non-current liabilities, Current liabilities) and Assets
// (Non-current assets, Current assets), and the Statement of Profit & Loss as
// Revenue from operations, Other income, and Expenses. Mapping is driven by the
// account-group name/nature/hierarchy seeded in §5.1. A prior-year comparative column
// is produced by re-running the closings for the previous FY, reusing the same prior-FY
// carry-forward logic already in _ledgerClosings (permanent ledgers carry forward; P&L
// resets). Returns { balanceSheet, statementOfPL, priorYear } with rupee strings.

// Schedule III heads, keyed by the seeded group name. A ledger is classified by walking
// its group up to a head we recognise; unmatched balance-sheet groups fall to a sensible
// default by nature so nothing is silently dropped.
const SCH3_BS_HEAD = {
  // Equity & Liabilities - Shareholders' funds
  "Capital Account": ["equityAndLiabilities", "shareholdersFunds"],
  "Reserves & Surplus": ["equityAndLiabilities", "shareholdersFunds"],
  // Non-current liabilities
  "Loans (Liability)": ["equityAndLiabilities", "nonCurrentLiabilities"],
  "Secured Loans": ["equityAndLiabilities", "nonCurrentLiabilities"],
  "Unsecured Loans": ["equityAndLiabilities", "nonCurrentLiabilities"],
  // Current liabilities
  "Current Liabilities": ["equityAndLiabilities", "currentLiabilities"],
  "Sundry Creditors": ["equityAndLiabilities", "currentLiabilities"],
  "Duties & Taxes": ["equityAndLiabilities", "currentLiabilities"],
  "Provisions": ["equityAndLiabilities", "currentLiabilities"],
  "Bank OD A/c": ["equityAndLiabilities", "currentLiabilities"],
  "Suspense Account": ["equityAndLiabilities", "currentLiabilities"],
  // Assets - Non-current
  "Fixed Assets": ["assets", "nonCurrentAssets"],
  "Investments": ["assets", "nonCurrentAssets"],
  "Misc. Expenses (Asset)": ["assets", "nonCurrentAssets"],
  "Branch / Divisions": ["assets", "nonCurrentAssets"],
  // Assets - Current
  "Current Assets": ["assets", "currentAssets"],
  "Bank Accounts": ["assets", "currentAssets"],
  "Cash-in-hand": ["assets", "currentAssets"],
  "Deposits (Asset)": ["assets", "currentAssets"],
  "Loans & Advances (Asset)": ["assets", "currentAssets"],
  "Stock-in-hand": ["assets", "currentAssets"],
  "Sundry Debtors": ["assets", "currentAssets"],
};
function _sch3BsHead(groupName, nature) {
  if (SCH3_BS_HEAD[groupName]) return SCH3_BS_HEAD[groupName];
  if (nature === "ASSET") return ["assets", "currentAssets"];
  if (nature === "EQUITY") return ["equityAndLiabilities", "shareholdersFunds"];
  return ["equityAndLiabilities", "currentLiabilities"]; // LIABILITY default
}
// P&L heads. Revenue from operations = Sales + Direct Incomes; Other income = Indirect
// Incomes; everything on the EXPENSE side is an expense line.
function _sch3PlHead(groupName, nature) {
  if (nature === "INCOME") {
    return (groupName === "Sales Accounts" || groupName === "Direct Incomes")
      ? "revenueFromOperations" : "otherIncome";
  }
  return "expenses";
}

// Build one period's Schedule III balances. Returns the grouped maps + the period's
// net profit (income − expense) so the caller can land it in Reserves & Surplus and
// surface the comparative column.
async function _scheduleIIIPeriod(tenantId, fy, asOf) {
  // Group name per ledger (closings only carry nature); fetch the name→group map once.
  const { rows: gmap } = await pool.query(
    `SELECT l.id AS ledger_id, g.name AS group_name
       FROM book_ledgers l JOIN book_account_groups g ON g.id = l.group_id
      WHERE l.tenant_id = $1`,
    [tenantId]
  );
  const groupByLedger = new Map(gmap.map((r) => [r.ledger_id, r.group_name]));
  const cls = await _ledgerClosings(tenantId, fy, asOf);

  const bs = {
    equityAndLiabilities: { shareholdersFunds: [], nonCurrentLiabilities: [], currentLiabilities: [] },
    assets: { nonCurrentAssets: [], currentAssets: [] },
  };
  const pl = { revenueFromOperations: [], otherIncome: [], expenses: [] };
  let income = money(0), expense = money(0);

  for (const c of cls) {
    const groupName = groupByLedger.get(c.ledgerId) || "";
    if (c.affectsPl) {
      const head = _sch3PlHead(groupName, c.nature);
      // INCOME naturally credit (signed<0) → positive amount = signed.neg();
      // EXPENSE naturally debit (signed>0) → positive amount = signed.
      const amt = c.nature === "INCOME" ? c.signed.neg() : c.signed;
      if (amt.isZero()) continue;
      if (c.nature === "INCOME") income = income.plus(amt); else expense = expense.plus(amt);
      pl[head].push({ name: c.name, group: groupName, amount: amt });
    } else {
      const [section, head] = _sch3BsHead(groupName, c.nature);
      // Liabilities & equity are naturally credit → present as positive (signed.neg());
      // assets are naturally debit → present signed as-is.
      const amt = c.nature === "ASSET" ? c.signed : c.signed.neg();
      if (amt.isZero()) continue;
      bs[section][head].push({ name: c.name, group: groupName, amount: amt });
    }
  }
  const netProfit = income.minus(expense);
  return { bs, pl, income, expense, netProfit };
}

function _sch3SumRows(rows) { return rows.reduce((s, r) => s.plus(r.amount), money(0)); }
function _sch3Rupees(rows) { return rows.map((r) => ({ name: r.name, group: r.group, amount: toRupees(r.amount) })); }

async function scheduleIII(tenantId, fy, asOf) {
  const cur = await _scheduleIIIPeriod(tenantId, fy, asOf);
  const prevFy = prevFyOf(fy);
  // Comparative column: prior FY closing (no asOf - full prior year). Reuses the same
  // carry-forward already in _ledgerClosings via _scheduleIIIPeriod.
  const prev = await _scheduleIIIPeriod(tenantId, prevFy).catch(() => null);

  // Net profit for the period lands in Reserves & Surplus (Shareholders' funds).
  cur.bs.equityAndLiabilities.shareholdersFunds.push({ name: "Profit & Loss A/c (current period)", group: "Reserves & Surplus", amount: cur.netProfit });
  if (prev) prev.bs.equityAndLiabilities.shareholdersFunds.push({ name: "Profit & Loss A/c (current period)", group: "Reserves & Surplus", amount: prev.netProfit });

  const bsSection = (sec) => {
    const heads = sec === "equityAndLiabilities"
      ? ["shareholdersFunds", "nonCurrentLiabilities", "currentLiabilities"]
      : ["nonCurrentAssets", "currentAssets"];
    const out = {};
    let total = money(0);
    for (const h of heads) {
      const rows = cur.bs[sec][h];
      const subtotal = _sch3SumRows(rows);
      total = total.plus(subtotal);
      out[h] = { lines: _sch3Rupees(rows), subtotal: toRupees(subtotal) };
    }
    return { ...out, total: toRupees(total), _totalDec: total };
  };
  const eAndL = bsSection("equityAndLiabilities");
  const assetsSec = bsSection("assets");
  const balanceSheet = {
    financialYear: fy, asOf: asOf || null,
    equityAndLiabilities: { shareholdersFunds: eAndL.shareholdersFunds, nonCurrentLiabilities: eAndL.nonCurrentLiabilities, currentLiabilities: eAndL.currentLiabilities, total: eAndL.total },
    assets: { nonCurrentAssets: assetsSec.nonCurrentAssets, currentAssets: assetsSec.currentAssets, total: assetsSec.total },
    balanced: eq(eAndL._totalDec, assetsSec._totalDec),
  };

  const revOps = _sch3SumRows(cur.pl.revenueFromOperations);
  const othInc = _sch3SumRows(cur.pl.otherIncome);
  const totalRevenue = revOps.plus(othInc);
  const totalExpenses = _sch3SumRows(cur.pl.expenses);
  const profitBeforeTax = totalRevenue.minus(totalExpenses);
  const statementOfPL = {
    financialYear: fy, asOf: asOf || null,
    revenueFromOperations: { lines: _sch3Rupees(cur.pl.revenueFromOperations), subtotal: toRupees(revOps) },
    otherIncome: { lines: _sch3Rupees(cur.pl.otherIncome), subtotal: toRupees(othInc) },
    totalRevenue: toRupees(totalRevenue),
    expenses: { lines: _sch3Rupees(cur.pl.expenses), subtotal: toRupees(totalExpenses) },
    totalExpenses: toRupees(totalExpenses),
    profitBeforeTax: toRupees(profitBeforeTax),
  };

  // Prior-year comparative (flat totals; full statement rerun is available via scheduleIII(prevFy)).
  let priorYear = { financialYear: prevFy, available: false };
  if (prev) {
    const pEL = ["shareholdersFunds", "nonCurrentLiabilities", "currentLiabilities"].reduce((s, h) => s.plus(_sch3SumRows(prev.bs.equityAndLiabilities[h])), money(0));
    const pAS = ["nonCurrentAssets", "currentAssets"].reduce((s, h) => s.plus(_sch3SumRows(prev.bs.assets[h])), money(0));
    const pRevOps = _sch3SumRows(prev.pl.revenueFromOperations);
    const pOth = _sch3SumRows(prev.pl.otherIncome);
    const pExp = _sch3SumRows(prev.pl.expenses);
    priorYear = {
      financialYear: prevFy, available: true,
      balanceSheet: {
        equityAndLiabilities: { shareholdersFunds: _sch3Rupees(prev.bs.equityAndLiabilities.shareholdersFunds), nonCurrentLiabilities: _sch3Rupees(prev.bs.equityAndLiabilities.nonCurrentLiabilities), currentLiabilities: _sch3Rupees(prev.bs.equityAndLiabilities.currentLiabilities), total: toRupees(pEL) },
        assets: { nonCurrentAssets: _sch3Rupees(prev.bs.assets.nonCurrentAssets), currentAssets: _sch3Rupees(prev.bs.assets.currentAssets), total: toRupees(pAS) },
      },
      statementOfPL: {
        revenueFromOperations: toRupees(pRevOps), otherIncome: toRupees(pOth),
        totalRevenue: toRupees(pRevOps.plus(pOth)), totalExpenses: toRupees(pExp),
        profitBeforeTax: toRupees(pRevOps.plus(pOth).minus(pExp)),
      },
    };
  }

  return { balanceSheet, statementOfPL, priorYear };
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

// Reporting tags / dimensions - net profit grouped by a tag dimension (project/location/class).
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

// §10 (M9) - Receivables / Payables aging. Outstanding per open invoice/bill is the
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

// §10 (M9) - Party statement: date-range ledger statement for one party. Opening is the
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

// §10 (M3) - Stock Summary: item-wise stock movement & valuation over [from,to].
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

// §10 (M11) - Profitability analytics. Three complementary cuts of gross margin:
// by customer (party), by stock item, and by project. All read the same posted
// ledger/stock data the rest of the reporting layer uses (cancelled vouchers
// excluded) so the numbers reconcile to the P&L. Every cut is tolerant of a
// missing dimension: parties with no COGS still show revenue; items with no sale
// value still show cost; projects with no timesheets/vouchers still appear.

// (1) Per-customer gross margin. Revenue is the credit booked to INCOME ledgers on
// that party's SALES vouchers; direct cost is the outward stock-movement value
// (COGS) on those same SALES vouchers (set when the sale moved inventory). Gross
// margin = revenue − cost; margin% = gross / revenue. Parties are ranked by gross
// margin (desc). Sales with no inventory line simply carry zero derivable cost.
async function profitabilityByParty(tenantId, fy) {
  // Revenue per party = Σ(credit − debit) on INCOME ledgers across the party's SALES vouchers.
  const { rows: rev } = await pool.query(
    `SELECT v.party_ledger_id AS ledger_id, pl.name AS party_name,
            COALESCE(SUM(e.credit - e.debit),0) AS revenue
       FROM book_vouchers v
       JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
       JOIN book_voucher_entries e ON e.voucher_id=v.id
       JOIN book_ledgers l ON l.id=e.ledger_id
       JOIN book_account_groups g ON g.id=l.group_id AND g.nature='INCOME'
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false
        AND v.financial_year=$2 AND v.party_ledger_id IS NOT NULL
      GROUP BY v.party_ledger_id, pl.name`,
    [tenantId, fy]
  );
  // Cost per party = Σ outward stock-movement value on that party's SALES vouchers.
  const { rows: cost } = await pool.query(
    `SELECT v.party_ledger_id AS ledger_id,
            COALESCE(SUM(m.value),0) AS cost
       FROM book_vouchers v
       JOIN book_stock_movements m ON m.voucher_id=v.id AND m.tenant_id=v.tenant_id
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false
        AND v.financial_year=$2 AND v.party_ledger_id IS NOT NULL AND m.qty_out > 0
      GROUP BY v.party_ledger_id`,
    [tenantId, fy]
  );
  const costByParty = new Map(cost.map((r) => [r.ledger_id, money(r.cost)]));
  let tRev = money(0), tCost = money(0), tGm = money(0);
  const rows = rev.map((r) => {
    const revenue = money(r.revenue);
    const c = costByParty.get(r.ledger_id) || money(0);
    const gross = revenue.minus(c);
    tRev = tRev.plus(revenue); tCost = tCost.plus(c); tGm = tGm.plus(gross);
    const marginPct = revenue.isZero() ? "0.00" : gross.div(revenue).mul(100).toFixed(2);
    return { ledgerId: r.ledger_id, party: r.party_name, revenue: toRupees(revenue), cost: toRupees(c), grossMargin: toRupees(gross), marginPct, costDerivable: costByParty.has(r.ledger_id) };
  }).sort((a, b) => money(b.grossMargin).comparedTo(money(a.grossMargin)));
  return {
    financialYear: fy, rows,
    totals: { revenue: toRupees(tRev), cost: toRupees(tCost), grossMargin: toRupees(tGm), marginPct: tRev.isZero() ? "0.00" : tGm.div(tRev).mul(100).toFixed(2) },
  };
}

// (2) Per-item gross margin. Qty sold + cost come from outward stock movements on
// non-cancelled vouchers in the FY (movement.value = COGS at sale time). Sales
// value is recovered, where derivable, from the line items of documents converted
// into those vouchers (book_documents.lines: per-line qty × rate − discount,
// matched by itemId). Items that sold but have no convertible document line keep
// salesValue = 0 (not derivable) while still reporting qty + cost; gross profit is
// then negative-of-cost - flagged via salesDerivable so callers can present it
// honestly. Ranked by gross profit (desc).
async function profitabilityByItem(tenantId, fy) {
  const effDate = "COALESCE(v.voucher_date, m.created_at::date)";
  const { rows: mv } = await pool.query(
    `SELECT i.id AS item_id, i.name, i.unit,
            COALESCE(SUM(m.qty_out),0) AS qty_sold,
            COALESCE(SUM(m.value),0)   AS cost
       FROM book_stock_items i
       JOIN book_stock_movements m ON m.item_id=i.id AND m.tenant_id=i.tenant_id AND m.qty_out > 0
       JOIN book_vouchers v ON v.id=m.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
      WHERE i.tenant_id=$1
      GROUP BY i.id, i.name, i.unit`,
    [tenantId, fy]
  );
  // Sales value per item from documents converted into FY SALES vouchers.
  const { rows: docs } = await pool.query(
    `SELECT d.lines
       FROM book_documents d
       JOIN book_vouchers v ON v.id=d.converted_voucher_id AND v.tenant_id=d.tenant_id
        AND v.voucher_type='SALES' AND v.is_cancelled=false AND v.financial_year=$2
      WHERE d.tenant_id=$1 AND d.lines IS NOT NULL`,
    [tenantId, fy]
  );
  const saleByItem = new Map();
  for (const d of docs) {
    const lines = Array.isArray(d.lines) ? d.lines : [];
    for (const ln of lines) {
      const itemId = ln.itemId || ln.item_id;
      if (!itemId) continue;
      const qty = money(ln.qty == null ? 1 : ln.qty);
      const rate = money(ln.rate == null ? 0 : ln.rate);
      const discount = money(ln.discount == null ? 0 : ln.discount);
      const net = qty.mul(rate).minus(discount);
      saleByItem.set(itemId, (saleByItem.get(itemId) || money(0)).plus(net));
    }
  }
  let tSale = money(0), tCost = money(0), tGp = money(0);
  const rows = mv.map((r) => {
    const qty = money(r.qty_sold);
    const cost = money(r.cost);
    const derivable = saleByItem.has(r.item_id);
    const salesValue = saleByItem.get(r.item_id) || money(0);
    const gross = salesValue.minus(cost);
    tSale = tSale.plus(salesValue); tCost = tCost.plus(cost); tGp = tGp.plus(gross);
    const marginPct = salesValue.isZero() ? "0.00" : gross.div(salesValue).mul(100).toFixed(2);
    return { itemId: r.item_id, name: r.name, unit: r.unit, qtySold: toRupees(qty), salesValue: toRupees(salesValue), cost: toRupees(cost), grossProfit: toRupees(gross), marginPct, salesDerivable: derivable };
  }).sort((a, b) => money(b.grossProfit).comparedTo(money(a.grossProfit)));
  return {
    financialYear: fy, rows,
    totals: { salesValue: toRupees(tSale), cost: toRupees(tCost), grossProfit: toRupees(tGp), marginPct: tSale.isZero() ? "0.00" : tGp.div(tSale).mul(100).toFixed(2) },
  };
}

// (3) Per-project profitability. Revenue is the SALES booked to the project's
// customer ledger (book_projects.customer_ledger_id) in the FY, plus any vouchers
// tagged to the project (book_voucher_entries.tags->>'project' = project id/name,
// INCOME legs). Cost is the value of billable timesheets (Σ hours × rate) plus the
// expense legs of project-tagged vouchers. Projects with neither timesheets nor
// tagged/customer vouchers still appear with zeros. Margin% = gross / revenue.
async function profitabilityByProject(tenantId, fy) {
  const { rows: projects } = await pool.query(
    "SELECT id, name, customer_ledger_id, status FROM book_projects WHERE tenant_id=$1 ORDER BY name",
    [tenantId]
  );
  // Billable timesheet cost per project (FY-scoped by work_date's financial year is
  // approximated by the FY's Apr-Mar window via the fy module's convention; we filter
  // in JS using the project's rows fetched once).
  const { rows: ts } = await pool.query(
    `SELECT project_id, COALESCE(SUM(hours*rate),0) AS cost
       FROM book_timesheets
      WHERE tenant_id=$1 AND billable=true
      GROUP BY project_id`,
    [tenantId]
  );
  const tsByProject = new Map(ts.map((r) => [r.project_id, money(r.cost)]));
  // Customer-ledger revenue per project (SALES income legs on the customer's vouchers).
  const { rows: custRev } = await pool.query(
    `SELECT v.party_ledger_id AS ledger_id,
            COALESCE(SUM(e.credit - e.debit),0) AS revenue
       FROM book_vouchers v
       JOIN book_voucher_entries e ON e.voucher_id=v.id
       JOIN book_ledgers l ON l.id=e.ledger_id
       JOIN book_account_groups g ON g.id=l.group_id AND g.nature='INCOME'
      WHERE v.tenant_id=$1 AND v.voucher_type='SALES' AND v.is_cancelled=false
        AND v.financial_year=$2 AND v.party_ledger_id IS NOT NULL
      GROUP BY v.party_ledger_id`,
    [tenantId, fy]
  );
  const revByLedger = new Map(custRev.map((r) => [r.ledger_id, money(r.revenue)]));
  // Tagged-voucher revenue/expense per project tag (tags->>'project').
  const { rows: tagged } = await pool.query(
    `SELECT e.tags->>'project' AS proj, g.nature,
            COALESCE(SUM(e.credit),0) AS cr, COALESCE(SUM(e.debit),0) AS dr
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
       JOIN book_ledgers l ON l.id=e.ledger_id
       JOIN book_account_groups g ON g.id=l.group_id AND g.affects_pl=true
      WHERE e.tenant_id=$1 AND e.tags ? 'project' AND e.tags->>'project' IS NOT NULL
      GROUP BY e.tags->>'project', g.nature`,
    [tenantId, fy]
  );
  // Index tagged income/expense by the project key (matches project id OR name).
  const tagRev = new Map(), tagCost = new Map();
  for (const r of tagged) {
    if (!r.proj) continue;
    if (r.nature === "INCOME") tagRev.set(r.proj, (tagRev.get(r.proj) || money(0)).plus(money(r.cr).minus(money(r.dr))));
    else if (r.nature === "EXPENSE") tagCost.set(r.proj, (tagCost.get(r.proj) || money(0)).plus(money(r.dr).minus(money(r.cr))));
  }
  const tagKeyRev = (p) => (tagRev.get(p.id) || money(0)).plus(tagRev.get(p.name) || money(0));
  const tagKeyCost = (p) => (tagCost.get(p.id) || money(0)).plus(tagCost.get(p.name) || money(0));

  let tRev = money(0), tCost = money(0), tGm = money(0);
  const rows = projects.map((p) => {
    const custRevenue = p.customer_ledger_id ? (revByLedger.get(p.customer_ledger_id) || money(0)) : money(0);
    const revenue = custRevenue.plus(tagKeyRev(p));
    const tsCost = tsByProject.get(p.id) || money(0);
    const cost = tsCost.plus(tagKeyCost(p));
    const gross = revenue.minus(cost);
    tRev = tRev.plus(revenue); tCost = tCost.plus(cost); tGm = tGm.plus(gross);
    const marginPct = revenue.isZero() ? "0.00" : gross.div(revenue).mul(100).toFixed(2);
    return { projectId: p.id, name: p.name, status: p.status, revenue: toRupees(revenue), cost: toRupees(cost), grossMargin: toRupees(gross), marginPct };
  }).sort((a, b) => money(b.grossMargin).comparedTo(money(a.grossMargin)));
  return {
    financialYear: fy, rows,
    totals: { revenue: toRupees(tRev), cost: toRupees(tCost), grossMargin: toRupees(tGm), marginPct: tRev.isZero() ? "0.00" : tGm.div(tRev).mul(100).toFixed(2) },
  };
}

// (4) Tally-compatible XML export. Produces a Tally import ENVELOPE containing
// LEDGER masters (every ledger with its parent group + opening balance) and VOUCHER
// entries (each non-cancelled FY voucher as a Day Book ALLLEDGERENTRIES.LIST). This
// targets Tally's "Import Data" schema (Masters + Day Book / Vouchers) on a
// best-effort basis: amounts use Tally's sign convention (debit positive, credit
// negative) and ALLLEDGERENTRIES carry ISDEEMEDPOSITIVE. Returned as a string.
function _xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const TALLY_VTYPE = {
  SALES: "Sales", PURCHASE: "Purchase", PAYMENT: "Payment", RECEIPT: "Receipt",
  CONTRA: "Contra", JOURNAL: "Journal", DEBIT_NOTE: "Debit Note", CREDIT_NOTE: "Credit Note",
};
function _tallyDate(d) {
  // Tally expects YYYYMMDD.
  if (!d) return "";
  const s = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return s.replace(/-/g, "");
}
async function tallyXml(tenantId, fy) {
  // Ledger masters with parent group name + opening (Tally OPENINGBALANCE: debit +, credit −).
  const { rows: ledgers } = await pool.query(
    `SELECT l.name, l.opening_balance, l.opening_is_debit, g.name AS parent
       FROM book_ledgers l JOIN book_account_groups g ON g.id=l.group_id
      WHERE l.tenant_id=$1 ORDER BY l.name`,
    [tenantId]
  );
  // Account groups as masters too (so ledgers' parents resolve on import).
  const { rows: groups } = await pool.query(
    `SELECT g.name, pg.name AS parent
       FROM book_account_groups g LEFT JOIN book_account_groups pg ON pg.id=g.parent_id
      WHERE g.tenant_id=$1 ORDER BY g.name`,
    [tenantId]
  );
  // Vouchers for the FY (non-cancelled) with their ledger lines.
  const { rows: vs } = await pool.query(
    `SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date, v.narration, v.reference
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.financial_year=$2 AND v.is_cancelled=false
      ORDER BY v.voucher_date, v.voucher_number`,
    [tenantId, fy]
  );
  const ids = vs.map((v) => v.id);
  let lineRows = [];
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT e.voucher_id, l.name AS ledger, e.debit, e.credit
         FROM book_voucher_entries e JOIN book_ledgers l ON l.id=e.ledger_id
        WHERE e.voucher_id = ANY($1::uuid[]) ORDER BY e.entry_order`,
      [ids]
    );
    lineRows = rows;
  }
  const linesByV = new Map();
  for (const r of lineRows) { const a = linesByV.get(r.voucher_id) || []; a.push(r); linesByV.set(r.voucher_id, a); }

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push("<ENVELOPE>");
  parts.push("<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>");
  parts.push("<BODY><IMPORTDATA>");
  parts.push("<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>");
  parts.push("<REQUESTDATA>");

  // Group masters.
  for (const g of groups) {
    parts.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="${_xmlEsc(g.name)}" ACTION="Create">`);
    if (g.parent) parts.push(`<PARENT>${_xmlEsc(g.parent)}</PARENT>`);
    parts.push(`<NAME.LIST><NAME>${_xmlEsc(g.name)}</NAME></NAME.LIST>`);
    parts.push("</GROUP></TALLYMESSAGE>");
  }
  // Ledger masters.
  for (const l of ledgers) {
    const ob = money(l.opening_balance);
    const obSigned = l.opening_is_debit ? ob : ob.neg();
    parts.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${_xmlEsc(l.name)}" ACTION="Create">`);
    parts.push(`<NAME.LIST><NAME>${_xmlEsc(l.name)}</NAME></NAME.LIST>`);
    parts.push(`<PARENT>${_xmlEsc(l.parent)}</PARENT>`);
    if (!ob.isZero()) parts.push(`<OPENINGBALANCE>${obSigned.toFixed(2)}</OPENINGBALANCE>`);
    parts.push("</LEDGER></TALLYMESSAGE>");
  }
  // Voucher entries (Day Book).
  for (const v of vs) {
    const vtype = TALLY_VTYPE[v.voucher_type] || v.voucher_type;
    const date = _tallyDate(v.voucher_date);
    parts.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${_xmlEsc(vtype)}" ACTION="Create">`);
    parts.push(`<DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE>`);
    parts.push(`<VOUCHERTYPENAME>${_xmlEsc(vtype)}</VOUCHERTYPENAME>`);
    parts.push(`<VOUCHERNUMBER>${_xmlEsc(v.voucher_number)}</VOUCHERNUMBER>`);
    if (v.reference) parts.push(`<REFERENCE>${_xmlEsc(v.reference)}</REFERENCE>`);
    if (v.narration) parts.push(`<NARRATION>${_xmlEsc(v.narration)}</NARRATION>`);
    for (const ln of (linesByV.get(v.id) || [])) {
      const dr = money(ln.debit), cr = money(ln.credit);
      const isDebit = dr.greaterThan(0);
      // Tally amount sign: debit negative, credit positive in ALLLEDGERENTRIES; ISDEEMEDPOSITIVE=Yes for debit.
      const amount = isDebit ? dr.neg() : cr;
      parts.push("<ALLLEDGERENTRIES.LIST>");
      parts.push(`<LEDGERNAME>${_xmlEsc(ln.ledger)}</LEDGERNAME>`);
      parts.push(`<ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`);
      parts.push(`<AMOUNT>${amount.toFixed(2)}</AMOUNT>`);
      parts.push("</ALLLEDGERENTRIES.LIST>");
    }
    parts.push("</VOUCHER></TALLYMESSAGE>");
  }

  parts.push("</REQUESTDATA>");
  parts.push("</IMPORTDATA></BODY>");
  parts.push("</ENVELOPE>");
  return parts.join("\n");
}

// §10.x - Owner's capital & net-worth (roadmap #185 drawings-vs-capital, #188 net-worth).
// Business net worth = equity (assets − liabilities) from the balance sheet; capital-account
// movements (fresh capital introduced = credits to equity ledgers; drawings = debits) for the FY;
// and the key proprietor signal — are drawings outstripping profit (eroding capital)?
async function ownerCapital(tenantId, fy, asOf) {
  const [bs, pl] = await Promise.all([balanceSheet(tenantId, fy, asOf), profitLoss(tenantId, fy, asOf)]);
  const y = parseInt(String(fy).slice(0, 4), 10);
  const from = `${y}-04-01`, to = asOf || `${y + 1}-03-31`;
  const { rows } = await pool.query(
    `SELECT l.name,
            COALESCE(SUM(e.debit)  FILTER (WHERE v.id IS NOT NULL), 0) AS dr,
            COALESCE(SUM(e.credit) FILTER (WHERE v.id IS NOT NULL), 0) AS cr
       FROM book_ledgers l
       JOIN book_account_groups g ON g.id = l.group_id AND g.nature = 'EQUITY'
       LEFT JOIN book_voucher_entries e ON e.ledger_id = l.id AND e.tenant_id = l.tenant_id
       LEFT JOIN book_vouchers v ON v.id = e.voucher_id AND v.is_cancelled = false AND v.voucher_date BETWEEN $2 AND $3
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.name ORDER BY l.name`, [tenantId, from, to]);
  let introduced = money(0), drawings = money(0);
  const accounts = rows.map((r) => {
    introduced = introduced.plus(money(r.cr)); drawings = drawings.plus(money(r.dr));
    return { name: r.name, introduced: toRupees(r.cr), drawings: toRupees(r.dr) };
  });
  const netProfit = money(pl.netProfit);
  const drawingsExceedProfit = gt(drawings, netProfit) && gt(drawings, 0);
  return {
    financialYear: fy,
    net_worth: bs.totalEquity,                 // owner's funds in the business (equity)
    total_assets: bs.totalAssets, total_liabilities: bs.totalLiabilities,
    net_profit: pl.netProfit,
    capital_introduced: toRupees(introduced),
    drawings: toRupees(drawings),
    capital_accounts: accounts,
    drawings_exceed_profit: drawingsExceedProfit,
    health: drawingsExceedProfit
      ? "Drawings exceed profit for the period — you are drawing down capital. Consider trimming withdrawals or booking them as a loan."
      : gt(drawings, 0) ? "Drawings are within profit — capital is intact." : "No drawings recorded this period.",
    note: "Net worth is the BUSINESS equity (assets − liabilities). Personal assets/liabilities are outside the books; add them separately for a combined owner net worth.",
  };
}

module.exports = { trialBalance, profitLoss, balanceSheet, dayBook, ledgerStatement, cashFlow, cashFlowActivity, comparativePL, byTag, createTag, createBudget, budgetVsActual, arAging, apAging, partyStatement, stockSummary, scheduleIII, branchTrialBalance, branchPL, profitabilityByParty, profitabilityByItem, profitabilityByProject, tallyXml, ownerCapital };
