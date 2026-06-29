"use strict";
// SMB embedded lending REST — mounted at /api/lending. Same conventions as the other
// modules: authenticate, tenantOf(), per-domain WRITE_ROLES, fail(). Disbursal/e-mandate
// rails are credential-gated (capabilities) and reported, never faked.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const lending = require("./index");
let capabilities; try { capabilities = require("../../routes/capabilities").capabilities; } catch { capabilities = () => ({}); }

router.use(authenticate);

const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant"];
const canWrite = (req, res, next) => (WRITE_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" }));
const fail = (res, e) => {
  if (e instanceof lending.LendError) return res.status(e.http).json({ error: e.message, code: e.code });
  if (e && e.http && e.message) return res.status(e.http).json({ error: e.message, code: e.code });
  console.error("[lending]", e.message);
  return res.status(500).json({ error: "Internal error" });
};
// Honest rail status surfaced on offers/loans so the UI shows Live vs Preview.
const rails = () => { const c = capabilities() || {}; return { disbursal: !!c.payments, emandate: !!c.payments, kyc: !!c.kyc, bankData: !!c.bankSync }; };

router.get("/eligibility", async (req, res) => {
  try { res.json({ ...(await lending.eligibility(tenantOf(req))), rails: rails() }); } catch (e) { fail(res, e); }
});

// ── Offers (LOS) ─────────────────────────────────────────────────────────────
router.get("/offers", async (req, res) => {
  try { res.json(await lending.listOffers(tenantOf(req))); } catch (e) { fail(res, e); }
});
router.post("/offers", canWrite, async (req, res) => {
  try { res.status(201).json({ offer: await lending.createOffer(tenantOf(req), req.user.id, req.body || {}), rails: rails() }); } catch (e) { fail(res, e); }
});
router.post("/offers/:id/accept", canWrite, async (req, res) => {
  try { res.json({ loan: await lending.acceptOffer(tenantOf(req), req.params.id, req.user.id), rails: rails() }); } catch (e) { fail(res, e); }
});
router.post("/offers/:id/decline", canWrite, async (req, res) => {
  try { res.json(await lending.declineOffer(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});

// ── Loans (LMS) ──────────────────────────────────────────────────────────────
router.get("/loans", async (req, res) => {
  try { res.json(await lending.listLoans(tenantOf(req))); } catch (e) { fail(res, e); }
});
router.get("/loans/:id", async (req, res) => {
  try { res.json(await lending.getLoan(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.post("/loans/:id/repay", canWrite, async (req, res) => {
  try { res.json(await lending.recordRepayment(tenantOf(req), req.params.id, { amount: req.body?.amount, method: req.body?.method, ref: req.body?.ref, actorId: req.user.id })); } catch (e) { fail(res, e); }
});

module.exports = router;
