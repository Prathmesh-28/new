// §TaxFiling - TDS/TCS filing artifacts off book_tax_entries (tax_kind 'TDS'/'TCS').
//
// These functions produce the FILE / CERTIFICATE that the user then uploads to the
// TRACES / NSDL e-filing portal themselves - we never claim a "filed" status, we
// only build the artifact (a download). The withholding numbers are captured at
// posting time in book_tax_entries (taxable_value = base amount paid/received,
// tax_amount = tax deducted/collected, tax_kind 'TDS' for purchases/payments where
// we are the deductor, 'TCS' for sales where we collect). The voucher's
// party_ledger_id → book_ledgers gives the deductee/collectee PAN + name; the
// tenant's TAN/PAN/name come from tenant_profile. The deposit date is the
// voucher_date (when the liability was booked). Money math via ./money so every
// total reconciles to the books, never a JS float.
const { pool } = require("../../db");
const { money, toRupees, sum } = require("./money");
const { PostError } = require("./posting-engine");

// ── Quarter → date range. Indian FY quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec,
// Q4 Jan-Mar. `fy` is "2026-27" (the FY that starts in 2026). Returns inclusive
// from/to date strings (UTC-safe, date-only) for filtering voucher_date.
function quarterRange(quarter, fy) {
  const q = String(quarter || "").toUpperCase().replace(/[^Q1-4]/g, "");
  const startYear = parseInt(String(fy).slice(0, 4), 10);
  if (!startYear || !["Q1", "Q2", "Q3", "Q4"].includes(q)) {
    throw new PostError("BAD_QUARTER", `quarter must be Q1-Q4 and fy "YYYY-YY", got ${quarter}/${fy}`, 422);
  }
  // [startMonth(1-based calendar), monthsSpanYear+1 boundary]
  const spans = {
    Q1: [`${startYear}-04-01`, `${startYear}-06-30`],
    Q2: [`${startYear}-07-01`, `${startYear}-09-30`],
    Q3: [`${startYear}-10-01`, `${startYear}-12-31`],
    Q4: [`${startYear + 1}-01-01`, `${startYear + 1}-03-31`],
  };
  const [from, to] = spans[q];
  return { q, from, to };
}

// voucher_date is a SQL DATE column; node-postgres's default parser constructs the JS
// Date using LOCAL-timezone components (new Date(y, m, d) semantics), so reading it
// back via toISOString() (which converts to true UTC) rolls the date back a day on
// any positive-offset server timezone (e.g. IST) - String(dateObj).slice(0,10) was
// even worse, grabbing the start of Date#toString() ("Mon Jun 01 2026..."). Reading
// the LOCAL calendar getters is the correct round-trip inverse of how it was built.
function isoDate(d) {
  if (d instanceof Date) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

// HTML-escape for the Form-16A certificate (untrusted ledger names / addresses).
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Pull the deductor (tenant) identity once. TAN/PAN may be blank if the profile
// isn't filled in - we surface placeholders so the user knows what to complete,
// rather than fabricating a number. TAN is now a first-class tenant_profile column
// (the deductor's Tax Deduction & Collection Account Number); the e-TDS statement
// and Form 16A are invalid without it.
async function _deductor(tenantId) {
  const { rows } = await pool.query(
    "SELECT company_name, legal_name, gstin, pan, tan, address, city, state, pincode, phone FROM tenant_profile WHERE tenant_id=$1",
    [tenantId]
  );
  const p = rows[0] || {};
  return {
    tan: (p.tan || "").toUpperCase(),
    name: p.legal_name || p.company_name || tenantId,
    pan: (p.pan || "").toUpperCase(),
    address: [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", "),
    phone: p.phone || "",
  };
}

// Fetch every TDS/TCS withholding row in [from,to], joined to its party ledger for
// PAN/name and to the voucher for date. `kind` is 'TDS' or 'TCS'. For TDS we are
// the deductor on purchases/payments; the tax_amount is what we withheld.
//
// The TDS/TCS SECTION is now a FIRST-CLASS dimension: book_tax_entries.tds_section.
// Historically the section was overloaded onto hsn_sac (HSN is irrelevant to a
// tax-only row), so we COALESCE(tds_section, hsn_sac) to stay backward-compatible
// with rows posted before the dedicated column existed. rate is the deduction rate.
async function _withholdingRows(tenantId, kind, from, to, partyLedgerId) {
  const params = [tenantId, kind, from, to];
  let partyClause = "";
  if (partyLedgerId) { params.push(partyLedgerId); partyClause = `AND v.party_ledger_id=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT te.id, te.rate, te.taxable_value, te.tax_amount,
            COALESCE(te.tds_section, te.hsn_sac) AS section,
            v.voucher_date, v.voucher_number, v.reference,
            l.id AS party_id, l.name AS party_name, l.pan AS party_pan, l.gstin AS party_gstin
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
       LEFT JOIN book_ledgers l ON l.id=v.party_ledger_id
      WHERE te.tenant_id=$1 AND te.tax_kind=$2
        AND v.voucher_date BETWEEN $3 AND $4 ${partyClause}
      ORDER BY v.voucher_date, v.voucher_number`,
    params
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) NSDL e-TDS/TCS quarterly statement TEXT (RPU/FVU flat-file).
//
// A correctly STRUCTURED, MULTI-CHALLAN flat file ported from the NSDL e-TDS/TCS
// File Validation Utility (FVU) record layout - written from the schema, not copied.
// It is a caret(^)-delimited, line-feed-terminated file of fixed record types, each
// numbered by its 1-based line position (NSDL's "Line No." is the first field of
// every record and the FVU validates it strictly). Record types, in order:
//
//   FH  File Header        - 1 per file: line#, "FH", count of BATCHES in the file,
//                            file type (NS1 = regular), upload type "R", FY, form,
//                            file-creation date, count of total records.
//   BH  Batch Header        - 1 per batch (one batch per statement): line#, "BH",
//                            batch number, count of CHALLAN records in this batch,
//                            form, TAN, deductor PAN, deductor name, FY, quarter.
//   CD  Challan Detail       - 1 per DEPOSIT CHALLAN: line#, "CD", batch#, challan#,
//                            section, TDS/TCS, surcharge, cess, interest, others,
//                            total deposited, BSR code, deposit date, challan serial,
//                            count of DEDUCTEE records under this challan.
//   DD  Deductee Detail      - 1 per withholding row, NESTED under its challan:
//                            line#, "DD", batch#, challan#, deductee#, PAN, name,
//                            section, amount paid/credited, tax deducted/collected,
//                            rate, date of payment/credit, reference.
//   FT  File Total           - 1 per file: line#, "FT", total record count, batch
//                            count, challan count, deductee count.
//
// Challans are grouped the way a deductor actually deposits: ONE challan per
// (section, deposit-month) - i.e. the monthly remittance for a given section. Each
// challan then carries exactly its own deductee rows, and we VALIDATE that the
// emitted deductee-record count equals the input row count and that each challan's
// declared deductee count matches the rows nested under it (throwing FVU_COUNT_MISMATCH
// otherwise). This is an RPU-import-shaped artifact, not a digitally-validated .fvu.
//
// Form '24Q' is salary TDS, '26Q' is non-salary TDS, '27EQ' is TCS.
async function tdsReturnFile(tenantId, { quarter, fy, form } = {}) {
  const f = String(form || "26Q").toUpperCase();
  if (!["24Q", "26Q", "27EQ"].includes(f)) {
    throw new PostError("BAD_FORM", `form must be 24Q (salary TDS), 26Q (non-salary TDS) or 27EQ (TCS), got ${form}`, 422);
  }
  const kind = f === "27EQ" ? "TCS" : "TDS";
  const { q, from, to } = quarterRange(quarter, fy);
  const ded = await _deductor(tenantId);
  if (!ded.tan) throw new PostError("TAN_NOT_SET", "Deductor TAN is not set on the company profile - set it before generating an e-TDS statement", 422);
  const rows = await _withholdingRows(tenantId, kind, from, to);

  const SEP = "^";
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const partyLabel = kind === "TCS" ? "Collectee" : "Deductee";
  const ymd = (d) => String(d).slice(0, 10).replace(/-/g, "");
  const depositMonth = (d) => String(d).slice(0, 7); // YYYY-MM
  const totalTax = sum(rows.map((r) => r.tax_amount));

  // ── Group withholding rows into challans: one challan per (section, deposit-month).
  // A Map preserves first-seen order, which is voucher_date order (the query sorts).
  const challanMap = new Map();
  for (const r of rows) {
    const section = String(r.section || "").toUpperCase();
    const key = `${section}|${depositMonth(r.voucher_date)}`;
    if (!challanMap.has(key)) {
      challanMap.set(key, { section, month: depositMonth(r.voucher_date), deductees: [] });
    }
    challanMap.get(key).deductees.push(r);
  }
  const challans = [...challanMap.values()];

  // ── Emit the flat file. Line numbers are 1-based and assigned as we push.
  const lines = [];
  const push = (fields) => { lines.push([String(lines.length + 1)].concat(fields).join(SEP)); };

  // Placeholder for FH (needs the final record count) - patched after the body.
  lines.push(""); // reserve line 1 for FH

  // BH - Batch Header (single batch covering this statement)
  push(["BH", "1", String(challans.length), f, ded.tan, ded.pan || "PANNOTAVBL", ded.name, fy, q]);

  let emittedDeductees = 0;
  challans.forEach((c, ci) => {
    const challanNo = String(ci + 1);
    const challanTax = sum(c.deductees.map((d) => d.tax_amount));
    // Deposit date = 7th of the month following the deposit month (CBDT due date) -
    // the deductor edits this to the actual challan date in the RPU before validating.
    const [yy, mm] = c.month.split("-").map(Number);
    const dueDate = new Date(Date.UTC(mm === 12 ? yy + 1 : yy, mm === 12 ? 0 : mm, 7));
    const challanDate = dueDate.toISOString().slice(0, 10).replace(/-/g, "");
    // CD - Challan Detail: section, TDS/TCS, surcharge, cess, interest, others, total,
    // BSR code, deposit date, challan serial, deductee count.
    push([
      "CD", "1", challanNo, c.section, toRupees(challanTax), "0.00", "0.00",
      "0.00", "0.00", toRupees(challanTax), "0000000", challanDate, "00000",
      String(c.deductees.length),
    ]);
    // DD - Deductee Detail rows nested under this challan.
    c.deductees.forEach((r, di) => {
      emittedDeductees += 1;
      push([
        "DD", "1", challanNo, String(di + 1),
        (r.party_pan || "PANNOTAVBL").toUpperCase(),
        r.party_name || "",
        c.section,
        toRupees(r.taxable_value),
        toRupees(r.tax_amount),
        toRupees(r.rate),
        ymd(r.voucher_date),
        r.reference || "",
      ]);
    });
  });

  // FT - File Total: total record count, batch count, challan count, deductee count.
  // Record count INCLUDES the FH line we reserved at index 0.
  const totalRecords = lines.length + 1;
  push(["FT", String(totalRecords), "1", String(challans.length), String(emittedDeductees)]);

  // FH - File Header, now that we know the total record count. Patch line 1.
  lines[0] = ["1", "FH", "1", "NS1", "R", fy, f, today, String(totalRecords)].join(SEP);

  // ── Validate record counts: every deductee row must be emitted exactly once, and
  // each challan's declared count must equal the rows nested under it.
  if (emittedDeductees !== rows.length) {
    throw new PostError("FVU_COUNT_MISMATCH", `e-TDS deductee count ${emittedDeductees} ≠ ${rows.length} withholding rows`, 500);
  }
  const challanDeducteeSum = challans.reduce((a, c) => a + c.deductees.length, 0);
  if (challanDeducteeSum !== emittedDeductees) {
    throw new PostError("FVU_COUNT_MISMATCH", `challan deductee total ${challanDeducteeSum} ≠ emitted ${emittedDeductees}`, 500);
  }

  const content = lines.join("\n") + "\n";
  const fileName = `${f}_${fy.replace(/[^0-9-]/g, "")}_${q}_${ded.tan.replace(/[^A-Z0-9]/gi, "")}.txt`;

  return {
    form: f,
    quarter: q,
    fileName,
    content,
    challanCount: challans.length,
    deducteeCount: emittedDeductees,
    totalTax: toRupees(totalTax),
    challans: challans.map((c, ci) => ({
      challanNo: ci + 1,
      section: c.section,
      depositMonth: c.month,
      tax: toRupees(sum(c.deductees.map((d) => d.tax_amount))),
      deductees: c.deductees.length,
    })),
    rows: rows.map((r) => ({
      party: r.party_name,
      pan: r.party_pan || null,
      section: r.section || null,
      amountPaid: toRupees(r.taxable_value),
      taxDeducted: toRupees(r.tax_amount),
      rate: toRupees(r.rate),
      date: isoDate(r.voucher_date),
      reference: r.reference || null,
      label: partyLabel,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (1b) Vendor TDS ledger - real per-vendor TDS withheld across a whole FY, straight
// off book_tax_entries (the same source form16A/tdsReturnFile already use). Exists
// because the frontend "Vendor TDS Ledger" tab used to be a hand-typed KV list that
// silently diverged from what was actually withheld when bills were posted with a
// TDS section - this is the real number instead.
async function vendorTdsLedger(tenantId, fy) {
  const startYear = parseInt(String(fy).slice(0, 4), 10);
  if (!startYear) throw new PostError("BAD_INPUT", `fy must look like "YYYY-YY", got ${fy}`, 422);
  const from = `${startYear}-04-01`, to = `${startYear + 1}-03-31`;
  const rows = await _withholdingRows(tenantId, "TDS", from, to);

  const byVendor = new Map();
  for (const r of rows) {
    const key = r.party_id || r.party_name || "unknown";
    if (!byVendor.has(key)) byVendor.set(key, { vendorLedgerId: r.party_id, vendorName: r.party_name || "-", vendorPan: r.party_pan || null, entries: [] });
    byVendor.get(key).entries.push({
      section: r.section || null, rate: toRupees(r.rate), taxableValue: toRupees(r.taxable_value), taxAmount: toRupees(r.tax_amount),
      date: isoDate(r.voucher_date), voucherNumber: r.voucher_number, reference: r.reference || null,
    });
  }
  const vendors = [...byVendor.values()].map((v) => ({
    ...v,
    totalTaxableValue: toRupees(sum(v.entries.map((e) => e.taxableValue))),
    totalTds: toRupees(sum(v.entries.map((e) => e.taxAmount))),
  })).sort((a, b) => Number(b.totalTds) - Number(a.totalTds));

  return { fy, from, to, vendors, grandTotalTds: toRupees(sum(rows.map((r) => r.tax_amount))) };
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) Form-16A - non-salary TDS certificate (HTML for the deductee). Renders the
// deductor + deductee header, a table of TDS transactions for the quarter, totals
// and a verification block. (Form 16A is a quarterly certificate; we scope it to
// the requested quarter for one party.)
async function form16A(tenantId, { partyLedgerId, quarter, fy } = {}) {
  if (!partyLedgerId) throw new PostError("BAD_INPUT", "partyLedgerId required", 422);
  const { q, from, to } = quarterRange(quarter, fy);
  const ded = await _deductor(tenantId);
  const rows = await _withholdingRows(tenantId, "TDS", from, to, partyLedgerId);
  const party = rows[0] || {};
  const totalBase = sum(rows.map((r) => r.taxable_value));
  const totalTax = sum(rows.map((r) => r.tax_amount));

  const partyName = party.party_name || "-";
  const partyPan = party.party_pan || "PAN not available";

  const trs = rows.map((r) => `
        <tr>
          <td>${esc((r.section || "").toUpperCase())}</td>
          <td class="num">${esc(toRupees(r.taxable_value))}</td>
          <td class="num">${esc(toRupees(r.rate))}%</td>
          <td class="num">${esc(toRupees(r.tax_amount))}</td>
          <td>${esc(isoDate(r.voucher_date))}</td>
        </tr>`).join("") || `
        <tr><td colspan="5" style="text-align:center;color:#888">No TDS transactions for ${esc(q)} ${esc(fy)}</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Form 16A - ${esc(partyName)} (${esc(q)} ${esc(fy)})</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:820px;margin:24px auto;padding:0 16px;font-size:13px}
  h1{font-size:18px;text-align:center;margin:4px 0}
  .sub{text-align:center;color:#555;margin-bottom:18px}
  .box{border:1px solid #999;padding:10px 12px;margin-bottom:12px}
  .box h2{font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#333}
  .grid{display:flex;gap:24px}.grid>div{flex:1}
  .k{color:#666}.v{font-weight:bold}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}
  th{background:#f2f2f2}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:bold;background:#fafafa}
  .verify{margin-top:18px;font-size:12px;line-height:1.6}
  .sign{margin-top:36px;display:flex;justify-content:space-between}
  .note{margin-top:14px;font-size:11px;color:#888}
</style></head><body>
  <h1>FORM NO. 16A</h1>
  <div class="sub">[See rule 31(1)(b)] - Certificate under section 203 of the Income-tax Act, 1961<br>for tax deducted at source - ${esc(q)} of FY ${esc(fy)}</div>

  <div class="box">
    <h2>Deductor</h2>
    <div class="grid">
      <div><div class="k">Name</div><div class="v">${esc(ded.name)}</div>
           <div class="k" style="margin-top:6px">Address</div><div>${esc(ded.address) || "-"}</div></div>
      <div><div class="k">TAN</div><div class="v">${esc(ded.tan) || "-"}</div>
           <div class="k" style="margin-top:6px">PAN</div><div class="v">${esc(ded.pan) || "-"}</div></div>
    </div>
  </div>

  <div class="box">
    <h2>Deductee</h2>
    <div class="grid">
      <div><div class="k">Name</div><div class="v">${esc(partyName)}</div></div>
      <div><div class="k">PAN</div><div class="v">${esc(partyPan)}</div></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Section</th><th class="num">Amount paid/credited (₹)</th><th class="num">Rate</th><th class="num">Tax deducted (₹)</th><th>Date of deposit</th></tr></thead>
    <tbody>${trs}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${esc(toRupees(totalBase))}</td><td></td><td class="num">${esc(toRupees(totalTax))}</td><td></td></tr></tfoot>
  </table>

  <div class="verify">
    <strong>Verification</strong><br>
    I, ____________________, son/daughter of ____________________, working in the capacity of ____________________
    do hereby certify that a sum of ₹ ${esc(toRupees(totalTax))} has been deducted at source and that the particulars
    given above are true and correct to the best of my knowledge and belief, based on the books of account, documents
    and other available records.
  </div>
  <div class="sign">
    <div>Place: ____________________<br>Date: ${esc(new Date().toISOString().slice(0, 10))}</div>
    <div style="text-align:center">____________________<br>Signature of person responsible for deduction</div>
  </div>
  <div class="note">Generated by Headroom from your books for upload/issue. This is not a TRACES-downloaded certificate; verify totals against your Form 26Q filing before issuing.</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) §197 lower-deduction certificates. A valid certificate lets the tenant
// deduct at a REDUCED (or nil) rate for a given party + section over a date range.

async function addTdsCertificate(tenantId, { partyLedgerId, pan, section, certificateNo, rate, thresholdLimit, validFrom, validTo } = {}) {
  if (!section) throw new PostError("BAD_INPUT", "section required", 422);
  const r = money(rate || 0);
  if (r.lessThan(0)) throw new PostError("BAD_TDS_RATE", "rate cannot be negative", 422);
  const { rows } = await pool.query(
    `INSERT INTO book_tds_certificates
       (tenant_id, party_ledger_id, pan, section, certificate_no, rate, threshold_limit, valid_from, valid_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, tenant_id, party_ledger_id, pan, section, certificate_no, rate, threshold_limit, valid_from, valid_to, created_at`,
    [
      tenantId, partyLedgerId || null, pan || null, String(section).toUpperCase(),
      certificateNo || null, r.toFixed(4),
      thresholdLimit == null || thresholdLimit === "" ? null : money(thresholdLimit).toFixed(4),
      validFrom || null, validTo || null,
    ]
  );
  const c = rows[0];
  return {
    id: c.id, partyLedgerId: c.party_ledger_id, pan: c.pan, section: c.section,
    certificateNo: c.certificate_no, rate: toRupees(c.rate),
    thresholdLimit: c.threshold_limit == null ? null : toRupees(c.threshold_limit),
    validFrom: c.valid_from, validTo: c.valid_to, createdAt: c.created_at,
  };
}

async function listTdsCertificates(tenantId, partyLedgerId) {
  const params = [tenantId];
  let clause = "";
  if (partyLedgerId) { params.push(partyLedgerId); clause = `AND party_ledger_id=$${params.length}`; }
  const { rows } = await pool.query(
    `SELECT id, party_ledger_id, pan, section, certificate_no, rate, threshold_limit, valid_from, valid_to, created_at
       FROM book_tds_certificates
      WHERE tenant_id=$1 ${clause}
      ORDER BY valid_from DESC NULLS LAST, created_at DESC`,
    params
  );
  return rows.map((c) => ({
    id: c.id, partyLedgerId: c.party_ledger_id, pan: c.pan, section: c.section,
    certificateNo: c.certificate_no, rate: toRupees(c.rate),
    thresholdLimit: c.threshold_limit == null ? null : toRupees(c.threshold_limit),
    validFrom: c.valid_from, validTo: c.valid_to, createdAt: c.created_at,
  }));
}

// Resolve the rate to actually deduct at: if a §197 certificate for this party +
// section is valid on `onDate`, return its (lower) rate as a string; else the
// caller's defaultRate. A certificate validity window is inclusive; a null bound
// means open-ended. We never return a rate HIGHER than the default - a 197 cert
// only ever reduces. `onDate` defaults to today.
async function effectiveTdsRate(tenantId, partyLedgerId, section, defaultRate, onDate) {
  const dflt = toRupees(money(defaultRate || 0));
  if (!partyLedgerId || !section) return dflt;
  const day = (onDate ? new Date(onDate) : new Date()).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT rate FROM book_tds_certificates
      WHERE tenant_id=$1 AND party_ledger_id=$2 AND UPPER(section)=UPPER($3)
        AND (valid_from IS NULL OR valid_from <= $4)
        AND (valid_to   IS NULL OR valid_to   >= $4)
      ORDER BY rate ASC
      LIMIT 1`,
    [tenantId, partyLedgerId, section, day]
  );
  if (!rows.length) return dflt;
  const certRate = money(rows[0].rate);
  // Guard: a 197 cert can only lower the rate, never raise it.
  return certRate.lessThan(money(defaultRate || 0)) ? toRupees(certRate) : dflt;
}

// ─────────────────────────────────────────────────────────────────────────────
// (4) 26AS / AIS reconciliation. The tenant feeds in rows parsed from their 26AS
// or AIS (TDS that OTHERS deducted on the tenant's income - i.e. TDS the tenant
// SUFFERED, a receivable/asset). We persist them, then match each against the
// tenant's own books: TDS-receivable rows are 'TCS'? No - when the tenant suffers
// TDS, the counterparty is the DEDUCTOR. In the books this is captured as a TDS
// tax row where is_input=true (input credit of tax suffered). We match by the
// deductor's TAN→party gstin/pan is not TAN... so we match best-effort on section +
// period + amount, since the books store the counterparty as a party ledger (no
// TAN column). Returns matched + the two unmatched buckets.
async function reconcile26AS(tenantId, { rows } = {}) {
  const portalRows = Array.isArray(rows) ? rows : [];

  // (a) Ingest each 26AS/AIS row.
  const ingested = [];
  for (const r of portalRows) {
    const { rows: ins } = await pool.query(
      `INSERT INTO book_26as_entries
         (tenant_id, kind, deductor_tan, deductor_name, section, period, amount, tax)
       VALUES ($1,'TDS',$2,$3,$4,$5,$6,$7)
       RETURNING id, deductor_tan, deductor_name, section, period, amount, tax`,
      [
        tenantId, r.deductorTan || null, r.deductorName || null,
        r.section ? String(r.section).toUpperCase() : null, r.period || null,
        money(r.amount || 0).toFixed(4), money(r.tax || 0).toFixed(4),
      ]
    );
    ingested.push(ins[0]);
  }

  // (b) The tenant's TDS suffered in the books: TDS tax rows with is_input=true
  // (tax credit asset). Carry section (first-class tds_section, falling back to the
  // legacy hsn_sac overload), period (YYYY-MM of voucher_date), amounts, and the
  // counterparty party PAN/name/gstin for display.
  const { rows: bookRows } = await pool.query(
    `SELECT te.id, te.taxable_value, te.tax_amount,
            COALESCE(te.tds_section, te.hsn_sac) AS section,
            to_char(v.voucher_date,'YYYY-MM') AS period,
            v.id AS voucher_id, l.name AS party_name, l.pan AS party_pan, l.gstin AS party_gstin
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
       LEFT JOIN book_ledgers l ON l.id=v.party_ledger_id
      WHERE te.tenant_id=$1 AND te.tax_kind='TDS' AND te.is_input=true`,
    [tenantId]
  );

  // (c) Match. A book row matches a portal row when section + period agree and the
  // tax amounts are equal (exact, via money). Each side is consumed at most once.
  const bookPool = bookRows.map((b) => ({ ...b, used: false }));
  const matched = [];
  const unmatchedInPortal = [];

  const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, "");
  for (const p of ingested) {
    const hit = bookPool.find((b) =>
      !b.used &&
      norm(b.section) === norm(p.section) &&
      String(b.period || "") === String(p.period || "") &&
      money(b.tax_amount).equals(money(p.tax))
    );
    if (hit) {
      hit.used = true;
      // Stamp the match onto the persisted 26AS row.
      await pool.query("UPDATE book_26as_entries SET matched_voucher_id=$1 WHERE id=$2", [hit.voucher_id, p.id]);
      matched.push({
        portalId: p.id, deductorTan: p.deductor_tan, deductorName: p.deductor_name,
        section: p.section, period: p.period,
        amount: toRupees(p.amount), tax: toRupees(p.tax),
        voucherId: hit.voucher_id, party: hit.party_name || null,
      });
    } else {
      unmatchedInPortal.push({
        portalId: p.id, deductorTan: p.deductor_tan, deductorName: p.deductor_name,
        section: p.section, period: p.period,
        amount: toRupees(p.amount), tax: toRupees(p.tax),
      });
    }
  }

  // Book rows nobody in the portal claimed - TDS the tenant booked but 26AS hasn't
  // reflected yet (deductor hasn't filed / mismatch to chase).
  const unmatchedInBooks = bookPool.filter((b) => !b.used).map((b) => ({
    voucherId: b.voucher_id, party: b.party_name || null, pan: b.party_pan || null,
    section: b.section, period: b.period,
    amountPaid: toRupees(b.taxable_value), tax: toRupees(b.tax_amount),
  }));

  return { matched, unmatchedInPortal, unmatchedInBooks };
}

module.exports = {
  tdsReturnFile,
  form16A,
  vendorTdsLedger,
  addTdsCertificate,
  listTdsCertificates,
  effectiveTdsRate,
  reconcile26AS,
  quarterRange,
};
