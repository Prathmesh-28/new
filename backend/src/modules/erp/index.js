// ERP manufacturing domain logic — a faithful port of ERPNext's BOM / Work Order
// / Job Card / Material Request algorithms onto Headroom's Postgres + books stack.
//
// The pure functions at the top are the real ported algorithms (multi-level BOM
// explosion, cost rollup, operation scaling, job-card costing, reorder suggestion,
// MR status). They take plain graphs/numbers so they are unit-testable with no DB.
// The DB-backed functions below orchestrate stock + valuation through `books`
// (books.receive / books.issue) so the ledger and stock truth never leave books.
//
// Decimal math reuses books' decimal.js wrapper — never raw JS number for money.
const { pool } = require("../../db");
const books = require("../books");
const fx = require("../books/fx");
const { money, toDb } = require("../books/money");

class ErpError extends Error { constructor(msg, http) { super(msg); this.http = http || 400; } }

// ─────────────────────────────────────────────────────────────────────────────
// PURE ALGORITHMS (no DB) — ported from ERPNext
// ─────────────────────────────────────────────────────────────────────────────

// Multi-level BOM explosion (port of bom/services/exploded_items.py).
//
// bomGraph: a map keyed by bomId → {
//   outputQty,                       // ERPNext "BOM.quantity"
//   items: [{ itemId, qty, subBomId?, rate? }],   // qty is per `outputQty` batch
// }
// We descend recursively: a component that references a sub-BOM is expanded into
// ITS raw materials, multiplying quantities by `qtyConsumedPerUnit × stockQty`,
// exactly like ERPNext's `_child_exploded_row`:
//     child.stock_qty = (child_bom_item.stock_qty / child_bom.quantity) × parent_stock_qty
// Leaf components accumulate by itemId. Returns a flat array of raw-material
// requirements scaled for `produceQty` finished units.
function explodeBom(bomGraph, rootBomId, produceQty) {
  const root = bomGraph[rootBomId];
  if (!root) throw new ErpError(`BOM ${rootBomId} not in graph`, 422);
  // factor scales a per-batch requirement to the qty we actually want to produce.
  const rootBatch = money(root.outputQty).gt(0) ? money(root.outputQty) : money(1);
  const factor = money(produceQty).div(rootBatch); // produceQty / output_qty

  const acc = new Map(); // itemId → { itemId, stockQty(Decimal), rate, isSubAssembly }

  function addLeaf(itemId, qty, rate) {
    const prev = acc.get(itemId);
    if (prev) prev.stockQty = prev.stockQty.plus(qty);
    else acc.set(itemId, { itemId, stockQty: money(qty), rate: money(rate || 0), isSubAssembly: false });
  }

  // descend a BOM, contributing `stockQty` worth of THIS bom's output to raw materials.
  function descend(bomId, stockQty, guard) {
    if (guard.has(bomId)) throw new ErpError("Circular BOM reference detected", 422);
    const node = bomGraph[bomId];
    if (!node) throw new ErpError(`Sub-BOM ${bomId} not in graph`, 422);
    const batch = money(node.outputQty).gt(0) ? money(node.outputQty) : money(1);
    const nextGuard = new Set(guard); nextGuard.add(bomId);
    for (const it of node.items || []) {
      // qtyConsumedPerUnit = component.qty / this bom's output_qty
      const perUnit = money(it.qty).div(batch);
      const childStockQty = perUnit.mul(stockQty); // qty of this component for `stockQty` of node output
      if (it.subBomId && bomGraph[it.subBomId]) {
        descend(it.subBomId, childStockQty, nextGuard); // expand sub-assembly into its raw materials
      } else {
        addLeaf(it.itemId, childStockQty, it.rate);
      }
    }
  }

  // Root: each top-level component scaled by `factor`.
  for (const it of root.items || []) {
    const reqQty = money(it.qty).mul(factor);
    if (it.subBomId && bomGraph[it.subBomId]) {
      descend(it.subBomId, reqQty, new Set([rootBomId]));
    } else {
      addLeaf(it.itemId, reqQty, it.rate);
    }
  }

  return Array.from(acc.values()).map((r) => ({
    itemId: r.itemId,
    requiredQty: Number(r.stockQty.toFixed(6)),
    rate: Number(r.rate.toFixed(6)),
    amount: Number(r.stockQty.mul(r.rate).toFixed(6)),
  }));
}

// Operating cost of ONE operation (port of bom/services/costing.py calculate_op_cost):
//     operating_cost = hour_rate × (time_in_mins / 60)
function operationCost(timeMins, hourlyRate) {
  return money(hourlyRate).mul(money(timeMins).div(60));
}

// BOM cost rollup (port of costing.py calculate_cost).
//   rawMaterialCost = Σ(component rate × qty over THIS bom's items; sub-assemblies
//                       valued at their own rolled total_cost / output_qty)
//   operatingCost   = Σ(operationCost(op))
//   totalCost       = rawMaterialCost + operatingCost
// `items` rate for a sub-assembly component should already be its unit cost.
// Returns per-batch costs (for the BOM's output_qty) + a per-unit rate.
function rollupCost(items, operations, outputQty) {
  let rm = money(0);
  for (const it of items || []) rm = rm.plus(money(it.rate || 0).mul(it.qty));
  let op = money(0);
  for (const o of operations || []) op = op.plus(operationCost(o.timeMins || 0, o.hourlyRate || 0));
  const total = rm.plus(op);
  const batch = money(outputQty).gt(0) ? money(outputQty) : money(1);
  return {
    rawMaterialCost: Number(rm.toFixed(6)),
    operatingCost: Number(op.toFixed(6)),
    totalCost: Number(total.toFixed(6)),
    unitCost: Number(total.div(batch).toFixed(6)), // base_total_cost / quantity
  };
}

// Scale a BOM operation's planned time to a work-order qty (operations.py):
//     final_time = base_time × (work_order.qty / bom.quantity)
// and planned_operating_cost = hour_rate × final_time/60.
function scaleOperation(op, woQty, bomOutputQty) {
  const batch = money(bomOutputQty).gt(0) ? money(bomOutputQty) : money(1);
  const scaledTime = money(op.time_mins || op.timeMins || 0).mul(money(woQty).div(batch));
  const cost = operationCost(scaledTime, op.hourly_rate || op.hourlyRate || 0);
  return { timeMins: Number(scaledTime.toFixed(6)), plannedOperatingCost: Number(cost.toFixed(6)) };
}

// Job-card time + cost (port of job_card.py):
//     time_in_mins  = (to_time - from_time) in minutes
//     operating_cost = (time_in_mins / 60) × hour_rate
function jobCardCost(fromTime, toTime, hourlyRate) {
  const ms = new Date(toTime).getTime() - new Date(fromTime).getTime();
  if (!(ms >= 0)) throw new ErpError("to_time must be after from_time", 422);
  const mins = money(ms).div(60000);
  return { timeMins: Number(mins.toFixed(6)), operatingCost: Number(operationCost(mins, hourlyRate).toFixed(6)) };
}

// Reorder suggestion (port of stock/reorder_item.py add_to_material_request):
//   trigger:  projectedQty <= reorderLevel
//   suggested = max(reorderQty, reorderLevel - projectedQty)
//               (bring stock up to level, but at least the configured reorder qty)
function reorderSuggestion(projectedQty, reorderLevel, reorderQty) {
  const proj = money(projectedQty);
  const level = money(reorderLevel);
  if (!money(level).gt(0)) return { reorder: false, suggestedQty: 0 };
  if (proj.gt(level)) return { reorder: false, suggestedQty: 0 };
  const deficiency = level.minus(proj);
  let qty = money(reorderQty || 0);
  if (deficiency.gt(qty)) qty = deficiency;
  return { reorder: true, suggestedQty: Number(qty.toFixed(6)), deficiency: Number(deficiency.toFixed(6)) };
}

// Material-request status from fulfilment (port of material_request.py update_status):
//   per_ordered = Σ ordered_qty / Σ qty × 100
//   0 → PENDING ; 0<x<100 → PARTIALLY_ORDERED ; ≥100 → ORDERED
function materialRequestStatus(items) {
  let req = money(0), ord = money(0);
  for (const it of items || []) { req = req.plus(it.qty); ord = ord.plus(it.ordered_qty ?? it.orderedQty ?? 0); }
  if (!req.gt(0)) return "PENDING";
  const pct = ord.div(req).mul(100);
  if (!ord.gt(0)) return "PENDING";
  if (pct.gte(100)) return "ORDERED";
  return "PARTIALLY_ORDERED";
}

// ─────────────────────────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Weighted-average valuation rate of a component (ERPNext "Valuation Rate"
// method: SUM(stock_value)/SUM(actual_qty)). books holds current_qty/value.
async function itemRate(client, tenantId, itemId) {
  const { rows } = await client.query(
    "SELECT current_qty, current_value FROM book_stock_items WHERE tenant_id=$1 AND id=$2",
    [tenantId, itemId]
  );
  if (!rows[0]) return money(0);
  const q = money(rows[0].current_qty);
  return q.gt(0) ? money(rows[0].current_value).div(q) : money(0);
}

// Build the in-memory BOM graph for a root BOM + all reachable sub-BOMs.
// A component references a sub-BOM either explicitly (sub_bom_id) or implicitly
// (its item has a default active BOM) — matching ERPNext's `use_multi_level_bom`.
async function loadBomGraph(client, tenantId, rootBomId) {
  const graph = {};
  const queue = [rootBomId];
  const seen = new Set();
  // default-BOM lookup by finished item (the implicit sub-assembly link)
  const { rows: defaults } = await client.query(
    "SELECT id, item_id FROM erp_boms WHERE tenant_id=$1 AND is_active=true AND is_default=true",
    [tenantId]
  );
  const defaultBomByItem = new Map(defaults.map((d) => [d.item_id, d.id]));

  while (queue.length) {
    const bomId = queue.shift();
    if (seen.has(bomId)) continue;
    seen.add(bomId);
    const { rows: br } = await client.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, bomId]);
    if (!br[0]) continue;
    const { rows: items } = await client.query(
      "SELECT * FROM erp_bom_items WHERE tenant_id=$1 AND bom_id=$2 ORDER BY seq, id", [tenantId, bomId]
    );
    const mapped = [];
    for (const it of items) {
      // explicit sub_bom_id wins; otherwise the component item's default BOM
      let subBomId = it.sub_bom_id || defaultBomByItem.get(it.component_item_id) || null;
      if (subBomId === bomId) subBomId = null; // never self-reference
      const rate = await itemRate(client, tenantId, it.component_item_id);
      mapped.push({ itemId: it.component_item_id, qty: Number(it.qty), subBomId, rate: Number(rate.toFixed(6)) });
      if (subBomId && !seen.has(subBomId)) queue.push(subBomId);
    }
    graph[bomId] = { outputQty: Number(br[0].output_qty) || 1, items: mapped, itemId: br[0].item_id };
  }
  return graph;
}

// ─────────────────────────────────────────────────────────────────────────────
// BOM CRUD + cost rollup
// ─────────────────────────────────────────────────────────────────────────────
async function recomputeBomCost(client, tenantId, bomId) {
  const { rows: items } = await client.query("SELECT * FROM erp_bom_items WHERE tenant_id=$1 AND bom_id=$2", [tenantId, bomId]);
  const { rows: ops } = await client.query("SELECT * FROM erp_bom_operations WHERE tenant_id=$1 AND bom_id=$2", [tenantId, bomId]);
  const { rows: br } = await client.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, bomId]);
  if (!br[0]) return null;
  const { rows: defs } = await client.query(
    "SELECT id, item_id FROM erp_boms WHERE tenant_id=$1 AND is_active=true AND is_default=true", [tenantId]
  );
  const defByItem = new Map(defs.map((d) => [d.item_id, d.id]));
  // value each component: a sub-assembly component uses its rolled unit cost.
  const valued = [];
  for (const it of items) {
    let subBomId = it.sub_bom_id || defByItem.get(it.component_item_id) || null;
    if (subBomId === bomId) subBomId = null;
    let rate;
    if (subBomId) {
      const { rows: sb } = await client.query("SELECT total_cost, output_qty FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, subBomId]);
      rate = sb[0] && money(sb[0].output_qty).gt(0) ? money(sb[0].total_cost).div(sb[0].output_qty) : await itemRate(client, tenantId, it.component_item_id);
    } else {
      rate = await itemRate(client, tenantId, it.component_item_id);
    }
    valued.push({ qty: Number(it.qty), rate: Number(money(rate).toFixed(6)) });
  }
  const opRows = ops.map((o) => ({ timeMins: Number(o.time_mins), hourlyRate: Number(o.hourly_rate) }));
  const roll = rollupCost(valued, opRows, Number(br[0].output_qty));
  await client.query(
    "UPDATE erp_boms SET raw_material_cost=$3, operating_cost=$4, total_cost=$5, updated_at=now() WHERE tenant_id=$1 AND id=$2",
    [tenantId, bomId, toDb(roll.rawMaterialCost), toDb(roll.operatingCost), toDb(roll.totalCost)]
  );
  return roll;
}

async function createBom(tenantId, b) {
  if (!b.name || !Array.isArray(b.components) || !b.components.length) throw new ErpError("name and components[] required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO erp_boms(tenant_id,name,item_id,output_qty,is_default) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [tenantId, b.name, b.itemId || null, b.outputQty || 1, b.isDefault !== false]
    );
    const bom = rows[0];
    let seq = 0;
    for (const c of b.components) {
      if (!c.componentItemId || c.qty == null) throw new ErpError("each component needs componentItemId and qty");
      await client.query(
        "INSERT INTO erp_bom_items(tenant_id,bom_id,component_item_id,qty,sub_bom_id,seq) VALUES($1,$2,$3,$4,$5,$6)",
        [tenantId, bom.id, c.componentItemId, c.qty, c.subBomId || null, seq++]
      );
    }
    seq = 0;
    for (const o of b.operations || []) {
      if (!o.operation) continue;
      await client.query(
        "INSERT INTO erp_bom_operations(tenant_id,bom_id,operation,workstation,time_mins,hourly_rate,seq) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [tenantId, bom.id, o.operation, o.workstation || null, o.timeMins || 0, o.hourlyRate || 0, seq++]
      );
    }
    const roll = await recomputeBomCost(client, tenantId, bom.id);
    await client.query("COMMIT");
    return { ...bom, ...roll };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

async function listBoms(tenantId) {
  return (await pool.query("SELECT * FROM erp_boms WHERE tenant_id=$1 ORDER BY name", [tenantId])).rows;
}

async function getBom(tenantId, id) {
  const { rows: b } = await pool.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!b[0]) throw new ErpError("BOM not found", 404);
  const { rows: items } = await pool.query("SELECT * FROM erp_bom_items WHERE tenant_id=$1 AND bom_id=$2 ORDER BY seq, id", [tenantId, id]);
  const { rows: ops } = await pool.query("SELECT * FROM erp_bom_operations WHERE tenant_id=$1 AND bom_id=$2 ORDER BY seq, id", [tenantId, id]);
  return { ...b[0], components: items, operations: ops };
}

// Exploded raw-material view of a BOM for a given qty (default = its output_qty).
async function explodedBom(tenantId, id, qty) {
  const client = await pool.connect();
  try {
    const { rows: b } = await client.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
    if (!b[0]) throw new ErpError("BOM not found", 404);
    const graph = await loadBomGraph(client, tenantId, id);
    const produceQty = qty != null ? Number(qty) : Number(b[0].output_qty) || 1;
    const flat = explodeBom(graph, id, produceQty);
    // attach names for the UI
    const ids = flat.map((f) => f.itemId);
    let names = {};
    if (ids.length) {
      const { rows: nr } = await client.query(
        "SELECT id, name, unit FROM book_stock_items WHERE tenant_id=$1 AND id = ANY($2::uuid[])", [tenantId, ids]
      );
      names = Object.fromEntries(nr.map((r) => [r.id, r]));
    }
    const rawMaterialCost = flat.reduce((a, f) => a + f.amount, 0);
    return {
      bomId: id, produceQty,
      rawMaterials: flat.map((f) => ({ ...f, name: names[f.itemId]?.name || "Unknown", unit: names[f.itemId]?.unit || "" })),
      rawMaterialCost: Number(rawMaterialCost.toFixed(6)),
    };
  } finally { client.release(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────────────────────────────────────

// Recompute status from the qty state machine (port of work_order/services/status.py).
function deriveWoStatus(wo) {
  if (wo.status === "CANCELLED" || wo.status === "STOPPED") return wo.status;
  const produced = money(wo.produced_qty);
  if (produced.gte(wo.qty)) return "COMPLETED";
  if (money(wo.material_transferred).gt(0)) return "IN_PROCESS";
  return "NOT_STARTED";
}

async function createWorkOrder(tenantId, actorId, w) {
  if (!w.bomId || w.qty == null || !(Number(w.qty) > 0)) throw new ErpError("bomId and positive qty required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: br } = await client.query("SELECT * FROM erp_boms WHERE tenant_id=$1 AND id=$2", [tenantId, w.bomId]);
    if (!br[0]) throw new ErpError("BOM not found", 404);
    const bom = br[0];
    const finishedItemId = w.finishedItemId || bom.item_id || null;
    if (!finishedItemId) throw new ErpError("Work order needs a finished item (BOM has none)", 422);
    const useMulti = w.useMultiLevel !== false;

    // 1) required items — explode the BOM × qty (multi-level if requested).
    const graph = await loadBomGraph(client, tenantId, w.bomId);
    let required;
    if (useMulti) {
      required = explodeBom(graph, w.bomId, Number(w.qty));
    } else {
      // single level: top-level items only, scaled by qty/output_qty
      const factor = money(w.qty).div(money(bom.output_qty).gt(0) ? money(bom.output_qty) : money(1));
      required = (graph[w.bomId].items || []).map((it) => ({
        itemId: it.itemId, requiredQty: Number(money(it.qty).mul(factor).toFixed(6)), rate: it.rate,
        amount: Number(money(it.qty).mul(factor).mul(it.rate).toFixed(6)),
      }));
    }

    // 2) operations scaled to qty + planned operating cost.
    const { rows: bomOps } = await client.query("SELECT * FROM erp_bom_operations WHERE tenant_id=$1 AND bom_id=$2 ORDER BY seq, id", [tenantId, w.bomId]);
    let plannedOp = money(0);
    const scaledOps = bomOps.map((o) => {
      const s = scaleOperation(o, w.qty, bom.output_qty);
      plannedOp = plannedOp.plus(s.plannedOperatingCost);
      return { ...o, ...s };
    });
    const rawMaterialPlanned = required.reduce((a, r) => a + r.amount, 0);

    const { rows } = await client.query(
      `INSERT INTO erp_work_orders(tenant_id,bom_id,qty,finished_item_id,warehouse_id,use_multi_level,planned_operating_cost,raw_material_cost,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, w.bomId, w.qty, finishedItemId, w.warehouseId || null, useMulti, toDb(plannedOp), toDb(rawMaterialPlanned), actorId || null]
    );
    const wo = rows[0];
    for (const r of required) {
      await client.query(
        "INSERT INTO erp_work_order_items(tenant_id,work_order_id,item_id,required_qty,rate) VALUES($1,$2,$3,$4,$5)",
        [tenantId, wo.id, r.itemId, toDb(r.requiredQty), toDb(r.rate)]
      );
    }
    for (const o of scaledOps) {
      await client.query(
        "INSERT INTO erp_work_order_operations(tenant_id,work_order_id,operation,workstation,time_mins,hourly_rate,planned_operating_cost,seq) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [tenantId, wo.id, o.operation, o.workstation || null, toDb(o.timeMins), o.hourly_rate, toDb(o.plannedOperatingCost), o.seq]
      );
    }
    await client.query("COMMIT");
    return wo;
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

async function getWorkOrder(tenantId, id) {
  const { rows: w } = await pool.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!w[0]) throw new ErpError("Work order not found", 404);
  const { rows: items } = await pool.query("SELECT * FROM erp_work_order_items WHERE tenant_id=$1 AND work_order_id=$2", [tenantId, id]);
  const { rows: ops } = await pool.query("SELECT * FROM erp_work_order_operations WHERE tenant_id=$1 AND work_order_id=$2 ORDER BY seq, id", [tenantId, id]);
  const { rows: jcs } = await pool.query("SELECT * FROM erp_job_cards WHERE tenant_id=$1 AND work_order_id=$2 ORDER BY created_at", [tenantId, id]);
  return { ...w[0], requiredItems: items, operations: ops, jobCards: jcs };
}

async function listWorkOrders(tenantId) {
  return (await pool.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId])).rows;
}

// A manufacturing flow moves value between Stock-in-hand and Work-in-Progress.
// Every books.issue/receive writes a stock-ledger entry whose voucher_id is NOT
// NULL, so we must post a balanced JOURNAL voucher and thread its id through.
// The WIP ledger is created lazily under the Stock-in-hand group (idempotent).
const MFG_ACTOR = null; // these flows are system-initiated; created_by may be null
// NOTE: uses `pool` (auto-commit), NOT the caller's open transaction — books.postVoucher
// runs on its own connection and must be able to SELECT this ledger, so it has to be
// committed before we post the backing journal.
async function ensureWipLedger(tenantId) {
  const { rows: ex } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND name=$2", [tenantId, "Work-in-Progress"]);
  if (ex[0]) return ex[0].id;
  const { rows: grp } = await pool.query("SELECT id FROM book_account_groups WHERE tenant_id=$1 AND name=$2", [tenantId, "Stock-in-hand"]);
  if (!grp[0]) throw new ErpError("Stock-in-hand group missing — seed books first", 422);
  const { rows } = await pool.query(
    "INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [tenantId, "Work-in-Progress", grp[0].id]
  );
  return rows[0].id;
}
// Post a balanced JOURNAL voucher for a manufacturing stock move and return its id.
// `lines` is [{ ledgerId, debit, credit }] (strings via ./money). We post via the
// public books.postVoucher so the GL stays the single source of truth.
async function postMfgJournal(tenantId, narration, lines) {
  const v = await books.postVoucher(tenantId, MFG_ACTOR,
    { voucherType: "JOURNAL", voucherDate: new Date().toISOString().slice(0, 10), narration, source: "api" },
    lines);
  return v.voucherId || v.id || (v.voucher && v.voucher.id);
}
// Rewrite the two debit/credit amounts of a 2-line JOURNAL voucher to the actual
// COGS once it is known (issue/receive COGS is only known after the stock move).
// Keeps the GL exactly equal to the stock-ledger entry it backs.
async function setMfgJournalAmount(client, voucherId, amount) {
  const amt = toDb(money(amount));
  await client.query("UPDATE book_voucher_entries SET debit = CASE WHEN debit > 0 THEN $2::numeric ELSE 0 END, credit = CASE WHEN credit > 0 THEN $2::numeric ELSE 0 END WHERE voucher_id=$1", [voucherId, amt]);
}

// Material transfer for manufacture: issue each required component into WIP via
// books.issue (which moves stock + posts COGS). Tracks transferred_qty and flips
// the WO to IN_PROCESS (NOT_STARTED → IN_PROCESS). raw_material_cost accumulates
// the actual COGS so the finished good can be received at component+labour cost.
async function transferMaterials(tenantId, id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: wr } = await client.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, id]);
    const wo = wr[0];
    if (!wo) throw new ErpError("Work order not found", 404);
    if (wo.status === "COMPLETED" || wo.status === "CANCELLED" || wo.status === "STOPPED") throw new ErpError(`Work order is ${wo.status}`, 409);
    const { rows: items } = await client.query("SELECT * FROM erp_work_order_items WHERE tenant_id=$1 AND work_order_id=$2", [tenantId, id]);
    if (!items.length) throw new ErpError("Work order has no required items", 422);

    // Stock-journal voucher backing the issue SLEs: Dr WIP / Cr Stock-in-hand.
    // Posted up-front (so books.issue has a real voucher_id), amount corrected to
    // the actual COGS once all components are issued. Keeps the GL balanced.
    const wipLed = await ensureWipLedger(tenantId);
    const stockLed = await books.ledgerIdByName(tenantId, "Stock-in-hand");
    const journalId = await postMfgJournal(tenantId, `WO ${id} material transfer to WIP`,
      [{ ledgerId: wipLed, debit: "1", credit: "0" }, { ledgerId: stockLed, debit: "0", credit: "1" }]);

    let rmCost = money(0);
    for (const it of items) {
      const pending = money(it.required_qty).minus(it.transferred_qty);
      if (!pending.gt(0)) continue;
      // books.issue guards negative stock unless item.allow_negative — never bypass.
      const out = await books.issue(tenantId, it.item_id, Number(pending.toFixed(6)), { warehouseId: wo.warehouse_id, voucherId: journalId });
      rmCost = rmCost.plus(out.cogs || 0);
      await client.query("UPDATE erp_work_order_items SET transferred_qty=required_qty WHERE id=$1", [it.id]);
    }
    // Correct the journal to the real value moved into WIP (Dr WIP = Cr Stock = rmCost).
    await setMfgJournalAmount(client, journalId, rmCost.gt(0) ? rmCost : money(0));
    const { rows } = await client.query(
      "UPDATE erp_work_orders SET material_transferred=qty, raw_material_cost=$3, status='IN_PROCESS', started_at=COALESCE(started_at, now()) WHERE tenant_id=$1 AND id=$2 RETURNING *",
      [tenantId, id, toDb(rmCost)]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Manufacture: receive the finished good at (raw material cost + operating cost)
// per unit, via books.receive (so FG valuation includes labour). Marks consumed
// qty on the WO items, sets produced_qty and COMPLETED. If materials were never
// transferred, this issues them now (skip-transfer path, like ERPNext).
async function manufacture(tenantId, id, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: wr } = await client.query("SELECT * FROM erp_work_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, id]);
    const wo = wr[0];
    if (!wo) throw new ErpError("Work order not found", 404);
    if (wo.status === "COMPLETED" || wo.status === "CANCELLED" || wo.status === "STOPPED") throw new ErpError(`Work order is ${wo.status}`, 409);
    if (!wo.finished_item_id) throw new ErpError("Work order has no finished item to produce", 422);
    const produceQty = opts.qty != null ? Number(opts.qty) : Number(wo.qty);
    if (!(produceQty > 0)) throw new ErpError("produce qty must be > 0", 422);

    const { rows: items } = await client.query("SELECT * FROM erp_work_order_items WHERE tenant_id=$1 AND work_order_id=$2", [tenantId, id]);

    const wipLed = await ensureWipLedger(tenantId);
    const stockLed = await books.ledgerIdByName(tenantId, "Stock-in-hand");

    // Components not yet transferred get issued now (skip-transfer). Back any such
    // issues with a Dr WIP / Cr Stock-in-hand journal so the SLE has a voucher_id.
    let rmCost = money(wo.raw_material_cost);
    let skipTransferCost = money(0);
    let skipJournalId = null;
    for (const it of items) {
      const toConsume = money(it.required_qty).minus(it.consumed_qty);
      if (!toConsume.gt(0)) continue;
      const notYetTransferred = money(it.required_qty).minus(it.transferred_qty);
      if (notYetTransferred.gt(0)) {
        if (!skipJournalId) {
          skipJournalId = await postMfgJournal(tenantId, `WO ${id} skip-transfer issue to WIP`,
            [{ ledgerId: wipLed, debit: "1", credit: "0" }, { ledgerId: stockLed, debit: "0", credit: "1" }]);
        }
        const out = await books.issue(tenantId, it.item_id, Number(notYetTransferred.toFixed(6)), { warehouseId: wo.warehouse_id, voucherId: skipJournalId });
        rmCost = rmCost.plus(out.cogs || 0);
        skipTransferCost = skipTransferCost.plus(out.cogs || 0);
        await client.query("UPDATE erp_work_order_items SET transferred_qty=required_qty WHERE id=$1", [it.id]);
      }
      await client.query("UPDATE erp_work_order_items SET consumed_qty=required_qty WHERE id=$1", [it.id]);
    }
    if (skipJournalId) await setMfgJournalAmount(client, skipJournalId, skipTransferCost.gt(0) ? skipTransferCost : money(0));

    // operating cost: prefer actual (from job cards) else planned.
    const { rows: opAgg } = await client.query(
      "SELECT COALESCE(SUM(actual_operating_cost),0) AS act, COALESCE(SUM(planned_operating_cost),0) AS plan FROM erp_work_order_operations WHERE tenant_id=$1 AND work_order_id=$2",
      [tenantId, id]
    );
    const operatingCost = money(opAgg[0].act).gt(0) ? money(opAgg[0].act) : money(opAgg[0].plan);
    const totalCogs = rmCost.plus(operatingCost);
    const rate = produceQty > 0 ? totalCogs.div(produceQty) : money(0);

    // Receive finished good at rolled cost (component + operating) per unit.
    // Back the receipt SLE with a Dr Stock-in-hand(FG) / Cr WIP journal at the FG
    // receipt value (= totalCogs), then correct to the exact value received.
    const fgValue = totalCogs;
    const fgJournalId = await postMfgJournal(tenantId, `WO ${id} finished-good receipt`,
      [{ ledgerId: stockLed, debit: toDb(fgValue.gt(0) ? fgValue : money(1)), credit: "0" },
       { ledgerId: wipLed, debit: "0", credit: toDb(fgValue.gt(0) ? fgValue : money(1)) }]);
    await books.receive(tenantId, wo.finished_item_id, produceQty, Number(rate.toFixed(6)), { warehouseId: wo.warehouse_id, voucherId: fgJournalId });
    const fgRecvValue = money(produceQty).mul(Number(rate.toFixed(6)));
    await setMfgJournalAmount(client, fgJournalId, fgRecvValue.gt(0) ? fgRecvValue : money(0));

    const newProduced = money(wo.produced_qty).plus(produceQty);
    const completed = newProduced.gte(wo.qty);
    const { rows } = await client.query(
      `UPDATE erp_work_orders
         SET produced_qty=$3, raw_material_cost=$4, actual_operating_cost=$5, total_cogs=$6, produced_rate=$7,
             status=$8, completed_at=CASE WHEN $9 THEN now() ELSE completed_at END
       WHERE tenant_id=$1 AND id=$2 RETURNING *`,
      [tenantId, id, toDb(newProduced), toDb(rmCost), toDb(operatingCost), toDb(totalCogs), toDb(rate),
       completed ? "COMPLETED" : "IN_PROCESS", completed]
    );
    await client.query("COMMIT");
    return { ...rows[0], producedRate: Number(rate.toFixed(4)), operatingCost: Number(operatingCost.toFixed(4)) };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB CARDS (per-operation time logging → actual operating cost)
// ─────────────────────────────────────────────────────────────────────────────
async function startJobCard(tenantId, woId, body) {
  if (!body.woOperationId) throw new ErpError("woOperationId required");
  const { rows: op } = await pool.query("SELECT * FROM erp_work_order_operations WHERE tenant_id=$1 AND id=$2 AND work_order_id=$3", [tenantId, body.woOperationId, woId]);
  if (!op[0]) throw new ErpError("Work order operation not found", 404);
  const { rows } = await pool.query(
    `INSERT INTO erp_job_cards(tenant_id,work_order_id,wo_operation_id,operation,workstation,hourly_rate,for_qty,from_time,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()),'IN_PROGRESS') RETURNING *`,
    [tenantId, woId, op[0].id, op[0].operation, op[0].workstation, op[0].hourly_rate, body.forQty || 0, body.fromTime || null]
  );
  await pool.query("UPDATE erp_work_order_operations SET status='IN_PROGRESS' WHERE id=$1 AND status='PENDING'", [op[0].id]);
  return rows[0];
}

async function completeJobCard(tenantId, jobCardId, body) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: jr } = await client.query("SELECT * FROM erp_job_cards WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, jobCardId]);
    const jc = jr[0];
    if (!jc) throw new ErpError("Job card not found", 404);
    if (jc.status === "COMPLETED") throw new ErpError("Job card already completed", 409);
    const toTime = body.toTime || new Date().toISOString();
    const fromTime = jc.from_time || body.fromTime;
    if (!fromTime) throw new ErpError("Job card has no start time", 422);
    const { timeMins, operatingCost } = jobCardCost(fromTime, toTime, jc.hourly_rate);
    const completedQty = body.completedQty != null ? Number(body.completedQty) : Number(jc.for_qty);
    await client.query(
      "UPDATE erp_job_cards SET to_time=$3, time_mins=$4, operating_cost=$5, completed_qty=$6, status='COMPLETED' WHERE tenant_id=$1 AND id=$2",
      [tenantId, jobCardId, toTime, toDb(timeMins), toDb(operatingCost), toDb(completedQty)]
    );
    // Roll job-card totals up into the work-order operation (actual cost feedback).
    if (jc.wo_operation_id) {
      const { rows: agg } = await client.query(
        "SELECT COALESCE(SUM(time_mins),0) AS mins, COALESCE(SUM(operating_cost),0) AS cost, COALESCE(SUM(completed_qty),0) AS qty FROM erp_job_cards WHERE tenant_id=$1 AND wo_operation_id=$2 AND status='COMPLETED'",
        [tenantId, jc.wo_operation_id]
      );
      const { rows: wr } = await client.query("SELECT w.qty FROM erp_work_orders w JOIN erp_work_order_operations o ON o.work_order_id=w.id WHERE o.id=$1", [jc.wo_operation_id]);
      const woQty = wr[0] ? money(wr[0].qty) : money(0);
      const opStatus = money(agg[0].qty).gte(woQty) && woQty.gt(0) ? "COMPLETED" : "IN_PROGRESS";
      await client.query(
        "UPDATE erp_work_order_operations SET actual_time_mins=$2, actual_operating_cost=$3, completed_qty=$4, status=$5 WHERE id=$1",
        [jc.wo_operation_id, toDb(agg[0].mins), toDb(agg[0].cost), toDb(agg[0].qty), opStatus]
      );
    }
    await client.query("COMMIT");
    return { id: jobCardId, timeMins, operatingCost, completedQty };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL REQUESTS + REORDER
// ─────────────────────────────────────────────────────────────────────────────
async function createMaterialRequest(tenantId, actorId, m) {
  const type = (m.requestType || "PURCHASE").toUpperCase();
  if (!["PURCHASE", "TRANSFER", "MANUFACTURE"].includes(type)) throw new ErpError("requestType must be PURCHASE|TRANSFER|MANUFACTURE");
  if (!Array.isArray(m.items) || !m.items.length) throw new ErpError("items[] required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO erp_material_requests(tenant_id,request_type,source,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [tenantId, type, m.source === "reorder" ? "reorder" : "manual", m.note || null, actorId || null]
    );
    const mr = rows[0];
    for (const it of m.items) {
      if (!it.itemId || it.qty == null) throw new ErpError("each item needs itemId and qty");
      await client.query(
        "INSERT INTO erp_material_request_items(tenant_id,material_request_id,item_id,qty,projected_qty,reorder_level) VALUES($1,$2,$3,$4,$5,$6)",
        [tenantId, mr.id, it.itemId, it.qty, it.projectedQty ?? null, it.reorderLevel ?? null]
      );
    }
    await client.query("COMMIT");
    return mr;
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

async function listMaterialRequests(tenantId) {
  const { rows: mrs } = await pool.query("SELECT * FROM erp_material_requests WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId]);
  for (const mr of mrs) {
    const { rows: items } = await pool.query(
      `SELECT mi.*, si.name AS item_name, si.unit FROM erp_material_request_items mi
       LEFT JOIN book_stock_items si ON si.id = mi.item_id
       WHERE mi.tenant_id=$1 AND mi.material_request_id=$2`, [tenantId, mr.id]
    );
    mr.items = items;
    mr.derivedStatus = materialRequestStatus(items);
  }
  return mrs;
}

// Mark a request (or specific items) as ordered, then re-derive status.
async function markOrdered(tenantId, id, body = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: mr } = await client.query("SELECT * FROM erp_material_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, id]);
    if (!mr[0]) throw new ErpError("Material request not found", 404);
    if (Array.isArray(body.items) && body.items.length) {
      for (const it of body.items) {
        await client.query("UPDATE erp_material_request_items SET ordered_qty=LEAST(qty, $3) WHERE tenant_id=$1 AND id=$2", [tenantId, it.id, it.orderedQty]);
      }
    } else {
      await client.query("UPDATE erp_material_request_items SET ordered_qty=qty WHERE tenant_id=$1 AND material_request_id=$2", [tenantId, id]);
    }
    const { rows: items } = await client.query("SELECT * FROM erp_material_request_items WHERE tenant_id=$1 AND material_request_id=$2", [tenantId, id]);
    const status = materialRequestStatus(items);
    const { rows } = await client.query("UPDATE erp_material_requests SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, id, status]);
    await client.query("COMMIT");
    return { ...rows[0], items };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Reorder report: items whose on-hand qty is at/below reorder level. Suggested
// order qty uses ERPNext's max(reorder_qty, level - projected). reorder_qty here
// defaults to the reorder level (so stock is topped up to 2× level) when no
// explicit per-item reorder qty is stored — books only tracks reorder_level.
async function reorderReport(tenantId) {
  const { rows } = await pool.query(
    "SELECT id, name, unit, current_qty, reorder_level FROM book_stock_items WHERE tenant_id=$1 AND is_active=true AND reorder_level > 0 ORDER BY name",
    [tenantId]
  );
  return rows
    .map((r) => {
      const reorderQty = Number(r.reorder_level); // default top-up target = level
      const s = reorderSuggestion(r.current_qty, r.reorder_level, reorderQty);
      return s.reorder
        ? { itemId: r.id, name: r.name, unit: r.unit, currentQty: Number(r.current_qty), reorderLevel: Number(r.reorder_level), suggestedQty: s.suggestedQty }
        : null;
    })
    .filter(Boolean);
}

// Raise a single PURCHASE material request covering everything below reorder level.
async function raiseReorderRequest(tenantId, actorId) {
  const below = await reorderReport(tenantId);
  if (!below.length) return { raised: false, count: 0 };
  const mr = await createMaterialRequest(tenantId, actorId, {
    requestType: "PURCHASE",
    source: "reorder",
    note: "Auto-reorder: items at/below reorder level",
    items: below.map((b) => ({ itemId: b.itemId, qty: b.suggestedQty, projectedQty: b.currentQty, reorderLevel: b.reorderLevel })),
  });
  return { raised: true, count: below.length, materialRequest: mr };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION PLANNING / MRP  (port of ERPNext production_plan.py)
// ─────────────────────────────────────────────────────────────────────────────

// Pure: net a gross demand against available stock (ERPNext get_so_pending_qty /
// "ignore_existing_ordered_qty"):  planned = max(0, demand − available).
function netRequirement(demandQty, availableQty) {
  const net = money(demandQty).minus(money(availableQty));
  return net.gt(0) ? net : money(0);
}

// Pure: aggregate sales-order lines (+ explicit forecast rows) into one gross
// demand qty per finished-item. Mirrors production_plan.get_items_for_material_requests
// demand bucketing. Each line: { itemId, qty }. Returns Map<itemId, Decimal>.
function aggregateDemand(salesLines, forecastRows) {
  const acc = new Map();
  const add = (itemId, qty) => {
    if (!itemId) return;
    acc.set(itemId, (acc.get(itemId) || money(0)).plus(money(qty || 0)));
  };
  for (const l of salesLines || []) add(l.itemId || l.item_id, l.qty);
  for (const f of forecastRows || []) add(f.itemId || f.item_id, f.qty);
  return acc;
}

// Resolve the BOM for a finished item: explicit override → its default active BOM.
async function defaultBomForItem(client, tenantId, itemId, override) {
  if (override) return override;
  const { rows } = await client.query(
    "SELECT id FROM erp_boms WHERE tenant_id=$1 AND item_id=$2 AND is_active=true ORDER BY is_default DESC, created_at LIMIT 1",
    [tenantId, itemId]
  );
  return rows[0] ? rows[0].id : null;
}

async function onHandQty(client, tenantId, itemId) {
  const { rows } = await client.query("SELECT current_qty FROM book_stock_items WHERE tenant_id=$1 AND id=$2", [tenantId, itemId]);
  return rows[0] ? money(rows[0].current_qty) : money(0);
}

// Create a production plan. demand is assembled from (a) referenced sales orders
// (book_documents doc_kind=SALES_ORDER, JSONB lines) and (b) ad-hoc forecast rows
// [{ itemId, qty, bomId? }]. Each finished item becomes a plan item; net planned
// qty = max(0, aggregated demand − on-hand).
async function createProductionPlan(tenantId, actorId, p = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Pull lines from any referenced sales orders.
    let soLines = [];
    if (Array.isArray(p.salesOrderIds) && p.salesOrderIds.length) {
      const { rows: docs } = await client.query(
        "SELECT lines FROM book_documents WHERE tenant_id=$1 AND doc_kind='SALES_ORDER' AND id = ANY($2::uuid[]) AND status <> 'CANCELLED'",
        [tenantId, p.salesOrderIds]
      );
      for (const d of docs) for (const ln of (Array.isArray(d.lines) ? d.lines : [])) soLines.push(ln);
    }
    const demand = aggregateDemand(soLines, p.forecast);
    if (!demand.size) throw new ErpError("Production plan has no demand (provide salesOrderIds or forecast[])", 422);

    const { rows: pr } = await client.query(
      "INSERT INTO erp_production_plans(tenant_id,name,warehouse_id,posting_date,note,created_by,status) VALUES($1,$2,$3,COALESCE($4,CURRENT_DATE),$5,$6,'DRAFT') RETURNING *",
      [tenantId, p.name || null, p.warehouseId || null, p.postingDate || null, p.note || null, actorId || null]
    );
    const plan = pr[0];
    let seq = 0;
    for (const [itemId, gross] of demand) {
      const bomId = await defaultBomForItem(client, tenantId, itemId, null);
      const avail = await onHandQty(client, tenantId, itemId);
      const planned = netRequirement(gross, avail);
      const src = soLines.some((l) => (l.itemId || l.item_id) === itemId) ? "sales_order" : "forecast";
      await client.query(
        "INSERT INTO erp_production_plan_items(tenant_id,production_plan_id,item_id,bom_id,demand_qty,available_qty,planned_qty,source,seq) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [tenantId, plan.id, itemId, bomId, toDb(gross), toDb(avail), toDb(planned), src, seq++]
      );
    }
    await client.query("COMMIT");
    return getProductionPlan(tenantId, plan.id);
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Run MRP: for every plan item with planned_qty>0, explode its BOM (multi-level,
// so SUB-ASSEMBLIES expand into raw materials), aggregate the gross raw-material
// requirement across all plan items, net each against on-hand stock, and persist
// the shortfall rows. A component that itself has a default BOM is flagged
// is_sub_assembly (it could be manufactured rather than purchased). Status → PLANNED.
async function runMrp(tenantId, planId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: pr } = await client.query("SELECT * FROM erp_production_plans WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, planId]);
    const plan = pr[0];
    if (!plan) throw new ErpError("Production plan not found", 404);
    if (plan.status === "CANCELLED") throw new ErpError("Plan is cancelled", 409);
    const { rows: items } = await client.query("SELECT * FROM erp_production_plan_items WHERE tenant_id=$1 AND production_plan_id=$2 ORDER BY seq", [tenantId, planId]);

    // Which items have their own default BOM (→ sub-assembly).
    const { rows: defs } = await client.query("SELECT DISTINCT item_id FROM erp_boms WHERE tenant_id=$1 AND is_active=true AND is_default=true", [tenantId]);
    const makeable = new Set(defs.map((d) => d.item_id));

    const gross = new Map(); // rawItemId → Decimal required
    for (const pi of items) {
      const planned = money(pi.planned_qty);
      if (!planned.gt(0)) continue;
      const bomId = pi.bom_id || await defaultBomForItem(client, tenantId, pi.item_id, null);
      if (!bomId) throw new ErpError(`Plan item ${pi.item_id} has no BOM to explode`, 422);
      const graph = await loadBomGraph(client, tenantId, bomId);
      const flat = explodeBom(graph, bomId, Number(planned.toFixed(6)));
      for (const r of flat) gross.set(r.itemId, (gross.get(r.itemId) || money(0)).plus(r.requiredQty));
    }

    await client.query("DELETE FROM erp_production_plan_materials WHERE tenant_id=$1 AND production_plan_id=$2", [tenantId, planId]);
    const materials = [];
    for (const [itemId, reqQty] of gross) {
      const avail = await onHandQty(client, tenantId, itemId);
      const shortfall = netRequirement(reqQty, avail);
      const rate = await itemRate(client, tenantId, itemId);
      const isSub = makeable.has(itemId);
      const { rows } = await client.query(
        "INSERT INTO erp_production_plan_materials(tenant_id,production_plan_id,item_id,required_qty,available_qty,shortfall_qty,rate,is_sub_assembly) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [tenantId, planId, itemId, toDb(reqQty), toDb(avail), toDb(shortfall), toDb(rate), isSub]
      );
      materials.push(rows[0]);
    }
    await client.query("UPDATE erp_production_plans SET status='PLANNED', updated_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId, planId]);
    await client.query("COMMIT");
    return { planId, materials };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Execute the plan: auto-raise a Work Order per plan item (planned_qty>0) and a
// single PURCHASE Material Request covering all raw-material shortfalls. Idempotent
// per row (skips items that already produced a WO / materials with an MR). → IN_PROCESS.
async function executePlan(tenantId, actorId, planId) {
  const { rows: pr } = await pool.query("SELECT * FROM erp_production_plans WHERE tenant_id=$1 AND id=$2", [tenantId, planId]);
  const plan = pr[0];
  if (!plan) throw new ErpError("Production plan not found", 404);
  if (plan.status === "DRAFT") throw new ErpError("Run MRP before executing the plan", 409);
  if (plan.status === "CANCELLED") throw new ErpError("Plan is cancelled", 409);

  const { rows: items } = await pool.query("SELECT * FROM erp_production_plan_items WHERE tenant_id=$1 AND production_plan_id=$2 ORDER BY seq", [tenantId, planId]);
  const workOrders = [];
  for (const pi of items) {
    if (!money(pi.planned_qty).gt(0) || pi.work_order_id) continue;
    let useBom = pi.bom_id;
    if (!useBom) {
      const client = await pool.connect();
      try { useBom = await defaultBomForItem(client, tenantId, pi.item_id, null); } finally { client.release(); }
    }
    if (!useBom) continue;
    const wo = await createWorkOrder(tenantId, actorId, { bomId: useBom, qty: Number(pi.planned_qty), finishedItemId: pi.item_id, warehouseId: plan.warehouse_id });
    await pool.query("UPDATE erp_work_orders SET production_plan_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, wo.id, planId]);
    await pool.query("UPDATE erp_production_plan_items SET work_order_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, pi.id, wo.id]);
    workOrders.push(wo.id);
  }

  // Shortfalls without an MR yet → one PURCHASE material request.
  const { rows: shorts } = await pool.query(
    "SELECT * FROM erp_production_plan_materials WHERE tenant_id=$1 AND production_plan_id=$2 AND shortfall_qty > 0 AND material_request_id IS NULL",
    [tenantId, planId]
  );
  let materialRequest = null;
  if (shorts.length) {
    materialRequest = await createMaterialRequest(tenantId, actorId, {
      requestType: "PURCHASE",
      note: `Production plan MRP shortfall (${plan.name || planId})`,
      items: shorts.map((s) => ({ itemId: s.item_id, qty: Number(s.shortfall_qty), projectedQty: Number(s.available_qty) })),
    });
    await pool.query("UPDATE erp_material_requests SET production_plan_id=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, materialRequest.id, planId]);
    await pool.query(
      "UPDATE erp_production_plan_materials SET material_request_id=$3 WHERE tenant_id=$1 AND production_plan_id=$2 AND material_request_id IS NULL AND shortfall_qty > 0",
      [tenantId, planId, materialRequest.id]
    );
  }
  await pool.query("UPDATE erp_production_plans SET status='IN_PROCESS', updated_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId, planId]);
  return { planId, workOrders, materialRequest };
}

async function listProductionPlans(tenantId) {
  return (await pool.query("SELECT * FROM erp_production_plans WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId])).rows;
}

async function getProductionPlan(tenantId, id) {
  const { rows: pr } = await pool.query("SELECT * FROM erp_production_plans WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!pr[0]) throw new ErpError("Production plan not found", 404);
  const { rows: items } = await pool.query(
    `SELECT pi.*, si.name AS item_name, si.unit FROM erp_production_plan_items pi
       LEFT JOIN book_stock_items si ON si.id = pi.item_id
      WHERE pi.tenant_id=$1 AND pi.production_plan_id=$2 ORDER BY pi.seq`, [tenantId, id]
  );
  const { rows: mats } = await pool.query(
    `SELECT pm.*, si.name AS item_name, si.unit FROM erp_production_plan_materials pm
       LEFT JOIN book_stock_items si ON si.id = pm.item_id
      WHERE pm.tenant_id=$1 AND pm.production_plan_id=$2 ORDER BY si.name`, [tenantId, id]
  );
  return { ...pr[0], items, materials: mats };
}

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE HIERARCHY + PUTAWAY  (port of ERPNext warehouse tree + Putaway Rule)
// ─────────────────────────────────────────────────────────────────────────────

// Create a warehouse node. A leaf (is_group=false) optionally maps to a books
// warehouse where stock physically lives; group nodes are structural (no stock).
async function createWarehouseNode(tenantId, w = {}) {
  if (!w.name) throw new ErpError("name required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (w.parentId) {
      const { rows: p } = await client.query("SELECT is_group FROM erp_warehouses WHERE tenant_id=$1 AND id=$2", [tenantId, w.parentId]);
      if (!p[0]) throw new ErpError("Parent warehouse not found", 404);
      if (!p[0].is_group) throw new ErpError("Parent must be a group (structural) warehouse", 422);
    }
    // A non-group leaf maps to a books warehouse (auto-create one if not supplied).
    let bookWhId = w.bookWarehouseId || null;
    if (!w.isGroup && !bookWhId) {
      const bw = await books.createWarehouse(tenantId, w.name, w.address || null);
      bookWhId = bw.id;
    }
    const lt = (w.locationType || "STORAGE").toUpperCase();
    const { rows } = await client.query(
      "INSERT INTO erp_warehouses(tenant_id,name,parent_id,book_warehouse_id,is_group,is_external,location_type,capacity_qty,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [tenantId, w.name, w.parentId || null, w.isGroup ? null : bookWhId, !!w.isGroup, !!w.isExternal, lt, w.capacityQty != null ? toDb(w.capacityQty) : null, w.sortOrder || 0]
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Flat list (caller can build the tree from parent_id).
async function listWarehouseNodes(tenantId) {
  return (await pool.query("SELECT * FROM erp_warehouses WHERE tenant_id=$1 ORDER BY sort_order, name", [tenantId])).rows;
}

// Build a nested tree from the flat rows.
async function warehouseTree(tenantId) {
  const rows = await listWarehouseNodes(tenantId);
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots = [];
  for (const r of byId.values()) {
    if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(r);
    else roots.push(r);
  }
  return roots;
}

async function createPutawayRule(tenantId, r = {}) {
  if (!r.warehouseId) throw new ErpError("warehouseId (target bin) required");
  if (!(Number(r.capacityQty) > 0)) throw new ErpError("capacityQty must be > 0");
  const { rows: wh } = await pool.query("SELECT is_group FROM erp_warehouses WHERE tenant_id=$1 AND id=$2", [tenantId, r.warehouseId]);
  if (!wh[0]) throw new ErpError("Target warehouse not found", 404);
  if (wh[0].is_group) throw new ErpError("Putaway target must be a leaf bin, not a group", 422);
  const { rows } = await pool.query(
    "INSERT INTO erp_putaway_rules(tenant_id,item_id,warehouse_id,capacity_qty,priority) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [tenantId, r.itemId || null, r.warehouseId, toDb(r.capacityQty), r.priority || 1]
  );
  return rows[0];
}

async function listPutawayRules(tenantId) {
  return (await pool.query("SELECT * FROM erp_putaway_rules WHERE tenant_id=$1 ORDER BY priority, created_at", [tenantId])).rows;
}

// Pure: split an incoming qty across candidate bins by remaining free capacity,
// in priority order (port of ERPNext apply_putaway_rule). bins: ordered
// [{ warehouseId, capacityQty(Decimal), occupiedQty(Decimal) }]. Returns
// assignments [{ warehouseId, qty }] + unassigned (capacity exhausted).
function planPutaway(bins, qty) {
  let remaining = money(qty);
  const assignments = [];
  for (const b of bins) {
    if (!remaining.gt(0)) break;
    const free = money(b.capacityQty).minus(b.occupiedQty);
    if (!free.gt(0)) continue;
    const place = free.lt(remaining) ? free : remaining;
    assignments.push({ warehouseId: b.warehouseId, qty: Number(place.toFixed(6)) });
    remaining = remaining.minus(place);
  }
  return { assignments, unassigned: Number(remaining.toFixed(6)) };
}

// Resolve a putaway plan for receiving `qty` of an item: gather active rules
// (item-specific first, then generic), compute current occupancy per target bin
// from books' per-warehouse balance, and split the qty by free capacity. This is
// a PLAN only — the caller still posts the receipt(s) through books.receive.
async function resolvePutaway(tenantId, itemId, qty) {
  const { rows: rules } = await pool.query(
    `SELECT pr.*, w.book_warehouse_id FROM erp_putaway_rules pr
       JOIN erp_warehouses w ON w.id = pr.warehouse_id
      WHERE pr.tenant_id=$1 AND pr.is_active=true AND (pr.item_id=$2 OR pr.item_id IS NULL)
      ORDER BY (pr.item_id IS NULL), pr.priority, pr.created_at`,
    [tenantId, itemId]
  );
  const bins = [];
  for (const r of rules) {
    let occupied = money(0);
    if (r.book_warehouse_id) {
      const { rows: bal } = await pool.query("SELECT qty FROM book_stock_balances WHERE tenant_id=$1 AND item_id=$2 AND warehouse_id=$3", [tenantId, itemId, r.book_warehouse_id]);
      occupied = money(bal[0] ? bal[0].qty : 0);
    }
    bins.push({ warehouseId: r.warehouse_id, bookWarehouseId: r.book_warehouse_id, capacityQty: r.capacity_qty, occupiedQty: occupied });
  }
  const plan = planPutaway(bins, qty);
  // attach bookWarehouseId for the caller to actually post against
  const byNode = new Map(bins.map((b) => [b.warehouseId, b.bookWarehouseId]));
  return {
    itemId, qty: Number(money(qty).toFixed(6)),
    assignments: plan.assignments.map((a) => ({ ...a, bookWarehouseId: byNode.get(a.warehouseId) || null })),
    unassigned: plan.unassigned,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-SOURCE CACHED PART VALUATION  (port of InvenTree Part pricing)
// ─────────────────────────────────────────────────────────────────────────────

// Pure: fold a list of {min,max} candidate ranges into one overall {min,max},
// ignoring null/empty sources (InvenTree update_pricing overall_min/overall_max).
function combineRanges(ranges) {
  let lo = null, hi = null;
  for (const r of ranges || []) {
    if (r == null) continue;
    const mn = r.min != null ? money(r.min) : null;
    const mx = r.max != null ? money(r.max) : (mn != null ? mn : null);
    const lmn = mn != null ? mn : mx;
    if (lmn != null) lo = lo == null || lmn.lt(lo) ? lmn : lo;
    if (mx != null) hi = hi == null || mx.gt(hi) ? mx : hi;
  }
  return { min: lo, max: hi };
}

// Normalise a price in `currency` to base (INR) using the books fx rate on date.
// getRate returns base-per-foreign-unit; a null rate (= base currency) means ×1.
async function toBaseRate(tenantId, price, currency, onDate) {
  if (!currency || String(currency).toUpperCase() === "INR") return money(price);
  const rate = await fx.getRate(tenantId, currency, onDate || new Date().toISOString().slice(0, 10));
  return money(price).mul(rate != null ? rate : 1);
}

// Compute (and cache) the min/max valuation range for an item from four sources:
//   1. internal weighted-avg valuation (books current value)
//   2. supplier price-breaks (erp_supplier_price_breaks, fx-normalised)
//   3. purchase history (inward book_stock_movements rate)
//   4. BOM cost rollup (its default BOM total_cost / output_qty)
// Persists into erp_item_valuation and returns the row. Pure folding via combineRanges.
async function recomputeItemValuation(tenantId, itemId) {
  const today = new Date().toISOString().slice(0, 10);
  // 1) internal
  const { rows: ir } = await pool.query("SELECT current_qty, current_value FROM book_stock_items WHERE tenant_id=$1 AND id=$2", [tenantId, itemId]);
  if (!ir[0]) throw new ErpError("Item not found", 404);
  const internal = money(ir[0].current_qty).gt(0) ? money(ir[0].current_value).div(ir[0].current_qty) : null;

  // 2) supplier price-breaks (fx-normalised to base)
  const { rows: spb } = await pool.query("SELECT price, currency FROM erp_supplier_price_breaks WHERE tenant_id=$1 AND item_id=$2", [tenantId, itemId]);
  let supMin = null, supMax = null;
  for (const b of spb) {
    const base = await toBaseRate(tenantId, b.price, b.currency, today);
    supMin = supMin == null || base.lt(supMin) ? base : supMin;
    supMax = supMax == null || base.gt(supMax) ? base : supMax;
  }

  // 3) purchase history — inward movements with a positive rate
  const { rows: pmm } = await pool.query(
    "SELECT MIN(rate) AS mn, MAX(rate) AS mx FROM book_stock_movements WHERE tenant_id=$1 AND item_id=$2 AND qty_in > 0 AND rate > 0",
    [tenantId, itemId]
  );
  const purMin = pmm[0] && pmm[0].mn != null ? money(pmm[0].mn) : null;
  const purMax = pmm[0] && pmm[0].mx != null ? money(pmm[0].mx) : null;

  // 4) BOM rollup — default active BOM for this item
  const { rows: bom } = await pool.query(
    "SELECT total_cost, output_qty FROM erp_boms WHERE tenant_id=$1 AND item_id=$2 AND is_active=true ORDER BY is_default DESC, created_at LIMIT 1",
    [tenantId, itemId]
  );
  const bomRate = bom[0] && money(bom[0].output_qty).gt(0) ? money(bom[0].total_cost).div(bom[0].output_qty) : null;

  const overall = combineRanges([
    internal != null ? { min: internal, max: internal } : null,
    supMin != null ? { min: supMin, max: supMax } : null,
    purMin != null ? { min: purMin, max: purMax } : null,
    bomRate != null ? { min: bomRate, max: bomRate } : null,
  ]);
  const oMin = overall.min != null ? overall.min : money(0);
  const oMax = overall.max != null ? overall.max : oMin;

  const { rows } = await pool.query(
    `INSERT INTO erp_item_valuation(tenant_id,item_id,internal_rate,supplier_min,supplier_max,purchase_min,purchase_max,bom_rate,overall_min,overall_max,currency,computed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR',now())
     ON CONFLICT (tenant_id,item_id) DO UPDATE SET
       internal_rate=EXCLUDED.internal_rate, supplier_min=EXCLUDED.supplier_min, supplier_max=EXCLUDED.supplier_max,
       purchase_min=EXCLUDED.purchase_min, purchase_max=EXCLUDED.purchase_max, bom_rate=EXCLUDED.bom_rate,
       overall_min=EXCLUDED.overall_min, overall_max=EXCLUDED.overall_max, computed_at=now()
     RETURNING *`,
    [tenantId, itemId,
     internal != null ? toDb(internal) : null,
     supMin != null ? toDb(supMin) : null, supMax != null ? toDb(supMax) : null,
     purMin != null ? toDb(purMin) : null, purMax != null ? toDb(purMax) : null,
     bomRate != null ? toDb(bomRate) : null, toDb(oMin), toDb(oMax)]
  );
  return rows[0];
}

async function getItemValuation(tenantId, itemId) {
  const { rows } = await pool.query("SELECT * FROM erp_item_valuation WHERE tenant_id=$1 AND item_id=$2", [tenantId, itemId]);
  if (rows[0]) return rows[0];
  return recomputeItemValuation(tenantId, itemId); // compute on first access
}

async function addSupplierPriceBreak(tenantId, b = {}) {
  if (!b.itemId || b.price == null) throw new ErpError("itemId and price required");
  const { rows } = await pool.query(
    "INSERT INTO erp_supplier_price_breaks(tenant_id,item_id,supplier,min_qty,price,currency) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [tenantId, b.itemId, b.supplier || null, toDb(b.minQty || 1), toDb(b.price), (b.currency || "INR").toUpperCase()]
  );
  await recomputeItemValuation(tenantId, b.itemId).catch(() => {}); // auto-recalc
  return rows[0];
}

// Recompute valuation for a set of items (called after PO/SO/BOM change). Best-effort.
async function recomputeValuations(tenantId, itemIds) {
  const out = [];
  for (const id of itemIds || []) {
    try { out.push(await recomputeItemValuation(tenantId, id)); } catch (e) { /* skip */ }
  }
  return out;
}

module.exports = {
  ErpError,
  // pure (testable)
  explodeBom, operationCost, rollupCost, scaleOperation, jobCardCost, reorderSuggestion, materialRequestStatus, deriveWoStatus,
  netRequirement, aggregateDemand, planPutaway, combineRanges,
  // BOM
  createBom, listBoms, getBom, explodedBom,
  // work orders
  createWorkOrder, getWorkOrder, listWorkOrders, transferMaterials, manufacture,
  // job cards
  startJobCard, completeJobCard,
  // material requests + reorder
  createMaterialRequest, listMaterialRequests, markOrdered, reorderReport, raiseReorderRequest,
  // production planning / MRP
  createProductionPlan, runMrp, executePlan, listProductionPlans, getProductionPlan,
  // warehouse hierarchy + putaway
  createWarehouseNode, listWarehouseNodes, warehouseTree, createPutawayRule, listPutawayRules, resolvePutaway,
  // multi-source valuation
  recomputeItemValuation, getItemValuation, addSupplierPriceBreak, recomputeValuations,
};
