// §M8 - expense capture, projects + time tracking, attachments.
const { pool } = require("../../db");
const { money, toDb, toRupees, gt } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

// Resolve a posting ledger by name, creating it under the first group of `nature` if absent.
async function ensureLedger(tenantId, name, nature) {
  const existing = await ledgerIdByName(tenantId, name);
  if (existing) return existing;
  const { rows: g } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND nature=$2 ORDER BY name LIMIT 1", [tenantId, nature]).catch(() => ({ rows: [] }));
  if (!g[0]) return null;
  await pool.query("INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING", [tenantId, name, g[0].id]);
  return ledgerIdByName(tenantId, name);
}

// Expense → a PAYMENT voucher (Dr Expense category / Cr Bank/Cash), tagged billable.
async function createExpense(tenantId, actorId, e) {
  if (!e.categoryLedgerId || e.amount == null || !e.date || !e.paidFromLedgerId) throw new PostError("BAD_INPUT", "categoryLedgerId, amount, date, paidFromLedgerId required", 400);
  const tags = e.billable ? { billable: "yes", customer: e.customerLedgerId || "" } : undefined;
  const r = await postVoucher(tenantId, actorId, { voucherType: "PAYMENT", voucherDate: e.date, narration: e.note || "Expense", source: "manual" },
    [{ ledgerId: e.categoryLedgerId, debit: toDb(e.amount), credit: "0", tags }, { ledgerId: e.paidFromLedgerId, debit: "0", credit: toDb(e.amount) }]);
  const { rows } = await pool.query(
    "INSERT INTO book_expenses(tenant_id,exp_date,category_ledger_id,amount,paid_from_ledger_id,billable,customer_ledger_id,voucher_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [tenantId, e.date, e.categoryLedgerId, toDb(e.amount), e.paidFromLedgerId, !!e.billable, e.customerLedgerId || null, r.voucherId, e.note || null]
  );
  return { ...rows[0], voucher: r };
}

// ── Employee expense advances ────────────────────────────────────────────────
// Grant: Dr Employee Advances (asset) / Cr Bank/Cash. Records an OPEN advance.
async function grantAdvance(tenantId, actorId, a) {
  if (!a.person || a.amount == null || !a.date || !a.paidFromLedgerId) throw new PostError("BAD_INPUT", "person, amount, date, paidFromLedgerId required", 400);
  if (!gt(money(a.amount), 0)) throw new PostError("BAD_INPUT", "amount must be > 0", 400);
  const advLedger = await ensureLedger(tenantId, "Employee Advances", "ASSET");
  if (!advLedger) throw new PostError("NOT_SEEDED", "Could not resolve an 'Employee Advances' asset ledger - seed the chart first", 422);
  const r = await postVoucher(tenantId, actorId,
    { voucherType: "PAYMENT", voucherDate: a.date, narration: a.purpose ? `Advance to ${a.person} - ${a.purpose}` : `Advance to ${a.person}`, source: "manual" },
    [{ ledgerId: advLedger, debit: toDb(a.amount), credit: "0" }, { ledgerId: a.paidFromLedgerId, debit: "0", credit: toDb(a.amount) }]);
  const { rows } = await pool.query(
    "INSERT INTO book_expense_advances(tenant_id,person,purpose,amount,advance_voucher_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [tenantId, a.person, a.purpose || null, toDb(a.amount), r.voucherId, actorId || null]);
  return { ...rows[0], voucher: r };
}

// Settle an open advance against an actual expense report. One balanced voucher:
//   Dr each expense category (total E)                         [the real spend]
//   Cr Employee Advances (A)                                   [clear the advance]
//   + if E<A: Dr Bank (A−E) refund      | if E>A: Cr Bank (E−A) reimburse
async function settleAdvance(tenantId, actorId, { advanceId, date, expenses, settleToLedgerId }) {
  if (!advanceId || !date || !Array.isArray(expenses) || !expenses.length) throw new PostError("BAD_INPUT", "advanceId, date, expenses[] required", 400);
  const { rows: ar } = await pool.query("SELECT * FROM book_expense_advances WHERE tenant_id=$1 AND id=$2", [tenantId, advanceId]);
  const adv = ar[0];
  if (!adv) throw new PostError("NOT_FOUND", "Advance not found", 404);
  if (adv.status !== "open") throw new PostError("BAD_STATE", `Advance is ${adv.status}`, 409);

  const A = money(adv.amount);
  let E = money(0);
  const legs = [];
  for (const x of expenses) {
    if (!x.categoryLedgerId || x.amount == null || !gt(money(x.amount), 0)) throw new PostError("BAD_INPUT", "each expense needs categoryLedgerId + amount>0", 400);
    E = E.plus(money(x.amount));
    legs.push({ ledgerId: x.categoryLedgerId, debit: toDb(x.amount), credit: "0", tags: x.note ? { note: x.note } : undefined });
  }
  const advLedger = await ensureLedger(tenantId, "Employee Advances", "ASSET");
  if (!advLedger) throw new PostError("NOT_SEEDED", "'Employee Advances' ledger missing", 422);
  legs.push({ ledgerId: advLedger, debit: "0", credit: toDb(A) }); // clear the whole advance

  const diff = A.minus(E); // +ve → employee refunds cash; −ve → reimburse employee
  let refund = money(0), reimburse = money(0);
  if (!diff.isZero()) {
    const bankId = settleToLedgerId || (await ledgerIdByName(tenantId, "Cash")) || (await ledgerIdByName(tenantId, "Bank"));
    if (!bankId) throw new PostError("BAD_INPUT", "settleToLedgerId required (no Cash/Bank ledger to route the refund/reimbursement)", 400);
    if (gt(diff, 0)) { refund = diff; legs.push({ ledgerId: bankId, debit: toDb(diff), credit: "0" }); }       // cash back in
    else { reimburse = diff.abs(); legs.push({ ledgerId: bankId, debit: "0", credit: toDb(diff.abs()) }); }     // pay the excess
  }

  const r = await postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: date, narration: `Advance settlement - ${adv.person}`, source: "manual" }, legs,
    { idempotencyKey: `adv_settle:${advanceId}` });
  await pool.query(
    "UPDATE book_expense_advances SET status='settled', settled_amount=$2, refund_amount=$3, reimburse_amount=$4, settle_voucher_id=$5, settled_at=now() WHERE tenant_id=$1 AND id=$6",
    [tenantId, toDb(E), toDb(refund), toDb(reimburse), r.voucherId, advanceId]);
  return { advanceId, expenses: toDb(E), refund: toDb(refund), reimburse: toDb(reimburse), voucher: r };
}

async function listAdvances(tenantId, status) {
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (status === "open" || status === "settled") { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_expense_advances WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows.map((r) => ({ ...r, amount: toRupees(r.amount), settled_amount: toRupees(r.settled_amount), refund_amount: toRupees(r.refund_amount), reimburse_amount: toRupees(r.reimburse_amount) }));
}

async function createProject(tenantId, p) {
  if (!p.name) throw new PostError("BAD_INPUT", "name required", 400);
  const { rows } = await pool.query("INSERT INTO book_projects(tenant_id,name,customer_ledger_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING RETURNING *", [tenantId, p.name, p.customerLedgerId || null]);
  return rows[0] || (await pool.query("SELECT * FROM book_projects WHERE tenant_id=$1 AND name=$2", [tenantId, p.name])).rows[0];
}
async function logTime(tenantId, actorId, t) {
  if (!t.projectId || t.hours == null || !t.date) throw new PostError("BAD_INPUT", "projectId, hours, date required", 400);
  const { rows } = await pool.query("INSERT INTO book_timesheets(tenant_id,project_id,work_date,hours,rate,billable,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [tenantId, t.projectId, t.date, t.hours, toDb(t.rate || 0), t.billable !== false, t.note || null, actorId || null]);
  return rows[0];
}
async function billableSummary(tenantId, projectId) {
  const { rows } = await pool.query("SELECT COALESCE(SUM(hours),0) AS hours, COALESCE(SUM(hours*rate),0) AS amount FROM book_timesheets WHERE tenant_id=$1 AND project_id=$2 AND billable=true AND invoiced_voucher_id IS NULL", [tenantId, projectId]);
  return { projectId, unbilledHours: rows[0].hours, unbilledAmount: toRupees(rows[0].amount) };
}

async function addAttachment(tenantId, actorId, a) {
  if (!a.entityType || !a.entityId || !a.filename) throw new PostError("BAD_INPUT", "entityType, entityId, filename required", 400);
  const { rows } = await pool.query("INSERT INTO book_attachments(tenant_id,entity_type,entity_id,filename,url,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [tenantId, a.entityType, a.entityId, a.filename, a.url || null, actorId || null]);
  return rows[0];
}
async function listAttachments(tenantId, entityType, entityId) {
  const { rows } = await pool.query("SELECT * FROM book_attachments WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 ORDER BY created_at", [tenantId, entityType, entityId]);
  return rows;
}

// ── Period lock / close (the WRITE side; posting-engine already enforces the read) ──
async function setPeriodStatus(tenantId, actorId, fy, month, status) {
  if (!["OPEN", "LOCKED", "CLOSED"].includes(status)) throw new PostError("BAD_INPUT", "status must be OPEN/LOCKED/CLOSED", 400);
  if (!fy || month == null) throw new PostError("BAD_INPUT", "financial_year and period_month required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_periods(tenant_id,financial_year,period_month,status,locked_by,locked_at)
       VALUES($1,$2,$3,$4,$5, CASE WHEN $4='OPEN' THEN NULL ELSE now() END)
     ON CONFLICT(tenant_id,financial_year,period_month)
       DO UPDATE SET status=EXCLUDED.status, locked_by=$5,
                     locked_at = CASE WHEN $4='OPEN' THEN NULL ELSE now() END
     RETURNING *`,
    [tenantId, fy, month, status, actorId || null]
  );
  return rows[0];
}
async function listPeriods(tenantId, fy) {
  const { rows } = await pool.query("SELECT * FROM book_periods WHERE tenant_id=$1 AND financial_year=$2 ORDER BY period_month", [tenantId, fy]);
  return rows;
}

// ── Audit-log viewer (book_audit_log was write-only) ─────────────────────────
async function readAuditLog(tenantId, { entity, entityId, limit } = {}) {
  const params = [tenantId];
  let where = "a.tenant_id=$1";
  if (entity)   { params.push(entity);   where += ` AND a.entity=$${params.length}`; }
  if (entityId) { params.push(entityId); where += ` AND a.entity_id=$${params.length}`; }
  params.push(Math.min(Number(limit) || 200, 1000));
  const { rows } = await pool.query(
    `SELECT a.id, a.actor_id, u.email AS actor_email, a.action, a.entity, a.entity_id, a.detail, a.created_at
       FROM book_audit_log a LEFT JOIN users u ON u.id=a.actor_id
      WHERE ${where} ORDER BY a.id DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

// ── Editable / bulk opening balances (was settable only at ledger creation) ───
async function setOpeningBalances(tenantId, entries) {
  if (!Array.isArray(entries) || !entries.length) throw new PostError("BAD_INPUT", "entries[] required", 400);
  const updated = [];
  for (const e of entries) {
    if (!e.ledgerId) continue;
    const { rows } = await pool.query(
      `UPDATE book_ledgers SET opening_balance=$3, opening_is_debit=$4
         WHERE tenant_id=$1 AND id=$2 RETURNING id,name,opening_balance,opening_is_debit`,
      [tenantId, e.ledgerId, toDb(e.openingBalance ?? e.opening_balance ?? 0), (e.openingIsDebit ?? e.opening_is_debit) !== false]
    );
    if (rows[0]) updated.push(rows[0]);
  }
  // A balanced opening trial balance should net to ~0 (debit openings − credit openings).
  const openingNet = updated.reduce((s, r) => s + (r.opening_is_debit ? Number(r.opening_balance) : -Number(r.opening_balance)), 0);
  return { updated, openingNet, balanced: Math.abs(openingNet) < 0.005 };
}

module.exports = { createExpense, grantAdvance, settleAdvance, listAdvances, createProject, logTime, billableSummary, addAttachment, listAttachments, setPeriodStatus, listPeriods, readAuditLog, setOpeningBalances };
