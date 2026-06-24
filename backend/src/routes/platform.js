// Platform-level settings the super-admin controls LIVE (no redeploy). Each group is
// one row in platform_settings(key=<group>). Designed to be the company owner's
// "control panel" — add new typed groups here, or use the generic `custom` group to
// add ANY key/value at runtime with zero code change.
//
//   GET  /settings            PUBLIC  — public groups only (marketing/app pre-login)
//   GET  /settings/all        ADMIN   — every group incl. admin-only + custom (editor)
//   GET  /social              PUBLIC  — back-compat for the footer
//   PUT  /settings/:group     ADMIN   — update one group (super-admin only)
//
// Per-group meta: keys[], defaults{}, and optional url[]/email[]/bool[]/num[] for
// validation; `public:true` exposes it on the public GET; `custom:true` accepts
// arbitrary keys (the future-proofing escape hatch).
const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const platformConfig = require("../lib/platformConfig");

const GROUPS = {
  // ── public: marketing + app chrome ──────────────────────────────────────────
  brand: {
    public: true,
    keys: ["companyName", "supportEmail", "salesEmail", "phone", "address", "tagline"],
    email: ["supportEmail", "salesEmail"],
    defaults: {
      companyName: "Headroom Technologies Pvt. Ltd.",
      supportEmail: "support@headroom.app",
      salesEmail: "", phone: "", address: "",
      tagline: "A 10-layer cash flow intelligence platform for modern SMB operators.",
    },
  },
  social: {
    public: true,
    keys: ["linkedin", "instagram", "twitter", "youtube", "facebook"],
    url: ["linkedin", "instagram", "twitter", "youtube", "facebook"],
    defaults: {
      linkedin: "https://www.linkedin.com/company/headroom",
      instagram: "https://www.instagram.com/headroom",
      twitter: "", youtube: "", facebook: "",
    },
  },
  links: {
    public: true,
    keys: ["privacyUrl", "termsUrl", "securityUrl"],
    url: ["privacyUrl", "termsUrl", "securityUrl"],
    defaults: { privacyUrl: "", termsUrl: "", securityUrl: "" },
  },
  banner: {
    public: true,
    keys: ["enabled", "text", "linkUrl", "linkLabel"],
    url: ["linkUrl"], bool: ["enabled"],
    defaults: { enabled: false, text: "", linkUrl: "", linkLabel: "" },
  },
  payments: {
    public: true,
    keys: ["upiId", "payeeName", "paymentNote"],
    defaults: { upiId: "", payeeName: "", paymentNote: "" },
  },
  features: {
    // Module on/off switches — the app can hide a whole section without a deploy.
    public: true,
    keys: ["enableAgents", "enableWhatsapp", "enableMarketplace", "enableInvestor", "enableEsg", "enableGlobal", "enableTokens"],
    bool: ["enableAgents", "enableWhatsapp", "enableMarketplace", "enableInvestor", "enableEsg", "enableGlobal", "enableTokens"],
    defaults: { enableAgents: true, enableWhatsapp: true, enableMarketplace: true, enableInvestor: true, enableEsg: true, enableGlobal: true, enableTokens: true },
  },
  localization: {
    public: true,
    keys: ["currency", "locale", "timezone", "fiscalYearStart", "dateFormat"],
    defaults: { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", fiscalYearStart: "04-01", dateFormat: "dd MMM yyyy" },
  },
  support: {
    public: true,
    keys: ["helpUrl", "docsUrl", "statusUrl", "whatsappNumber", "hours"],
    url: ["helpUrl", "docsUrl", "statusUrl"],
    defaults: { helpUrl: "", docsUrl: "", statusUrl: "", whatsappNumber: "", hours: "Mon–Fri, 10am–7pm IST" },
  },
  seo: {
    public: true,
    keys: ["title", "description", "ogImageUrl", "keywords"],
    url: ["ogImageUrl"],
    defaults: { title: "", description: "", ogImageUrl: "", keywords: "" },
  },
  maintenance: {
    public: true,
    keys: ["enabled", "message"],
    bool: ["enabled"],
    defaults: { enabled: false, message: "We're doing scheduled maintenance and will be back shortly." },
  },

  // ── admin-only: internal config (not exposed on the public GET) ───────────────
  ai: {
    public: false,
    keys: ["defaultModel", "visionModel", "embedModel", "allowByoKey", "engineNote"],
    bool: ["allowByoKey"],
    defaults: { defaultModel: "openrouter/owl-alpha", visionModel: "openrouter/free", embedModel: "openai/text-embedding-3-small", allowByoKey: true, engineNote: "" },
  },
  limits: {
    public: false,
    keys: ["maxAgentsPerTenant", "monthlyTokenCap", "maxUploadMb", "maxBulkRows", "trialDays", "reminderMaxPer7d", "creditMinScore"],
    num: ["maxAgentsPerTenant", "monthlyTokenCap", "maxUploadMb", "maxBulkRows", "trialDays", "reminderMaxPer7d", "creditMinScore"],
    defaults: { maxAgentsPerTenant: 25, monthlyTokenCap: 0, maxUploadMb: 10, maxBulkRows: 100, trialDays: 14, reminderMaxPer7d: 3, creditMinScore: 35 },
  },
  signup: {
    public: true,
    keys: ["mode", "defaultPlan", "defaultRole", "allowAdvisorSignup"],
    bool: ["allowAdvisorSignup"],
    defaults: { mode: "open", defaultPlan: "free", defaultRole: "owner", allowAdvisorSignup: true },
  },
  pricing: {
    public: true,
    keys: ["freeLabel", "starterPrice", "growthPrice", "proPrice", "currencySymbol"],
    num: ["starterPrice", "growthPrice", "proPrice"],
    defaults: { freeLabel: "Free", starterPrice: 999, growthPrice: 2999, proPrice: 7999, currencySymbol: "₹" },
  },

  // ── the escape hatch: any key/value the owner wants, now or in 10 years ───────
  custom: { public: false, custom: true, keys: [], defaults: {} },
};

const MAX_CUSTOM_KEYS = 100;
const MAX_VAL_LEN = 4000;

async function readGroup(group) {
  const def = GROUPS[group].defaults || {};
  try {
    const { rows } = await pool.query("SELECT value FROM platform_settings WHERE key=$1", [group]);
    return { ...def, ...(rows[0]?.value || {}) };
  } catch {
    return { ...def };
  }
}

// PUBLIC — public groups only (footer, banner, contact, features, localization…).
router.get("/settings", async (_req, res) => {
  const out = {};
  for (const g of Object.keys(GROUPS)) if (GROUPS[g].public) out[g] = await readGroup(g);
  res.json(out);
});

// ADMIN — every group (incl. admin-only + custom) for the console editor.
router.get("/settings/all", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  const out = {};
  for (const g of Object.keys(GROUPS)) out[g] = await readGroup(g);
  res.json(out);
});

// PUBLIC — back-compat for the footer SocialLinks component.
router.get("/social", async (_req, res) => res.json(await readGroup("social")));

function sanitizeCustomValue(v) {
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (v == null) return "";
  return String(v).slice(0, MAX_VAL_LEN);
}

// SUPER-ADMIN — update one group.
router.put("/settings/:group", authenticate, async (req, res) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  const group = req.params.group;
  const schema = GROUPS[group];
  if (!schema) return res.status(404).json({ error: "Unknown settings group" });
  const body = req.body || {};
  let clean = {};

  if (schema.custom) {
    // Arbitrary key/value — sanitize, cap count + size. This is the zero-code
    // extension point: add any setting here and read it from platform_settings.
    const entries = Object.entries(body).filter(([k]) => /^[A-Za-z0-9_.-]{1,64}$/.test(k)).slice(0, MAX_CUSTOM_KEYS);
    for (const [k, v] of entries) clean[k] = sanitizeCustomValue(v);
  } else {
    for (const k of schema.keys) {
      if ((schema.bool || []).includes(k)) { clean[k] = !!body[k]; continue; }
      if ((schema.num || []).includes(k)) {
        const n = Number(body[k]);
        if (body[k] !== "" && body[k] != null && !Number.isFinite(n)) return res.status(400).json({ error: `${k} must be a number` });
        clean[k] = Number.isFinite(n) ? n : (schema.defaults[k] ?? 0);
        continue;
      }
      const v = typeof body[k] === "string" ? body[k].trim() : "";
      if (v && (schema.url || []).includes(k) && !/^https?:\/\//i.test(v)) return res.status(400).json({ error: `${k} must be a full https:// URL` });
      if (v && (schema.email || []).includes(k) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return res.status(400).json({ error: `${k} must be a valid email` });
      clean[k] = v;
    }
  }

  await pool.query(
    `INSERT INTO platform_settings(key, value, updated_at) VALUES($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [group, JSON.stringify(clean)],
  );
  platformConfig.bust(); // so the new value takes effect on the very next read
  // Real-time: tell every open client to refetch platform settings now (no reload).
  try { require("../lib/realtime").publishAll({ type: "platform", group, updatedAt: Date.now() }); } catch { /* best-effort */ }
  res.json(clean);
});

module.exports = router;
