"use strict";
// ── The one place invoice money is calculated ────────────────────────────────
// Before this, totals were computed inline in the create path as
// `sum(qty * rate)` plus `sum(line * rate/100)`, which meant an invoice could not express
// a per-line discount, a header discount, freight, a round-off, reverse charge, or the
// CGST/SGST/IGST split — the split was re-derived at print time from GSTINs and never
// stored, so the document and the books could drift.
//
// Rules encoded here, in the order they apply:
//   1. line gross      = qty × rate
//   2. line discount   = explicit amount, else gross × discount_pct
//   3. header discount and freight are APPORTIONED across lines pro-rata to their taxable
//      value, so tax lands on the right line at the right rate. A flat header discount
//      applied after tax would understate GST; freight untaxed would understate it too
//      (freight follows the rate of the principal supply).
//   4. tax per line    = apportioned taxable × line GST rate
//   5. inter-state ⇒ all IGST; otherwise CGST = round(tax/2) and SGST takes the remainder,
//      so the two halves always sum EXACTLY to the tax (never 0.01 out).
//   6. reverse charge  ⇒ tax is computed and reported but NOT collected, so it is excluded
//      from the amount payable (the recipient pays it directly).
//   7. round-off       = to the nearest rupee, recorded as its own line so the printed
//      total always ties back to the sum of its parts.
//
// Every amount is quantised to paise; the line amounts are then reconciled against the
// header so `sum(lines) === header` is an invariant, not an approximation.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n, d = 0) => { const x = Number(n); return Number.isFinite(x) ? x : d; };

/**
 * @param {object} input
 * @param {Array}  input.items          [{ quantity, unit_price, gst_rate?, discount_pct?, discount_amount? }]
 * @param {number} input.gst_rate       default rate for lines that don't state one
 * @param {number} input.discount_amount header-level discount (absolute)
 * @param {number} input.shipping_amount freight / packing, taxed with the goods
 * @param {string} input.place_of_supply_code  two-digit GST state code of the buyer
 * @param {string} input.seller_state_code     two-digit GST state code of the seller
 * @param {boolean} input.reverse_charge
 * @param {boolean} input.round_off_enabled    default true
 */
function computeInvoice({
  items = [], gst_rate = 18, discount_amount = 0, shipping_amount = 0,
  place_of_supply_code = null, seller_state_code = null,
  reverse_charge = false, round_off_enabled = true,
} = {}) {
  const headerDiscount = Math.max(0, r2(discount_amount));
  const shipping = Math.max(0, r2(shipping_amount));

  // 1-2: line gross and line-level discount.
  const base = items.map((it) => {
    const qty = num(it.quantity, 0);
    const rate = num(it.unit_price, 0);
    const gross = r2(qty * rate);
    const pct = num(it.discount_pct, 0);
    const explicit = it.discount_amount != null ? Math.max(0, r2(it.discount_amount)) : null;
    const discount = Math.min(gross, explicit != null ? explicit : r2(gross * pct / 100));
    return { ...it, quantity: qty, unit_price: rate, gross, discount_pct: pct, discount_amount: discount,
             lineTaxable: r2(gross - discount), taxRate: num(it.gst_rate, gst_rate) };
  });

  const grossTaxable = r2(base.reduce((s, l) => s + l.lineTaxable, 0));

  // 3: apportion the header discount and freight pro-rata. Guard against a zero base so a
  // discount on an empty/zero invoice can't produce NaN.
  const spread = (total, weightBase) => (line) =>
    weightBase > 0 ? r2(total * (line.lineTaxable / weightBase)) : 0;
  const discShare = spread(Math.min(headerDiscount, grossTaxable), grossTaxable);
  const shipShare = spread(shipping, grossTaxable);

  const lines = base.map((l) => {
    const taxable = r2(l.lineTaxable - discShare(l) + shipShare(l));
    const tax = r2(taxable * l.taxRate / 100);
    return { ...l, taxable_value: taxable, tax_amount: tax };
  });

  // Rounding the apportionment per line loses/gains paise against the header; give the
  // difference to the largest line so `sum(lines) === header` holds exactly.
  const targetTaxable = r2(grossTaxable - Math.min(headerDiscount, grossTaxable) + shipping);
  const lineSum = r2(lines.reduce((s, l) => s + l.taxable_value, 0));
  if (lines.length && lineSum !== targetTaxable) {
    const drift = r2(targetTaxable - lineSum);
    const biggest = lines.reduce((a, b) => (b.taxable_value > a.taxable_value ? b : a), lines[0]);
    biggest.taxable_value = r2(biggest.taxable_value + drift);
    biggest.tax_amount = r2(biggest.taxable_value * biggest.taxRate / 100);
  }

  const taxable_total = r2(lines.reduce((s, l) => s + l.taxable_value, 0));
  const gst_amount = r2(lines.reduce((s, l) => s + l.tax_amount, 0));

  // 5: inter-state only when BOTH states are known and differ. Unknown is NOT treated as
  // intra-state — a confident wrong split misstates the tax on a legal document.
  const known = !!(place_of_supply_code && seller_state_code);
  const is_inter_state = known ? place_of_supply_code !== seller_state_code : null;

  let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
  if (is_inter_state === true) igst_amount = gst_amount;
  else if (is_inter_state === false) { cgst_amount = r2(gst_amount / 2); sgst_amount = r2(gst_amount - cgst_amount); }
  // is_inter_state === null: the split is left at zero and gst_amount still carries the
  // total, so nothing is claimed that isn't known.

  for (const l of lines) {
    l.cgst_amount = is_inter_state === false ? r2(l.tax_amount / 2) : 0;
    l.sgst_amount = is_inter_state === false ? r2(l.tax_amount - l.cgst_amount) : 0;
    l.igst_amount = is_inter_state === true ? l.tax_amount : 0;
    // `amount` stays the column the rest of the system already reads: value before tax.
    l.amount = l.taxable_value;
  }

  // 6: under reverse charge the supplier does not collect the tax.
  const collectible = reverse_charge ? taxable_total : r2(taxable_total + gst_amount);

  // 7: round to the nearest rupee, and record the adjustment.
  const total_amount = round_off_enabled ? Math.round(collectible) : collectible;
  const round_off = r2(total_amount - collectible);

  return {
    lines,
    subtotal: grossTaxable,
    discount_amount: Math.min(headerDiscount, grossTaxable),
    shipping_amount: shipping,
    taxable_total,
    cgst_amount, sgst_amount, igst_amount, cess_amount: 0,
    gst_amount,
    is_inter_state,
    reverse_charge: !!reverse_charge,
    pre_round_total: collectible,
    round_off,
    total_amount: r2(total_amount),
  };
}

/** Due date from the customer's payment terms — "Net 30" instead of typing a date. */
function dueDateFromTerms(invoiceDate, termsDays) {
  const days = num(termsDays, 0);
  if (!invoiceDate) return null;
  const d = new Date(`${String(invoiceDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

// ── Amount in words ──────────────────────────────────────────────────────────
// Indian numbering (lakh/crore), because "Rupees One Lakh Twenty Thousand Only" is what a
// tax invoice is expected to carry — and a Western grouping would read as wrong to anyone
// checking it.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigits(n) {
  const h = Math.floor(n / 100), rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}
function inWords(amount, currency = "INR") {
  const n = Math.abs(r2(amount));
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  const unit = currency === "INR" ? "Rupees" : currency;
  const sub = currency === "INR" ? "Paise" : "Cents";
  if (whole === 0 && paise === 0) return `${unit} Zero Only`;

  const parts = [];
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  const sign = amount < 0 ? "Minus " : "";
  const main = parts.length ? `${unit} ${parts.join(" ")}` : `${unit} Zero`;
  return `${sign}${main}${paise ? ` and ${twoDigits(paise)} ${sub}` : ""} Only`;
}

module.exports = { computeInvoice, dueDateFromTerms, inWords, r2 };
