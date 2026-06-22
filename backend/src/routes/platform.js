// Platform-level settings the super-admin controls live (no redeploy): social links,
// brand/contact info, footer legal links, and a site-wide announcement banner.
// Each group is one row in platform_settings(key=<group>). GET /settings is PUBLIC
// (marketing pages render before login); PUT /settings/:group is super-admin only.
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

// Group schema: which keys exist, defaults, and which are URL/email/bool for validation.
const GROUPS = {
  social: {
    keys: ["linkedin", "instagram", "twitter", "youtube", "facebook"],
    url: ["linkedin", "instagram", "twitter", "youtube", "facebook"],
    defaults: {
      linkedin: "https://www.linkedin.com/company/headroom",
      instagram: "https://www.instagram.com/headroom",
      twitter: "", youtube: "", facebook: "",
    },
  },
  brand: {
    keys: ["companyName", "supportEmail", "salesEmail", "phone", "address", "tagline"],
    email: ["supportEmail", "salesEmail"],
    defaults: {
      companyName: "Headroom Technologies Pvt. Ltd.",
      supportEmail: "support@headroom.app",
      salesEmail: "", phone: "", address: "",
      tagline: "A 10-layer cash flow intelligence platform for modern SMB operators.",
    },
  },
  links: {
    keys: ["privacyUrl", "termsUrl", "securityUrl"],
    url: ["privacyUrl", "termsUrl", "securityUrl"],
    defaults: { privacyUrl: "", termsUrl: "", securityUrl: "" },
  },
  banner: {
    keys: ["enabled", "text", "linkUrl", "linkLabel"],
    url: ["linkUrl"],
    bool: ["enabled"],
    defaults: { enabled: false, text: "", linkUrl: "", linkLabel: "" },
  },
};

async function readGroup(group) {
  const def = GROUPS[group].defaults;
  try {
    const { rows } = await pool.query("SELECT value FROM platform_settings WHERE key=$1", [group]);
    return { ...def, ...(rows[0]?.value || {}) };
  } catch {
    return { ...def };
  }
}

// PUBLIC — all groups in one call (footer, banner, contact read from this).
router.get("/settings", async (_req, res) => {
  const out = {};
  for (const g of Object.keys(GROUPS)) out[g] = await readGroup(g);
  res.json(out);
});

// PUBLIC — back-compat for the footer SocialLinks component.
router.get("/social", async (_req, res) => res.json(await readGroup("social")));

// SUPER-ADMIN — update one group.
router.put("/settings/:group", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  const group = req.params.group;
  const schema = GROUPS[group];
  if (!schema) return res.status(404).json({ error: "Unknown settings group" });
  const body = req.body || {};
  const clean = {};
  for (const k of schema.keys) {
    if ((schema.bool || []).includes(k)) { clean[k] = !!body[k]; continue; }
    const v = typeof body[k] === "string" ? body[k].trim() : "";
    if (v && (schema.url || []).includes(k) && !/^https?:\/\//i.test(v)) return res.status(400).json({ error: `${k} must be a full https:// URL` });
    if (v && (schema.email || []).includes(k) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ error: `${k} must be a valid email` });
    clean[k] = v;
  }
  await pool.query(
    `INSERT INTO platform_settings(key, value, updated_at) VALUES($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [group, JSON.stringify(clean)],
  );
  res.json(clean);
});

module.exports = router;
