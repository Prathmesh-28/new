"use strict";
// Stamp-duty / franking / notary / e-stamp register — an in-house tracker for the physical &
// e-stamp instruments an SMB buys (agreements, affidavits, leases, bonds). Logs face value, duty
// paid, serial, validity and usage, with the scan linked to the files vault. Live DigiLocker /
// SHCIL e-stamp PROCUREMENT is credential-gated (see lib/digilocker.js / lib/estamp.js when
// provisioned); this register works today with manually-captured instruments. book_* convention:
// gen_random_uuid PK, explicit tenant filter (not RLS'd).
const { pool } = require("../../db");

class StampError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }
const n = (v) => (v == null ? 0 : Number(v));
const FIELDS = ["instrument", "purpose", "counterparty", "stamp_value", "duty_amount", "serial_no", "vendor", "purchased_on", "used_on", "valid_till", "status", "document_ref", "scan_file_id", "notes"];

function decorate(row) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let daysToExpiry = null, state = row.status;
  if (row.valid_till && (row.status === "available")) {
    const d = new Date(row.valid_till); d.setHours(0, 0, 0, 0);
    daysToExpiry = Math.round((d - today) / 86400000);
    if (daysToExpiry < 0) state = "expired";
    else if (daysToExpiry <= 30) state = "expiring";
  }
  return { ...row, stamp_value: n(row.stamp_value), duty_amount: n(row.duty_amount), days_to_expiry: daysToExpiry, state };
}

async function listStamps(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_stamp_register WHERE ${where} ORDER BY purchased_on DESC NULLS LAST, created_at DESC`, params);
  return rows.map(decorate);
}
async function createStamp(tenantId, actorId, body = {}) {
  const cols = FIELDS.filter((f) => body[f] !== undefined);
  const vals = cols.map((_, i) => `$${i + 3}`);
  const { rows } = await pool.query(
    `INSERT INTO book_stamp_register(tenant_id, created_by, ${cols.join(", ")}) VALUES($1, $2, ${vals.join(", ")}) RETURNING *`,
    [tenantId, actorId || null, ...cols.map((c) => body[c])]);
  return decorate(rows[0]);
}
async function updateStamp(tenantId, id, body = {}) {
  const cols = FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) throw new StampError("BAD_INPUT", "nothing to update", 400);
  const sets = cols.map((c, i) => `${c}=$${i + 3}`);
  const { rows } = await pool.query(`UPDATE book_stamp_register SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, ...cols.map((c) => body[c])]);
  if (!rows[0]) throw new StampError("NOT_FOUND", "Stamp not found", 404);
  return decorate(rows[0]);
}
// Mark an instrument used against a document (records the usage date + reference).
async function useStamp(tenantId, id, { documentRef, usedOn } = {}) {
  const { rows } = await pool.query(
    `UPDATE book_stamp_register SET status='used', used_on=COALESCE($3, CURRENT_DATE), document_ref=COALESCE($4, document_ref)
       WHERE tenant_id=$1 AND id=$2 AND status='available' RETURNING *`,
    [tenantId, id, usedOn || null, documentRef || null]);
  if (!rows[0]) throw new StampError("BAD_STATE", "Instrument not found or not available", 409);
  return decorate(rows[0]);
}
async function removeStamp(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_stamp_register WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new StampError("NOT_FOUND", "Stamp not found", 404);
  return { removed: true };
}
// Summary: unused value on hand, duty spent, and instruments expiring soon.
async function summary(tenantId) {
  const all = await listStamps(tenantId);
  const available = all.filter((s) => s.status === "available" || s.state === "expiring");
  return {
    available_value: available.reduce((s, x) => s + x.stamp_value, 0),
    duty_spent_total: all.reduce((s, x) => s + x.duty_amount, 0),
    expiring_soon: all.filter((s) => s.state === "expiring").length,
    expired: all.filter((s) => s.state === "expired").length,
    count: all.length,
  };
}

module.exports = { StampError, listStamps, createStamp, updateStamp, useStamp, removeStamp, summary, decorate };
