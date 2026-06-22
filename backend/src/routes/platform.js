// Platform-level settings the super-admin controls — currently the public social
// links shown in the website footer. GET is PUBLIC (the marketing pages render before
// login); PUT is super-admin only. Stored in platform_settings(key='social').
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const SOCIAL_KEYS = ["linkedin", "instagram", "twitter", "youtube", "facebook"];
// Sensible starting links so the icons render before the super-admin sets the real
// URLs; the super-admin overrides these in /admin → Platform → Social links.
const DEFAULT_SOCIAL = {
  linkedin: "https://www.linkedin.com/company/headroom",
  instagram: "https://www.instagram.com/headroom",
  twitter: "",
  youtube: "",
  facebook: "",
};

async function readSocial() {
  try {
    const { rows } = await pool.query("SELECT value FROM platform_settings WHERE key='social'");
    return { ...DEFAULT_SOCIAL, ...(rows[0]?.value || {}) };
  } catch {
    return { ...DEFAULT_SOCIAL };
  }
}

// PUBLIC — used by the footer on the landing/auth pages (no auth).
router.get("/social", async (_req, res) => {
  res.json(await readSocial());
});

// SUPER-ADMIN — update the links.
router.put("/social", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  const body = req.body || {};
  const clean = {};
  for (const k of SOCIAL_KEYS) {
    const v = typeof body[k] === "string" ? body[k].trim() : "";
    if (v && !/^https?:\/\//i.test(v)) return res.status(400).json({ error: `${k} must be a full https:// URL` });
    clean[k] = v;
  }
  await pool.query(
    `INSERT INTO platform_settings(key, value, updated_at) VALUES('social', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [JSON.stringify(clean)],
  );
  res.json(clean);
});

module.exports = router;
