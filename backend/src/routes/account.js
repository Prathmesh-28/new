const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { validateBody } = require("../lib/validate");
const logger = require("../lib/logger");

// Consent purposes surfaced to the user. "essential" is required to use the
// product; the rest are opt-in under India's DPDP Act.
const PURPOSES = ["essential", "marketing", "lending_partners", "analytics"];

// GET /api/consent — the current user's consent ledger (defaults applied).
router.get("/consent", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT purpose, granted, version, updated_at FROM consents WHERE user_id=$1",
    [req.user.id]
  );
  const byPurpose = Object.fromEntries(rows.map((r) => [r.purpose, r]));
  res.json(PURPOSES.map((p) => ({
    purpose: p,
    granted: p === "essential" ? true : (byPurpose[p]?.granted ?? false),
    required: p === "essential",
    updated_at: byPurpose[p]?.updated_at ?? null,
  })));
});

// POST /api/consent — grant/withdraw a single purpose.
router.post("/consent", authenticate, validateBody({
  purpose: { type: "string", required: true, enum: PURPOSES },
  granted: { type: "boolean", required: true },
}), async (req, res) => {
  const { purpose, granted } = req.body;
  if (purpose === "essential" && !granted) {
    return res.status(400).json({ error: "Essential processing can't be withdrawn while your account is active." });
  }
  await pool.query(
    `INSERT INTO consents(tenant_id, user_id, purpose, granted)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (user_id, purpose) DO UPDATE SET granted=$4, updated_at=now()`,
    [req.user.tenant_id, req.user.id, purpose, granted]
  );
  res.json({ ok: true });
});

// GET /api/account/export — DPDP right to access/portability. Bundles the
// tenant's stored data into a single JSON download.
router.get("/export", authenticate, async (req, res) => {
  const t = req.user.tenant_id;
  const out = { exported_at: new Date().toISOString(), tenant_id: t };
  const grab = async (label, sql, params) => {
    try { out[label] = (await pool.query(sql, params)).rows; } catch { out[label] = []; }
  };
  await grab("profile", "SELECT id, email, role, tenant_id, display_name, subscription_plan, created_at FROM users WHERE tenant_id=$1", [t]);
  await grab("app_data", "SELECT namespace, key, value, updated_at FROM kv_store WHERE tenant_id=$1", [t]);
  await grab("transactions", "SELECT * FROM transactions WHERE tenant_id=$1", [t]);
  await grab("invoices", "SELECT * FROM invoices WHERE tenant_id=$1", [t]);
  await grab("active_loans", "SELECT * FROM active_loans WHERE tenant_id=$1", [t]);
  await grab("consents", "SELECT purpose, granted, version, updated_at FROM consents WHERE tenant_id=$1", [t]);
  res.setHeader("Content-Disposition", `attachment; filename="headroom-data-${t}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(out, null, 2));
});

// POST /api/account/deletion-request — DPDP right to erasure. Recorded as a
// REQUEST (not an immediate hard delete) because RBI/tax rules require certain
// financial records to be retained for a statutory period before purge.
// Requires the owner to re-enter their password.
router.post("/deletion-request", authenticate, requireOwnerOrAdmin, validateBody({
  password: { type: "string", required: true, maxLen: 200 },
  reason:   { type: "string", maxLen: 1000 },
}), async (req, res) => {
  const { rows } = await pool.query("SELECT password FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(req.body.password, rows[0].password))) {
    return res.status(401).json({ error: "Password is incorrect" });
  }
  const existing = await pool.query(
    "SELECT id FROM deletion_requests WHERE tenant_id=$1 AND status='pending'",
    [req.user.tenant_id]
  );
  if (existing.rows[0]) return res.json({ ok: true, status: "already_pending" });

  await pool.query(
    "INSERT INTO deletion_requests(tenant_id, user_id, requested_by, reason) VALUES($1,$2,$3,$4)",
    [req.user.tenant_id, req.user.id, req.user.email || null, req.body.reason || null]
  );
  logger.warn("deletion_requested", { tenant: req.user.tenant_id, user: req.user.id });
  res.json({ ok: true, status: "pending" });
});

module.exports = router;
