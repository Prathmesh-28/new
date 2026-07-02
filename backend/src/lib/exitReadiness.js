"use strict";
// Exit / diligence readiness score (roadmap #199). Synthesises signals already in the platform
// — books hygiene, statutory compliance, receivables quality, documentation — into a single
// 0-100 lender/investor-facing readiness score with a per-dimension breakdown and an actionable
// gap list ("what to fix to raise the score"). Pure aggregation over non-RLS tables (book_*,
// invoices, gst_returns, tenant_profile); no external dependencies.
const { pool } = require("../db");

const round = (x) => Math.round(x);
const clamp = (x) => Math.max(0, Math.min(100, x));
const gradeOf = (s) => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "E");

async function scalar(db, sql, params, def = 0) {
  try { const { rows } = await db.query(sql, params); return Number(Object.values(rows[0] || {})[0] ?? def); }
  catch { return def; }
}

// A dimension is a weighted group of pass/fail checks; each check carries a `fix` for the gap list.
function dimension(name, weight, checks) {
  const passed = checks.filter((c) => c.ok).length;
  const score = checks.length ? round((100 * passed) / checks.length) : 100;
  return { name, weight, score, checks };
}

async function exitReadiness(tenantId, db = pool) {
  const [vTotal, vRecent, auditN, taxN, tdsN, gstN, invTotal, invOverdue, attachN, assetN, gstReg] = await Promise.all([
    scalar(db, "SELECT count(*) FROM book_vouchers WHERE tenant_id=$1 AND is_cancelled=false", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_vouchers WHERE tenant_id=$1 AND is_cancelled=false AND voucher_date >= (CURRENT_DATE - 90)", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_audit_log WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_tax_entries WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_tax_entries WHERE tenant_id=$1 AND tax_kind='TDS'", [tenantId]),
    scalar(db, "SELECT count(*) FROM gst_returns WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE tenant_id=$1 AND status <> 'cancelled'", [tenantId]),
    scalar(db, "SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_attachments WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM book_fixed_assets WHERE tenant_id=$1", [tenantId]),
    scalar(db, "SELECT count(*) FROM tenant_profile WHERE tenant_id=$1 AND COALESCE(gstin,'') <> ''", [tenantId]),
  ]);
  const gstRegistered = gstReg > 0;
  const overdueRatio = invTotal > 0 ? invOverdue / invTotal : 0;

  const booksChecks = [
    { ok: vTotal > 0, label: "General ledger has posted transactions", fix: "Post your sales, purchases and payments so the books reflect real activity." },
    { ok: vRecent > 0, label: "Bookkeeping is current (activity in the last 90 days)", fix: "Bring the books up to date — reviewers expect recent, live records." },
    { ok: auditN > 0, label: "Tamper-proof audit trail active (MCA Rule 3(1))", fix: "The hash-chained edit log builds as you post vouchers; keep corrections as reversals." },
  ];
  const complianceChecks = [
    { ok: taxN > 0, label: "Tax captured on transactions (GST / TDS)", fix: "Record GST on invoices/bills and TDS on vendor payments so returns reconcile." },
    { ok: tdsN > 0, label: "TDS on vendor payments is being deducted", fix: "Deduct and book TDS (194C/194J/194Q…) where applicable." },
    ...(gstRegistered ? [{ ok: gstN > 0, label: "GST returns prepared / on file", fix: "Prepare GSTR-1/3B from the books each period." }] : []),
  ];
  const recvChecks = [
    { ok: invTotal === 0 || overdueRatio <= 0.2, label: invTotal > 0 ? `Overdue receivables are ${round(overdueRatio * 100)}% of billings` : "No receivables history yet", fix: `Chase overdue receivables — ${round(overdueRatio * 100)}% of billings are past due.` },
  ];
  const docChecks = [
    { ok: attachN > 0, label: "Supporting documents attached to records", fix: "Attach invoices, agreements and receipts to their vouchers for a diligence data-room." },
    { ok: assetN > 0, label: "Fixed-asset register maintained", fix: "Register capitalised assets so the balance sheet and depreciation are auditable." },
  ];

  const books = dimension("Books hygiene", 0.30, booksChecks);
  const compliance = dimension("Compliance", 0.25, complianceChecks);
  // Receivables scored on the overdue ratio (not just pass/fail) so it moves smoothly.
  const receivables = { name: "Receivables quality", weight: 0.20, score: round(invTotal > 0 ? clamp(100 - overdueRatio * 150) : 60), checks: recvChecks };
  const documentation = dimension("Documentation", 0.25, docChecks);

  const dims = [books, compliance, receivables, documentation];
  const overall = round(dims.reduce((s, d) => s + d.score * d.weight, 0) / dims.reduce((s, d) => s + d.weight, 0));

  const gaps = [];
  const pushGaps = (name, checks) => checks.forEach((c) => { if (!c.ok) gaps.push({ dimension: name, fix: c.fix }); });
  pushGaps("Books hygiene", booksChecks);
  pushGaps("Compliance", complianceChecks);
  pushGaps("Receivables quality", recvChecks);
  pushGaps("Documentation", docChecks);

  return {
    score: overall, grade: gradeOf(overall),
    dimensions: dims.map((d) => ({ name: d.name, weight: d.weight, score: d.score, checks: d.checks.map((c) => ({ label: c.label, ok: c.ok })) })),
    gaps,
    summary: `${gradeOf(overall)} · ${overall}/100 — ${overall >= 80 ? "diligence-ready" : overall >= 65 ? "largely ready, minor gaps" : overall >= 50 ? "some gaps to close" : "not yet diligence-ready"}.`,
    note: "Readiness across books hygiene, compliance, receivables quality and documentation, computed from your own records. Closing the flagged gaps raises the score.",
  };
}

module.exports = { exitReadiness, gradeOf };
