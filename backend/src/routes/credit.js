const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { score: underwrite } = require("../lib/underwriting");

const LENDER_OFFERS = [
  { lender_partner: "Headroom Capital",    product_type: "revenue_advance",  factor_rate: 1.12, apr_equivalent: 0.28, repayment_pct: 0.08, term_months: 6,  min_score: 45 },
  { lender_partner: "InvoiceFirst",        product_type: "invoice_finance",  factor_rate: 1.08, apr_equivalent: 0.20, repayment_pct: 0.15, term_months: 4,  min_score: 55 },
  { lender_partner: "FlexCredit",          product_type: "credit_line",      factor_rate: 1.18, apr_equivalent: 0.32, repayment_pct: 0.06, term_months: 12, min_score: 40 },
  { lender_partner: "GrowthCapital India", product_type: "revenue_advance",  factor_rate: 1.15, apr_equivalent: 0.30, repayment_pct: 0.10, term_months: 8,  min_score: 60 },
];

// GET /api/credit/applications
router.get("/applications", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM credit_applications WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// GET /api/credit/applications/:id
router.get("/applications/:id", authenticate, async (req, res) => {
  const { rows: appRows } = await pool.query(
    "SELECT * FROM credit_applications WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!appRows[0]) return res.status(404).json({ error: "Not found" });

  const { rows: offerRows } = await pool.query(
    "SELECT * FROM credit_offers WHERE application_id=$1 AND status='active' ORDER BY offer_amount DESC",
    [req.params.id]
  );

  res.json({ application: appRows[0], offers: offerRows });
});

// POST /api/credit/apply — create application + run underwriting
router.post("/apply", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { requested_amount } = req.body;

  // Check no active pending application
  const { rows: existing } = await pool.query(
    "SELECT id FROM credit_applications WHERE tenant_id=$1 AND status IN ('pending','pre_qualified','offered') LIMIT 1",
    [req.user.tenant_id]
  );
  if (existing[0]) return res.status(409).json({ error: "An active application already exists", application_id: existing[0].id });

  // Velocity gate: max 1 application per 90 days (fraud prevention)
  const { rows: recent } = await pool.query(
    "SELECT id FROM credit_applications WHERE tenant_id=$1 AND created_at > now() - interval '90 days' LIMIT 1",
    [req.user.tenant_id]
  );
  if (recent[0]) return res.status(429).json({ error: "You may submit only one application per 90 days.", code: "velocity_limit" });

  // Run underwriting
  const result = await underwrite(req.user.tenant_id, pool);

  const status = result.score >= 35 ? "pre_qualified" : "declined";
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { rows: appRows } = await pool.query(
    `INSERT INTO credit_applications(tenant_id, status, requested_amount, underwriting_score, score_breakdown, fraud_check_status, expires_at, decline_reason)
     VALUES($1,$2,$3,$4,$5,'pass',$6,$7) RETURNING *`,
    [
      req.user.tenant_id,
      status,
      requested_amount || result.approved_amount,
      result.score,
      JSON.stringify(result.breakdown),
      expiry,
      status === "declined" ? "score_too_low" : null,
    ]
  );

  const app = appRows[0];

  if (status === "pre_qualified") {
    // Generate lender offers
    const eligibleLenders = LENDER_OFFERS.filter(l => result.score >= l.min_score);
    for (const lender of eligibleLenders) {
      const offerAmount = Math.min(requested_amount || result.approved_amount, result.approved_amount);
      await pool.query(
        `INSERT INTO credit_offers(application_id, tenant_id, lender_partner, product_type, offer_amount, factor_rate, apr_equivalent, repayment_pct, term_months)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [app.id, req.user.tenant_id, lender.lender_partner, lender.product_type, offerAmount, lender.factor_rate, lender.apr_equivalent, lender.repayment_pct, lender.term_months]
      );
    }
  }

  const { rows: offers } = await pool.query(
    "SELECT * FROM credit_offers WHERE application_id=$1 ORDER BY offer_amount DESC",
    [app.id]
  );

  res.status(201).json({ application: app, offers, underwriting: result });
});

// POST /api/credit/accept/:offerId
router.post("/accept/:offerId", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows: offerRows } = await pool.query(
    "SELECT co.*, ca.tenant_id AS app_tenant FROM credit_offers co JOIN credit_applications ca ON ca.id=co.application_id WHERE co.id=$1",
    [req.params.offerId]
  );
  if (!offerRows[0]) return res.status(404).json({ error: "Offer not found" });
  if (offerRows[0].app_tenant !== req.user.tenant_id) return res.status(403).json({ error: "Forbidden" });
  if (offerRows[0].status !== "active") return res.status(409).json({ error: "Offer no longer active" });

  // Accept offer
  await pool.query("UPDATE credit_offers SET status='accepted' WHERE id=$1", [req.params.offerId]);
  await pool.query("UPDATE credit_offers SET status='expired' WHERE application_id=$1 AND id!=$2", [offerRows[0].application_id, req.params.offerId]);
  await pool.query("UPDATE credit_applications SET status='accepted' WHERE id=$1", [offerRows[0].application_id]);

  // Create active loan
  const { rows: loanRows } = await pool.query(
    `INSERT INTO active_loans(tenant_id, offer_id, disbursed_amount, outstanding_balance, next_payment_at)
     VALUES($1,$2,$3,$3,$4) RETURNING *`,
    [req.user.tenant_id, req.params.offerId, offerRows[0].offer_amount, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]
  );

  res.json({ ok: true, loan: loanRows[0] });
});

// GET /api/credit/loans
router.get("/loans", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT al.*, co.lender_partner, co.product_type, co.factor_rate, co.repayment_pct
     FROM active_loans al JOIN credit_offers co ON co.id=al.offer_id
     WHERE al.tenant_id=$1 ORDER BY al.disbursed_at DESC`,
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/credit/loans/:id/payment — record a repayment
router.post("/loans/:id/payment", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Positive amount required" });

  const { rows } = await pool.query(
    "SELECT * FROM active_loans WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Loan not found" });

  const loan = rows[0];
  const paid        = Number(amount);
  const newOutstanding = Math.max(0, Number(loan.outstanding_balance) - paid);
  const newRepaid   = Number(loan.total_repaid) + paid;
  const nextPayment = new Date(loan.next_payment_at ?? Date.now());
  nextPayment.setMonth(nextPayment.getMonth() + 1);
  const newStatus   = newOutstanding === 0 ? "paid_off" : "current";

  const { rows: updated } = await pool.query(
    `UPDATE active_loans
     SET outstanding_balance=$1, total_repaid=$2, next_payment_at=$3, status=$4
     WHERE id=$5 AND tenant_id=$6 RETURNING *`,
    [newOutstanding, newRepaid, nextPayment.toISOString(), newStatus, req.params.id, req.user.tenant_id]
  );
  res.json(updated[0]);
});

// GET /api/credit/score — current underwriting score (no application created)
router.get("/score", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const result = await underwrite(req.user.tenant_id, pool);
  res.json(result);
});

module.exports = router;
