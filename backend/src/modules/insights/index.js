// Insights - two layers:
//
//   A) Cross-module KPI overview (finance from books, sales from CRM, people from
//      HRMS) + saved dashboards. Computed live so it always reconciles. (UNCHANGED.)
//
//   B) A SAFE query engine ported from Frappe Insights' query/chart/dashboard model.
//      A query is a STRUCTURED MODEL over a WHITELISTED dataset - never raw SQL. The
//      model { source, columns, filters, group_by, order_by, limit } is compiled to a
//      PARAMETERIZED SQL string. Safety is the point:
//        - only columns present in the dataset whitelist may appear (every column /
//          group-by / order-by / filter target is validated; anything else THROWS);
//        - operators come from a fixed allowlist (= != > >= < <= in like between);
//        - aggregates come from a fixed set (none sum avg min max count);
//        - ALL values are bound as $N parameters (never string-concatenated);
//        - tenant_id = $1 is ALWAYS injected into the WHERE clause;
//        - LIMIT is always present and hard-capped (<= MAX_LIMIT).
//      The dataset whitelist maps a friendly key -> a real table/view + the exact set
//      of selectable columns (with types). Joins are pre-baked into curated views in
//      the FROM clause; the user never supplies a table or join.
const { pool } = require("../../db");
const books = require("../books");
const crm = require("../crm");
const hrms = require("../hrms");

// ─────────────────────────────────────────────────────────────────────────────
// A) LIVE CROSS-MODULE OVERVIEW  (unchanged behaviour - the page depends on it)
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// B) SAFE QUERY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

// Fixed aggregate allowlist (mirrors Frappe's Aggregations.apply). Maps the model's
// aggregate keyword -> the SQL function applied to the (already-validated) column.
// `count` is special-cased to COUNT(*) so it needs no column.
const AGGREGATES = {
  none: null,
  sum: (sql) => `SUM(${sql})`,
  avg: (sql) => `AVG(${sql})`,
  min: (sql) => `MIN(${sql})`,
  max: (sql) => `MAX(${sql})`,
  count: () => `COUNT(*)`,
};

// Fixed operator allowlist (mirrors Frappe's BinaryOperations + set ops). Each entry
// knows its arity and how many $N placeholders it consumes. Values NEVER touch the
// SQL string - only `$N` placeholders do.
const OPERATORS = {
  "=": { sql: (c, p) => `${c} = ${p[0]}`, params: 1 },
  "!=": { sql: (c, p) => `${c} <> ${p[0]}`, params: 1 },
  ">": { sql: (c, p) => `${c} > ${p[0]}`, params: 1 },
  ">=": { sql: (c, p) => `${c} >= ${p[0]}`, params: 1 },
  "<": { sql: (c, p) => `${c} < ${p[0]}`, params: 1 },
  "<=": { sql: (c, p) => `${c} <= ${p[0]}`, params: 1 },
  like: { sql: (c, p) => `${c} ILIKE ${p[0]}`, params: 1 },
  in: { sql: (c, p) => `${c} IN (${p.join(", ")})`, params: "list" },
  between: { sql: (c, p) => `${c} BETWEEN ${p[0]} AND ${p[1]}`, params: 2 },
};

// ── DATASET WHITELIST ────────────────────────────────────────────────────────
// The ONLY tables/views queryable. Each dataset maps a friendly key -> a real FROM
// expression (table or curated join view) + the exact selectable columns and their
// types. Every column the model references is checked against `columns` here; a
// column not listed THROWS. `from` is a server-controlled constant (never built from
// input) and every row source contains a `tenant_id` column the compiler filters on.
const DATASETS = {
  vouchers: {
    label: "Vouchers (book entries)",
    description: "Every accounting voucher - sales, purchases, payments, receipts, journals.",
    from: "book_vouchers",
    columns: {
      voucher_type: { type: "string" },
      voucher_number: { type: "number" },
      voucher_date: { type: "date" },
      financial_year: { type: "string" },
      narration: { type: "string" },
      reference: { type: "string" },
      is_cancelled: { type: "boolean" },
      source: { type: "string" },
      created_at: { type: "datetime" },
    },
  },

  // Curated join view: voucher entries + their ledger + voucher header. Lets users
  // slice the ledger (debits/credits) by account name, voucher type and date. The
  // join is server-controlled; the user only picks from the columns below.
  voucher_entries: {
    label: "Ledger entries (entries + ledger + voucher)",
    description: "Debit/credit lines joined to their ledger account and voucher header.",
    from: `(
      SELECT e.tenant_id        AS tenant_id,
             e.debit            AS debit,
             e.credit           AS credit,
             l.name             AS ledger_name,
             l.is_bank          AS is_bank,
             l.is_party         AS is_party,
             g.name             AS account_group,
             v.voucher_type     AS voucher_type,
             v.voucher_date     AS voucher_date,
             v.financial_year   AS financial_year,
             v.is_cancelled     AS is_cancelled
        FROM book_voucher_entries e
        JOIN book_vouchers v   ON v.id = e.voucher_id
        JOIN book_ledgers  l   ON l.id = e.ledger_id
        LEFT JOIN book_account_groups g ON g.id = l.group_id
    ) AS voucher_entries`,
    columns: {
      debit: { type: "number" },
      credit: { type: "number" },
      ledger_name: { type: "string" },
      is_bank: { type: "boolean" },
      is_party: { type: "boolean" },
      account_group: { type: "string" },
      voucher_type: { type: "string" },
      voucher_date: { type: "date" },
      financial_year: { type: "string" },
      is_cancelled: { type: "boolean" },
    },
  },

  // Invoices / receivables: SALES vouchers (= invoices in Headroom) joined to the
  // party ledger they were billed to.
  invoices: {
    label: "Invoices & receivables (sales vouchers)",
    description: "Sales invoices (SALES vouchers) with the party they were billed to.",
    from: `(
      SELECT v.tenant_id       AS tenant_id,
             v.voucher_number  AS invoice_number,
             v.voucher_date    AS invoice_date,
             v.financial_year  AS financial_year,
             v.reference       AS reference,
             v.is_cancelled    AS is_cancelled,
             p.name            AS party_name,
             p.state_code      AS party_state_code,
             p.gstin           AS party_gstin,
             COALESCE((
               SELECT SUM(e.debit) - SUM(e.credit)
                 FROM book_voucher_entries e
                WHERE e.voucher_id = v.id
             ), 0)             AS amount
        FROM book_vouchers v
        LEFT JOIN book_ledgers p ON p.id = v.party_ledger_id
       WHERE v.voucher_type = 'SALES'
    ) AS invoices`,
    columns: {
      invoice_number: { type: "number" },
      invoice_date: { type: "date" },
      financial_year: { type: "string" },
      reference: { type: "string" },
      is_cancelled: { type: "boolean" },
      party_name: { type: "string" },
      party_state_code: { type: "string" },
      party_gstin: { type: "string" },
      amount: { type: "number" },
    },
  },

  crm_deals: {
    label: "CRM deals",
    description: "Sales pipeline - deals, their stage, value and probability.",
    from: "crm_deals",
    columns: {
      title: { type: "string" },
      value: { type: "number" },
      currency: { type: "string" },
      stage: { type: "string" },
      probability: { type: "number" },
      status: { type: "string" },
      expected_close: { type: "date" },
      created_at: { type: "datetime" },
      closed_at: { type: "datetime" },
    },
  },

  crm_leads: {
    label: "CRM leads",
    description: "Inbound / outbound leads and where they came from.",
    from: "crm_leads",
    columns: {
      name: { type: "string" },
      company: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      source: { type: "string" },
      status: { type: "string" },
      created_at: { type: "datetime" },
    },
  },

  hrms_employees: {
    label: "Employees",
    description: "People directory - department, designation, status, joining date.",
    from: "hrms_employees",
    columns: {
      name: { type: "string" },
      email: { type: "string" },
      department: { type: "string" },
      designation: { type: "string" },
      status: { type: "string" },
      date_of_joining: { type: "date" },
      relieving_date: { type: "date" },
      created_at: { type: "datetime" },
    },
  },

  hrms_payroll_runs: {
    label: "Payroll runs",
    description: "Monthly payroll runs - gross, deductions and net.",
    from: "hrms_payroll_runs",
    columns: {
      run_month: { type: "string" },
      status: { type: "string" },
      gross: { type: "number" },
      total_deduction: { type: "number" },
      net: { type: "number" },
      created_at: { type: "datetime" },
    },
  },
};

// Public catalogue (no `from` expressions leak to the client - only safe metadata).
function datasetsCatalog() {
  return Object.entries(DATASETS).map(([key, ds]) => ({
    key,
    label: ds.label,
    description: ds.description,
    columns: Object.entries(ds.columns).map(([column, def]) => ({ column, type: def.type })),
  }));
}

// A bare, valid SQL identifier - defensive sanity check on whitelist keys before
// they reach the SQL string. (Column names always come from DATASETS keys, never
// from user input, but we re-assert the shape so a bad whitelist entry can never
// produce an injectable identifier.)
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

function assertIdent(name) {
  if (typeof name !== "string" || !IDENT_RE.test(name)) {
    throw new Error(`Unsafe identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

// Resolve & validate a column against the dataset whitelist. THROWS on anything not
// whitelisted. Returns the safe, quoted SQL identifier.
function resolveColumn(dataset, column) {
  if (!Object.prototype.hasOwnProperty.call(dataset.columns, column)) {
    throw new Error(`Column not in whitelist: ${JSON.stringify(column)}`);
  }
  return `"${assertIdent(column)}"`;
}

// Coerce/validate a filter value for binding. Arrays only allowed for `in`. We never
// inspect the value's content for SQL - it's bound as a parameter - but we reject
// shapes that would break arity (objects, nested arrays) to fail loudly.
function normalizeValue(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean") return v;
  throw new Error(`Unsupported filter value type: ${t}`);
}

// ── THE COMPILER ───────────────────────────────────────────────────────────────
// Compile a query model -> { text, params }. `params[0]` is ALWAYS the tenant id.
// Throws on any non-whitelisted dataset / column / operator / aggregate.
function compile(model, tenantId) {
  if (!model || typeof model !== "object") throw new Error("Invalid query model");

  const dataset = DATASETS[model.source];
  if (!dataset) throw new Error(`Dataset not in whitelist: ${JSON.stringify(model.source)}`);

  const params = [tenantId]; // $1 is always the tenant
  const bind = (value) => {
    params.push(normalizeValue(value));
    return `$${params.length}`;
  };

  // SELECT - columns with optional aggregate. `count` ignores its column (COUNT(*)).
  const cols = Array.isArray(model.columns) ? model.columns : [];
  const groupBy = Array.isArray(model.group_by) ? model.group_by : [];
  const selectParts = [];
  const groupParts = [];

  for (const gb of groupBy) {
    const sqlCol = resolveColumn(dataset, gb);
    groupParts.push(sqlCol);
  }

  if (cols.length === 0 && groupBy.length === 0) {
    // No columns chosen → select every whitelisted column explicitly (never `*`,
    // and never tenant noise - exactly the catalogued columns).
    for (const c of Object.keys(dataset.columns)) selectParts.push(`"${assertIdent(c)}"`);
  } else {
    // group_by columns are always selected (as dimensions).
    for (const gb of groupBy) selectParts.push(resolveColumn(dataset, gb));

    for (const c of cols) {
      const colName = c && typeof c === "object" ? c.column : c;
      const agg = (c && typeof c === "object" && c.aggregate) || "none";
      if (!Object.prototype.hasOwnProperty.call(AGGREGATES, agg)) {
        throw new Error(`Aggregate not in whitelist: ${JSON.stringify(agg)}`);
      }
      const aggFn = AGGREGATES[agg];

      if (agg === "count") {
        // COUNT(*) - alias to a stable name so the result column is predictable.
        selectParts.push(`COUNT(*) AS "count"`);
        continue;
      }

      const sqlCol = resolveColumn(dataset, colName);
      if (aggFn) {
        // Alias the aggregate back to the (whitelisted, safely-quoted) column name so
        // the result set has a predictable, named column.
        selectParts.push(`${aggFn(sqlCol)} AS ${sqlCol}`);
      } else {
        selectParts.push(sqlCol);
        // A non-aggregated, non-group-by column with aggregates present would be an
        // invalid GROUP BY; treat any plain selected column as an implicit dimension
        // when aggregates are in play.
        if (!groupParts.includes(sqlCol) && cols.some((x) => x && typeof x === "object" && x.aggregate && x.aggregate !== "none")) {
          groupParts.push(sqlCol);
        }
      }
    }
  }

  // WHERE - tenant filter ALWAYS first, then validated/parameterized user filters.
  const whereParts = [`"tenant_id" = $1`];
  const filters = Array.isArray(model.filters) ? model.filters : [];
  for (const f of filters) {
    if (!f || typeof f !== "object") throw new Error("Invalid filter");
    const op = OPERATORS[f.op];
    if (!op) throw new Error(`Operator not in whitelist: ${JSON.stringify(f.op)}`);
    const sqlCol = resolveColumn(dataset, f.column);

    if (op.params === "list") {
      const list = Array.isArray(f.value) ? f.value : [f.value];
      if (list.length === 0) throw new Error(`Operator '${f.op}' needs at least one value`);
      const placeholders = list.map((v) => bind(v));
      whereParts.push(op.sql(sqlCol, placeholders));
    } else if (op.params === 2) {
      const list = Array.isArray(f.value) ? f.value : [];
      if (list.length !== 2) throw new Error(`Operator '${f.op}' needs exactly two values`);
      whereParts.push(op.sql(sqlCol, [bind(list[0]), bind(list[1])]));
    } else {
      whereParts.push(op.sql(sqlCol, [bind(f.value)]));
    }
  }

  // ORDER BY - column must be whitelisted; direction restricted to ASC/DESC.
  const orderBy = Array.isArray(model.order_by) ? model.order_by : [];
  const orderParts = [];
  for (const o of orderBy) {
    if (!o || typeof o !== "object") throw new Error("Invalid order_by");
    const sqlCol = resolveColumn(dataset, o.column);
    const dir = String(o.dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    orderParts.push(`${sqlCol} ${dir}`);
  }

  // LIMIT - always present, hard-capped.
  let limit = Number.parseInt(model.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let text = `SELECT ${selectParts.join(", ")} FROM ${dataset.from}`;
  text += ` WHERE ${whereParts.join(" AND ")}`;
  if (groupParts.length) text += ` GROUP BY ${groupParts.join(", ")}`;
  if (orderParts.length) text += ` ORDER BY ${orderParts.join(", ")}`;
  text += ` LIMIT ${limit}`;

  return { text, params };
}

// Compile + execute. Returns { columns, rows }.
async function runQuery(tenantId, model) {
  const { text, params } = compile(model, tenantId);
  // The BI query can target RLS-protected sources (e.g. crm_deals/crm_leads), so run it
  // under the tenant GUC. Harmless for non-RLS sources (the GUC is simply ignored).
  const result = await require("../../lib/tenantDb").q(tenantId, text, params);
  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rowCount,
  };
}

// ── SAVED QUERIES ───────────────────────────────────────────────────────────────
async function saveQuery(tenantId, actorId, q) {
  const name = (q.name || "").trim();
  if (!name) throw new Error("Query name is required");
  const model = { source: q.source, columns: q.columns || [], filters: q.filters || [], group_by: q.group_by || [], order_by: q.order_by || [], limit: q.limit };
  // Compile once at save time so an invalid/unsafe model is rejected before it lands.
  compile(model, tenantId);
  const { rows } = await pool.query(
    `INSERT INTO insights_queries(tenant_id,name,source,model,created_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(tenant_id,name)
       DO UPDATE SET source=EXCLUDED.source, model=EXCLUDED.model, updated_at=now()
       RETURNING *`,
    [tenantId, name, model.source, JSON.stringify(model), actorId || null]
  );
  return rows[0];
}
const listQueries = async (t) => (await pool.query("SELECT * FROM insights_queries WHERE tenant_id=$1 ORDER BY name", [t])).rows;
async function getQuery(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM insights_queries WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  return rows[0] || null;
}
async function runSavedQuery(tenantId, id) {
  const q = await getQuery(tenantId, id);
  if (!q) throw new Error("Query not found");
  return runQuery(tenantId, q.model);
}
async function deleteQuery(tenantId, id) { await pool.query("DELETE FROM insights_queries WHERE tenant_id=$1 AND id=$2", [tenantId, id]); return { ok: true }; }

// ── SAVED CHARTS ──────────────────────────────────────────────────────────────
const CHART_TYPES = new Set(["bar", "line", "pie", "number", "table"]);
async function saveChart(tenantId, actorId, c) {
  const name = (c.name || "").trim();
  if (!name) throw new Error("Chart name is required");
  if (!c.queryId) throw new Error("Chart must reference a query");
  const type = c.config && c.config.type;
  if (!CHART_TYPES.has(type)) throw new Error(`Unsupported chart type: ${JSON.stringify(type)}`);
  // Ensure the referenced query belongs to this tenant.
  const q = await getQuery(tenantId, c.queryId);
  if (!q) throw new Error("Referenced query not found");
  const { rows } = await pool.query(
    `INSERT INTO insights_charts(tenant_id,name,query_id,config,created_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(tenant_id,name)
       DO UPDATE SET query_id=EXCLUDED.query_id, config=EXCLUDED.config
       RETURNING *`,
    [tenantId, name, c.queryId, JSON.stringify(c.config || {}), actorId || null]
  );
  return rows[0];
}
const listCharts = async (t) =>
  (await pool.query(
    `SELECT c.*, q.name AS query_name, q.source AS query_source
       FROM insights_charts c JOIN insights_queries q ON q.id=c.query_id
      WHERE c.tenant_id=$1 ORDER BY c.name`,
    [t]
  )).rows;
async function deleteChart(tenantId, id) { await pool.query("DELETE FROM insights_charts WHERE tenant_id=$1 AND id=$2", [tenantId, id]); return { ok: true }; }

module.exports = {
  // overview / dashboards (unchanged)
  overview, metricsCatalog, createDashboard, listDashboards, deleteDashboard, METRIC_CATALOG,
  // query engine
  DATASETS, datasetsCatalog, compile, runQuery,
  saveQuery, listQueries, getQuery, runSavedQuery, deleteQuery,
  saveChart, listCharts, deleteChart,
};
