"use strict";
// Money-math for invoice receipts: partial, advance-to-full, overpayment, penny rounding.
// A regression here mis-states collection or drives AR negative. Run: node --test src/lib/invoicePaymentMath.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { applyReceipt, remainingToSettle, round2 } = require("./invoicePaymentMath");

test("full payment from zero settles the invoice", () => {
  const r = applyReceipt({ total: 1000, paidAmount: 0 }, 1000);
  assert.equal(r.ok, true);
  assert.equal(r.newPaid, 1000);
  assert.equal(r.balanceAfter, 0);
  assert.equal(r.fullyPaid, true);
});

test("partial payment leaves a balance and is not fully paid", () => {
  const r = applyReceipt({ total: 1000, paidAmount: 0 }, 300);
  assert.equal(r.ok, true);
  assert.equal(r.newPaid, 300);
  assert.equal(r.balanceAfter, 700);
  assert.equal(r.fullyPaid, false);
});

test("a second receipt that clears the balance flips to fully paid", () => {
  const r = applyReceipt({ total: 1000, paidAmount: 300 }, 700);
  assert.equal(r.newPaid, 1000);
  assert.equal(r.fullyPaid, true);
  assert.equal(r.balanceAfter, 0);
});

test("overpayment is refused (never drives AR negative)", () => {
  const r = applyReceipt({ total: 1000, paidAmount: 800 }, 300);
  assert.equal(r.ok, false);
  assert.equal(r.error, "overpayment");
  assert.equal(r.balanceBefore, 200);
});

test("non-positive amount is refused", () => {
  assert.equal(applyReceipt({ total: 1000, paidAmount: 0 }, 0).ok, false);
  assert.equal(applyReceipt({ total: 1000, paidAmount: 0 }, -50).ok, false);
});

test("paying the exact outstanding to the paise is allowed and fully paid", () => {
  const r = applyReceipt({ total: 100.1, paidAmount: 0 }, 100.1);
  assert.equal(r.ok, true);
  assert.equal(r.fullyPaid, true);
  assert.equal(r.balanceAfter, 0);
});

test("three uneven paise-split receipts fully settle with no residue", () => {
  let paid = 0;
  for (const amt of [33.34, 33.33, 33.33]) {
    const r = applyReceipt({ total: 100, paidAmount: paid }, amt);
    assert.equal(r.ok, true, `receipt of ${amt} should apply`);
    paid = r.newPaid;
  }
  assert.equal(paid, 100);
  assert.equal(applyReceipt({ total: 100, paidAmount: paid }, 0.01).ok, false, "nothing left to pay");
});

test("remainingToSettle returns the unpaid balance, 0 when already covered", () => {
  assert.equal(remainingToSettle({ total: 1000, paidAmount: 0 }), 1000);
  assert.equal(remainingToSettle({ total: 1000, paidAmount: 600 }), 400);
  assert.equal(remainingToSettle({ total: 1000, paidAmount: 1000 }), 0);
});

test("round2 tames binary-float drift", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
});
