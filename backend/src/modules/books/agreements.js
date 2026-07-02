"use strict";
// Agreement obligation extraction (roadmap #182). Reads pasted agreement text and pulls out the
// obligations that matter — lock-ins, renewals, escalations, notice periods, payments, penalties,
// termination — each with any date/amount/term found. A deterministic keyword+date RULE extractor
// always runs (works with no LLM); a connected tenant LLM refines it into cleaner structured
// obligations, falling back to the rule result on any error/no-key.
const { PostError } = require("./posting-engine");

const KEYWORDS = [
  [/lock[\s-]?in/i, "lock_in"],
  [/renew(al)?|auto[\s-]?renew/i, "renewal"],
  [/escalat|\bhike\b|increase in (the )?rent|annual increase/i, "escalation"],
  [/notice period|days.{0,12}notice|notice of \d+/i, "notice"],
  [/penalt|late fee|liquidated damages|interest on delay/i, "penalty"],
  [/terminat/i, "termination"],
  [/\b(pay|payment|rent|fee|deposit|due|instal?ment)\b/i, "payment"],
];

function ruleExtract(text) {
  const out = [];
  const seen = new Set();
  const sentences = String(text).split(/(?<=[.\n;])\s+/);
  for (const s of sentences) {
    const clean = s.trim().replace(/\s+/g, " ");
    if (clean.length < 8) continue;
    for (const [re, type] of KEYWORDS) {
      if (re.test(clean)) {
        const date = (clean.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4})\b/) || [])[0] || null;
        const amtM = clean.match(/(?:rs\.?|₹|inr)\s*([\d,]+)/i);
        const termM = clean.match(/(\d+)\s*(month|year|day)s?/i);
        const key = type + "|" + clean.slice(0, 40);
        if (seen.has(key)) break;
        seen.add(key);
        out.push({ type, description: clean.slice(0, 240), date, amount: amtM ? Number(amtM[1].replace(/,/g, "")) : null, term: termM ? `${termM[1]} ${termM[2]}${Number(termM[1]) > 1 ? "s" : ""}` : null });
        break; // one obligation per sentence
      }
    }
  }
  return out;
}

async function extractObligations(tenantId, text, { useLlm = true } = {}) {
  if (!text || String(text).trim().length < 10) throw new PostError("BAD_INPUT", "Paste the agreement text (at least a sentence)", 400);
  const rule = ruleExtract(text);
  if (!useLlm) return { obligations: rule, source: "rule" };
  try {
    const { chat } = require("./llm");
    const res = await chat(tenantId, {
      system: 'Extract the key obligations from this contract/agreement. Reply with ONLY a compact JSON array: [{"type":"renewal|lock_in|escalation|notice|payment|penalty|termination|other","description":string,"date":string|null,"amount":number|null,"term":string|null}]. No prose.',
      messages: [{ role: "user", content: String(text).slice(0, 8000) }],
    });
    const m = (res.content || "").match(/\[[\s\S]*\]/);
    if (m) { const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return { obligations: arr, source: "llm" }; }
  } catch { /* no LLM key or bad output → deterministic fallback */ }
  return { obligations: rule, source: "rule" };
}

module.exports = { ruleExtract, extractObligations };
