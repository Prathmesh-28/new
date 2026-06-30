// Agent tool registry - wrappers over the existing books reporting / document /
// GST / master surface. Each tool carries an OpenAI-style function schema, a
// scope ("read" | "write"), and a run(tenantId,args,actorId) that returns a
// COMPACT, JSON-able result (big arrays trimmed to the top ~20 rows). READ tools
// execute inline during a run; WRITE tools (scope:"write" + role:[...POST_ROLES])
// are gated behind an explicit confirmation step in agents.js and only the listed
// roles may confirm them. CONTRACT (see orchestrator):
//   TOOLS = { name -> { scope, role?, schema:{type:"function",function:{name,description,parameters}}, run(tenantId,args,actorId) } }
//   toolCatalog() -> [{name,description,scope}]
//   toolSchemas(names) -> [schema...]            // for allowed names only
//   runTool(tenantId,name,args,actorId) -> JSON-able
//   isWrite(name) -> boolean
const reports = require("./reports");
const gst = require("./gst");
const documents = require("./documents");
const inventory = require("./inventory");
const ledgersadmin = require("./ledgersadmin");
const { PostError } = require("./posting-engine");
const { financialYearFor } = require("./fy");

const TOP = 20;

// Roles allowed to CONFIRM a write tool - mirrors http.js POST_ROLES.
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];

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
    scope: "read",
    schema: { type: "function", function: {
      name: "get_overdue_receivables",
      description: "Accounts-receivable aging - money customers owe, bucketed by how overdue it is (notDue / 0-30 / 31-60 / 61-90 / 90+ days). Use for 'who owes us', 'overdue invoices', 'collections'.",
      parameters: AS_OF_ARG } },
    async run(tenantId, args = {}) {
      const r = await reports.arAging(tenantId, args.asOf || null);
      return { asOf: r.asOf, totals: r.totals, parties: trim(r.parties) };
    },
  },

  get_payables: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_payables",
      description: "Accounts-payable aging - money we owe suppliers, bucketed by how overdue it is. Use for 'who do we owe', 'bills due', 'vendor payables'.",
      parameters: AS_OF_ARG } },
    async run(tenantId, args = {}) {
      const r = await reports.apAging(tenantId, args.asOf || null);
      return { asOf: r.asOf, totals: r.totals, parties: trim(r.parties) };
    },
  },

  get_trial_balance: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_trial_balance",
      description: "Trial balance for a financial year - every ledger's closing debit/credit and whether the books balance. Use for 'trial balance', 'ledger balances', 'is it balanced'.",
      parameters: FY_ARG } },
    async run(tenantId, args = {}) {
      const fy = args.fy || currentFy();
      const r = await reports.trialBalance(tenantId, fy);
      return { financialYear: r.financialYear, totalDebit: r.totalDebit, totalCredit: r.totalCredit, balanced: r.balanced, ledgers: trim(r.ledgers) };
    },
  },

  get_profit_loss: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_profit_loss",
      description: "Profit & Loss statement for a financial year - total income, total expense and net profit, with top income/expense lines. Use for 'P&L', 'profit', 'are we profitable', 'income statement'.",
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
    scope: "read",
    schema: { type: "function", function: {
      name: "get_gst_3b_summary",
      description: "GSTR-3B summary for a month - output tax, input tax credit (ITC) and net GST liability by head (CGST/SGST/IGST/CESS). Use for 'GST liability', 'how much GST do we owe', '3B'.",
      parameters: { type: "object", properties: {
        period: { type: "string", description: "Month as 'YYYY-MM' (e.g. '2025-09'). Defaults to the current month." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const period = args.period || currentPeriod();
      return await gst.gstr3b(tenantId, period);
    },
  },

  get_cash_flow: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_cash_flow",
      description: "Cash-flow statement (indirect method) over a date range - operating / investing / financing and net cash movement. Defaults to the current financial year. Use for 'cash flow', 'where did the cash go', 'runway'.",
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
    scope: "read",
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
    scope: "read",
    schema: { type: "function", function: {
      name: "get_stock_summary",
      description: "Stock / inventory summary over a date range - per-item opening, inward, outward and closing qty & value, plus totals. Defaults to the current financial year. Use for 'stock on hand', 'inventory value', 'closing stock'.",
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

  // ── WRITE tools (gated) ──────────────────────────────────────────────────────
  // These mutate the books. They are never executed inline during a run - agents.js
  // collects them as pendingActions and only confirmAction() (after a role check
  // against `role` below) calls run(). Each run() wraps a REAL existing books
  // create fn and returns a compact summary of the created row.
  create_sales_invoice: {
    scope: "write",
    role: WRITE_ROLES,
    schema: { type: "function", function: {
      name: "create_sales_invoice",
      description: "Create a SALES invoice document (status OPEN) for a customer. Wraps the real document create - does NOT post to the ledger by itself (a separate convert/post step does that). Use for 'raise an invoice', 'bill customer X', 'create a sales invoice'.",
      parameters: { type: "object", properties: {
        partyLedgerId: { type: "string", description: "The customer's ledger id (UUID) this invoice is billed to." },
        docDate: { type: "string", description: "Invoice date 'YYYY-MM-DD'. Defaults to today." },
        subtotal: { type: "number", description: "Pre-tax line total (used when no lines[] are given)." },
        gstRate: { type: "number", description: "GST rate percent for the single-rate path (e.g. 18)." },
        interState: { type: "boolean", description: "True for an inter-state (IGST) supply, false for intra-state (CGST+SGST)." },
        hsn: { type: "string", description: "HSN/SAC code for the single-rate path." },
        lines: { type: "array", description: "Optional line items [{itemId?,description,qty,rate,gstRate,...}]; overrides subtotal/gstRate when present.", items: { type: "object" } },
        reference: { type: "string", description: "Optional external reference / PO number." },
        narration: { type: "string", description: "Optional free-text note." },
      }, required: ["partyLedgerId"], additionalProperties: false } } },
    async run(tenantId, args = {}, actorId) {
      const d = {
        docKind: "INVOICE",
        docDate: args.docDate || today(),
        partyLedgerId: args.partyLedgerId || null,
        subtotal: args.subtotal || 0,
        gstRate: args.gstRate || 0,
        interState: !!args.interState,
        hsn: args.hsn || null,
        lines: Array.isArray(args.lines) ? args.lines : null,
        reference: args.reference || null,
        narration: args.narration || null,
      };
      const doc = await documents.createDocument(tenantId, actorId || null, d);
      return {
        id: doc.id, number: doc.doc_number, kind: doc.doc_kind, date: doc.doc_date,
        status: doc.status, partyLedgerId: doc.party_ledger_id, subtotal: doc.subtotal,
        gstRate: doc.gst_rate, interState: doc.inter_state, reference: doc.reference,
      };
    },
  },

  create_ledger: {
    scope: "write",
    role: WRITE_ROLES,
    schema: { type: "function", function: {
      name: "create_ledger",
      description: "Create a single ledger account (Chart-of-Accounts entry or a party). The group may be a group name (e.g. 'Sundry Debtors') or its UUID. Use for 'add a ledger', 'create an account', 'add a new customer/supplier account'.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "Ledger name (must be unique within its scope)." },
        group: { type: "string", description: "Parent account group - name (e.g. 'Sundry Debtors') or UUID." },
        openingBalance: { type: "number", description: "Opening balance amount (absolute). Defaults to 0." },
        openingDir: { type: "string", description: "'debit'/'dr' or 'credit'/'cr' for the opening balance. Defaults to debit." },
        isParty: { type: "boolean", description: "True if this is a customer/supplier party ledger." },
        gstin: { type: "string", description: "Optional GSTIN (validated)." },
        pan: { type: "string", description: "Optional PAN (validated)." },
        isBank: { type: "boolean", description: "True if this is a bank/cash ledger." },
      }, required: ["name", "group"], additionalProperties: false } } },
    async run(tenantId, args = {}, _actorId) {
      const led = await ledgersadmin.createOneLedger(tenantId, {
        name: args.name,
        group: args.group,
        opening_balance: args.openingBalance || 0,
        opening_dir: args.openingDir || null,
        is_party: !!args.isParty,
        gstin: args.gstin || null,
        pan: args.pan || null,
        is_bank: !!args.isBank,
      });
      return {
        id: led.id, name: led.name, groupId: led.group_id,
        openingBalance: led.opening_balance, openingIsDebit: led.opening_is_debit,
        isParty: led.is_party, gstin: led.gstin, pan: led.pan, isBank: led.is_bank,
      };
    },
  },

  create_item: {
    scope: "write",
    role: WRITE_ROLES,
    schema: { type: "function", function: {
      name: "create_item",
      description: "Create a stock/inventory item master. Use for 'add an item', 'create a product', 'add SKU to inventory'.",
      parameters: { type: "object", properties: {
        name: { type: "string", description: "Item name." },
        unit: { type: "string", description: "Unit of measure (e.g. 'NOS', 'KG', 'PCS')." },
        hsn: { type: "string", description: "Optional HSN/SAC code." },
        gstRate: { type: "number", description: "Optional GST rate percent (e.g. 18)." },
        valuationMethod: { type: "string", description: "'FIFO' or 'WEIGHTED_AVG' (default)." },
        openingQty: { type: "number", description: "Opening quantity. Defaults to 0." },
        openingValue: { type: "number", description: "Opening value. Defaults to 0." },
        reorderLevel: { type: "number", description: "Optional reorder level." },
        itemGroup: { type: "string", description: "Optional item group/category." },
      }, required: ["name", "unit"], additionalProperties: false } } },
    async run(tenantId, args = {}, _actorId) {
      const item = await inventory.createItem(tenantId, {
        name: args.name,
        unit: args.unit,
        hsn: args.hsn || null,
        gstRate: args.gstRate == null ? null : args.gstRate,
        valuationMethod: args.valuationMethod,
        openingQty: args.openingQty || 0,
        openingValue: args.openingValue || 0,
        reorderLevel: args.reorderLevel || 0,
        itemGroup: args.itemGroup || null,
      });
      return {
        id: item.id, name: item.name, unit: item.unit, hsn: item.hsn_sac,
        gstRate: item.gst_rate, valuationMethod: item.valuation_method,
        currentQty: item.current_qty, currentValue: item.current_value,
      };
    },
  },
};

// ── cross-domain platform tools ───────────────────────────────────────────────
// Merge in the whole-business READ tools (cash, transactions, receivables, alerts,
// forecast) so an agent built in the Agent Studio isn't limited to the books ledger.
// Same tool contract; all scope:"read". Books tools above win on any name clash.
const platformtools = require("./platformtools");
for (const [name, def] of Object.entries(platformtools.TOOLS)) {
  if (!TOOLS[name]) TOOLS[name] = def;
}

// ── registry surface (CONTRACT) ───────────────────────────────────────────────
function toolCatalog() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.schema.function.description,
    scope: t.scope || "read",
  }));
}

function toolSchemas(names) {
  const allow = Array.isArray(names) ? names : Object.keys(TOOLS);
  return allow.filter((n) => TOOLS[n]).map((n) => TOOLS[n].schema);
}

function isWrite(name) {
  const t = TOOLS[name];
  return !!t && t.scope === "write";
}

async function runTool(tenantId, name, args, actorId) {
  const t = TOOLS[name];
  if (!t) throw new PostError("UNKNOWN_TOOL", `Unknown tool '${name}'`, 400);
  return await t.run(tenantId, args || {}, actorId);
}

module.exports = { TOOLS, toolCatalog, toolSchemas, runTool, isWrite };
