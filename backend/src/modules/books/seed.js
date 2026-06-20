// §5.1 — seed Tally's 28 predefined groups (15 primary + 13 sub) per tenant, plus
// the default ledgers the sales/receipt mappers need. Idempotent.
const { pool } = require("../../db");

const PRIMARY_GROUPS = [
  ["Capital Account", "EQUITY", false], ["Loans (Liability)", "LIABILITY", false],
  ["Current Liabilities", "LIABILITY", false], ["Fixed Assets", "ASSET", false],
  ["Investments", "ASSET", false], ["Current Assets", "ASSET", false],
  ["Branch / Divisions", "ASSET", false], ["Misc. Expenses (Asset)", "ASSET", false],
  ["Suspense Account", "LIABILITY", false], ["Sales Accounts", "INCOME", true],
  ["Purchase Accounts", "EXPENSE", true], ["Direct Incomes", "INCOME", true],
  ["Direct Expenses", "EXPENSE", true], ["Indirect Incomes", "INCOME", true],
  ["Indirect Expenses", "EXPENSE", true],
];

const SUB_GROUPS = [
  ["Bank Accounts", "Current Assets", "ASSET", false], ["Bank OD A/c", "Loans (Liability)", "LIABILITY", false],
  ["Cash-in-hand", "Current Assets", "ASSET", false], ["Deposits (Asset)", "Current Assets", "ASSET", false],
  ["Loans & Advances (Asset)", "Current Assets", "ASSET", false], ["Stock-in-hand", "Current Assets", "ASSET", false],
  ["Sundry Debtors", "Current Assets", "ASSET", false], ["Duties & Taxes", "Current Liabilities", "LIABILITY", false],
  ["Provisions", "Current Liabilities", "LIABILITY", false], ["Sundry Creditors", "Current Liabilities", "LIABILITY", false],
  ["Reserves & Surplus", "Capital Account", "EQUITY", false], ["Secured Loans", "Loans (Liability)", "LIABILITY", false],
  ["Unsecured Loans", "Loans (Liability)", "LIABILITY", false],
];

// [ledger name, group name] — the everyday set + tax ledgers the mappers reference.
const DEFAULT_LEDGERS = [
  ["Cash", "Cash-in-hand"], ["Sales", "Sales Accounts"], ["Purchases", "Purchase Accounts"],
  ["CGST Output", "Duties & Taxes"], ["SGST Output", "Duties & Taxes"], ["IGST Output", "Duties & Taxes"],
  ["CGST Input", "Duties & Taxes"], ["SGST Input", "Duties & Taxes"], ["IGST Input", "Duties & Taxes"],
  ["TDS Payable", "Duties & Taxes"], ["Round Off", "Indirect Expenses"],
  // M2: holding + returns ledgers
  ["Undeposited Funds", "Current Assets"], ["Sales Returns", "Sales Accounts"], ["Purchase Returns", "Purchase Accounts"],
  // M3: inventory GL ledgers
  ["Stock-in-hand", "Stock-in-hand"], ["Cost of Goods Sold", "Direct Expenses"], ["Stock Adjustment", "Direct Expenses"],
  // M7: forex + depreciation ledgers
  ["Forex Gain/Loss", "Indirect Expenses"], ["Depreciation", "Indirect Expenses"], ["Accumulated Depreciation", "Fixed Assets"],
];

async function seedBooks(tenantId) {
  for (const [name, nature, pl] of PRIMARY_GROUPS) {
    await pool.query("INSERT INTO book_account_groups(tenant_id,name,nature,affects_pl,is_system) VALUES($1,$2,$3,$4,true) ON CONFLICT(tenant_id,name) DO NOTHING", [tenantId, name, nature, pl]);
  }
  let { rows: groups } = await pool.query("SELECT id,name FROM book_account_groups WHERE tenant_id=$1", [tenantId]);
  let gid = Object.fromEntries(groups.map((g) => [g.name, g.id]));
  for (const [name, parent, nature, pl] of SUB_GROUPS) {
    await pool.query("INSERT INTO book_account_groups(tenant_id,name,parent_id,nature,affects_pl,is_system) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(tenant_id,name) DO NOTHING", [tenantId, name, gid[parent] || null, nature, pl]);
  }
  ({ rows: groups } = await pool.query("SELECT id,name FROM book_account_groups WHERE tenant_id=$1", [tenantId]));
  gid = Object.fromEntries(groups.map((g) => [g.name, g.id]));
  let ledgers = 0;
  for (const [name, group] of DEFAULT_LEDGERS) {
    if (!gid[group]) continue;
    const r = await pool.query("INSERT INTO book_ledgers(tenant_id,name,group_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,name) DO NOTHING", [tenantId, name, gid[group]]);
    ledgers += r.rowCount;
  }
  return { groups: groups.length, ledgers };
}

async function ledgerIdByName(tenantId, name) {
  const { rows } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND name=$2", [tenantId, name]);
  return rows[0] ? rows[0].id : null;
}

module.exports = { seedBooks, ledgerIdByName, PRIMARY_GROUPS, SUB_GROUPS, DEFAULT_LEDGERS };
