const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { tenantSeatInfo } = require("../lib/plans");
const { writeAudit } = require("../lib/audit");
const { addMembership } = require("../lib/memberships");

// Super-admin console API (Users / Organisation / Subscription tabs). Org &
// subscription endpoints operate on a target tenant (?tenant_id) so the super
// admin can manage any org picked in the TenantSwitcher.
router.use(authenticate);
router.use((req, res, next) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  next();
});

const PLAN_MONTHLY_INR = { free: 0, starter: 799, growth: 2499, pro: 5999 }; // ex-GST
const scopeTenant = (req) => (req.query.tenant_id || (req.body && req.body.tenant_id) || req.user.tenant_id).toString();

// ─────────────── Users ───────────────
const USER_COLS = "id,email,role,tenant_id,first_login,created_at,display_name,status,last_login_at,COALESCE(login_count,0) AS login_count,COALESCE(subscription_plan,'free') AS subscription_plan";

router.get("/users", async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${USER_COLS} FROM users ORDER BY created_at DESC`);
  res.json(rows);
});

router.post("/users/invite", async (req, res) => {
  const { email, role = "viewer", plan = "free", tenant_id } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const e = email.toLowerCase();
  const { rows: ex } = await pool.query("SELECT id FROM users WHERE email=$1", [e]);
  if (ex[0]) return res.status(409).json({ error: "A user with this email already exists" });
  const tid = (tenant_id || `${e.split("@")[0].replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}-${crypto.randomBytes(3).toString("hex")}`).toString();
  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash = await bcrypt.hash(tempPass, 10);
  const { rows } = await pool.query(
    `INSERT INTO users(email,password,role,tenant_id,subscription_plan) VALUES($1,$2,$3,$4,$5) RETURNING ${USER_COLS}`,
    [e, hash, role, tid, plan]
  );
  await addMembership(rows[0].id, tid, role);
  writeAudit(req.user.id, "user.invite", "user", rows[0].id, { email: e, role, plan, tenant_id: tid });
  res.status(201).json({ ...rows[0], tempPassword: tempPass });
});

router.post("/users/:id/reset-password", async (req, res) => {
  const { rows } = await pool.query("SELECT id, email FROM users WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash = await bcrypt.hash(tempPass, 10);
  await pool.query("UPDATE users SET password=$1, first_login=true, failed_attempts=0, locked_until=NULL WHERE id=$2", [hash, req.params.id]);
  writeAudit(req.user.id, "user.password_reset", "user", req.params.id, {});
  res.json({ password: tempPass });
});

// ─────────────── Organisation ───────────────
const ORG_FIELDS = ["company_name", "legal_name", "logo_url", "timezone", "fiscal_year_start", "base_currency", "industry", "gstin", "pan", "company_size", "phone", "website", "address", "city", "state", "pincode"];

router.get("/org", async (req, res) => {
  const tid = scopeTenant(req);
  const { rows } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tid]);
  const profile = rows[0] || { tenant_id: tid };
  const seats = await tenantSeatInfo(tid);
  res.json({ ...profile, tenant_id: tid, seats });
});

router.patch("/org", async (req, res) => {
  const tid = scopeTenant(req);
  const vals = ORG_FIELDS.map(f => {
    const v = req.body?.[f];
    return v == null ? null : String(v).slice(0, 400);
  });
  const cols = ORG_FIELDS.join(", ");
  const placeholders = ORG_FIELDS.map((_, i) => `$${i + 2}`).join(", ");
  const updates = ORG_FIELDS.map(f => `${f}=EXCLUDED.${f}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO tenant_profile(tenant_id, ${cols}, updated_at) VALUES($1, ${placeholders}, now())
     ON CONFLICT(tenant_id) DO UPDATE SET ${updates}, updated_at=now() RETURNING *`,
    [tid, ...vals]
  );
  writeAudit(req.user.id, "org.update", "tenant", tid, {});
  res.json(rows[0]);
});

router.get("/org/team", async (req, res) => {
  const tid = scopeTenant(req);
  const { rows } = await pool.query(
    "SELECT id,email,role,display_name,first_login,status,last_login_at FROM users WHERE tenant_id=$1 ORDER BY created_at",
    [tid]
  );
  res.json(rows);
});

router.delete("/team/:userId", async (req, res) => {
  const { rows } = await pool.query("SELECT id,email,tenant_id FROM users WHERE id=$1", [req.params.userId]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  if (rows[0].id === req.user.id) return res.status(400).json({ error: "You can't remove yourself" });
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.userId]);
  writeAudit(req.user.id, "team.remove", "user", req.params.userId, { email: rows[0].email, tenant_id: rows[0].tenant_id });
  res.json({ ok: true });
});

router.patch("/org/permissions", async (req, res) => {
  const tid = scopeTenant(req);
  const perms = (req.body && req.body.permissions) || {};
  await pool.query(
    `INSERT INTO tenant_profile(tenant_id, role_permissions, updated_at) VALUES($1,$2,now())
     ON CONFLICT(tenant_id) DO UPDATE SET role_permissions=$2, updated_at=now()`,
    [tid, JSON.stringify(perms)]
  );
  writeAudit(req.user.id, "org.permissions_update", "tenant", tid, {});
  res.json({ ok: true });
});

router.get("/org/export", async (req, res) => {
  const tid = scopeTenant(req);
  const users = (await pool.query("SELECT id,email,role,display_name,created_at FROM users WHERE tenant_id=$1", [tid])).rows;
  const kv = (await pool.query("SELECT namespace,key,value,updated_at FROM kv_store WHERE tenant_id=$1", [tid])).rows;
  const profile = (await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tid])).rows[0] || null;
  const billing = (await pool.query("SELECT * FROM tenant_billing WHERE tenant_id=$1", [tid])).rows[0] || null;
  writeAudit(req.user.id, "org.export", "tenant", tid, {});
  res.json({ tenant_id: tid, exported_at: new Date().toISOString(), profile, billing, users, kv });
});

router.delete("/org", async (req, res) => {
  const tid = scopeTenant(req);
  if (tid === req.user.tenant_id) return res.status(400).json({ error: "You can't delete your own admin workspace" });
  await pool.query("DELETE FROM users WHERE tenant_id=$1", [tid]);
  await pool.query("DELETE FROM kv_store WHERE tenant_id=$1", [tid]);
  await pool.query("DELETE FROM tenant_profile WHERE tenant_id=$1", [tid]);
  await pool.query("DELETE FROM tenant_billing WHERE tenant_id=$1", [tid]);
  writeAudit(req.user.id, "org.delete", "tenant", tid, {});
  res.json({ ok: true });
});

// ─────────────── Subscription ───────────────
router.get("/subscription", async (req, res) => {
  const tid = scopeTenant(req);
  const seat = await tenantSeatInfo(tid);
  const b = (await pool.query("SELECT * FROM tenant_billing WHERE tenant_id=$1", [tid])).rows[0] || null;
  res.json({
    tenant_id: tid,
    plan: seat.plan,
    status: b?.status || "active",
    price_monthly_inr: PLAN_MONTHLY_INR[seat.plan] || 0,
    cycle: "monthly",
    renewal: b?.current_period_end || null,
    provider: b?.provider || null,
    seats: { used: seat.used, limit: seat.limit },
  });
});

router.get("/subscription/invoices", async (req, res) => {
  const tid = scopeTenant(req);
  const b = (await pool.query("SELECT * FROM tenant_billing WHERE tenant_id=$1", [tid])).rows[0] || null;
  // Honest: only surface a real payment if one exists; no fabricated history.
  const invoices = b && b.razorpay_payment_id
    ? [{ id: b.razorpay_payment_id, date: b.updated_at, description: `${b.plan} plan`, amount_inr: PLAN_MONTHLY_INR[b.plan] || 0, status: b.status || "paid" }]
    : [];
  res.json(invoices);
});

router.get("/subscription/payment-method", async (_req, res) => {
  // No card vaulting without a live gateway customer - honest "none on file".
  res.json({ method: null });
});

// POST /api/admin/pii/backfill — encrypt existing plaintext PII at rest (idempotent;
// tag-detected, so safe to re-run). Covers the registry in lib/fieldcrypto (employees).
router.post("/pii/backfill", async (req, res) => {
  try {
    const fc = require("../lib/fieldcrypto");
    const results = await fc.backfillAll(pool);
    writeAudit(req.user.id, "pii_backfill", "platform", null, { results }).catch(() => {});
    res.json({ ok: true, results });
  } catch (e) { console.error("[pii-backfill]", e.message); res.status(500).json({ error: "Backfill failed" }); }
});

module.exports = router;
