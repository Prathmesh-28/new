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
      await client.query("INSERT INTO book_stock_lots(tenant_id,item_id,warehouse_id,in_movement_id,qty_remaining,rate,received_on) VALUES($1,$2,$3,gen_random_uuid(),$4,$5,$6)", [tenantId, itemId, opts.warehouseId || null, toDb(qty), toDb(rate), opts.date || new Date().toISOString().slice(0, 10)]);
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
      const { rows: lots } = await client.query("SELECT id, qty_remaining AS \"qtyRemaining\", rate FROM book_stock_lots WHERE tenant_id=$1 AND item_id=$2 AND qty_remaining>0 ORDER BY received_on, id", [tenantId, itemId]);
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

module.exports = {
  applyInwardWAvg, applyOutwardWAvg, consumeFifo,
  createItem, createWarehouse, createPriceList, setPrice, priceFor,
  receive, issue, transfer, postStockValueJournal, lowStock, itemLedger,
};
