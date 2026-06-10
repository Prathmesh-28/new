const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// GET /analysis - Idle cash analysis
router.get("/analysis", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { rows: kv } = await pool.query(
      "SELECT value FROM kv_store WHERE tenant_id=$1 AND key='store' LIMIT 1",
      [tenantId]
    );
    const store = kv[0]?.value?.value ?? {};
    const accounts = store.bankAccounts ?? [];
    const totalBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);

    // Compute monthly burn from last 3 months of transactions
    const txns = store.transactions ?? [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const expenses = txns.filter(t => t.amount < 0 && new Date(t.date) >= cutoff);
    const monthlyBurn = expenses.length ? Math.abs(expenses.reduce((s,t)=>s+t.amount,0)) / 3 : 0;

    // Safety buffer = 60 days of burn
    const safetyBuffer = monthlyBurn * 2;
    const idleCash = Math.max(0, totalBalance - safetyBuffer);
    const annualYield = idleCash * 0.065; // 6.5% liquid fund rate

    res.json({
      total_balance: totalBalance,
      monthly_burn: monthlyBurn,
      safety_buffer: safetyBuffer,
      idle_cash: idleCash,
      annual_yield_at_65: annualYield,
      sweep_enabled: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze treasury" });
  }
});

// POST /sweep-enable - Enable auto-sweep (stub)
router.post("/sweep-enable", authenticate, requireOwnerOrAdmin, async (req, res) => {
  res.json({ success: true, message: "Auto-sweep enrollment queued. Our team will contact you to complete setup." });
});

module.exports = router;
