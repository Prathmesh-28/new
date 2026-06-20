const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// Resolve the tenant to operate on: super_admin may target any tenant via ?tenant_id,
// everyone else is locked to their own tenant.
function scopeTenant(req) {
  if (req.user.role === "super_admin" && req.query.tenant_id) return req.query.tenant_id;
  return req.user.tenant_id;
}

// GET /marketplace - REAL early-pay candidates computed from the tenant's own spend.
// Top expense counterparties (outflows) over the last 180d, joined to vendor_master
// for negotiated terms; an early-pay discount yields a concrete saving per supplier.
router.get("/marketplace", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = scopeTenant(req);
    const { rows } = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(t.merchant_name), ''), 'Unnamed vendor') AS supplier_name,
         SUM(ABS(t.amount))                AS total_spend,
         COUNT(*)                          AS bill_count,
         AVG(ABS(t.amount))                AS avg_bill,
         MAX(t.transaction_date)           AS last_bill_date,
         vm.payment_terms_days             AS terms_days,
         vm.is_msme                        AS is_msme
       FROM transactions t
       LEFT JOIN vendor_master vm
         ON vm.tenant_id = t.tenant_id
        AND LOWER(vm.name) = LOWER(TRIM(t.merchant_name))
       WHERE t.tenant_id = $1
         AND t.amount < 0
         AND t.category IN ('expense','procurement','payroll','uncategorized')
         AND t.transaction_date >= CURRENT_DATE - 180
       GROUP BY supplier_name, vm.payment_terms_days, vm.is_msme
       HAVING SUM(ABS(t.amount)) > 0
       ORDER BY total_spend DESC
       LIMIT 8`,
      [tenantId]
    );

    const today = new Date();
    const offers = rows.map((r, i) => {
      // Next typical invoice ≈ the average recent bill from this vendor.
      const invoiceAmount = Math.round(Number(r.avg_bill) || 0);
      const termsDays = Number(r.terms_days) || 30;
      // Early-pay discount: MSME suppliers (must be paid fast anyway under 43B(h)) and
      // longer-term vendors offer a bit more for taking cash today. Bounded 1.0%–2.5%.
      let discount = 1.0 + Math.min(termsDays, 60) / 60; // 30d->1.5%, 60d->2.0%
      if (r.is_msme) discount += 0.5;
      discount = Math.round(Math.min(2.5, Math.max(1.0, discount)) * 10) / 10;
      const daysEarly = Math.max(7, termsDays);
      const saving = Math.round(invoiceAmount * (discount / 100));
      const due = new Date(today.getTime() + daysEarly * 86400000);
      return {
        id: `vendor-${i}-${encodeURIComponent(r.supplier_name).slice(0, 40)}`,
        supplier_name: r.supplier_name,
        invoice_amount: invoiceAmount,
        early_pay_discount: discount,
        days_early: daysEarly,
        saving,
        due_date: due.toISOString().split("T")[0],
        is_msme: !!r.is_msme,
        bill_count: Number(r.bill_count) || 0,
        total_spend: Math.round(Number(r.total_spend) || 0),
      };
    }).filter(o => o.invoice_amount > 0);

    res.json(offers);
  } catch (e) {
    console.error("suppliers/marketplace", e);
    res.status(500).json({ error: "Failed to compute early-pay candidates" });
  }
});

// POST /pay-early - record a REAL early payment as an expense transaction.
// Body: { offer_id, supplier_name, amount, discount?, saving? }
router.post("/pay-early", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = scopeTenant(req);
    const { offer_id, supplier_name, amount, discount, saving } = req.body || {};
    if (!offer_id) return res.status(400).json({ error: "offer_id required" });

    const gross = Math.round(Number(amount) || 0);
    const savedAmt = Math.round(Number(saving) || 0);
    // Cash actually leaving the account today = invoice minus the early-pay discount.
    const payable = Math.max(0, gross - (savedAmt > 0 ? savedAmt : 0));
    if (payable <= 0) return res.status(400).json({ error: "Invalid payment amount" });

    const vendor = (supplier_name && String(supplier_name).trim()) || "Supplier";
    const discPct = Number(discount) || 0;
    const desc = `Early payment to ${vendor}${discPct ? ` (${discPct}% discount, saved ₹${savedAmt})` : ""}`;

    // Outflow => negative amount, in the procurement bucket.
    const { rows } = await pool.query(
      `INSERT INTO transactions
         (tenant_id, amount, description_raw, merchant_name, category, transaction_date, source)
       VALUES ($1, $2, $3, $4, 'procurement', CURRENT_DATE, 'early-pay')
       RETURNING id, amount, transaction_date`,
      [tenantId, -payable, desc, vendor]
    );

    res.json({
      success: true,
      transaction_id: rows[0].id,
      amount_paid: payable,
      saving: savedAmt,
      supplier_name: vendor,
      transaction_date: rows[0].transaction_date,
      message: `Early payment of ₹${payable.toLocaleString("en-IN")} to ${vendor} recorded${savedAmt > 0 ? `. You saved ₹${savedAmt.toLocaleString("en-IN")}.` : "."}`,
    });
  } catch (e) {
    console.error("suppliers/pay-early", e);
    res.status(500).json({ error: "Failed to record early payment" });
  }
});

module.exports = router;
