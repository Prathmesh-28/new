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

module.exports = { depreciationMonthly, createAsset, runDepreciation };
