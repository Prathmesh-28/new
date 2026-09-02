"use strict";
// ── Trash / restore for any entity ───────────────────────────────────────────
// Before this, every delete in the product was final: 32 files called window.confirm()
// and then issued a hard DELETE. One mis-click destroyed an invoice and its line items
// with no way back.
//
// Design note (deliberate): this snapshots the row and its children into
// `deleted_records` and then performs the REAL delete, rather than adding a
// `deleted_at` column to each table. A soft-delete column would have required every one
// of the ~36 existing `FROM invoices` / 11 `FROM transactions` queries to grow an
// `AND deleted_at IS NULL`; a single missed site would silently put deleted invoices
// back into revenue, AR ageing and underwriting signals. Archive-then-delete keeps all
// existing reads correct by construction.
//
// Restore uses jsonb_populate_record so the row comes back with its ORIGINAL id — every
// foreign key, audit_log entry and attachment that pointed at it still resolves.
const { withTenant } = require("./tenantDb");

// Server-side allowlist. Table names are never taken from the client; `entity` is a key
// in this map, so the interpolated identifiers below can only ever be these literals.
const ENTITIES = {
  invoice: {
    table: "invoices",
    label: (r) => `${r.invoice_number || "Invoice"} · ${r.customer_name || ""}`.trim(),
    // Ordered parent → child: children are re-inserted after the parent on restore.
    children: [
      { table: "invoice_items",       fk: "invoice_id" },
      { table: "invoice_payments",    fk: "invoice_id" },
      { table: "invoice_reminders",   fk: "invoice_id" },
      { table: "invoice_credit_notes", fk: "invoice_id" },
      // Without these two, deleting an invoice destroyed its write-off record and edit
      // history, and a restore resurrected a credited_amount with no backing paper.
      { table: "invoice_writeoffs",   fk: "invoice_id" },
      { table: "invoice_revisions",   fk: "invoice_id" },
    ],
    href: (id) => `/invoices/${id}`,
  },
  transaction: {
    table: "transactions",
    // merchant_name/description_raw are the columns transactions actually has; a label of
    // "Transaction · -4500" tells the user nothing about which one they deleted.
    label: (r) => `${r.merchant_name || r.description_raw || "Transaction"} · ${Number(r.amount) > 0 ? "+" : "-"}${Math.abs(Number(r.amount) || 0)}`,
    children: [],
    href: (id) => `/transactions/${id}`,
  },
  vendor: {
    table: "vendor_master",
    label: (r) => r.name || r.vendor_name || "Vendor",
    children: [],
    href: (id) => `/vendors/${id}`,
  },
  customer: {
    table: "customers",
    label: (r) => r.name || "Customer",
    children: [{ table: "customer_contacts", fk: "customer_id" }],
    href: (id) => `/customers/${id}`,
  },
  note: { table: "notes", label: (r) => (r.body || "Note").slice(0, 60), children: [], href: () => "/documents" },
  file: { table: "files", label: (r) => r.filename || "File", children: [], href: () => "/documents" },
};

const spec = (entity) => {
  const s = ENTITIES[entity];
  if (!s) throw Object.assign(new Error(`Unknown entity "${entity}"`), { status: 400 });
  return s;
};

/**
 * Archive a row (+ its children) and delete it. Returns the trash id so the caller can
 * offer an Undo that needs no further lookup.
 */
async function softDelete(tenantId, entity, id, userId) {
  const s = spec(entity);
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT to_jsonb(t) AS snap FROM ${s.table} t WHERE t.id=$1 AND t.tenant_id=$2`,
      [id, tenantId]
    );
    if (!rows[0]) throw Object.assign(new Error("Not found"), { status: 404 });
    const snapshot = rows[0].snap;

    const children = [];
    for (const ch of s.children) {
      // A child table may not exist yet in every deployment (modules ship at their own
      // pace); missing children must not block the delete the user asked for.
      let kids;
      try {
        kids = await c.query(
          `SELECT coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) AS rows FROM ${ch.table} k WHERE k.${ch.fk}=$1`,
          [id]
        );
      } catch { continue; }
      const list = kids.rows[0].rows || [];
      if (list.length) children.push({ table: ch.table, rows: list });
    }

    const ins = await c.query(
      `INSERT INTO deleted_records(tenant_id, entity, entity_id, label, snapshot, children, deleted_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, deleted_at, purge_after`,
      [tenantId, entity, String(id), (s.label(snapshot) || "").slice(0, 200), snapshot, JSON.stringify(children), userId || null]
    );

    await c.query(`DELETE FROM ${s.table} WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    return { trashId: ins.rows[0].id, entity, entityId: String(id), label: s.label(snapshot), purgeAfter: ins.rows[0].purge_after };
  });
}

/** Put an archived row (and its children) back, id intact. */
async function restore(tenantId, trashId) {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM deleted_records WHERE id=$1 AND tenant_id=$2 AND restored_at IS NULL`,
      [trashId, tenantId]
    );
    if (!rows[0]) throw Object.assign(new Error("Nothing to restore"), { status: 404 });
    const rec = rows[0];
    const s = spec(rec.entity);

    const exists = await c.query(`SELECT 1 FROM ${s.table} WHERE id=$1`, [rec.entity_id]);
    if (exists.rows[0]) throw Object.assign(new Error("A record with this id already exists"), { status: 409 });

    await c.query(
      `INSERT INTO ${s.table} SELECT * FROM jsonb_populate_record(NULL::${s.table}, $1::jsonb)`,
      [rec.snapshot]
    );
    for (const ch of rec.children || []) {
      if (!s.children.some((x) => x.table === ch.table)) continue; // only tables we declared
      for (const row of ch.rows) {
        await c.query(
          `INSERT INTO ${ch.table} SELECT * FROM jsonb_populate_record(NULL::${ch.table}, $1::jsonb) ON CONFLICT DO NOTHING`,
          [row]
        );
      }
    }
    await c.query(`UPDATE deleted_records SET restored_at=now() WHERE id=$1`, [trashId]);
    return { entity: rec.entity, entityId: rec.entity_id, label: rec.label, href: s.href(rec.entity_id) };
  });
}

/** List what is in the bin, newest first. */
async function list(tenantId, { limit = 50, offset = 0, entity } = {}) {
  return withTenant(tenantId, async (c) => {
    const params = [tenantId];
    let where = "tenant_id=$1 AND restored_at IS NULL";
    if (entity && ENTITIES[entity]) { params.push(entity); where += ` AND entity=$${params.length}`; }
    const total = await c.query(`SELECT count(*)::int AS n FROM deleted_records WHERE ${where}`, params);
    params.push(limit, offset);
    const { rows } = await c.query(
      `SELECT id, entity, entity_id, label, deleted_by, deleted_at, purge_after
         FROM deleted_records WHERE ${where}
        ORDER BY deleted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { rows, total: total.rows[0].n };
  });
}

/** Permanently drop one archived row (the user emptying their own bin). */
async function purge(tenantId, trashId) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`DELETE FROM deleted_records WHERE id=$1 AND tenant_id=$2 RETURNING id`, [trashId, tenantId]);
    if (!r.rows[0]) throw Object.assign(new Error("Not found"), { status: 404 });
    return { purged: true };
  });
}

/**
 * Retention sweep — called by the nightly cron. Runs across ALL tenants, so it cannot go
 * through withTenant (which pins one). deleted_records is FORCE-RLS; the owner role that
 * runs migrations/cron is the table owner, so the sweep lifts FORCE for the single
 * maintenance statement exactly as migration 0026/0031 do, then restores it.
 */
async function purgeExpired(pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("ALTER TABLE deleted_records NO FORCE ROW LEVEL SECURITY");
    const r = await c.query("DELETE FROM deleted_records WHERE restored_at IS NULL AND purge_after < now() RETURNING id");
    await c.query("ALTER TABLE deleted_records FORCE ROW LEVEL SECURITY");
    await c.query("COMMIT");
    return r.rowCount;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { c.release(); }
}

module.exports = { softDelete, restore, list, purge, purgeExpired, ENTITIES };
