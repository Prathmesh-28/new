"use strict";
// Cadence math for recurring invoices. A regression here bills customers on wrong dates or
// skips/duplicates a month. Run: node --test src/lib/recurringDates.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { nextRunAfter, advancePastToday } = require("./recurringDates");

test("monthly advances a month on the anchor day", () => {
  assert.equal(nextRunAfter("2026-03-15", "monthly", 15), "2026-04-15");
});

test("monthly 31st clamps to short months and returns to the 31st after", () => {
  assert.equal(nextRunAfter("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(nextRunAfter("2026-02-28", "monthly", 31), "2026-03-31", "anchor day recovers after the clamp");
});

test("monthly clamps to Feb 29 in a leap year", () => {
  assert.equal(nextRunAfter("2028-01-30", "monthly", 30), "2028-02-29");
});

test("monthly December rolls into January of the next year", () => {
  assert.equal(nextRunAfter("2026-12-10", "monthly", 10), "2027-01-10");
});

test("quarterly steps three months, clamped", () => {
  assert.equal(nextRunAfter("2026-01-31", "quarterly", 31), "2026-04-30");
  assert.equal(nextRunAfter("2026-11-30", "quarterly", 30), "2027-02-28", "over year-end into February");
});

test("weekly adds exactly 7 days across month/year boundaries", () => {
  assert.equal(nextRunAfter("2026-06-28", "weekly"), "2026-07-05");
  assert.equal(nextRunAfter("2026-12-29", "weekly"), "2027-01-05");
});

test("dayOfMonth falls back to the from-date's day when omitted", () => {
  assert.equal(nextRunAfter("2026-05-07", "monthly"), "2026-06-07");
});

test("advancePastToday skips missed periods and reports the count", () => {
  // schedule due 2026-01-05, server wakes on 2026-04-10 → next is 2026-05-05, 3 periods skipped
  const r = advancePastToday("2026-01-05", "2026-04-10", "monthly", 5);
  assert.equal(r.next, "2026-05-05");
  assert.equal(r.skipped, 3);
});

test("advancePastToday with nothing missed advances exactly one period", () => {
  const r = advancePastToday("2026-07-04", "2026-07-04", "monthly", 4);
  assert.equal(r.next, "2026-08-04");
  assert.equal(r.skipped, 0);
});
