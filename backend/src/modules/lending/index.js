"use strict";
// SMB embedded lending - data layer. LOS (offers + KFS) + LMS (loans, schedule,
// repayments, DPD) + the invoice-financing wedge (self-liquidating: repays when the
// source invoice is paid). Eligibility reuses the deterministic scorecard. GL postings
// are SMB-side, best-effort + idempotent, and degrade when the chart isn't seeded.
const { pool } = require("../../db");
const { q } = require("../../lib/tenantDb"); // RLS Phase 5
// RLS rollout: the 4 lending tables (loan_offers, loans, loan_schedule, loan_repayments)
// are FORCE-RLS (migration 0006). Their reads/writes go through q(tenantId,...). There are
// NO multi-statement transactions here, so no withTenant is needed. The GL helpers below
// (ledgerByName/firstBankLedger/ensureByNature) query book_* tables (NOT RLS'd) and keep
// pool.query; postDisbursal/postRepayment post via books on their own connection.
const { postVoucher } = require("../books/posting-engine");

class LendError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const addDays = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };

// ── Pure math ────────────────────────────────────────────────────────────────
// EMI amortization: equal installments; each split into interest (on the reducing
// balance) and principal. Returns rows + totals.
function amortize(principal, apr, months, startDate) {
  const P = n(principal); const months_ = Math.max(1, Math.round(months));
  const r = n(apr) / 12 / 100;
  const emi = r > 0 ? (P * r * Math.pow(1 + r, months_)) / (Math.pow(1 + r, months_) - 1) : P / months_;
  const rows = []; let bal = P; let totalInterest = 0;
  for (let i = 1; i <= months_; i++) {
    const interest = r2(bal * r);
    let principalPart = r2(emi - interest);
    if (i === months_) principalPart = r2(bal); // soak rounding into the last installment
    const total = r2(principalPart + interest);
    bal = r2(bal - principalPart); totalInterest = r2(totalInterest + interest);
    rows.push({ installment_no: i, due_date: addMonths(startDate, i), principal_due: principalPart, interest_due: interest, total_due: total });
  }
  return { rows, emi: r2(emi), totalInterest, totalRepayable: r2(P + totalInterest) };
}
// Bullet (invoice finance): single repayment of principal + simple interest at maturity.
function bullet(principal, apr, days, startDate) {
  const P = n(principal); const interest = r2(P * (n(apr) / 100) * (Math.max(1, days) / 365));
  return { rows: [{ installment_no: 1, due_date: addDays(startDate, days), principal_due: P, interest_due: interest, total_due: r2(P + interest) }], totalInterest: interest, totalRepayable: r2(P + interest) };
}

// RBI-style Key Fact Statement - the mandated all-in cost disclosure shown before accept.
function buildKFS({ kind, principal, processingFee, apr, sched }) {
  const disbursal = r2(n(principal) - n(processingFee));
  const totalRepayable = r2(sched.totalRepayable + 0); // fee is taken upfront from disbursal
  const allInCost = r2(sched.totalInterest + n(processingFee));
  return {
    product: kind,
    sanctioned_amount: r2(principal),
    net_disbursal: disbursal,
    processing_fee: r2(processingFee),
    annual_interest_rate_pct: r2(apr),
    total_interest: r2(sched.totalInterest),
    total_repayable: totalRepayable,
    all_in_cost: allInCost,
    installments: sched.rows.length,
    installment_amount: sched.rows[0]?.total_due ?? 0,
    schedule_preview: sched.rows.slice(0, 3),
    cooling_off_days: 1,
    recovery: kind === "invoice_finance" ? "Auto-recovered from the financed invoice on payment" : "e-NACH / UPI AutoPay (when configured)",
    disclosure: "Indicative - final terms confirmed by the lending partner. Charges are all-inclusive of the APR shown.",
  };
}

// ── Eligibility (reuses the deterministic scorecard) ───────────────────────────
async function eligibility(tenantId) {
  try {
    const { score: underwrite } = require("../../lib/underwriting");
    const r = await underwrite(tenantId, pool);
    return { limit: n(r.approved_amount), grade: r.grade, score: r.score, decision: r.decision?.outcome || r.decision, recommended_product: r.recommended_product };
  } catch {
    return { limit: 0, grade: "E", score: 0, decision: "refer", recommended_product: null };
  }
}

// ── LOS: offers + KFS ──────────────────────────────────────────────────────────
async function createOffer(tenantId, userId, body = {}) {
  const kind = ["invoice_finance", "working_capital", "term"].includes(body.kind) ? body.kind : "working_capital";
  const today = new Date().toISOString().slice(0, 10);
  let principal, apr, processingFee, tenureMonths = null, tenureDays = null, sched, sourceInvoiceId = null;

  if (kind === "invoice_finance") {
    let invoiceAmount = n(body.invoice_amount);
    const advanceRate = body.advance_rate != null ? Math.min(Math.max(n(body.advance_rate), 0), 0.9) : 0.8;
    apr = n(body.apr) || 24;
    tenureDays = Math.round(n(body.tenure_days) || 60);
    sourceInvoiceId = body.invoice_id || null;

    // When financing a SPECIFIC invoice the invoice is the source of truth — this closes
    // the self-liquidating loop (source_invoice_id set → onInvoicePaid recovers it). Verify
    // it's this tenant's, issued-and-unpaid, and derive the face value server-side (never
    // trust a client-supplied amount). invoices is not RLS'd → explicit tenant_id filter.
    if (sourceInvoiceId) {
      const { rows: invRows } = await pool.query(
        "SELECT id, total_amount, status, due_date FROM invoices WHERE id=$1 AND tenant_id=$2",
        [sourceInvoiceId, tenantId]
      );
      const inv = invRows[0];
      if (!inv) throw new LendError("NOT_FOUND", "Invoice not found", 404);
      if (inv.status !== "sent") throw new LendError("BAD_STATE", `Only an issued, unpaid invoice can be financed (this one is ${inv.status})`, 409);
      invoiceAmount = n(inv.total_amount);
      // One live advance per invoice — refuse a second offer/loan against the same invoice.
      const { rows: dup } = await q(tenantId,
        `SELECT 1 FROM loans WHERE tenant_id=$1 AND source_invoice_id=$2 AND status='active'
         UNION ALL
         SELECT 1 FROM loan_offers WHERE tenant_id=$1 AND source_invoice_id=$2 AND status='offered' LIMIT 1`,
        [tenantId, sourceInvoiceId]
      );
      if (dup[0]) throw new LendError("DUPLICATE", "This invoice already has a live advance or a pending offer", 409);
      // Default the tenor to days-until-due so repayment lands when the invoice is expected paid.
      if (body.tenure_days == null && inv.due_date) {
        const days = Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000);
        if (days > 0) tenureDays = days;
      }
    }
    if (!(invoiceAmount > 0)) throw new LendError("BAD_INPUT", "invoice_amount required for invoice financing", 400);

    principal = r2(advanceRate * invoiceAmount);
    // never advance beyond the tenant's underwriting limit
    const elig = await eligibility(tenantId);
    if (elig.limit > 0) principal = Math.min(principal, elig.limit);
    processingFee = r2(n(body.processing_fee) || principal * 0.01);
    sched = bullet(principal, apr, tenureDays, today);
  } else {
    principal = n(body.principal);
    if (!(principal > 0)) {
      const elig = await eligibility(tenantId);
      principal = elig.limit;
    }
    if (!(principal > 0)) throw new LendError("BAD_INPUT", "principal required (or no eligible limit)", 400);
    apr = n(body.apr) || 28;
    tenureMonths = Math.round(n(body.tenure_months) || 12);
    processingFee = r2(n(body.processing_fee) || principal * 0.02);
    sched = amortize(principal, apr, tenureMonths, today);
  }

  const kfs = buildKFS({ kind, principal, processingFee, apr, sched });
  let rows;
  try {
    ({ rows } = await q(tenantId,
      `INSERT INTO loan_offers(tenant_id,kind,principal,processing_fee,apr,tenure_months,tenure_days,source_invoice_id,kfs,created_by,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '14 days') RETURNING *`,
      [tenantId, kind, principal, processingFee, apr, tenureMonths, tenureDays, sourceInvoiceId, JSON.stringify(kfs), userId || null]
    ));
  } catch (e) {
    // uq_loan_offers_open_invoice: a concurrent request already opened an offer for this
    // invoice — enforce one-live-advance-per-invoice even under a TOCTOU race.
    if (e.code === "23505") throw new LendError("DUPLICATE", "This invoice already has a pending offer or live advance", 409);
    throw e;
  }
  return { ...rows[0], principal: n(rows[0].principal), processing_fee: n(rows[0].processing_fee), apr: n(rows[0].apr), schedule_preview: sched.rows };
}

// Bulk "advance your receivables book": one action → an independent invoice-finance offer
// per selected invoice. Each reuses the (verified) single-invoice createOffer, so each loan
// self-liquidates on its own invoice's payment. Best-effort: a bad/duplicate invoice is
// reported in `failed` and does not block the rest. De-dupes the input id list.
async function createOffersBulk(tenantId, userId, { invoice_ids = [], apr, advance_rate } = {}) {
  const ids = [...new Set((invoice_ids || []).filter(Boolean))];
  if (!ids.length) throw new LendError("BAD_INPUT", "invoice_ids required", 400);
  if (ids.length > 100) throw new LendError("BAD_INPUT", "too many invoices (max 100)", 400);
  const created = [], failed = [];
  for (const invoice_id of ids) {
    try {
      const offer = await createOffer(tenantId, userId, { kind: "invoice_finance", invoice_id, apr, advance_rate });
      created.push(offer);
    } catch (e) {
      failed.push({ invoice_id, error: e.message, code: e.code || "ERROR" });
    }
  }
  return { created, failed };
}

// Accept several offers in one action (e.g. after a bulk advance). Best-effort per offer.
async function acceptOffersBulk(tenantId, offerIds = [], actorId) {
  const ids = [...new Set((offerIds || []).filter(Boolean))];
  if (!ids.length) throw new LendError("BAD_INPUT", "offer ids required", 400);
  const accepted = [], failed = [];
  for (const id of ids) {
    try { accepted.push(await acceptOffer(tenantId, id, actorId)); }
    catch (e) { failed.push({ id, error: e.message, code: e.code || "ERROR" }); }
  }
  return { accepted, failed };
}

async function listOffers(tenantId) {
  const { rows } = await q(tenantId,"SELECT * FROM loan_offers WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100", [tenantId]);
  return rows.map((o) => ({ ...o, principal: n(o.principal), processing_fee: n(o.processing_fee), apr: n(o.apr) }));
}
async function getOffer(tenantId, id) {
  const { rows } = await q(tenantId,"SELECT * FROM loan_offers WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new LendError("NOT_FOUND", "Offer not found", 404);
  return rows[0];
}
async function declineOffer(tenantId, id) {
  await q(tenantId,"UPDATE loan_offers SET status='declined' WHERE tenant_id=$1 AND id=$2 AND status='offered'", [tenantId, id]);
  return { declined: true };
}

// Accept → create the loan + schedule + (guarded) disbursal posting.
async function acceptOffer(tenantId, offerId, actorId) {
  const offer = await getOffer(tenantId, offerId);
  if (offer.status !== "offered") throw new LendError("BAD_STATE", `Offer is ${offer.status}`, 409);
  const today = new Date().toISOString().slice(0, 10);
  const sched = offer.kind === "invoice_finance"
    ? bullet(n(offer.principal), n(offer.apr), offer.tenure_days, today)
    : amortize(n(offer.principal), n(offer.apr), offer.tenure_months, today);
  const dueDate = sched.rows[sched.rows.length - 1].due_date;
  const net = r2(n(offer.principal) - n(offer.processing_fee));

  let lr;
  try {
    ({ rows: lr } = await q(tenantId,
      `INSERT INTO loans(tenant_id,offer_id,kind,principal,apr,outstanding_principal,status,source_invoice_id,disbursed_amount,disbursed_at,due_date)
       VALUES($1,$2,$3,$4,$5,$4,'active',$6,$7, now(), $8) RETURNING *`,
      [tenantId, offer.id, offer.kind, n(offer.principal), n(offer.apr), offer.source_invoice_id, net, dueDate]
    ));
  } catch (e) {
    // uq_loans_active_invoice: this invoice already backs an active advance. Prevents a
    // double disbursal when two offers on one invoice are accepted concurrently.
    if (e.code === "23505") throw new LendError("DUPLICATE", "This invoice already has an active advance", 409);
    throw e;
  }
  const loan = lr[0];
  for (const s of sched.rows) {
    await q(tenantId,
      `INSERT INTO loan_schedule(loan_id,tenant_id,installment_no,due_date,principal_due,interest_due,total_due)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [loan.id, tenantId, s.installment_no, s.due_date, s.principal_due, s.interest_due, s.total_due]
    );
  }
  await q(tenantId,"UPDATE loan_offers SET status='accepted' WHERE id=$1", [offer.id]);
  const voucherId = await postDisbursal(tenantId, actorId, loan, net);
  if (voucherId) await q(tenantId,"UPDATE loans SET disbursal_voucher_id=$2 WHERE id=$1", [loan.id, voucherId]);
  return getLoan(tenantId, loan.id);
}

// ── LMS: loans, repayments, DPD ──────────────────────────────────────────────
async function getLoan(tenantId, id) {
  const { rows } = await q(tenantId,"SELECT * FROM loans WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new LendError("NOT_FOUND", "Loan not found", 404);
  const { rows: sch } = await q(tenantId,"SELECT * FROM loan_schedule WHERE loan_id=$1 ORDER BY installment_no", [id]);
  const { rows: rep } = await q(tenantId,"SELECT * FROM loan_repayments WHERE loan_id=$1 ORDER BY created_at", [id]);
  const loan = rows[0];
  return {
    ...loan, principal: n(loan.principal), apr: n(loan.apr), outstanding_principal: n(loan.outstanding_principal),
    disbursed_amount: n(loan.disbursed_amount),
    schedule: sch.map((s) => ({ ...s, principal_due: n(s.principal_due), interest_due: n(s.interest_due), total_due: n(s.total_due) })),
    repayments: rep.map((x) => ({ ...x, amount: n(x.amount), principal_component: n(x.principal_component), interest_component: n(x.interest_component) })),
    dpd: dpdDays(sch), dpd_bucket: dpdBucket(dpdDays(sch)),
  };
}
async function listLoans(tenantId) {
  const { rows } = await q(tenantId,"SELECT * FROM loans WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100", [tenantId]);
  return rows.map((l) => ({ ...l, principal: n(l.principal), apr: n(l.apr), outstanding_principal: n(l.outstanding_principal) }));
}

function dpdDays(scheduleRows) {
  const today = new Date().toISOString().slice(0, 10);
  let max = 0;
  for (const s of scheduleRows) {
    if (s.status === "paid") continue;
    if (s.due_date < today) max = Math.max(max, Math.ceil((Date.now() - new Date(s.due_date)) / 86400000));
  }
  return max;
}
const dpdBucket = (d) => (d <= 0 ? "current" : d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+");

// Allocate a repayment: interest first (across scheduled interest), then principal.
async function recordRepayment(tenantId, loanId, { amount, method = "manual", ref, actorId } = {}) {
  const amt = n(amount);
  if (!(amt > 0)) throw new LendError("BAD_INPUT", "amount must be > 0", 400);
  const { rows: lr } = await q(tenantId,"SELECT * FROM loans WHERE tenant_id=$1 AND id=$2", [tenantId, loanId]);
  const loan = lr[0];
  if (!loan) throw new LendError("NOT_FOUND", "Loan not found", 404);
  if (loan.status === "closed") return { alreadyClosed: true };

  const { rows: sch } = await q(tenantId,"SELECT * FROM loan_schedule WHERE loan_id=$1 ORDER BY installment_no", [loanId]);
  const { rows: prevRep } = await q(tenantId,"SELECT COALESCE(SUM(interest_component),0) AS i FROM loan_repayments WHERE loan_id=$1", [loanId]);
  const scheduledInterest = sch.reduce((s, x) => s + n(x.interest_due), 0);
  const interestOutstanding = Math.max(0, r2(scheduledInterest - n(prevRep[0].i)));
  const payInterest = r2(Math.min(amt, interestOutstanding));
  const payPrincipal = r2(Math.min(amt - payInterest, n(loan.outstanding_principal)));
  const newOutstanding = r2(n(loan.outstanding_principal) - payPrincipal);

  let repaymentId;
  try {
    const { rows: ins } = await q(tenantId,
      `INSERT INTO loan_repayments(loan_id,tenant_id,amount,principal_component,interest_component,method,ref)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [loanId, tenantId, amt, payPrincipal, payInterest, method, ref || null]
    );
    repaymentId = ins[0].id;
  } catch (e) {
    if (e.code === "23505") return { duplicate: true }; // same ref already applied → idempotent
    throw e;
  }
  const closing = newOutstanding <= 0;
  await q(tenantId,"UPDATE loans SET outstanding_principal=$2, status=$3 WHERE id=$1",
    [loanId, newOutstanding, closing ? "closed" : "active"]);

  // Mark installments paid greedily by cumulative amount paid.
  const { rows: paidAgg } = await q(tenantId,"SELECT COALESCE(SUM(amount),0) AS p FROM loan_repayments WHERE loan_id=$1", [loanId]);
  let cum = 0; const cumPaid = n(paidAgg[0].p);
  for (const s of sch) {
    cum = r2(cum + n(s.total_due));
    const status = cumPaid >= cum ? "paid" : (cumPaid > r2(cum - n(s.total_due)) ? "partial" : "due");
    await q(tenantId,"UPDATE loan_schedule SET status=$2, paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END WHERE id=$1", [s.id, status]);
  }
  const voucherId = await postRepayment(tenantId, actorId, loan, payPrincipal, payInterest, repaymentId);
  if (voucherId) await q(tenantId,"UPDATE loan_repayments SET gl_voucher_id=$2 WHERE tenant_id=$1 AND id=$3", [tenantId, voucherId, repaymentId]); // key on the just-inserted row id — ref can be NULL for >1 manual repayment
  return { applied: amt, principal: payPrincipal, interest: payInterest, outstanding: newOutstanding, closed: closing, glPosted: !!voucherId };
}

// Financeable invoices: issued-and-unpaid invoices (status 'sent') that don't already back
// a live advance/offer, each with an indicative advance (advance_rate × face, capped at the
// underwriting limit). Real data on the tenant's own AR — the frontend "advance this invoice"
// picker calls this. invoices is not RLS'd → explicit tenant filter; loans/offers are RLS'd.
async function financeableInvoices(tenantId, { advanceRate = 0.8 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, invoice_number, customer_name, total_amount, due_date
       FROM invoices WHERE tenant_id=$1 AND status='sent'
       ORDER BY due_date NULLS LAST, created_at DESC LIMIT 100`, [tenantId]
  );
  if (!rows.length) return [];
  const { rows: taken } = await q(tenantId,
    `SELECT source_invoice_id AS id FROM loans WHERE tenant_id=$1 AND source_invoice_id IS NOT NULL AND status='active'
     UNION
     SELECT source_invoice_id AS id FROM loan_offers WHERE tenant_id=$1 AND source_invoice_id IS NOT NULL AND status='offered'`,
    [tenantId]
  );
  const takenSet = new Set(taken.map((t) => t.id));
  const cap = n((await eligibility(tenantId)).limit);
  return rows
    .filter((r) => !takenSet.has(r.id))
    .map((r) => {
      const face = n(r.total_amount);
      let advance = r2(advanceRate * face);
      if (cap > 0) advance = Math.min(advance, cap);
      return { id: r.id, invoice_number: r.invoice_number, customer_name: r.customer_name, total_amount: face, due_date: r.due_date, indicative_advance: r2(advance) };
    });
}

// Invoice-financing wedge: when the source invoice is paid, auto-recover the loan. Called
// from BOTH the Razorpay webhook and the manual mark-paid path. The recovery repayment uses
// a STABLE per-invoice ref so recordRepayment's unique-ref (uq_loan_repayments_ref) dedup
// collapses any double-fire — same path retried, webhook + manual, or a concurrent race —
// to a single repayment. (Caller-supplied ref is intentionally ignored for this reason.)
async function onInvoicePaid(tenantId, invoiceId) {
  const { rows } = await q(tenantId,
    "SELECT * FROM loans WHERE tenant_id=$1 AND source_invoice_id=$2 AND status='active' LIMIT 1", [tenantId, invoiceId]
  );
  if (!rows[0]) return { matched: false };
  const loan = rows[0];
  const { rows: sch } = await q(tenantId,"SELECT COALESCE(SUM(interest_due),0) AS i FROM loan_schedule WHERE loan_id=$1", [loan.id]);
  const { rows: prev } = await q(tenantId,"SELECT COALESCE(SUM(interest_component),0) AS i, COALESCE(SUM(principal_component),0) AS p FROM loan_repayments WHERE loan_id=$1", [loan.id]);
  const due = r2(n(loan.outstanding_principal) + Math.max(0, n(sch[0].i) - n(prev[0].i)));
  const res = await recordRepayment(tenantId, loan.id, { amount: due, method: "auto_invoice", ref: `inv_recover_${invoiceId}` });
  return { matched: true, loanId: loan.id, ...res };
}

// ── GL helpers (SMB-side; best-effort; null when the chart isn't seeded) ─────────
async function ledgerByName(t, name) {
  const { rows } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) AND is_active=true LIMIT 1", [t, name]).catch(() => ({ rows: [] }));
  return rows[0]?.id || null;
}
async function firstBankLedger(t) {
  const { rows } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND is_bank=true AND is_active=true LIMIT 1", [t]).catch(() => ({ rows: [] }));
  return rows[0]?.id || (await ledgerByName(t, "Bank")) || (await ledgerByName(t, "Cash"));
}
async function ensureByNature(t, name, nature) {
  const existing = await ledgerByName(t, name);
  if (existing) return existing;
  const { rows: g } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND nature=$2 ORDER BY name LIMIT 1", [t, nature]).catch(() => ({ rows: [] }));
  if (!g[0]) return null;
  await pool.query("INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING", [t, name, g[0].id]);
  return ledgerByName(t, name);
}
async function postDisbursal(tenantId, actorId, loan, net) {
  try {
    const bank = await firstBankLedger(tenantId);
    const borrow = await ensureByNature(tenantId, "Borrowings", "LIABILITY");
    if (!bank || !borrow) return null;
    const res = await postVoucher(tenantId, actorId || null,
      { voucherType: "RECEIPT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Loan disbursal ${loan.id}`, source: "lending" },
      [{ ledgerId: bank, debit: n(net), credit: 0 }, { ledgerId: borrow, debit: 0, credit: n(net) }],
      { idempotencyKey: `loan_disburse_${loan.id}` });
    return res.voucherId || null;
  } catch (e) { console.warn("[lending] disbursal GL skipped:", e.message); return null; }
}
async function postRepayment(tenantId, actorId, loan, principal, interest, repaymentId) {
  try {
    const bank = await firstBankLedger(tenantId);
    const borrow = await ledgerByName(tenantId, "Borrowings");
    const intExp = await ensureByNature(tenantId, "Interest Expense", "EXPENSE");
    if (!bank || !borrow) return null;
    const entries = [];
    if (principal > 0) entries.push({ ledgerId: borrow, debit: n(principal), credit: 0 });
    if (interest > 0 && intExp) entries.push({ ledgerId: intExp, debit: n(interest), credit: 0 });
    const total = n(principal) + (intExp ? n(interest) : 0);
    if (!(total > 0)) return null;
    entries.push({ ledgerId: bank, debit: 0, credit: r2(total) });
    const res = await postVoucher(tenantId, actorId || null,
      { voucherType: "PAYMENT", voucherDate: new Date().toISOString().slice(0, 10), narration: `Loan repayment ${loan.id}`, source: "lending" },
      entries, { idempotencyKey: `loan_repay_${repaymentId || loan.id}` }); // STABLE business key (the repayment row id), never a timestamp — so postVoucher itself dedupes retries
    return res.voucherId || null;
  } catch (e) { console.warn("[lending] repayment GL skipped:", e.message); return null; }
}

module.exports = {
  LendError, eligibility,
  createOffer, createOffersBulk, listOffers, getOffer, acceptOffer, acceptOffersBulk, declineOffer,
  getLoan, listLoans, recordRepayment, onInvoicePaid, financeableInvoices,
  amortize, bullet, buildKFS, dpdBucket, // pure helpers exported for tests
  ledgerByName, firstBankLedger, ensureByNature, // GL helpers reused by servicing.js
};
