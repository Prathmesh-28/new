// §IMPORTS — Bill of Entry (BoE) for imports + ITC-04 job-work.
//
// Logic ported (not copied) from resilient-tech/india-compliance + frappe/erpnext
// (regional/india: Bill of Entry, GST on imports, ITC-04 job-work). We write our
// own code; all money math goes through ./money so it reconciles EXACTLY to the
// posting engine, and the import voucher is posted through the engine itself so
// the books stay correct and balanced.
//
// (1) BILL OF ENTRY (imports). When goods are imported, the foreign supplier's
//     invoice carries no GST. Instead, at the customs port a Bill of Entry assesses:
//       • Assessable value (CIF) — the customs valuation of the goods.
//       • BCD (Basic Customs Duty) — a customs duty, NON-creditable → becomes cost.
//       • Social Welfare Surcharge (SWS) — 10% of BCD (typically), also NON-creditable
//         → cost.
//       • IGST on imports — levied on (assessable value + BCD + SWS), and (unlike the
//         customs duties) it is CREDITABLE input tax → it flows to GSTR-3B table
//         4(A)(1) "Import of goods" ITC. We post it as Dr IGST Input with an IGST tax
//         side-record (is_input=true, supplyType 'IMPORT') so gstr3b() picks it up.
//
//     The voucher we post (a PURCHASE, ERPNext books the BoE as a Purchase/Journal):
//        Dr  Purchases (Imports)      assessable + BCD + SWS   (goods landed cost)
//        Dr  IGST Input               importIgst               (creditable ITC)
//        Cr  Customs Duty Payable     BCD + SWS + importIgst   (owed to customs)
//        Cr  Import Vendor (party)    assessable               (owed to supplier)
//     so customs duties land in COST and import IGST flows to ITC.
//
// (2) ITC-04 (job-work). A principal manufacturer who sends inputs/capital goods to
//     a job-worker for processing must file Form ITC-04 declaring goods SENT to and
//     RECEIVED from job-workers (challan no/date, qty, taxable value). This is a
//     RETURN/declaration only — sending goods on a delivery challan for job-work is
//     NOT a supply, so it carries NO GST and posts NO voucher. We only track the
//     challans for the ITC-04 return (Table 4 = sent, Table 5A = received back).
const { pool } = require("../../db");
const { money, toDb, sum } = require("./money");
const { postVoucher, PostError } = require("./posting-engine");
const { ledgerIdByName } = require("./seed");

// ── Ledger resolution ────────────────────────────────────────────────────────
// Resolve the import-posting ledgers. The everyday seeds give us "Purchases" and
// "IGST Input"; the import-specific cost/liability ledgers are resolved by their
// usual names with sensible fall-backs so a tenant that hasn't created a dedicated
// "Customs Duty Payable" still posts (falling back to a generic creditor head only
// when present). We NEVER invent a ledger id — a missing one throws NOT_SEEDED.
async function boeCtx(tenantId, vendorLedgerId, opts = {}) {
  if (!vendorLedgerId) throw new PostError("BAD_INPUT", "vendorLedgerId (the import supplier) is required", 422);
  const purchaseLedgerId =
    (opts.purchaseLedgerName && (await ledgerIdByName(tenantId, opts.purchaseLedgerName))) ||
    (await ledgerIdByName(tenantId, "Import Purchases")) ||
    (await ledgerIdByName(tenantId, "Purchases"));
  const igstInputLedgerId = await ledgerIdByName(tenantId, "IGST Input");
  const customsLedgerId =
    (opts.customsLedgerName && (await ledgerIdByName(tenantId, opts.customsLedgerName))) ||
    (await ledgerIdByName(tenantId, "Customs Duty Payable")) ||
    (await ledgerIdByName(tenantId, "Customs Payable"));
  if (!purchaseLedgerId) throw new PostError("NOT_SEEDED", "Purchases ledger missing — seed the books first", 422);
  if (!igstInputLedgerId) throw new PostError("NOT_SEEDED", "IGST Input ledger missing — seed the books first", 422);
  if (!customsLedgerId) throw new PostError("NOT_SEEDED", "Customs Duty Payable ledger missing — create a 'Customs Duty Payable' ledger (Current Liabilities) first", 422);
  return { vendorLedgerId, purchaseLedgerId, igstInputLedgerId, customsLedgerId };
}

// ── Pure mapper: BoE → balanced voucher ──────────────────────────────────────
// input: { date, boeNo, boeDate, portCode, assessableValue, bcd, sws, importIgst,
//          hsn?, reference?, narration? }
// ctx:   { vendorLedgerId, purchaseLedgerId, igstInputLedgerId, customsLedgerId }
// Returns { voucher, entries, taxes } in the exact shape postVoucher consumes.
function buildBillOfEntryVoucher(input, ctx) {
  const assessable = money(input.assessableValue);
  const bcd = money(input.bcd || 0);
  const sws = money(input.sws || 0);
  const importIgst = money(input.importIgst || 0);
  if (assessable.lessThan(0) || bcd.lessThan(0) || sws.lessThan(0) || importIgst.lessThan(0)) {
    throw new PostError("BAD_INPUT", "BoE amounts cannot be negative", 422);
  }
  // Customs duties (BCD + SWS) are non-creditable → capitalised into goods cost.
  const landedCost = assessable.plus(bcd).plus(sws);
  // What is owed to customs at the port: the duties + the import IGST.
  const customsPayable = bcd.plus(sws).plus(importIgst);
  if (!landedCost.plus(importIgst).greaterThan(0)) {
    throw new PostError("BAD_INPUT", "Bill of Entry total is zero", 422);
  }
  // IGST on imports is assessed on (assessable + BCD + SWS) — that's the taxable
  // value we stamp on the side-record so the rate and ITC reconcile.
  const igstTaxable = landedCost;

  const entries = [
    { ledgerId: ctx.purchaseLedgerId, debit: toDb(landedCost), credit: "0" },
  ];
  const taxes = [];
  if (importIgst.greaterThan(0)) {
    entries.push({ ledgerId: ctx.igstInputLedgerId, debit: toDb(importIgst), credit: "0" });
    // Effective rate (presentation only) = igst / taxable * 100, when taxable > 0.
    const rate = igstTaxable.greaterThan(0) ? importIgst.div(igstTaxable).mul(100) : money(0);
    taxes.push({
      taxKind: "IGST",
      rate: toDb(rate),
      taxableValue: toDb(igstTaxable),
      taxAmount: toDb(importIgst),
      hsnSac: input.hsn || null,
      isInput: true,                 // → GSTR-3B 4(A)(1) import ITC
      placeOfSupply: input.placeOfSupply || null,
      supplyType: "IMPORT",          // tags it as import-of-goods ITC
      counterpartyGstin: null,       // foreign supplier — no GSTIN
    });
  }
  if (customsPayable.greaterThan(0)) entries.push({ ledgerId: ctx.customsLedgerId, debit: "0", credit: toDb(customsPayable) });
  if (assessable.greaterThan(0)) entries.push({ ledgerId: ctx.vendorLedgerId, debit: "0", credit: toDb(assessable) });

  return {
    voucher: {
      voucherType: "PURCHASE",
      voucherDate: input.date || input.boeDate,
      reference: input.reference || (input.boeNo ? `BoE ${input.boeNo}` : null),
      partyLedgerId: ctx.vendorLedgerId,
      narration: input.narration || `Import — Bill of Entry ${input.boeNo || ""}`.trim(),
      source: "boe",
    },
    entries,
    taxes,
    totals: { assessableValue: toDb(assessable), bcd: toDb(bcd), sws: toDb(sws), importIgst: toDb(importIgst), landedCost: toDb(landedCost), customsPayable: toDb(customsPayable) },
  };
}

// ── Create a Bill of Entry: post the voucher, then persist the BoE record ──────
async function createBoe(tenantId, actorId, input = {}, opts = {}) {
  if (!input.boeNo) throw new PostError("BAD_INPUT", "boeNo is required", 422);
  if (!input.boeDate) throw new PostError("BAD_INPUT", "boeDate is required", 422);
  if (input.assessableValue == null) throw new PostError("BAD_INPUT", "assessableValue is required", 422);

  const ctx = await boeCtx(tenantId, input.vendorLedgerId, opts);
  const m = buildBillOfEntryVoucher(input, ctx);
  const posted = await postVoucher(tenantId, actorId, m.voucher, m.entries, { taxes: m.taxes, idempotencyKey: opts.idempotencyKey });

  const { rows } = await pool.query(
    `INSERT INTO book_bill_of_entry
       (tenant_id, boe_no, boe_date, port_code, vendor_ledger_id, assessable_value, bcd, sws, import_igst,
        landed_cost, customs_payable, hsn_sac, reference, narration, voucher_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [tenantId, input.boeNo, input.boeDate, input.portCode || null, input.vendorLedgerId,
     toDb(input.assessableValue), toDb(input.bcd || 0), toDb(input.sws || 0), toDb(input.importIgst || 0),
     m.totals.landedCost, m.totals.customsPayable, input.hsn || null, m.voucher.reference, m.voucher.narration,
     posted.voucherId, actorId || null]
  );
  return { boe: rows[0], voucher: posted };
}

async function listBoe(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.from) { params.push(filter.from); where.push(`boe_date >= $${params.length}`); }
  if (filter.to) { params.push(filter.to); where.push(`boe_date <= $${params.length}`); }
  if (filter.vendorLedgerId) { params.push(filter.vendorLedgerId); where.push(`vendor_ledger_id = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM book_bill_of_entry WHERE ${where.join(" AND ")} ORDER BY boe_date DESC, created_at DESC LIMIT 500`,
    params
  );
  return rows;
}

// Import ITC for GSTR-3B table 4(A)(1) over a period [from,to]. This is the import
// IGST we've claimed via Bills of Entry — the authoritative source is the IMPORT
// tax side-records (is_input, supplyType 'IMPORT') so it reconciles to gstr3b().
async function importItc(tenantId, from, to) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(te.tax_amount),0) AS igst, COALESCE(SUM(te.taxable_value),0) AS taxable, COUNT(*) AS lines
       FROM book_tax_entries te
       JOIN book_vouchers v ON v.id=te.voucher_id AND v.is_cancelled=false
      WHERE te.tenant_id=$1 AND te.is_input=true AND te.supply_type='IMPORT'
        AND v.voucher_date BETWEEN $2 AND $3`,
    [tenantId, from || "1900-01-01", to || "2999-12-31"]
  );
  const r = rows[0] || {};
  return { table: "4(A)(1)", description: "Import of goods", igst: toDb(r.igst || 0), taxableValue: toDb(r.taxable || 0), lines: Number(r.lines || 0) };
}

// ── ITC-04: job-work challans (sent / received) ───────────────────────────────
// direction 'SENT'     → goods sent to a job-worker (ITC-04 Table 4).
// direction 'RECEIVED' → goods received back from a job-worker (ITC-04 Table 5A).
// No GST, no voucher — this is a declaration row for the ITC-04 return only.
const ITC04_DIRECTIONS = new Set(["SENT", "RECEIVED"]);

async function createItc04Challan(tenantId, actorId, input = {}) {
  const direction = String(input.direction || "SENT").toUpperCase();
  if (!ITC04_DIRECTIONS.has(direction)) throw new PostError("BAD_INPUT", "direction must be SENT or RECEIVED", 422);
  if (!input.challanNo) throw new PostError("BAD_INPUT", "challanNo is required", 422);
  if (!input.challanDate) throw new PostError("BAD_INPUT", "challanDate is required", 422);
  const qty = money(input.qty == null ? 0 : input.qty);
  const taxable = money(input.taxableValue == null ? 0 : input.taxableValue);
  if (qty.lessThan(0) || taxable.lessThan(0)) throw new PostError("BAD_INPUT", "qty and taxableValue cannot be negative", 422);

  const { rows } = await pool.query(
    `INSERT INTO book_itc04_challans
       (tenant_id, direction, challan_no, challan_date, job_worker_gstin, job_worker_name,
        item_description, hsn_sac, qty, uom, taxable_value, goods_type, original_challan_no, narration, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [tenantId, direction, input.challanNo, input.challanDate, input.jobWorkerGstin || null, input.jobWorkerName || null,
     input.itemDescription || null, input.hsn || input.hsnSac || null, toDb(qty), input.uom || null, toDb(taxable),
     (input.goodsType || "INPUT").toUpperCase(), input.originalChallanNo || null, input.narration || null, actorId || null]
  );
  return rows[0];
}

async function listItc04Challans(tenantId, filter = {}) {
  const params = [tenantId];
  const where = ["tenant_id=$1"];
  if (filter.direction) { params.push(String(filter.direction).toUpperCase()); where.push(`direction = $${params.length}`); }
  if (filter.from) { params.push(filter.from); where.push(`challan_date >= $${params.length}`); }
  if (filter.to) { params.push(filter.to); where.push(`challan_date <= $${params.length}`); }
  if (filter.jobWorkerGstin) { params.push(filter.jobWorkerGstin); where.push(`job_worker_gstin = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT * FROM book_itc04_challans WHERE ${where.join(" AND ")} ORDER BY challan_date DESC, created_at DESC LIMIT 500`,
    params
  );
  // ITC-04 return summary: Table 4 (sent) vs Table 5A (received), totalled.
  const sent = rows.filter((r) => r.direction === "SENT");
  const received = rows.filter((r) => r.direction === "RECEIVED");
  const summary = {
    sent: { count: sent.length, taxableValue: toDb(sum(sent.map((r) => r.taxable_value))) },
    received: { count: received.length, taxableValue: toDb(sum(received.map((r) => r.taxable_value))) },
  };
  return { challans: rows, summary };
}

module.exports = {
  // BoE
  buildBillOfEntryVoucher, boeCtx, createBoe, listBoe, importItc,
  // ITC-04
  createItc04Challan, listItc04Challans, ITC04_DIRECTIONS,
};
