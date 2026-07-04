"use strict";
// Vendor bills REST surface - /api/vendor-bills. Session-authenticated; write actions gated to
// the same roles as the vendor master and books (owner/finance/ops), consistent with
// routes/vendors.js. All business logic lives in modules/vendorBills.js.
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const vb = require("../modules/vendorBills");
const { PostError } = require("../modules/books/posting-engine");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
// These actions post real GL vouchers (a PURCHASE bill, a PAYMENT that moves bank money) — the
// same action modules/books/http.js gates as POST_ROLES, NOT the wider vendor-master-profile
// role list (routes/vendors.js/suppliers.js include operations_manager for non-ledger data only).
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];
const canWrite = (req, res, next) => WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });

function fail(res, e) {
  if (e instanceof PostError) return res.status(e.http || 422).json({ error: e.message, code: e.code });
  console.error("[vendor-bills]", e.message);
  return res.status(500).json({ error: "Internal error" });
}

// GET /api/vendor-bills/aging - AP aging across every vendor with an open bill.
router.get("/aging", async (req, res) => {
  try { res.json(await vb.apAgingSummary(tenantOf(req))); } catch (e) { fail(res, e); }
});

// GET /api/vendor-bills?vendor_id=... - bill history/register for one vendor.
router.get("/", async (req, res) => {
  try {
    if (!req.query.vendor_id) return res.status(400).json({ error: "vendor_id is required" });
    res.json(await vb.listBills(tenantOf(req), String(req.query.vendor_id)));
  } catch (e) { fail(res, e); }
});

// POST /api/vendor-bills - record a bill (posts a real PURCHASE/RCM voucher, optional TDS).
router.post("/", canWrite, async (req, res) => {
  try {
    const r = await vb.recordBill(tenantOf(req), req.user.id, req.body || {});
    require("../modules/analytics").track(tenantOf(req), req.user.id, { event: "vendor_bill_recorded", props: { voucher_number: r.voucherNumber } }).catch(() => {});
    res.status(201).json(r);
  } catch (e) { fail(res, e); }
});

// POST /api/vendor-bills/pay - pay a vendor (a specific bill, or FIFO across open bills).
router.post("/pay", canWrite, async (req, res) => {
  try {
    const r = await vb.payBill(tenantOf(req), req.user.id, req.body || {});
    require("../modules/analytics").track(tenantOf(req), req.user.id, { event: "vendor_bill_paid", props: { voucher_number: r.voucherNumber } }).catch(() => {});
    res.status(201).json(r);
  } catch (e) { fail(res, e); }
});

module.exports = router;
