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

// ── Persistence + obligations calendar (roadmap #182: repository, not just extraction) ──
const { pool } = require("../../db");
const addDaysIso = (dateStr, days) => { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

// Save an agreement + its obligations. Runs extraction on the pasted text (if any), then
// SYNTHESISES the two obligations every agreement implies from its structured fields: the notice
// deadline (renewal/expiry minus the notice period) and the renewal/expiry date itself.
async function saveAgreement(tenantId, actorId, body = {}) {
  if (!body.title) throw new PostError("BAD_INPUT", "title required", 400);
  const { rows: ar } = await pool.query(
    `INSERT INTO book_agreements(tenant_id, title, counterparty, kind, start_date, end_date, renewal_date, auto_renew, notice_days, value_amount, body_text, scan_file_id, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, body.title, body.counterparty || null, body.kind || null, body.start_date || null, body.end_date || null, body.renewal_date || null,
     !!body.auto_renew, Number(body.notice_days) || 0, body.value_amount != null ? Number(body.value_amount) : null, body.body_text || null, body.scan_file_id || null, actorId || null]);
  const ag = ar[0];

  const obligations = [];
  if (body.body_text) { const ex = await extractObligations(tenantId, body.body_text); obligations.push(...ex.obligations); }
  // Synthesise the structural obligations (calendar backbone).
  const anchor = ag.renewal_date || ag.end_date;
  if (anchor) {
    obligations.push({ type: ag.auto_renew ? "renewal" : "termination", description: ag.auto_renew ? "Auto-renewal date — decide to continue or exit" : "Agreement end / renewal date", date: anchor, amount: null, term: null });
    if (Number(ag.notice_days) > 0) obligations.push({ type: "notice", description: `Notice deadline (${ag.notice_days} days before ${anchor})`, date: addDaysIso(anchor, -Number(ag.notice_days)), amount: null, term: null });
  }
  for (const o of obligations) {
    await pool.query(
      `INSERT INTO book_agreement_obligations(agreement_id, tenant_id, type, description, due_date, amount, term)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [ag.id, tenantId, o.type || "other", (o.description || "").slice(0, 500), o.date || o.due_date || null, o.amount != null ? Number(o.amount) : null, o.term || null]);
  }
  return getAgreement(tenantId, ag.id);
}

async function listAgreements(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_agreements WHERE ${where} ORDER BY renewal_date NULLS LAST, created_at DESC`, params);
  return rows.map((a) => ({ ...a, value_amount: a.value_amount == null ? null : Number(a.value_amount) }));
}
async function getAgreement(tenantId, id) {
  const { rows } = await pool.query("SELECT * FROM book_agreements WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Agreement not found", 404);
  const { rows: obs } = await pool.query("SELECT * FROM book_agreement_obligations WHERE agreement_id=$1 ORDER BY due_date NULLS LAST", [id]);
  return { ...rows[0], value_amount: rows[0].value_amount == null ? null : Number(rows[0].value_amount), obligations: obs.map((o) => ({ ...o, amount: o.amount == null ? null : Number(o.amount) })) };
}
async function setObligationStatus(tenantId, obligationId, status) {
  if (!["open", "done", "waived"].includes(status)) throw new PostError("BAD_INPUT", "bad status", 400);
  const { rows } = await pool.query("UPDATE book_agreement_obligations SET status=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *", [tenantId, obligationId, status]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Obligation not found", 404);
  return rows[0];
}
async function removeAgreement(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_agreements WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new PostError("NOT_FOUND", "Agreement not found", 404);
  return { removed: true };
}

// All dated obligations across agreements, with days-to-due + due/overdue state — the calendar.
async function obligationsCalendar(tenantId, { withinDays } = {}) {
  const params = [tenantId]; let dateClause = "";
  if (withinDays != null) { params.push(Math.max(0, Math.round(withinDays))); dateClause = ` AND o.due_date <= (CURRENT_DATE + ($2||' days')::interval)`; }
  const { rows } = await pool.query(
    `SELECT o.*, a.title, a.counterparty FROM book_agreement_obligations o
       JOIN book_agreements a ON a.id=o.agreement_id AND a.tenant_id=o.tenant_id
      WHERE o.tenant_id=$1 AND o.status='open' AND o.due_date IS NOT NULL${dateClause}
      ORDER BY o.due_date`, params);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return rows.map((o) => {
    const due = new Date(o.due_date); due.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);
    return { ...o, amount: o.amount == null ? null : Number(o.amount), days_to_due: days, state: days < 0 ? "overdue" : days <= 14 ? "due_soon" : "upcoming" };
  });
}

module.exports = { ruleExtract, extractObligations, saveAgreement, listAgreements, getAgreement, setObligationStatus, removeAgreement, obligationsCalendar };
