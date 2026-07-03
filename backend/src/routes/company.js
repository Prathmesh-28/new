const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const { tenantSeatInfo } = require("../lib/plans");
const { writeAudit } = require("../lib/audit");

// Company / tenant profile - the identity of an SMB beyond its email-derived
// tenant id: legal name, GSTIN, industry, address, etc. (gap B5).

const { stampSvg, letterheadSvg } = require("../lib/brand");

const FIELDS = ["company_name", "legal_name", "gstin", "pan", "industry", "company_size",
  "address", "city", "state", "pincode", "phone", "website", "logo_url", "upi_id", "tan",
  // Brand kit (#184): document colours, letterhead lines, signatory (migration 0021)
  "brand_primary", "brand_accent", "letterhead_header", "letterhead_footer", "signatory_name", "signatory_designation"];

function scopeTenant(req) {
  // super_admin may target any tenant via ?tenant_id / body.tenant_id; others are scoped.
  if (req.user.role === "super_admin") {
    return (req.query.tenant_id || (req.body && req.body.tenant_id) || req.user.tenant_id).toString();
  }
  return req.user.tenant_id;
}

async function loadProfile(tid) {
  const { rows } = await pool.query("SELECT * FROM tenant_profile WHERE tenant_id=$1", [tid]);
  if (rows[0]) return rows[0];
  return { tenant_id: tid, status: "active", ...Object.fromEntries(FIELDS.map(f => [f, null])) };
}

// GET /api/company - the caller's company profile (+ live seat usage)
router.get("/", authenticate, async (req, res) => {
  const tid = scopeTenant(req);
  const profile = await loadProfile(tid);
  const seats = await tenantSeatInfo(tid);
  res.json({ ...profile, seats });
});

// PUT /api/company - owner/admin updates the profile (upsert)
router.put("/", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const tid = scopeTenant(req);
  const vals = FIELDS.map(f => {
    const v = req.body?.[f];
    return typeof v === "string" ? v.trim().slice(0, 400) : (v == null ? null : String(v).slice(0, 400));
  });
  const cols = FIELDS.join(", ");
  const placeholders = FIELDS.map((_, i) => `$${i + 2}`).join(", ");
  const updates = FIELDS.map(f => `${f}=EXCLUDED.${f}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO tenant_profile(tenant_id, ${cols}, updated_at)
     VALUES($1, ${placeholders}, now())
     ON CONFLICT(tenant_id) DO UPDATE SET ${updates}, updated_at=now()
     RETURNING *`,
    [tid, ...vals]
  );
  writeAudit(req.user.id, "company.update", "tenant", tid, { fields: FIELDS.filter(f => req.body?.[f] != null) });
  res.json(rows[0]);
});

// Brand-kit generators (#184): a round company seal + a letterhead band, from the profile's brand
// fields. ?format=svg returns raw SVG (embed as <img src>); default returns JSON { svg }.
router.get("/brand/stamp", authenticate, async (req, res) => {
  const p = await loadProfile(scopeTenant(req));
  const svg = stampSvg({ companyName: p.company_name || "Company", gstin: p.gstin || "", city: p.city || "", primary: p.brand_primary || "#1f6feb" });
  if (req.query.format === "svg") return res.type("image/svg+xml").send(svg);
  res.json({ svg });
});
router.get("/brand/letterhead", authenticate, async (req, res) => {
  const p = await loadProfile(scopeTenant(req));
  const svg = letterheadSvg({
    companyName: p.company_name || "Company", legalName: p.legal_name || "", address: [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", "),
    gstin: p.gstin || "", phone: p.phone || "", website: p.website || "", primary: p.brand_primary || "#1f6feb", accent: p.brand_accent || "#0d1117",
  });
  if (req.query.format === "svg") return res.type("image/svg+xml").send(svg);
  res.json({ svg });
});

module.exports = router;
