// §TDS - Tax Deducted at Source (India, Income-Tax Act). The deductor (us, the
// buyer/payer) withholds tax at the prescribed rate when crediting/paying a
// resident vendor, pays the net, and remits the withheld amount to the
// government against a TDS Payable liability. This is the mirror of GST input
// tax: GST is a tax WE pay on top; TDS is a tax we WITHHOLD from the vendor.
//
// Logic ported from ERPNext India compliance (regional/india Tax Withholding
// Category) and the Income-Tax Act sections 194C/194J/194H/194I/194Q + 206AA
// (the 20% no-PAN floor). We write our own code - money math via ./money so it
// reconciles exactly to the posting engine, never a JS float.
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");
const taxrules = require("./taxrules");

// (1) The common sections a small business actually hits. Rates are percentages.
// `threshold` is the per-transaction (single) floor; `aggregateThreshold`, where
// it exists, is the annual cumulative floor (194C's ₹1,00,000 aggregate, 194Q's
// ₹50,00,000 turnover trigger). `noPan` is the §206AA penal rate applied when the
// deductee has no PAN - always 20% here. Thresholds are informational: the caller
// decides whether the year-to-date crosses them; computeTds deducts on the amount
// it is given (ERPNext applies the cumulative test upstream the same way).
//
// The numbers are no longer inline: they are sourced from ./taxrules as DATED,
// VALIDATED parameters (rules-as-data). We materialise the currently-effective
// entry for each section into the same shape the callers already consume - the
// dated `from` key is stripped so TDS_SECTIONS/TCS_SECTIONS are byte-identical to
// the legacy inline tables.
const NO_PAN_RATE = taxrules.NO_PAN_RATE;

// Strip the dated `from` field from a resolved parameter entry → the legacy shape.
function _strip(entry) {
  const { from, ...rest } = entry;
  return rest;
}

// Materialise a { sectionKey: entry } table from a taxrules domain, resolved as of
// `onDate` (defaults to today - the currently-effective rates).
function _materialise(domain, onDate) {
  const out = {};
  for (const key of Object.keys(taxrules.PARAMS[domain])) {
    out[key] = _strip(taxrules.resolveParam(domain, key, onDate));
  }
  return out;
}

const _TODAY = new Date().toISOString().slice(0, 10);
const TDS_SECTIONS = _materialise("tds", _TODAY);

function _section(section) {
  const s = TDS_SECTIONS[String(section || "").toUpperCase()];
  if (!s) {
    throw new PostError("UNKNOWN_TDS_SECTION", `Unknown TDS section "${section}"`, 422);
  }
  return s;
}

// (2) Pure rate→amount computation. No DB, no cumulative test - that lives in the
// caller (mirrors ERPNext, which resolves the applicable rate then withholds).
//   - panAvailable=false → §206AA penal rate (20%), and a lowerRate certificate
//     CANNOT lower it (a 197 certificate is issued against a valid PAN).
//   - lowerRate overrides the section rate for a §197 lower/nil-deduction
//     certificate (pass 0 for a nil certificate). Must be ≤ the section rate.
//   - payeeType: for sections with a payee-dependent rate (§194C: 1% individual/HUF,
//     2% any other payee) pass 'company' | 'firm' | 'other' to get rateOther - an
//     audit found rateOther was dead data and every company payee was under-deducted
//     at 1%. Default stays 'individual' (the prior behavior) for callers that don't say.
//   - variant: 'plant_machinery' (§194-I(a) 2%) or 'fts' (§194J technical fees /
//     call-centre 2%) picks the section's statutory variant rate.
function computeTds({ section, amount, panAvailable = true, lowerRate, payeeType, variant } = {}) {
  const s = _section(section);
  const amt = money(amount);
  if (amt.lessThan(0)) throw new PostError("BAD_TDS_AMOUNT", "TDS amount cannot be negative", 422);

  // Resolve the applicable STATUTORY rate for this payee/variant before any
  // no-PAN / certificate overrides.
  let sectionRate = s.rate;
  const pt = String(payeeType || "").toLowerCase();
  if (s.rateOther !== undefined && pt && pt !== "individual" && pt !== "huf") sectionRate = s.rateOther;
  const v = String(variant || "").toLowerCase();
  if (v === "plant_machinery") {
    if (s.ratePlantMachinery === undefined) throw new PostError("BAD_TDS_RATE", `§${s.section} has no plant/machinery variant`, 422);
    sectionRate = s.ratePlantMachinery;
  } else if (v === "fts") {
    if (s.rateFts === undefined) throw new PostError("BAD_TDS_RATE", `§${s.section} has no technical-services variant`, 422);
    sectionRate = s.rateFts;
  } else if (v && v !== "") {
    throw new PostError("BAD_TDS_RATE", `Unknown TDS variant "${variant}"`, 422);
  }

  let rate;
  if (!panAvailable) {
    rate = money(s.noPan);
  } else if (lowerRate !== undefined && lowerRate !== null && lowerRate !== "") {
    const lr = money(lowerRate);
    if (lr.lessThan(0)) throw new PostError("BAD_TDS_RATE", "lowerRate cannot be negative", 422);
    if (lr.greaterThan(money(sectionRate))) {
      throw new PostError("BAD_TDS_RATE", `lowerRate ${toRupees(lr)}% exceeds §${s.section} rate ${sectionRate}%`, 422);
    }
    rate = lr;
  } else {
    rate = money(sectionRate);
  }

  // round(amount*rate/100): TDS is rounded to the nearest rupee (CBDT convention,
  // and how ERPNext rounds the withheld amount). HALF_UP via Decimal.
  const tdsAmount = amt.times(rate).div(100).toDecimalPlaces(0);
  const netPayable = amt.minus(tdsAmount);
  return {
    section: s.section,
    rate: toRupees(rate),
    tdsAmount: toDb(tdsAmount),
    netPayable: toDb(netPayable),
  };
}

// (3) The extra voucher lines to splice into a PURCHASE/PAYMENT so the vendor is
// paid net of TDS and the withheld tax sits in a liability awaiting remittance.
//
// In a normal purchase the vendor is credited the full gross. To withhold TDS we
// reduce that vendor credit by tdsAmount and credit TDS Payable instead - the
// debit side (expense/purchase + input GST) is unchanged, so the voucher still
// balances. We therefore return only the TWO TDS lines plus the net the vendor
// should actually be settled for; the caller subtracts tdsAmount from the vendor
// credit it was already going to post and appends `entries`.
//
//   Dr  (purchase + input GST)         gross + gst   ← caller, unchanged
//   Cr  Vendor                         grossâˆ’tds      ← caller reduces by tds
//   Cr  TDS Payable                    tds            ← appended here
//
// We emit BOTH the reduced vendor credit and the TDS Payable credit as the
// spliceable `entries` so a payment-style caller can drop in two clean lines.
function buildTdsDeduction({ vendorLedgerId, tdsPayableLedgerId, grossAmount, section, panAvailable = true, lowerRate, payeeType, variant } = {}) {
  if (!vendorLedgerId) throw new PostError("BAD_INPUT", "vendorLedgerId required", 422);
  if (!tdsPayableLedgerId) throw new PostError("BAD_INPUT", "tdsPayableLedgerId required", 422);

  const gross = money(grossAmount);
  if (!gross.greaterThan(0)) throw new PostError("BAD_INPUT", "grossAmount must be positive", 422);

  const tds = computeTds({ section, amount: gross, panAvailable, lowerRate, payeeType, variant });
  const tdsAmount = money(tds.tdsAmount);
  const vendorNet = gross.minus(tdsAmount);
  if (vendorNet.lessThan(0)) throw new PostError("BAD_TDS_AMOUNT", "TDS exceeds gross payable", 422);

  // Lines to append. Vendor is settled NET (credit reduced); TDS Payable credited
  // the withheld tax. The caller's own debit side balances these.
  const entries = [
    { ledgerId: vendorLedgerId, debit: "0", credit: toDb(vendorNet) },
    { ledgerId: tdsPayableLedgerId, debit: "0", credit: toDb(tdsAmount) },
  ];

  // Tax side-record: the authoritative TDS breakdown captured at posting time. The
  // section is now a FIRST-CLASS dimension (tdsSection) rather than overloaded onto
  // hsn_sac - we still set hsnSac too so a posting-engine that hasn't yet learned the
  // new column keeps storing the section (backward-compat; the read path COALESCEs).
  const taxes = [{
    taxKind: "TDS",
    rate: tds.rate,
    taxableValue: toDb(gross),
    taxAmount: toDb(tdsAmount),
    tdsSection: tds.section,
    hsnSac: tds.section,
    isInput: false,
  }];

  return {
    tds: {
      section: tds.section,
      rate: tds.rate,
      grossAmount: toDb(gross),
      tdsAmount: toDb(tdsAmount),
      vendorNet: toDb(vendorNet),
      netPayable: tds.netPayable,
      panAvailable: !!panAvailable,
    },
    entries,
    taxes,
  };
}

// §TCS - Tax Collected at Source (Income-Tax Act §206C). The mirror of TDS: here
// WE are the SELLER and COLLECT an extra slice of tax FROM the buyer on top of the
// sale value, then remit it to the government against a TCS Payable liability. So a
// sale invoice's receivable from the customer is *grossed up* by the TCS, unlike
// TDS which *reduces* what we pay a vendor.
//
// Sections per §206C. `rate` is a percentage on the sale value (206C(1H) collects
// only on the amount above the ₹50,00,000 aggregate to a single buyer - the caller
// applies that aggregate test, same convention as 194Q above). `noPan` is the
// §206CC penal rate: twice the normal rate, or 5%, whichever is HIGHER, applied
// when the buyer has no PAN.
const TCS_SECTIONS = _materialise("tcs", _TODAY);

function _tcsSection(section) {
  const s = TCS_SECTIONS[String(section || "").toUpperCase()];
  if (!s) {
    throw new PostError("UNKNOWN_TCS_SECTION", `Unknown TCS section "${section}"`, 422);
  }
  return s;
}

// (2) Pure rate→amount computation for TCS. No DB, no aggregate test (caller owns
// that). When the buyer has no PAN, §206CC applies the HIGHER of twice the section
// rate or 5%. tcsAmount is rounded to the nearest rupee (same CBDT convention as
// TDS); totalCollectible is the sale amount grossed up by the collected tax.
function computeTcs({ section, amount, panAvailable = true } = {}) {
  const s = _tcsSection(section);
  const amt = money(amount);
  if (amt.lessThan(0)) throw new PostError("BAD_TCS_AMOUNT", "TCS amount cannot be negative", 422);

  let rate = money(s.rate);
  if (!panAvailable) {
    // §206CC: higher of 2× section rate or 5%.
    const penal = rate.times(2);
    rate = penal.greaterThan(money(5)) ? penal : money(5);
  }

  const tcsAmount = amt.times(rate).div(100).toDecimalPlaces(0);
  const totalCollectible = amt.plus(tcsAmount);
  return {
    section: s.section,
    rate: toRupees(rate),
    tcsAmount: toDb(tcsAmount),
    totalCollectible: toDb(totalCollectible),
  };
}

// (3) The extra voucher lines to splice onto a SALE so the customer is billed for
// the TCS on top and the collected tax sits in a liability awaiting remittance.
//
// In a normal sale the customer is debited (receivable) the full gross. To collect
// TCS we ADD tcsAmount to that customer debit and credit TCS Payable - the credit
// side (sales income + output GST) is unchanged, so the voucher still balances. We
// emit only the TWO extra lines so the caller appends them on top of its sale.
//
//   Dr  Customer                  + tcsAmount   ← appended here (extra receivable)
//   Cr  TCS Payable                 tcsAmount   ← appended here
//   Cr  (sales + output GST)        gross + gst ← caller, unchanged
function buildTcsCollection({ customerLedgerId, tcsPayableLedgerId, amount, section, panAvailable = true } = {}) {
  if (!customerLedgerId) throw new PostError("BAD_INPUT", "customerLedgerId required", 422);
  if (!tcsPayableLedgerId) throw new PostError("BAD_INPUT", "tcsPayableLedgerId required", 422);

  const amt = money(amount);
  if (!amt.greaterThan(0)) throw new PostError("BAD_INPUT", "amount must be positive", 422);

  const tcs = computeTcs({ section, amount: amt, panAvailable });
  const tcsAmount = money(tcs.tcsAmount);

  // Extra lines to append. Customer receivable grows by the TCS; TCS Payable is
  // credited the collected tax. The caller's own sale lines balance the base.
  const entries = [
    { ledgerId: customerLedgerId, debit: toDb(tcsAmount), credit: "0" },
    { ledgerId: tcsPayableLedgerId, debit: "0", credit: toDb(tcsAmount) },
  ];

  // Tax side-record (TCS). Section carried first-class on tdsSection (the 27EQ filer
  // reads it), with hsnSac mirrored for backward-compat. See buildTdsDeduction.
  const taxes = [{
    taxKind: "TCS",
    rate: tcs.rate,
    taxableValue: toDb(amt),
    taxAmount: toDb(tcsAmount),
    tdsSection: tcs.section,
    hsnSac: tcs.section,
    isInput: false,
  }];

  return {
    tcs: {
      section: tcs.section,
      rate: tcs.rate,
      amount: toDb(amt),
      tcsAmount: toDb(tcsAmount),
      totalCollectible: tcs.totalCollectible,
      panAvailable: !!panAvailable,
    },
    entries,
    taxes,
  };
}

module.exports = {
  TDS_SECTIONS, computeTds, buildTdsDeduction, NO_PAN_RATE,
  TCS_SECTIONS, computeTcs, buildTcsCollection,
  // Rules-as-data primitives (for an inspector route): the dated parameter store,
  // the dated resolver, and the load-time validation that guards the tables.
  taxParams: taxrules.PARAMS,
  resolveParam: taxrules.resolveParam,
  validateParams: taxrules.validateParams,
};
