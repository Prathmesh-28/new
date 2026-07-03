"use strict";
// Insurance policy vault (#151) + claims tracker (#157) + the headline: sum-insured ADEQUACY
// (#152) computed LIVE against real ledger values — stock (reports.stockSummary) and fixed assets
// (book_fixed_assets net book value). Under-insurance triggers the average clause (a claim is
// scaled down by the coverage ratio), so this flags the exposure in rupees. book_* convention:
// gen_random_uuid PK, explicit tenant filter.
const { pool } = require("../../db");
const reports = require("./reports");

class InsuranceError extends Error { constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; } }
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const P_FIELDS = ["insurer", "policy_no", "type", "sum_insured", "premium", "start_date", "end_date", "asset_covered", "beneficiary", "scan_file_id", "status", "notes"];
const C_FIELDS = ["policy_id", "claim_no", "incident_date", "filed_date", "claim_amount", "settled_amount", "status", "checklist", "notes"];

function decoratePolicy(p) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let days = null, state = p.status;
  if (p.end_date && p.status === "active") { const d = new Date(p.end_date); d.setHours(0, 0, 0, 0); days = Math.round((d - today) / 86400000); if (days < 0) state = "lapsed"; else if (days <= 30) state = "expiring"; }
  return { ...p, sum_insured: n(p.sum_insured), premium: n(p.premium), days_to_renewal: days, state };
}

async function listPolicies(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_insurance_policies WHERE ${where} ORDER BY end_date NULLS LAST, created_at DESC`, params);
  return rows.map(decoratePolicy);
}
async function createPolicy(tenantId, actorId, body = {}) {
  const cols = P_FIELDS.filter((f) => body[f] !== undefined);
  const vals = cols.map((_, i) => `$${i + 3}`);
  const { rows } = await pool.query(`INSERT INTO book_insurance_policies(tenant_id, created_by, ${cols.join(", ")}) VALUES($1,$2,${vals.join(", ")}) RETURNING *`, [tenantId, actorId || null, ...cols.map((c) => body[c])]);
  return decoratePolicy(rows[0]);
}
async function updatePolicy(tenantId, id, body = {}) {
  const cols = P_FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) throw new InsuranceError("BAD_INPUT", "nothing to update", 400);
  const sets = cols.map((c, i) => `${c}=$${i + 3}`);
  const { rows } = await pool.query(`UPDATE book_insurance_policies SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, id, ...cols.map((c) => body[c])]);
  if (!rows[0]) throw new InsuranceError("NOT_FOUND", "Policy not found", 404);
  return decoratePolicy(rows[0]);
}
async function removePolicy(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_insurance_policies WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new InsuranceError("NOT_FOUND", "Policy not found", 404);
  return { removed: true };
}

// Live coverable bases: stock (closing value) and fixed assets (net book value = cost - accum dep).
async function _bases(tenantId) {
  let stock = 0, assets = 0;
  try { const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1; const s = await reports.stockSummary(tenantId, `${y}-04-01`, iso(new Date())); stock = n(s.totals.closingValue); } catch { /* no stock */ }
  try { const { rows } = await pool.query("SELECT COALESCE(SUM(cost - accumulated_dep),0) AS v FROM book_fixed_assets WHERE tenant_id=$1 AND is_active=true", [tenantId]); assets = n(rows[0].v); } catch { /* no assets */ }
  return { stock, assets };
}
const STOCK_TYPES = ["fire", "burglary", "marine", "stock"];
const ASSET_TYPES = ["machinery", "property"];

// Sum-insured adequacy vs live values. For stock/asset policies: adequacy = sum_insured / coverable.
// Under-insurance → average-clause exposure on a total-loss claim = shortfall.
async function sumInsuredAdequacy(tenantId) {
  const { stock, assets } = await _bases(tenantId);
  const policies = (await listPolicies(tenantId, { status: "active" }));
  const rows = policies.map((p) => {
    let base = null, basis = null;
    if (STOCK_TYPES.includes(p.type)) { base = stock; basis = "live stock value"; }
    else if (ASSET_TYPES.includes(p.type)) { base = assets; basis = "fixed assets (net book value)"; }
    if (base == null) return { id: p.id, insurer: p.insurer, type: p.type, sum_insured: p.sum_insured, adequacy: null, note: "adequacy N/A (people/liability cover)" };
    const adequacyPct = base > 0 ? r2((p.sum_insured / base) * 100) : null;
    const underInsured = base > 0 && p.sum_insured < base;
    return {
      id: p.id, insurer: p.insurer, type: p.type, sum_insured: p.sum_insured, coverable_value: r2(base), basis,
      adequacy_pct: adequacyPct, under_insured: underInsured,
      shortfall: underInsured ? r2(base - p.sum_insured) : 0,
      average_clause_note: underInsured ? `A claim would be scaled to ${adequacyPct}% (average clause). Increase cover by ₹${r2(base - p.sum_insured).toLocaleString("en-IN")}.` : null,
    };
  });
  return {
    live: { stock_value: r2(stock), fixed_assets_value: r2(assets) },
    policies: rows,
    under_insured_count: rows.filter((r) => r.under_insured).length,
    note: "Adequacy compares each policy's sum insured to the live ledger value it covers. Under-insurance triggers the average clause on partial/total loss.",
  };
}
async function expiringPolicies(tenantId, withinDays = 45) {
  const { rows } = await pool.query(
    `SELECT * FROM book_insurance_policies WHERE tenant_id=$1 AND status='active' AND end_date IS NOT NULL
       AND end_date <= (CURRENT_DATE + ($2||' days')::interval) ORDER BY end_date`, [tenantId, String(withinDays)]);
  return rows.map(decoratePolicy);
}

// ── Claims ──
const CLAIM_CHECKLIST = ["Intimate insurer within 24-48h", "FIR / incident report", "Photographs of loss", "Surveyor appointment", "Estimate of loss", "Purchase invoices / stock records", "Claim form signed", "Bank details for settlement"];
async function listClaims(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "c.tenant_id=$1";
  if (status) { params.push(status); where += ` AND c.status=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT c.*, p.insurer, p.policy_no, p.type FROM book_insurance_claims c
       LEFT JOIN book_insurance_policies p ON p.id=c.policy_id WHERE ${where} ORDER BY c.created_at DESC`, params);
  return rows.map((c) => ({ ...c, claim_amount: n(c.claim_amount), settled_amount: n(c.settled_amount) }));
}
async function createClaim(tenantId, actorId, body = {}) {
  const b = { ...body };
  if (b.checklist === undefined) b.checklist = CLAIM_CHECKLIST.map((label) => ({ label, done: false })); // default filing checklist
  const cols = C_FIELDS.filter((f) => b[f] !== undefined);
  const vals = cols.map((_, i) => `$${i + 3}`);
  const { rows } = await pool.query(
    `INSERT INTO book_insurance_claims(tenant_id, created_by, ${cols.join(", ")}) VALUES($1,$2,${vals.join(", ")}) RETURNING *`,
    [tenantId, actorId || null, ...cols.map((c) => (c === "checklist" ? JSON.stringify(b[c]) : b[c]))]);
  return { ...rows[0], claim_amount: n(rows[0].claim_amount), settled_amount: n(rows[0].settled_amount) };
}
async function updateClaim(tenantId, id, body = {}) {
  const cols = C_FIELDS.filter((f) => body[f] !== undefined);
  if (!cols.length) throw new InsuranceError("BAD_INPUT", "nothing to update", 400);
  const sets = cols.map((c, i) => `${c}=$${i + 3}`);
  const { rows } = await pool.query(`UPDATE book_insurance_claims SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [tenantId, id, ...cols.map((c) => (c === "checklist" ? JSON.stringify(body[c]) : body[c]))]);
  if (!rows[0]) throw new InsuranceError("NOT_FOUND", "Claim not found", 404);
  return { ...rows[0], claim_amount: n(rows[0].claim_amount), settled_amount: n(rows[0].settled_amount) };
}

module.exports = { InsuranceError, listPolicies, createPolicy, updatePolicy, removePolicy, sumInsuredAdequacy, expiringPolicies, listClaims, createClaim, updateClaim, CLAIM_CHECKLIST };
