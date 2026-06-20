// §9 — GST returns. Pure aggregation over book_tax_entries (captured at posting
// time at full precision) so returns always reconcile to the books. Outward tax
// is is_input=false; ITC is is_input=true. Taxable value is counted once per line
// (from CGST/IGST rows) so CGST+SGST pairs don't double-count it.
const { pool } = require("../../db");
const { money, toRupees, toDb } = require("./money");

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

// Derive place of supply + inter-state from seller vs buyer state code (so callers
// stop passing a manual interState flag). State code = first 2 digits of GSTIN.
function derivePlaceOfSupply(sellerStateCode, buyerStateCode) {
  const placeOfSupply = buyerStateCode || sellerStateCode || null;
  const isInterState = !!(sellerStateCode && buyerStateCode && String(sellerStateCode) !== String(buyerStateCode));
  return { placeOfSupply, isInterState };
}

// GSTR-1 broken into the statutory sections (B2B / B2CL / B2CS / CDNR / EXP).
async function gstr1Sections(tenantId, period) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_type, te.supply_type, te.counterparty_gstin AS gstin, te.place_of_supply AS pos, te.rate,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='IGST'),0) AS igst
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=false AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY v.id, v.voucher_type, te.supply_type, te.counterparty_gstin, te.place_of_supply, te.rate`,
    [tenantId, from, to]
  );
  const b2b = [], b2cl = [], cdnr = [], exp = [], b2cs = {};
  for (const r of rows) {
    const rec = { voucherId: r.id, gstin: r.gstin, pos: r.pos, rate: Number(r.rate), taxable: toRupees(r.taxable), cgst: toRupees(r.cgst), sgst: toRupees(r.sgst), igst: toRupees(r.igst) };
    const supply = r.supply_type || "REGULAR";
    const isNote = r.voucher_type === "CREDIT_NOTE" || r.voucher_type === "DEBIT_NOTE";
    const invVal = money(r.taxable).plus(r.cgst).plus(r.sgst).plus(r.igst);
    const interState = money(r.igst).greaterThan(0);
    if (supply === "EXPORT" || supply === "SEZ") exp.push({ ...rec, type: supply });
    else if (isNote && r.gstin) cdnr.push({ ...rec, noteType: r.voucher_type });
    else if (r.gstin) b2b.push(rec);
    else if (interState && invVal.greaterThan(250000)) b2cl.push(rec);
    else {
      const key = `${rec.rate}|${r.pos || ""}`;
      const b = b2cs[key] || (b2cs[key] = { rate: rec.rate, pos: r.pos || null, taxable: money(0), cgst: money(0), sgst: money(0), igst: money(0) });
      b.taxable = b.taxable.plus(r.taxable); b.cgst = b.cgst.plus(r.cgst); b.sgst = b.sgst.plus(r.sgst); b.igst = b.igst.plus(r.igst);
    }
  }
  const b2csArr = Object.values(b2cs).map((b) => ({ rate: b.rate, pos: b.pos, taxable: toRupees(b.taxable), cgst: toRupees(b.cgst), sgst: toRupees(b.sgst), igst: toRupees(b.igst) }));
  return { period, b2b, b2cl, b2cs: b2csArr, cdnr, exp };
}

// GSTR-1 Table 12 — HSN/SAC-wise summary.
async function hsnSummary(tenantId, period) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT te.hsn_sac AS hsn, te.rate,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount)   FILTER (WHERE te.tax_kind='IGST'),0) AS igst
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=false AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY te.hsn_sac, te.rate ORDER BY te.hsn_sac`,
    [tenantId, from, to]
  );
  return { period, rows: rows.map((r) => ({ hsn: r.hsn || "", rate: Number(r.rate), taxable: toRupees(r.taxable), cgst: toRupees(r.cgst), sgst: toRupees(r.sgst), igst: toRupees(r.igst), totalTax: toRupees(money(r.cgst).plus(r.sgst).plus(r.igst)) })) };
}

// GSTR-1 portal/offline-tool JSON (best-effort to the documented shape).
async function gstr1Json(tenantId, period) {
  const sec = await gstr1Sections(tenantId, period);
  const hsn = await hsnSummary(tenantId, period);
  const { rows: tp } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const [y, m] = String(period).split("-");
  return { gstin: (tp[0] && tp[0].gstin) || null, fp: `${m}${y}`, version: "GST3.0", hash: "hash",
    b2b: sec.b2b, b2cl: sec.b2cl, b2cs: sec.b2cs, cdnr: sec.cdnr, exp: sec.exp, hsn: { data: hsn.rows } };
}

// ── GST rate master (HSN → rate / cess) ──────────────────────────────────────
// Upsert by (tenant_id, hsn) — the table PK — so there is one current row per HSN.
async function setGstRate(tenantId, { hsn, rate, cessRate, description } = {}) {
  if (!hsn) throw new Error("hsn is required");
  const { rows } = await pool.query(
    `INSERT INTO book_gst_rates(tenant_id, hsn, rate, cess_rate, description)
          VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, hsn) DO UPDATE
        SET rate=EXCLUDED.rate, cess_rate=EXCLUDED.cess_rate, description=EXCLUDED.description
     RETURNING hsn, rate, cess_rate, description`,
    [tenantId, String(hsn), toDb(rate || 0), toDb(cessRate || 0), description || null]
  );
  const x = rows[0];
  return { hsn: x.hsn, rate: toRupees(x.rate), cessRate: toRupees(x.cess_rate), description: x.description };
}

// Latest (and only) rate row for an HSN, or null.
async function getGstRate(tenantId, hsn) {
  const { rows } = await pool.query(
    `SELECT hsn, rate, cess_rate, description FROM book_gst_rates WHERE tenant_id=$1 AND hsn=$2`,
    [tenantId, String(hsn)]
  );
  if (!rows[0]) return null;
  const x = rows[0];
  return { hsn: x.hsn, rate: toRupees(x.rate), cessRate: toRupees(x.cess_rate), description: x.description };
}

async function listGstRates(tenantId) {
  const { rows } = await pool.query(
    `SELECT hsn, rate, cess_rate, description FROM book_gst_rates WHERE tenant_id=$1 ORDER BY hsn`,
    [tenantId]
  );
  return rows.map((x) => ({ hsn: x.hsn, rate: toRupees(x.rate), cessRate: toRupees(x.cess_rate), description: x.description }));
}

// ── GST challan (PMT-06) register ────────────────────────────────────────────
// A challan is PAID once it has a CIN (challan identification no.) and a paidOn
// date; until then it sits PENDING (created on the portal, not yet realised).
async function recordChallan(tenantId, { period, cgst, sgst, igst, cess, cin, bankRef, paidOn } = {}) {
  if (!period) throw new Error("period is required");
  const status = cin && paidOn ? "PAID" : "PENDING";
  const { rows } = await pool.query(
    `INSERT INTO book_gst_challans(tenant_id, period, cgst, sgst, igst, cess, cin, bank_ref, paid_on, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, period, cgst, sgst, igst, cess, cin, bank_ref, paid_on, status, created_at`,
    [tenantId, period, toDb(cgst || 0), toDb(sgst || 0), toDb(igst || 0), toDb(cess || 0),
     cin || null, bankRef || null, paidOn || null, status]
  );
  const x = rows[0];
  return {
    id: x.id, period: x.period,
    cgst: toRupees(x.cgst), sgst: toRupees(x.sgst), igst: toRupees(x.igst), cess: toRupees(x.cess),
    cin: x.cin, bankRef: x.bank_ref, paidOn: x.paid_on, status: x.status, createdAt: x.created_at,
  };
}

async function listChallans(tenantId, period) {
  const params = [tenantId];
  let where = "tenant_id=$1";
  if (period) { params.push(period); where += ` AND period=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, period, cgst, sgst, igst, cess, cin, bank_ref, paid_on, status, created_at
       FROM book_gst_challans WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  return rows.map((x) => ({
    id: x.id, period: x.period,
    cgst: toRupees(x.cgst), sgst: toRupees(x.sgst), igst: toRupees(x.igst), cess: toRupees(x.cess),
    cin: x.cin, bankRef: x.bank_ref, paidOn: x.paid_on, status: x.status, createdAt: x.created_at,
  }));
}

// Electronic-cash-ledger style net-to-pay: GSTR-3B net liability for the period
// vs PAID challans recorded against it, per head. netToPay = liability − paid.
async function gstLiabilityVsPaid(tenantId, period) {
  const b3 = await gstr3b(tenantId, period);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(cgst),0) AS cgst, COALESCE(SUM(sgst),0) AS sgst,
            COALESCE(SUM(igst),0) AS igst, COALESCE(SUM(cess),0) AS cess
       FROM book_gst_challans WHERE tenant_id=$1 AND period=$2 AND status='PAID'`,
    [tenantId, period]
  );
  const paid = rows[0];
  const liability = {}, paidOut = {}, netToPay = {};
  for (const k of ["CGST", "SGST", "IGST", "CESS"]) {
    const liab = money(b3.netLiability[k]);
    const pd = money(paid[k.toLowerCase()]);
    liability[k] = toRupees(liab);
    paidOut[k] = toRupees(pd);
    netToPay[k] = toRupees(liab.minus(pd));
  }
  return { period, liability, paid: paidOut, netToPay };
}

// ── Blocked ITC (s.17(5)) report helper ─────────────────────────────────────
// There is no dedicated "blocked" flag column on book_tax_entries, so blocked
// credits are identified by supply_type='BLOCKED' on the inward (is_input=true)
// tax rows. Alternatively pass an explicit list of voucher ids whose input tax
// should be treated as reversed. Read-only report — it does not post anything.
async function blockedItcSummary(tenantId, period, voucherIds = null) {
  const { from, to } = monthRange(period);
  const params = [tenantId, from, to];
  let filter = "te.supply_type='BLOCKED'";
  if (Array.isArray(voucherIds) && voucherIds.length) {
    params.push(voucherIds);
    filter = `te.voucher_id = ANY($${params.length}::uuid[])`;
  }
  const { rows } = await pool.query(
    `SELECT te.tax_kind, COALESCE(SUM(te.tax_amount),0) AS amt
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=true AND v.voucher_date BETWEEN $2 AND $3
        AND ${filter}
      GROUP BY te.tax_kind`,
    params
  );
  const byHead = { CGST: money(0), SGST: money(0), IGST: money(0), CESS: money(0) };
  let total = money(0);
  for (const r of rows) {
    if (byHead[r.tax_kind] !== undefined) byHead[r.tax_kind] = money(r.amt);
    total = total.plus(r.amt);
  }
  return {
    period,
    basis: Array.isArray(voucherIds) && voucherIds.length ? "VOUCHER_IDS" : "SUPPLY_TYPE_BLOCKED",
    byHead: r2(byHead),
    totalBlocked: toRupees(total),
  };
}

module.exports = { monthRange, gstr1, gstr3b, gstr2bReconcile, gstr9, deductionReport, derivePlaceOfSupply, gstr1Sections, hsnSummary, gstr1Json, setGstRate, getGstRate, listGstRates, recordChallan, listChallans, gstLiabilityVsPaid, blockedItcSummary };
