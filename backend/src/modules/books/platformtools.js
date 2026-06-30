// platformtools.js - cross-domain READ tools for the Agent Studio.
//
// These let an agent reach the WHOLE business - cash, bank balances, transactions,
// receivables, alerts and the cash forecast - not just the books ledger. They read
// the tenant's app store (the same KV the WhatsApp assistant and CFO brief use) and
// return COMPACT, JSON-able results (big arrays trimmed). All are scope:"read", so
// they execute inline during a run with no approval step. Same tool contract as
// agenttools.js: { scope, schema:{type:"function",function:{...}}, run(tenantId,args) }.
"use strict";

const { pool } = require("../../db");

const TOP = 20;
function trim(arr, n = TOP) {
  if (!Array.isArray(arr)) return { rows: [], shown: 0, total: 0 };
  return { rows: arr.slice(0, n), shown: Math.min(arr.length, n), total: arr.length };
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

// Load the tenant's persisted app store (bankAccounts, transactions, invoices,
// alerts, forecast, …). Mirrors whatsapp.js getTenantData - the store lives in the
// kv_store under key='store'; the real payload is row.value.value.
async function loadStore(tenantId) {
  const { rows } = await pool.query(
    "SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store'",
    [tenantId]
  );
  const merged = {};
  for (const row of rows) Object.assign(merged, row.value?.value ?? {});
  return merged;
}

function monthlyBurn(transactions = []) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().slice(0, 10);
  const exp = transactions.filter((t) => t.amount < 0 && t.date >= cutoff);
  return exp.length ? Math.abs(exp.reduce((s, t) => s + t.amount, 0)) / 3 : 0;
}
function totalCash(accounts = []) { return accounts.reduce((s, a) => s + (a.balance ?? 0), 0); }

const NO_ARGS = { type: "object", properties: {}, additionalProperties: false };

const TOOLS = {
  get_business_snapshot: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_business_snapshot",
      description: "One-shot overview of the WHOLE business: total cash across bank accounts, monthly burn, cash runway (days), outstanding & overdue receivables, unread alerts, and top revenue sources. Use for 'how's the business', 'overview', 'health check', 'morning briefing'.",
      parameters: NO_ARGS } },
    async run(tenantId) {
      const d = await loadStore(tenantId);
      const accounts = d.bankAccounts ?? [];
      const cash = totalCash(accounts);
      const burn = monthlyBurn(d.transactions);
      const runway = burn > 0 ? Math.floor((cash / burn) * 30) : 999;
      const today = todayISO();
      const invoices = d.invoices ?? [];
      const open = invoices.filter((i) => i.status !== "paid");
      const overdue = open.filter((i) => i.dueDate < today);
      const topRevenue = Object.entries(
        (d.transactions ?? []).filter((t) => t.amount > 0 && t.counterparty)
          .reduce((acc, t) => { acc[t.counterparty] = (acc[t.counterparty] ?? 0) + t.amount; return acc; }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount: Math.round(amount) }));
      return {
        asOf: today,
        cash: { total: Math.round(cash), accounts: accounts.map((a) => ({ name: a.name, balance: a.balance })) },
        monthlyBurn: Math.round(burn),
        runwayDays: runway,
        receivables: {
          totalOutstanding: Math.round(open.reduce((s, i) => s + (i.amount || 0), 0)),
          overdueAmount: Math.round(overdue.reduce((s, i) => s + (i.amount || 0), 0)),
          overdueCount: overdue.length,
        },
        unreadAlerts: (d.alerts ?? []).filter((a) => !a.isRead).length,
        topRevenueSources: topRevenue,
      };
    },
  },

  get_bank_balances: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_bank_balances",
      description: "Current bank/cash account balances and the total cash on hand. Use for 'cash balance', 'how much money do we have', 'account balances'.",
      parameters: NO_ARGS } },
    async run(tenantId) {
      const d = await loadStore(tenantId);
      const accounts = (d.bankAccounts ?? []).map((a) => ({ name: a.name, provider: a.provider, balance: a.balance }));
      return { total: Math.round(totalCash(d.bankAccounts ?? [])), accounts: trim(accounts) };
    },
  },

  list_transactions: {
    scope: "read",
    schema: { type: "function", function: {
      name: "list_transactions",
      description: "Recent bank/cash transactions, most recent first. Optionally filter to income (money in) or expense (money out) and by category. Use for 'recent transactions', 'show expenses', 'last payments', 'unusual spend'.",
      parameters: { type: "object", properties: {
        type: { type: "string", description: "'income' (positive) or 'expense' (negative). Omit for both." },
        category: { type: "string", description: "Optional category filter (e.g. 'payroll', 'rent', 'tax')." },
        limit: { type: "number", description: "Max rows to return (default 20, max 50)." },
      }, additionalProperties: false } } },
    async run(tenantId, args = {}) {
      const d = await loadStore(tenantId);
      let txns = (d.transactions ?? []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (args.type === "income") txns = txns.filter((t) => t.amount > 0);
      else if (args.type === "expense") txns = txns.filter((t) => t.amount < 0);
      if (args.category) txns = txns.filter((t) => (t.category || "").toLowerCase() === String(args.category).toLowerCase());
      const limit = Math.min(Math.max(Number(args.limit) || TOP, 1), 50);
      const compact = txns.map((t) => ({ date: t.date, amount: t.amount, category: t.category, counterparty: t.counterparty, description: t.description }));
      return trim(compact, limit);
    },
  },

  get_receivables: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_receivables",
      description: "Customer invoices owed to the business - total outstanding, overdue (past due date) and due-soon. Use for 'who owes us', 'overdue invoices', 'collections'. (This is the operational invoices view; for the posted-ledger AR aging use get_overdue_receivables.)",
      parameters: NO_ARGS } },
    async run(tenantId) {
      const d = await loadStore(tenantId);
      const today = todayISO();
      const open = (d.invoices ?? []).filter((i) => i.status !== "paid");
      const overdue = open.filter((i) => i.dueDate < today).map((i) => ({ customer: i.customer, amount: i.amount, dueDate: i.dueDate, status: i.status }));
      const dueSoon = open.filter((i) => i.dueDate >= today).map((i) => ({ customer: i.customer, amount: i.amount, dueDate: i.dueDate, status: i.status }));
      return {
        totalOutstanding: Math.round(open.reduce((s, i) => s + (i.amount || 0), 0)),
        overdueAmount: Math.round(overdue.reduce((s, i) => s + (i.amount || 0), 0)),
        overdue: trim(overdue),
        dueSoon: trim(dueSoon),
      };
    },
  },

  get_alerts: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_alerts",
      description: "Current business alerts (cash, compliance, overdue, payroll, etc.). Use for 'what needs my attention', 'alerts', 'anything urgent'.",
      parameters: NO_ARGS } },
    async run(tenantId) {
      const d = await loadStore(tenantId);
      const alerts = (d.alerts ?? []).map((a) => ({ title: a.title || a.message, severity: a.severity, isRead: !!a.isRead, date: a.date }));
      const unread = alerts.filter((a) => !a.isRead);
      return { unread: unread.length, total: alerts.length, alerts: trim(unread.length ? unread : alerts) };
    },
  },

  get_cash_forecast: {
    scope: "read",
    schema: { type: "function", function: {
      name: "get_cash_forecast",
      description: "Cash-flow forecast points (date with p10/p50/p90 projected balance) if a forecast has been generated. Use for 'cash forecast', 'projected balance', 'will we run out of cash'.",
      parameters: NO_ARGS } },
    async run(tenantId) {
      const d = await loadStore(tenantId);
      const pts = (d.forecast ?? []).map((p) => ({ date: p.date, p10: Math.round(p.p10 ?? 0), p50: Math.round(p.p50 ?? 0), p90: Math.round(p.p90 ?? 0) }));
      return { points: trim(pts, 30) };
    },
  },
};

module.exports = { TOOLS };
