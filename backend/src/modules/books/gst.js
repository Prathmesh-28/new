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

// ── GSTR-2B INVOICE-LEVEL matching ───────────────────────────────────────────
// Re-implemented from resilient-tech/india-compliance's purchase-reconciliation
// Reconciler (MIT/GPL — own code here). The portal furnishes 2B invoices; we
// match each against our INWARD (is_input=true) booked invoices for the period
// by (supplier GSTIN + fuzzy invoice-no + amount-within-tolerance), in passes:
//   1. EXACT     — GSTIN + invoice-no equal + taxable & tax equal
//   2. SUGGESTED — GSTIN + (fuzzy invoice-no OR rounding-diff ≤ ₹1 on amounts)
// Anything matched on GSTIN+amount but with a differing invoice-no is bucketed
// as PROBABLE. Leftovers: portal-only → missingInBooks (booked nowhere, ITC
// can't be claimed / should be booked); books-only → missingInPortal (we
// claimed ITC the supplier hasn't filed → ITC at risk).
//
// Bill-no cleaner (india-compliance get_cleaner_bill_no): drop FY tokens, strip
// "/" and "-", collapse whitespace, strip leading zeros, uppercase.
const ITC_AMOUNT_TOLERANCE = money(1); // ≤ ₹1 rounding difference, per source

function billFyTokens(fy) {
  // fy = "YYYY-YYYY"; build the same replace-list india-compliance uses.
  const p = String(fy || "").split("-");
  if (p.length !== 2) return [];
  const [a, b] = p;
  return [
    `${a}-${b}`, `${a}/${b}`, `${a}${b}`,
    `${a}-${b.slice(2)}`, `${a}/${b.slice(2)}`, `${a}${b.slice(2)}`,
    `${a.slice(2)}-${b.slice(2)}`, `${a.slice(2)}/${b.slice(2)}`, `${a.slice(2)}${b.slice(2)}`,
  ];
}

function cleanerBillNo(billNo, fy) {
  let inv = String(billNo || "");
  for (const tok of [...billFyTokens(fy), "/", "-"]) {
    if (tok) inv = inv.split(tok).join(" ");
  }
  inv = inv.split(/\s+/).filter(Boolean).join(" ").replace(/^0+/, "");
  return inv.toUpperCase();
}

// India GST financial year from a date: Apr–Mar, "YYYY-YYYY".
function fyOfDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "";
  const y = dt.getUTCFullYear();
  return dt.getUTCMonth() < 3 ? `${y - 1}-${y}` : `${y}-${y + 1}`;
}

function daysApart(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(Math.round((da - db) / 86400000));
}

// Levenshtein → normalised ratio (0..100), the basis of rapidfuzz's fuzz.ratio.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
// rapidfuzz fuzz.ratio: 100 * (1 - dist / (len(a)+len(b))) — standard form.
function ratio(a, b) {
  if (!a.length && !b.length) return 100;
  const dist = levenshtein(a, b);
  const total = a.length + b.length;
  return total ? (1 - dist / total) * 100 : 100;
}
// partial_ratio: best ratio of the shorter string against every same-length
// window of the longer (rapidfuzz's substring alignment, simplified).
function partialRatio(a, b) {
  if (!a.length || !b.length) return 0;
  let [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let best = 0;
  for (let i = 0; i + s.length <= l.length; i++) {
    const r = ratio(s, l.slice(i, i + s.length));
    if (r > best) best = r;
    if (best === 100) break;
  }
  return best;
}

// Fuzzy bill-no match (Reconciler.fuzzy_match): dates within 10 days, then a
// 100% partial ratio OR a ≥90% best ratio on the cleaned bill numbers.
function fuzzyBillMatch(p, b) {
  if (!p._bill || !b._bill) return false;
  if (daysApart(p.invoiceDate, b.invoiceDate) > 10) return false;
  if (partialRatio(p._bill, b._bill) === 100) return true;
  return ratio(p._bill, b._bill) >= 90;
}

function amountWithinTolerance(p, b) {
  const dTaxable = money(p.taxable).minus(money(b.taxable)).abs();
  const dTax = money(p.tax).minus(money(b.tax)).abs();
  return dTaxable.lessThanOrEqualTo(ITC_AMOUNT_TOLERANCE) && dTax.lessThanOrEqualTo(ITC_AMOUNT_TOLERANCE);
}
function amountExact(p, b) {
  return money(p.taxable).equals(money(b.taxable)) && money(p.tax).equals(money(b.tax));
}

async function gstr2bMatch(tenantId, period, portalInvoices = []) {
  const { from, to } = monthRange(period);
  // Our INWARD (ITC) book invoices for the period, one row per voucher, with the
  // supplier GSTIN, invoice no/date and aggregated taxable + total tax.
  const { rows } = await pool.query(
    `SELECT v.id AS voucher_id,
            COALESCE(NULLIF(v.reference,''), v.voucher_number::text) AS invoice_no,
            v.voucher_date AS invoice_date, te.counterparty_gstin AS gstin,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount),0) AS tax
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=true AND v.voucher_date BETWEEN $2 AND $3
      GROUP BY v.id, v.reference, v.voucher_number, v.voucher_date, te.counterparty_gstin`,
    [tenantId, from, to]
  );

  // Normalise both sides into { gstin, invoiceNo, invoiceDate, taxable, tax, _bill, _id }.
  const mkBook = (r, i) => {
    const fy = fyOfDate(r.invoice_date);
    return {
      _id: r.voucher_id || `book-${i}`, gstin: (r.gstin || "").toUpperCase().trim(),
      invoiceNo: r.invoice_no || "", invoiceDate: r.invoice_date,
      taxable: toRupees(r.taxable), tax: toRupees(r.tax),
      _bill: cleanerBillNo(r.invoice_no, fy), _matched: false,
    };
  };
  const mkPortal = (r, i) => {
    const fy = fyOfDate(r.invoiceDate);
    return {
      _id: `portal-${i}`, gstin: (r.gstin || "").toUpperCase().trim(),
      invoiceNo: r.invoiceNo || "", invoiceDate: r.invoiceDate,
      taxable: toRupees(r.taxable || 0), tax: toRupees(r.tax || 0),
      _bill: cleanerBillNo(r.invoiceNo, fy), _matched: false,
    };
  };
  const books = rows.map(mkBook);
  const portal = (portalInvoices || []).map(mkPortal);

  // Index books by GSTIN so passes only compare same-supplier invoices.
  const booksByGstin = new Map();
  for (const b of books) {
    if (!booksByGstin.has(b.gstin)) booksByGstin.set(b.gstin, []);
    booksByGstin.get(b.gstin).push(b);
  }

  const matched = [], probable = [];
  const rec = (p, b, status) => {
    p._matched = b._matched = true;
    const out = {
      gstin: p.gstin, status,
      portal: { invoiceNo: p.invoiceNo, invoiceDate: p.invoiceDate, taxable: p.taxable, tax: p.tax },
      books: { voucherId: b._id, invoiceNo: b.invoiceNo, invoiceDate: b.invoiceDate, taxable: b.taxable, tax: b.tax },
      taxDiff: toRupees(money(p.tax).minus(money(b.tax))),
    };
    (status === "EXACT" ? matched : probable).push(out);
  };

  // Pass 1 — EXACT: same GSTIN, same cleaned invoice-no, equal taxable & tax.
  for (const p of portal) {
    if (p._matched) continue;
    for (const b of booksByGstin.get(p.gstin) || []) {
      if (b._matched) continue;
      if (p._bill && b._bill && p._bill === b._bill && amountExact(p, b)) { rec(p, b, "EXACT"); break; }
    }
  }
  // Pass 2 — SUGGESTED (matched bucket): same GSTIN, fuzzy invoice-no, amounts
  // within ₹1 tolerance. A strong match → counts as matched/reconciled.
  for (const p of portal) {
    if (p._matched) continue;
    for (const b of booksByGstin.get(p.gstin) || []) {
      if (b._matched) continue;
      if (fuzzyBillMatch(p, b) && amountWithinTolerance(p, b)) { rec(p, b, "SUGGESTED"); break; }
    }
  }
  // Pass 3 — PROBABLE: same GSTIN + amounts within tolerance but invoice-no
  // differs (no fuzzy hit). Likely the same invoice keyed differently.
  for (const p of portal) {
    if (p._matched) continue;
    for (const b of booksByGstin.get(p.gstin) || []) {
      if (b._matched) continue;
      if (amountWithinTolerance(p, b)) { rec(p, b, "PROBABLE"); break; }
    }
  }

  // Leftovers.
  const missingInBooks = portal.filter((p) => !p._matched).map((p) => ({
    gstin: p.gstin, invoiceNo: p.invoiceNo, invoiceDate: p.invoiceDate, taxable: p.taxable, tax: p.tax,
  }));
  const missingInPortal = books.filter((b) => !b._matched).map((b) => ({
    gstin: b.gstin, voucherId: b._id, invoiceNo: b.invoiceNo, invoiceDate: b.invoiceDate, taxable: b.taxable, tax: b.tax,
  }));

  // ITC at risk = total tax we've booked (claimed) that isn't in 2B.
  const itcAtRisk = toRupees(missingInPortal.reduce((a, b) => a.plus(money(b.tax)), money(0)));

  return {
    period, matched, probable, missingInBooks, missingInPortal,
    summary: {
      counts: {
        matched: matched.length, probable: probable.length,
        missingInBooks: missingInBooks.length, missingInPortal: missingInPortal.length,
        portalTotal: portal.length, booksTotal: books.length,
      },
      itcAtRisk,
    },
  };
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

module.exports = { monthRange, gstr1, gstr3b, gstr2bReconcile, gstr2bMatch, gstr9, deductionReport, derivePlaceOfSupply, gstr1Sections, hsnSummary, gstr1Json, setGstRate, getGstRate, listGstRates, recordChallan, listChallans, gstLiabilityVsPaid, blockedItcSummary };
