// §TDS — Tax Deducted at Source (India, Income-Tax Act). The deductor (us, the
// buyer/payer) withholds tax at the prescribed rate when crediting/paying a
// resident vendor, pays the net, and remits the withheld amount to the
// government against a TDS Payable liability. This is the mirror of GST input
// tax: GST is a tax WE pay on top; TDS is a tax we WITHHOLD from the vendor.
//
// Logic ported from ERPNext India compliance (regional/india Tax Withholding
// Category) and the Income-Tax Act sections 194C/194J/194H/194I/194Q + 206AA
// (the 20% no-PAN floor). We write our own code — money math via ./money so it
// reconciles exactly to the posting engine, never a JS float.
const { money, toDb, toRupees } = require("./money");
const { PostError } = require("./posting-engine");

// (1) The common sections a small business actually hits. Rates are percentages.
// `threshold` is the per-transaction (single) floor; `aggregateThreshold`, where
// it exists, is the annual cumulative floor (194C's ₹1,00,000 aggregate, 194Q's
// ₹50,00,000 turnover trigger). `noPan` is the §206AA penal rate applied when the
// deductee has no PAN — always 20% here. Thresholds are informational: the caller
// decides whether the year-to-date crosses them; computeTds deducts on the amount
// it is given (ERPNext applies the cumulative test upstream the same way).
const NO_PAN_RATE = 20;
const TDS_SECTIONS = {
  "194C": {
    section: "194C",
    description: "Payments to contractors / sub-contractors",
    rate: 1,                    // individual / HUF payee
    rateOther: 2,               // any other payee (company, firm, etc.)
    threshold: 30000,           // single contract
    aggregateThreshold: 100000, // annual aggregate
    noPan: NO_PAN_RATE,
  },
  "194J": {
    section: "194J",
    description: "Professional / technical fees, royalty",
    rate: 10,
    threshold: 30000,
    noPan: NO_PAN_RATE,
  },
  "194H": {
    section: "194H",
    description: "Commission or brokerage",
    rate: 5,
    threshold: 15000,
    noPan: NO_PAN_RATE,
  },
  "194I": {
    section: "194I",
    description: "Rent (plant/machinery 2%, land/building/furniture 10%)",
    rate: 10,
    threshold: 240000,
    noPan: NO_PAN_RATE,
  },
  "194Q": {
    section: "194Q",
    description: "Purchase of goods above the aggregate turnover trigger",
    rate: 0.1,
    threshold: 5000000,            // deduct only on value above ₹50,00,000
    aggregateThreshold: 5000000,
    noPan: NO_PAN_RATE,
  },
};

function _section(section) {
  const s = TDS_SECTIONS[String(section || "").toUpperCase()];
  if (!s) {
    throw new PostError("UNKNOWN_TDS_SECTION", `Unknown TDS section "${section}"`, 422);
  }
  return s;
}

// (2) Pure rate→amount computation. No DB, no cumulative test — that lives in the
// caller (mirrors ERPNext, which resolves the applicable rate then withholds).
//   - panAvailable=false → §206AA penal rate (20%), and a lowerRate certificate
//     CANNOT lower it (a 197 certificate is issued against a valid PAN).
//   - lowerRate overrides the section rate for a §197 lower/nil-deduction
//     certificate (pass 0 for a nil certificate). Must be ≤ the section rate.
function computeTds({ section, amount, panAvailable = true, lowerRate } = {}) {
  const s = _section(section);
  const amt = money(amount);
  if (amt.lessThan(0)) throw new PostError("BAD_TDS_AMOUNT", "TDS amount cannot be negative", 422);

  let rate;
  if (!panAvailable) {
    rate = money(s.noPan);
  } else if (lowerRate !== undefined && lowerRate !== null && lowerRate !== "") {
    const lr = money(lowerRate);
    if (lr.lessThan(0)) throw new PostError("BAD_TDS_RATE", "lowerRate cannot be negative", 422);
    if (lr.greaterThan(money(s.rate))) {
      throw new PostError("BAD_TDS_RATE", `lowerRate ${toRupees(lr)}% exceeds §${s.section} rate ${s.rate}%`, 422);
    }
    rate = lr;
  } else {
    rate = money(s.rate);
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
// reduce that vendor credit by tdsAmount and credit TDS Payable instead — the
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
function buildTdsDeduction({ vendorLedgerId, tdsPayableLedgerId, grossAmount, section, panAvailable = true, lowerRate } = {}) {
  if (!vendorLedgerId) throw new PostError("BAD_INPUT", "vendorLedgerId required", 422);
  if (!tdsPayableLedgerId) throw new PostError("BAD_INPUT", "tdsPayableLedgerId required", 422);

  const gross = money(grossAmount);
  if (!gross.greaterThan(0)) throw new PostError("BAD_INPUT", "grossAmount must be positive", 422);

  const tds = computeTds({ section, amount: gross, panAvailable, lowerRate });
  const tdsAmount = money(tds.tdsAmount);
  const vendorNet = gross.minus(tdsAmount);
  if (vendorNet.lessThan(0)) throw new PostError("BAD_TDS_AMOUNT", "TDS exceeds gross payable", 422);

  // Lines to append. Vendor is settled NET (credit reduced); TDS Payable credited
  // the withheld tax. The caller's own debit side balances these.
  const entries = [
    { ledgerId: vendorLedgerId, debit: "0", credit: toDb(vendorNet) },
    { ledgerId: tdsPayableLedgerId, debit: "0", credit: toDb(tdsAmount) },
  ];

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
  };
}

module.exports = { TDS_SECTIONS, computeTds, buildTdsDeduction, NO_PAN_RATE };
