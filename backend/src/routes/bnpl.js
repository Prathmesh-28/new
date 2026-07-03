const router   = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const payouts  = require("../modules/payouts/index");

// GET /api/bnpl/facility
router.get("/facility", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT *, credit_limit - utilized_amount AS available FROM bnpl_facilities WHERE tenant_id=$1 AND status='active' LIMIT 1",
    [req.user.tenant_id]
  );
  if (!rows[0]) {
    // Auto-create a default facility based on underwriting score
    const { rows: kvRows } = await pool.query(
      "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='credit' AND key='store' LIMIT 1",
      [req.user.tenant_id]
    );
    const creditApps  = kvRows[0]?.value?.value?.creditApplications ?? [];
    const bestApp     = creditApps.find(a => a.status === "approved");
    const limit       = bestApp?.approvedAmount ? Math.round(bestApp.approvedAmount * 0.4) : 500000;
    const { rows: [fac] } = await pool.query(
      "INSERT INTO bnpl_facilities(tenant_id, credit_limit) VALUES($1,$2) RETURNING *, credit_limit - utilized_amount AS available",
      [req.user.tenant_id, limit]
    );
    return res.json(fac);
  }
  res.json(rows[0]);
});

// POST /api/bnpl/drawdown - initiate BNPL payment to supplier
router.post("/drawdown", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { po_id, supplier_name, amount, repayment_days = 30 } = req.body;
  if (!supplier_name || !amount) return res.status(400).json({ error: "supplier_name and amount required" });

  const { rows: [fac] } = await pool.query(
    "SELECT *, credit_limit - utilized_amount AS available FROM bnpl_facilities WHERE tenant_id=$1 AND status='active' LIMIT 1",
    [req.user.tenant_id]
  );
  if (!fac) return res.status(404).json({ error: "No active BNPL facility. Apply for credit first." });
  if (parseFloat(fac.available) < parseFloat(amount)) {
    return res.status(400).json({ error: `Insufficient facility. Available: ₹${parseFloat(fac.available).toLocaleString("en-IN")}` });
  }

  const fee_pct    = 0.025;
  const fee_amount = parseFloat((parseFloat(amount) * fee_pct).toFixed(2));
  const repayment_date = new Date(Date.now() + repayment_days * 86400000).toISOString().split("T")[0];

  const { rows: [dd] } = await pool.query(
    `INSERT INTO bnpl_drawdowns(facility_id, tenant_id, po_id, supplier_name, amount, fee_pct, fee_amount, repayment_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [fac.id, req.user.tenant_id, po_id ?? null, supplier_name, amount, fee_pct, fee_amount, repayment_date]
  );

  await pool.query(
    "UPDATE bnpl_facilities SET utilized_amount = utilized_amount + $1 WHERE id=$2",
    [amount, fac.id]
  );

  // Pay the supplier via the shared payouts rail. Idempotent on the drawdown id (a retry
  // won't double-pay). Gated: with no Setu/RazorpayX creds the payout stays 'pending' in manual
  // mode (operator confirms the transfer) — we never fabricate a settlement. On settlement the
  // rail posts the GL (Dr Sundry Creditors / Cr Borrowings). Best-effort: a rail error leaves the
  // drawdown recorded with the payout un-sent, surfaced honestly in the response.
  let payout = null;
  try {
    payout = await payouts.requestPayout(req.user.tenant_id, {
      kind: "bnpl", amount: parseFloat(amount), beneficiary: { name: supplier_name },
      purpose: `BNPL supplier payout (${supplier_name})`, refType: "bnpl_drawdown", refId: dd.id,
      idempotencyKey: `bnpl:${dd.id}`, actorId: req.user.id,
    });
  } catch (e) { console.error("[bnpl] payout error:", e.message); }

  res.status(201).json({ ...dd, payout: payout && { id: payout.id, status: payout.status, provider: payout.provider, provider_configured: payout.provider_configured } });
});

// GET /api/bnpl/drawdowns
router.get("/drawdowns", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT d.*, f.credit_limit, f.utilized_amount FROM bnpl_drawdowns d JOIN bnpl_facilities f ON f.id=d.facility_id WHERE d.tenant_id=$1 ORDER BY d.disbursed_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// POST /api/bnpl/repay/:id - record repayment
router.post("/repay/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { rows: [dd] } = await pool.query(
    "SELECT * FROM bnpl_drawdowns WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!dd) return res.status(404).json({ error: "Drawdown not found" });
  if (dd.status === "repaid") return res.status(400).json({ error: "Already repaid" });

  await pool.query(
    "UPDATE bnpl_drawdowns SET status='repaid', repaid_at=now() WHERE id=$1",
    [dd.id]
  );
  await pool.query(
    "UPDATE bnpl_facilities SET utilized_amount = GREATEST(0, utilized_amount - $1) WHERE id=$2",
    [dd.amount, dd.facility_id]
  );
  res.json({ ok: true });
});

module.exports = router;
