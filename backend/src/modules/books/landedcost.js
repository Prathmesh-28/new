// §8.L — LANDED COST VOUCHER (landed_cost_voucher, ported in spirit from
// frappe/erpnext stock/doctype/landed_cost_voucher). Goods rarely cost only their
// invoice price: freight, customs duty, insurance, clearing & forwarding all land
// on the goods and must be CAPITALISED into stock value — not expensed — so COGS
// and closing-stock are right. This voucher takes a set of already-received items
// and a set of additional charges, APPORTIONS each charge across the receipts by a
// chosen basis (qty / amount / weight), bumps each receipt's valuation rate, and
// RE-VALUES the affected stock through the reposting path (so every downstream
// issue is re-priced and the GL is corrected). The charges themselves post:
//   Dr Stock-in-hand        Σ apportioned charge   (capitalised into goods)
//   Cr <charge ledger>      per charge             (Freight / Customs / Insurance …)
// and the reposting correction then keeps COGS/closing-stock exact.
const { pool } = require("../../db");
const { money, toDb, gt, sum } = require("./money");
const { PostError, postVoucher } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

const today = () => new Date().toISOString().slice(0, 10);
const BASES = new Set(["QTY", "AMOUNT", "WEIGHT"]);

// ── Pure apportionment ────────────────────────────────────────────────────────
// items:  [{ itemId, qty, amount, weight }] — the received items the charges land on
//         (amount = receipt value used for the AMOUNT basis; weight optional).
// charges:[{ ledgerName, amount, basis }]   — each cost, with its own basis.
// Returns { perItem: Map(itemId → addlCost money), perCharge: [{...,distributed}],
//           totalCharge }. Distribution weights come from the row's value for the
// chosen basis; a zero total-basis falls back to QTY, then to equal split, so a
// charge is never silently dropped. Rounding residue is dumped on the LAST item so
// Σ distributed === charge.amount EXACTLY (no penny leaks into the GL).
function apportion(items, charges) {
  if (!Array.isArray(items) || items.length === 0) throw new PostError("BAD_INPUT", "at least one received item required", 422);
  if (!Array.isArray(charges) || charges.length === 0) throw new PostError("BAD_INPUT", "at least one charge required", 422);
  const norm = items.map((it) => ({
    itemId: it.itemId,
    qty: money(it.qty || 0),
    amount: money(it.amount || 0),
    weight: money(it.weight || 0),
  }));
  if (norm.some((i) => !i.itemId)) throw new PostError("BAD_INPUT", "each item needs an itemId", 422);

  const perItem = new Map(norm.map((i) => [i.itemId, money(0)]));
  const perCharge = [];
  let totalCharge = money(0);

  for (const ch of charges) {
    const amt = money(ch.amount || 0);
    if (amt.lessThan(0)) throw new PostError("BAD_INPUT", "charge amount cannot be negative", 422);
    if (!ch.ledgerName) throw new PostError("BAD_INPUT", "each charge needs a ledgerName", 422);
    let basis = String(ch.basis || "AMOUNT").toUpperCase();
    if (!BASES.has(basis)) throw new PostError("BAD_INPUT", `charge basis must be one of QTY/AMOUNT/WEIGHT, got ${ch.basis}`, 422);
    totalCharge = totalCharge.plus(amt);

    const weightOf = (i) => (basis === "QTY" ? i.qty : basis === "WEIGHT" ? i.weight : i.amount);
    let total = sum(norm.map(weightOf));
    let usedBasis = basis;
    if (!gt(total, 0)) { total = sum(norm.map((i) => i.qty)); usedBasis = "QTY"; }       // fall back to qty
    const equal = !gt(total, 0);                                                          // then equal split
    const distributed = [];
    let allocated = money(0);
    norm.forEach((i, idx) => {
      let share;
      if (equal) share = amt.div(norm.length);
      else {
        const w = usedBasis === "QTY" ? i.qty : usedBasis === "WEIGHT" ? i.weight : i.amount;
        share = amt.mul(w).div(total);
      }
      // Round to 4dp (NUMERIC(19,4)); dump residue on the last item.
      let r = money(toDb(share));
      if (idx === norm.length - 1) r = amt.minus(allocated);
      else allocated = allocated.plus(r);
      perItem.set(i.itemId, perItem.get(i.itemId).plus(r));
      distributed.push({ itemId: i.itemId, amount: toDb(r) });
    });
    perCharge.push({ ledgerName: ch.ledgerName, amount: toDb(amt), basis: usedBasis, distributed });
  }
  return { perItem, perCharge, totalCharge };
}

// ── Create a landed-cost voucher ──────────────────────────────────────────────
// input: {
//   date?, reference?, narration?,
//   items:   [{ itemId, qty, amount, weight? }],   // received items
//   charges: [{ ledgerName, amount, basis }],       // freight/customs/insurance/…
// }
// Posts the capitalisation voucher (Dr Stock-in-hand / Cr each charge ledger),
// bumps each affected item's current_value by its apportioned cost AND lifts its
// open FIFO lots' rate proportionally, persists the LCV record, then re-values via
// reposting.repostFromDate so every downstream issue is re-priced and the GL net
// is corrected. All ledger lookups go through ledgerIdByName — a missing charge
// ledger throws NOT_SEEDED (we never invent ledgers).
async function createLandedCost(tenantId, actorId, input = {}, opts = {}) {
  const date = input.date || today();
  const { perItem, perCharge, totalCharge } = apportion(input.items || [], input.charges || []);
  if (!gt(totalCharge, 0)) throw new PostError("BAD_INPUT", "total landed cost is zero", 422);

  const adjLedger = await ledgerIdByName(tenantId, "Stock Adjustment");
  if (!adjLedger) throw new PostError("NOT_SEEDED", "Stock Adjustment ledger missing — seed the books first", 422);
  // Resolve each charge ledger up front (fail fast before we post anything).
  const chargeLedgers = [];
  for (const c of perCharge) {
    const lid = await ledgerIdByName(tenantId, c.ledgerName);
    if (!lid) throw new PostError("NOT_SEEDED", `Charge ledger '${c.ledgerName}' missing — create it first`, 422);
    chargeLedgers.push({ ledgerId: lid, amount: c.amount, ledgerName: c.ledgerName });
  }

  // 1. Charge voucher: Dr Stock Adjustment (Σ charges) / Cr each charge ledger
  // (e.g. Freight Payable / Customs Duty Payable / Insurance). Stock Adjustment is
  // a WASH account here — step 3's repost posts the matching Dr Stock-in-hand / Cr
  // Stock Adjustment, so the net is Dr Stock-in-hand / Cr charge ledgers (the charge
  // is capitalised into stock) with no double-count of Stock-in-hand.
  const entries = [{ ledgerId: adjLedger, debit: toDb(totalCharge), credit: "0" }];
  for (const c of chargeLedgers) if (gt(c.amount, 0)) entries.push({ ledgerId: c.ledgerId, debit: "0", credit: toDb(c.amount) });
  const posted = await postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: date, reference: input.reference || null, narration: input.narration || "Landed cost capitalisation", source: "landed-cost" },
    entries, { idempotencyKey: opts.idempotencyKey });

  // 2. Capitalise into the RECEIPT cost basis: distribute each item's apportioned
  // charge across that item's INWARD movements on/after `date`, bumping their SLE
  // rate + value AND lifting the matching FIFO lots' rate. The inward rate is the
  // single authoritative input the reposting replay trusts — so once we correct it
  // there, step 3's repost re-derives item value, lot consumption, downstream issue
  // rates and the GL net from the corrected basis. Spreading is by inward qty.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [itemId, addl] of perItem) {
      if (!gt(addl, 0)) continue;
      const { rows: ir } = await client.query("SELECT * FROM book_stock_items WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [tenantId, itemId]);
      const item = ir[0];
      if (!item) throw new PostError("NOT_FOUND", `Item not found: ${itemId}`, 404);

      // Target the inward movements that received this stock (on/after the LCV date);
      // fall back to ALL inwards of the item if none match the date window.
      let { rows: inwards } = await client.query(
        "SELECT id, qty_in, rate, value FROM book_stock_movements WHERE tenant_id=$1 AND item_id=$2 AND qty_in>0 AND posting_date>=$3::date ORDER BY posting_date, created_at, id",
        [tenantId, itemId, date]
      );
      if (inwards.length === 0) {
        ({ rows: inwards } = await client.query(
          "SELECT id, qty_in, rate, value FROM book_stock_movements WHERE tenant_id=$1 AND item_id=$2 AND qty_in>0 ORDER BY posting_date, created_at, id",
          [tenantId, itemId]
        ));
      }
      if (inwards.length === 0) throw new PostError("NO_RECEIPT", `No receipt movement to apply landed cost onto for item ${itemId}`, 422);
      const totalInQty = sum(inwards.map((m) => m.qty_in));
      let allocated = money(0);
      for (let idx = 0; idx < inwards.length; idx++) {
        const m = inwards[idx];
        const q = money(m.qty_in);
        const share = idx === inwards.length - 1
          ? addl.minus(allocated)
          : (gt(totalInQty, 0) ? money(toDb(addl.mul(q).div(totalInQty))) : money(toDb(addl.div(inwards.length))));
        if (idx !== inwards.length - 1) allocated = allocated.plus(share);
        const newValue = money(m.value).plus(share);
        const newRate = gt(q, 0) ? newValue.div(q) : money(m.rate);
        await client.query("UPDATE book_stock_movements SET rate=$2, value=$3 WHERE id=$1", [m.id, toDb(newRate), toDb(newValue)]);
      }

      // FIFO: lift the per-unit rate on the open lots in proportion to remaining qty
      // so the still-on-hand layers carry their share (consumed layers are corrected
      // by the repost replay via the bumped inward SLE rate).
      if (item.valuation_method === "FIFO") {
        const { rows: lots } = await client.query("SELECT id, qty_remaining FROM book_stock_lots WHERE tenant_id=$1 AND item_id=$2 AND qty_remaining>0 ORDER BY received_on, id", [tenantId, itemId]);
        const totalOpen = sum(lots.map((l) => l.qty_remaining));
        if (gt(totalOpen, 0)) {
          let lotAlloc = money(0);
          for (let idx = 0; idx < lots.length; idx++) {
            const l = lots[idx];
            const q = money(l.qty_remaining);
            const lotAddl = idx === lots.length - 1 ? addl.minus(lotAlloc) : money(toDb(addl.mul(q).div(totalOpen)));
            if (idx !== lots.length - 1) lotAlloc = lotAlloc.plus(lotAddl);
            const perUnit = gt(q, 0) ? lotAddl.div(q) : money(0);
            await client.query("UPDATE book_stock_lots SET rate = rate + $2 WHERE id=$1", [l.id, toDb(perUnit)]);
          }
        }
      }

      // Persist a per-item LCV line for traceability.
      await client.query(
        "INSERT INTO book_landed_cost_items(tenant_id, lcv_id, item_id, applied_amount) VALUES($1,$2,$3,$4)",
        [tenantId, posted.voucherId, itemId, toDb(addl)]
      );
    }
    // LCV header.
    await client.query(
      `INSERT INTO book_landed_cost_vouchers(tenant_id, voucher_id, lcv_date, reference, narration, total_charge, charges, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, posted.voucherId, date, input.reference || null, input.narration || null, toDb(totalCharge), JSON.stringify(perCharge), actorId || null]
    );
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }

  // 3. Re-value via the reposting path: replay each affected item from `date` so
  // every downstream issue is re-priced. We pass skip of the GL delta by letting
  // reposting post its own correction — but here the value bump we just made IS the
  // new closing, so the repost delta nets to ~0 and simply rewrites the SLE rates.
  const reposting = require("./reposting");
  const revaluations = [];
  for (const itemId of perItem.keys()) {
    if (!gt(perItem.get(itemId), 0)) continue;
    revaluations.push(await reposting.repostFromDate(tenantId, { itemId, fromDate: date, actorId, reason: "landed cost" }));
  }

  return {
    voucher: posted,
    totalCharge: toDb(totalCharge),
    charges: perCharge,
    perItem: Array.from(perItem.entries()).map(([itemId, amt]) => ({ itemId, appliedAmount: toDb(amt) })),
    revaluations,
  };
}

async function listLandedCost(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["lcv.tenant_id=$1"];
  if (filter.from) { params.push(filter.from); where.push(`lcv.lcv_date >= $${params.length}`); }
  if (filter.to) { params.push(filter.to); where.push(`lcv.lcv_date <= $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT lcv.*, v.voucher_number, v.voucher_type
       FROM book_landed_cost_vouchers lcv
       LEFT JOIN book_vouchers v ON v.id = lcv.voucher_id
      WHERE ${where.join(" AND ")} ORDER BY lcv.lcv_date DESC, lcv.created_at DESC LIMIT 500`,
    params
  );
  return rows;
}

module.exports = { apportion, createLandedCost, listLandedCost };
