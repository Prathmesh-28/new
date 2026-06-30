// §8.R - Stock REPOSTING (repost_item_valuation, ported in spirit from
// frappe/erpnext stock/doctype/repost_item_valuation). The problem it solves: a
// back-dated stock movement, or a rate correction on a past receipt, invalidates
// the method-derived outgoing rate (WAVG / FIFO) and the running balance of every
// LATER movement of the same item. Re-pricing those rows by hand is how books
// drift from the subsidiary. Instead we recompute the whole chronological chain
// for the affected item and post ONE GL Stock-Adjustment correction voucher for
// the net valuation delta - never mutating posted vouchers (§6.5).
//
// Correctness over cleverness: we replay the item's ENTIRE Stock-Ledger from its
// opening balance in chronological order (posting_date, then created_at). This is
// deterministic and self-healing - `fromDate` only bounds WHICH rows we treat as
// "downstream" (and dates the GL correction); the replay itself always starts from
// the opening so a previously-botched mid-history row cannot poison the result.
//
// What gets rewritten on each SLE row: rate, value, qty_after, value_after and
// (FIFO) the fifo_queue snapshot. What gets re-synced after: book_stock_items
// current_qty/current_value, and (FIFO) book_stock_lots qty_remaining.
const { pool } = require("../../db");
const { money, toDb, gt, eq } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

const today = () => new Date().toISOString().slice(0, 10);

// ── Pure replay of one item's chronological Stock Ledger ──────────────────────
// rows: SLE rows oldest-first, each { id, qty_in, qty_out, rate, value }.
// method: 'FIFO' | 'WEIGHTED_AVG'. opening: { qty, value } before the first row.
// Returns { recomputed:[{id, rate, value, qtyAfter, valueAfter, fifoQueue}], queue,
//           qtyAfter, valueAfter } - `queue` is the final FIFO layer list.
//
// For an INWARD row we trust the stored `rate` (that is the purchase/landed cost -
// the only authoritative input). For an OUTWARD row we DERIVE the rate from the
// running method so a back-dated inward correctly re-prices later issues.
function replayLedger(rows, method, opening = { qty: 0, value: 0 }) {
  const isFifo = method === "FIFO";
  let qty = money(opening.qty), value = money(opening.value);
  let queue = []; // [{ qty, rate }] oldest-first, FIFO only
  if (isFifo && gt(opening.qty, 0)) {
    const r = gt(opening.qty, 0) ? money(opening.value).div(opening.qty) : money(0);
    queue.push({ qty: money(opening.qty), rate: r });
  }
  const recomputed = [];
  for (const row of rows) {
    const qIn = money(row.qty_in), qOut = money(row.qty_out);
    let rate, val;
    if (gt(qIn, 0)) {
      // Inward: authoritative rate from the row itself.
      rate = money(row.rate);
      val = qIn.mul(rate);
      qty = qty.plus(qIn);
      value = value.plus(val);
      if (isFifo) queue.push({ qty: qIn, rate });
    } else if (gt(qOut, 0)) {
      // Outward: rate is method-derived.
      if (isFifo) {
        let need = qOut, cogs = money(0);
        while (gt(need, 0) && queue.length) {
          const lot = queue[0];
          const take = lot.qty.lessThan(need) ? lot.qty : need;
          cogs = cogs.plus(take.mul(lot.rate));
          lot.qty = lot.qty.minus(take);
          need = need.minus(take);
          if (!gt(lot.qty, 0)) queue.shift();
        }
        // Short stock (allow_negative): price the shortfall at the last known rate.
        if (gt(need, 0)) {
          const last = recomputed.length ? money(recomputed[recomputed.length - 1].rate) : money(row.rate);
          cogs = cogs.plus(need.mul(last));
        }
        val = cogs;
        rate = gt(qOut, 0) ? cogs.div(qOut) : money(0);
      } else {
        const avg = gt(qty, 0) ? value.div(qty) : money(0);
        val = qOut.mul(avg);
        rate = avg;
      }
      qty = qty.minus(qOut);
      value = value.minus(val);
    } else {
      rate = money(row.rate); val = money(0);
    }
    recomputed.push({
      id: row.id, rate, value: val, qtyAfter: qty, valueAfter: value,
      fifoQueue: isFifo ? queue.map((l) => ({ qty: l.qty, rate: l.rate })) : null,
    });
  }
  return { recomputed, queue, qtyAfter: qty, valueAfter: value };
}

// ── Persist a repost run (audit + recovery) ───────────────────────────────────
async function _logRepost(client, tenantId, actorId, itemId, warehouseId, fromDate, status, detail) {
  await client.query(
    `INSERT INTO book_repost_runs(tenant_id, item_id, warehouse_id, from_date, status, detail, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(tenant_id, item_id, from_date)
       DO UPDATE SET status=$5, detail=$6, warehouse_id=$3, created_by=$7, updated_at=now()`,
    [tenantId, itemId, warehouseId, fromDate, status, JSON.stringify(detail || {}), actorId || null]
  );
}

// ── Repost a single item from a date ──────────────────────────────────────────
// Recomputes the whole chronological SLE for `itemId`, rewrites each downstream
// row, re-syncs item balance + FIFO lots, and posts a GL Stock-Adjustment voucher
// for the net valuation delta (sum of value_after changes on/after fromDate). The
// rewrite runs in ONE txn; the GL correction posts AFTER commit via the engine
// (atomic + idempotent on its own). `warehouseId` is recorded but valuation is
// item-level (WAVG) / lot-level (FIFO) so it does not partition the replay.
async function repostItem(tenantId, { itemId, warehouseId = null, fromDate, actorId, reason } = {}) {
  if (!itemId) throw new PostError("BAD_INPUT", "itemId required", 400);
  const from = fromDate || today();
  const client = await pool.connect();
  let delta, voucherShape = null, count = 0;
  try {
    await client.query("BEGIN");
    const { rows: ir } = await client.query("SELECT * FROM book_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, itemId]);
    const item = ir[0];
    if (!item) throw new PostError("NOT_FOUND", "Item not found", 404);

    // Whole-history replay, oldest-first. Lock the rows so a concurrent movement
    // cannot interleave (the FOR UPDATE on the item row already serialises that).
    const { rows: sles } = await client.query(
      `SELECT id, qty_in, qty_out, rate, value, value_after, posting_date
         FROM book_stock_movements WHERE tenant_id=$1 AND item_id=$2
        ORDER BY posting_date, created_at, id`,
      [tenantId, itemId]
    );
    const opening = { qty: item.opening_qty, value: item.opening_value };
    const { recomputed, queue, qtyAfter, valueAfter } = replayLedger(sles, item.valuation_method, opening);

    // Net valuation delta = Σ (new value_after − old value_after) on/after fromDate
    // for the LAST row at-or-after the cutoff. The cleanest correction is the change
    // in CLOSING value of the item from what it was: new closing − old closing.
    const oldClosing = money(item.current_value);
    delta = valueAfter.minus(oldClosing);

    // Rewrite each row whose value materially changed (avoids no-op writes).
    const byId = new Map(sles.map((r) => [r.id, r]));
    for (const rc of recomputed) {
      const old = byId.get(rc.id);
      const changed = !eq(rc.value, old.value) || old.value_after == null || !eq(rc.valueAfter, old.value_after);
      if (!changed) continue;
      count++;
      await client.query(
        `UPDATE book_stock_movements SET rate=$2, value=$3, qty_after=$4, value_after=$5, fifo_queue=$6, reposted_at=now()
          WHERE id=$1`,
        [rc.id, toDb(rc.rate), toDb(rc.value), toDb(rc.qtyAfter), toDb(rc.valueAfter),
         rc.fifoQueue == null ? null : JSON.stringify(rc.fifoQueue.map((l) => ({ qty: toDb(l.qty), rate: toDb(l.rate) })))]
      );
    }

    // Re-sync the item's running balance to the replay's final state.
    await client.query("UPDATE book_stock_items SET current_qty=$2, current_value=$3 WHERE id=$1",
      [itemId, toDb(qtyAfter), toDb(valueAfter)]);

    // FIFO: rebuild qty_remaining on the open lots from the final queue. We match
    // the final queue layers back onto the lots oldest-first (same order they were
    // received) so qty_remaining reflects the recomputed consumption.
    if (item.valuation_method === "FIFO") {
      const { rows: lots } = await client.query(
        "SELECT id FROM book_stock_lots WHERE tenant_id=$1 AND item_id=$2 ORDER BY received_on, id",
        [tenantId, itemId]
      );
      // queue holds remaining layers oldest-first; zero out then apply.
      await client.query("UPDATE book_stock_lots SET qty_remaining=0 WHERE tenant_id=$1 AND item_id=$2", [tenantId, itemId]);
      // The replay queue does not carry lot ids; map remaining qty onto lots oldest-first.
      let qi = 0;
      for (const lot of lots) {
        if (qi >= queue.length) break;
        const layer = queue[qi];
        await client.query("UPDATE book_stock_lots SET qty_remaining=$2 WHERE id=$1", [lot.id, toDb(layer.qty)]);
        qi++;
      }
    }

    await _logRepost(client, tenantId, actorId, itemId, warehouseId, from, "REWRITTEN", { reason: reason || "manual", rowsRewritten: count, delta: toDb(delta), oldClosing: toDb(oldClosing), newClosing: toDb(valueAfter) });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    // Record the failure for recovery (separate connection - txn rolled back).
    await pool.query(
      `INSERT INTO book_repost_runs(tenant_id, item_id, warehouse_id, from_date, status, detail, created_by)
         VALUES($1,$2,$3,$4,'FAILED',$5,$6)
       ON CONFLICT(tenant_id, item_id, from_date) DO UPDATE SET status='FAILED', detail=$5, updated_at=now()`,
      [tenantId, itemId, warehouseId, from, JSON.stringify({ error: e.message, code: e.code || null }), actorId || null]
    ).catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // GL correction posts through the engine (its own atomic txn). Dr Stock-in-hand /
  // Cr Stock Adjustment for a positive delta (stock worth more), reverse otherwise.
  if (delta && !delta.isZero()) {
    const stockLedger = await ledgerIdByName(tenantId, "Stock-in-hand");
    const adjLedger = await ledgerIdByName(tenantId, "Stock Adjustment");
    if (!stockLedger || !adjLedger) throw new PostError("NOT_SEEDED", "Stock-in-hand / Stock Adjustment ledgers missing - seed first", 422);
    const amt = delta.abs();
    const up = gt(delta, 0);
    voucherShape = await postVoucher(tenantId, actorId,
      { voucherType: "JOURNAL", voucherDate: from, narration: `Stock repost correction: ${reason || "valuation"} (Δ ${toDb(delta)})`, source: "repost" },
      up
        ? [{ ledgerId: stockLedger, debit: toDb(amt), credit: "0" }, { ledgerId: adjLedger, debit: "0", credit: toDb(amt) }]
        : [{ ledgerId: adjLedger, debit: toDb(amt), credit: "0" }, { ledgerId: stockLedger, debit: "0", credit: toDb(amt) }]);
    await pool.query("UPDATE book_repost_runs SET status='POSTED', voucher_id=$4, updated_at=now() WHERE tenant_id=$1 AND item_id=$2 AND from_date=$3",
      [tenantId, itemId, from, voucherShape.voucherId]).catch(() => {});
  } else {
    await pool.query("UPDATE book_repost_runs SET status='POSTED', updated_at=now() WHERE tenant_id=$1 AND item_id=$2 AND from_date=$3",
      [tenantId, itemId, from]).catch(() => {});
  }

  return { itemId, fromDate: from, rowsRewritten: count, delta: toDb(delta || 0), correction: voucherShape };
}

// ── Public: repostFromDate (single item OR all open items) ────────────────────
// repostFromDate(tenantId, { itemId, warehouseId, fromDate }) - one item.
// repostFromDate(tenantId, { fromDate, allOpen:true })        - every item that
//   has a movement on/after fromDate ("repost all open from date" entrypoint).
// Per-item errors are isolated so one bad item never blocks the rest; the run is
// recorded in book_repost_runs (status FAILED) for recovery and surfaced in the
// returned `errors` array.
async function repostFromDate(tenantId, opts = {}) {
  if (opts.allOpen || (!opts.itemId && opts.fromDate)) return repostAllOpen(tenantId, opts);
  return repostItem(tenantId, opts);
}

async function repostAllOpen(tenantId, { fromDate, warehouseId = null, actorId, reason } = {}) {
  const from = fromDate || today();
  const { rows } = await pool.query(
    `SELECT DISTINCT item_id FROM book_stock_movements
      WHERE tenant_id=$1 AND posting_date >= $2::date ORDER BY item_id`,
    [tenantId, from]
  );
  const results = [], errors = [];
  for (const r of rows) {
    try {
      results.push(await repostItem(tenantId, { itemId: r.item_id, warehouseId, fromDate: from, actorId, reason: reason || "repost all open" }));
    } catch (e) {
      errors.push({ itemId: r.item_id, error: e.message, code: e.code || null });
    }
  }
  return { fromDate: from, items: results.length, reposted: results, errors };
}

// ── Error recovery: re-run every repost that previously FAILED ────────────────
// Idempotent - safe to call repeatedly (e.g. from a cron). Each retry re-replays
// from the opening, so a transient failure self-heals on the next run.
async function recoverFailedReposts(tenantId, actorId) {
  const { rows } = await pool.query(
    "SELECT item_id, warehouse_id, from_date FROM book_repost_runs WHERE tenant_id=$1 AND status='FAILED' ORDER BY from_date",
    [tenantId]
  );
  const recovered = [], stillFailing = [];
  for (const r of rows) {
    try {
      recovered.push(await repostItem(tenantId, { itemId: r.item_id, warehouseId: r.warehouse_id, fromDate: r.from_date, actorId, reason: "recovery retry" }));
    } catch (e) {
      stillFailing.push({ itemId: r.item_id, error: e.message });
    }
  }
  return { recovered: recovered.length, stillFailing };
}

async function listRepostRuns(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.itemId) { params.push(filter.itemId); where.push(`item_id=$${params.length}`); }
  if (filter.status) { params.push(String(filter.status).toUpperCase()); where.push(`status=$${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM book_repost_runs WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 500`,
    params
  );
  return rows;
}

module.exports = {
  replayLedger, repostItem, repostFromDate, repostAllOpen, recoverFailedReposts, listRepostRuns,
};
