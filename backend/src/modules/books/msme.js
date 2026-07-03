"use strict";
// MSME 43B(h) & Form MSME-1 — the authoritative, ledger-truth version. The frontend radar works
// off entered bills (KV); this computes from PURCHASE vouchers in the GL joined to micro/small
// vendors in vendor_master (matched by GSTIN, else name), with EXACT bill dates — so the
// disallowance flag and MSMED-Act interest are precise, and the Form-1 export reconciles to books.
//
// 43B(h): a Micro/Small (NOT Medium) supplier must be paid within the agreed period, capped at 45
// days (15 without a written agreement). Beyond the appointed day the amount is disallowed for the
// FY until paid, and interest accrues at 3× the RBI bank rate, compounded with monthly rests.
const { pool } = require("../../db");

const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const DAY = 86400000;

// MSMED-Act interest: 3× bank rate, compounded monthly, from the appointed day.
function msmeInterest(outstanding, daysOverdue, effRatePct) {
  if (daysOverdue <= 0 || outstanding <= 0) return 0;
  const months = daysOverdue / 30;
  const r = effRatePct / 100 / 12;
  return r2(outstanding * (Math.pow(1 + r, months) - 1));
}

// Outstanding PURCHASE dues to micro/small MSME vendors, per bill, as of `asOf`.
async function _openMsmeBills(tenantId, asOf) {
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_date, v.reference, pl.name AS party_name, pl.gstin AS party_gstin,
            vm.name AS vendor_name, vm.msme_category, vm.udyam, vm.payment_terms_days,
            COALESCE((SELECT SUM(e.credit)-SUM(e.debit) FROM book_voucher_entries e
                        WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
       JOIN book_ledgers pl ON pl.id=v.party_ledger_id AND pl.tenant_id=v.tenant_id
       JOIN vendor_master vm ON vm.tenant_id=v.tenant_id AND vm.msme_category IN ('micro','small')
            AND ( (vm.gstin IS NOT NULL AND pl.gstin IS NOT NULL AND UPPER(vm.gstin)=UPPER(pl.gstin))
                  OR LOWER(vm.name)=LOWER(pl.name) )
      WHERE v.tenant_id=$1 AND v.voucher_type='PURCHASE' AND v.is_cancelled=false
        AND v.party_ledger_id IS NOT NULL AND v.voucher_date <= $2`,
    [tenantId, asOf]
  );
  const asOfMs = new Date(asOf).getTime();
  const bills = [];
  for (const row of rows) {
    const outstanding = r2(n(row.gross) - n(row.allocated));
    if (!(outstanding > 0)) continue;
    // Appointed day: agreed terms capped at 45 days; 15 if no terms recorded.
    const creditDays = Math.min(n(row.payment_terms_days) || 15, 45);
    const appointedMs = new Date(row.voucher_date).getTime() + creditDays * DAY;
    const daysOverdue = Math.max(0, Math.floor((asOfMs - appointedMs) / DAY));
    bills.push({
      voucher_id: row.id, reference: row.reference, bill_date: row.voucher_date,
      vendor: row.vendor_name || row.party_name, udyam: row.udyam || null, msme_category: row.msme_category,
      credit_days: creditDays, outstanding, days_overdue: daysOverdue, overdue: daysOverdue > 0,
    });
  }
  return bills;
}

// 43B(h) radar (ledger truth). effRate = 3 × bank rate (default RBI bank rate 6.5%).
async function msme43b(tenantId, { asOf, bankRate = 6.5 } = {}) {
  const on = (asOf ? new Date(asOf) : new Date()).toISOString().slice(0, 10);
  const eff = r2(n(bankRate) * 3);
  const bills = await _openMsmeBills(tenantId, on);
  const byVendor = new Map();
  let totalOutstanding = 0, totalDisallowed = 0, totalInterest = 0;
  for (const b of bills) {
    const interest = msmeInterest(b.outstanding, b.days_overdue, eff);
    totalOutstanding += b.outstanding;
    if (b.overdue) { totalDisallowed += b.outstanding; totalInterest += interest; }
    const key = b.vendor;
    const v = byVendor.get(key) || { vendor: b.vendor, udyam: b.udyam, msme_category: b.msme_category, outstanding: 0, disallowed: 0, interest: 0, bills: 0, max_overdue: 0 };
    v.outstanding = r2(v.outstanding + b.outstanding);
    if (b.overdue) { v.disallowed = r2(v.disallowed + b.outstanding); v.interest = r2(v.interest + interest); }
    v.bills++; v.max_overdue = Math.max(v.max_overdue, b.days_overdue);
    byVendor.set(key, v);
  }
  return {
    as_of: on, effective_rate_pct: eff, bank_rate_pct: n(bankRate),
    vendors: [...byVendor.values()].sort((a, b) => b.disallowed - a.disallowed),
    totals: { outstanding: r2(totalOutstanding), disallowed: r2(totalDisallowed), interest: r2(totalInterest) },
    note: "Ledger-truth from PURCHASE vouchers to Micro/Small vendors. Disallowed = unpaid beyond the 45-day appointed day; interest = 3× RBI bank rate, monthly rests.",
  };
}

// Form MSME-1 (half-yearly ROC return of dues to Micro/Small suppliers outstanding > 45 days).
// H1 = Apr–Sep (period end 30 Sep, due 31 Oct); H2 = Oct–Mar (period end 31 Mar, due 30 Apr).
async function msmeForm1(tenantId, { halfYear, bankRate = 6.5 } = {}) {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // FY start year
  const hy = halfYear === "H2" || halfYear === "H1" ? halfYear : (now.getMonth() >= 3 && now.getMonth() <= 8 ? "H1" : "H2");
  const period = hy === "H1"
    ? { label: `H1 ${y}-${String((y + 1) % 100).padStart(2, "0")} (Apr–Sep)`, from: `${y}-04-01`, to: `${y}-09-30`, due: `${y}-10-31` }
    : { label: `H2 ${y}-${String((y + 1) % 100).padStart(2, "0")} (Oct–Mar)`, from: `${y}-10-01`, to: `${y + 1}-03-31`, due: `${y + 1}-04-30` };
  const eff = r2(n(bankRate) * 3);
  const bills = await _openMsmeBills(tenantId, period.to);
  const entries = bills.filter((b) => b.days_overdue > 0).map((b) => ({
    vendor: b.vendor, udyam: b.udyam, msme_category: b.msme_category, bill_ref: b.reference, bill_date: b.bill_date,
    amount: b.outstanding, days_overdue: b.days_overdue, interest: msmeInterest(b.outstanding, b.days_overdue, eff),
  })).sort((a, b) => b.amount - a.amount);
  return {
    period: period.label, from: period.from, to: period.to, filing_due: period.due,
    entries,
    total_reportable: r2(entries.reduce((s, e) => s + e.amount, 0)),
    total_interest: r2(entries.reduce((s, e) => s + e.interest, 0)),
    note: "Micro/Small supplier dues outstanding beyond 45 days as at period end. Verify Udyam numbers before filing MSME-1 on the MCA portal.",
  };
}

module.exports = { msme43b, msmeForm1, msmeInterest };
