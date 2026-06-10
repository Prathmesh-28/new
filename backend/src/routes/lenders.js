const router = require("express").Router();
const { authenticate } = require("../middleware/auth");

// GET /queue - Pending credit applications for lenders
router.get("/queue", authenticate, async (req, res) => {
  res.json([
    { id: "app-1", business_name: "Raj Traders Pvt Ltd", city: "Mumbai", industry: "Retail", loan_amount: 2500000, revenue_monthly: 850000, credit_score: 74, aa_verified: true, requested_at: new Date(Date.now()-86400000).toISOString() },
    { id: "app-2", business_name: "Krishna Exports", city: "Surat", industry: "Textile", loan_amount: 5000000, revenue_monthly: 1400000, credit_score: 68, aa_verified: true, requested_at: new Date(Date.now()-86400000*2).toISOString() },
    { id: "app-3", business_name: "Meera Pharma", city: "Hyderabad", industry: "Pharma", loan_amount: 1200000, revenue_monthly: 620000, credit_score: 81, aa_verified: true, requested_at: new Date(Date.now()-86400000*3).toISOString() },
  ]);
});

// POST /bid - Lender places bid on an application
router.post("/bid", authenticate, async (req, res) => {
  const { application_id, interest_rate, processing_fee } = req.body;
  if (!application_id || !interest_rate) return res.status(400).json({ error: "application_id and interest_rate required" });
  res.json({ success: true, bid_id: `bid-${Date.now()}`, message: `Bid placed at ${interest_rate}% p.a. Borrower will review all bids within 48 hours.` });
});

module.exports = router;
