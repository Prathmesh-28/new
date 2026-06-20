// §11 — Year-end closing. Until now FY carry-forward was faked at read-time in
// reports._ledgerClosings (P&L ledgers reset every FY, permanent ledgers carry
// their net movement forward). There was no actual CLOSING VOUCHER on the books.
//
// This module ports ERPNext's "Period Closing Voucher": at FY end we compute net
// profit/loss from the P&L-affecting ledgers (income − expense) and POST a single
// closing JOURNAL that zeroes every P&L ledger into a single equity ledger
// (Reserves & Surplus / Retained Earnings). After posting we LOCK every period of
// that FY so the closed year can never be re-posted.
//
// Schedule-III: the closing balance lands in "Reserves and Surplus" under equity.
const { pool } = require("../../db");
const { money, toDb, toRupees, ZERO } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");
const { setPeriodStatus } = require("./ops");

// The equity ledger profit retains into. Reserves & Surplus is a seeded group; we
// create-or-require a same-named ledger under it (ERPNext: "closing_account_head").
const RESERVES_LEDGER = "Reserves & Surplus";
// Stable marker stamped on the closing voucher so the operation is idempotent and
// the voucher is recognisable later (ERPNext uses is_period_closing_voucher).
const CLOSING_SOURCE = "year-end-close";
const closingNarration = (fy) => `Year-end closing entry for FY ${fy} [${CLOSING_SOURCE}]`;

// FY string is "YYYY-yy" (e.g. "2026-27"); the Indian FY ends 31 Mar of the
// following calendar year, which is period month 12.
function fyEndDate(fy) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(fy || "").trim());
  if (!m) throw new PostError("BAD_INPUT", `Invalid financial year "${fy}" (expected YYYY-yy)`, 400);
  return `${Number(m[1]) + 1}-03-31`;
}

// Locate the existing closing voucher for this FY (idempotency check). Matches by
// the source marker + FY, ignoring cancelled ones.
async function _findClosingVoucher(tenantId, fy) {
  const { rows } = await pool.query(
    `SELECT id, voucher_type, voucher_number, voucher_date, financial_year, narration
       FROM book_vouchers
      WHERE tenant_id=$1 AND financial_year=$2 AND voucher_type='JOURNAL'
        AND is_cancelled=false AND source=$3 AND narration=$4
      ORDER BY id LIMIT 1`,
    [tenantId, fy, CLOSING_SOURCE, closingNarration(fy)]
  );
  return rows[0] || null;
}

// Create-or-require the Reserves & Surplus ledger. The group is seeded by seed.js;
// if the ledger itself is missing we create it under that group.
async function _reservesLedgerId(tenantId) {
  let id = await ledgerIdByName(tenantId, RESERVES_LEDGER);
  if (id) return id;
  const { rows: g } = await pool.query(
    "SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name=$2",
    [tenantId, RESERVES_LEDGER]
  );
  if (!g[0]) throw new PostError("NO_RESERVES_GROUP", `Group "${RESERVES_LEDGER}" is not seeded; run seedBooks first`, 422);
  await pool.query(
    "INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING",
    [tenantId, RESERVES_LEDGER, g[0].id]
  );
  id = await ledgerIdByName(tenantId, RESERVES_LEDGER);
  if (!id) throw new PostError("NO_RESERVES_LEDGER", "Could not create Reserves & Surplus ledger", 500);
  return id;
}

// Per-P&L-ledger net movement for the FY (debit-positive signed balance). P&L
// ledgers reset every FY so we use this-FY movement only — no carry-forward.
async function _plLedgerBalances(tenantId, fy) {
  const { rows } = await pool.query(
    `SELECT l.id, l.name, g.nature,
            COALESCE(SUM(e.debit),0)  AS dr,
            COALESCE(SUM(e.credit),0) AS cr
       FROM book_ledgers l
       JOIN book_account_groups g ON g.id = l.group_id AND g.affects_pl = true
       LEFT JOIN book_voucher_entries e ON e.ledger_id = l.id AND e.tenant_id = l.tenant_id
       LEFT JOIN book_vouchers v ON v.id = e.voucher_id
                 AND v.financial_year = $2 AND v.is_cancelled = false
      WHERE l.tenant_id = $1
      GROUP BY l.id, l.name, g.nature
      ORDER BY g.nature, l.name`,
    [tenantId, fy]
  );
  return rows.map((r) => ({
    ledgerId: r.id, name: r.name, nature: r.nature,
    dr: money(r.dr), cr: money(r.cr),
    signed: money(r.dr).minus(money(r.cr)), // >0 net debit, <0 net credit
  }));
}

// (1) Year-end close: compute net P/L, post the closing journal, lock the FY.
async function yearEndClose(tenantId, actorId, fy) {
  if (!tenantId || !fy) throw new PostError("BAD_INPUT", "tenantId and fy required", 400);
  const endDate = fyEndDate(fy); // validates fy format

  // Idempotency — refuse to re-close an FY that already has a closing voucher.
  const existing = await _findClosingVoucher(tenantId, fy);
  if (existing) {
    throw new PostError("ALREADY_CLOSED", `FY ${fy} is already closed (closing JOURNAL #${existing.voucher_number})`, 409);
  }

  const reservesId = await _reservesLedgerId(tenantId);
  const balances = await _plLedgerBalances(tenantId, fy);

  // Net profit = income − expense. Income ledgers carry credit balances (signed<0),
  // expense ledgers carry debit balances (signed>0).
  let income = ZERO, expense = ZERO;
  const entries = [];
  for (const b of balances) {
    if (b.signed.isZero()) continue; // nothing to zero out for this ledger
    if (b.nature === "INCOME") {
      income = income.plus(b.signed.neg()); // credit balance → positive income
    } else if (b.nature === "EXPENSE") {
      expense = expense.plus(b.signed);     // debit balance → positive expense
    } else {
      continue; // affects_pl but neither INCOME nor EXPENSE: skip (defensive)
    }
    // Post the exact OPPOSITE of the ledger's net balance to drive it to zero:
    //  income ledger (net credit) → Dr by its credit balance
    //  expense ledger (net debit) → Cr by its debit balance
    if (b.signed.greaterThan(0)) {
      entries.push({ ledgerId: b.ledgerId, debit: "0", credit: toDb(b.signed) });
    } else {
      entries.push({ ledgerId: b.ledgerId, debit: toDb(b.signed.neg()), credit: "0" });
    }
  }

  const netProfit = income.minus(expense); // >0 profit, <0 loss

  // No P&L movement → nothing to close, but we still want a recognisable marker
  // and to lock the year. ERPNext refuses an empty PCV; we mirror that.
  if (entries.length === 0) {
    throw new PostError("NOTHING_TO_CLOSE", `FY ${fy} has no P&L movement to close`, 422);
  }

  // Balancing line: the net result lands in Reserves & Surplus (equity).
  //  net profit (>0): the P&L lines net to a credit → balance with a Cr to Reserves.
  //    (Σ entries: Dr income + Cr expense; Dr total − Cr total = expense − income = −netProfit.
  //     For profit, Dr<Cr by netProfit, so we Dr Reserves... — compute precisely:)
  // Compute the running imbalance from the P&L lines, then plug Reserves with it.
  let drTotal = ZERO, crTotal = ZERO;
  for (const e of entries) { drTotal = drTotal.plus(money(e.debit)); crTotal = crTotal.plus(money(e.credit)); }
  const diff = drTotal.minus(crTotal); // >0 → need a credit to Reserves; <0 → need a debit
  if (!diff.isZero()) {
    if (diff.greaterThan(0)) {
      entries.push({ ledgerId: reservesId, debit: "0", credit: toDb(diff) });
    } else {
      entries.push({ ledgerId: reservesId, debit: toDb(diff.neg()), credit: "0" });
    }
  }

  const closingVoucher = await postVoucher(
    tenantId, actorId,
    {
      voucherType: "JOURNAL",
      voucherDate: endDate,
      narration: closingNarration(fy),
      reference: `FY-CLOSE-${fy}`,
      source: CLOSING_SOURCE,
    },
    entries
  );

  // Lock every period of the closed FY so it can't be re-posted (period 1..12).
  const periodsLocked = [];
  for (let month = 1; month <= 12; month++) {
    await setPeriodStatus(tenantId, actorId, fy, month, "CLOSED");
    periodsLocked.push(month);
  }

  return {
    fy,
    netProfit: toRupees(netProfit),
    closingVoucher,
    periodsLocked,
  };
}

module.exports = { yearEndClose, RESERVES_LEDGER, CLOSING_SOURCE };
