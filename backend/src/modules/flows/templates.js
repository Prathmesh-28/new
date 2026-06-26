// Headroom Flows — starter templates. Real, working flow definitions an SMB owner can
// install in one click. Node configs reference verified payload/tool fields:
//   • invoice.* event payload carries trigger.invoice.{invoice_number,customer_name,
//     customer_email,total_amount,...} (the full invoice row).
//   • get_business_snapshot returns {cash:{total},monthlyBurn,runwayDays,receivables:{...}}.

const FLOW_TEMPLATES = [
  {
    id: "overdue-alert",
    name: "Overdue invoice → alert",
    description: "When an invoice goes overdue, raise an in-app alert. Works out of the box.",
    trigger: { type: "event", config: { event: "invoice.overdue" } },
    graph: {
      nodes: [{ id: "alert", type: "notify", config: { title: "Invoice overdue", severity: "high", message: "Invoice {{trigger.invoice.invoice_number}} for {{trigger.invoice.customer_name}} (₹{{trigger.invoice.total_amount}}) is overdue — chase the payment." } }],
      edges: [],
    },
  },
  {
    id: "overdue-whatsapp",
    name: "Overdue invoice → WhatsApp reminder",
    description: "WhatsApp a polite reminder when an invoice is overdue. Set the recipient number, and connect Twilio to deliver.",
    trigger: { type: "event", config: { event: "invoice.overdue" } },
    graph: {
      nodes: [{ id: "wa", type: "whatsapp", config: { to: "", message: "Hi {{trigger.invoice.customer_name}}, a gentle reminder that invoice {{trigger.invoice.invoice_number}} for ₹{{trigger.invoice.total_amount}} is overdue. Could you arrange the payment? Thank you!" } }],
      edges: [],
    },
  },
  {
    id: "paid-thanks",
    name: "Invoice paid → thank-you email",
    description: "Email the customer a thank-you when their invoice is paid. Connect SMTP to deliver.",
    trigger: { type: "event", config: { event: "invoice.paid" } },
    graph: {
      nodes: [{ id: "mail", type: "email", config: { to: "{{trigger.invoice.customer_email}}", subject: "Thanks — payment received for {{trigger.invoice.invoice_number}}", body: "Hi {{trigger.invoice.customer_name}},<br><br>We've received your payment for invoice <b>{{trigger.invoice.invoice_number}}</b> (₹{{trigger.invoice.total_amount}}). Thank you!<br><br>— {{trigger.invoice.customer_name}}'s team at Headroom" } }],
      edges: [],
    },
  },
  {
    id: "new-invoice-alert",
    name: "New invoice → team alert",
    description: "Raise an alert whenever a new invoice is created.",
    trigger: { type: "event", config: { event: "invoice.created" } },
    graph: {
      nodes: [{ id: "alert", type: "notify", config: { title: "New invoice", severity: "low", message: "Invoice {{trigger.invoice.invoice_number}} created for {{trigger.invoice.customer_name}} — ₹{{trigger.invoice.total_amount}}." } }],
      edges: [],
    },
  },
  {
    id: "financing-ready",
    name: "Financing-ready watch",
    description: "Daily: run underwriting and alert you the moment the business is pre-qualified for credit.",
    trigger: { type: "schedule", config: { frequency: "daily", hour: 4 } },
    graph: {
      nodes: [
        { id: "uw", type: "underwrite", config: {} },
        { id: "chk", type: "branch", config: { left: "{{nodes.uw.decision}}", op: "==", right: "pre_qualified" } },
        { id: "alert", type: "notify", config: { title: "You're financing-ready", severity: "low", message: "Pre-qualified for ₹{{nodes.uw.eligible_amount}} (grade {{nodes.uw.grade}}). Review loan options on the Credit page." } },
      ],
      edges: [{ from: "uw", to: "chk" }, { from: "chk", to: "alert", branch: "true" }],
    },
  },
  {
    id: "runway-watch",
    name: "Daily runway watch",
    description: "Every morning, check cash runway and raise an alert if it drops below 30 days.",
    trigger: { type: "schedule", config: { frequency: "daily", hour: 3 } }, // 03:00 UTC ≈ 08:30 IST
    graph: {
      nodes: [
        { id: "snap", type: "tool", config: { tool: "get_business_snapshot", args: {} } },
        { id: "check", type: "branch", config: { left: "{{nodes.snap.runwayDays}}", op: "<", right: "30" } },
        { id: "alert", type: "notify", config: { title: "Cash runway is low", severity: "high", message: "Runway is {{nodes.snap.runwayDays}} days (cash ₹{{nodes.snap.cash.total}}, burn ₹{{nodes.snap.monthlyBurn}}/mo). Below the 30-day threshold." } },
      ],
      edges: [{ from: "snap", to: "check" }, { from: "check", to: "alert", branch: "true" }],
    },
  },
];

module.exports = { FLOW_TEMPLATES };
