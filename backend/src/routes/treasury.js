const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const payouts = require("../modules/payouts/index");
const { raiseAlert } = require("../lib/alerts");

// super_admin may target any tenant via ?tenant_id; everyone else is scoped to their own.
const tenantOf = (req) =>
  req.user.role === "super_admin" && req.query.tenant_id
    ? String(req.query.tenant_id)
    : req.user.tenant_id;

// GET /holdings - tenant-scoped list of recorded positions, ordered by maturity
router.get("/holdings", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = tenantOf(req);
    const { rows } = await pool.query(
      `SELECT id, kind, label, bank, amount, rate, start_date, maturity_date, notes, created_at
         FROM treasury_holdings
        WHERE tenant_id=$1
        ORDER BY maturity_date ASC NULLS LAST, created_at DESC`,
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load holdings" });
  }
});

// POST /holdings - record an actual FD / liquid fund / T-bill position
router.post("/holdings", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = tenantOf(req);
    const { kind, label, bank, amount, rate, start_date, maturity_date, notes } = req.body || {};
    const amt = Number(amount);
    if (!label || !String(label).trim() || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "label and a positive amount are required" });
    }
    const { rows } = await pool.query(
      `INSERT INTO treasury_holdings
         (tenant_id, kind, label, bank, amount, rate, start_date, maturity_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, kind, label, bank, amount, rate, start_date, maturity_date, notes, created_at`,
      [
        tenantId,
        kind ? String(kind) : "FD",
        String(label).trim(),
        bank ? String(bank) : null,
        amt,
        rate !== undefined && rate !== null && rate !== "" ? Number(rate) : null,
        start_date || null,
        maturity_date || null,
        notes ? String(notes) : null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create holding" });
  }
});

// DELETE /holdings/:id - remove a tenant-scoped position
router.delete("/holdings/:id", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = tenantOf(req);
    const { rowCount } = await pool.query(
      "DELETE FROM treasury_holdings WHERE id=$1 AND tenant_id=$2",
      [req.params.id, tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: "Holding not found" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete holding" });
  }
});

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

// POST /sweep-enable - record genuine interest in auto-sweep. An audit found this
// was a pure no-op returning "enrollment queued. Our team will contact you" - a
// fabricated promise (nothing was written, nobody would ever call). It now records
// a REAL, durable interest marker (an in-app alert the tenant can see) and the
// response says exactly what did and didn't happen. Actual sweeps already work
// today via POST /sweep (manual, per-transfer, rail-gated).
router.post("/sweep-enable", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    await raiseAlert(req.user.tenant_id, {
      ruleId: "treasury.sweep_interest", severity: "low",
      title: "Auto-sweep interest recorded",
      message: "You asked for automatic idle-cash sweeps. Until that ships, use Treasury → Sweep to move idle cash into an FD/liquid fund per transfer - each sweep is tracked end-to-end.",
      meta: { requested_by: req.user.id, requested_at: new Date().toISOString() },
    });
    res.json({
      success: true,
      enrolled: false,
      message: "Interest recorded. Automatic sweeps aren't live yet - use the Sweep action to move idle cash today; each transfer is tracked and booked for real.",
    });
  } catch (e) {
    console.error("[treasury] sweep-enable", e.message);
    res.status(500).json({ error: "Could not record your request - try again." });
  }
});

// POST /sweep - Move idle cash into a destination (FD / liquid fund) via the shared payouts rail.
// Gated: with no rail configured the sweep stays 'pending' in manual mode (operator confirms the
// transfer to the bank/AMC) — never faked. On settlement the rail posts the GL (Dr Investments /
// Cr Bank). destination_label names the holding; kind labels the instrument.
router.post("/sweep", authenticate, requireOwnerOrAdmin, async (req, res) => {
  try {
    const tenantId = tenantOf(req);
    const { amount, destination_label, kind, idempotency_key } = req.body || {};
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: "a positive amount is required" });
    const payout = await payouts.requestPayout(tenantId, {
      kind: "treasury", amount: amt, purpose: destination_label ? String(destination_label) : (kind ? String(kind) : "Investments"),
      refType: "treasury_sweep", refId: null, idempotencyKey: idempotency_key || null, actorId: req.user.id,
      beneficiary: { name: destination_label ? String(destination_label) : "Treasury" },
    });
    res.status(201).json({ payout: { id: payout.id, status: payout.status, provider: payout.provider, provider_configured: payout.provider_configured } });
  } catch (err) {
    console.error("[treasury] sweep:", err.message);
    res.status(err.http || 500).json({ error: err.message || "Failed to initiate sweep" });
  }
});

module.exports = router;
