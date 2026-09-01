const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { validateBody } = require("../lib/validate");
const logger = require("../lib/logger");

// Consent purposes surfaced to the user. "essential" is required to use the
// product; the rest are opt-in under India's DPDP Act.
const PURPOSES = ["essential", "marketing", "lending_partners", "analytics"];

// GET /api/consent - the current user's consent ledger (defaults applied).
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

// POST /api/consent - grant/withdraw a single purpose.
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

// GET /api/account/export - DPDP right to access/portability. Bundles the
// tenant's stored data into a single JSON download.
router.get("/export", authenticate, async (req, res) => {
  const t = req.user.tenant_id;
  const out = { exported_at: new Date().toISOString(), tenant_id: t };
  // Route through q(t,...) so RLS'd tables (invoices — migration 0015) return the tenant's
  // rows; harmless for the non-RLS tables (GUC set, no policy applies).
  const grab = async (label, sql, params) => {
    try { out[label] = (await require("../lib/tenantDb").q(t, sql, params)).rows; } catch { out[label] = []; }
  };
  await grab("profile", "SELECT id, email, role, tenant_id, display_name, subscription_plan, created_at FROM users WHERE tenant_id=$1", [t]);
  await grab("app_data", "SELECT namespace, key, value, updated_at FROM kv_store WHERE tenant_id=$1", [t]);
  await grab("transactions", "SELECT * FROM transactions WHERE tenant_id=$1", [t]);
  await grab("invoices", "SELECT * FROM invoices WHERE tenant_id=$1", [t]);
  await grab("active_loans", "SELECT * FROM active_loans WHERE tenant_id=$1", [t]);
  await grab("consents", "SELECT purpose, granted, version, updated_at FROM consents WHERE tenant_id=$1", [t]);
  // Waves 1-15 added real business tables; an "everything" export that missed them would
  // be a false promise. File CONTENTS are deliberately excluded (metadata only) — they're
  // encrypted blobs that would balloon the download; the vault has its own downloads.
  await grab("customers", "SELECT * FROM customers WHERE tenant_id=$1", [t]);
  await grab("customer_contacts", "SELECT * FROM customer_contacts WHERE tenant_id=$1", [t]);
  await grab("customer_advances", "SELECT * FROM customer_advances WHERE tenant_id=$1", [t]);
  await grab("invoice_items", "SELECT ii.* FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE i.tenant_id=$1", [t]);
  await grab("invoice_payments", "SELECT * FROM invoice_payments WHERE tenant_id=$1", [t]);
  await grab("invoice_credit_notes", "SELECT * FROM invoice_credit_notes WHERE tenant_id=$1", [t]);
  await grab("invoice_writeoffs", "SELECT * FROM invoice_writeoffs WHERE tenant_id=$1", [t]);
  await grab("invoice_revisions", "SELECT * FROM invoice_revisions WHERE tenant_id=$1", [t]);
  await grab("vendors", "SELECT id, name, gstin, contact_name, phone, email, payment_terms_days, is_msme, msme_category, udyam, category, notes, created_at FROM vendor_master WHERE tenant_id=$1", [t]);
  await grab("employees", "SELECT * FROM employees WHERE tenant_id=$1", [t]);
  await grab("files_metadata", "SELECT id, name, mime_type, size, category, tags, created_at FROM files WHERE tenant_id=$1", [t]);
  await grab("audit_log", "SELECT action, entity, entity_id, meta, created_at FROM audit_log WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5000", [t]);

  out.record_counts = Object.fromEntries(Object.entries(out).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  // The export doubles as the do-it-yourself backup; remember when it last happened so
  // Settings can show "last backed up N days ago" instead of silence.
  require("../lib/audit").writeAudit(req.user.id, "data_export", "tenant", t, { counts: out.record_counts }, t);

  res.setHeader("Content-Disposition", `attachment; filename="headroom-data-${t}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(out, null, 2));
});

// POST /api/account/deletion-request - DPDP right to erasure. Recorded as a
// REQUEST (not an immediate hard delete) because RBI/tax rules require certain
// financial records to be retained for a statutory period before purge.
// Requires the owner to re-enter their password.
// GET /api/account/export/last — when did this firm last take its data out? Shown in
// Settings so "backed up" is a date, not a feeling.
router.get("/export/last", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT created_at, meta FROM audit_log
        WHERE tenant_id=$1 AND action='data_export' ORDER BY created_at DESC LIMIT 1`, [req.user.tenant_id]);
    res.json(rows[0] ? { last_export_at: rows[0].created_at, counts: rows[0].meta?.counts ?? null } : { last_export_at: null });
  } catch (e) { next(e); }
});

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
