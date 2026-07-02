// §M7 - Fixed-asset register + depreciation. A depreciation run posts a JOURNAL
// (Dr Depreciation / Cr Accumulated Depreciation) per asset per month, SLM or WDV.
const { pool } = require("../../db");
const { money, toDb, gt } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

// One month of depreciation (annual rate / 12). SLM on cost, WDV on written-down value.
function depreciationMonthly(method, cost, accumulated, rate) {
  const r = money(rate).div(100).div(12);
  return method === "WDV" ? money(cost).minus(accumulated).mul(r) : money(cost).mul(r);
}

// "YYYY-MM" -> last calendar day of that month as "YYYY-MM-DD".
function monthEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}

// "YYYY-MM" -> next month "YYYY-MM".
function nextMonth(ym) {
  let [y, m] = ym.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

async function createAsset(tenantId, a) {
  if (!a.name || a.cost == null || !a.acquiredOn || a.rate == null) throw new PostError("BAD_INPUT", "name, cost, acquiredOn, rate required", 400);
  const { rows } = await pool.query(
    "INSERT INTO book_fixed_assets(tenant_id,name,cost,salvage,acquired_on,method,rate) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [tenantId, a.name, toDb(a.cost), toDb(a.salvage || 0), a.acquiredOn, a.method === "WDV" ? "WDV" : "SLM", toDb(a.rate)]
  );
  return rows[0];
}

async function runDepreciation(tenantId, actorId, asOf) {
  const depLedger = await ledgerIdByName(tenantId, "Depreciation");
  const accLedger = await ledgerIdByName(tenantId, "Accumulated Depreciation");
  if (!depLedger || !accLedger) throw new PostError("NOT_SEEDED", "Depreciation / Accumulated Depreciation ledgers missing - seed first", 422);
  const month = asOf.slice(0, 7);
  const { rows: assets } = await pool.query("SELECT * FROM book_fixed_assets WHERE tenant_id=$1 AND is_active=true", [tenantId]);
  const posted = [];
  const MAX_CATCHUP_MONTHS = 600; // sane cap (~50 years) so a bad date can't loop forever
  for (const a of assets) {
    // Catch up month-by-month from the month AFTER last_dep_on (or acquired_on if never
    // depreciated) up to and including the asOf month, posting one month per iteration.
    const lastMonth = a.last_dep_on ? new Date(a.last_dep_on).toISOString().slice(0, 7) : null;
    const acquiredMonth = a.acquired_on ? new Date(a.acquired_on).toISOString().slice(0, 7) : null;
    // First month to post: month after last depreciation, else the acquisition month itself.
    let cursor = lastMonth ? nextMonth(lastMonth) : acquiredMonth;
    if (!cursor) continue;
    if (cursor > month) continue; // nothing elapsed since last run

    // Track running state in-memory so multi-month WDV / caps compound correctly.
    let accumulated = money(a.accumulated_dep);
    let iterations = 0;
    while (cursor <= month && iterations < MAX_CATCHUP_MONTHS) {
      iterations += 1;
      let dep = depreciationMonthly(a.method, a.cost, accumulated, a.rate);
      const maxDep = money(a.cost).minus(a.salvage).minus(accumulated);
      if (gt(dep, maxDep)) dep = maxDep;
      if (!gt(dep, 0)) break; // fully depreciated - stop
      const periodEnd = monthEnd(cursor);
      const r = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: periodEnd, narration: `Depreciation - ${a.name} (${cursor})`, source: "api" },
        [{ ledgerId: depLedger, debit: toDb(dep), credit: "0" }, { ledgerId: accLedger, debit: "0", credit: toDb(dep) }]);
      accumulated = accumulated.plus(dep);
      await pool.query("UPDATE book_fixed_assets SET accumulated_dep = accumulated_dep + $2, last_dep_on = $3 WHERE id=$1", [a.id, toDb(dep), periodEnd]);
      posted.push({ asset: a.name, period: cursor, depreciation: toDb(dep), voucher: r.voucherId });
      cursor = nextMonth(cursor);
    }
  }
  return { asOf, posted };
}

// Resolve the gain/loss ledger: prefer a dedicated 'Profit/Loss on Asset Sale', then
// fall back to 'Stock Adjustment', then 'Indirect Expenses' - never invent a ledger.
async function pnlLedger(tenantId) {
  for (const name of ["Profit/Loss on Asset Sale", "Stock Adjustment", "Indirect Expenses"]) {
    const id = await ledgerIdByName(tenantId, name);
    if (id) return id;
  }
  return null;
}

// Sell or scrap an asset. WDV = cost − accumulated_dep. Books a JOURNAL:
//   Dr bank/receivable        disposalValue   (the cash/claim received; skipped if 0)
//   Dr Accumulated Depreciation accumulated_dep (clears the contra; skipped if 0)
//   Cr asset cost ledger 'Fixed Assets'        cost
//   plus the balancing gain/loss (gain = disposalValue − WDV) to the P/L ledger.
// Then marks the row disposed_on / disposal_value and is_active=false.
async function disposeAsset(tenantId, actorId, { assetId, disposalValue, date, bankLedgerId }) {
  if (!assetId || disposalValue == null || !date) throw new PostError("BAD_INPUT", "assetId, disposalValue, date required", 400);
  const proceeds = money(disposalValue);
  if (proceeds.lessThan(0)) throw new PostError("BAD_INPUT", "disposalValue cannot be negative", 400);

  const { rows } = await pool.query("SELECT * FROM book_fixed_assets WHERE tenant_id=$1 AND id=$2", [tenantId, assetId]);
  const a = rows[0];
  if (!a) throw new PostError("NOT_FOUND", "Asset not found", 404);
  if (!a.is_active || a.disposed_on) throw new PostError("ALREADY_DISPOSED", "Asset already disposed", 409);

  const cost = money(a.cost);
  const accumulated = money(a.accumulated_dep);
  const wdv = cost.minus(accumulated);
  const gainLoss = proceeds.minus(wdv); // +ve = gain (credit P/L), −ve = loss (debit P/L)

  const assetLedger = await ledgerIdByName(tenantId, "Fixed Assets");
  if (!assetLedger) throw new PostError("NOT_SEEDED", "A posting ledger named 'Fixed Assets' is required to credit the asset cost - create one first", 422);
  const accLedger = await ledgerIdByName(tenantId, "Accumulated Depreciation");
  if (gt(accumulated, 0) && !accLedger) throw new PostError("NOT_SEEDED", "Accumulated Depreciation ledger missing - seed first", 422);

  let bankLedger = bankLedgerId || null;
  if (gt(proceeds, 0)) {
    if (!bankLedger) throw new PostError("BAD_INPUT", "bankLedgerId required when disposalValue > 0", 400);
    const { rows: lr } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND id=$2", [tenantId, bankLedger]);
    if (!lr[0]) throw new PostError("NOT_FOUND", "bankLedgerId not found", 404);
  }

  // Build legs, skipping any zero-amount line (posting-engine rejects zero legs).
  const legs = [];
  if (gt(proceeds, 0)) legs.push({ ledgerId: bankLedger, debit: toDb(proceeds), credit: "0" });
  if (gt(accumulated, 0)) legs.push({ ledgerId: accLedger, debit: toDb(accumulated), credit: "0" });
  legs.push({ ledgerId: assetLedger, debit: "0", credit: toDb(cost) });
  if (!gainLoss.isZero()) {
    const pnl = await pnlLedger(tenantId);
    if (!pnl) throw new PostError("NOT_SEEDED", "No gain/loss ledger ('Profit/Loss on Asset Sale' / 'Stock Adjustment' / 'Indirect Expenses') found - seed first", 422);
    // gain → credit P/L (income), loss → debit P/L (expense).
    if (gt(gainLoss, 0)) legs.push({ ledgerId: pnl, debit: "0", credit: toDb(gainLoss) });
    else legs.push({ ledgerId: pnl, debit: toDb(gainLoss.abs()), credit: "0" });
  }

  const voucher = await postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: date, narration: `Disposal - ${a.name} (WDV ${toDb(wdv)}, ${gt(gainLoss, 0) ? "gain" : gainLoss.isZero() ? "no gain/loss" : "loss"} ${toDb(gainLoss.abs())})`, source: "api" },
    legs);

  await pool.query("UPDATE book_fixed_assets SET disposed_on=$2, disposal_value=$3, is_active=false WHERE id=$1 AND tenant_id=$4", [assetId, date, toDb(proceeds), tenantId]);
  return { assetId, wdv: toDb(wdv), gainLoss: toDb(gainLoss), voucher };
}

// Asset register: every asset with cost, accumulated_dep, WDV and status, grouped by
// asset_group (NULL → 'Ungrouped') with per-group subtotals and a grand total.
// opts.status: 'active' | 'disposed' | 'all' (default 'all').
async function assetRegister(tenantId, opts = {}) {
  const status = opts.status || "all";
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (status === "active") where += " AND is_active=true AND disposed_on IS NULL";
  else if (status === "disposed") where += " AND disposed_on IS NOT NULL";
  const { rows } = await pool.query(
    `SELECT * FROM book_fixed_assets WHERE ${where} ORDER BY COALESCE(asset_group,''), name`, params);

  const groupsMap = new Map();
  for (const a of rows) {
    const key = a.asset_group || "Ungrouped";
    const cost = money(a.cost);
    const acc = money(a.accumulated_dep);
    const wdv = cost.minus(acc);
    const row = {
      id: a.id, name: a.name, assetGroup: key, method: a.method, rate: toDb(a.rate),
      acquiredOn: a.acquired_on, cost: toDb(cost), accumulatedDep: toDb(acc), wdv: toDb(wdv),
      status: a.disposed_on ? "disposed" : "active",
      disposedOn: a.disposed_on || null, disposalValue: a.disposal_value != null ? toDb(a.disposal_value) : null,
    };
    if (!groupsMap.has(key)) groupsMap.set(key, { group: key, assets: [], cost: money(0), accumulatedDep: money(0), wdv: money(0) });
    const g = groupsMap.get(key);
    g.assets.push(row);
    g.cost = g.cost.plus(cost); g.accumulatedDep = g.accumulatedDep.plus(acc); g.wdv = g.wdv.plus(wdv);
  }

  const total = { cost: money(0), accumulatedDep: money(0), wdv: money(0), count: rows.length };
  const groups = [...groupsMap.values()].map((g) => {
    total.cost = total.cost.plus(g.cost); total.accumulatedDep = total.accumulatedDep.plus(g.accumulatedDep); total.wdv = total.wdv.plus(g.wdv);
    return { group: g.group, count: g.assets.length, assets: g.assets,
      subtotal: { cost: toDb(g.cost), accumulatedDep: toDb(g.accumulatedDep), wdv: toDb(g.wdv) } };
  });
  return { status, groups, total: { count: total.count, cost: toDb(total.cost), accumulatedDep: toDb(total.accumulatedDep), wdv: toDb(total.wdv) } };
}

// Assign or clear an asset's reporting group.
async function setAssetGroup(tenantId, assetId, group) {
  const { rows } = await pool.query(
    "UPDATE book_fixed_assets SET asset_group=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *",
    [tenantId, assetId, group || null]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Asset not found", 404);
  return rows[0];
}

// Classify an asset for Income-Tax Act depreciation (its block + rate).
async function setAssetItBlock(tenantId, assetId, { itBlock, itRate }) {
  if (itRate == null) throw new PostError("BAD_INPUT", "itRate required", 400);
  const { rows } = await pool.query(
    "UPDATE book_fixed_assets SET it_block=$3, it_rate=$4 WHERE tenant_id=$1 AND id=$2 RETURNING id,name,it_block,it_rate",
    [tenantId, assetId, itBlock || null, toDb(itRate)]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Asset not found", 404);
  return rows[0];
}

// Income-Tax Act block-of-assets depreciation for a financial year (WDV method, block-wise).
// Opening WDV = prior FY's closing (run years in sequence with commit); + additions − disposals;
// additions put to use for <180 days in the FY get HALF the block rate. Returns the per-block
// rollforward + a Companies-Act-vs-IT-Act comparison (the timing difference drives deferred tax).
async function itActDepreciation(tenantId, fyStartYear, opts = {}) {
  const y = parseInt(fyStartYear, 10);
  if (!(y > 1900)) throw new PostError("BAD_INPUT", "valid fyStartYear (e.g. 2024) required", 400);
  const fy = `${y}-${String(y + 1).slice(-2)}`;
  const prevFy = `${y - 1}-${String(y).slice(-2)}`;
  const fyStart = `${y}-04-01`, fyEnd = `${y + 1}-03-31`;
  const fyEndMs = new Date(fyEnd + "T00:00:00Z").getTime();
  const out = (m) => Number(money(m).toFixed(2));
  const iso = (d) => new Date(d).toISOString().slice(0, 10);

  const { rows: assets } = await pool.query(
    "SELECT name,cost,acquired_on,disposed_on,disposal_value,it_block,it_rate FROM book_fixed_assets WHERE tenant_id=$1 AND it_rate IS NOT NULL", [tenantId]);
  const { rows: prevRows } = await pool.query(
    "SELECT block, rate, closing_wdv FROM book_it_dep_blocks WHERE tenant_id=$1 AND fy=$2", [tenantId, prevFy]);
  const prev = new Map(prevRows.map((r) => [r.block, { closing: money(r.closing_wdv), rate: Number(r.rate) }]));

  const blocks = new Map();
  for (const a of assets) {
    const key = a.it_block || `IT ${Number(a.it_rate)}%`;
    if (!blocks.has(key)) blocks.set(key, { block: key, rate: Number(a.it_rate), addFull: money(0), addHalf: money(0), disposals: money(0), older: false, held: 0 });
    const b = blocks.get(key);
    const acq = iso(a.acquired_on);
    if (acq >= fyStart && acq <= fyEnd) {
      const days = Math.floor((fyEndMs - new Date(acq + "T00:00:00Z").getTime()) / 86400000) + 1;
      if (days >= 180) b.addFull = b.addFull.plus(money(a.cost)); else b.addHalf = b.addHalf.plus(money(a.cost));
    } else if (acq < fyStart) { b.older = true; }
    if (a.disposed_on) {
      const dis = iso(a.disposed_on);
      if (dis >= fyStart && dis <= fyEnd) b.disposals = b.disposals.plus(money(a.disposal_value || 0));
    }
    // Held at FY-end = acquired on/before FY-end and not disposed by then (drives the empty-block rule).
    if (acq <= fyEnd && (!a.disposed_on || iso(a.disposed_on) > fyEnd)) b.held += 1;
  }
  // Blocks surviving only via a prior-year closing WDV (all assets disposed, WDV remained).
  for (const [key, p] of prev) if (!blocks.has(key)) blocks.set(key, { block: key, rate: p.rate, addFull: money(0), addHalf: money(0), disposals: money(0), older: true, held: 0 });

  const warnings = [];
  const rows = [];
  let tOpen = money(0), tAdd = money(0), tHalf = money(0), tDisp = money(0), tDep = money(0), tClose = money(0), tStcg = money(0), tStcl = money(0);
  for (const b of blocks.values()) {
    const opening = prev.get(b.block) ? prev.get(b.block).closing : money(0);
    if (b.older && !prev.has(b.block)) warnings.push(`Block "${b.block}" has assets from earlier years but no ${prevFy} rollforward — run the prior year(s) first so the opening WDV is accurate.`);
    const base = opening.plus(b.addFull).plus(b.addHalf).minus(b.disposals);
    const r = money(b.rate).div(100);
    let dep = money(0), closing = money(0), stcg = money(0), stcl = money(0);
    if (b.held === 0) {
      // Block empty at FY-end (all assets sold): no depreciation. Residual WDV is a short-term
      // capital LOSS; if sale proceeds exceeded the WDV, the excess is a short-term capital GAIN.
      if (base.greaterThan(0)) stcl = base;
      else if (base.lessThan(0)) stcg = base.abs();
    } else if (base.greaterThan(0)) {
      let fullBase = opening.plus(b.addFull).minus(b.disposals);
      if (fullBase.lessThan(0)) fullBase = money(0);
      let remHalf = base.minus(fullBase);
      if (remHalf.lessThan(0)) remHalf = money(0);
      const halfBase = remHalf.greaterThan(b.addHalf) ? b.addHalf : remHalf; // min(addHalf, remHalf)
      dep = fullBase.mul(r).plus(halfBase.mul(r).div(2));
      if (dep.greaterThan(base)) dep = base;
      closing = base.minus(dep);
    } else if (base.lessThan(0)) {
      stcg = base.abs(); // proceeds exceeded the block WDV → short-term capital gain
    }
    rows.push({ block: b.block, rate: b.rate, opening_wdv: out(opening), additions: out(b.addFull.plus(b.addHalf)), additions_lt180: out(b.addHalf), disposals: out(b.disposals), depreciation: out(dep), closing_wdv: out(closing), stcg: out(stcg), stcl: out(stcl) });
    tOpen = tOpen.plus(opening); tAdd = tAdd.plus(b.addFull).plus(b.addHalf); tHalf = tHalf.plus(b.addHalf); tDisp = tDisp.plus(b.disposals); tDep = tDep.plus(dep); tClose = tClose.plus(closing); tStcg = tStcg.plus(stcg); tStcl = tStcl.plus(stcl);
  }
  rows.sort((a, b) => a.block.localeCompare(b.block));

  // Companies-Act book depreciation actually posted in this FY (the dual-book comparison).
  const { rows: bd } = await pool.query(
    `SELECT COALESCE(SUM(e.debit),0) d FROM book_voucher_entries e JOIN book_vouchers v ON v.id=e.voucher_id JOIN book_ledgers l ON l.id=e.ledger_id
       WHERE e.tenant_id=$1 AND l.name='Depreciation' AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3`, [tenantId, fyStart, fyEnd]);
  const bookDep = out(money(bd[0].d));

  if (opts.commit) {
    for (const rr of rows) {
      await pool.query(
        `INSERT INTO book_it_dep_blocks(tenant_id,fy,block,rate,opening_wdv,additions,additions_lt180,disposals,depreciation,closing_wdv)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(tenant_id,fy,block) DO UPDATE SET rate=EXCLUDED.rate, opening_wdv=EXCLUDED.opening_wdv, additions=EXCLUDED.additions, additions_lt180=EXCLUDED.additions_lt180, disposals=EXCLUDED.disposals, depreciation=EXCLUDED.depreciation, closing_wdv=EXCLUDED.closing_wdv, computed_at=now()`,
        [tenantId, fy, rr.block, rr.rate, rr.opening_wdv, rr.additions, rr.additions_lt180, rr.disposals, rr.depreciation, rr.closing_wdv]);
    }
  }

  return {
    fy, blocks: rows,
    total: { opening_wdv: out(tOpen), additions: out(tAdd), additions_lt180: out(tHalf), disposals: out(tDisp), it_depreciation: out(tDep), closing_wdv: out(tClose), stcg: out(tStcg), stcl: out(tStcl) },
    book_depreciation_fy: bookDep,
    timing_difference: out(money(bookDep).minus(tDep)), // book − IT; +ve → book higher (deferred tax asset)
    committed: !!opts.commit, warnings,
    note: "IT Act block-of-assets depreciation (WDV; <180-day additions at half rate). Opening WDV carries from the prior year's closing — run years in sequence with commit. Separate from the Companies-Act book depreciation posted to the GL; the timing difference feeds deferred tax.",
  };
}

module.exports = { depreciationMonthly, createAsset, runDepreciation, disposeAsset, assetRegister, setAssetGroup, setAssetItBlock, itActDepreciation };
