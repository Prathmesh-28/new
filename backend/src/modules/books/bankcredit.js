"use strict";
// Bank-credit paperwork — the monthly grind for every SMB with a CC/OD limit. All the REPORTS
// (drawing power, stock & book-debt statement, CMA multi-year summary) are computed from the
// existing ledger via reports.js — no new source of truth, so they always reconcile to the books.
// The REGISTERS (credit facilities, BG/LC, foreign remittances 15CA/15CB, 194N cash withdrawals)
// are stored in book_* tables (explicit tenant filter, not RLS'd — same convention as books).
const { pool } = require("../../db");
const reports = require("./reports");

class BankCreditError extends Error {
  constructor(code, message, http = 400) { super(message); this.code = code; this.http = http; }
}
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

// India FY (Apr–Mar) bounds for a date.
function fyBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { fy: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, start: `${y}-04-01`, end: `${y + 1}-03-31` };
}

// ── Credit facilities (sanctioned CC/OD/term limits + drawing-power margins) ──────
async function listFacilities(tenantId) {
  const { rows } = await pool.query("SELECT * FROM book_credit_facilities WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId]);
  return rows.map((f) => ({ ...f, sanctioned_limit: n(f.sanctioned_limit), utilized: n(f.utilized) }));
}
async function createFacility(tenantId, b = {}) {
  const { rows } = await pool.query(
    `INSERT INTO book_credit_facilities(tenant_id, lender, facility_type, sanctioned_limit, debtors_margin_pct, stock_margin_pct, debtors_max_days, deduct_creditors, utilized, interest_rate_pct, review_date, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [tenantId, b.lender || null, b.facility_type || "CC", n(b.sanctioned_limit), b.debtors_margin_pct ?? 25, b.stock_margin_pct ?? 25,
     b.debtors_max_days ?? 90, b.deduct_creditors !== false, n(b.utilized), b.interest_rate_pct ?? null, b.review_date || null, b.notes || null]);
  return rows[0];
}
async function updateFacility(tenantId, id, b = {}) {
  const fields = ["lender", "facility_type", "sanctioned_limit", "debtors_margin_pct", "stock_margin_pct", "debtors_max_days", "deduct_creditors", "utilized", "interest_rate_pct", "review_date", "status", "notes"];
  const sets = [], params = [tenantId, id]; let i = 3;
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f}=$${i++}`); params.push(b[f]); }
  if (!sets.length) throw new BankCreditError("BAD_INPUT", "nothing to update", 400);
  const { rows } = await pool.query(`UPDATE book_credit_facilities SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, params);
  if (!rows[0]) throw new BankCreditError("NOT_FOUND", "Facility not found", 404);
  return rows[0];
}

// Drawing power = eligible stock (net of margin) + eligible book debts (net of margin), optionally
// less sundry creditors (MPBF style). Book debts older than debtors_max_days are ineligible.
// Reads the real ledger (arAging + stockSummary + apAging) so it reconciles to the books.
async function drawingPower(tenantId, { asOf, facilityId } = {}) {
  const on = iso(asOf || new Date());
  let facility = null;
  if (facilityId) {
    const { rows } = await pool.query("SELECT * FROM book_credit_facilities WHERE tenant_id=$1 AND id=$2", [tenantId, facilityId]);
    facility = rows[0] || null;
  } else {
    const { rows } = await pool.query("SELECT * FROM book_credit_facilities WHERE tenant_id=$1 AND status='active' AND facility_type IN ('CC','OD') ORDER BY sanctioned_limit DESC LIMIT 1", [tenantId]);
    facility = rows[0] || null;
  }
  const debtorsMargin = n(facility?.debtors_margin_pct ?? 25);
  const stockMargin = n(facility?.stock_margin_pct ?? 25);
  const maxDays = Number(facility?.debtors_max_days ?? 90);
  const deductCreditors = facility ? facility.deduct_creditors : true;

  const ar = await reports.arAging(tenantId, on);
  const ap = await reports.apAging(tenantId, on);
  const { start } = fyBounds(on);
  const stock = await reports.stockSummary(tenantId, start, on);

  // Eligible book debts: buckets within maxDays (notDue always eligible).
  const t = ar.totals;
  let eligibleDebtors = n(t.notDue) + n(t.d0_30);
  if (maxDays >= 60) eligibleDebtors += n(t.d31_60);
  if (maxDays >= 90) eligibleDebtors += n(t.d61_90);
  // (d90plus is ineligible under the standard 90-day rule)
  const grossDebtors = n(t.total);
  const grossStock = n(stock.totals.closingValue);
  const creditors = n(ap.totals.total);

  const stockBase = deductCreditors ? Math.max(0, grossStock - creditors) : grossStock;
  const eligibleStockComponent = r2(stockBase * (1 - stockMargin / 100));
  const eligibleDebtorsComponent = r2(eligibleDebtors * (1 - debtorsMargin / 100));
  const dp = r2(eligibleStockComponent + eligibleDebtorsComponent);

  const sanctioned = n(facility?.sanctioned_limit || 0);
  const utilized = n(facility?.utilized || 0);
  const drawableLimit = sanctioned > 0 ? Math.min(dp, sanctioned) : dp; // DP is capped by the sanction
  const available = r2(drawableLimit - utilized);

  return {
    as_of: on,
    facility: facility ? { id: facility.id, lender: facility.lender, facility_type: facility.facility_type, sanctioned_limit: sanctioned, review_date: facility.review_date } : null,
    stock: { gross: r2(grossStock), less_creditors: deductCreditors ? r2(creditors) : 0, base: r2(stockBase), margin_pct: stockMargin, eligible: eligibleStockComponent },
    book_debts: { gross: r2(grossDebtors), eligible_gross: r2(eligibleDebtors), excluded_over_limit: r2(grossDebtors - eligibleDebtors), margin_pct: debtorsMargin, eligible: eligibleDebtorsComponent, max_days: maxDays },
    creditors: r2(creditors),
    drawing_power: dp,
    sanctioned_limit: sanctioned,
    drawable_limit: r2(drawableLimit),
    utilized,
    available,
    utilization_pct: drawableLimit > 0 ? r2((utilized / drawableLimit) * 100) : 0,
    note: "Drawing power = eligible stock (net margin) + eligible book debts (net margin)" + (deductCreditors ? ", less sundry creditors from stock (MPBF)." : "."),
  };
}

// Monthly stock & book-debt statement in the format banks want (CC/OD stock statement). Stock from
// the inventory ledger, book debts bucketed by age. month = 'YYYY-MM'.
async function stockBookDebtStatement(tenantId, { month } = {}) {
  const m = month || iso(new Date()).slice(0, 7);
  const start = `${m}-01`;
  const endD = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0);
  const end = iso(endD);
  const stock = await reports.stockSummary(tenantId, start, end);
  const ar = await reports.arAging(tenantId, end);
  const t = ar.totals;
  return {
    month: m, from: start, to: end,
    stock: {
      closing_value: n(stock.totals.closingValue),
      items: stock.items.slice(0, 50).map((it) => ({ name: it.name, unit: it.unit, closing_qty: it.closingQty, closing_value: it.closingValue })),
    },
    book_debts: {
      total: n(t.total),
      buckets: { notDue: n(t.notDue), "0-30": n(t.d0_30), "31-60": n(t.d31_60), "61-90": n(t.d61_90), "90+": n(t.d90plus) },
      eligible_within_90: r2(n(t.notDue) + n(t.d0_30) + n(t.d31_60) + n(t.d61_90)),
      parties: ar.parties.slice(0, 50),
    },
    total_current_assets_paper: r2(n(stock.totals.closingValue) + n(t.total)),
  };
}

// CMA-style multi-year financial summary — the data backbone every bank CMA needs, pulled from
// actuals across FYs. (Full CMA Form III current/non-current split needs ledger grouping tags;
// this delivers the P&L, balance-sheet totals, and the ratios computable from them — honestly
// labelled, not fabricated.)
async function cmaSummary(tenantId, { years } = {}) {
  let fys = Array.isArray(years) && years.length ? years : null;
  if (!fys) { const b = fyBounds(); const [a] = b.fy.split("-").map(Number); fys = [a - 2, a - 1, a].map((y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`); }
  const rows = [];
  for (const fy of fys) {
    const pl = await reports.profitLoss(tenantId, fy);
    const bs = await reports.balanceSheet(tenantId, fy);
    const sales = n(pl.totalIncome), expense = n(pl.totalExpense), netProfit = n(pl.netProfit);
    const totalAssets = n(bs.totalAssets), totalLiabilities = n(bs.totalLiabilities), netWorth = n(bs.totalEquity);
    rows.push({
      fy, sales, total_expense: expense, net_profit: netProfit,
      total_assets: totalAssets, total_outside_liabilities: totalLiabilities, net_worth: netWorth,
      net_profit_margin_pct: sales > 0 ? r2((netProfit / sales) * 100) : 0,
      tol_tnw: netWorth > 0 ? r2(totalLiabilities / netWorth) : null,       // total outside liabilities / tangible net worth
      return_on_net_worth_pct: netWorth > 0 ? r2((netProfit / netWorth) * 100) : null,
    });
  }
  return { years: fys, rows, note: "Multi-year actuals from the ledger — the CMA backbone. Current/non-current classification for Form III requires ledger grouping tags." };
}

// ── BG / inland LC register (margin + expiry alerting) ───────────────────────────
async function listGuarantees(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_bank_guarantees WHERE ${where} ORDER BY expires_on NULLS LAST, created_at DESC`, params);
  const today = new Date();
  return rows.map((g) => ({ ...g, amount: n(g.amount), days_to_expiry: g.expires_on ? Math.ceil((new Date(g.expires_on) - today) / 86400000) : null }));
}
async function createGuarantee(tenantId, b = {}) {
  const { rows } = await pool.query(
    `INSERT INTO book_bank_guarantees(tenant_id, instrument, kind, reference_no, bank, beneficiary, amount, margin_pct, commission_pct, issued_on, expires_on, claim_period_on, notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [tenantId, b.instrument || "BG", b.kind || null, b.reference_no || null, b.bank || null, b.beneficiary || null, n(b.amount),
     b.margin_pct ?? 0, b.commission_pct ?? null, b.issued_on || null, b.expires_on || null, b.claim_period_on || null, b.notes || null]);
  return rows[0];
}
async function updateGuarantee(tenantId, id, b = {}) {
  const fields = ["instrument", "kind", "reference_no", "bank", "beneficiary", "amount", "margin_pct", "commission_pct", "issued_on", "expires_on", "claim_period_on", "status", "notes"];
  const sets = [], params = [tenantId, id]; let i = 3;
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f}=$${i++}`); params.push(b[f]); }
  if (!sets.length) throw new BankCreditError("BAD_INPUT", "nothing to update", 400);
  const { rows } = await pool.query(`UPDATE book_bank_guarantees SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, params);
  if (!rows[0]) throw new BankCreditError("NOT_FOUND", "Guarantee not found", 404);
  return rows[0];
}
async function removeGuarantee(tenantId, id) {
  const { rowCount } = await pool.query("DELETE FROM book_bank_guarantees WHERE tenant_id=$1 AND id=$2", [tenantId, id]);
  if (!rowCount) throw new BankCreditError("NOT_FOUND", "Guarantee not found", 404);
  return { deleted: true };
}
async function expiringGuarantees(tenantId, withinDays = 90) {
  const { rows } = await pool.query(
    `SELECT * FROM book_bank_guarantees WHERE tenant_id=$1 AND status='active' AND expires_on IS NOT NULL
       AND expires_on <= (CURRENT_DATE + ($2 || ' days')::interval) ORDER BY expires_on`, [tenantId, String(withinDays)]);
  const today = new Date();
  return rows.map((g) => ({ ...g, amount: n(g.amount), days_to_expiry: Math.ceil((new Date(g.expires_on) - today) / 86400000) }));
}

// ── Foreign remittance 15CA/15CB workflow ────────────────────────────────────────
// 15CB (CA cert) is generally required when the aggregate taxable remittance in the FY exceeds
// ₹5,00,000. Part A: taxable ≤ ₹5L. Part C: taxable > ₹5L with a 15CB. Part D: not taxable.
function suggestPart(amountInr, taxable) {
  if (!taxable) return { part: "D", cb_required: false };
  if (n(amountInr) <= 500000) return { part: "A", cb_required: false };
  return { part: "C", cb_required: true };
}
async function listRemittances(tenantId, { status } = {}) {
  const params = [tenantId]; let where = "tenant_id=$1";
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const { rows } = await pool.query(`SELECT * FROM book_remittances WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows.map((r) => ({ ...r, amount_fcy: n(r.amount_fcy), amount_inr: n(r.amount_inr), tds_amount: n(r.tds_amount) }));
}
async function createRemittance(tenantId, b = {}) {
  const taxable = b.taxable !== false;
  const s = suggestPart(b.amount_inr, taxable);
  const { rows } = await pool.query(
    `INSERT INTO book_remittances(tenant_id, beneficiary, country, currency, amount_fcy, amount_inr, purpose_code, nature, taxable, tds_section, tds_rate_pct, tds_amount, part, cb_required)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [tenantId, b.beneficiary || null, b.country || null, b.currency || "USD", n(b.amount_fcy), n(b.amount_inr), b.purpose_code || null, b.nature || null,
     taxable, b.tds_section || null, b.tds_rate_pct ?? null, n(b.tds_amount), b.part || s.part, b.cb_required ?? s.cb_required]);
  return rows[0];
}
// CA sign-off (15CB certified) → moves to ca_certified.
async function certifyRemittance(tenantId, id, { caName, caMembershipNo, signedOn } = {}) {
  const { rows } = await pool.query(
    `UPDATE book_remittances SET status='ca_certified', ca_name=$3, ca_membership_no=$4, ca_signed_on=COALESCE($5, CURRENT_DATE)
       WHERE tenant_id=$1 AND id=$2 AND status='draft' RETURNING *`, [tenantId, id, caName || null, caMembershipNo || null, signedOn || null]);
  if (!rows[0]) throw new BankCreditError("BAD_STATE", "Remittance not found or not in draft", 409);
  return rows[0];
}
async function fileRemittance(tenantId, id, { ackNo } = {}) {
  const { rows } = await pool.query(
    `UPDATE book_remittances SET status='filed', ack_no=$3 WHERE tenant_id=$1 AND id=$2 AND status IN ('draft','ca_certified') RETURNING *`,
    [tenantId, id, ackNo || null]);
  if (!rows[0]) throw new BankCreditError("BAD_STATE", "Remittance not found or already filed", 409);
  return rows[0];
}

// ── Section 194N cash-withdrawal monitor ─────────────────────────────────────────
async function recordCashWithdrawal(tenantId, b = {}) {
  const { rows } = await pool.query(
    `INSERT INTO book_cash_withdrawals(tenant_id, bank, account_last4, withdrawn_on, amount, is_itr_filer)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, b.bank || null, b.account_last4 || null, b.withdrawn_on || iso(new Date()), n(b.amount), b.is_itr_filer !== false]);
  return rows[0];
}
// FY-cumulative per bank account; 194N TDS: filers 2% above ₹1cr; non-filers 2% above ₹20L + 5% above ₹1cr.
async function monitor194N(tenantId, { fy } = {}) {
  const b = fy ? { start: `${fy.split("-")[0]}-04-01`, end: `${Number(fy.split("-")[0]) + 1}-03-31`, fy } : fyBounds();
  const { rows } = await pool.query(
    `SELECT bank, account_last4, bool_and(is_itr_filer) AS filer, SUM(amount) AS total, COUNT(*) AS txns
       FROM book_cash_withdrawals WHERE tenant_id=$1 AND withdrawn_on BETWEEN $2 AND $3
      GROUP BY bank, account_last4 ORDER BY SUM(amount) DESC`, [tenantId, b.start, b.end]);
  const CR = 10000000, L20 = 2000000;
  const accounts = rows.map((r) => {
    const total = n(r.total), filer = r.filer !== false;
    let tds = 0;
    if (filer) { tds = total > CR ? (total - CR) * 0.02 : 0; }
    else {
      if (total > CR) tds = (CR - L20) * 0.02 + (total - CR) * 0.05;
      else if (total > L20) tds = (total - L20) * 0.02;
    }
    return { bank: r.bank, account_last4: r.account_last4, is_itr_filer: filer, total_withdrawn: r2(total), txns: Number(r.txns), threshold: filer ? CR : L20, tds_applicable: r2(tds) };
  });
  return { fy: b.fy, accounts, total_tds_exposure: r2(accounts.reduce((s, a) => s + a.tds_applicable, 0)) };
}

module.exports = {
  BankCreditError,
  listFacilities, createFacility, updateFacility,
  drawingPower, stockBookDebtStatement, cmaSummary,
  listGuarantees, createGuarantee, updateGuarantee, removeGuarantee, expiringGuarantees,
  listRemittances, createRemittance, certifyRemittance, fileRemittance,
  recordCashWithdrawal, monitor194N,
};
