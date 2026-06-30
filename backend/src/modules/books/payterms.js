// §M-PAY - PAYMENT TERMS & SCHEDULES + AUTO-RECONCILIATION.
//
// Three layers, all sitting on top of the already-posted ledger:
//
//   1. Payment-term TEMPLATES (book_payment_terms): a reusable named split such
//      as "50/50" or "Net 30" - installments[] = [{pct, dueDays, basis}], where
//      basis ∈ {days | month_end | months_after_month_end}. Modelled on ERPNext's
//      Payment Terms Template (frappe/erpnext accounts/doctype/payment_terms_template):
//      each term carries a portion (pct) and a due-date rule relative to the
//      invoice date.
//
//   2. SCHEDULES (book_payment_schedule): expanding a template against one invoice
//      voucher produces dated installment rows (amount + due_date), which power
//      "what is due when" and overdue flags.
//
//   3. AUTO-RECONCILIATION: FIFO-allocate a party's unapplied credit
//      (advances / over-payments / credit-notes that have unconsumed party-side
//      movement) against its oldest open invoices, by writing book_allocations
//      rows. We reuse billwise.allocateBill's exact validation shape - same party,
//      never over a bill's outstanding, never over a source's available - but
//      drive the matching FIFO instead of one explicit pair at a time.
//
// CommonJS. Money strictly through ./money (decimal.js); never JS-number math.
const { pool } = require("../../db");
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

// ── date helpers (pure) ─────────────────────────────────────────────────────
// All work on 'YYYY-MM-DD' strings in UTC to avoid TZ drift.
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function parseYmd(s) {
  if (!s) throw new PostError("BAD_INPUT", "invoiceDate required", 400);
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new PostError("BAD_INPUT", `invalid date ${s}`, 400);
  return d;
}
function addDays(d, n) {
  return new Date(d.getTime() + Number(n || 0) * 86400000);
}
// last calendar day of the month that is `monthsAhead` months after `d`'s month.
function endOfMonth(d, monthsAhead = 0) {
  // day 0 of (month+monthsAhead+1) === last day of (month+monthsAhead).
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(monthsAhead || 0) + 1, 0));
}

// Compute one installment's due date from the invoice date + a basis rule. Pure.
function dueDateFor(invoiceDate, { dueDays = 0, basis = "days" } = {}) {
  const d = invoiceDate instanceof Date ? invoiceDate : parseYmd(invoiceDate);
  switch (basis) {
    case "days":
      return ymd(addDays(d, dueDays));
    case "month_end":
      // end of the invoice's own month, then shifted by dueDays.
      return ymd(addDays(endOfMonth(d, 0), dueDays));
    case "months_after_month_end":
      // end of the month dueDays-months after the invoice month (dueDays = #months).
      return ymd(endOfMonth(d, dueDays));
    default:
      throw new PostError("BAD_BASIS", `unknown basis ${basis}`, 422);
  }
}

// Validate an installments[] template (pcts sum ~100, each basis known). Pure.
function validateInstallments(installments) {
  if (!Array.isArray(installments) || installments.length === 0) {
    throw new PostError("BAD_INPUT", "installments[] required", 422);
  }
  let total = money(0);
  for (const it of installments) {
    const pct = money(it && it.pct);
    if (!pct.greaterThan(0)) throw new PostError("BAD_INSTALLMENT", "each installment pct must be > 0", 422);
    const basis = (it && it.basis) || "days";
    if (!["days", "month_end", "months_after_month_end"].includes(basis)) {
      throw new PostError("BAD_BASIS", `unknown basis ${basis}`, 422);
    }
    total = total.plus(pct);
  }
  // ~100 within a 0.01 tolerance for rounding-friendly splits (e.g. 33.33×3).
  if (total.minus(100).abs().greaterThan(money("0.01"))) {
    throw new PostError("BAD_PCT_SUM", `installment pcts must sum to ~100 (got ${total.toString()})`, 422);
  }
  return installments.map((it) => ({
    pct: money(it.pct).toString(),
    dueDays: Number(it.dueDays || 0),
    basis: it.basis || "days",
  }));
}

// (1a) Persist a named template.
async function savePaymentTerms(tenantId, { name, installments } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!name || !String(name).trim()) throw new PostError("BAD_INPUT", "name required", 422);
  const clean = validateInstallments(installments);
  const { rows } = await pool.query(
    `INSERT INTO book_payment_terms(tenant_id, name, installments)
     VALUES($1,$2,$3::jsonb)
     ON CONFLICT (tenant_id, name)
     DO UPDATE SET installments = EXCLUDED.installments
     RETURNING id, name, installments`,
    [tenantId, String(name).trim(), JSON.stringify(clean)]
  );
  return rows[0];
}

// (1b) List templates for a tenant.
async function listPaymentTerms(tenantId) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  const { rows } = await pool.query(
    `SELECT id, name, installments
       FROM book_payment_terms
      WHERE tenant_id=$1
      ORDER BY name ASC`,
    [tenantId]
  );
  return rows;
}

// Resolve the installments to expand: an explicit array wins, else load by name.
async function resolveInstallments(tenantId, { templateName, installments }) {
  if (installments) return validateInstallments(installments);
  if (templateName) {
    const { rows } = await pool.query(
      `SELECT installments FROM book_payment_terms WHERE tenant_id=$1 AND name=$2`,
      [tenantId, templateName]
    );
    if (!rows.length) throw new PostError("NOT_FOUND", `payment term '${templateName}' not found`, 404);
    return validateInstallments(rows[0].installments);
  }
  throw new PostError("BAD_INPUT", "templateName or installments required", 422);
}

// (2) Expand a template against one invoice into dated schedule rows. The last
// installment absorbs the rounding residue so Σ(amount) === total exactly.
async function buildSchedule(tenantId, { voucherId, total, invoiceDate, templateName, installments } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!voucherId) throw new PostError("BAD_INPUT", "voucherId required", 422);
  const gross = money(total);
  if (!gross.greaterThan(0)) throw new PostError("BAD_AMOUNT", "total must be positive", 422);
  const inv = parseYmd(invoiceDate);
  const terms = await resolveInstallments(tenantId, { templateName, installments });

  // pure amount split: round each to 2dp, give residue to the last line.
  const rows = [];
  let running = money(0);
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const isLast = i === terms.length - 1;
    let amount = isLast ? gross.minus(running) : money(gross.times(money(t.pct)).dividedBy(100).toFixed(2));
    running = running.plus(amount);
    rows.push({
      installment: i + 1,
      dueDate: dueDateFor(inv, t),
      amount: toRupees(amount),
      amountDb: toDb(amount),
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // idempotent rebuild: drop any prior schedule for this voucher first.
    await client.query(`DELETE FROM book_payment_schedule WHERE tenant_id=$1 AND voucher_id=$2`, [tenantId, voucherId]);
    for (const r of rows) {
      await client.query(
        `INSERT INTO book_payment_schedule(tenant_id, voucher_id, installment, due_date, amount, paid_amount, status)
         VALUES($1,$2,$3,$4,$5,0,'pending')`,
        [tenantId, voucherId, r.installment, r.dueDate, r.amountDb]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return scheduleStatus(tenantId, voucherId);
}

// (3) The invoice's installments with paid/pending + overdue flag.
async function scheduleStatus(tenantId, voucherId) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!voucherId) throw new PostError("BAD_INPUT", "voucherId required", 422);
  const { rows } = await pool.query(
    `SELECT installment, due_date, amount, paid_amount, status
       FROM book_payment_schedule
      WHERE tenant_id=$1 AND voucher_id=$2
      ORDER BY installment ASC`,
    [tenantId, voucherId]
  );
  const today = ymd(new Date());
  const out = [];
  let totAmt = money(0);
  let totPaid = money(0);
  for (const r of rows) {
    const amount = money(r.amount);
    const paid = money(r.paid_amount);
    const pending = amount.minus(paid);
    const fullyPaid = !pending.greaterThan(0);
    const due = String(r.due_date).slice(0, 10);
    const overdue = due < today && !fullyPaid;
    totAmt = totAmt.plus(amount);
    totPaid = totPaid.plus(paid);
    out.push({
      installment: r.installment,
      dueDate: due,
      amount: toRupees(amount),
      paidAmount: toRupees(paid),
      pending: toRupees(pending),
      status: fullyPaid ? "paid" : r.status || "pending",
      overdue,
    });
  }
  return {
    voucherId,
    installments: out,
    totalAmount: toRupees(totAmt),
    totalPaid: toRupees(totPaid),
    totalPending: toRupees(totAmt.minus(totPaid)),
  };
}

// ── §4 PAYMENT RECONCILIATION ────────────────────────────────────────────────
// gross side per bill type (mirrors billwise.grossSideExpr): SALES = party DEBIT
// (receivable), PURCHASE = party CREDIT (payable).
function grossSideExpr(alias) {
  return `CASE WHEN ${alias}.voucher_type='SALES'
               THEN COALESCE((SELECT SUM(e.debit)  FROM book_voucher_entries e WHERE e.voucher_id=${alias}.id AND e.ledger_id=${alias}.party_ledger_id),0)
               ELSE COALESCE((SELECT SUM(e.credit) FROM book_voucher_entries e WHERE e.voucher_id=${alias}.id AND e.ledger_id=${alias}.party_ledger_id),0)
          END`;
}

// A "credit" source for a party is a voucher whose party-side movement OPPOSES the
// bills it can settle: for receivables (SALES) the credit carries a party CREDIT
// (RECEIPT advance / CREDIT_NOTE); for payables (PURCHASE) it carries a party DEBIT
// (PAYMENT advance / DEBIT_NOTE). Unapplied = that movement − Σ allocations already
// sourced from it. We surface BOTH directions and let the caller/FIFO decide.
async function unappliedForParty(tenantId, partyLedgerId) {
  if (!tenantId || !partyLedgerId) throw new PostError("BAD_INPUT", "tenantId and partyLedgerId required", 400);

  // open invoices/bills for the party, oldest first (same shape as billwise.openBills).
  const { rows: bills } = await pool.query(
    `SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date,
            ${grossSideExpr("v")} AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.party_ledger_id=$2
        AND v.voucher_type IN ('SALES','PURCHASE') AND v.is_cancelled=false
      ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
    [tenantId, partyLedgerId]
  );
  const openInvoices = [];
  for (const r of bills) {
    const outstanding = money(r.gross).minus(money(r.allocated));
    if (!outstanding.greaterThan(0)) continue;
    openInvoices.push({
      voucherId: r.id,
      voucherType: r.voucher_type,
      number: r.voucher_number,
      date: r.voucher_date,
      gross: toRupees(money(r.gross)),
      allocated: toRupees(money(r.allocated)),
      outstanding: toRupees(outstanding),
    });
  }

  // unapplied credit sources: payments / advances / credit-/debit-notes whose
  // party-side movement is not yet fully consumed by book_allocations.
  const { rows: srcs } = await pool.query(
    `SELECT v.id, v.voucher_type, v.voucher_number, v.voucher_date,
            COALESCE((SELECT SUM(e.debit)  FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS party_debit,
            COALESCE((SELECT SUM(e.credit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS party_credit,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.source_voucher_id=v.id),0) AS applied
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.party_ledger_id=$2
        AND v.voucher_type IN ('RECEIPT','PAYMENT','CREDIT_NOTE','DEBIT_NOTE') AND v.is_cancelled=false
      ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
    [tenantId, partyLedgerId]
  );
  const unapplied = [];
  for (const r of srcs) {
    const credit = money(r.party_credit); // settles SALES receivables
    const debit = money(r.party_debit); // settles PURCHASE payables
    // capacity is whichever side this source actually carries.
    const capacity = credit.greaterThan(0) ? credit : debit;
    const settles = credit.greaterThan(0) ? "SALES" : "PURCHASE";
    const available = capacity.minus(money(r.applied));
    if (!available.greaterThan(0)) continue;
    unapplied.push({
      voucherId: r.id,
      voucherType: r.voucher_type,
      number: r.voucher_number,
      date: r.voucher_date,
      settles, // which bill type this credit can offset
      capacity: toRupees(capacity),
      applied: toRupees(money(r.applied)),
      available: toRupees(available),
    });
  }

  return { partyLedgerId, unapplied, openInvoices };
}

// FIFO-apply a party's unapplied credit against its oldest open invoices, writing
// book_allocations rows. Same validation invariants as billwise.allocateBill
// (same party, target outstanding > 0, never over outstanding, never over source
// available), but matched automatically inside one serialized transaction.
async function autoApply(tenantId, actorId, { partyLedgerId } = {}) {
  if (!tenantId) throw new PostError("BAD_INPUT", "tenantId required", 400);
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 422);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock every SALES/PURCHASE/source voucher for this party so concurrent
    // auto-applies cannot both consume the same headroom.
    await client.query(
      `SELECT id FROM book_vouchers
        WHERE tenant_id=$1 AND party_ledger_id=$2 AND is_cancelled=false
          AND voucher_type IN ('SALES','PURCHASE','RECEIPT','PAYMENT','CREDIT_NOTE','DEBIT_NOTE')
        FOR UPDATE`,
      [tenantId, partyLedgerId]
    );

    // open bills, oldest first.
    const { rows: bills } = await client.query(
      `SELECT v.id, v.voucher_type, v.voucher_number,
              ${grossSideExpr("v")} AS gross,
              COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
         FROM book_vouchers v
        WHERE v.tenant_id=$1 AND v.party_ledger_id=$2
          AND v.voucher_type IN ('SALES','PURCHASE') AND v.is_cancelled=false
        ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
      [tenantId, partyLedgerId]
    );

    // unapplied credit sources, oldest first.
    const { rows: srcs } = await client.query(
      `SELECT v.id, v.voucher_type, v.voucher_number,
              COALESCE((SELECT SUM(e.debit)  FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS party_debit,
              COALESCE((SELECT SUM(e.credit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS party_credit,
              COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.source_voucher_id=v.id),0) AS applied
         FROM book_vouchers v
        WHERE v.tenant_id=$1 AND v.party_ledger_id=$2
          AND v.voucher_type IN ('RECEIPT','PAYMENT','CREDIT_NOTE','DEBIT_NOTE') AND v.is_cancelled=false
        ORDER BY v.voucher_date ASC, v.voucher_number ASC`,
      [tenantId, partyLedgerId]
    );

    // build mutable working sets keyed by which bill type each side settles.
    const billState = bills.map((b) => ({
      id: b.id,
      voucherType: b.voucher_type,
      number: b.voucher_number,
      outstanding: money(b.gross).minus(money(b.allocated)),
    }));
    const srcState = srcs
      .map((s) => {
        const credit = money(s.party_credit);
        const debit = money(s.party_debit);
        const capacity = credit.greaterThan(0) ? credit : debit;
        return {
          id: s.id,
          voucherType: s.voucher_type,
          number: s.voucher_number,
          settles: credit.greaterThan(0) ? "SALES" : "PURCHASE",
          available: capacity.minus(money(s.applied)),
        };
      })
      .filter((s) => s.available.greaterThan(0));

    const allocated = [];
    // FIFO: walk oldest bills, draining matching sources until the bill is covered.
    for (const bill of billState) {
      if (!bill.outstanding.greaterThan(0)) continue;
      for (const src of srcState) {
        if (!bill.outstanding.greaterThan(0)) break;
        if (src.settles !== bill.voucherType) continue; // a credit only offsets its own bill type
        if (!src.available.greaterThan(0)) continue;
        const amt = bill.outstanding.lessThan(src.available) ? bill.outstanding : src.available;
        if (!amt.greaterThan(0)) continue;
        await client.query(
          `INSERT INTO book_allocations(tenant_id, source_voucher_id, target_voucher_id, amount, created_by)
           VALUES($1,$2,$3,$4,$5)`,
          [tenantId, src.id, bill.id, toDb(amt), actorId || null]
        );
        bill.outstanding = bill.outstanding.minus(amt);
        src.available = src.available.minus(amt);
        allocated.push({
          sourceVoucherId: src.id,
          sourceType: src.voucherType,
          targetVoucherId: bill.id,
          targetType: bill.voucherType,
          targetNumber: bill.number,
          amount: toRupees(amt),
        });
      }
    }

    await client.query("COMMIT");
    const remainingCredit = srcState.reduce((a, s) => a.plus(s.available), money(0));
    return { allocated, remainingCredit: toRupees(remainingCredit) };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  savePaymentTerms,
  listPaymentTerms,
  buildSchedule,
  scheduleStatus,
  unappliedForParty,
  autoApply,
  // pure helpers (exported for testability)
  dueDateFor,
  validateInstallments,
};
