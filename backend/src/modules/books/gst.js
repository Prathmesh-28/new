// §9 — GST returns. Pure aggregation over book_tax_entries (captured at posting
// time at full precision) so returns always reconcile to the books. Outward tax
// is is_input=false; ITC is is_input=true. Taxable value is counted once per line
// (from CGST/IGST rows) so CGST+SGST pairs don't double-count it.
const { pool } = require("../../db");
const { money, toRupees, toDb } = require("./money");
const { PostError } = require("./posting-engine");

// "YYYY-MM" → { from, to } (first … last day of that month, UTC-safe).
function monthRange(period) {
  const [y, m] = String(period).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

// India FY "YYYY-YYYY" → { from:'YYYY-04-01', to:'YYYY+1-03-31' } and its 12 "YYYY-MM" periods.
function fyRange(fy) {
  const p = String(fy || "").split("-");
  if (p.length !== 2 || !/^\d{4}$/.test(p[0]) || !/^\d{4}$/.test(p[1])) {
    throw new PostError("BAD_FY", "financial year must be 'YYYY-YYYY'", 400);
  }
  const a = Number(p[0]), b = Number(p[1]);
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const mAbs = 4 + i;                         // Apr(4) … Mar(15)
    const yr = mAbs <= 12 ? a : b;
    const mm = ((mAbs - 1) % 12) + 1;
    periods.push(`${yr}-${String(mm).padStart(2, "0")}`);
  }
  return { from: `${a}-04-01`, to: `${b}-03-31`, periods };
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

// ── GSTR-9 — annual return ───────────────────────────────────────────────────
// Ported (logic, not code) from resilient-tech/india-compliance gstr_9 + the
// statutory GSTR-9 offline-tool. Auto-populated from the same GSTR-3B + GSTR-1
// period data this module already computes, summed over the FY's 12 months, so
// the annual return reconciles to the books by construction.
//
// Anything the books can't know on their own — prior-FY amendments declared in
// THIS year's returns (Pt V), demands/refunds (15), late fee (16), and the GSTR-2A
// auto-drafted ITC for table 8A — is taken from `opts` (portal-furnished /
// manual), defaulting to zero. Output is shaped to the portal/offline-tool JSON.

const HEADS = ["CGST", "SGST", "IGST", "CESS"];
const zeroHeads = () => ({ CGST: money(0), SGST: money(0), IGST: money(0), CESS: money(0) });
const headsToRupees = (h) => ({ cgst: toRupees(h.CGST), sgst: toRupees(h.SGST), igst: toRupees(h.IGST), cess: toRupees(h.CESS) });
// Read a heads object out of opts (accepts {cgst,sgst,igst,cess} from caller).
const headsFrom = (o) => {
  const h = zeroHeads();
  if (o && typeof o === "object") for (const k of HEADS) if (o[k.toLowerCase()] != null) h[k] = money(o[k.toLowerCase()]);
  return h;
};

// One pass over the FY's outward (is_input=false) tax rows, bucketed the way
// GSTR-9 Pt II needs: B2B/B2C/exports/SEZ/RCM-outward/nil-rated, each with its
// taxable value and tax heads. Credit/debit notes are netted into 4I/4J.
async function fyOutwardBuckets(tenantId, fy) {
  const { from, to } = fyRange(fy);
  const { rows } = await pool.query(
    `SELECT v.voucher_type, te.supply_type, (te.counterparty_gstin IS NOT NULL) AS b2b, te.rate,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='IGST'),0) AS igst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CESS'),0) AS cess
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=false
      GROUP BY v.voucher_type, te.supply_type, b2b, te.rate`,
    [tenantId, from, to]
  );
  // Each bucket = { taxable, CGST, SGST, IGST, CESS }.
  const mk = () => ({ taxable: money(0), ...zeroHeads() });
  const acc = {
    b2c: mk(),        // 4A — supplies to unregistered (B2C)
    rcmOut: mk(),     // 4B — supplies on which RCM is payable (outward, recipient pays)
    export: mk(),     // 4C/5A — exports
    sez: mk(),        // 4D/5B — SEZ supplies
    b2b: mk(),        // 4G-ish — B2B taxable
    nil: mk(),        // 5D/5E/5F — nil-rated/exempt/non-GST
    creditNotes: mk(),// 4I — credit notes
    debitNotes: mk(), // 4J — debit notes
  };
  const add = (t, r) => {
    t.taxable = t.taxable.plus(r.taxable);
    t.CGST = t.CGST.plus(r.cgst); t.SGST = t.SGST.plus(r.sgst);
    t.IGST = t.IGST.plus(r.igst); t.CESS = t.CESS.plus(r.cess);
  };
  for (const r of rows) {
    const st = r.supply_type || "REGULAR";
    if (r.voucher_type === "CREDIT_NOTE") { add(acc.creditNotes, r); continue; }
    if (r.voucher_type === "DEBIT_NOTE") { add(acc.debitNotes, r); continue; }
    if (st === "ADVANCE") continue; // advances are 4F, handled via advance helper
    if (st === "EXPORT") add(acc.export, r);
    else if (st === "SEZ") add(acc.sez, r);
    else if (st === "RCM") add(acc.rcmOut, r);
    else if (Number(r.rate) === 0) add(acc.nil, r);
    else if (r.b2b) add(acc.b2b, r);
    else add(acc.b2c, r);
  }
  return acc;
}

// One pass over the FY's inward (is_input=true) tax rows for Pt III ITC, split
// into inputs/capital-goods is approximated as "inputs" (the books don't tag
// capital goods separately), RCM inward, and blocked/ineligible (s.17(5)).
async function fyInwardBuckets(tenantId, fy) {
  const { from, to } = fyRange(fy);
  const { rows } = await pool.query(
    `SELECT te.supply_type, te.tax_kind, COALESCE(SUM(te.tax_amount),0) AS amt
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=true
      GROUP BY te.supply_type, te.tax_kind`,
    [tenantId, from, to]
  );
  const inputs = zeroHeads(), rcm = zeroHeads(), blocked = zeroHeads();
  for (const r of rows) {
    if (!HEADS.includes(r.tax_kind)) continue;
    const tgt = r.supply_type === "BLOCKED" ? blocked : r.supply_type === "RCM" ? rcm : inputs;
    tgt[r.tax_kind] = tgt[r.tax_kind].plus(r.amt);
  }
  return { inputs, rcm, blocked };
}

// Advances on which tax was paid but invoice not yet raised in the FY (4F / AT).
async function fyAdvanceTax(tenantId, fy) {
  const { from, to } = fyRange(fy);
  const { rows } = await pool.query(
    `SELECT te.tax_kind, COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount),0) AS amt
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=false AND te.supply_type='ADVANCE'
      GROUP BY te.tax_kind`,
    [tenantId, from, to]
  );
  const heads = zeroHeads(); let taxable = money(0);
  for (const r of rows) { if (HEADS.includes(r.tax_kind)) heads[r.tax_kind] = heads[r.tax_kind].plus(r.amt); taxable = taxable.plus(r.taxable); }
  // taxable double-counts across CGST+IGST rows above; recompute cleanly.
  const { rows: tx } = await pool.query(
    `SELECT COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=false AND te.supply_type='ADVANCE'`,
    [tenantId, from, to]
  );
  return { taxable: money(tx[0].taxable), ...heads };
}

// Full GSTR-9 annual return for an FY. `opts` carries the figures the books can't
// derive (see header). Output is portal/offline-tool JSON shaped (gstin, fp, gt …
// + the numbered tables) alongside a readable per-table breakdown.
async function gstr9(tenantId, fy, opts = {}) {
  const { from, to } = fyRange(fy);
  const out = await fyOutwardBuckets(tenantId, fy);
  const inw = await fyInwardBuckets(tenantId, fy);
  const adv = await fyAdvanceTax(tenantId, fy);
  const hsnOut = await hsnSummaryRange(tenantId, from, to, false);
  const hsnIn = await hsnSummaryRange(tenantId, from, to, true);
  const { rows: tp } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const [, fyEnd] = String(fy).split("-");

  // Pt II — Table 4: outward on which tax is payable.
  const t4 = {
    "4A_b2c": bkt(out.b2c), "4B_b2b": bkt(out.b2b), "4C_exports": bkt(out.export),
    "4D_sez": bkt(out.sez), "4E_deemed": bkt(headsFrom(opts.deemedExport)),
    "4F_advances": bkt(adv), "4G_rcm_payable": bkt(out.rcmOut),
    "4I_credit_notes": bkt(out.creditNotes), "4J_debit_notes": bkt(out.debitNotes),
  };
  // 4N = 4A..4G + 4K(amend up) − 4I − 4J + 4L(amend down)… we keep the books-side net.
  const t4Net = sumBkts([out.b2c, out.b2b, out.export, out.sez, headsFrom(opts.deemedExport), adv, out.rcmOut, out.debitNotes], [out.creditNotes]);
  t4["4N_total"] = bkt(t4Net);

  // Pt II — Table 5: outward on which tax is NOT payable (exports w/o pay, SEZ w/o pay,
  // nil/exempt/non-GST). Books don't separate with/without LUT, so 5A/5B mirror exports/SEZ.
  const t5 = {
    "5A_exports_no_tax": { taxable: toRupees(out.export.taxable) },
    "5B_sez_no_tax": { taxable: toRupees(out.sez.taxable) },
    "5D_nil_exempt": { taxable: toRupees(out.nil.taxable) },
    "5N_total": { taxable: toRupees(money(out.export.taxable).plus(out.sez.taxable).plus(out.nil.taxable)) },
  };

  // Pt III — Table 6: ITC availed (6A auto from 3B, 6B inputs, 6C/6D RCM, 6O total).
  const t6Avail = sumHeads([inw.inputs, inw.rcm]);
  const t6 = {
    "6A_as_per_3b": headsToRupees(t6Avail),
    "6B_inputs": headsToRupees(inw.inputs),
    "6C_rcm_unregistered": headsToRupees(headsFrom(opts.rcmUnregistered)),
    "6D_rcm_registered": headsToRupees(inw.rcm),
    "6O_total": headsToRupees(t6Avail),
  };
  // Table 7 — ITC reversed / ineligible (7A..7H reversals + 7E s.17(5) blocked, 7J total).
  const t7Total = sumHeads([inw.blocked, headsFrom(opts.itcReversedOther)]);
  const t7 = {
    "7E_blocked_17_5": headsToRupees(inw.blocked),
    "7H_other_reversal": headsToRupees(headsFrom(opts.itcReversedOther)),
    "7J_total_reversed": headsToRupees(t7Total),
  };
  // Table 8 — ITC reconciliation vs GSTR-2A (8A = auto-drafted 2A from opts).
  const t8A = headsFrom(opts.itcAsPer2A);
  const t8B = subHeads(t6Avail, t7Total); // net ITC availed
  const t8 = {
    "8A_itc_as_per_2a": headsToRupees(t8A),
    "8B_itc_availed_net": headsToRupees(t8B),
    "8D_difference": headsToRupees(subHeads(t8A, t8B)),
  };

  // Pt IV — Table 9: tax paid during the year (liability vs paid via challans).
  const liabilityPaid = await fyTaxPaid(tenantId, fy);
  const t9 = {
    "9_payable": headsToRupees(liabilityPaid.payable),
    "9_paid_cash": headsToRupees(liabilityPaid.paid),
    "9_paid_itc": headsToRupees(liabilityPaid.viaItc),
  };

  // Pt V — Tables 10-14: transactions of THIS FY declared in NEXT FY's returns
  // (Apr–Sep). The books can't know future filings → caller-supplied, default 0.
  const ptV = {
    "10_supplies_declared_next_fy": bkt(headsFrom(opts.amendNextFyAddOutward)),
    "11_supplies_reduced_next_fy": bkt(headsFrom(opts.amendNextFyReduceOutward)),
    "12_itc_reversed_next_fy": headsToRupees(headsFrom(opts.amendNextFyReverseItc)),
    "13_itc_availed_next_fy": headsToRupees(headsFrom(opts.amendNextFyAvailItc)),
  };

  // Pt VI — Tables 15-18: demands/refunds, late fee, HSN inward/outward.
  const ptVI = {
    "15_demands_refunds": {
      refundClaimed: headsToRupees(headsFrom(opts.refundClaimed)),
      refundSanctioned: headsToRupees(headsFrom(opts.refundSanctioned)),
      demandRaised: headsToRupees(headsFrom(opts.demandRaised)),
    },
    "16_other": {
      compositionSupplies: headsToRupees(headsFrom(opts.compositionSupplies)),
      deemedSupply143: headsToRupees(headsFrom(opts.deemedSupply143)),
      goodsOnApproval: headsToRupees(headsFrom(opts.goodsOnApproval)),
      lateFee: headsToRupees(headsFrom(opts.lateFee)),
    },
    "17_hsn_outward": hsnOut.rows,
    "18_hsn_inward": hsnIn.rows,
  };

  // Portal/offline-tool envelope: numbered tables + gross turnover.
  const portalJson = {
    gstin: (tp[0] && tp[0].gstin) || null,
    fp: fyEnd, // FY-end year, as the GSTR-9 envelope uses
    gt: toRupees(t4Net.taxable),
    sec4: t4, sec5: t5, sec6: t6, sec7: t7, sec8: t8, sec9: t9,
    sec10_14: ptV, sec15_18: ptVI,
  };

  return {
    financialYear: fy,
    partII_outward: { table4_taxable: t4, table5_nonTaxable: t5 },
    partIII_itc: { table6_availed: t6, table7_reversed: t7, table8_reconciliation: t8 },
    partIV_taxPaid: { table9: t9 },
    partV_amendments: ptV,
    partVI_other: ptVI,
    portalJson,
  };
}

// Helpers for GSTR-9 heads math.
function bkt(b) { return { taxable: toRupees(b.taxable || 0), ...headsToRupees(b) }; }
function sumBkts(adds, subs = []) {
  const t = { taxable: money(0), ...zeroHeads() };
  for (const b of adds) { t.taxable = t.taxable.plus(b.taxable || 0); for (const k of HEADS) t[k] = t[k].plus(b[k] || 0); }
  for (const b of subs) { t.taxable = t.taxable.minus(b.taxable || 0); for (const k of HEADS) t[k] = t[k].minus(b[k] || 0); }
  return t;
}
function sumHeads(arr) { const t = zeroHeads(); for (const h of arr) for (const k of HEADS) t[k] = t[k].plus(h[k] || 0); return t; }
function subHeads(a, b) { const t = zeroHeads(); for (const k of HEADS) t[k] = money(a[k] || 0).minus(b[k] || 0); return t; }

// Tax payable (GSTR-3B style, output − ITC, floored at 0 per head) vs cash paid
// (challans) for the whole FY; the balance is treated as discharged via ITC.
async function fyTaxPaid(tenantId, fy) {
  const { from, to } = fyRange(fy);
  const { rows } = await pool.query(
    `SELECT te.tax_kind, te.is_input, COALESCE(SUM(te.tax_amount),0) AS amt
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 GROUP BY te.tax_kind, te.is_input`,
    [tenantId, from, to]
  );
  const outp = zeroHeads(), itc = zeroHeads();
  for (const r of rows) { if (!HEADS.includes(r.tax_kind)) continue; (r.is_input ? itc : outp)[r.tax_kind] = (r.is_input ? itc : outp)[r.tax_kind].plus(r.amt); }
  const payable = zeroHeads();
  for (const k of HEADS) { const net = outp[k].minus(itc[k]); payable[k] = net.greaterThan(0) ? net : money(0); }
  const { rows: ch } = await pool.query(
    `SELECT COALESCE(SUM(cgst),0) AS cgst, COALESCE(SUM(sgst),0) AS sgst, COALESCE(SUM(igst),0) AS igst, COALESCE(SUM(cess),0) AS cess
       FROM book_gst_challans WHERE tenant_id=$1 AND status='PAID' AND period LIKE $2`,
    [tenantId, `${String(fy).split("-")[0]}-%`] // best-effort: challans for the FY-start year + spillover
  );
  const paid = headsFrom({ cgst: ch[0].cgst, sgst: ch[0].sgst, igst: ch[0].igst, cess: ch[0].cess });
  const viaItc = zeroHeads();
  for (const k of HEADS) { const v = payable[k].minus(paid[k]); viaItc[k] = v.greaterThan(0) ? v : money(0); }
  return { payable, paid, viaItc, outputTax: outp, itc };
}

// HSN summary over an explicit date range (outward or inward), used by GSTR-9 17/18.
async function hsnSummaryRange(tenantId, from, to, isInput) {
  const { rows } = await pool.query(
    `SELECT te.hsn_sac AS hsn, te.rate,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='IGST'),0) AS igst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CESS'),0) AS cess
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=$4
      GROUP BY te.hsn_sac, te.rate ORDER BY te.hsn_sac`,
    [tenantId, from, to, !!isInput]
  );
  return { rows: rows.map((r) => ({ hsn: r.hsn || "", rate: Number(r.rate), taxable: toRupees(r.taxable), cgst: toRupees(r.cgst), sgst: toRupees(r.sgst), igst: toRupees(r.igst), cess: toRupees(r.cess), totalTax: toRupees(money(r.cgst).plus(r.sgst).plus(r.igst).plus(r.cess)) })) };
}

// ── GSTR-9C — reconciliation statement (skeleton) ─────────────────────────────
// Reconciles the audited annual financial statements (caller-supplied) against
// the GSTR-9 already computed above: turnover (Pt II, tables 5-8), taxable-turnover
// + tax (Pt III, tables 9-11), and ITC (Pt IV, tables 12-16). The books fill the
// "as per returns" side; the audited side and adjustments come from `audited`.
async function gstr9c(tenantId, fy, audited = {}) {
  const nine = await gstr9(tenantId, fy);
  const { rows: tp } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1", [tenantId]);

  const turnoverPerReturns = money(nine.portalJson.gt);
  const auditedTurnover = money(audited.auditedTurnover || 0);
  // Sum of all adjustment lines the caller declares (unbilled rev, deemed supply, credit notes, etc.).
  const adjList = Array.isArray(audited.turnoverAdjustments) ? audited.turnoverAdjustments : [];
  const adjTotal = adjList.reduce((a, x) => a.plus(money(x.amount || 0)), money(0));

  const taxableTurnoverPerReturns = money(
    nine.partII_outward.table4_taxable["4N_total"].taxable
  );

  // ITC: availed (per returns, net) vs ITC booked in audited accounts.
  const itcPerReturns = nine.partIII_itc.table8_reconciliation["8B_itc_availed_net"];
  const itcPerReturnsTotal = HEADS.reduce((a, k) => a.plus(money(itcPerReturns[k.toLowerCase()])), money(0));
  const itcPerAccounts = money(audited.itcPerAccounts || 0);

  // Tax payable per recon vs tax paid (Pt V — table 9 paid).
  const t9 = nine.partIV_taxPaid.table9;
  const taxPaidPerReturns = HEADS.reduce((a, k) => a.plus(money(t9["9_paid_cash"][k.toLowerCase()])).plus(money(t9["9_paid_itc"][k.toLowerCase()])), money(0));

  return {
    financialYear: fy,
    gstin: (tp[0] && tp[0].gstin) || null,
    // Pt II — turnover reconciliation (tables 5-7) + reasons (8).
    turnoverReconciliation: {
      "5A_audited_turnover": toRupees(auditedTurnover),
      "5_adjustments": adjList.map((x) => ({ label: x.label || "", amount: toRupees(x.amount || 0) })),
      "5O_total_adjustments": toRupees(adjTotal),
      "5P_turnover_after_adjustments": toRupees(auditedTurnover.plus(adjTotal)),
      "5Q_turnover_per_returns": toRupees(turnoverPerReturns),
      "6_unreconciled": toRupees(auditedTurnover.plus(adjTotal).minus(turnoverPerReturns)),
      "7_taxable_turnover_per_returns": toRupees(taxableTurnoverPerReturns),
      "8_reasons": audited.turnoverReasons || [],
    },
    // Pt III — reconciliation of tax paid (tables 9-11).
    taxPaidReconciliation: {
      "9_tax_payable_audited": toRupees(money(audited.taxPayableAudited || 0)),
      "9_tax_paid_per_returns": toRupees(taxPaidPerReturns),
      "10_unreconciled_tax": toRupees(money(audited.taxPayableAudited || 0).minus(taxPaidPerReturns)),
      "11_reasons": audited.taxReasons || [],
    },
    // Pt IV — reconciliation of ITC (tables 12-16).
    itcReconciliation: {
      "12_itc_per_accounts": toRupees(itcPerAccounts),
      "14_itc_per_returns": toRupees(itcPerReturnsTotal),
      "15_unreconciled_itc": toRupees(itcPerAccounts.minus(itcPerReturnsTotal)),
      "16_reasons": audited.itcReasons || [],
    },
    // Pt V — auditor's recommendation on additional liability (caller-supplied).
    auditorRecommendation: headsToRupees(headsFrom(audited.additionalLiability)),
    sourceGstr9: nine.portalJson,
  };
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

// ── GSTR-1 extra subsections ──────────────────────────────────────────────────

// AT (Table 11A) — advances received on which tax is payable but no invoice was
// raised in the period; TXPD (Table 11B) — advance adjusted against invoices of
// the period. Both are derived from the supply_type='ADVANCE' outward tax rows,
// grouped by place-of-supply × rate, the way the offline tool expects (pos/sply
// ty/rate). AT and TXPD share the same SQL shape; we expose both keys so a caller
// can net them — the books emit advance receipts (AT); adjustments are passed in.
async function gstr1Advances(tenantId, period, adjustments = []) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT te.place_of_supply AS pos, te.rate,
            COALESCE(SUM(te.taxable_value) FILTER (WHERE te.tax_kind IN ('CGST','IGST')),0) AS taxable,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CGST'),0) AS cgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='SGST'),0) AS sgst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='IGST'),0) AS igst,
            COALESCE(SUM(te.tax_amount) FILTER (WHERE te.tax_kind='CESS'),0) AS cess
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false AND v.voucher_date BETWEEN $2 AND $3
      WHERE te.tenant_id=$1 AND te.is_input=false AND te.supply_type='ADVANCE'
      GROUP BY te.place_of_supply, te.rate ORDER BY te.place_of_supply, te.rate`,
    [tenantId, from, to]
  );
  const at = rows.map((r) => ({ pos: r.pos || null, rate: Number(r.rate), taxable: toRupees(r.taxable), cgst: toRupees(r.cgst), sgst: toRupees(r.sgst), igst: toRupees(r.igst), cess: toRupees(r.cess) }));
  // TXPD (advance adjusted) — caller supplies adjustments [{pos,rate,taxable,...}] since
  // the books don't link an advance to the later invoice. Normalised to the AT shape.
  const txpd = (adjustments || []).map((a) => ({ pos: a.pos || null, rate: Number(a.rate || 0), taxable: toRupees(a.taxable || 0), cgst: toRupees(a.cgst || 0), sgst: toRupees(a.sgst || 0), igst: toRupees(a.igst || 0), cess: toRupees(a.cess || 0) }));
  return { period, at, txpd };
}

// DOC_ISSUE (Table 13) — document-series ranges issued in the period. Best-effort
// auto-population: for each outward voucher_type we report the min/max
// voucher_number actually used as one series, plus cancelled count. Caller may
// pass `extra` ranges (manual series the books don't number, e.g. delivery challans).
const DOC_ISSUE_NATURES = {
  SALES: 1,       // 1 — Invoices for outward supply
  CREDIT_NOTE: 5, // 5 — Credit note
  DEBIT_NOTE: 6,  // 6 — Debit note
  RECEIPT: 10,    // 10 — Receipt voucher (advances)
};
async function gstr1DocIssue(tenantId, period, extra = []) {
  const { from, to } = monthRange(period);
  const { rows } = await pool.query(
    `SELECT v.voucher_type,
            MIN(v.voucher_number) AS from_no, MAX(v.voucher_number) AS to_no,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE v.is_cancelled)::int AS cancelled
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.voucher_date BETWEEN $2 AND $3
        AND v.voucher_type IN ('SALES','CREDIT_NOTE','DEBIT_NOTE','RECEIPT')
      GROUP BY v.voucher_type`,
    [tenantId, from, to]
  );
  const docs = rows.map((r) => ({
    natureOfDocument: DOC_ISSUE_NATURES[r.voucher_type] || 0,
    docType: r.voucher_type,
    from: String(r.from_no), to: String(r.to_no),
    totalNumber: r.total, cancelled: r.cancelled, net: r.total - r.cancelled,
  }));
  for (const e of (extra || [])) docs.push({
    natureOfDocument: e.natureOfDocument || 0, docType: e.docType || "OTHER",
    from: String(e.from || ""), to: String(e.to || ""),
    totalNumber: Number(e.totalNumber || 0), cancelled: Number(e.cancelled || 0),
    net: Number(e.totalNumber || 0) - Number(e.cancelled || 0),
  });
  return { period, docs };
}

// SUPECOM (Table 14/15) — supplies made THROUGH an e-commerce operator on which
// the operator collects TCS (u/s 52) or pays tax (u/s 9(5)). The books don't tag
// the operator on a sale, so this is caller-supplied per operator GSTIN, summed
// and normalised. Each entry: { operatorGstin, supplyType:'TCS'|'9(5)', taxable, cgst, sgst, igst, cess }.
function gstr1Ecommerce(period, entries = []) {
  const byOp = new Map();
  for (const e of (entries || [])) {
    const key = `${(e.operatorGstin || "").toUpperCase()}|${e.supplyType || "TCS"}`;
    const cur = byOp.get(key) || { operatorGstin: (e.operatorGstin || "").toUpperCase(), supplyType: e.supplyType || "TCS", taxable: money(0), cgst: money(0), sgst: money(0), igst: money(0), cess: money(0) };
    cur.taxable = cur.taxable.plus(e.taxable || 0); cur.cgst = cur.cgst.plus(e.cgst || 0);
    cur.sgst = cur.sgst.plus(e.sgst || 0); cur.igst = cur.igst.plus(e.igst || 0); cur.cess = cur.cess.plus(e.cess || 0);
    byOp.set(key, cur);
  }
  return {
    period,
    supecom: [...byOp.values()].map((c) => ({ operatorGstin: c.operatorGstin, supplyType: c.supplyType, taxable: toRupees(c.taxable), cgst: toRupees(c.cgst), sgst: toRupees(c.sgst), igst: toRupees(c.igst), cess: toRupees(c.cess) })),
  };
}

// Amendment tables (B2BA/B2CLA/B2CSA/CDNRA/CDNURA/EXPA/ATA/TXPDA) — corrections to
// invoices/notes/advances ALREADY filed in an earlier period. The books store one
// authoritative figure per voucher (no original-vs-amended versioning), so an
// amendment is necessarily caller-supplied: each item carries the original
// reference (oinum/oinvno/odt or original pos+rate) plus the revised values. We
// validate the shape and normalise money; we do NOT invent amendments from books.
const AMEND_TABLES = ["b2ba", "b2cla", "b2csa", "cdnra", "cdnura", "expa", "ata", "txpda"];
function gstr1Amendments(period, amendments = {}) {
  const norm = (x) => ({
    // original-period locator (whichever the table uses)
    originalPeriod: x.originalPeriod || x.opd || null,
    originalGstin: x.originalGstin || x.oct || null,
    originalInvoiceNo: x.originalInvoiceNo || x.oinum || null,
    originalInvoiceDate: x.originalInvoiceDate || x.oidt || null,
    originalPos: x.originalPos || x.opos || null,
    // revised values
    gstin: x.gstin || null, invoiceNo: x.invoiceNo || null, invoiceDate: x.invoiceDate || null,
    pos: x.pos || null, rate: x.rate != null ? Number(x.rate) : null,
    taxable: toRupees(x.taxable || 0), cgst: toRupees(x.cgst || 0), sgst: toRupees(x.sgst || 0),
    igst: toRupees(x.igst || 0), cess: toRupees(x.cess || 0),
    noteType: x.noteType || null,
  });
  const out = { period };
  for (const t of AMEND_TABLES) {
    const arr = Array.isArray(amendments[t]) ? amendments[t] : [];
    for (const item of arr) {
      if (!item || (!item.originalPeriod && !item.opd && !item.originalPos && !item.opos)) {
        throw new PostError("BAD_AMENDMENT", `${t}: each amendment needs an original-period or original-pos reference`, 400);
      }
    }
    out[t] = arr.map(norm);
  }
  return out;
}

// GSTR-1 portal/offline-tool JSON (best-effort to the documented shape). Now also
// carries the extra subsections: doc_issue, at/txpd, supecom and the amendment
// tables. `opts` feeds the parts the books can't derive (see each helper).
async function gstr1Json(tenantId, period, opts = {}) {
  const sec = await gstr1Sections(tenantId, period);
  const hsn = await hsnSummary(tenantId, period);
  const adv = await gstr1Advances(tenantId, period, opts.advanceAdjustments);
  const docIssue = await gstr1DocIssue(tenantId, period, opts.docIssueExtra);
  const ecom = gstr1Ecommerce(period, opts.ecommerce);
  const amend = gstr1Amendments(period, opts.amendments || {});
  const { rows: tp } = await pool.query("SELECT gstin FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const [y, m] = String(period).split("-");
  return {
    gstin: (tp[0] && tp[0].gstin) || null, fp: `${m}${y}`, version: "GST3.0", hash: "hash",
    // existing sections — intact
    b2b: sec.b2b, b2cl: sec.b2cl, b2cs: sec.b2cs, cdnr: sec.cdnr, exp: sec.exp, hsn: { data: hsn.rows },
    // new subsections
    doc_issue: { doc_det: docIssue.docs }, at: adv.at, txpd: adv.txpd,
    supecom: ecom.supecom,
    // amendment tables
    b2ba: amend.b2ba, b2cla: amend.b2cla, b2csa: amend.b2csa, cdnra: amend.cdnra,
    cdnura: amend.cdnura, expa: amend.expa, ata: amend.ata, txpda: amend.txpda,
  };
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

module.exports = { monthRange, fyRange, gstr1, gstr3b, gstr2bReconcile, gstr2bMatch, gstr9, gstr9c, deductionReport, derivePlaceOfSupply, gstr1Sections, hsnSummary, hsnSummaryRange, gstr1Advances, gstr1DocIssue, gstr1Ecommerce, gstr1Amendments, gstr1Json, setGstRate, getGstRate, listGstRates, recordChallan, listChallans, gstLiabilityVsPaid, blockedItcSummary };
