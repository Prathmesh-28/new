"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeInvoice, dueDateFromTerms, inWords } = require("./invoiceTotals");

const line = (qty, rate, extra = {}) => ({ quantity: qty, unit_price: rate, ...extra });
const sum = (xs, f) => Math.round(xs.reduce((s, x) => s + f(x), 0) * 100) / 100;

test("the simple case: one line, intra-state, splits into equal CGST and SGST", () => {
  const r = computeInvoice({ items: [line(2, 500)], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" });
  assert.equal(r.taxable_total, 1000);
  assert.equal(r.gst_amount, 180);
  assert.equal(r.cgst_amount, 90);
  assert.equal(r.sgst_amount, 90);
  assert.equal(r.igst_amount, 0);
  assert.equal(r.is_inter_state, false);
  assert.equal(r.total_amount, 1180);
});

test("different states means IGST and nothing else", () => {
  const r = computeInvoice({ items: [line(1, 1000)], gst_rate: 18, place_of_supply_code: "29", seller_state_code: "27" });
  assert.equal(r.is_inter_state, true);
  assert.equal(r.igst_amount, 180);
  assert.equal(r.cgst_amount, 0);
  assert.equal(r.sgst_amount, 0);
});

test("an unknown place of supply is left UNKNOWN, not assumed intra-state", () => {
  // Guessing here would print a wrong tax split on a legal document.
  const r = computeInvoice({ items: [line(1, 1000)], gst_rate: 18, place_of_supply_code: null, seller_state_code: "27" });
  assert.equal(r.is_inter_state, null);
  assert.equal(r.cgst_amount, 0);
  assert.equal(r.sgst_amount, 0);
  assert.equal(r.igst_amount, 0);
  assert.equal(r.gst_amount, 180, "the tax total is still known even when the split isn't");
});

test("CGST + SGST always sum EXACTLY to the tax, including on odd paise", () => {
  // 18% of 555.55 = 99.999 → 100.00; halving that naively gives 50.00 + 50.00, but an odd
  // total (e.g. 100.01) must not lose or invent a paisa.
  for (const amount of [555.55, 333.33, 101.01, 1234.57, 7.77]) {
    const r = computeInvoice({ items: [line(1, amount)], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" });
    assert.equal(Math.round((r.cgst_amount + r.sgst_amount) * 100) / 100, r.gst_amount, `failed at ${amount}`);
  }
});

test("per-line percentage discount reduces the taxable value, not the tax rate", () => {
  const r = computeInvoice({ items: [line(1, 1000, { discount_pct: 10 })], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" });
  assert.equal(r.taxable_total, 900);
  assert.equal(r.gst_amount, 162); // 18% of 900, not of 1000
  assert.equal(r.total_amount, 1062);
});

test("an explicit per-line discount amount wins over the percentage", () => {
  const r = computeInvoice({ items: [line(1, 1000, { discount_pct: 10, discount_amount: 250 })], gst_rate: 18 });
  assert.equal(r.taxable_total, 750);
});

test("a line discount can't exceed the line", () => {
  const r = computeInvoice({ items: [line(1, 100, { discount_amount: 500 })], gst_rate: 18 });
  assert.equal(r.taxable_total, 0);
  assert.equal(r.gst_amount, 0);
});

test("a header discount is apportioned across lines so GST falls on the discounted value", () => {
  // A flat discount applied after tax would overstate the GST collected.
  const r = computeInvoice({
    items: [line(1, 1000), line(1, 3000)], gst_rate: 18, discount_amount: 400,
    place_of_supply_code: "27", seller_state_code: "27",
  });
  assert.equal(r.taxable_total, 3600);
  assert.equal(r.gst_amount, 648); // 18% of 3600
  assert.equal(r.lines[0].taxable_value, 900);  // 1000 less its 25% share of the 400
  assert.equal(r.lines[1].taxable_value, 2700); // 3000 less its 75% share
});

test("freight is taxed with the goods, apportioned the same way", () => {
  const r = computeInvoice({ items: [line(1, 1000)], gst_rate: 18, shipping_amount: 200, place_of_supply_code: "27", seller_state_code: "27" });
  assert.equal(r.taxable_total, 1200);
  assert.equal(r.gst_amount, 216);
});

test("line taxable values always add up to the header total, even when apportionment rounds", () => {
  // Three equal lines and a discount that doesn't divide by three: the paise have to land
  // somewhere, and the invariant is that they land ON the invoice.
  const r = computeInvoice({ items: [line(1, 100), line(1, 100), line(1, 100)], gst_rate: 18, discount_amount: 10 });
  assert.equal(sum(r.lines, (l) => l.taxable_value), r.taxable_total);
  assert.equal(r.taxable_total, 290);
  assert.equal(sum(r.lines, (l) => l.tax_amount), r.gst_amount);
});

test("mixed GST rates are taxed per line, never at a blended header rate", () => {
  const r = computeInvoice({
    items: [line(1, 1000, { gst_rate: 5 }), line(1, 1000, { gst_rate: 18 })],
    gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27",
  });
  assert.equal(r.gst_amount, 230); // 50 + 180
});

test("reverse charge: the tax is computed and reported but not collected", () => {
  const r = computeInvoice({ items: [line(1, 1000)], gst_rate: 18, reverse_charge: true, place_of_supply_code: "27", seller_state_code: "27" });
  assert.equal(r.gst_amount, 180, "still reported — the liability exists");
  assert.equal(r.total_amount, 1000, "but the supplier doesn't collect it");
});

test("round-off is to the nearest rupee and is recorded, so the total ties back", () => {
  const r = computeInvoice({ items: [line(1, 999.5)], gst_rate: 18, place_of_supply_code: "27", seller_state_code: "27" });
  assert.equal(r.pre_round_total, 1179.41);
  assert.equal(r.total_amount, 1179);
  assert.equal(r.round_off, -0.41);
  assert.equal(Math.round((r.pre_round_total + r.round_off) * 100) / 100, r.total_amount);
});

test("round-off can be turned off for a customer who wants the exact figure", () => {
  const r = computeInvoice({ items: [line(1, 999.5)], gst_rate: 18, round_off_enabled: false });
  assert.equal(r.total_amount, 1179.41);
  assert.equal(r.round_off, 0);
});

test("an empty invoice is zero everywhere rather than NaN", () => {
  const r = computeInvoice({ items: [], gst_rate: 18, discount_amount: 500 });
  assert.equal(r.taxable_total, 0);
  assert.equal(r.gst_amount, 0);
  assert.equal(r.total_amount, 0);
  assert.equal(r.discount_amount, 0, "a discount with nothing to discount is not applied");
});

test("junk quantities and rates are treated as zero, not NaN", () => {
  const r = computeInvoice({ items: [{ quantity: "abc", unit_price: null }], gst_rate: 18 });
  assert.equal(r.total_amount, 0);
  assert.ok(Number.isFinite(r.gst_amount));
});

test("due date comes from the customer's terms", () => {
  assert.equal(dueDateFromTerms("2026-09-01", 30), "2026-10-01");
  assert.equal(dueDateFromTerms("2026-09-01", 0), "2026-09-01");
  assert.equal(dueDateFromTerms("2026-01-31", 30), "2026-03-02"); // month-end arithmetic
  assert.equal(dueDateFromTerms(null, 30), null);
  assert.equal(dueDateFromTerms("not-a-date", 30), null);
});

test("due date does not shift a day near a timezone boundary", () => {
  // The whole point of storing dates as plain strings: no local-midnight conversion.
  assert.equal(dueDateFromTerms("2026-03-29", 1), "2026-03-30");
  assert.equal(dueDateFromTerms("2026-12-31", 1), "2027-01-01");
});

test("amount in words uses Indian lakh/crore grouping", () => {
  assert.equal(inWords(0), "Rupees Zero Only");
  assert.equal(inWords(1), "Rupees One Only");
  assert.equal(inWords(1180), "Rupees One Thousand One Hundred Eighty Only");
  assert.equal(inWords(100000), "Rupees One Lakh Only");
  assert.equal(inWords(10000000), "Rupees One Crore Only");
  assert.equal(inWords(123456.78), "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only");
  assert.equal(inWords(-500), "Minus Rupees Five Hundred Only");
});

test("amount in words handles the teens and the round tens", () => {
  assert.equal(inWords(15), "Rupees Fifteen Only");
  assert.equal(inWords(20), "Rupees Twenty Only");
  assert.equal(inWords(90), "Rupees Ninety Only");
  assert.equal(inWords(115), "Rupees One Hundred Fifteen Only");
});
