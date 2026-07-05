"use strict";
// Loan servicing lifecycle (LMS depth) — the layer that runs AFTER origination:
//   • DPD refresh + asset classification: standard → overdue → npa (at 90 DPD)
//   • penal-interest accrual on the overdue balance, posted to the GL (SMB-borrower
//     side: Dr Penal Interest Expense / Cr Penal Interest Payable), idempotent per
//     loan+date so re-runs and multi-day gaps both behave
//   • settlement / waiver posting (Dr Borrowings / Cr Bank + Cr Gain on Settlement)
//   • a per-tenant portfolio summary (book health by bucket/class)
// Runs as a daily cron across tenants. All loan reads/writes are RLS'd via q();
// GL postings go through books.postVoucher on their own connection (book_* is not RLS'd),
// best-effort + idempotent, and degrade cleanly when the chart isn't seeded.
//
// NOT here (deferred, needs a cross-tenant/platform admin context, not this per-tenant
// RLS surface): model monitoring — score distribution, Gini/KS on a holdout, PSI drift.
const { pool } = require("../../db");
const { q } = require("../../lib/tenantDb");
const { postVoucher } = require("../books/posting-engine");
const { ledgerByName, firstBankLedger, ensureByNature } = require("./index");

const NPA_DPD = 90;
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
// Calendar date as yyyy-mm-dd. node-postgres hands back DATE columns as JS Dates at LOCAL
// midnight, so we must read LOCAL parts — round-tripping through toISOString() (UTC) shifts
// the day backward in any timezone ahead of UTC (e.g. IST), which would corrupt DPD and,
// worse, break penal-accrual idempotency (penal_last_accrued_on reads back a day early).
const iso = (d) => {
  if (typeof d === "string") return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const daysBetween = (fromIso, toIso) => Math.max(0, Math.floor((new Date(toIso) - new Date(fromIso)) / 86400000));

class ServiceError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }

const classify = (dpd) => (dpd <= 0 ? "standard" : dpd < NPA_DPD ? "overdue" : "npa");
const bucketOf = (dpd) => (dpd <= 0 ? "current" : dpd <= 30 ? "1-30" : dpd <= 60 ? "31-60" : dpd <= 90 ? "61-90" : "90+");

// Max days-past-due + earliest overdue due-date across a loan's unpaid schedule as of a date.
function dpdOf(scheduleRows, asOf) {
  let maxDpd = 0, earliest = null;
  for (const s of scheduleRows) {
    if (s.status === "paid") continue;
    const due = iso(s.due_date);
    if (due < asOf) {
      maxDpd = Math.max(maxDpd, daysBetween(due, asOf));
      if (!earliest || due < earliest) earliest = due;
    }
  }
  return { dpd: maxDpd, earliestOverdue: earliest };
}

// Post one penal-interest accrual voucher (borrower side). Idempotent per loan+asOf.
async function postPenal(tenantId, loan, charge, asOf) {
  try {
    const exp = await ensureByNature(tenantId, "Penal Interest Expense", "EXPENSE");
    const pay = await ensureByNature(tenantId, "Penal Interest Payable", "LIABILITY");
    if (!exp || !pay) return null;
    const res = await postVoucher(tenantId, null,
      { voucherType: "JOURNAL", voucherDate: asOf, narration: `Penal interest ${loan.id} (${asOf})`, source: "lending" },
      [{ ledgerId: exp, debit: r2(charge), credit: 0 }, { ledgerId: pay, debit: 0, credit: r2(charge) }],
      { idempotencyKey: `penal:${loan.id}:${asOf}` });
    return res.voucherId || null;
  } catch (e) { console.warn("[lending] penal GL skipped:", e.message); return null; }
}

// Service ONE tenant's active loans as of `asOf` (yyyy-mm-dd). Idempotent per day.
async function runServicing(tenantId, asOf = iso(new Date())) {
  const { rows: loans } = await q(tenantId, "SELECT * FROM loans WHERE tenant_id=$1 AND status='active'", [tenantId]);
  let scanned = 0, overdue = 0, npa = 0, penalPosted = 0, penalAmount = 0;
  for (const loan of loans) {
    scanned++;
    const { rows: sch } = await q(tenantId, "SELECT * FROM loan_schedule WHERE loan_id=$1 ORDER BY installment_no", [loan.id]);
    const { dpd, earliestOverdue } = dpdOf(sch, asOf);
    const assetClass = classify(dpd);
    if (assetClass === "overdue") overdue++;
    if (assetClass === "npa") npa++;

    let charge = 0;
    if (dpd > 0 && n(loan.outstanding_principal) > 0 && n(loan.penal_rate_pct) > 0) {
      // Accrue from the last accrual (or the earliest overdue date on first accrual) up to asOf.
      const from = loan.penal_last_accrued_on ? iso(loan.penal_last_accrued_on) : earliestOverdue;
      const days = from ? daysBetween(from, asOf) : 0;
      if (days > 0) {
        charge = r2(n(loan.outstanding_principal) * (n(loan.penal_rate_pct) / 100) * (days / 365));
        if (charge > 0) {
          const v = await postPenal(tenantId, loan, charge, asOf);
          if (v) { penalPosted++; penalAmount = r2(penalAmount + charge); }
        }
      }
    }

    await q(tenantId,
      `UPDATE loans SET dpd=$2, asset_class=$3, dpd_updated_on=$4::date,
         penal_accrued = penal_accrued + $5,
         penal_last_accrued_on = CASE WHEN $6 THEN $4::date ELSE NULL END
       WHERE tenant_id=$1 AND id=$7`,
      [tenantId, dpd, assetClass, asOf, charge, dpd > 0, loan.id]);
    await q(tenantId,
      `INSERT INTO loan_servicing_events(loan_id,tenant_id,as_of,dpd,asset_class,penal_charge) VALUES($1,$2,$3,$4,$5,$6)`,
      [loan.id, tenantId, asOf, dpd, assetClass, charge]);
  }
  return { tenantId, asOf, scanned, overdue, npa, penalPosted, penalAmount: r2(penalAmount) };
}

// Settle/waive a loan: borrower pays `settlementAmount`, lender forgives the rest of the
// outstanding principal (recognised as income). Posts Dr Borrowings / Cr Bank + Cr Gain.
async function settleLoan(tenantId, loanId, { settlementAmount, note, actorId } = {}) {
  const { rows } = await q(tenantId, "SELECT * FROM loans WHERE tenant_id=$1 AND id=$2", [tenantId, loanId]);
  const loan = rows[0];
  if (!loan) throw new ServiceError("NOT_FOUND", "Loan not found", 404);
  if (loan.status !== "active") throw new ServiceError("BAD_STATE", `Loan is ${loan.status}`, 409);
  const outstanding = r2(n(loan.outstanding_principal));
  let paid = settlementAmount == null ? outstanding : r2(n(settlementAmount));
  if (paid < 0) throw new ServiceError("BAD_INPUT", "settlementAmount cannot be negative", 400);
  if (paid > outstanding) paid = outstanding;
  const waiver = r2(outstanding - paid);

  // GL: clear the Borrowings liability; cash out the settlement; recognise the waiver as income.
  let voucherId = null;
  try {
    const bank = await firstBankLedger(tenantId);
    const borrow = await ledgerByName(tenantId, "Borrowings");
    const gain = waiver > 0 ? await ensureByNature(tenantId, "Gain on Loan Settlement", "INCOME") : null;
    if (bank && borrow && outstanding > 0 && (waiver === 0 || gain)) {
      const entries = [{ ledgerId: borrow, debit: outstanding, credit: 0 }];
      if (paid > 0) entries.push({ ledgerId: bank, debit: 0, credit: paid });
      if (waiver > 0) entries.push({ ledgerId: gain, debit: 0, credit: waiver });
      const res = await postVoucher(tenantId, actorId || null,
        { voucherType: "JOURNAL", voucherDate: iso(new Date()), narration: `Loan settlement ${loan.id}`, source: "lending" },
        entries, { idempotencyKey: `loan_settle_${loan.id}` });
      voucherId = res.voucherId || null;
    }
  } catch (e) { console.warn("[lending] settlement GL skipped:", e.message); }

  await q(tenantId,
    `INSERT INTO loan_settlements(loan_id,tenant_id,settlement_amount,waiver_amount,gl_voucher_id,note,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [loanId, tenantId, paid, waiver, voucherId, note || null, actorId || null]);
  await q(tenantId, "UPDATE loans SET outstanding_principal=0, status='closed', settled_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId, loanId]);
  // #7 repay→relearn: unpaid/overdue schedule rows are DELINQUENCY EVIDENCE and are left
  // exactly as they stand — the old code stamped every row 'paid', so a waiver settlement
  // (an actual credit loss) became indistinguishable from a clean payer in every future
  // read of this borrower's history. The loan_settlements row (waiver_amount) is the
  // authoritative record; the conduct ladder and the outcome labeler both read it.
  return { settled: true, loanId, settlementAmount: paid, waiverAmount: waiver, glPosted: !!voucherId };
}

// Per-tenant portfolio summary (book health). Computes DPD live so it's accurate even
// if the daily servicing run hasn't fired yet today.
async function portfolioSummary(tenantId, asOf = iso(new Date())) {
  const { rows: loans } = await q(tenantId, "SELECT * FROM loans WHERE tenant_id=$1", [tenantId]);
  const summary = {
    asOf, loans: loans.length,
    active: 0, closed: 0, written_off: 0,
    byClass: { standard: 0, overdue: 0, npa: 0 },
    byBucket: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
    outstanding: 0, overdueAmount: 0, npaAmount: 0, penalAccrued: 0, weightedDpd: 0,
  };
  let dpdWeight = 0;
  for (const loan of loans) {
    summary.outstanding = r2(summary.outstanding + n(loan.outstanding_principal));
    summary.penalAccrued = r2(summary.penalAccrued + n(loan.penal_accrued));
    if (loan.status === "closed") { summary.closed++; continue; }
    if (loan.status === "written_off") { summary.written_off++; continue; }
    if (loan.status !== "active") continue;
    summary.active++;
    const { rows: sch } = await q(tenantId, "SELECT * FROM loan_schedule WHERE loan_id=$1 ORDER BY installment_no", [loan.id]);
    const { dpd } = dpdOf(sch, asOf);
    const cls = classify(dpd);
    summary.byClass[cls]++;
    summary.byBucket[bucketOf(dpd)]++;
    const out = n(loan.outstanding_principal);
    if (cls === "overdue") summary.overdueAmount = r2(summary.overdueAmount + out);
    if (cls === "npa") summary.npaAmount = r2(summary.npaAmount + out);
    dpdWeight += dpd * out; // outstanding-weighted DPD
  }
  summary.weightedDpd = summary.outstanding > 0 ? Math.round(dpdWeight / summary.outstanding) : 0;
  return summary;
}

// Cron driver: service every tenant that has loans. Loans are FORCE-RLS so we can't read
// them cross-tenant; enumerate the tenant universe from the (non-RLS) users table and let
// runServicing() no-op for tenants with no active loans.
async function runServicingDue(asOf = iso(new Date())) {
  let tenants = [];
  try { tenants = (await pool.query("SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL")).rows.map((r) => r.tenant_id); }
  catch (e) { console.warn("[lending] servicing tenant enumeration failed:", e.message); return { tenants: 0, serviced: 0 }; }
  let serviced = 0, penalPosted = 0;
  for (const t of tenants) {
    try { const r = await runServicing(t, asOf); if (r.scanned) { serviced += r.scanned; penalPosted += r.penalPosted; } }
    catch (e) { console.error(`[lending] servicing ${t} failed:`, e.message); }
  }
  return { tenants: tenants.length, serviced, penalPosted };
}

module.exports = {
  ServiceError, NPA_DPD,
  runServicing, settleLoan, portfolioSummary, runServicingDue,
  classify, bucketOf, dpdOf, // pure helpers exported for tests
};
