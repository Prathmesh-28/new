"use strict";
// DB-free unit tests for the payouts provider seam: status normalization (each rail's vocabulary
// → our state machine) and fail-closed webhook verification. Run: node --test src/modules/payouts
const { test } = require("node:test");
const assert = require("node:assert");
const { normalizeStatus, verifyWebhook, payoutProvider } = require("./providers");

test("razorpayx status mapping", () => {
  assert.equal(normalizeStatus("razorpayx", "processed"), "settled");
  assert.equal(normalizeStatus("razorpayx", "queued"), "queued");
  assert.equal(normalizeStatus("razorpayx", "processing"), "processing");
  assert.equal(normalizeStatus("razorpayx", "reversed"), "reversed");
  assert.equal(normalizeStatus("razorpayx", "failed"), "failed");
  assert.equal(normalizeStatus("razorpayx", "cancelled"), "cancelled");
  assert.equal(normalizeStatus("razorpayx", "who-knows"), null); // unknown → caller keeps current
});

test("setu status mapping", () => {
  assert.equal(normalizeStatus("setu", "SUCCESSFUL"), "settled");
  assert.equal(normalizeStatus("setu", "PENDING"), "processing");
  assert.equal(normalizeStatus("setu", "FAILED"), "failed");
  assert.equal(normalizeStatus("setu", "reversed"), "reversed");
});

test("webhook verify is fail-closed without a secret", () => {
  // No secret env set in test → must reject even a present signature (never trust unsigned).
  assert.equal(verifyWebhook("razorpayx", Buffer.from("{}"), "deadbeef"), false);
  assert.equal(verifyWebhook("setu", Buffer.from("{}"), ""), false);
});

test("manual is always available; unconfigured rails are not", () => {
  assert.equal(payoutProvider.isConfigured("manual"), true);
  assert.equal(payoutProvider.resolve(), "manual"); // no creds in test → manual
  assert.equal(payoutProvider.resolve("razorpayx"), "manual"); // preferred-but-credless → manual, never faked
});
