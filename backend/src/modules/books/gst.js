// §9 — GST returns. Pure aggregation over book_tax_entries (captured at posting
// time at full precision) so returns always reconcile to the books. Outward tax
// is is_input=false; ITC is is_input=true. Taxable value is counted once per line
// (from CGST/IGST rows) so CGST+SGST pairs don't double-count it.
const { pool } = require("../../db");
const { money, toRupees } = require("./money");

// "YYYY-MM" → { from, to } (first … last day of that month, UTC-safe).
function monthRange(period) {
  const [y, m] = String(period).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}
const r2 = (o) => { const x = {}; for (const k in o) x[k] = toRupees(o[k]); return x; };

// GSTR-1 — outward supplies, grouped by rate × B2B/B2C × supply type.
async function gstr1(tenantId, period) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT te.rate, te.supply_type, (te.counterparty_gstin IS NOT NULL) AS b2b,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='IGST'),0) AS igst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='CESS'),0) AS cess
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=false AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY te.rate, te.supply_type, b2b
      ORDER BY te.rate`,
    [tenantId, from, to]
  );
  return {
    period,
    rows: rows.map((r) => ({ rate: r.rate, supplyType: r.supply_type, segment: r.b2b ? "B2B" : "B2C", taxable: toRupees(r.taxable), cgst: toRupees(r.cgst), sgst: toRupees(r.sgst), igst: toRupees(r.igst), cess: toRupees(r.cess) })),
  };
}

// GSTR-3B — output tax vs eligible ITC, net liability per head.
async function gstr3b(tenantId, period) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT te.tax_kind, te.is_input, COALESCE(SUM(te.tax_amount),0) AS amt
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY te.tax_kind, te.is_input`,
    [tenantId, from, to]
  );
  const out = { CGST: money(0), SGST: money(0), IGST: money(0), CESS: money(0) };
  const itc = { CGST: money(0), SGST: money(0), IGST: money(0), CESS: money(0) };
  for (const r of rows) { const tgt = r.is_input ? itc : out; if (tgt[r.tax_kind] !== undefined) tgt[r.tax_kind] = money(r.amt); }
  const net = {};
  for (const k of ["CGST", "SGST", "IGST", "CESS"]) net[k] = toRupees(out[k].minus(itc[k]));
  return { period, outputTax: r2(out), inputTaxCredit: r2(itc), netLiability: net };
}

// GSTR-2B reconcile — our inward (ITC) by supplier GSTIN vs the portal-furnished rows.
async function gstr2bReconcile(tenantId, period, portalRows = []) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT te.counterparty_gstin AS gstin, COALESCE(SUM(te.tax_amount),0) AS tax
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=true AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY te.counterparty_gstin`,
    [tenantId, from, to]
  );
  const books = new Map(rows.map((r) => [r.gstin || "UNKNOWN", money(r.tax)]));
  const portal = new Map(portalRows.map((r) => [r.gstin, money(r.tax)]));
  const matched = [], mismatched = [], missingInBooks = [], missingInPortal = [];
  for (const [g, pt] of portal) {
    if (books.has(g)) { const bt = books.get(g); (bt.equals(pt) ? matched : mismatched).push({ gstin: g, portal: toRupees(pt), books: toRupees(bt) }); }
    else missingInBooks.push({ gstin: g, portal: toRupees(pt) });
  }
  for (const [g, bt] of books) if (!portal.has(g)) missingInPortal.push({ gstin: g, books: toRupees(bt) });
  return { period, matched, mismatched, missingInBooks, missingInPortal };
}

// GSTR-9 — annual summary (outward + ITC) for an FY.
async function gstr9(tenantId, fy) {
  const { rows } = await pool.query(
    `SELECT te.is_input, COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount),0) AS tax
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.financial_year=$2
      WHERE te.tenant_id=$1
      GROUP BY te.is_input`,
    [tenantId, fy]
  );
  const outward = rows.find((r) => !r.is_input) || { taxable: 0, tax: 0 };
  const inward = rows.find((r) => r.is_input) || { taxable: 0, tax: 0 };
  return { financialYear: fy, outward: { taxable: toRupees(outward.taxable), tax: toRupees(outward.tax) }, inward: { taxable: toRupees(inward.taxable), tax: toRupees(inward.tax) } };
}

// TDS / TCS aggregation for a period (Form 26Q feeds off this).
async function deductionReport(tenantId, period, kind = "TDS") {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(te.taxable_value),0) AS base, COALESCE(SUM(te.tax_amount),0) AS amount, COUNT(*)::int AS n
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.tax_kind=$4 AND v.voucher_date BETWEEN $2 AND $3`,
    [tenantId, from, to, kind]
  );
  return { period, kind, base: toRupees(rows[0].base), amount: toRupees(rows[0].amount), count: rows[0].n };
}

module.exports = { monthRange, gstr1, gstr3b, gstr2bReconcile, gstr9, deductionReport };
