const { test } = require("node:test");
const assert = require("node:assert");

const { validateBody } = require("../src/lib/validate");
const { capabilities } = require("../src/routes/capabilities");
const { securityHeaders } = require("../src/middleware/security");

// Minimal Express req/res doubles so we can exercise middleware without a server.
function runValidator(spec, body) {
  let code = 200, out = null, nexted = false;
  const res = { status: (c) => { code = c; return res; }, json: (o) => { out = o; } };
  validateBody(spec)({ body }, res, () => { nexted = true; });
  return { code, out, nexted };
}

test("validateBody passes well-formed input", () => {
  const r = runValidator(
    { email: { type: "email", required: true }, password: { type: "string", required: true, minLen: 8 } },
    { email: "a@b.co", password: "longenough" }
  );
  assert.ok(r.nexted);
  assert.equal(r.code, 200);
});

test("validateBody rejects bad email / short password / bad enum / overlong", () => {
  assert.equal(runValidator({ email: { type: "email", required: true } }, { email: "nope" }).code, 400);
  assert.equal(runValidator({ p: { type: "string", required: true, minLen: 8 } }, { p: "short" }).code, 400);
  assert.equal(runValidator({ role: { type: "string", enum: ["owner"] } }, { role: "x" }).code, 400);
  assert.equal(runValidator({ n: { type: "string", maxLen: 3 } }, { n: "abcd" }).code, 400);
  assert.equal(runValidator({ a: { type: "number", min: 1 } }, { a: 0 }).code, 400);
});

test("validateBody skips optional absent fields", () => {
  const r = runValidator({ note: { type: "string", maxLen: 500 } }, {});
  assert.ok(r.nexted);
});

test("capabilities returns the full boolean map", () => {
  const caps = capabilities();
  const expected = [
    "payments", "ai", "whatsapp", "push", "email", "bankSync", "creditDisbursement",
    "bnplPayout", "ewaPayout", "gstEInvoice", "kyc", "lenderMarketplace",
    "supplierMarketplace", "treasurySweep",
  ];
  for (const k of expected) assert.equal(typeof caps[k], "boolean", `${k} should be boolean`);
  // Marketplaces + sweep are always preview until partners onboard.
  assert.equal(caps.lenderMarketplace, false);
  assert.equal(caps.supplierMarketplace, false);
  assert.equal(caps.treasurySweep, false);
});

test("capabilities reflects configured env keys", () => {
  const prev = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
  assert.equal(capabilities().payments, true);
  delete process.env.RAZORPAY_KEY_ID;
  assert.equal(capabilities().payments, false);
  if (prev !== undefined) process.env.RAZORPAY_KEY_ID = prev;
});

test("securityHeaders sets strict headers", () => {
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  let nexted = false;
  securityHeaders({ secure: true, headers: {} }, res, () => { nexted = true; });
  assert.ok(nexted);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"], /default-src 'none'/);
  assert.ok(headers["Strict-Transport-Security"]); // asserted because req.secure
});

test("securityHeaders omits HSTS on plain HTTP", () => {
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  securityHeaders({ secure: false, headers: {} }, res, () => {});
  assert.equal(headers["Strict-Transport-Security"], undefined);
});
