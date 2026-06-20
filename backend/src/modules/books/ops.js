// §M8 — expense capture, projects + time tracking, attachments.
const { pool } = require("../../db");
const { toDb, toRupees } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");

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

module.exports = { createExpense, createProject, logTime, billableSummary, addAttachment, listAttachments, setPeriodStatus, listPeriods, readAuditLog, setOpeningBalances };
