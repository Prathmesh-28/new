"use strict";
// Automation-rule → Flow converter (roadmap #20 convergence). Turns a client-side "IF <field>
// <op> <value> THEN <action>" rule (from the /automation Rule Builder) into a real, event-
// triggered Flow the cron-wired Flows engine actually executes — so the rules stop being a
// client-side preview and start running on the backend.
//
//   invoice rules   → trigger on invoice.created (amount/status/customer) or invoice.overdue
//                     (days-overdue), condition on {{trigger.invoice.*}}
//   transaction rules → trigger on transaction.created, condition on {{trigger.transaction.*}}
//   every action (flag/notify/tag/escalate) → an in-app alert node (the safe universal action;
//     WhatsApp/email need extra config and can be swapped in the Flow later).

const FIELD_PATH = {
  invoice: { amount: "total_amount", status: "status", counterparty: "customer_name", daysOverdue: "days_overdue" },
  transaction: { amount: "amount", category: "category", counterparty: "counterparty", description: "description" },
};
const VALID_OPS = ["==", "!=", ">", "<", ">=", "<=", "contains"];

function ruleToFlow(rule = {}) {
  const subject = rule.subject === "invoice" ? "invoice" : "transaction";
  const field = rule.field || (subject === "invoice" ? "status" : "amount");
  const op = VALID_OPS.includes(rule.op) ? rule.op : "==";
  const value = rule.value == null ? "" : String(rule.value);
  const path = (FIELD_PATH[subject] && FIELD_PATH[subject][field]) || field;

  const event = subject === "invoice"
    ? ((field === "daysOverdue" || (field === "status" && /overdue/i.test(value))) ? "invoice.overdue" : "invoice.created")
    : "transaction.created";

  const left = `{{trigger.${subject}.${path}}}`;
  const severity = rule.action === "escalate" ? "high" : rule.action === "flag" ? "medium" : "low";
  const ctxLine = subject === "invoice"
    ? "{{trigger.invoice.customer_name}} · ₹{{trigger.invoice.total_amount}}"
    : "{{trigger.transaction.description}} · ₹{{trigger.transaction.amount}}";

  return {
    name: `Auto: ${rule.name || `${subject} rule`}`,
    enabled: rule.enabled !== false,
    trigger: { type: "event", config: { event } },
    graph: {
      nodes: [
        { id: "cond", type: "branch", config: { left, op, right: value } },
        { id: "act", type: "notify", config: { title: `Rule: ${rule.name || subject}`, severity, message: `Matched "${rule.name || subject}" (${field} ${op} ${value}): ${ctxLine}` } },
      ],
      edges: [{ from: "cond", to: "act", branch: "true" }],
    },
    source_rule: rule.id || null,
  };
}

module.exports = { ruleToFlow, FIELD_PATH, VALID_OPS };
