// Insights — a cross-module KPI overview (finance from books, sales from CRM,
// people from HRMS) plus saved dashboards. Everything is computed live so it
// always reconciles to the underlying modules.
const { pool } = require("../../db");
const books = require("../books");
const crm = require("../crm");
const hrms = require("../hrms");

const METRIC_CATALOG = [
  { key: "income", label: "Income (FY)", group: "Finance" },
  { key: "expense", label: "Expense (FY)", group: "Finance" },
  { key: "netProfit", label: "Net profit (FY)", group: "Finance" },
  { key: "cash", label: "Cash & bank", group: "Finance" },
  { key: "pipelineWeighted", label: "Weighted pipeline", group: "Sales" },
  { key: "openDeals", label: "Open deals", group: "Sales" },
  { key: "wonValue", label: "Won value", group: "Sales" },
  { key: "headcount", label: "Active headcount", group: "People" },
  { key: "lastPayrollNet", label: "Last payroll (net)", group: "People" },
];

async function cashBalance(tenantId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(e.debit)-SUM(e.credit),0) AS cash
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id=e.voucher_id AND v.is_cancelled=false
       JOIN book_ledgers l ON l.id=e.ledger_id
       LEFT JOIN book_account_groups g ON g.id=l.group_id
      WHERE e.tenant_id=$1 AND (l.is_bank OR g.name='Cash-in-hand')`,
    [tenantId]
  );
  return Number(rows[0].cash || 0);
}

async function overview(tenantId, fy) {
  const [pl, pipe, emps, runs, cash] = await Promise.all([
    books.profitLoss(tenantId, fy).catch(() => ({ totalIncome: "0.00", totalExpense: "0.00", netProfit: "0.00" })),
    crm.pipeline(tenantId).catch(() => ({ weightedValue: 0, openCount: 0, wonValue: 0 })),
    hrms.listEmployees(tenantId).catch(() => []),
    hrms.listPayrollRuns(tenantId).catch(() => []),
    cashBalance(tenantId).catch(() => 0),
  ]);
  return {
    financialYear: fy,
    finance: { income: pl.totalIncome, expense: pl.totalExpense, netProfit: pl.netProfit, cash: cash.toFixed(2) },
    sales: { pipelineWeighted: pipe.weightedValue, openDeals: pipe.openCount, wonValue: pipe.wonValue },
    people: { headcount: emps.filter((e) => e.status === "ACTIVE").length, lastPayrollNet: runs[0] ? runs[0].net : "0.00" },
  };
}

const metricsCatalog = () => METRIC_CATALOG;

async function createDashboard(tenantId, actorId, d) {
  const { rows } = await pool.query("INSERT INTO insights_dashboards(tenant_id,name,widgets,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,name) DO UPDATE SET widgets=EXCLUDED.widgets RETURNING *", [tenantId, d.name, JSON.stringify(d.widgets || []), actorId || null]);
  return rows[0];
}
const listDashboards = async (t) => (await pool.query("SELECT * FROM insights_dashboards WHERE tenant_id=$1 ORDER BY name", [t])).rows;
async function deleteDashboard(tenantId, id) { await pool.query("DELETE FROM insights_dashboards WHERE tenant_id=$1 AND id=$2", [tenantId, id]); return { ok: true }; }

module.exports = { overview, metricsCatalog, createDashboard, listDashboards, deleteDashboard, METRIC_CATALOG };
