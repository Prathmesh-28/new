// Phase 1 agent tool registry — READ-ONLY wrappers over the existing books
// reporting/document/GST surface. Each tool carries an OpenAI-style function
// schema plus a run(tenantId,args) that returns a COMPACT, JSON-able summary
// (big arrays trimmed to the top ~20 rows). No writes happen here, so no
// confirmation gate is needed in Phase 1. CONTRACT (see orchestrator):
//   TOOLS = { name -> { schema:{type:"function",function:{name,description,parameters}}, run(tenantId,args) } }
//   toolCatalog() -> [{name,description}]
//   toolSchemas(names) -> [schema...]   // for allowed names only
//   runTool(tenantId,name,args) -> JSON-able
const reports = require("./reports");
const gst = require("./gst");
const documents = require("./documents");
const { PostError } = require("./posting-engine");
const { financialYearFor } = require("./fy");

const TOP = 20;

// ── default helpers ──────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function currentFy() { return financialYearFor(today()); }      // "YYYY-YY"
function currentPeriod() { return today().slice(0, 7); }        // "YYYY-MM"
function fyBounds(fy) {                                          // → { from, to }
  const start = Number(String(fy).split("-")[0]);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}
function trim(arr, n = TOP) {
  if (!Array.isArray(arr)) return { rows: [], shown: 0, total: 0 };
  return { rows: arr.slice(0, n), shown: Math.min(arr.length, n), total: arr.length };
}

// ── schema param shapes (shared) ─────────────────────────────────────────────
const FY_ARG = {
  type: "object",
  properties: { fy: { type: "string", description: "Financial year 'YYYY-YY' (e.g. '2025-26'). Defaults to the current FY." } },
  additionalProperties: false,
};
const AS_OF_ARG = {
  type: "object",
  properties: { asOf: { type: "string", description: "As-of date 'YYYY-MM-DD'. Defaults to today." } },
  additionalProperties: false,
};

// ── tools ────────────────────────────────────────────────────────────────────
const TOOLS = {
  get_overdue_receivables: {
    schema: { type: "function", function: {
      name: "get_overdue_receivables",
      description: "Accounts-receivable aging — money customers owe, bucketed by how overdue it is (notDue / 0-30 / 31-60 / 61-90 / 90+ days). Use for 'who owes us', 'overdue invoices', 'collections'.",
      parameters: AS_OF_ARG } },
    async run(tenantId, args = {}) {
      const r = await reports.arAging(tenantId, args.asOf || null);
      return { asOf: r.asOf, totals: r.totals, parties: trim(r.parties) };
    },
  },

  get_payables: {
    schema: { type: "function", function: {
      name: "get_payables",
      description: "Accounts-payable aging — money we owe suppliers, bucketed by how overdue it is. Use for 'who do we owe', 'bills due', 'vendor payables'.",
      parameters: AS_OF_ARG } },
    async run(tenantId, args = {}) {
      const r = await reports.apAging(tenantId, args.asOf || null);
      return { asOf: r.asOf, totals: r.totals, parties: trim(r.parties) };
    },
  },

  get_trial_balance: {
    schema: { type: "function", function: {
      name: "get_trial_balance",
      description: "Trial balance for a financial year — every ledger's closing debit/credit and whether the books balance. Use for 'trial balance', 'ledger balances', 'is it balanced'.",
      parameters: FY_ARG } },
    async run(tenantId, args = {}) {
      const fy = args.fy || currentFy();
      const r = await reports.trialBalance(tenantId, fy);
      return { financialYear: r.financialYear, totalDebit: r.totalDebit, totalCredit: r.totalCredit, balanced: r.balanced, ledgers: trim(r.ledgers) };
    },
  },

  get_profit_loss: {
    schema: { type: "function", function: {
      name: "get_profit_loss",
      description: "Profit & Loss statement for a financial year — total income, total expense and net profit, with top income/expense lines. Use for 'P&L', 'profit', 'are we profitable', 'income statement'.",
      parameters: FY_ARG } },
    async run(tenantId, args = {}) {
      const fy = args.fy || currentFy();
      const r = await reports.profitLoss(tenantId, fy);
      return {
        financialYear: r.financialYear,
        totalIncome: r.totalIncome, totalExpense: r.totalExpense, netProfit: r.netProfit,
        income: trim(r.income), expense: trim(r.expense),
      };
    },
  },

  get_gst_3b_summary: {
    schema: { type: "function", function: {
      name: "get_gst_3b_summary",
      description: "GSTR-3B summary for a month — output tax, input tax credit (ITC) and net GST liability by head (CGST/SGST/IGST/CESS). Use for 'GST liability', 'how much GST do we owe', '3B'.",
      parameters: { type: "object", properties: {
        period: { type: "string", description: "Month as 'YYYY-MM' (e.g. '2025-09'). Defaults to the current month." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const period = args.period || currentPeriod();
      return await gst.gstr3b(tenantId, period);
    },
  },

  get_cash_flow: {
    schema: { type: "function", function: {
      name: "get_cash_flow",
      description: "Cash-flow statement (indirect method) over a date range — operating / investing / financing and net cash movement. Defaults to the current financial year. Use for 'cash flow', 'where did the cash go', 'runway'.",
      parameters: { type: "object", properties: {
        from: { type: "string", description: "Start date 'YYYY-MM-DD'. Defaults to the start of the current FY." },
        to: { type: "string", description: "End date 'YYYY-MM-DD'. Defaults to today." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const b = fyBounds(currentFy());
      const from = args.from || b.from;
      const to = args.to || today();
      const r = await reports.cashFlow(tenantId, from, to);
      return {
        from, to,
        operating: r.operating, investing: r.investing, financing: r.financing,
        netCashFlow: r.netCashFlow, reconciles: r.reconciles,
        detail: { netProfit: r.detail.netProfit, nonCashAddBacks: r.detail.nonCashAddBacks, workingCapitalChange: r.detail.workingCapitalChange },
      };
    },
  },

  list_invoices: {
    schema: { type: "function", function: {
      name: "list_invoices",
      description: "List recent SALES invoices (most recent first). Optionally filter by status. Use for 'show invoices', 'recent sales', 'unpaid invoices'.",
      parameters: { type: "object", properties: {
        status: { type: "string", description: "Optional document status filter (e.g. 'POSTED', 'DRAFT')." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const filter = { kind: "INVOICE" };
      if (args.status) filter.status = args.status;
      const rows = await documents.listDocuments(tenantId, filter);
      const compact = rows.map((d) => ({
        id: d.id, number: d.doc_number, date: d.doc_date, status: d.status,
        partyLedgerId: d.party_ledger_id, subtotal: d.subtotal, gstRate: d.gst_rate, reference: d.reference,
      }));
      return { kind: "INVOICE", status: args.status || null, invoices: trim(compact) };
    },
  },

  get_stock_summary: {
    schema: { type: "function", function: {
      name: "get_stock_summary",
      description: "Stock / inventory summary over a date range — per-item opening, inward, outward and closing qty & value, plus totals. Defaults to the current financial year. Use for 'stock on hand', 'inventory value', 'closing stock'.",
      parameters: { type: "object", properties: {
        from: { type: "string", description: "Start date 'YYYY-MM-DD'. Defaults to the start of the current FY." },
        to: { type: "string", description: "End date 'YYYY-MM-DD'. Defaults to today." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const b = fyBounds(currentFy());
      const from = args.from || b.from;
      const to = args.to || today();
      const r = await reports.stockSummary(tenantId, from, to);
      const compact = (r.items || []).map((i) => ({
        itemId: i.itemId, name: i.name, unit: i.unit,
        closingQty: i.closingQty, closingValue: i.closingValue, currentValue: i.currentValue,
      }));
      return { from: r.from, to: r.to, totals: r.totals, items: trim(compact) };
    },
  },
};

// ── registry surface (CONTRACT) ───────────────────────────────────────────────
function toolCatalog() {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.schema.function.description }));
}

function toolSchemas(names) {
  const allow = Array.isArray(names) ? names : Object.keys(TOOLS);
  return allow.filter((n) => TOOLS[n]).map((n) => TOOLS[n].schema);
}

async function runTool(tenantId, name, args) {
  const t = TOOLS[name];
  if (!t) throw new PostError("UNKNOWN_TOOL", `Unknown tool '${name}'`, 400);
  return await t.run(tenantId, args || {});
}

module.exports = { TOOLS, toolCatalog, toolSchemas, runTool };
