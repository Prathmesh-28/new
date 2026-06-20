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

module.exports = { createExpense, createProject, logTime, billableSummary, addAttachment, listAttachments };
