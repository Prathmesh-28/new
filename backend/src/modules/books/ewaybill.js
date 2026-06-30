// §9.4 - E-way bill (EWB). Mirrors einvoice.js: an EWB is generated via the GSP/ASP
// rail, and without GSP credentials we stay an honest "not configured" stub - we NEVER
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
const { PostError } = require("./posting-engine");
const gsp = require("./gsp");

// ── NIC EWB lifecycle reason-code maps (ported from india-compliance, NIC EWB API
// 1.03 spec). We validate the caller's code against these so we never POST a code
// the portal will reject. Keys are the NIC integer codes; values are the labels.
//
// Part-B vehicle-update reasons (VEHEWB):
const VEHICLE_UPDATE_REASONS = {
  1: "Due to Break Down",
  2: "Due to Transhipment",
  3: "Others",
  4: "First Time",
};
// Validity-extension reasons (EXTENDVALIDITY):
const EXTEND_REASONS = {
  1: "Natural Calamity",
  2: "Law and Order Situation",
  3: "Transhipment",
  4: "Accident",
  99: "Others",
};
// Cancellation reasons (CANEWB):
const CANCEL_REASONS = {
  1: "Duplicate",
  2: "Order Cancelled",
  3: "Data Entry Mistake",
  4: "Others",
};
// EWB cancellation is allowed only within 24h of generation (NIC rule).
const EWB_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
// Consignment status for an extension: M = still In Movement, T = In Transit (parked).
const CONSIGNMENT_STATUS = new Set(["M", "T"]);
// In-transit type (only required when consignmentStatus = T): R Road, W Warehouse,
// O Others, N None.
const TRANSIT_TYPES = new Set(["R", "W", "O", "N"]);

// Validate a NIC reason code against a map; coerce "3"→3. Throws PostError(422).
function reasonCodeOf(code, map, label) {
  const n = Number(code);
  if (!Number.isInteger(n) || !(n in map)) {
    throw new PostError("BAD_REASON_CODE", `${label} reason code must be one of: ${Object.keys(map).join(", ")}`, 422);
  }
  return n;
}

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
  // Taxable value: dedupe by line - CGST+SGST repeat the same taxable_value for one line,
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

// Generate the EWB. Honest "not configured" when GSP/EWB credentials are absent - no fake
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
      reason: "GSP/EWB rail not configured - set GSP_BASE_URL / GSP_API_KEY to enable e-way bill generation",
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
      `INSERT INTO book_einvoices(voucher_id, tenant_id, status, eway_bill_no, eway_valid_upto, eway_status, eway_vehicle_no, updated_at)
         VALUES($1,$2,'REGISTERED',$3,$4,'ACTIVE',$5, now())
       ON CONFLICT(voucher_id) DO UPDATE SET eway_bill_no=$3, eway_valid_upto=$4, eway_status='ACTIVE', eway_vehicle_no=$5, updated_at=now()`,
      [voucherId, tenantId, ewbNo, validUpto, payload.vehicleNo || null]
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
    "SELECT eway_bill_no, status, eway_status, eway_valid_upto, eway_vehicle_no, eway_transporter_id, eway_cancel_reason, eway_cancelled_at, updated_at FROM book_einvoices WHERE tenant_id=$1 AND voucher_id=$2",
    [tenantId, voucherId]
  );
  const row = rows[0];
  if (!row || !row.eway_bill_no) {
    return { voucherId, ewbNo: null, status: "NONE" };
  }
  return {
    voucherId,
    ewbNo: row.eway_bill_no,
    status: row.status,
    ewayStatus: row.eway_status || "ACTIVE",
    validUpto: row.eway_valid_upto || null,
    vehicleNo: row.eway_vehicle_no || null,
    transporterId: row.eway_transporter_id || null,
    cancelReason: row.eway_cancel_reason || null,
    cancelledAt: row.eway_cancelled_at || null,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EWB lifecycle operations (ported from india-compliance utils/e_waybill.py).
// Each builds the correctly-shaped NIC payload and routes through gsp.httpCall when
// configured; with no GSP creds we return an honest { configured:false } - we never
// fabricate a successful lifecycle action. The /ewaybill/* endpoints below mirror the
// NIC actions VEHEWB / UPDATETRANSPORTER / EXTENDVALIDITY / CANEWB.

// Load the persisted EWB row for a voucher and assert it carries a live EWB number.
// Lifecycle ops only make sense on an already-generated bill, so a missing number is
// a hard error (mirrors einvoice.cancelIrn's NOT_FOUND / NOT_REGISTERED guards).
async function _loadLiveEwb(tenantId, voucherId) {
  if (!voucherId) throw new PostError("BAD_REQUEST", "voucherId required", 422);
  const { rows } = await pool.query(
    "SELECT * FROM book_einvoices WHERE tenant_id=$1 AND voucher_id=$2",
    [tenantId, voucherId]
  );
  const row = rows[0];
  if (!row || !row.eway_bill_no) throw new PostError("NOT_FOUND", "no e-way bill generated for this voucher", 404);
  if (row.eway_status === "CANCELLED") throw new PostError("EWB_CANCELLED", "this e-way bill is already cancelled", 409);
  return row;
}

// "from" place/state for Part-B ops comes off the seller (consignor) profile, same
// source buildEwbPayload uses. Returns { fromPlace, fromState }.
async function _fromPlaceState(tenantId) {
  const { rows } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
  const seller = rows[0] || {};
  return { fromPlace: seller.city || null, fromState: stateCodeOf(seller.gstin, seller.state) };
}

// updateVehicle - NIC action VEHEWB. Change the Part-B vehicle (or transport doc) on a
// live EWB, with a mandatory reason code. Used to fill a Part-A-only bill, or to record
// a break-down / transhipment vehicle change mid-transit.
async function updateVehicle(tenantId, actorId, { voucherId, vehicleNo, vehicleType, transMode, transDocNo, transDocDate, reasonCode, reasonRem } = {}) {
  const row = await _loadLiveEwb(tenantId, voucherId);
  const vehicle = vehicleNo ? String(vehicleNo).toUpperCase().replace(/\s+/g, "") : null;
  const docNo = transDocNo || null;
  if (!vehicle && !docNo) throw new PostError("BAD_REQUEST", "vehicleNo or transDocNo required to update Part-B", 422);
  const code = reasonCodeOf(reasonCode, VEHICLE_UPDATE_REASONS, "vehicle update");
  // NIC requires a free-text remark when the reason is "Others" (3).
  if (code === 3 && !reasonRem) throw new PostError("BAD_REQUEST", 'reasonRem is required when reason code is 3 ("Others")', 422);

  const { fromPlace, fromState } = await _fromPlaceState(tenantId);
  const mode = transModeOf({ transMode, vehicleNo: vehicle });
  const payload = {
    ewbNo: row.eway_bill_no,
    vehicleNo: vehicle,
    fromPlace, fromState,
    reasonCode: code,
    reasonRem: reasonRem || VEHICLE_UPDATE_REASONS[code],
    transMode: mode,
    vehicleType: vehicleType || (vehicle ? "R" : null), // R Regular, O Over-dimensional
    transDocNo: docNo,
    transDocDate: transDocDate || null,
  };

  if (!gsp.isConfigured()) {
    return { configured: false, ok: false, reason: "GSP/EWB rail not configured - set GSP_BASE_URL / GSP_API_KEY", payload };
  }
  try {
    const res = await gsp.httpCall("/ewaybill/update-vehicle", payload);
    await pool.query(
      "UPDATE book_einvoices SET eway_vehicle_no=$3, updated_at=now() WHERE tenant_id=$1 AND voucher_id=$2",
      [tenantId, voucherId, vehicle]
    );
    return { configured: true, ok: true, ewbNo: row.eway_bill_no, vehicleNo: vehicle, raw: res, actorId };
  } catch (e) {
    if (e.code === gsp.PENDING_CONFIG) return { configured: false, ok: false, reason: e.message, payload };
    throw new PostError("EWB_UPDATE_VEHICLE_FAILED", e.message, 502);
  }
}

// updateTransporter - NIC action UPDATETRANSPORTER. Assign/replace the transporter GSTIN
// on a live EWB so the transporter can take over Part-B updates on the portal.
async function updateTransporter(tenantId, actorId, { voucherId, transporterId } = {}) {
  const row = await _loadLiveEwb(tenantId, voucherId);
  const tid = transporterId ? String(transporterId).trim().toUpperCase() : null;
  // Transporter ID is a 15-char GSTIN/TRANSIN; reject obviously malformed input early.
  if (!tid || !/^[0-9A-Z]{15}$/.test(tid)) {
    throw new PostError("BAD_REQUEST", "transporterId must be a 15-character GSTIN/Transporter ID", 422);
  }
  const payload = { ewbNo: row.eway_bill_no, transporterId: tid };

  if (!gsp.isConfigured()) {
    return { configured: false, ok: false, reason: "GSP/EWB rail not configured - set GSP_BASE_URL / GSP_API_KEY", payload };
  }
  try {
    const res = await gsp.httpCall("/ewaybill/update-transporter", payload);
    await pool.query(
      "UPDATE book_einvoices SET eway_transporter_id=$3, updated_at=now() WHERE tenant_id=$1 AND voucher_id=$2",
      [tenantId, voucherId, tid]
    );
    return { configured: true, ok: true, ewbNo: row.eway_bill_no, transporterId: tid, raw: res, actorId };
  } catch (e) {
    if (e.code === gsp.PENDING_CONFIG) return { configured: false, ok: false, reason: e.message, payload };
    throw new PostError("EWB_UPDATE_TRANSPORTER_FAILED", e.message, 502);
  }
}

// extendValidity - NIC action EXTENDVALIDITY. Extend a bill nearing/just past expiry. NIC
// only allows this inside the window 8h BEFORE → 8h AFTER the current validUpto. Requires
// the remaining distance, current consignment status (M in-movement / T in-transit), a
// reason code, and (for in-movement) the current vehicle + from place/state.
async function extendValidity(tenantId, actorId, opts = {}) {
  const { voucherId, remainingDistance, consignmentStatus, transitType, vehicleNo, vehicleType, transMode, transDocNo, transDocDate, reasonCode, reasonRem } = opts;
  const row = await _loadLiveEwb(tenantId, voucherId);

  // 8h-before / 8h-after window, measured against the persisted validUpto.
  if (!row.eway_valid_upto) throw new PostError("NO_VALIDITY", "stored e-way bill has no validUpto - cannot verify the extension window", 422);
  const validUpto = new Date(row.eway_valid_upto);
  if (isNaN(validUpto.getTime())) throw new PostError("NO_VALIDITY", "invalid stored validUpto", 422);
  const EIGHT_H = 8 * 60 * 60 * 1000;
  const now = Date.now();
  if (now < validUpto.getTime() - EIGHT_H) throw new PostError("EWB_EXTEND_TOO_EARLY", "validity can only be extended within 8 hours before expiry", 409);
  if (now > validUpto.getTime() + EIGHT_H) throw new PostError("EWB_EXTEND_WINDOW_PASSED", "the 8-hour-after-expiry extension window has passed", 409);

  const dist = Number(remainingDistance);
  if (!Number.isFinite(dist) || dist <= 0) throw new PostError("BAD_REQUEST", "remainingDistance (km) must be a positive number", 422);

  const status = String(consignmentStatus || "M").toUpperCase();
  if (!CONSIGNMENT_STATUS.has(status)) throw new PostError("BAD_REQUEST", "consignmentStatus must be M (in movement) or T (in transit)", 422);
  // In-transit (T) requires a transit type; in-movement (M) requires the current vehicle.
  let transit = null;
  if (status === "T") {
    transit = String(transitType || "").toUpperCase();
    if (!TRANSIT_TYPES.has(transit)) throw new PostError("BAD_REQUEST", "transitType must be R/W/O/N when consignmentStatus is T", 422);
  }
  const code = reasonCodeOf(reasonCode, EXTEND_REASONS, "extension");
  if (code === 99 && !reasonRem) throw new PostError("BAD_REQUEST", 'reasonRem is required when reason code is 99 ("Others")', 422);

  const vehicle = vehicleNo ? String(vehicleNo).toUpperCase().replace(/\s+/g, "") : (row.eway_vehicle_no || null);
  if (status === "M" && !vehicle) throw new PostError("BAD_REQUEST", "vehicleNo required to extend an in-movement consignment", 422);
  const { fromPlace, fromState } = await _fromPlaceState(tenantId);

  const payload = {
    ewbNo: row.eway_bill_no,
    remainingDistance: String(dist),
    consignmentStatus: status,
    transitType: transit,
    fromPlace, fromState,
    vehicleNo: vehicle,
    vehicleType: vehicleType || (vehicle ? "R" : null),
    transMode: transModeOf({ transMode, vehicleNo: vehicle }),
    transDocNo: transDocNo || null,
    transDocDate: transDocDate || null,
    extnRsnCode: code,
    extnRemarks: reasonRem || EXTEND_REASONS[code],
  };

  if (!gsp.isConfigured()) {
    return { configured: false, ok: false, reason: "GSP/EWB rail not configured - set GSP_BASE_URL / GSP_API_KEY", payload };
  }
  try {
    const res = await gsp.httpCall("/ewaybill/extend", payload);
    const newValid = res.validUpto || res.validUpTo || null;
    if (newValid) {
      await pool.query(
        "UPDATE book_einvoices SET eway_valid_upto=$3, updated_at=now() WHERE tenant_id=$1 AND voucher_id=$2",
        [tenantId, voucherId, newValid]
      );
    }
    return { configured: true, ok: true, ewbNo: row.eway_bill_no, validUpto: newValid, raw: res, actorId };
  } catch (e) {
    if (e.code === gsp.PENDING_CONFIG) return { configured: false, ok: false, reason: e.message, payload };
    throw new PostError("EWB_EXTEND_FAILED", e.message, 502);
  }
}

// cancelEwb - NIC action CANEWB. Cancel a live EWB within 24h of generation, with a reason
// code. Mirrors einvoice.cancelIrn: hard window check, honest config gate, persist state.
async function cancelEwb(tenantId, actorId, { voucherId, reasonCode, reasonRem } = {}) {
  const row = await _loadLiveEwb(tenantId, voucherId);
  const code = reasonCodeOf(reasonCode, CANCEL_REASONS, "cancellation");
  if (code === 4 && !reasonRem) throw new PostError("BAD_REQUEST", 'reasonRem is required when reason code is 4 ("Others")', 422);

  // 24h cancellation window, measured from generation (updated_at of the EWB row, as we
  // stamp it at generate time). If we lack a generation timestamp, refuse rather than guess.
  const genAt = row.updated_at ? new Date(row.updated_at) : null;
  if (!genAt || isNaN(genAt.getTime())) throw new PostError("NO_GEN_DATE", "missing e-way bill generation time - cannot verify the 24h cancel window", 422);
  if (Date.now() - genAt.getTime() > EWB_CANCEL_WINDOW_MS) throw new PostError("EWB_CANCEL_WINDOW_PASSED", "the 24-hour e-way bill cancellation window has passed", 409);

  const payload = { ewbNo: row.eway_bill_no, cancelRsnCode: code, cancelRmrk: reasonRem || CANCEL_REASONS[code] };

  if (!gsp.isConfigured()) {
    return { configured: false, ok: false, reason: "GSP/EWB rail not configured - set GSP_BASE_URL / GSP_API_KEY", payload };
  }
  try {
    const res = await gsp.httpCall("/ewaybill/cancel", payload);
    const { rows: upd } = await pool.query(
      "UPDATE book_einvoices SET eway_status='CANCELLED', eway_cancel_reason=$3, eway_cancelled_at=now(), updated_at=now() " +
      "WHERE tenant_id=$1 AND voucher_id=$2 RETURNING voucher_id, eway_bill_no, eway_status, eway_cancel_reason, eway_cancelled_at",
      [tenantId, voucherId, CANCEL_REASONS[code]]
    );
    return { configured: true, ok: true, ...upd[0], raw: res, actorId };
  } catch (e) {
    if (e.code === gsp.PENDING_CONFIG) return { configured: false, ok: false, reason: e.message, payload };
    throw new PostError("EWB_CANCEL_FAILED", e.message, 502);
  }
}

module.exports = {
  buildEwbPayload, generateEwayBill, ewbStatus,
  updateVehicle, updateTransporter, extendValidity, cancelEwb,
  VEHICLE_UPDATE_REASONS, EXTEND_REASONS, CANCEL_REASONS,
};
