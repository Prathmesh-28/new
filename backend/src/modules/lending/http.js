"use strict";
// SMB embedded lending REST - mounted at /api/lending. Same conventions as the other
// modules: authenticate, tenantOf(), per-domain WRITE_ROLES, fail(). Disbursal/e-mandate
// rails are credential-gated (capabilities) and reported, never faked.
const router = require("express").Router();
const { authenticate } = require("../../middleware/auth");
const lending = require("./index");
const servicing = require("./servicing");
const mandates = require("./mandates");
let capabilities; try { capabilities = require("../../routes/capabilities").capabilities; } catch { capabilities = () => ({}); }

router.use(authenticate);
router.use(require("../../lib/entitlements").requireFeature("lending"));

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
// Issued, unpaid invoices the tenant can turn into cash, each with an indicative advance.
// Powers the "advance this invoice" picker; real AR data, no gated rail touched.
router.get("/financeable-invoices", async (req, res) => {
  try { res.json(await lending.financeableInvoices(tenantOf(req))); } catch (e) { fail(res, e); }
});
router.get("/offers", async (req, res) => {
  try { res.json(await lending.listOffers(tenantOf(req))); } catch (e) { fail(res, e); }
});
router.post("/offers", canWrite, async (req, res) => {
  try {
    const offer = await lending.createOffer(tenantOf(req), req.user.id, req.body || {});
    require("../analytics").track(req.user.tenant_id, req.user.id, { event: "loan_offer_created", props: { kind: offer.kind, principal: offer.principal } }).catch(() => {});
    res.status(201).json({ offer, rails: rails() });
  } catch (e) { fail(res, e); }
});
router.post("/offers/:id/accept", canWrite, async (req, res) => {
  try {
    const loan = await lending.acceptOffer(tenantOf(req), req.params.id, req.user.id);
    require("../analytics").track(req.user.tenant_id, req.user.id, { event: "loan_accepted", props: { kind: loan.kind, principal: loan.principal } }).catch(() => {});
    res.json({ loan, rails: rails() });
  } catch (e) { fail(res, e); }
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

// ── Servicing (LMS depth): DPD/NPA, penal interest, settlements ────────────────
// Portfolio book health (DPD/NPA distribution, overdue + penal totals).
router.get("/servicing", async (req, res) => {
  try { res.json(await servicing.portfolioSummary(tenantOf(req))); } catch (e) { fail(res, e); }
});
// Manually run the servicing pass for this tenant (the daily cron does it automatically).
router.post("/servicing/run", canWrite, async (req, res) => {
  try { res.json(await servicing.runServicing(tenantOf(req))); } catch (e) { fail(res, e); }
});
// Settle/waive a loan (borrower pays part, lender forgives the rest of the principal).
router.post("/loans/:id/settle", canWrite, async (req, res) => {
  try { res.json(await servicing.settleLoan(tenantOf(req), req.params.id, { settlementAmount: req.body?.settlement_amount, note: req.body?.note, actorId: req.user.id })); } catch (e) { fail(res, e); }
});

// ── e-NACH / UPI-Autopay mandates (auto-collection) ───────────────────────────
router.get("/mandates", async (req, res) => {
  try { res.json(await mandates.listMandates(tenantOf(req), req.query.loan_id)); } catch (e) { fail(res, e); }
});
router.get("/mandates/:id/presentations", async (req, res) => {
  try { res.json(await mandates.listPresentations(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.post("/loans/:id/mandate", canWrite, async (req, res) => {
  try { const b = req.body || {}; res.status(201).json(await mandates.createMandate(tenantOf(req), req.params.id, { provider: b.provider, maxAmount: b.max_amount, frequency: b.frequency, debitAccount: b.debit_account, actorId: req.user.id })); } catch (e) { fail(res, e); }
});
router.post("/mandates/:id/activate", canWrite, async (req, res) => {
  try { res.json(await mandates.activateMandate(tenantOf(req), req.params.id, { providerRef: (req.body || {}).provider_ref })); } catch (e) { fail(res, e); }
});
router.post("/mandates/:id/pause", canWrite, async (req, res) => {
  try { res.json(await mandates.pauseMandate(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
router.post("/mandates/:id/revoke", canWrite, async (req, res) => {
  try { res.json(await mandates.revokeMandate(tenantOf(req), req.params.id)); } catch (e) { fail(res, e); }
});
// Schedule presentations for this tenant's active mandates (the daily cron does it too).
router.post("/mandates/present", canWrite, async (req, res) => {
  try { res.json(await mandates.presentDue(tenantOf(req))); } catch (e) { fail(res, e); }
});
// Resolve a scheduled presentation (webhook or operator): success → repayment; bounced → DPD.
router.post("/presentations/:id/result", canWrite, async (req, res) => {
  try { res.json(await mandates.recordPresentationResult(tenantOf(req), req.params.id, (req.body || {}).result, { ref: (req.body || {}).ref, actorId: req.user.id })); } catch (e) { fail(res, e); }
});

module.exports = router;
