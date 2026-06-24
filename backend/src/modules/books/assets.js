// §M7 — Fixed-asset register + depreciation. A depreciation run posts a JOURNAL
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
  if (!depLedger || !accLedger) throw new PostError("NOT_SEEDED", "Depreciation / Accumulated Depreciation ledgers missing — seed first", 422);
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
      if (!gt(dep, 0)) break; // fully depreciated — stop
      const periodEnd = monthEnd(cursor);
      const r = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: periodEnd, narration: `Depreciation — ${a.name} (${cursor})`, source: "api" },
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
// fall back to 'Stock Adjustment', then 'Indirect Expenses' — never invent a ledger.
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
  if (!assetLedger) throw new PostError("NOT_SEEDED", "A posting ledger named 'Fixed Assets' is required to credit the asset cost — create one first", 422);
  const accLedger = await ledgerIdByName(tenantId, "Accumulated Depreciation");
  if (gt(accumulated, 0) && !accLedger) throw new PostError("NOT_SEEDED", "Accumulated Depreciation ledger missing — seed first", 422);

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
    if (!pnl) throw new PostError("NOT_SEEDED", "No gain/loss ledger ('Profit/Loss on Asset Sale' / 'Stock Adjustment' / 'Indirect Expenses') found — seed first", 422);
    // gain → credit P/L (income), loss → debit P/L (expense).
    if (gt(gainLoss, 0)) legs.push({ ledgerId: pnl, debit: "0", credit: toDb(gainLoss) });
    else legs.push({ ledgerId: pnl, debit: toDb(gainLoss.abs()), credit: "0" });
  }

  const voucher = await postVoucher(tenantId, actorId,
    { voucherType: "JOURNAL", voucherDate: date, narration: `Disposal — ${a.name} (WDV ${toDb(wdv)}, ${gt(gainLoss, 0) ? "gain" : gainLoss.isZero() ? "no gain/loss" : "loss"} ${toDb(gainLoss.abs())})`, source: "api" },
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

module.exports = { depreciationMonthly, createAsset, runDepreciation, disposeAsset, assetRegister, setAssetGroup };
