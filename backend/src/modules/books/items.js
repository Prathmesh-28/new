// §8b — Item master depth: variants (parent → child stock items with attribute
// JSONB), kits/bundles (book_item_components), and barcodes. All masters reuse
// book_stock_items; movements/valuation continue to flow through inventory.js.
// New columns/tables (book_stock_items.barcode/attributes/is_kit,
// book_item_components, book_serials) are provisioned by schema.js.
const { pool } = require("../../db");
const { PostError } = require("./posting-engine");
const { toDb } = require("./money");

// ── Variants ──────────────────────────────────────────────────────────────────
// A variant is a real, independently-stocked book_stock_items row tied to a
// parent via parent_item_id, distinguished by an attributes JSONB
// (e.g. {size:'L', color:'Red'}). It inherits unit + valuation_method from the
// parent so movements value consistently; barcode/hsn/gstRate can override.
async function createVariant(tenantId, { parentItemId, name, attributes, barcode, hsn, gstRate } = {}) {
  if (!parentItemId) throw new PostError("BAD_INPUT", "parentItemId required", 400);
  if (!name) throw new PostError("BAD_INPUT", "name required", 400);

  const { rows: pr } = await pool.query(
    "SELECT id, unit, valuation_method, hsn_sac, gst_rate FROM book_stock_items WHERE tenant_id=$1 AND id=$2",
    [tenantId, parentItemId]
  );
  const parent = pr[0];
  if (!parent) throw new PostError("NOT_FOUND", "Parent item not found", 404);

  const attrs = attributes == null ? {} : attributes;
  if (typeof attrs !== "object" || Array.isArray(attrs)) throw new PostError("BAD_INPUT", "attributes must be an object", 400);

  try {
    const { rows } = await pool.query(
      `INSERT INTO book_stock_items
         (tenant_id, name, unit, hsn_sac, gst_rate, valuation_method, parent_item_id, attributes, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tenantId, name, parent.unit,
        hsn != null ? hsn : parent.hsn_sac,
        gstRate != null ? gstRate : parent.gst_rate,
        parent.valuation_method, parentItemId,
        JSON.stringify(attrs),
        barcode || null,
      ]
    );
    return rows[0];
  } catch (e) {
    if (e.code === "23505") {
      if (/barcode/i.test(`${e.constraint || ""}${e.detail || ""}`)) {
        throw new PostError("BARCODE_TAKEN", `Barcode "${barcode}" is already used by another item`, 409);
      }
      throw new PostError("DUPLICATE_ITEM", `An item named "${name}" already exists`, 409);
    }
    throw e;
  }
}

async function listVariants(tenantId, parentItemId) {
  if (!parentItemId) throw new PostError("BAD_INPUT", "parentItemId required", 400);
  const { rows } = await pool.query(
    `SELECT id, name, unit, hsn_sac, gst_rate, barcode, attributes, current_qty, current_value, is_active
       FROM book_stock_items
      WHERE tenant_id=$1 AND parent_item_id=$2
      ORDER BY name`,
    [tenantId, parentItemId]
  );
  return rows;
}

// ── Kits / bundles ──────────────────────────────────────────────────────────────
// A kit is a book_stock_items row (is_kit=true) whose book_item_components rows
// list the component items and their per-kit quantities. Replacing the bill of
// components is delete-then-insert inside one transaction so a partial failure
// never leaves a half-defined kit.
async function setKitComponents(tenantId, kitItemId, components) {
  if (!kitItemId) throw new PostError("BAD_INPUT", "kitItemId required", 400);
  if (!Array.isArray(components)) throw new PostError("BAD_INPUT", "components must be an array", 400);

  const clean = components.map((c) => {
    if (!c || !c.componentItemId) throw new PostError("BAD_INPUT", "each component needs componentItemId", 400);
    const qty = toDb(c.qty == null ? 0 : c.qty);
    if (!(Number(qty) > 0)) throw new PostError("BAD_INPUT", "each component needs qty > 0", 400);
    if (c.componentItemId === kitItemId) throw new PostError("BAD_INPUT", "a kit cannot contain itself", 400);
    return { componentItemId: c.componentItemId, qty };
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: kr } = await client.query("SELECT id FROM book_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, kitItemId]);
    if (!kr[0]) throw new PostError("NOT_FOUND", "Kit item not found", 404);

    if (clean.length) {
      const ids = [...new Set(clean.map((c) => c.componentItemId))];
      const { rows: cr } = await client.query("SELECT id FROM book_stock_items WHERE tenant_id=$1 AND id = ANY($2::uuid[])", [tenantId, ids]);
      if (cr.length !== ids.length) throw new PostError("UNKNOWN_ITEM", "A component item is missing or from another tenant", 422);
    }

    await client.query("UPDATE book_stock_items SET is_kit=true WHERE tenant_id=$1 AND id=$2", [tenantId, kitItemId]);
    await client.query("DELETE FROM book_item_components WHERE tenant_id=$1 AND kit_item_id=$2", [tenantId, kitItemId]);
    for (const c of clean) {
      await client.query(
        "INSERT INTO book_item_components(tenant_id, kit_item_id, component_item_id, qty) VALUES($1,$2,$3,$4)",
        [tenantId, kitItemId, c.componentItemId, c.qty]
      );
    }
    await client.query("COMMIT");
    return { kitItemId, components: clean };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function getKitComponents(tenantId, kitItemId) {
  if (!kitItemId) throw new PostError("BAD_INPUT", "kitItemId required", 400);
  const { rows } = await pool.query(
    `SELECT c.component_item_id, c.qty, i.name, i.unit
       FROM book_item_components c
       JOIN book_stock_items i ON i.id = c.component_item_id AND i.tenant_id = c.tenant_id
      WHERE c.tenant_id=$1 AND c.kit_item_id=$2
      ORDER BY i.name`,
    [tenantId, kitItemId]
  );
  return rows;
}

// ── Barcodes ────────────────────────────────────────────────────────────────────
// One barcode → at most one stock item per tenant. We surface a clear error on a
// clash rather than leaking the raw unique-violation. Passing a falsy barcode to
// setBarcode clears it.
async function findByBarcode(tenantId, barcode) {
  if (!barcode) return null;
  const { rows } = await pool.query(
    "SELECT * FROM book_stock_items WHERE tenant_id=$1 AND barcode=$2",
    [tenantId, barcode]
  );
  return rows[0] || null;
}

async function setBarcode(tenantId, itemId, barcode) {
  if (!itemId) throw new PostError("BAD_INPUT", "itemId required", 400);
  const value = barcode ? String(barcode) : null;

  if (value) {
    const existing = await findByBarcode(tenantId, value);
    if (existing && existing.id !== itemId) {
      throw new PostError("BARCODE_TAKEN", `Barcode "${value}" is already used by "${existing.name}"`, 409);
    }
  }

  try {
    const { rows } = await pool.query(
      "UPDATE book_stock_items SET barcode=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
      [tenantId, itemId, value]
    );
    if (!rows[0]) throw new PostError("NOT_FOUND", "Item not found", 404);
    return rows[0];
  } catch (e) {
    if (e.code === "23505" && /barcode/i.test(`${e.constraint || ""}${e.detail || ""}`)) {
      throw new PostError("BARCODE_TAKEN", `Barcode "${value}" is already in use`, 409);
    }
    throw e;
  }
}

module.exports = {
  createVariant, listVariants,
  setKitComponents, getKitComponents,
  findByBarcode, setBarcode,
};
