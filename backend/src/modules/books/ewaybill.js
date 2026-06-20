// §9.4 — E-way bill (EWB). Mirrors einvoice.js: an EWB is generated via the GSP/ASP
// rail, and without GSP credentials we stay an honest "not configured" stub — we NEVER
// fabricate an EWB number. Logic ported from ERPNext India (erpnext/regional/india,
// e_invoice/e_waybill) + the NIC EWB API shape, but this is our own code.
//
// Shape recap (NIC EWB / ERPNext):
//   • supplyType OUTWARD (sales), subSupplyType SUPPLY (1), docType INV
//   • Part-A = doc no/date, from/to GSTIN + state + pincode, item HSN list with
//     taxable + tax, transporter id, distance. Always required to generate.
//   • Part-B = vehicle no OR transport doc (LR/RR/airway/bill of lading). When present
//     the EWB is "complete"; when absent it's a Part-A-only EWB (vehicle updated later).
const { pool } = require("../../db");
const { sum, toRupees } = require("./money");
const gsp = require("./gsp");

// First 2 digits of a GSTIN are the state code (e.g. "27AAAC...": Maharashtra = 27).
function stateCodeOf(gstin, fallback) {
  if (gstin && /^\d{2}/.test(gstin)) return gstin.slice(0, 2);
  return fallback || null;
}

// transMode: 1 Road, 2 Rail, 3 Air, 4 Ship. Pick from opts; Road when a vehicle is given.
function transModeOf(opts) {
  const m = { road: "1", rail: "2", air: "3", ship: "4" }[String(opts.transMode || "").toLowerCase()];
  if (m) return m;
  return opts.vehicleNo ? "1" : null;
}

// Assemble the EWB payload from the SALES voucher + its tax lines + party ledger (pure-ish:
// it reads the DB but builds a plain object). Throws on a non-SALES / missing voucher so the
// caller can surface an honest error rather than a malformed bill.
async function buildEwbPayload(tenantId, voucherId, opts = {}) {
  const { rows: vr } = await pool.query(
    "SELECT * FROM book_vouchers WHERE id=$1 AND tenant_id=$2",
    [voucherId, tenantId]
  );
  const voucher = vr[0];
  if (!voucher) { const e = new Error("Voucher not found"); e.code = "NOT_FOUND"; throw e; }
  if (voucher.voucher_type !== "SALES") {
    const e = new Error("E-way bills are generated from SALES vouchers only");
    e.code = "BAD_VOUCHER_TYPE"; throw e;
  }

  // Output tax lines only (is_input=false), same filter einvoice uses.
  const { rows: taxes } = await pool.query(
    "SELECT * FROM book_tax_entries WHERE voucher_id=$1 AND is_input=false",
    [voucherId]
  );
  const { rows: prof } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const seller = prof[0] || {};
  const { rows: pr } = voucher.party_ledger_id
    ? await pool.query("SELECT name, gstin, state_code, billing_address, pan FROM book_ledgers WHERE id=$1", [voucher.party_ledger_id])
    : [{}];
  const buyer = pr[0] || {};

  // Money: keep math in decimal, present as rupee strings (EWB API is rupee-denominated).
  const cgst = sum(taxes.filter((t) => t.tax_kind === "CGST").map((t) => t.tax_amount));
  const sgst = sum(taxes.filter((t) => t.tax_kind === "SGST").map((t) => t.tax_amount));
  const igst = sum(taxes.filter((t) => t.tax_kind === "IGST").map((t) => t.tax_amount));
  const cess = sum(taxes.filter((t) => t.tax_kind === "CESS").map((t) => t.tax_amount));
  // Taxable value: dedupe by line — CGST+SGST repeat the same taxable_value for one line,
  // so take it from one limb. Use IGST lines + (CGST lines as the intra-state taxable).
  const taxableLines = taxes.filter((t) => ["IGST", "CGST"].includes(t.tax_kind));
  const taxable = sum(taxableLines.map((t) => t.taxable_value));
  const totalTax = cgst.plus(sgst).plus(igst).plus(cess);
  const totalValue = taxable.plus(totalTax);

  // HSN-wise item list (one row per taxable limb), NIC "itemList" shape.
  const itemList = taxableLines.map((t, i) => ({
    itemNo: i + 1,
    hsnCode: t.hsn_sac || null,
    taxableAmount: toRupees(t.taxable_value),
    gstRate: Number(t.rate || 0),
    cgstRate: t.tax_kind === "CGST" ? Number(t.rate || 0) : 0,
    sgstRate: t.tax_kind === "CGST" ? Number(t.rate || 0) : 0,
    igstRate: t.tax_kind === "IGST" ? Number(t.rate || 0) : 0,
  }));

  const fromState = stateCodeOf(seller.gstin, seller.state);
  const toState = stateCodeOf(buyer.gstin, buyer.state_code);

  // Part-B presence: a vehicle no OR a transport document number => full EWB.
  const vehicleNo = opts.vehicleNo || null;
  const transDocNo = opts.transDocNo || opts.transportDocNo || null;
  const hasPartB = !!(vehicleNo || transDocNo);

  return {
    supplyType: "O",          // Outward
    subSupplyType: "1",       // Supply
    docType: "INV",
    docNo: `${voucher.voucher_type}-${voucher.voucher_number}`,
    docDate: voucher.voucher_date,
    fromGstin: seller.gstin || null,
    fromTrdName: seller.legal_name || seller.company_name || null,
    fromAddr1: seller.address || null,
    fromPlace: seller.city || null,
    fromPincode: seller.pincode || null,
    fromStateCode: fromState,
    actFromStateCode: fromState,
    toGstin: buyer.gstin || "URP", // URP = unregistered person (NIC convention)
    toTrdName: buyer.name || null,
    toAddr1: buyer.billing_address || null,
    toPincode: opts.toPincode || null,
    toStateCode: toState,
    actToStateCode: toState,
    totalValue: toRupees(taxable),
    cgstValue: toRupees(cgst),
    sgstValue: toRupees(sgst),
    igstValue: toRupees(igst),
    cessValue: toRupees(cess),
    totInvValue: toRupees(totalValue),
    transporterId: opts.transporterId || null,
    transporterName: opts.transporterName || null,
    transDistance: opts.distance != null ? String(opts.distance) : null,
    transMode: transModeOf(opts),
    transDocNo,
    transDocDate: opts.transDocDate || null,
    vehicleNo,
    vehicleType: opts.vehicleType || (vehicleNo ? "R" : null), // R Regular, O Over-dimensional
    part: hasPartB ? "AB" : "A", // A = Part-A only, AB = Part-A + Part-B
    itemList,
  };
}

// Generate the EWB. Honest "not configured" when GSP/EWB credentials are absent — no fake
// number. When configured, POST to the (stubbed) EWB endpoint and persist the returned
// number + validity onto book_einvoices.eway_bill_no for that voucher.
async function generateEwayBill(tenantId, actorId, voucherId, opts = {}) {
  let payload;
  try {
    payload = await buildEwbPayload(tenantId, voucherId, opts);
  } catch (e) {
    return { configured: gsp.isConfigured(), ok: false, reason: e.message, code: e.code || "BUILD_FAILED" };
  }

  if (!gsp.isConfigured()) {
    return {
      configured: false,
      ok: false,
      reason: "GSP/EWB rail not configured — set GSP_BASE_URL / GSP_API_KEY to enable e-way bill generation",
      payload, // surface the assembled payload so the UI can preview what would be sent
    };
  }

  try {
    const res = await gsp.generateEwayBill(payload);
    const ewbNo = res.ewayBillNo || res.ewbNo || null;
    const validUpto = res.validUpto || res.validUpTo || null;
    // Park onto the per-voucher einvoice row (PK = voucher_id). Created if absent so an EWB
    // can be raised independently of the IRN flow.
    await pool.query(
      `INSERT INTO book_einvoices(voucher_id, tenant_id, status, eway_bill_no, updated_at)
         VALUES($1,$2,'REGISTERED',$3, now())
       ON CONFLICT(voucher_id) DO UPDATE SET eway_bill_no=$3, updated_at=now()`,
      [voucherId, tenantId, ewbNo]
    );
    return { configured: true, ok: true, ewbNo, validUpto, raw: res };
  } catch (e) {
    if (e.code === "PENDING_CONFIG") {
      return { configured: false, ok: false, reason: e.message };
    }
    return { configured: true, ok: false, reason: e.message, code: "EWB_FAILED" };
  }
}

// Return any stored EWB number/validity for the voucher (validity is embedded in the
// EWB number's lifecycle on the portal; we surface what we persisted).
async function ewbStatus(tenantId, voucherId) {
  const { rows } = await pool.query(
    "SELECT eway_bill_no, status, updated_at FROM book_einvoices WHERE tenant_id=$1 AND voucher_id=$2",
    [tenantId, voucherId]
  );
  const row = rows[0];
  if (!row || !row.eway_bill_no) {
    return { voucherId, ewbNo: null, status: "NONE" };
  }
  return { voucherId, ewbNo: row.eway_bill_no, status: row.status, updatedAt: row.updated_at };
}

module.exports = { buildEwbPayload, generateEwayBill, ewbStatus };
