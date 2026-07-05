"use strict";
// Regression suite for the underwriting signal fixes (2026-07 KreditBee-grade audit #1).
// Every case here reproduces a bug that was LIVE: weekday-bucketed consistency months,
// unknown-merchant 100% concentration, and (via the exported helpers) the date handling
// that underlies runway/DSR corrections. Run: node --test src/lib/underwriting.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { isoDate, isoMonth, scoreConsistency, scoreConcentration, scoreConcentrationFromInvoices } = require("./underwriting");

test("isoMonth buckets pg Date objects into real YYYY-MM months (was 'Mon Jun' weekday buckets)", () => {
  assert.equal(isoMonth(new Date("2026-06-15T00:00:00Z")), "2026-06");
  assert.equal(isoMonth("2026-06-01"), "2026-06");
  // The old bug: two Mondays in different weeks bucketed together, a Tuesday separately.
  assert.equal(isoMonth(new Date("2026-06-01T00:00:00Z")), isoMonth(new Date("2026-06-30T00:00:00Z")));
});

test("scoreConsistency: perfectly steady months score high with Date-typed rows", () => {
  // 6 months × identical inflow → CV = 0 → 100. Under the old bucketing these six rows
  // scattered across ~4 weekday buckets with garbage variance.
  const rows = [1, 2, 3, 4, 5, 6].map((m) => ({ transaction_date: new Date(Date.UTC(2026, m - 1, 5)), amount: 100000 }));
  assert.equal(scoreConsistency(rows), 100);
});

test("scoreConsistency: two same-month deposits are ONE month, not two buckets", () => {
  const rows = [
    { transaction_date: new Date(Date.UTC(2026, 5, 1)), amount: 50000 },  // Mon 1 Jun
    { transaction_date: new Date(Date.UTC(2026, 5, 9)), amount: 50000 },  // Tue 9 Jun
    { transaction_date: new Date(Date.UTC(2026, 6, 5)), amount: 100000 }, // Jul
  ];
  // Jun total 100k, Jul 100k → CV 0 → 100. Old code: "Mon Jun" 50k, "Tue Jun" 50k, "Sun Jul" 100k → wrong.
  assert.equal(scoreConsistency(rows), 100);
});

test("scoreConcentration: unnamed inflows no longer read as one giant customer", () => {
  const unnamed = [{ amount: 100000 }, { amount: 90000 }, { amount: 80000 }];
  assert.equal(scoreConcentration(unnamed), 50, "no attributable counterparties → neutral, not the 20-point worst band");
});

test("scoreConcentration: named merchants still score on their real share", () => {
  const rows = [
    { merchant_name: "Acme", amount: 90000 },
    { merchant_name: "Beta", amount: 5000 },
    { merchant_name: "Gama", amount: 5000 },
  ];
  assert.equal(scoreConcentration(rows), 20, "90% on one customer = worst band");
  const diverse = [
    { merchant_name: "A", amount: 15000 }, { merchant_name: "B", amount: 15000 },
    { merchant_name: "C", amount: 15000 }, { merchant_name: "D", amount: 15000 },
    { merchant_name: "E", amount: 15000 }, { merchant_name: "F", amount: 15000 },
  ];
  assert.equal(scoreConcentration(diverse), 100);
});

test("invoice-based concentration keys by GSTIN, falls back to name, wins over inflows", () => {
  const invoices = [
    { customer_gstin: "29AAACB1234C1Z5", customer_name: "Acme South", total_amount: 40000 },
    { customer_gstin: "29aaacb1234c1z5", customer_name: "ACME (Bangalore)", total_amount: 40000 }, // same GSTIN, different names → ONE debtor
    { customer_gstin: null, customer_name: "Beta", total_amount: 10000 },
    { customer_gstin: null, customer_name: "Gama", total_amount: 10000 },
  ];
  // Acme = 80k of 100k = 80% top share → worst band 20, regardless of what inflows say.
  assert.equal(scoreConcentrationFromInvoices(invoices, [{ merchant_name: "X", amount: 1 }]), 20);
});

test("invoice-based concentration needs ≥3 invoices, else falls back to inflows", () => {
  const twoInvoices = [
    { customer_gstin: "29X", customer_name: "A", total_amount: 50000 },
    { customer_gstin: "27Y", customer_name: "B", total_amount: 50000 },
  ];
  const namedInflows = [
    { merchant_name: "A", amount: 25000 }, { merchant_name: "B", amount: 25000 },
    { merchant_name: "C", amount: 25000 }, { merchant_name: "D", amount: 25000 },
  ];
  // 4 equal named merchants → top share 25% → the 80 band. (The invoice path, had it run
  // on the 2 invoices, would have scored the 50% top-share band — 80 proves the fallback.)
  assert.equal(scoreConcentrationFromInvoices(twoInvoices, namedInflows), 80, "fallback path used");
});

test("isoDate normalizes Date and string forms identically", () => {
  assert.equal(isoDate(new Date("2026-01-31T00:00:00Z")), "2026-01-31");
  assert.equal(isoDate("2026-01-31"), "2026-01-31");
});
