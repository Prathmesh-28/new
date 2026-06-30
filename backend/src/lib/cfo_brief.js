// Weekly Monday CFO brief - AI-generated 3 actionable items from live tenant data.
// Runs on the tenant's own engine (OpenRouter / self-host gateway) - no direct Anthropic.
const llm = require("../modules/books/llm");

function fmt(n) {
  if (!n || isNaN(n)) return "₹0";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function monthlyBurn(transactions = []) {
  const now    = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split("T")[0];
  const exp    = transactions.filter(t => t.amount < 0 && t.date >= cutoff);
  return exp.length ? Math.abs(exp.reduce((s, t) => s + t.amount, 0)) / 3 : 0;
}

function runwayDays(bankAccounts, burn) {
  const total = bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  return burn > 0 ? Math.floor((total / burn) * 30) : 999;
}

async function generateCFOBrief(data, tenantId) {
  const bankAccounts = data.bankAccounts ?? [];
  const transactions = data.transactions ?? [];
  const invoices     = data.invoices     ?? [];
  const alerts       = data.alerts       ?? [];
  const activeLoans  = data.activeLoans  ?? [];
  const obligations  = data.obligations  ?? [];

  const totalCash = bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const burn      = monthlyBurn(transactions);
  const runway    = runwayDays(bankAccounts, burn);

  const today   = new Date().toISOString().split("T")[0];
  const in7d    = new Date(Date.now() +  7 * 86400000).toISOString().split("T")[0];
  const in30d   = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  // Overdue invoices
  const overdue = invoices
    .filter(i => i.status !== "paid" && i.dueDate < today)
    .map(i => {
      const days = Math.ceil((Date.now() - new Date(i.dueDate).getTime()) / 86400000);
      return `${i.customer}: ${fmt(i.amount)} (${days}d overdue)`;
    });

  // Due this week
  const dueSoon = invoices
    .filter(i => i.status !== "paid" && i.dueDate >= today && i.dueDate <= in7d)
    .map(i => `${i.customer}: ${fmt(i.amount)} due ${i.dueDate}`);

  // Upcoming cash obligations
  const upcomingObl = obligations
    .filter(o => o.dueDate >= today && o.dueDate <= in30d)
    .map(o => `${o.name} ${fmt(o.amount)} due ${o.dueDate}`);

  // Loan payments due
  const loanPayments = activeLoans
    .filter(l => l.nextPaymentDate && l.nextPaymentDate >= today && l.nextPaymentDate <= in30d)
    .map(l => `${l.lender} EMI ${fmt(l.monthlyEmi ?? 0)} due ${l.nextPaymentDate}`);

  // Critical alerts
  const critAlerts = alerts
    .filter(a => !a.isRead && (a.severity === "critical" || a.severity === "high"))
    .slice(0, 3)
    .map(a => a.title);

  // Burn trend
  const now  = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastM = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, "0")}`;
  const thisBurn = Math.abs(transactions.filter(t => t.amount < 0 && t.date.startsWith(thisM)).reduce((s, t) => s + t.amount, 0));
  const lastBurn = Math.abs(transactions.filter(t => t.amount < 0 && t.date.startsWith(lastM)).reduce((s, t) => s + t.amount, 0));
  const burnChangePct = lastBurn > 0 ? Math.round(((thisBurn - lastBurn) / lastBurn) * 100) : 0;

  // Rule-based fallback items (used when no API key)
  const ruleItems = [];
  if (overdue.length) {
    const biggest = invoices.filter(i => i.status !== "paid" && i.dueDate < today).sort((a, b) => b.amount - a.amount)[0];
    ruleItems.push(`Chase ${biggest?.customer ?? "overdue customers"} - ${fmt(biggest?.amount)} invoice is overdue. Send a payment reminder today.`);
  }
  if (runway < 60) {
    ruleItems.push(`Cash runway is ${runway} days - review your largest expense categories and consider whether any can be deferred or renegotiated.`);
  }
  if (burnChangePct > 20) {
    ruleItems.push(`Monthly burn is up ${burnChangePct}% vs last month - identify which category drove the increase and assess if it's one-time or recurring.`);
  }
  if (upcomingObl.length) {
    const o = obligations.filter(ob => ob.dueDate >= today && ob.dueDate <= in30d).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
    if (o) ruleItems.push(`${o.name} of ${fmt(o.amount)} is due ${o.dueDate} - ensure this is accounted for in your cash plan.`);
  }
  if (dueSoon.length) {
    const d = invoices.filter(i => i.status !== "paid" && i.dueDate >= today && i.dueDate <= in7d)[0];
    if (d) ruleItems.push(`Confirm ${d.customer} will pay ${fmt(d.amount)} by ${d.dueDate} - follow up if you haven't heard from them.`);
  }
  while (ruleItems.length < 3) {
    ruleItems.push("Review your week-on-week transaction patterns to identify any unusual spend categories.");
  }

  if (!tenantId) return ruleItems.slice(0, 3);

  const context = `
Today: ${today} | Cash: ${fmt(totalCash)} | Burn: ${fmt(burn)}/mo${burnChangePct !== 0 ? ` (${burnChangePct > 0 ? "+" : ""}${burnChangePct}% vs last month)` : ""} | Runway: ${runway} days

Overdue receivables (${overdue.length}): ${overdue.length ? overdue.join("; ") : "none"}
Due this week: ${dueSoon.length ? dueSoon.join("; ") : "none"}
Upcoming obligations (30d): ${upcomingObl.length ? upcomingObl.join("; ") : "none"}
Loan payments due: ${loanPayments.length ? loanPayments.join("; ") : "none"}
Critical/high alerts: ${critAlerts.length ? critAlerts.join("; ") : "none"}
  `.trim();

  try {
    const out = await llm.chat(tenantId, {
      system:   `You are a CFO assistant for an Indian SMB. Generate exactly 3 specific, actionable items for this week. Rules: (1) Each item is exactly 1 sentence. (2) Mention specific customer names, amounts in Indian format (₹ with L/Cr), and exact dates from the data. (3) Start each with a clear action verb (Chase, Defer, Review, Confirm, Transfer, File, Negotiate). (4) Only recommend actions supported by the data - do not invent. Return a raw JSON array of 3 strings with no markdown or explanation.`,
      messages: [{ role: "user", content: context }],
    });
    const raw   = out?.content ?? "[]";
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      const items = JSON.parse(match[0]);
      if (Array.isArray(items) && items.length >= 3) return items.slice(0, 3);
    }
  } catch (err) {
    console.error("[cfo_brief] AI error:", err.message);
  }

  return ruleItems.slice(0, 3);
}

module.exports = { generateCFOBrief };
