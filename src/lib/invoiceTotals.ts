/**
 * Invoice money math — the browser half.
 *
 * A live preview that disagrees with what the server saves is worse than no preview: the
 * user approves one number and a different one is issued. This is a deliberate line-by-line
 * port of `backend/src/lib/invoiceTotals.js`, and `invoiceTotals.test.ts` runs both
 * implementations over the same cases and asserts they agree, so the two cannot drift.
 *
 * Rules (identical to the server): line gross → line discount → header discount and
 * freight apportioned pro-rata → tax per line at the line's own rate → inter-state ⇒ IGST,
 * otherwise CGST/SGST with SGST taking the odd paise → reverse charge excludes the tax
 * from the payable → round to the nearest rupee, recording the adjustment.
 */
export type InvoiceLineInput = {
  description?: string;
  hsn_sac?: string | null;
  uom?: string | null;
  quantity: number | string;
  unit_price: number | string;
  gst_rate?: number | string;
  discount_pct?: number | string;
  discount_amount?: number | string | null;
};

export type ComputedLine = InvoiceLineInput & {
  gross: number; discount_pct: number; discount_amount: number;
  taxRate: number; taxable_value: number; tax_amount: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number; amount: number;
};

export type InvoiceTotals = {
  lines: ComputedLine[];
  subtotal: number; discount_amount: number; shipping_amount: number; taxable_total: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number; cess_amount: number; gst_amount: number;
  is_inter_state: boolean | null; reverse_charge: boolean;
  pre_round_total: number; round_off: number; total_amount: number;
};

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n: unknown, d = 0) => { const x = Number(n); return Number.isFinite(x) ? x : d; };

export function computeInvoice({
  items = [], gst_rate = 18, discount_amount = 0, shipping_amount = 0,
  place_of_supply_code = null, seller_state_code = null,
  reverse_charge = false, round_off_enabled = true,
}: {
  items?: InvoiceLineInput[];
  gst_rate?: number | string;
  discount_amount?: number | string;
  shipping_amount?: number | string;
  place_of_supply_code?: string | null;
  seller_state_code?: string | null;
  reverse_charge?: boolean;
  round_off_enabled?: boolean;
} = {}): InvoiceTotals {
  const headerDiscount = Math.max(0, r2(discount_amount));
  const shipping = Math.max(0, r2(shipping_amount));

  const base = items.map((it) => {
    const qty = num(it.quantity, 0);
    const rate = num(it.unit_price, 0);
    const gross = r2(qty * rate);
    const pct = num(it.discount_pct, 0);
    const explicit = it.discount_amount != null && it.discount_amount !== "" ? Math.max(0, r2(it.discount_amount)) : null;
    const discount = Math.min(gross, explicit != null ? explicit : r2(gross * pct / 100));
    return {
      ...it, quantity: qty, unit_price: rate, gross, discount_pct: pct, discount_amount: discount,
      lineTaxable: r2(gross - discount), taxRate: num(it.gst_rate, num(gst_rate, 0)),
    };
  });

  const grossTaxable = r2(base.reduce((s, l) => s + l.lineTaxable, 0));
  const spread = (total: number) => (lineTaxable: number) =>
    grossTaxable > 0 ? r2(total * (lineTaxable / grossTaxable)) : 0;
  const discShare = spread(Math.min(headerDiscount, grossTaxable));
  const shipShare = spread(shipping);

  const lines = base.map((l) => {
    const taxable = r2(l.lineTaxable - discShare(l.lineTaxable) + shipShare(l.lineTaxable));
    return { ...l, taxable_value: taxable, tax_amount: r2(taxable * l.taxRate / 100) };
  });

  // Per-line rounding drifts against the header; the difference goes to the largest line so
  // sum(lines) === header exactly.
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

  const known = !!(place_of_supply_code && seller_state_code);
  const is_inter_state = known ? place_of_supply_code !== seller_state_code : null;

  let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
  if (is_inter_state === true) igst_amount = gst_amount;
  else if (is_inter_state === false) { cgst_amount = r2(gst_amount / 2); sgst_amount = r2(gst_amount - cgst_amount); }

  const out: ComputedLine[] = lines.map((l) => ({
    ...l,
    cgst_amount: is_inter_state === false ? r2(l.tax_amount / 2) : 0,
    sgst_amount: is_inter_state === false ? r2(l.tax_amount - r2(l.tax_amount / 2)) : 0,
    igst_amount: is_inter_state === true ? l.tax_amount : 0,
    amount: l.taxable_value,
  }));

  const collectible = reverse_charge ? taxable_total : r2(taxable_total + gst_amount);
  const total_amount = round_off_enabled ? Math.round(collectible) : collectible;

  return {
    lines: out,
    subtotal: grossTaxable,
    discount_amount: Math.min(headerDiscount, grossTaxable),
    shipping_amount: shipping,
    taxable_total,
    cgst_amount, sgst_amount, igst_amount, cess_amount: 0, gst_amount,
    is_inter_state, reverse_charge: !!reverse_charge,
    pre_round_total: collectible,
    round_off: r2(total_amount - collectible),
    total_amount: r2(total_amount),
  };
}

/** "Net 30" instead of typing a date. */
export function dueDateFromTerms(invoiceDate: string | null, termsDays: number | string): string | null {
  const days = num(termsDays, 0);
  if (!invoiceDate) return null;
  const d = new Date(`${String(invoiceDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n: number): string => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
const threeDigits = (n: number): string => {
  const h = Math.floor(n / 100), rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
};

/** Indian lakh/crore grouping — what a tax invoice is expected to carry. */
export function inWords(amount: number, currency = "INR"): string {
  const n = Math.abs(r2(amount));
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  const unit = currency === "INR" ? "Rupees" : currency;
  const sub = currency === "INR" ? "Paise" : "Cents";
  if (whole === 0 && paise === 0) return `${unit} Zero Only`;
  const parts: string[] = [];
  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  const main = parts.length ? `${unit} ${parts.join(" ")}` : `${unit} Zero`;
  return `${amount < 0 ? "Minus " : ""}${main}${paise ? ` and ${twoDigits(paise)} ${sub}` : ""} Only`;
}
