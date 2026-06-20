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
  for (const a of assets) {
    const lastMonth = a.last_dep_on ? new Date(a.last_dep_on).toISOString().slice(0, 7) : null;
    if (lastMonth && lastMonth >= month) continue; // already depreciated this month
    let dep = depreciationMonthly(a.method, a.cost, a.accumulated_dep, a.rate);
    const maxDep = money(a.cost).minus(a.salvage).minus(a.accumulated_dep);
    if (gt(dep, maxDep)) dep = maxDep;
    if (!gt(dep, 0)) continue;
    const r = await postVoucher(tenantId, actorId, { voucherType: "JOURNAL", voucherDate: asOf, narration: `Depreciation — ${a.name}`, source: "api" },
      [{ ledgerId: depLedger, debit: toDb(dep), credit: "0" }, { ledgerId: accLedger, debit: "0", credit: toDb(dep) }]);
    await pool.query("UPDATE book_fixed_assets SET accumulated_dep = accumulated_dep + $2, last_dep_on = $3 WHERE id=$1", [a.id, toDb(dep), asOf]);
    posted.push({ asset: a.name, depreciation: toDb(dep), voucher: r.voucherId });
  }
  return { asOf, posted };
}

module.exports = { depreciationMonthly, createAsset, runDepreciation };
