"use strict";
// Books Health Score (#52) — a single 0-100 read on bookkeeping quality, rolled up from real
// signals (no external data): bank reconciliation coverage, ledger integrity (duplicates/
// assertion failures), party-master completeness (GSTIN), compliance overdue, and receivables
// aging. Every factor links to a concrete fix. Read-only.
const { pool } = require("../../db");
const reports = require("./reports");
const integrity = require("./integrity");

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

async function booksHealth(tenantId) {
  const factors = [];

  // 1. Bank reconciliation coverage.
  const { rows: bl } = await pool.query(
    "SELECT status, COUNT(*)::int n FROM book_bank_lines WHERE tenant_id=$1 GROUP BY status", [tenantId]
  ).catch(() => ({ rows: [] }));
  const totalLines = bl.reduce((s, r) => s + r.n, 0);
  const doneLines = bl.filter((r) => ["MATCHED", "POSTED", "IGNORED"].includes(r.status)).reduce((s, r) => s + r.n, 0);
  factors.push({ key: "recon", label: "Bank reconciliation", score: totalLines > 0 ? clamp((doneLines / totalLines) * 100) : 100, weight: 0.25, detail: totalLines > 0 ? `${totalLines - doneLines} of ${totalLines} imported bank lines unreconciled` : "No imported bank lines" });

  // 2. Ledger integrity (duplicates + failed balance assertions + non-leaf postings).
  let integ = { duplicates: [], nonLeaf: [], assertions: [] };
  try { integ = await integrity.runChecks(tenantId); } catch { /* best-effort */ }
  const issues = (integ.duplicates?.length || 0) + (integ.assertions?.length || 0) + (integ.nonLeaf?.length || 0);
  factors.push({ key: "integrity", label: "Ledger integrity", score: clamp(100 - issues * 10), weight: 0.20, detail: issues ? `${issues} issue(s) — duplicates / assertion failures / non-leaf postings` : "No integrity issues" });

  // 3. Party master completeness (GSTIN on party ledgers — drives ITC & 43B correctness).
  const { rows: pd } = await pool.query(
    "SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE NULLIF(TRIM(gstin),'') IS NOT NULL)::int withg FROM book_ledgers WHERE tenant_id=$1 AND is_party=true", [tenantId]
  ).catch(() => ({ rows: [{ total: 0, withg: 0 }] }));
  const pdt = pd[0] || { total: 0, withg: 0 };
  factors.push({ key: "party_data", label: "Party master completeness", score: pdt.total > 0 ? clamp((pdt.withg / pdt.total) * 100) : 100, weight: 0.15, detail: pdt.total > 0 ? `${pdt.total - pdt.withg} of ${pdt.total} parties missing a GSTIN` : "No party ledgers" });

  // 4. Compliance filings overdue.
  const { rows: co } = await pool.query(
    "SELECT COUNT(*)::int overdue FROM book_compliance_items WHERE tenant_id=$1 AND status='pending' AND due_date < CURRENT_DATE", [tenantId]
  ).catch(() => ({ rows: [{ overdue: 0 }] }));
  const overdueC = co[0].overdue;
  factors.push({ key: "compliance", label: "Compliance filings", score: clamp(100 - overdueC * 15), weight: 0.20, detail: overdueC ? `${overdueC} overdue filing(s)` : "Up to date" });

  // 5. Receivables aging (share over 90 days).
  let recvScore = 100, recvDetail = "No receivables";
  try {
    const ar = await reports.arAging(tenantId);
    const t = Number(ar.totals.total) || 0, od = Number(ar.totals.d90plus) || 0;
    if (t > 0) { recvScore = clamp(100 - (od / t) * 100); recvDetail = `${Math.round((od / t) * 100)}% of receivables over 90 days`; }
  } catch { /* best-effort */ }
  factors.push({ key: "receivables", label: "Receivables health", score: recvScore, weight: 0.20, detail: recvDetail });

  const wsum = factors.reduce((s, f) => s + f.weight, 0);
  const score = clamp(factors.reduce((s, f) => s + f.score * f.weight, 0) / wsum);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
  const topActions = factors.filter((f) => f.score < 70).sort((a, b) => a.score - b.score).map((f) => ({ area: f.label, detail: f.detail }));
  return { score, grade, factors, top_actions: topActions, note: "Bookkeeping-quality score from reconciliation, integrity, master-data, compliance and receivables — all from your own books." };
}

module.exports = { booksHealth };
