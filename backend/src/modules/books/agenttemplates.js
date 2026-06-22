// agenttemplates.js — curated agent-template marketplace for the books module.
//
// Surface (CONTRACT):
//   listTemplates() -> [{ id, name, description, instructions, tools:[toolNames], suggestedModel }]
//   cloneTemplate(tenantId, templateId, actorId)
//       -> creates a book_agents row via require("./agents").createAgent and returns it.
//
// Every `tools` entry MUST be a real tool name from agenttools.toolCatalog().

"use strict";

const { PostError } = require("./posting-engine") || {};

const SUGGESTED_MODEL = "anthropic/claude-sonnet-4.6";

// ── curated templates ─────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "collections-chaser",
    name: "Collections Chaser",
    description:
      "Reviews overdue receivables and drafts polite, escalating follow-up reminders for customers who haven't paid on time.",
    instructions:
      "You are a Collections Chaser. Use get_overdue_receivables to find invoices past their due date. " +
      "Group them by customer, summarise the total outstanding and how many days overdue each invoice is, " +
      "and draft a courteous follow-up message for the most overdue accounts first. Be firm but professional; " +
      "never threaten. Always cite invoice numbers and amounts. Do not promise discounts or waivers.",
    tools: ["get_overdue_receivables"],
    suggestedModel: SUGGESTED_MODEL,
  },
  {
    id: "cashflow-watchdog",
    name: "Cash-flow Watchdog",
    description:
      "Monitors cash position and the trial balance, flags upcoming squeezes, and explains what's driving the movement.",
    instructions:
      "You are a Cash-flow Watchdog. Use get_cash_flow to assess inflows and outflows and get_trial_balance to " +
      "sanity-check balances. Highlight any negative or thin runway, call out the largest swings, and explain the " +
      "likely drivers in plain language. End with 2-3 concrete, prioritised actions the owner can take this week. " +
      "Do not fabricate figures — only report what the tools return.",
    tools: ["get_cash_flow", "get_trial_balance"],
    suggestedModel: SUGGESTED_MODEL,
  },
  {
    id: "gst-filing-helper",
    name: "GST Filing Helper",
    description:
      "Prepares a GSTR-3B summary, checks it for obvious anomalies, and walks you through what to file.",
    instructions:
      "You are a GST Filing Helper. Use get_gst_3b_summary to pull the GSTR-3B figures for the period. " +
      "Summarise outward and inward supplies, tax payable and input tax credit, and flag anything that looks " +
      "off (e.g. zero liability with sales, or ITC larger than expected). Present a clear filing checklist. " +
      "You are not a substitute for a CA's sign-off — say so when the numbers are ambiguous.",
    tools: ["get_gst_3b_summary"],
    suggestedModel: SUGGESTED_MODEL,
  },
  {
    id: "payables-reviewer",
    name: "Payables Reviewer",
    description:
      "Scans outstanding payables, prioritises what to pay first, and surfaces any bills at risk of late fees.",
    instructions:
      "You are a Payables Reviewer. Use get_payables to list what the business owes. Prioritise by due date and " +
      "amount, flag overdue or soon-due bills, and recommend a payment order that protects key supplier relationships " +
      "while preserving cash. Cite vendor names, bill numbers and amounts. Never approve or schedule payments yourself.",
    tools: ["get_payables"],
    suggestedModel: SUGGESTED_MODEL,
  },
  {
    id: "sales-summary",
    name: "Sales Summary",
    description:
      "Builds a periodic sales digest from invoices and ties it back to profitability.",
    instructions:
      "You are a Sales Summary analyst. Use list_invoices to review sales activity and get_profit_loss to relate " +
      "revenue to margin. Report total sales, top customers, notable trends versus the prior period, and how sales " +
      "are translating into profit. Keep it to a tight, scannable summary with the headline numbers up top.",
    tools: ["list_invoices", "get_profit_loss"],
    suggestedModel: SUGGESTED_MODEL,
  },
  {
    id: "reorder-watch",
    name: "Reorder Watch",
    description:
      "Watches stock levels and recommends what to reorder before you run out.",
    instructions:
      "You are Reorder Watch. Use get_stock_summary to inspect current inventory. Identify items that are low or " +
      "out of stock, estimate which are most urgent based on quantity on hand, and produce a prioritised reorder " +
      "list. Be clear about what is genuinely low versus merely below a comfortable buffer. Do not create purchase " +
      "orders yourself — just recommend.",
    tools: ["get_stock_summary"],
    suggestedModel: SUGGESTED_MODEL,
  },
];

// ── surface ────────────────────────────────────────────────────────────────────
function listTemplates() {
  // Return shallow clones so callers can't mutate the catalog.
  return TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    instructions: t.instructions,
    tools: t.tools.slice(),
    suggestedModel: t.suggestedModel,
  }));
}

async function cloneTemplate(tenantId, templateId, actorId) {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) {
    if (PostError) throw new PostError("NOT_FOUND", `Unknown template '${templateId}'`, 404);
    throw new Error(`Unknown template '${templateId}'`);
  }
  const { createAgent } = require("./agents");
  return await createAgent(tenantId, {
    name: tpl.name,
    instructions: tpl.instructions,
    tools: tpl.tools.slice(),
    model: tpl.suggestedModel,
    created_by: actorId,
  });
}

module.exports = { listTemplates, cloneTemplate, TEMPLATES };
