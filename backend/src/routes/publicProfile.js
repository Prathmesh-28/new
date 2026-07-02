"use strict";
// Public company profile / digital business card (roadmap #166). An opt-in, slug-addressed
// page that exposes ONLY the company fields the owner chooses (name, city/state, industry,
// website, GSTIN, a short about). Public read is unauthenticated; settings are owner-gated.
const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const SET_ROLES = ["owner", "super_admin", "finance_manager"];

// ── PUBLIC (no auth): the profile page ────────────────────────────────────────
router.get("/p/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    const { rows } = await pool.query(
      `SELECT company_name, legal_name, city, state, industry, website, logo_url, public_about, gstin
         FROM tenant_profile WHERE public_slug=$1 AND public_enabled=true`, [slug]);
    if (!rows[0]) return res.status(404).json({ error: "Profile not found" });
    const p = rows[0];
    res.json({ slug, company_name: p.company_name, legal_name: p.legal_name, city: p.city, state: p.state, industry: p.industry, website: p.website, logo_url: p.logo_url, about: p.public_about, gstin: p.gstin });
  } catch (e) { console.error("[publicProfile]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── AUTHED: read own public-profile settings ─────────────────────────────────
router.get("/settings", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT public_slug, public_enabled, public_about, company_name FROM tenant_profile WHERE tenant_id=$1", [req.user.tenant_id]);
    res.json(rows[0] || { public_slug: null, public_enabled: false, public_about: null, company_name: null });
  } catch (e) { console.error("[publicProfile]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── AUTHED (owner): enable + set slug/about ──────────────────────────────────
router.put("/settings", authenticate, async (req, res) => {
  if (!SET_ROLES.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  try {
    const t = req.user.tenant_id;
    const b = req.body || {};
    const slug = b.slug != null ? slugify(b.slug) : undefined;
    if (b.slug != null && !slug) return res.status(400).json({ error: "Enter a valid link (letters, numbers, hyphens)" });
    await pool.query("INSERT INTO tenant_profile(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO NOTHING", [t]);
    if (slug) {
      const { rows: clash } = await pool.query("SELECT tenant_id FROM tenant_profile WHERE public_slug=$1 AND tenant_id<>$2", [slug, t]);
      if (clash[0]) return res.status(409).json({ error: "That link is taken — pick another" });
    }
    const { rows } = await pool.query(
      `UPDATE tenant_profile SET
         public_slug    = COALESCE($2, public_slug),
         public_enabled = COALESCE($3, public_enabled),
         public_about   = COALESCE($4, public_about),
         updated_at = now()
       WHERE tenant_id=$1 RETURNING public_slug, public_enabled, public_about`,
      [t, slug ?? null, b.enabled != null ? !!b.enabled : null, b.about != null ? b.about : null]);
    res.json(rows[0]);
  } catch (e) { console.error("[publicProfile]", e.message); res.status(500).json({ error: "Internal error" }); }
});

module.exports = router;
