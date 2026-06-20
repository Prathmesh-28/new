// §8 — Inventory. Quantity + valuation subsidiary (WEIGHTED_AVG default, FIFO
// optional). Valuation math is pure/testable. COGS posting is caller-driven so
// we never double-count against a periodic Purchases expense.
const { pool } = require("../../db");
const { money, toDb, gt } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

// ── Pure valuation ───────────────────────────────────────────────────────────
function applyInwardWAvg(prev, qtyIn, rateIn) {
  const qty = money(prev.qty).plus(qtyIn);
  const value = money(prev.value).plus(money(qtyIn).mul(rateIn));
  return { qty, value, avg: qty.greaterThan(0) ? value.div(qty) : money(0) };
}
function applyOutwardWAvg(prev, qtyOut) {
  const avg = money(prev.qty).greaterThan(0) ? money(prev.value).div(prev.qty) : money(0);
  const cogs = money(qtyOut).mul(avg);
  return { qty: money(prev.qty).minus(qtyOut), value: money(prev.value).minus(cogs), cogs, avg };
}
// lots: [{ id?, qtyRemaining, rate }] oldest-first.
function consumeFifo(lots, qtyOut) {
  let remaining = money(qtyOut), cogs = money(0);
  const consumed = [];
  for (const lot of lots) {
    if (!gt(remaining, 0)) break;
    const avail = money(lot.qtyRemaining);
    const take = avail.lessThan(remaining) ? avail : remaining;
    cogs = cogs.plus(take.mul(lot.rate));
    remaining = remaining.minus(take);
    consumed.push({ id: lot.id, take });
  }
  return { cogs, remaining, consumed }; // remaining > 0 ⇒ short stock
}

// ── Masters ──────────────────────────────────────────────────────────────────
async function createItem(tenantId, d) {
  if (!d.name || !d.unit) throw new PostError("BAD_INPUT", "name and unit required", 400);
  const openQty = toDb(d.openingQty || 0), openVal = toDb(d.openingValue || 0);
  const { rows } = await pool.query(
    `INSERT INTO book_stock_items(tenant_id,name,unit,hsn_sac,gst_rate,opening_qty,opening_value,valuation_method,reorder_level,current_qty,current_value,item_group,allow_negative)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$7,$10,$11) RETURNING *`,
    [tenantId, d.name, d.unit, d.hsn || null, d.gstRate || null, openQty, openVal, d.valuationMethod === "FIFO" ? "FIFO" : "WEIGHTED_AVG", toDb(d.reorderLevel || 0), d.itemGroup || null, !!d.allowNegative]
  );
  return rows[0];
}
async function createWarehouse(tenantId, name, address) {
  const { rows } = await pool.query("INSERT INTO book_warehouses(tenant_id,name,address) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO UPDATE SET address=EXCLUDED.address RETURNING *", [tenantId, name, address || null]);
  return rows[0];
}
async function createPriceList(tenantId, name, currency) {
  const { rows } = await pool.query("INSERT INTO book_price_lists(tenant_id,name,currency) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING RETURNING *", [tenantId, name, currency || "INR"]);
  return rows[0] || (await pool.query("SELECT * FROM book_price_lists WHERE tenant_id=$1 AND name=$2", [tenantId, name])).rows[0];
}
async function setPrice(tenantId, priceListId, itemId, price) {
  const { rows } = await pool.query(
    "INSERT INTO book_price_list_items(tenant_id,price_list_id,item_id,price) VALUES($1,$2,$3,$4) ON CONFLICT(price_list_id,item_id) DO UPDATE SET price=EXCLUDED.price RETURNING *",
    [tenantId, priceListId, itemId, toDb(price)]
  );
  return rows[0];
}
async function priceFor(tenantId, itemId, priceListId) {
  const { rows } = await pool.query("SELECT price FROM book_price_list_items WHERE tenant_id=$1 AND item_id=$2 AND price_list_id=$3", [tenantId, itemId, priceListId]);
  return rows[0] ? rows[0].price : null;
}

// ── Movements (valuation + balances) ─────────────────────────────────────────
async function _movement(client, tenantId, itemId, { qtyIn = 0, qtyOut = 0, rate = 0, value, voucherId = null, warehouseId = null }) {
  await client.query(
    "INSERT INTO book_stock_movements(tenant_id,voucher_id,item_id,qty_in,qty_out,rate,value,warehouse_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [tenantId, voucherId, itemId, toDb(qtyIn), toDb(qtyOut), toDb(rate), toDb(value), warehouseId]
  );
  if (warehouseId) {
    await client.query(
      `INSERT INTO book_stock_balances(tenant_id,item_id,warehouse_id,qty) VALUES($1,$2,$3,$4)
       ON CONFLICT(tenant_id,item_id,warehouse_id) DO UPDATE SET qty = book_stock_balances.qty + $4`,
      [tenantId, itemId, warehouseId, toDb(money(qtyIn).minus(qtyOut))]
    );
  }
}

async function receive(tenantId, itemId, qty, rate, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: ir } = await client.query("SELECT * FROM book_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, itemId]);
    const item = ir[0];
    if (!item) throw new PostError("NOT_FOUND", "Item not found", 404);
    const next = applyInwardWAvg({ qty: item.current_qty, value: item.current_value }, qty, rate);
    await client.query("UPDATE book_stock_items SET current_qty=$2, current_value=$3 WHERE id=$1", [itemId, toDb(next.qty), toDb(next.value)]);
    if (item.valuation_method === "FIFO") {
      await client.query("INSERT INTO book_stock_lots(tenant_id,item_id,warehouse_id,in_movement_id,qty_remaining,rate,received_on,batch_no,mfg_date,expiry_date) VALUES($1,$2,$3,gen_random_uuid(),$4,$5,$6,$7,$8,$9)", [tenantId, itemId, opts.warehouseId || null, toDb(qty), toDb(rate), opts.date || new Date().toISOString().slice(0, 10), opts.batchNo || null, opts.mfgDate || null, opts.expiryDate || null]);
    }
    await _movement(client, tenantId, itemId, { qtyIn: qty, rate, value: money(qty).mul(rate), voucherId: opts.voucherId, warehouseId: opts.warehouseId });
    await client.query("COMMIT");
    return { qty: toDb(next.qty), value: toDb(next.value), avg: toDb(next.avg) };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

async function issue(tenantId, itemId, qty, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: ir } = await client.query("SELECT * FROM book_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, itemId]);
    const item = ir[0];
    if (!item) throw new PostError("NOT_FOUND", "Item not found", 404);
    if (gt(qty, item.current_qty) && !item.allow_negative) throw new PostError("NEGATIVE_STOCK", `Only ${item.current_qty} ${item.unit} of ${item.name} on hand`, 409);
    // Per-warehouse negative-stock guard (the global current_qty check above can't
    // catch issuing more than a *specific* warehouse holds).
    if (opts.warehouseId && !item.allow_negative) {
      const { rows: wb } = await client.query("SELECT qty FROM book_stock_balances WHERE tenant_id=$1 AND item_id=$2 AND warehouse_id=$3 FOR UPDATE", [tenantId, itemId, opts.warehouseId]);
      const whQty = wb[0] ? wb[0].qty : 0;
      if (gt(qty, whQty)) throw new PostError("NEGATIVE_STOCK", `Only ${whQty} ${item.unit} of ${item.name} in that warehouse`, 409);
    }

    let cogs;
    if (item.valuation_method === "FIFO") {
      // FEFO (first-expiry-first-out) when opts.fefo: expiring lots leave first;
      // lots with no expiry sort last. Otherwise plain FIFO by received_on.
      const orderBy = opts.fefo ? "expiry_date NULLS LAST, received_on, id" : "received_on, id";
      const { rows: lots } = await client.query(`SELECT id, qty_remaining AS "qtyRemaining", rate FROM book_stock_lots WHERE tenant_id=$1 AND item_id=$2 AND qty_remaining>0 ORDER BY ${orderBy}`, [tenantId, itemId]);
      const r = consumeFifo(lots, qty);
      if (gt(r.remaining, 0) && !item.allow_negative) throw new PostError("NEGATIVE_STOCK", "Insufficient FIFO lots", 409);
      cogs = r.cogs;
      for (const c of r.consumed) await client.query("UPDATE book_stock_lots SET qty_remaining = qty_remaining - $2 WHERE id=$1", [c.id, toDb(c.take)]);
      await client.query("UPDATE book_stock_items SET current_qty=current_qty-$2, current_value=current_value-$3 WHERE id=$1", [itemId, toDb(qty), toDb(cogs)]);
    } else {
      const out = applyOutwardWAvg({ qty: item.current_qty, value: item.current_value }, qty);
      cogs = out.cogs;
      await client.query("UPDATE book_stock_items SET current_qty=$2, current_value=$3 WHERE id=$1", [itemId, toDb(out.qty), toDb(out.value)]);
    }
    await _movement(client, tenantId, itemId, { qtyOut: qty, rate: money(qty).greaterThan(0) ? money(cogs).div(qty) : money(0), value: cogs, voucherId: opts.voucherId, warehouseId: opts.warehouseId });
    await client.query("COMMIT");
    return { cogs: toDb(cogs) };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Move stock between warehouses (no P&L impact) at current avg cost.
async function transfer(tenantId, itemId, fromWh, toWh, qty) {
  if (!fromWh || !toWh || fromWh === toWh) throw new PostError("BAD_INPUT", "distinct fromWh and toWh required", 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: br } = await client.query("SELECT qty FROM book_stock_balances WHERE tenant_id=$1 AND item_id=$2 AND warehouse_id=$3", [tenantId, itemId, fromWh]);
    if (!br[0] || gt(qty, br[0].qty)) throw new PostError("NEGATIVE_STOCK", "Not enough stock in source warehouse", 409);
    const { rows: ir } = await client.query("SELECT current_qty, current_value FROM book_stock_items WHERE tenant_id=$1 AND id=$2", [tenantId, itemId]);
    const avg = money(ir[0].current_qty).greaterThan(0) ? money(ir[0].current_value).div(ir[0].current_qty) : money(0);
    await _movement(client, tenantId, itemId, { qtyOut: qty, rate: avg, value: money(qty).mul(avg), warehouseId: fromWh });
    await _movement(client, tenantId, itemId, { qtyIn: qty, rate: avg, value: money(qty).mul(avg), warehouseId: toWh });
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
}

// Post the closing-stock value to the GL (Dr Stock-in-hand / Cr Stock Adjustment).
async function postStockValueJournal(tenantId, actorId, date) {
  const stockLedger = await ledgerIdByName(tenantId, "Stock-in-hand");
  const adjLedger = await ledgerIdByName(tenantId, "Stock Adjustment");
  if (!stockLedger || !adjLedger) throw new PostError("NOT_SEEDED", "Stock-in-hand / Stock Adjustment ledgers missing — seed first", 422);
  const { rows } = await pool.query("SELECT COALESCE(SUM(current_value),0) AS v FROM book_stock_items WHERE tenant_id=$1", [tenantId]);
  const value = rows[0].v;
  if (!gt(value, 0)) return { posted: false, value: toDb(0) };
  const r = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: date, narration: "Closing stock valuation", source: "api" },
    [{ ledgerId: stockLedger, debit: toDb(value), credit: "0" }, { ledgerId: adjLedger, debit: "0", credit: toDb(value) }]);
  return { posted: true, value: toDb(value), voucher: r };
}

async function lowStock(tenantId) {
  const { rows } = await pool.query("SELECT id,name,unit,current_qty,reorder_level FROM book_stock_items WHERE tenant_id=$1 AND is_active=true AND current_qty <= reorder_level AND reorder_level > 0 ORDER BY name", [tenantId]);
  return rows;
}
async function itemLedger(tenantId, itemId) {
  const { rows } = await pool.query("SELECT m.created_at, m.qty_in, m.qty_out, m.rate, m.value, v.voucher_type, v.voucher_number FROM book_stock_movements m LEFT JOIN book_vouchers v ON v.id=m.voucher_id WHERE m.tenant_id=$1 AND m.item_id=$2 ORDER BY m.created_at", [tenantId, itemId]);
  return rows;
}

// ── Batch / expiry ───────────────────────────────────────────────────────────
// Lots (FIFO items) whose expiry_date falls within `days` from today and still
// have stock — the "use these now or write them off" list.
async function nearExpiry(tenantId, days = 90) {
  const { rows } = await pool.query(
    `SELECT i.name AS item_name, l.item_id, l.batch_no, l.expiry_date, l.qty_remaining AS qty
       FROM book_stock_lots l
       JOIN book_stock_items i ON i.id = l.item_id
      WHERE l.tenant_id=$1 AND l.expiry_date IS NOT NULL
        AND l.qty_remaining > 0
        AND l.expiry_date <= (CURRENT_DATE + ($2 || ' days')::interval)
      ORDER BY l.expiry_date, i.name`,
    [tenantId, String(days)]
  );
  return rows;
}

// ── UoM conversion ─────────────────────────────────────────────────────────────
// conversions = [{ unit, factor }] where factor = base units per 1 of `unit`.
// Stored on book_stock_items.uom_conversions (JSONB). receive/issue always work
// in BASE units; convertQty is a helper callers use before posting.
async function setUomConversions(tenantId, itemId, conversions) {
  if (!Array.isArray(conversions)) throw new PostError("BAD_INPUT", "conversions must be an array", 400);
  const clean = conversions.map((c) => {
    if (!c || !c.unit || !gt(c.factor, 0)) throw new PostError("BAD_INPUT", "each conversion needs unit and factor>0", 400);
    return { unit: String(c.unit), factor: toDb(c.factor) };
  });
  const { rows } = await pool.query(
    "UPDATE book_stock_items SET uom_conversions=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, itemId, JSON.stringify(clean)]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Item not found", 404);
  return rows[0];
}

// item = a book_stock_items row (uses item.unit as base + item.uom_conversions).
// Returns a money() Decimal of qty expressed in base units.
function convertQty(item, qty, fromUnit) {
  if (!fromUnit || fromUnit === item.unit) return money(qty);
  const list = Array.isArray(item.uom_conversions) ? item.uom_conversions
    : (typeof item.uom_conversions === "string" && item.uom_conversions ? JSON.parse(item.uom_conversions) : []);
  const conv = (list || []).find((c) => c.unit === fromUnit);
  if (!conv) throw new PostError("BAD_INPUT", `No UoM conversion for ${fromUnit} on ${item.name}`, 400);
  return money(qty).mul(conv.factor);
}

// ── Stock journal / manufacture ───────────────────────────────────────────────
// Issue each consumed item (raw materials → COGS) and receive each produced item.
// For manufacture the produced rate defaults to total consumed cost / produced qty
// (cost roll-up). Quantities are in BASE units. No GL P&L beyond stock valuation.
async function stockEntry(tenantId, actorId, { consumes = [], produces = [], date } = {}) {
  const consumed = [], produced = [];
  let totalCost = money(0);
  for (const c of consumes) {
    const r = await issue(tenantId, c.itemId, c.qty, { warehouseId: c.warehouseId || null, date });
    totalCost = totalCost.plus(r.cogs);
    consumed.push({ itemId: c.itemId, qty: toDb(c.qty), cogs: r.cogs });
  }
  const totalProducedQty = produces.reduce((a, p) => a.plus(p.qty), money(0));
  for (const p of produces) {
    // Default rate: roll consumed cost onto output proportionally by qty.
    let rate = p.rate != null ? money(p.rate)
      : (gt(totalProducedQty, 0) ? totalCost.div(totalProducedQty) : money(0));
    const r = await receive(tenantId, p.itemId, p.qty, rate, { warehouseId: p.warehouseId || null, date });
    produced.push({ itemId: p.itemId, qty: toDb(p.qty), rate: toDb(rate), value: r });
  }
  return { consumed, produced, totalCost: toDb(totalCost) };
}

// ── Physical adjustment (stock count) ─────────────────────────────────────────
// Reconcile system qty to a physical count: surplus → receive, shortage → issue
// the difference, and post the value delta to the 'Stock Adjustment' ledger so
// the GL stays in step with the subsidiary. Returns the before/after picture.
async function physicalAdjust(tenantId, actorId, { itemId, countedQty, warehouseId = null, date } = {}) {
  const { rows: ir } = await pool.query("SELECT * FROM book_stock_items WHERE tenant_id=$1 AND id=$2", [tenantId, itemId]);
  const item = ir[0];
  if (!item) throw new PostError("NOT_FOUND", "Item not found", 404);

  let before;
  if (warehouseId) {
    const { rows: wb } = await pool.query("SELECT qty FROM book_stock_balances WHERE tenant_id=$1 AND item_id=$2 AND warehouse_id=$3", [tenantId, itemId, warehouseId]);
    before = money(wb[0] ? wb[0].qty : 0);
  } else {
    before = money(item.current_qty);
  }
  const counted = money(countedQty);
  const variance = counted.minus(before); // + surplus, − shortage
  if (variance.isZero()) return { before: toDb(before), counted: toDb(counted), variance: toDb(0), adjusted: null };

  const avg = money(item.current_qty).greaterThan(0) ? money(item.current_value).div(item.current_qty) : money(0);
  let valueDelta, adjusted;
  if (gt(variance, 0)) {
    // Surplus: receive the difference at current avg cost.
    adjusted = await receive(tenantId, itemId, variance, avg, { warehouseId, date });
    valueDelta = variance.mul(avg);
  } else {
    // Shortage: issue the absolute difference (allow_negative-aware via issue()).
    const out = variance.abs();
    const r = await issue(tenantId, itemId, out, { warehouseId, date });
    adjusted = r;
    valueDelta = money(r.cogs).neg();
  }

  // GL: keep Stock-in-hand in step with the subsidiary against Stock Adjustment.
  if (!valueDelta.isZero()) {
    const stockLedger = await ledgerIdByName(tenantId, "Stock-in-hand");
    const adjLedger = await ledgerIdByName(tenantId, "Stock Adjustment");
    if (!stockLedger || !adjLedger) throw new PostError("NOT_SEEDED", "Stock-in-hand / Stock Adjustment ledgers missing — seed first", 422);
    const amt = valueDelta.abs();
    const surplus = gt(valueDelta, 0);
    // Surplus → Dr Stock-in-hand / Cr Stock Adjustment; shortage → reverse.
    await postVoucher(tenantId, actorId,
      { voucherType: "JOURNAL", voucherDate: date || new Date().toISOString().slice(0, 10), narration: `Stock adjustment: ${item.name}`, source: "api" },
      surplus
        ? [{ ledgerId: stockLedger, debit: toDb(amt), credit: "0" }, { ledgerId: adjLedger, debit: "0", credit: toDb(amt) }]
        : [{ ledgerId: adjLedger, debit: toDb(amt), credit: "0" }, { ledgerId: stockLedger, debit: "0", credit: toDb(amt) }]);
  }

  return { before: toDb(before), counted: toDb(counted), variance: toDb(variance), adjusted };
}

module.exports = {
  applyInwardWAvg, applyOutwardWAvg, consumeFifo,
  createItem, createWarehouse, createPriceList, setPrice, priceFor,
  receive, issue, transfer, postStockValueJournal, lowStock, itemLedger,
  nearExpiry, setUomConversions, convertQty, stockEntry, physicalAdjust,
};
