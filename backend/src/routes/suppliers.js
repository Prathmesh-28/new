const router = require("express").Router();
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// GET /marketplace - Supplier early-pay marketplace
router.get("/marketplace", authenticate, requireOwnerOrAdmin, async (req, res) => {
  // Stub: return sample marketplace offers
  res.json([
    { id: "s1", supplier_name: "Bharat Packaging Co.", invoice_amount: 285000, early_pay_discount: 1.5, days_early: 28, saving: 4275, due_date: new Date(Date.now() + 86400000*28).toISOString().split("T")[0] },
    { id: "s2", supplier_name: "Global Logistics Ltd.", invoice_amount: 142000, early_pay_discount: 1.2, days_early: 15, saving: 1704, due_date: new Date(Date.now() + 86400000*15).toISOString().split("T")[0] },
    { id: "s3", supplier_name: "TechParts India", invoice_amount: 78500, early_pay_discount: 2.0, days_early: 21, saving: 1570, due_date: new Date(Date.now() + 86400000*21).toISOString().split("T")[0] },
  ]);
});

// POST /pay-early - Accept early payment offer
router.post("/pay-early", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const { offer_id } = req.body;
  if (!offer_id) return res.status(400).json({ error: "offer_id required" });
  res.json({ success: true, message: "Early payment initiated. Funds will be transferred within 2 hours via NEFT." });
});

module.exports = router;
