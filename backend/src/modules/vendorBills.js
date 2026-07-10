"use strict";
// Vendor bills — the audit's #6 gap: Vendors/Suppliers had no real purchase bill, so AP aging
// was sourced from hand-entered "obligations" instead of actual payables, and there was no
// per-bill ITC/RCM/TDS. This wires the vendor master to the REAL, already-correct engines:
// mappers.buildPurchaseVoucherLines/buildRcmBill (GST), tds.buildTdsDeduction (withholding),
// posting-engine.postVoucher (the ledger), and billwise (bill-wise open-bill aging + FIFO
// settlement) — no new posting logic; this module only assembles their calls.
// vendor_master is NOT RLS'd (app-scoped via tenant_id, like routes/vendors.js); book_* tables
// are NOT RLS'd either (plain pool.query with explicit tenant_id, like billwise.js).
const { pool } = require("../db");
const fc = require("../lib/fieldcrypto");
const { money, toDb, toRupees } = require("./books/money");
const { postVoucher, reverseVoucher, PostError } = require("./books/posting-engine");
const { resolvePartyLedgerByName, purchaseCtx } = require("./books/documents");
const { buildPurchaseVoucherLines, buildRcmBill, buildPaymentVoucher } = require("./books/mappers");
const { ledgerIdByName } = require("./books/seed");
const { computeTds, buildTdsDeduction } = require("./books/tds");
const billwise = require("./books/billwise");

async function getVendor(tenantId, vendorId) {
  const { rows } = await pool.query("SELECT * FROM vendor_master WHERE tenant_id=$1 AND id=$2", [tenantId, vendorId]);
  if (!rows[0]) throw new PostError("NOT_FOUND", "Vendor not found", 404);
  return fc.decryptFields(rows[0], ["pan", "bank_account"]);
}

// Resolve (creating if needed) the vendor's Sundry Creditors ledger, and backfill its
// credit_period_days/GSTIN/PAN from the vendor profile — but only fields the ledger doesn't
// already have, so a ledger someone hand-edited in Books is never silently overwritten.
async function resolveVendorLedger(tenantId, vendorId) {
  const vendor = await getVendor(tenantId, vendorId);
  const ledgerId = await resolvePartyLedgerByName(tenantId, vendor.name, "PURCHASE");
  await pool.query(
    "UPDATE book_ledgers SET credit_period_days=COALESCE(credit_period_days,$1), gstin=COALESCE(gstin,$2), pan=COALESCE(pan,$3) WHERE tenant_id=$4 AND id=$5",
    [vendor.payment_terms_days || null, vendor.gstin || null, vendor.pan || null, tenantId, ledgerId]
  );
  return { ledgerId, vendor };
}

// Lookup-only (no create) — for aging, which must never provision a ledger for a vendor
// that has never been billed.
async function lookupVendorLedgerId(tenantId, vendorName) {
  const { rows } = await pool.query("SELECT id FROM book_ledgers WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1", [tenantId, vendorName]);
  return rows[0]?.id || null;
}

// Record a vendor bill → posts a real PURCHASE voucher (or RCM self-assessment), with
// optional TDS withholding spliced in. Returns the voucher + (if applicable) the TDS breakdown.
//
//   items: [{description, quantity, unit_price, gst_rate, hsn_sac}]  (preferred — per-line GST)
//   OR lineTotal + gstRate                                          (flat, single-rate bill)
//   rcm: true → vendor charges NO GST; we self-assess (buildRcmBill) — items/lineTotal both
//        collapse to a single taxable value (RCM has no per-line GST to split).
//   tds: { section, panAvailable, lowerRate } → withholds tax, nets the vendor credit down,
//        books TDS Payable. Base = whatever this bill actually credits the vendor (taxable
//        value for RCM, gross for a normal bill) — the correct CBDT-circular base either way.
async function recordBill(tenantId, actorId, opts = {}) {
  const { vendorId, billNumber, billDate, narration, interState = false, gstRate = 18, rcm = false, tds = null } = opts;
  if (!vendorId) throw new PostError("BAD_INPUT", "vendorId is required", 400);
  if (!billNumber || !String(billNumber).trim()) throw new PostError("BAD_INPUT", "billNumber is required", 400);
  if (!billDate) throw new PostError("BAD_INPUT", "billDate is required", 400);

  const { ledgerId: vendorLedgerId, vendor } = await resolveVendorLedger(tenantId, vendorId);
  const reference = String(billNumber).trim();
  const idempotencyKey = `bill:${vendorLedgerId}:${reference}`;
  // Fail loudly on a reused bill number instead of letting postVoucher's idempotency replay
  // silently return the FIRST posting while this call's (possibly different) amount/TDS is
  // computed and reported as if it were posted — a bill number is not a safe retry token the
  // way a fresh UUID is, since a user can legitimately type the same number twice by mistake.
  const { rows: dup } = await pool.query("SELECT id FROM book_vouchers WHERE tenant_id=$1 AND idempotency_key=$2", [tenantId, idempotencyKey]);
  if (dup[0]) throw new PostError("DUPLICATE_BILL", `A bill numbered "${reference}" already exists for ${vendor.name} — use a different bill number, or find it in the bill history to pay/adjust it.`, 409);
  const base = { date: billDate, reference, narration: narration || `Bill ${reference} - ${vendor.name}`, interState: !!interState };

  let built;
  if (rcm) {
    const lineTotal = opts.lineTotal != null ? opts.lineTotal : (opts.items || []).reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);
    if (!(lineTotal > 0)) throw new PostError("BAD_INPUT", "lineTotal (or items) must total more than 0", 400);
    const cgstOut = await ledgerIdByName(tenantId, "CGST Output"), sgstOut = await ledgerIdByName(tenantId, "SGST Output"), igstOut = await ledgerIdByName(tenantId, "IGST Output");
    const ctx0 = await purchaseCtx(tenantId, vendorLedgerId);
    if (!cgstOut || !sgstOut || !igstOut) throw new PostError("NOT_SEEDED", "GST Output ledgers missing - seed the books first", 422);
    built = buildRcmBill({ ...base, lineTotal, gstRate: Number(gstRate) }, { ...ctx0, cgstOutputLedgerId: cgstOut, sgstOutputLedgerId: sgstOut, igstOutputLedgerId: igstOut });
  } else {
    const items = Array.isArray(opts.items) && opts.items.length
      ? opts.items.map((i) => ({ description: i.description, qty: i.quantity, rate: i.unit_price, gst_rate: i.gst_rate ?? gstRate, hsn: i.hsn_sac }))
      : [{ description: narration || reference, qty: 1, rate: opts.lineTotal, gst_rate: gstRate }];
    if (!items.every((i) => (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.rate) || 0) >= 0)) throw new PostError("BAD_INPUT", "Every item needs a positive quantity and a non-negative rate", 400);
    const ctx = await purchaseCtx(tenantId, vendorLedgerId);
    built = buildPurchaseVoucherLines({ ...base, lines: items }, ctx);
  }

  let { entries, taxes, voucher } = built;
  let tdsResult = null;
  if (tds && tds.section) {
    // Base = whatever this bill actually credits the vendor right now (correctly RCM-aware:
    // an RCM bill only credits the taxable value, since there's no GST on the vendor leg).
    const vendorCredit = entries.filter((e) => e.ledgerId === vendorLedgerId).reduce((s, e) => s.plus(money(e.credit || 0)), money(0));
    const tdsPayableLedgerId = await ledgerIdByName(tenantId, "TDS Payable");
    if (!tdsPayableLedgerId) throw new PostError("NOT_SEEDED", "TDS Payable ledger missing - seed the books first", 422);
    const d = buildTdsDeduction({ vendorLedgerId, tdsPayableLedgerId, grossAmount: toDb(vendorCredit), section: tds.section, panAvailable: tds.panAvailable !== false, lowerRate: tds.lowerRate, payeeType: tds.payeeType, variant: tds.variant });
    entries = [...entries.filter((e) => e.ledgerId !== vendorLedgerId), ...d.entries];
    taxes = [...taxes, ...d.taxes];
    tdsResult = d.tds;
  }

  const posted = await postVoucher(tenantId, actorId,
    { ...voucher, partyLedgerId: vendorLedgerId },
    entries,
    { idempotencyKey, taxes }
  );
  // The upfront dup check above has a TOCTOU window: two genuinely concurrent submissions for
  // the same vendor+bill-number can both pass it. postVoucher's own idempotency race handling
  // then lets exactly one WIN and silently REPLAYS the other — but replayed:true means nothing
  // from THIS call's payload (amount, TDS section, RCM flag) was actually posted; the response
  // would otherwise glue this call's freshly-computed tdsResult onto the OTHER call's voucher.
  // Surface that honestly instead of a false 201.
  if (posted.replayed) throw new PostError("DUPLICATE_BILL", `A bill numbered "${reference}" was just recorded (possibly by a concurrent submission) — refresh and check the bill history before re-entering it.`, 409);
  return { ...posted, vendorLedgerId, vendorName: vendor.name, tds: tdsResult };
}

// Pay a vendor: posts a PAYMENT voucher (Dr Vendor / Cr Bank) then settles it against open
// bills — a SPECIFIC bill (allocateBill) if billVoucherId is given, else FIFO oldest-first
// (autoAllocate). Both reuse billwise's already-locked, already-correct allocation invariants.
// postVoucher and billwise's allocation each manage their OWN transaction (postVoucher doesn't
// accept an external client), so the two steps aren't atomic by construction. If allocation
// fails AFTER the payment already committed — the bill was just settled by a concurrent payment,
// the amount now exceeds a since-changed outstanding balance, etc. — that money must not be left
// as a permanently invisible, unallocated PAYMENT voucher (neither listBills nor billwise.openBills
// ever surface a bare PAYMENT). So a failed allocation REVERSES the payment we just posted before
// re-throwing: the net ledger effect is zero and the caller sees the real error, not silent loss.
async function payBill(tenantId, actorId, opts = {}) {
  const { vendorId, bankLedgerId, amount, date, reference, narration, billVoucherId } = opts;
  if (!vendorId) throw new PostError("BAD_INPUT", "vendorId is required", 400);
  if (!bankLedgerId) throw new PostError("BAD_INPUT", "bankLedgerId is required", 400);
  if (!(Number(amount) > 0)) throw new PostError("BAD_AMOUNT", "amount must be greater than 0", 400);
  if (!date) throw new PostError("BAD_INPUT", "date is required", 400);

  const { ledgerId: vendorLedgerId, vendor } = await resolveVendorLedger(tenantId, vendorId);
  const built = buildPaymentVoucher(
    { amount, date, reference: reference || null, narration: narration || `Payment to ${vendor.name}` },
    { partyLedgerId: vendorLedgerId, bankLedgerId }
  );
  const posted = await postVoucher(tenantId, actorId, built.voucher, built.entries, {});

  try {
    const allocation = billVoucherId
      ? await billwise.allocateBill(tenantId, { sourceVoucherId: posted.voucherId, targetVoucherId: billVoucherId, amount })
      : await billwise.autoAllocate(tenantId, actorId, { partyLedgerId: vendorLedgerId, receiptVoucherId: posted.voucherId });
    return { ...posted, vendorLedgerId, vendorName: vendor.name, allocation };
  } catch (e) {
    await reverseVoucher(tenantId, actorId, posted.voucherId, { date }).catch((revErr) => {
      // This is now a real, invisible cash leak — loud enough to page someone, not just warn.
      console.error(`[vendorBills] CRITICAL: payment voucher ${posted.voucherId} (tenant ${tenantId}) could not be auto-reversed after allocation failure - it is posted but UNALLOCATED. Reverse it manually in Books.`, revErr.message);
    });
    throw e;
  }
}

// All PURCHASE bills for a vendor (open AND settled), for a bill-history register. Read-only
// (any authenticated tenant member, including viewer/investor, can call this) — so it MUST use
// the lookup-only ledger resolution, never resolveVendorLedger's create+backfill, or a GET would
// mutate the chart of accounts as a side effect.
async function listBills(tenantId, vendorId) {
  const vendor = await getVendor(tenantId, vendorId);
  const vendorLedgerId = await lookupVendorLedgerId(tenantId, vendor.name);
  if (!vendorLedgerId) return []; // never billed → nothing to list, nothing to provision
  const { rows } = await pool.query(
    `SELECT v.id, v.voucher_number, v.voucher_date, v.reference, v.narration, v.is_cancelled,
            COALESCE((SELECT SUM(e.credit) FROM book_voucher_entries e WHERE e.voucher_id=v.id AND e.ledger_id=v.party_ledger_id),0) AS gross,
            COALESCE((SELECT SUM(a.amount) FROM book_allocations a WHERE a.tenant_id=v.tenant_id AND a.target_voucher_id=v.id),0) AS allocated
       FROM book_vouchers v
      WHERE v.tenant_id=$1 AND v.party_ledger_id=$2 AND v.voucher_type='PURCHASE'
      ORDER BY v.voucher_date DESC, v.voucher_number DESC LIMIT 200`,
    [tenantId, vendorLedgerId]
  );
  return rows.map((r) => {
    const gross = money(r.gross), allocated = money(r.allocated);
    return {
      voucherId: r.id, billNumber: r.reference, voucherNumber: r.voucher_number, date: r.voucher_date,
      narration: r.narration, cancelled: r.is_cancelled,
      gross: toRupees(gross), allocated: toRupees(allocated), outstanding: toRupees(gross.minus(allocated)),
      status: r.is_cancelled ? "cancelled" : gross.minus(allocated).lessThanOrEqualTo(0) ? "settled" : allocated.greaterThan(0) ? "partial" : "open",
    };
  }).map((b) => ({ ...b, vendorId, vendorName: vendor.name }));
}

// Real AP aging across every vendor with at least one open bill — replaces the old
// obligations-derived guess. Reuses billwise.openBills per vendor (well-tested; the
// alternative was re-deriving its SQL, which risks a second, divergent aging definition).
const BUCKETS = ["current", "d30", "d60", "d60plus"];
function bucketOf(daysOverdue) {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  return "d60plus";
}
async function apAgingSummary(tenantId) {
  const { rows: vendors } = await pool.query(
    "SELECT id, name, is_msme, msme_category, payment_terms_days FROM vendor_master WHERE tenant_id=$1", [tenantId]
  );
  const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const out = [];
  for (const v of vendors) {
    const ledgerId = await lookupVendorLedgerId(tenantId, v.name);
    if (!ledgerId) continue; // never billed → nothing to age
    const bills = await billwise.openBills(tenantId, ledgerId);
    if (!bills.length) continue;
    const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    for (const b of bills) { const bk = bucketOf(b.daysOverdue); buckets[bk] += b.outstanding; totals[bk] += b.outstanding; }
    const total = bills.reduce((s, b) => s + b.outstanding, 0);
    out.push({
      vendorId: v.id, vendorLedgerId: ledgerId, vendorName: v.name,
      isMsme: !!v.is_msme, msmeCategory: v.msme_category || null, paymentTermsDays: v.payment_terms_days || null,
      total, buckets, bills,
    });
  }
  out.sort((a, b) => b.total - a.total);
  return { vendors: out, totals, grandTotal: BUCKETS.reduce((s, b) => s + totals[b], 0) };
}

module.exports = { getVendor, resolveVendorLedger, recordBill, payBill, listBills, apAgingSummary, computeTds, bucketOf };
