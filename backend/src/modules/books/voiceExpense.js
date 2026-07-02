"use strict";
// Voice / natural-language expense capture (roadmap #172). Turns a spoken/typed note like
// "aaj 5000 ka diesel" into a structured expense draft {amount, description, category, vendor}.
// A deterministic RULE parser (Hindi + English amounts, keyword categories) always runs, so the
// feature works with no LLM configured; when a tenant LLM is connected we let it refine the parse.
// (Speech-to-text itself is gated on an STT provider — the caller passes the transcript.)
const { PostError } = require("./posting-engine");

const CATEGORY_RULES = [
  [/\b(diesel|petrol|fuel|gas|cng)\b/, "Fuel"],
  [/\b(salary|salaries|wages|payroll|staff pay)\b/, "Salaries"],
  [/\b(rent|lease|kiraya)\b/, "Rent"],
  [/\b(chai|tea|coffee|lunch|dinner|food|snack|meal|khana)\b/, "Meals & Entertainment"],
  [/\b(electricity|power|water|internet|phone|mobile|recharge|bijli)\b/, "Utilities"],
  [/\b(transport|taxi|cab|uber|ola|auto|travel|freight|courier)\b/, "Travel & Transport"],
  [/\b(repair|maintenance|service|amc)\b/, "Repairs & Maintenance"],
  [/\b(stationery|printing|office|xerox)\b/, "Office Expenses"],
  [/\b(commission|brokerage)\b/, "Commission"],
  [/\b(gst|tax|challan)\b/, "Taxes"],
];

// Deterministic parse — no LLM required.
function ruleParse(text) {
  const raw = String(text || "").trim();
  const t = raw.toLowerCase();
  let amount = null;
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(lakhs?|lac|lakh)\b/);
  const k = t.match(/(\d+(?:\.\d+)?)\s*(k|hazaar|hazar|thousand)\b/);
  const hundred = t.match(/(\d+(?:\.\d+)?)\s*(hundred|sau)\b/);
  const plain = t.match(/(?:rs\.?|₹|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?/);
  if (lakh) amount = parseFloat(lakh[1]) * 100000;
  else if (k) amount = parseFloat(k[1]) * 1000;
  else if (hundred) amount = parseFloat(hundred[1]) * 100;
  else if (plain) amount = parseFloat(plain[1].replace(/,/g, ""));

  let category = "General Expense";
  for (const [re, c] of CATEGORY_RULES) if (re.test(t)) { category = c; break; }

  // Description: strip currency/amount tokens + common Hindi/English filler.
  const description = raw
    .replace(/(?:rs\.?|₹|inr)/gi, " ")
    .replace(/\d[\d,]*(?:\.\d+)?\s*(lakhs?|lac|lakh|k|hazaar|hazar|thousand|hundred|sau)?/gi, " ")
    .replace(/\b(aaj|today|kal|ka|ki|ke|for|paid|spent|pay|kharch|kharcha|diya|hua|of|the|on|to)\b/gi, " ")
    .replace(/\s+/g, " ").trim() || category;

  return { amount, description, category, vendor: null, source: "rule" };
}

// Parse an expense note. Runs the rule parser, then (if a tenant LLM is configured) lets the LLM
// refine it; on any LLM error / no key, returns the deterministic rule parse.
async function parseExpenseText(tenantId, text, { useLlm = true } = {}) {
  if (!text || !String(text).trim()) throw new PostError("BAD_INPUT", "text required", 400);
  const rule = ruleParse(text);
  if (!useLlm) return rule;
  try {
    const { chat } = require("./llm");
    const res = await chat(tenantId, {
      system: 'Extract a business expense from the user\'s short note (may be Hindi/Hinglish; hazaar=1000, lakh=100000). Reply with ONLY compact JSON: {"amount": number|null, "description": string, "category": string, "vendor": string|null}. No prose.',
      messages: [{ role: "user", content: String(text) }],
    });
    const m = (res.content || "").match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      return {
        amount: typeof j.amount === "number" ? j.amount : rule.amount,
        description: j.description || rule.description,
        category: j.category || rule.category,
        vendor: j.vendor || null,
        source: "llm",
      };
    }
  } catch { /* no LLM key or bad output → deterministic fallback */ }
  return rule;
}

module.exports = { ruleParse, parseExpenseText };
