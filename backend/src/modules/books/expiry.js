"use strict";
// Renewals / expiry registry (roadmap #178 licenses, #183 DSC, #195 AMC + agreements/insurance).
// A single engine: track anything with an expiry date, compute days-to-expiry + status, and
// surface the "renewals due" list for reminders. Pure CRUD over a non-RLS book_ table.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");

const KINDS = ["license", "dsc", "amc", "agreement", "registration", "insurance", "other"];

function decorate(row) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(row.expires_on); exp.setHours(0, 0, 0, 0);
  const days = Math.round((exp - today) / 86400000);
  const expiry = row.status !== "active" ? row.status : days < 0 ? "expired" : days <= (row.reminder_days || 30) ? "due" : "ok";
  return { ...row, amount: row.amount == null ? null : Number(row.amount), days_to_expiry: days, expiry_status: expiry };
}

async function createExpiryItem(tenantId, actorId, e = {}) {
  const kind = KINDS.includes(e.kind) ? e.kind : "other";
  if (!e.name || !e.expiresOn) throw new PostError("BAD_INPUT", "name and expiresOn required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_expiry_items(tenant_id,kind,name,identifier,counterparty,amount,issued_on,expires_on,reminder_days,notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, kind, e.name, e.identifier || null, e.counterparty || null, e.amount != null ? e.amount : null,
      e.issuedOn || null, e.expiresOn, e.reminderDays != null ? Math.max(0, Math.round(e.reminderDays)) : 30, e.notes || null, actorId || null]);
  return decorate(rows[0]);
}

async function listExpiryItems(tenantId, { kind, status } = {}) {
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (kind && KINDS.includes(kind)) { params.push(kind); where += ` AND kind=$${params.length}`; }
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_expiry_items WHERE ${where} ORDER BY expires_on`, params);
  return rows.map(decorate);
}

// Renew: close the current item as 'renewed' and open a fresh active one carrying the details
// forward with the new expiry (keeps renewal history).
async function renewExpiryItem(tenantId, id, { newExpiresOn, amount, issuedOn } = {}) {
  if (!newExpiresOn) throw new PostError("BAD_INPUT", "newExpiresOn required", 400);
  const { rows: cur } = await pool.query("SELECT * FROM book_expiry_items WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const it = cur[0];
  if (!it) throw new PostError("NOT_FOUND", "Item not found", 404);
  if (it.status !== "active") throw new PostError("BAD_STATE", `Item is ${it.status}`, 409);
  await pool.query("UPDATE book_expiry_items SET status='renewed' WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const { rows } = await pool.query(
    `INSERT INTO book_expiry_items(tenant_id,kind,name,identifier,counterparty,amount,issued_on,expires_on,reminder_days,notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [tenantId, it.kind, it.name, it.identifier, it.counterparty, amount != null ? amount : it.amount,
      issuedOn || it.expires_on, newExpiresOn, it.reminder_days, it.notes, it.created_by]);
  return decorate(rows[0]);
}

async function removeExpiryItem(tenantId, id) {
  const { rowCount } = await pool.query("UPDATE book_expiry_items SET status='cancelled' WHERE tenant_id=$1 AND id=$2 AND status='active'", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Active item not found", 404);
  return { cancelled: true };
}

// Renewals due: active items expiring within `withinDays` (or already expired), soonest first.
async function dueSoon(tenantId, withinDays = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM book_expiry_items WHERE tenant_id=$1 AND status='active' AND expires_on <= (CURRENT_DATE + ($2||' days')::interval)
      ORDER BY expires_on`, [tenantId, Math.max(0, Math.round(withinDays))]);
  return rows.map(decorate);
}

module.exports = { KINDS, createExpiryItem, listExpiryItems, renewExpiryItem, removeExpiryItem, dueSoon, decorate };
