"use strict";
// Statutory compliance register (roadmap #21 — promote the compliance calendar from the KV bag
// to a real table so it's queryable, reportable, automatable and agent-readable). Tracks filings,
// board meetings, resolutions and registers with a pending → done workflow; completing a recurring
// item spawns the next occurrence (frequency rolled forward).
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const KINDS = ["filing", "meeting", "resolution", "register", "payment", "other"];
const FREQ = ["one_time", "monthly", "quarterly", "annual"];
const rollMonths = { monthly: 1, quarterly: 3, annual: 12 };

function decorate(row) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(row.due_date); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  const state = row.status === "done" ? "done" : days < 0 ? "overdue" : days <= 7 ? "due_soon" : "upcoming";
  return { ...row, days_to_due: days, state };
}

function addMonthsIso(dateStr, m) {
  const d = new Date(dateStr); d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

async function createComplianceItem(tenantId, actorId, e = {}) {
  const kind = KINDS.includes(e.kind) ? e.kind : "other";
  const frequency = FREQ.includes(e.frequency) ? e.frequency : "one_time";
  if (!e.title || !e.dueDate) throw new PostError("BAD_INPUT", "title and dueDate required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_compliance_items(tenant_id,kind,title,authority,due_date,frequency,notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, kind, e.title, e.authority || null, e.dueDate, frequency, e.notes || null, actorId || null]);
  return decorate(rows[0]);
}

async function listComplianceItems(tenantId, { status, kind } = {}) {
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (status === "pending" || status === "done") { params.push(status); where += ` AND status=$${params.length}`; }
  if (kind && KINDS.includes(kind)) { params.push(kind); where += ` AND kind=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_compliance_items WHERE ${where} ORDER BY status, due_date`, params);
  return rows.map(decorate);
}

// Mark done. For a recurring item, spawn the next occurrence (due_date rolled forward).
async function completeComplianceItem(tenantId, id, { completedOn, actorId } = {}) {
  const { rows: cur } = await pool.query("SELECT * FROM book_compliance_items WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const it = cur[0];
  if (!it) throw new PostError("NOT_FOUND", "Item not found", 404);
  if (it.status === "done") throw new PostError("BAD_STATE", "Already completed", 409);
  const done = completedOn || new Date().toISOString().slice(0, 10);
  await pool.query("UPDATE book_compliance_items SET status='done', completed_on=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, id, done]);
  let next = null;
  if (it.frequency !== "one_time" && rollMonths[it.frequency]) {
    const nextDue = addMonthsIso(it.due_date, rollMonths[it.frequency]);
    const { rows } = await pool.query(
      `INSERT INTO book_compliance_items(tenant_id,kind,title,authority,due_date,frequency,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, it.kind, it.title, it.authority, nextDue, it.frequency, it.notes, actorId || it.created_by]);
    next = decorate(rows[0]);
  }
  return { completed: true, next };
}

async function removeComplianceItem(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_compliance_items WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Item not found", 404);
  return { removed: true };
}

// Pending items due within `withinDays` (or overdue) — the compliance work-list.
async function dueSoon(tenantId, withinDays = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM book_compliance_items WHERE tenant_id=$1 AND status='pending' AND due_date <= (CURRENT_DATE + ($2||' days')::interval) ORDER BY due_date`,
    [tenantId, Math.max(0, Math.round(withinDays))]);
  return rows.map(decorate);
}

module.exports = { KINDS, FREQ, createComplianceItem, listComplianceItems, completeComplianceItem, removeComplianceItem, dueSoon, decorate };
