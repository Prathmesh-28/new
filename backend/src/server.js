require("dotenv").config();
// Prefer IPv4 for all outbound DNS. Node 18+ defaults to IPv6-first ("verbatim"),
// and many container hosts (Render free tier) lack working IPv6 egress — which
// surfaces as persistent "connection error" to api.stripe.com et al. Force IPv4.
try { require("dns").setDefaultResultOrder("ipv4first"); } catch { /* older Node */ }
const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt    = require("bcryptjs");
const crypto    = require("crypto");
const cron      = require("node-cron");
const { initDb, pool } = require("./db");
const { sendDailyDigest, sendMondayBrief } = require("./lib/digest");

const app  = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  "https://headroom-pi.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    // No origin = server-to-server (Vercel proxy, curl) — always allow
    if (!origin) return cb(null, true);
    // Allow any *.vercel.app for preview deployments
    if (origin.endsWith(".vercel.app")) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("CORS origin not allowed"));
  },
  credentials: true,
}));
// Stripe webhook needs the RAW body for signature verification, so it must be
// registered BEFORE express.json() consumes the stream.
const billing = require("./routes/billing");
app.post("/webhook/stripe", express.raw({ type: "*/*" }), billing.webhookHandler);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false })); // Required for Twilio webhooks

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 60,                  // higher ceiling — covers normal app usage
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't rate-limit the endpoints the app calls automatically on every load —
  // /me and /refresh are token-validated and were what tripped the limit during
  // normal browsing. Brute-force protection on /login is handled separately by
  // the per-account 5-attempt lockout in routes/auth.js.
  skip: (req) => /\/(me|refresh)(\/|$)/.test(req.path),
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Auth (rate limited)
app.use("/auth",                   authLimiter, require("./routes/auth"));

// Core API
app.use("/api/kv",                 require("./routes/kv"));
app.use("/api/users",              require("./routes/users"));
app.use("/api/notes",              require("./routes/notes"));
app.use("/api/files",              require("./routes/files"));
app.use("/api/ai",                 require("./routes/ai"));

// New domain routes
app.use("/api/accounts",           require("./routes/accounts"));
app.use("/api/transactions",       require("./routes/transactions"));
app.use("/api/forecast",           require("./routes/forecast"));
app.use("/api/alerts",             require("./routes/alerts"));
app.use("/api/credit",             require("./routes/credit"));
app.use("/api/capital",            require("./routes/capital"));
app.use("/api/connectors",         require("./routes/connectors"));
app.use("/api/advisor",            require("./routes/advisor"));
app.use("/api/operations",         require("./routes/operations"));
app.use("/api/whatsapp",           require("./routes/whatsapp"));
app.use("/webhook/whatsapp",       require("./routes/whatsapp")); // Twilio inbound

// Phase 1+2 modules
app.use("/api/invoices",           require("./routes/invoices"));
app.use("/api/gst",                require("./routes/gst"));
app.use("/api/payroll",            require("./routes/payroll"));
app.use("/api/bnpl",               require("./routes/bnpl"));
app.use("/api/collections",        require("./routes/collections"));
app.use("/webhook/razorpay",       require("./routes/collections")); // Razorpay payment webhook
app.use("/api/billing",            billing);                          // Stripe subscriptions + invoice links
app.use("/api/treasury",           require("./routes/treasury"));
app.use("/api/ewa",                require("./routes/ewa"));
app.use("/api/suppliers",          require("./routes/suppliers"));
app.use("/api/lenders",            require("./routes/lenders"));

// ── Platform admin endpoints (super_admin only) ─────────────────────────────
// These are the PLATFORM owner's god-view across every tenant/company — distinct
// from an SMB owner, who only ever sees their own tenant.
const { authenticate: _auth } = require("./middleware/auth");
function requireSuper(req, res, next) {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  next();
}

// Unwrap the double-nested KV app blob → the live AppStore fields for a tenant.
function appBlob(rowValue) {
  // Stored as { value: { firm, bankAccounts, transactions, ... } }
  return (rowValue && typeof rowValue === "object" && rowValue.value) ? rowValue.value : {};
}
function companyFinancials(app) {
  const accounts = Array.isArray(app.bankAccounts) ? app.bankAccounts : [];
  const txns     = Array.isArray(app.transactions) ? app.transactions : [];
  const invoices = Array.isArray(app.invoices) ? app.invoices : [];
  const cash     = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const revenue  = txns.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expense  = txns.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const openAr   = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return { cash, revenue, expense, transactions: txns.length, accounts: accounts.length, openReceivables: openAr };
}

// GET /api/admin/companies — every tenant with live financials pulled from KV
app.get("/api/admin/companies", _auth, requireSuper, async (_req, res) => {
  const { rows: tenants } = await pool.query(
    `SELECT tenant_id,
            COUNT(*)::int AS user_count,
            MAX(CASE WHEN role IN ('owner','super_admin') THEN email END) AS owner_email,
            MIN(created_at) AS created_at
     FROM users GROUP BY tenant_id ORDER BY MIN(created_at) DESC`
  );
  const { rows: blobs } = await pool.query(
    "SELECT tenant_id, value, updated_at FROM kv_store WHERE namespace='app' AND key='store'"
  );
  const byTenant = {};
  for (const b of blobs) byTenant[b.tenant_id] = b;
  const companies = tenants.map(t => {
    const blob = byTenant[t.tenant_id];
    const app  = appBlob(blob?.value);
    return {
      tenant_id:    t.tenant_id,
      company_name: app.firm?.name || null,
      owner_email:  t.owner_email,
      user_count:   t.user_count,
      created_at:   t.created_at,
      last_activity: blob?.updated_at || null,
      ...companyFinancials(app),
    };
  });
  res.json(companies);
});

// GET /api/admin/tenants — lightweight tenant list (kept for back-compat)
app.get("/api/admin/tenants", _auth, requireSuper, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT tenant_id,
            COUNT(*) AS user_count,
            MAX(CASE WHEN role IN ('owner','super_admin') THEN email END) AS owner_email
     FROM users GROUP BY tenant_id ORDER BY tenant_id`
  );
  res.json(rows.map(r => ({ tenant_id: r.tenant_id, user_count: Number(r.user_count), owner_email: r.owner_email })));
});

// GET /api/admin/stats — platform-wide totals across ALL companies
app.get("/api/admin/stats", _auth, requireSuper, async (_req, res) => {
  const { rows: roleRows } = await pool.query("SELECT role, COUNT(*)::int AS n FROM users GROUP BY role");
  const { rows: tenantRow } = await pool.query("SELECT COUNT(DISTINCT tenant_id)::int AS n FROM users");
  const { rows: blobs } = await pool.query("SELECT value FROM kv_store WHERE namespace='app' AND key='store'");
  let totalCash = 0, totalRevenue = 0, totalTransactions = 0, totalReceivables = 0;
  for (const b of blobs) {
    const f = companyFinancials(appBlob(b.value));
    totalCash += f.cash; totalRevenue += f.revenue; totalTransactions += f.transactions; totalReceivables += f.openReceivables;
  }
  const byRole = {};
  let totalUsers = 0;
  for (const r of roleRows) { byRole[r.role] = r.n; totalUsers += r.n; }
  res.json({
    companies: tenantRow[0].n,
    users: totalUsers,
    byRole,
    totalCash, totalRevenue, totalTransactions, totalReceivables,
    activeCompanies: blobs.length,
  });
});

// POST /api/admin/users/:id/reset — force a password reset for any user
app.post("/api/admin/users/:id/reset", _auth, requireSuper, async (req, res) => {
  const { rows } = await pool.query("SELECT id FROM users WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash = await bcrypt.hash(tempPass, 10);
  await pool.query(
    "UPDATE users SET password=$1, first_login=true, failed_attempts=0, locked_until=NULL WHERE id=$2",
    [hash, req.params.id]
  );
  res.json({ password: tempPass });
});

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// Seed the platform super_admin. SAFE BY DESIGN:
//  - No hardcoded fallback credentials (no admin@headroom.app / Headroom@2024 backdoor).
//  - Only CREATES a brand-new super_admin from an explicit ADMIN_EMAIL + strong
//    ADMIN_PASSWORD; never auto-promotes an already-existing account (that would let
//    anyone self-register the admin email and get promoted on the next deploy).
//  - To promote YOUR existing account, run: node src/scripts/make-admin.js <email>
//    (operator-only, requires shell/DB access — no network attack surface).
async function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminPass  = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail) {
    console.log("[seed] ADMIN_EMAIL not set — skipping super_admin seed. Promote an account with: node src/scripts/make-admin.js <email>");
    return;
  }

  const { rows } = await pool.query("SELECT id, role FROM users WHERE email=$1", [adminEmail]);
  if (rows[0]) {
    if (rows[0].role !== "super_admin") {
      console.warn(`[seed] ${adminEmail} exists but is not super_admin. Refusing to auto-promote (security). Run: node src/scripts/make-admin.js ${adminEmail}`);
    }
    return;
  }
  if (!adminPass || adminPass.length < 10) {
    console.warn("[seed] ADMIN_PASSWORD missing or too short (min 10 chars) — not creating super_admin.");
    return;
  }
  const hash = await bcrypt.hash(adminPass, 10);
  await pool.query(
    "INSERT INTO users(email,password,role,tenant_id,first_login) VALUES($1,$2,'super_admin','admin',true)",
    [adminEmail, hash]
  );
  console.log(`[seed] created super_admin: ${adminEmail} (first_login=true — must set a new password on first sign-in)`);
}

initDb()
  .then(seed)
  .then(() => {
    app.listen(PORT, () => console.log(`[server] :${PORT}`));
    // Daily digest at 7:00 AM IST (01:30 UTC) — email + WhatsApp
    cron.schedule("30 1 * * *", async () => {
      sendDailyDigest().catch(err => console.error("[digest-email]", err.message));
      // Fire WhatsApp digest (self-call so it uses the same route logic)
      try {
        await fetch(`http://localhost:${PORT}/api/whatsapp/send-digest`, {
          method: "POST",
          headers: { "x-internal-secret": process.env.INTERNAL_CRON_SECRET ?? "" },
        });
      } catch (e) { console.error("[digest-wa]", e.message); }
    }, { timezone: "UTC" });
    // Monday CFO brief at 8:00 AM IST (02:30 UTC, day-of-week 1 = Monday)
    cron.schedule("30 2 * * 1", () => {
      sendMondayBrief().catch(err => console.error("[brief]", err.message));
    }, { timezone: "UTC" });
    console.log("[cron] daily digest 07:00 IST · Monday CFO brief 08:00 IST");
  })
  .catch(err => { console.error("[fatal]", err); process.exit(1); });
