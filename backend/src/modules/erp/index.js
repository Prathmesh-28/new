// ERP — Bills of Materials + Work Orders. Completing a WO consumes each component
// (books inventory issue → COGS) and produces the finished good (books inventory
// receive) at rolled-up component cost. The ledger/stock truth stays in books.
const { pool } = require("../../db");
const books = require("../books");

class ErpError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// Pure: explode a BOM's components for a work-order quantity.
function explode(components, outputQty, woQty) {
  const factor = Number(woQty) / (Number(outputQty) || 1);
  return components.map((c) => ({ componentItemId: c.component_item_id || c.componentItemId, requiredQty: Number(c.qty) * factor }));
}

async function createBom(tenantId, b) {
  if (!b.name || !Array.isArray(b.components) || !b.components.length) throw new ErpError("name and components[] required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("INSERT INTO erp_boms(tenant_id,name,item_id,output_qty) VALUES($1,$2,$3,$4) RETURNING *", [tenantId, b.name, b.itemId || null, b.outputQty || 1]);
    const bom = rows[0];
    for (const c of b.components) await client.query("INSERT INTO erp_bom_items(tenant_id,bom_id,component_item_id,qty) VALUES($1,$2,$3,$4)", [tenantId, bom.id, c.componentItemId, c.qty]);
    await client.query("COMMIT");
    return bom;
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}
async function listBoms(tenantId) { return (await pool.query("SELECT * FROM erp_boms WHERE tenant_id=$1 ORDER BY name", [tenantId])).rows; }
async function getBom(tenantId, id) {
  const { rows: b } = await pool.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!b[0]) throw new ErpError("BOM not found", 404);
  const { rows: items } = await pool.query("SELECT * FROM erp_bom_items WHERE tenant_id=$1 AND bom_id=$2", [tenantId, id]);
  return { ...b[0], components: items };
}

async function createWorkOrder(tenantId, actorId, w) {
  if (!w.bomId || w.qty == null) throw new ErpError("bomId and qty required");
  const bom = await getBom(tenantId, w.bomId);
  const { rows } = await pool.query("INSERT INTO erp_work_orders(tenant_id,bom_id,qty,finished_item_id,warehouse_id,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [tenantId, w.bomId, w.qty, w.finishedItemId || bom.item_id || null, w.warehouseId || null, actorId || null]);
  return rows[0];
}
async function startWorkOrder(tenantId, id) {
  const { rows } = await pool.query("UPDATE erp_work_orders SET status='IN_PROGRESS', started_at=now() WHERE tenant_id=$1 AND id=$2 AND status='PLANNED' RETURNING *", [tenantId, id]);
  if (!rows[0]) throw new ErpError("Work order not found or not PLANNED", 409);
  return rows[0];
}
// Consume components → produce finished good at rolled-up cost (all via books).
async function completeWorkOrder(tenantId, id) {
  const { rows: wr } = await pool.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  const wo = wr[0];
  if (!wo) throw new ErpError("Work order not found", 404);
  if (wo.status === "COMPLETED" || wo.status === "CANCELLED") throw new ErpError(`Work order is ${wo.status}`, 409);
  if (!wo.finished_item_id) throw new ErpError("Work order has no finished item to produce", 422);
  const bom = await getBom(tenantId, wo.bom_id);
  const reqs = explode(bom.components, bom.output_qty, wo.qty);
  let totalCogs = 0;
  for (const r of reqs) {
    const out = await books.issue(tenantId, r.componentItemId, r.requiredQty, { warehouseId: wo.warehouse_id });
    totalCogs += Number(out.cogs || 0);
  }
  const rate = Number(wo.qty) > 0 ? totalCogs / Number(wo.qty) : 0;
  await books.receive(tenantId, wo.finished_item_id, wo.qty, rate, { warehouseId: wo.warehouse_id });
  const { rows } = await pool.query("UPDATE erp_work_orders SET status='COMPLETED', cogs=$3, completed_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, id, totalCogs.toFixed(4)]);
  return { ...rows[0], producedAt: rate.toFixed(4) };
}
async function listWorkOrders(tenantId) { return (await pool.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId])).rows; }

module.exports = { explode, ErpError, createBom, listBoms, getBom, createWorkOrder, startWorkOrder, completeWorkOrder, listWorkOrders };
