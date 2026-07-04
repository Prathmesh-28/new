"use strict";
// Pure bucket boundary for AP aging. A regression here mis-files a bill into the wrong
// aging bucket (understates overdue exposure). Run: node --test src/modules/vendorBills.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const { bucketOf } = require("./vendorBills");

test("bucketOf boundaries: current at 0, then 30/60 day steps, 61+ overflows to d60plus", () => {
  assert.equal(bucketOf(-5), "current");
  assert.equal(bucketOf(0), "current");
  assert.equal(bucketOf(1), "d30");
  assert.equal(bucketOf(30), "d30");
  assert.equal(bucketOf(31), "d60");
  assert.equal(bucketOf(60), "d60");
  assert.equal(bucketOf(61), "d60plus");
  assert.equal(bucketOf(365), "d60plus");
});
