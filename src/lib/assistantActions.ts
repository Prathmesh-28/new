// Turns a free-text request into a concrete in-app ACTION the assistant can offer
// as a one-tap button — navigate to the right screen, pre-filling where we can
// parse it (e.g. "create an invoice for ₹50,000 to Mehta Traders"). Deterministic
// (works even when AI is off); the AI can also emit a [[go:/route|Label]] directive
// which the assistant prefers over this when present.

export interface AssistantAction { label: string; route: string }

function parseAmount(t: string): string | null {
  const m = t.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|lakhs|cr|crore|crores)?|\b([\d,]{3,}(?:\.\d+)?)\s*(k|lakh|lac|lakhs|cr|crore|crores)?\b/i);
  if (!m) return null;
  let n = parseFloat((m[1] ?? m[3] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? m[4] ?? "").toLowerCase();
  if (unit === "k") n *= 1e3; else if (/lakh|lac/.test(unit)) n *= 1e5; else if (/cr/.test(unit)) n *= 1e7;
  return String(Math.round(n));
}

function parseParty(t: string): string | null {
  // "...to Mehta Traders", "...for Reddy Industries" — capture a Capitalised name.
  const m = t.match(/\b(?:to|for|from|of)\s+([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,4})/);
  if (!m) return null;
  return m[1].replace(/\s+(for|worth|amount|rs|inr|₹|of|with|gst).*$/i, "").trim() || null;
}

interface Intent { re: RegExp; label: string; route: string | ((t: string) => string) }

const INTENTS: Intent[] = [
  { re: /\b(create|raise|make|new|generate|draft)\b.*\binvoice\b|\binvoice\b.*\b(to|for)\b/i, label: "Create invoice",
    route: t => { const q = new URLSearchParams({ compose: "1" }); const c = parseParty(t); const a = parseAmount(t); if (c) q.set("customer", c); if (a) q.set("amount", a); return "/invoices?" + q.toString(); } },
  { re: /\b(add|create|new|onboard)\b.*\b(customer|client|buyer|party|debtor)\b/i, label: "Add a customer", route: "/books" },
  { re: /\b(add|create|new)\b.*\b(vendor|supplier|creditor)\b/i, label: "Add a vendor", route: "/vendors" },
  { re: /\b(add|create|new)\b.*\b(product|item|sku|stock|inventory)\b/i, label: "Add a product", route: "/books" },
  { re: /\b(payment link|collect (a )?payment|upi (link|qr)|get paid)\b/i, label: "Payments", route: "/payments" },
  { re: /\b(run|process|do|generate)\b.*\bpayroll\b|\bpay (the )?salar/i, label: "Run payroll", route: "/payroll" },
  { re: /\bfile\b.*\b(gst|gstr|3b|gstr-?1|2b|return)\b|\bgstr-?(1|3b|9)\b/i, label: "Open GST", route: "/gst" },
  { re: /\b(who owes|overdue|chase|follow.?up|outstanding)\b|\bcollections?\b|\bdunning\b/i, label: "Open Collections", route: "/collections" },
  { re: /\b(import|bulk upload|migrate|switch from tally|upload (a )?csv)\b/i, label: "Import data", route: "/data" },
  { re: /\b(add|connect|link)\b.*\bbank\b|\bbank (account|balance)\b/i, label: "Banking", route: "/banking" },
  { re: /\b(forecast|runway|cash.?flow projection|will i run out)\b/i, label: "Open Forecast", route: "/forecast" },
  { re: /\b(record|add|log|enter)\b.*\b(expense|transaction|spend|payment received)\b/i, label: "Transactions", route: "/transactions" },
  { re: /\b(file|compute|calculate)\b.*\b(tds|tcs|income tax|itr|advance tax)\b/i, label: "Tax filing", route: "/books" },
  { re: /\b(invite|add)\b.*\b(team|user|teammate|accountant|staff|member)\b/i, label: "Manage team", route: "/settings" },
  { re: /\b(add|link)\b.*\bclient\b|\bca portal|advisor\b/i, label: "CA / Advisor portal", route: "/advisor" },
];

export function detectAction(text: string): AssistantAction | null {
  for (const it of INTENTS) {
    if (it.re.test(text)) {
      const route = typeof it.route === "function" ? it.route(text) : it.route;
      return { label: it.label, route };
    }
  }
  return null;
}

// Parse an AI-emitted directive  [[go:/route|Label]]  and return {action, cleaned text}.
const GO_RE = /\[\[go:(\/[^\]|]+)(?:\|([^\]]+))?\]\]/i;
export function parseAiDirective(content: string): { action: AssistantAction | null; text: string } {
  const m = content.match(GO_RE);
  if (!m) return { action: null, text: content };
  return { action: { label: (m[2] || "Take me there").trim(), route: m[1].trim() }, text: content.replace(GO_RE, "").trim() };
}
