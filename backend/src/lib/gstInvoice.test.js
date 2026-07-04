"use strict";
// Tax-split shown on the customer-facing invoice document. A regression here prints the wrong
// tax heads on a statutory document. Run: node --test src/lib/gstInvoice.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { taxSplit, stateOf, stateName } = require("./gstInvoice");

test("intra-state: CGST+SGST halves that sum exactly to the GST amount", () => {
  const s = taxSplit({ gstAmount: 180.01, gstRate: 18, buyerGstin: "27AAACB1234C1Z5", sellerGstin: "27AAACS9999D1Z2" });
  assert.equal(s.interState, false);
  assert.equal(s.lines.length, 2);
  assert.equal(s.lines[0].label, "CGST (9%)");
  assert.equal(s.lines[1].label, "SGST (9%)");
  assert.equal(s.lines[0].amount + s.lines[1].amount, 180.01, "halves must sum exactly (SGST takes the odd paise)");
  assert.equal(s.placeOfSupply.code, "27");
  assert.equal(s.placeOfSupply.name, "Maharashtra");
});

test("inter-state: single IGST line at the full rate", () => {
  const s = taxSplit({ gstAmount: 180, gstRate: 18, buyerGstin: "29AAACB1234C1Z5", sellerGstin: "27AAACS9999D1Z2" });
  assert.equal(s.interState, true);
  assert.deepEqual(s.lines, [{ label: "IGST (18%)", amount: 180 }]);
  assert.equal(s.placeOfSupply.code, "29", "place of supply is the BUYER's state");
  assert.equal(s.placeOfSupply.name, "Karnataka");
});

test("B2C (no buyer GSTIN) falls back to intra-state at the seller's state", () => {
  const s = taxSplit({ gstAmount: 100, gstRate: 18, buyerGstin: null, sellerGstin: "24AAACS9999D1Z2" });
  assert.equal(s.interState, false);
  assert.equal(s.lines.length, 2);
  assert.equal(s.placeOfSupply.code, "24");
  assert.equal(s.placeOfSupply.name, "Gujarat");
});

test("no GSTIN on either side: intra split, no place of supply", () => {
  const s = taxSplit({ gstAmount: 90, gstRate: 18, buyerGstin: null, sellerGstin: null });
  assert.equal(s.interState, false);
  assert.equal(s.placeOfSupply, null);
  assert.equal(s.lines[0].amount + s.lines[1].amount, 90);
});

test("zero GST → no tax lines (exempt/zero-rated documents stay clean)", () => {
  const s = taxSplit({ gstAmount: 0, gstRate: 0, buyerGstin: "27X", sellerGstin: "27Y" });
  assert.deepEqual(s.lines, []);
});

test("malformed GSTIN (no leading digits) is treated as absent", () => {
  assert.equal(stateOf("ABCDE1234F"), null);
  assert.equal(stateOf("27AAACB1234C1Z5"), "27");
  assert.equal(stateOf(null), null);
  const s = taxSplit({ gstAmount: 18, gstRate: 18, buyerGstin: "GARBAGE", sellerGstin: "27AAACS9999D1Z2" });
  assert.equal(s.interState, false, "malformed buyer → intra fallback, same as the GL");
});

test("stateName covers the common codes", () => {
  assert.equal(stateName("07"), "Delhi");
  assert.equal(stateName("33"), "Tamil Nadu");
  assert.equal(stateName("99"), null);
});
