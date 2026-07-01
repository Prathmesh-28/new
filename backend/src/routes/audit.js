const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { verifyChain } = require("../lib/bookAudit");

// GET /api/audit/verify — recompute the tenant's ledger audit hash-chain and report
// integrity (MCA Rule 11(g) auditor attestation: the trail was not tampered with).
const VERIFY_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "auditor"];
router.get("/verify", authenticate, async (req, res) => {
  if (!VERIFY_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  try {
    res.json(await verifyChain(req.user.tenant_id, pool));
  } catch (e) {
    require("../lib/logger").error("audit_verify_error", { msg: e.message });
    res.status(500).json({ error: "Could not verify the audit trail." });
  }
});

module.exports = router;
