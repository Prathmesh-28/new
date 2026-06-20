// Cost centres (Tally-style) — master + cost-centre-wise P&L. The posting engine
// already accepts e.costCentreId per line and stores it on book_voucher_entries;
// this module is the master CRUD + the report that makes the dimension usable.
const { pool } = require("../../db");
const { money, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

async function listCostCentres(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_cost_centres WHERE tenant_id=$1 ORDER BY name", [tenantId]);
  return rows;
}

async function createCostCentre(tenantId, d) {
  if (!d.name) throw new PostError("BAD_INPUT", "name required", 400);
  const { rows } = await pool.query(
    `INSERT INTO book_cost_centres(tenant_id,name,parent_id,category) VALUES($1,$2,$3,$4)
     ON CONFLICT(tenant_id,name) DO UPDATE SET parent_id=EXCLUDED.parent_id, category=EXCLUDED.category RETURNING *`,
    [tenantId, d.name, d.parentId || null, d.category || null]
  );
  return rows[0];
}

async function updateCostCentre(tenantId, id, d) {
  const { rows } = await pool.query(
    `UPDATE book_cost_centres SET name=COALESCE($3,name), parent_id=$4, category=$5,
            is_active=COALESCE($6,is_active) WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [tenantId, id, d.name ?? null, d.parentId ?? null, d.category ?? null, d.isActive ?? null]
  );
  if (!rows[0]) throw new PostError("NOT_FOUND", "Cost centre not found", 404);
  return rows[0];
}

// Cost-centre-wise P&L for a financial year: income (credit-positive INCOME ledgers)
// and expense (debit-positive EXPENSE ledgers), grouped by the entry's cost centre.
async function costCentreReport(tenantId, fy) {
  const { rows } = await pool.query(
    `SELECT cc.id, cc.name, cc.category,
            COALESCE(SUM(CASE WHEN g.nature='INCOME'  THEN e.credit - e.debit ELSE 0 END),0) AS income,
            COALESCE(SUM(CASE WHEN g.nature='EXPENSE' THEN e.debit - e.credit ELSE 0 END),0) AS expense
       FROM book_voucher_entries e
       JOIN book_vouchers v        ON v.id=e.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
       JOIN book_ledgers l         ON l.id=e.ledger_id
       JOIN book_account_groups g  ON g.id=l.group_id AND g.affects_pl=true
       JOIN book_cost_centres cc   ON cc.id=e.cost_centre_id AND cc.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1
      GROUP BY cc.id, cc.name, cc.category ORDER BY cc.name`,
    [tenantId, fy]
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, category: r.category,
    income: toRupees(r.income), expense: toRupees(r.expense),
    net: toRupees(money(r.income).minus(r.expense)),
  }));
}

module.exports = { listCostCentres, createCostCentre, updateCostCentre, costCentreReport };
