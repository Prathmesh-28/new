const router = require("express").Router();

// Which integrations are actually LIVE vs. running in preview/sample mode.
// A capability is live only when its backing credential is configured; otherwise
// the matching feature renders behind a "Preview" badge in the UI so that demos
// and trials stay honest — no feature that silently returns fake data looks real.
function capabilities() {
  const has = (k) => !!(process.env[k] && String(process.env[k]).trim());
  return {
    // Core services — typically configured in production
    payments:            has("RAZORPAY_KEY_ID"),       // subscription + collections
    ai:                  has("OPENROUTER_API_KEY"),    // tenant LLM engine fallback (tenants may also BYO-key)
    whatsapp:            has("TWILIO_ACCOUNT_SID"),     // digests + chase
    push:                has("FCM_SERVICE_ACCOUNT"),    // mobile push delivery (FCM v1)
    email:               has("SMTP_USER"),

    // Money-movement & data rails — each needs a partner contract + keys
    bankSync:            has("FINBOX_API_KEY") || has("AA_CLIENT_ID"),
    creditDisbursement:  has("FINBOX_API_KEY"),         // actual loan fund transfer
    bnplPayout:          has("SETU_CLIENT_ID"),          // pay supplier on drawdown
    ewaPayout:           has("SETU_CLIENT_ID"),          // disburse earned-wage advance
    gstEInvoice:         has("MASTERS_INDIA_API_KEY"),   // real IRN via GSP
    kyc:                 has("KYC_API_KEY"),             // PAN/GSTIN verification

    // Two-sided marketplaces — sample data until partners are onboarded
    lenderMarketplace:   false,
    supplierMarketplace: false,
    treasurySweep:       false,
  };
}

router.get("/", (_req, res) => res.json(capabilities()));

module.exports = router;
module.exports.capabilities = capabilities;
