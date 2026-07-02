"use strict";
// Business-continuity vault (roadmap #200): emergency access instructions for family/partner if
// the owner is unavailable — key contacts, bank/portal accounts, nominee details, where the
// documents live. The `detail` is field-encrypted at rest (fieldcrypto); routes are owner-gated.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");
const fc = require("../../lib/fieldcrypto");

const CATEGORIES = ["contact", "account", "instruction", "document", "nominee", "other"];

function decorate(row) {
  return { ...row, detail: row.detail ? fc.decrypt(row.detail) : null, priority: Number(row.priority) };
}

async function createContinuityItem(tenantId, actorId, e = {}) {
  const category = CATEGORIES.includes(e.category) ? e.category : "other";
  if (!e.title) throw new PostError("BAD_INPUT", "title required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_continuity_items(tenant_id,category,title,holder,detail,priority,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, category, e.title, e.holder || null, e.detail ? fc.encrypt(e.detail) : null,
      e.priority != null ? Math.max(1, Math.min(5, Math.round(e.priority))) : 3, actorId || null]);
  return decorate(rows[0]);
}

async function listContinuityItems(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_continuity_items WHERE tenant_id=$1 ORDER BY priority, category, title", [tenantId]);
  return rows.map(decorate);
}

async function updateContinuityItem(tenantId, id, e = {}) {
  const { rows: cur } = await pool.query("SELECT * FROM book_continuity_items WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!cur[0]) throw new PostError("NOT_FOUND", "Item not found", 404);
  const category = e.category != null ? (CATEGORIES.includes(e.category) ? e.category : "other") : cur[0].category;
  const { rows } = await pool.query(
    `UPDATE book_continuity_items SET category=$3, title=$4, holder=$5,
       detail = CASE WHEN $6::boolean THEN $7 ELSE detail END,
       priority=$8, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [tenantId, id, category, e.title != null ? e.title : cur[0].title, e.holder != null ? e.holder : cur[0].holder,
      e.detail !== undefined, e.detail ? fc.encrypt(e.detail) : (e.detail === "" ? null : null),
      e.priority != null ? Math.max(1, Math.min(5, Math.round(e.priority))) : cur[0].priority]);
  return decorate(rows[0]);
}

async function removeContinuityItem(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_continuity_items WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Item not found", 404);
  return { removed: true };
}

module.exports = { CATEGORIES, createContinuityItem, listContinuityItems, updateContinuityItem, removeContinuityItem };
