require("dotenv").config();
// Prefer IPv4 for all outbound DNS. Node 18+ defaults to IPv6-first ("verbatim"),
// and many container hosts (Render free tier) lack working IPv6 egress - which
// surfaces as persistent "connection error" to outbound APIs. Force IPv4.
try { require("dns").setDefaultResultOrder("ipv4first"); } catch { /* older Node */ }
// `dns` order only helps clients that use dns.lookup (e.g. Node's https module).
// Node's global fetch()/undici (used for Razorpay) ignores it and can HANG on a
// dead IPv6 route. Happy Eyeballs races IPv4+IPv6 so the working one wins fast.
try { require("net").setDefaultAutoSelectFamily(true); } catch { /* Node < 18.13 */ }
// Guarantee the internal-cron shared secret always exists so /send-digest can
// fail CLOSED. In prod it's injected by render.yaml; locally we generate a
// per-process random value - the in-process cron self-call and the route handler
// read the same process.env, so they stay in sync while the public can't guess it.
if (!process.env.INTERNAL_CRON_SECRET) {
  process.env.INTERNAL_CRON_SECRET = require("crypto").randomBytes(32).toString("hex");
}
const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt    = require("bcryptjs");
const crypto    = require("crypto");
const cron      = require("node-cron");
const { initDb, pool } = require("./db");
const { sendDailyDigest, sendMondayBrief } = require("./lib/digest");
const { securityHeaders } = require("./middleware/security");
const logger = require("./lib/logger");

const app  = express();
const PORT = process.env.PORT || 4000;

// Behind Render/Vercel's proxy: trust exactly one hop so req.ip and the rate
// limiter see the real client IP (X-Forwarded-For) rather than the proxy's -
// otherwise every user shares one bucket and throttles each other.
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = new Set([
  process.env.FRONTEND_URL,
  // Production custom domains. On the web the browser makes SAME-ORIGIN calls to
  // these hosts (see vercel.json rewrites → Render), but browsers still send an
  // `Origin` header on POST, which Vercel forwards — so the apex + www of every
  // custom domain MUST be allowlisted or login/POST 500s with a CORS error.
  "https://dryzle.com",
  "https://www.dryzle.com",
  "https://headroom-pi.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  // Extra origins via env (comma-separated) — add a new domain with no code change.
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()) : []),
].filter(Boolean));

app.use(cors({
  origin: (origin, cb) => {
    // No origin = server-to-server (Vercel proxy, curl) - always allow
    if (!origin) return cb(null, true);
    // Allow any *.vercel.app for preview deployments
    if (origin.endsWith(".vercel.app")) return cb(null, true);
    // Capacitor native WebView origins - needed for the live-sync EventSource,
    // which (unlike fetch) is NOT proxied through CapacitorHttp.
    if (origin === "capacitor://localhost" || origin === "https://localhost" || origin === "http://localhost") return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
    cb(new Error("CORS origin not allowed"));
  },
  credentials: true,
}));
app.use(securityHeaders);
// Stash the raw request bytes so webhook HMAC checks (Razorpay) verify against
// exactly what the sender signed - re-serialising the parsed JSON would change
// byte order/spacing and break signature validation.
app.use(express.json({ limit: "10mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false })); // Required for Twilio webhooks

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 60,                  // higher ceiling - covers normal app usage
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  // Don't rate-limit the endpoints the app calls automatically on every load -
  // /me and /refresh are token-validated and were what tripped the limit during
  // normal browsing. Brute-force protection on /login is handled separately by
  // the per-account 5-attempt lockout in routes/auth.js.
  skip: (req) => /\/(me|refresh)(\/|$)/.test(req.path),
});

// General ceiling for the whole API surface - guards every non-auth endpoint
// from scraping/abuse. Generous so normal use (incl. the 5s KV poll) never
// trips it; the KV store + capability map are skipped since they're polled.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 240,            // ~4 req/s sustained per IP
  message: { error: "Too many requests, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/kv") || req.path === "/capabilities",
});
app.use("/api", apiLimiter);

// ── Product-analytics auto-capture ───────────────────────────────────────────
// One place that records EVERY authenticated write (POST/PATCH/PUT/DELETE) that
// succeeds, as a `{resource}.{verb}` event tagged with the stakeholder's role —
// so we understand behaviour across all 48 route groups + all stakeholder types
// without touching each feature. Reads `req.user` at response-finish (set by the
// per-router authenticate middleware by then). Consent-gated in analytics.track().
const TRACK_VERB = { POST: "create", PATCH: "update", PUT: "update", DELETE: "delete" };
app.use((req, res, next) => {
  res.on("finish", () => {
    try {
      const u = req.user, verb = TRACK_VERB[req.method];
      if (!u || !u.tenant_id || !verb) return;                 // authed mutations only
      if (res.statusCode < 200 || res.statusCode >= 300) return; // successful only
      const p = req.path || "";
      if (p.startsWith("/api/analytics") || p.startsWith("/auth")) return; // avoid self / double-count
      const parts = p.split("/").filter(Boolean);
      const resource = (parts[0] === "api" ? parts[1] : parts[0]) || "root";
      require("./modules/analytics").track(u.tenant_id, u.id, {
        event: `${resource}.${verb}`,
        props: { role: u.role, method: req.method, status: res.statusCode },
        path: p.slice(0, 160),
      }).catch(() => {});
    } catch { /* analytics must never affect the response */ }
  });
  next();
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Capability map - which integrations are live vs. preview (public, no secrets)
app.use("/api/capabilities", require("./routes/capabilities"));
// Platform settings - public social links (footer) + super-admin editor
app.use("/api/platform",     require("./routes/platform"));
// Client error sink (structured logging / observability)
app.use("/api/telemetry", require("./routes/telemetry"));

// Auth (rate limited)
app.use("/auth",                   authLimiter, require("./routes/auth"));

// Core API
app.use("/api/kv",                 require("./routes/kv"));
app.use("/api/users",              require("./routes/users"));
app.use("/api/invites",            require("./routes/invites"));   // team invites: request/accept/reject
app.use("/api/company",            require("./routes/company"));    // tenant/company profile (identity)
app.use("/api/org",                require("./routes/org"));        // owner-scoped org views (own tenant)
app.use("/api/books",              require("./modules/books/http")); // double-entry GL engine (§books)
app.use("/api/portal",             require("./modules/books/portal").router); // PUBLIC customer/vendor portals + gateway webhook
app.use("/api/crm",                require("./modules/crm/http"));   // CRM: leads, deals (pipeline), accounts
app.use("/api/erp",                require("./modules/erp/http"));   // ERP: BOMs + work orders (manufacturing)
app.use("/api/hrms",               require("./modules/hrms/http"));  // HRMS: employees, attendance, leave, payroll
app.use("/api/insights",           require("./modules/insights/http")); // Insights: cross-module KPIs + dashboards
app.use("/api/collab",             require("./modules/collab/http")); // Collab: Teams-style channels/DMs/messages (Phase 1 REST)
app.use("/api/studio",             require("./modules/studio/http")); // App Builder: projects + versions + deployments
app.use("/api/flows",              require("./modules/flows/http")); // Flows: native workflow automation engine
app.use("/api/campaigns",          require("./modules/crowdfunding/http")); // Rewards (pre-order) crowdfunding
app.use("/api/lending",            require("./modules/lending/http")); // SMB embedded lending (LOS/LMS + invoice financing)
app.use("/api/analytics",          require("./modules/analytics/http")); // Product analytics: events + onboarding profile + dashboard
app.use("/api/payouts",            require("./modules/payouts/http")); // Shared payout rail (lending disbursal / BNPL / EWA / treasury)
app.use("/webhook/payout",         require("./modules/payouts/http").webhook); // Provider payout settlement webhook (RazorpayX / Setu)
app.use("/api/counterparty",       require("./modules/counterparty/http")); // Counterparty intelligence: dedup + scores + gated enrichment + anchor invites
app.use("/api/sso",                require("./routes/sso")); // OIDC single sign-on (opt-in per tenant)
app.use("/api/developer",          require("./routes/developer")); // Public-API key management (owner)
app.use("/api/v1",                 require("./routes/publicApi")); // Public REST API v1 (API-key auth)
app.use("/api/pub",                require("./routes/studiopublic")); // PUBLIC: serve published App Builder apps (sandboxed, token-addressed)
app.use("/api/profile",            require("./routes/publicProfile")); // PUBLIC company profile (/p/:slug) + owner-gated settings
app.use("/api/agent-bridge",       require("./routes/agentbridge")); // PUBLIC: published apps call their granted Agent Studio agents (scoped, metered)
app.use("/api/account",            require("./routes/account")); // DPDP consent/export/erasure
app.use("/api/notes",              require("./routes/notes"));
app.use("/api/files",              require("./routes/files"));
app.use("/api/ai",                 require("./routes/ai"));

// New domain routes
app.use("/api/accounts",           require("./routes/accounts"));
app.use("/api/transactions",       require("./routes/transactions"));
app.use("/api/alerts",             require("./routes/alerts"));
app.use("/api/credit",             require("./routes/credit"));
app.use("/api/capital",            require("./routes/capital"));
app.use("/api/connectors",         require("./routes/connectors"));
app.use("/api/advisor",            require("./routes/advisor"));
app.use("/api/operations",         require("./routes/operations"));
app.use("/api/whatsapp",           require("./routes/whatsapp"));
app.use("/api/push",               require("./routes/push"));
app.use("/webhook/whatsapp",       require("./routes/whatsapp")); // Twilio inbound

// Phase 1+2 modules
app.use("/api/invoices",           require("./routes/invoices"));
app.use("/api/forecast",           require("./routes/forecast"));
app.use("/api/audit",              require("./routes/audit"));
app.use("/api/gst",                require("./routes/gst"));
app.use("/api/payroll",            require("./routes/payroll"));
app.use("/api/bnpl",               require("./routes/bnpl"));
app.use("/api/collections",        require("./routes/collections"));
app.use("/webhook/razorpay",       require("./routes/collections")); // Razorpay payment webhook
app.use("/api/billing",            require("./routes/billing"));     // Razorpay subscription checkout
app.use("/api/treasury",           require("./routes/treasury"));
app.use("/api/ewa",                require("./routes/ewa"));
app.use("/api/suppliers",          require("./routes/suppliers"));
app.use("/api/lenders",            require("./routes/lenders"));
app.use("/api/vendors",            require("./routes/vendors"));   // vendor master (profiles)
app.use("/api/vendor-bills",       require("./routes/vendorBills")); // real bills → GL + AP aging

// ── Platform admin endpoints (super_admin only) ─────────────────────────────
// These are the PLATFORM owner's god-view across every tenant/company - distinct
// from an SMB owner, who only ever sees their own tenant.
const { authenticate: _auth } = require("./middleware/auth");
const { writeAudit } = require("./lib/audit");
const PLAN_MONTHLY_INR = { free: 0, starter: 799, growth: 2499, pro: 5999 }; // ex-GST list price
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

// GET /api/admin/companies - every tenant with live financials pulled from KV
app.get("/api/admin/companies", _auth, requireSuper, async (_req, res) => {
  const { rows: tenants } = await pool.query(
    `SELECT u.tenant_id,
            COUNT(*)::int AS user_count,
            MAX(CASE WHEN u.role IN ('owner','super_admin') THEN u.email END) AS owner_email,
            COALESCE(MAX(u.subscription_plan), 'free') AS plan,
            MIN(u.created_at) AS created_at,
            MAX(u.last_login_at) AS last_login_at,
            MAX(p.company_name) AS profile_name,
            COALESCE(MAX(p.status), 'active') AS status,
            MAX(b.provider) AS billing_provider,
            MAX(b.status) AS billing_status,
            MAX(b.updated_at) AS billing_updated_at
     FROM users u LEFT JOIN tenant_profile p ON p.tenant_id = u.tenant_id
                   LEFT JOIN tenant_billing b ON b.tenant_id = u.tenant_id
     GROUP BY u.tenant_id ORDER BY MIN(u.created_at) DESC`
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
      company_name: t.profile_name || app.firm?.name || null,
      owner_email:  t.owner_email,
      user_count:   t.user_count,
      plan:         t.plan || "free",
      status:       t.status || "active",
      created_at:   t.created_at,
      last_login_at: t.last_login_at || null,
      last_activity: blob?.updated_at || null,
      // Real tenant_billing record (A9, 2026-07 gap audit) — distinguishes a plan that was
      // actually billed (provider='razorpay') from one an admin granted for free
      // (provider='admin', e.g. a comp/trial/manual override), and NULL when the tenant has
      // never touched billing at all (still on the free default).
      billing_provider: t.billing_provider || null,
      billing_status:   t.billing_status || null,
      billing_updated_at: t.billing_updated_at || null,
      ...companyFinancials(app),
    };
  });
  res.json(companies);
});

// POST /api/admin/tenants/:tid/plan - super-admin override of a tenant's plan
// (comp / test / manual upgrade). Syncs tenant_billing + every user in the tenant.
app.post("/api/admin/tenants/:tid/plan", _auth, requireSuper, async (req, res) => {
  const plan = (req.body && req.body.plan) || "";
  if (!["free", "starter", "growth", "pro"].includes(plan)) return res.status(400).json({ error: "Invalid plan" });
  const tid = req.params.tid;
  await pool.query(
    `INSERT INTO tenant_billing(tenant_id, plan, provider, status, updated_at)
     VALUES($1,$2,'admin','active',now())
     ON CONFLICT(tenant_id) DO UPDATE SET plan=$2, provider='admin', status='active', updated_at=now()`,
    [tid, plan]
  );
  await pool.query("UPDATE users SET subscription_plan=$1 WHERE tenant_id=$2", [plan, tid]);
  writeAudit(req.user.id, "tenant.plan_change", "tenant", tid, { plan });
  res.json({ ok: true, tenant_id: tid, plan });
});

// POST /api/admin/tenants/:tid/suspend - disable a whole company (blocks login)
app.post("/api/admin/tenants/:tid/suspend", _auth, requireSuper, async (req, res) => {
  const tid = req.params.tid;
  const reason = ((req.body && req.body.reason) || "").toString().slice(0, 280);
  await pool.query("UPDATE users SET status='suspended' WHERE tenant_id=$1", [tid]);
  await pool.query(
    `INSERT INTO tenant_profile(tenant_id, status, suspend_reason, updated_at)
     VALUES($1,'suspended',$2,now())
     ON CONFLICT(tenant_id) DO UPDATE SET status='suspended', suspend_reason=$2, updated_at=now()`,
    [tid, reason]
  );
  writeAudit(req.user.id, "tenant.suspend", "tenant", tid, { reason });
  res.json({ ok: true, tenant_id: tid, status: "suspended" });
});

// POST /api/admin/tenants/:tid/activate - re-enable a suspended company
app.post("/api/admin/tenants/:tid/activate", _auth, requireSuper, async (req, res) => {
  const tid = req.params.tid;
  await pool.query("UPDATE users SET status='active' WHERE tenant_id=$1", [tid]);
  await pool.query(
    `INSERT INTO tenant_profile(tenant_id, status, suspend_reason, updated_at)
     VALUES($1,'active',NULL,now())
     ON CONFLICT(tenant_id) DO UPDATE SET status='active', suspend_reason=NULL, updated_at=now()`,
    [tid]
  );
  writeAudit(req.user.id, "tenant.activate", "tenant", tid, {});
  res.json({ ok: true, tenant_id: tid, status: "active" });
});

// POST /api/admin/preview-role - audit trail for "open as [user]'s role" (A6, 2026-07 gap
// audit). Open-as itself is client-side (setSelectedClient scopes reads/writes to the
// target tenant via X-Tenant-Id, per middleware/auth.js; previewRole is a client-only UI
// gate matching that role's tabs) — this endpoint's only job is to make it ACCOUNTABLE:
// "who previewed as which role, for which user, when."
app.post("/api/admin/preview-role", _auth, requireSuper, async (req, res) => {
  const { targetUserId, role } = req.body || {};
  if (!targetUserId || typeof role !== "string") return res.status(400).json({ error: "targetUserId and role required" });
  const { rows } = await pool.query("SELECT id, email, tenant_id, role FROM users WHERE id=$1", [targetUserId]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  const target = rows[0];
  writeAudit(req.user.id, "admin.preview_role", "user", target.id, { email: target.email, tenant_id: target.tenant_id, role: role || target.role });
  res.json({ ok: true, tenant_id: target.tenant_id, role: role || target.role });
});

// GET /api/admin/metrics - real platform business metrics (MRR, plan mix, signups)
app.get("/api/admin/metrics", _auth, requireSuper, async (_req, res) => {
  // Plan per tenant (max plan held in the tenant), used for MRR + distribution. Joined
  // against tenant_billing so MRR can split CONFIRMED (actually billed via a payment
  // provider) from ADMIN-GRANTED (comp/trial/manual override) — both are real revenue-
  // relevant facts, but only the first is money actually collected (A9, 2026-07 audit).
  const { rows: planRows } = await pool.query(
    `SELECT u.tenant_id, COALESCE(MAX(u.subscription_plan),'free') AS plan, MAX(b.provider) AS provider
       FROM users u LEFT JOIN tenant_billing b ON b.tenant_id = u.tenant_id
      GROUP BY u.tenant_id`
  );
  const planMix = { free: 0, starter: 0, growth: 0, pro: 0 };
  let mrr = 0, confirmedMrr = 0, paidTenants = 0, confirmedPaidTenants = 0;
  for (const r of planRows) {
    const p = planMix[r.plan] != null ? r.plan : "free";
    planMix[p] += 1;
    const price = PLAN_MONTHLY_INR[p] || 0;
    if (price > 0) {
      mrr += price; paidTenants += 1;
      if (r.provider && r.provider !== "admin") { confirmedMrr += price; confirmedPaidTenants += 1; }
    }
  }
  // Signups over the last 12 months (by tenant's first user).
  const { rows: signupRows } = await pool.query(
    `SELECT to_char(date_trunc('month', first_at), 'YYYY-MM') AS month, COUNT(*)::int AS n
     FROM (SELECT tenant_id, MIN(created_at) AS first_at FROM users GROUP BY tenant_id) t
     WHERE first_at > now() - interval '12 months'
     GROUP BY 1 ORDER BY 1`
  );
  const { rows: actRows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE last_login_at > now() - interval '30 days'"
  );
  const { rows: pendingInv } = await pool.query("SELECT COUNT(*)::int AS n FROM team_invites WHERE status='pending'");
  // Downgraded-to-free (30d): the one real churn-adjacent signal this platform can
  // currently measure — every plan_change is audited (tenant.plan_change), so a tenant
  // whose most recent change moved them from a paid tier to free is a genuine downgrade.
  // Deliberately NOT called "churn %": there is no subscription-cancellation webhook and
  // no self-serve cancel flow yet, so self-initiated churn can't be captured — this counts
  // only downgrades that were actually recorded, never a fabricated estimate.
  const { rows: downgradeRows } = await pool.query(`
    WITH changes AS (
      SELECT entity_id AS tenant_id, meta->>'plan' AS plan, created_at,
             LAG(meta->>'plan') OVER (PARTITION BY entity_id ORDER BY created_at) AS prev_plan
        FROM audit_log WHERE action = 'tenant.plan_change' AND entity = 'tenant'
    )
    SELECT COUNT(DISTINCT tenant_id)::int AS n FROM changes
     WHERE plan = 'free' AND prev_plan IS NOT NULL AND prev_plan <> 'free'
       AND created_at > now() - interval '30 days'`
  ).catch(() => ({ rows: [{ n: 0 }] }));
  res.json({
    mrr, arr: mrr * 12, paidTenants,
    confirmedMrr, confirmedArr: confirmedMrr * 12, confirmedPaidTenants,
    downgradedToFree30d: downgradeRows[0].n,
    planMix,
    signupsByMonth: signupRows,
    activeUsers30d: actRows[0].n,
    pendingInvites: pendingInv[0].n,
    currency: "INR",
  });
});

// GET /api/admin/tenants - lightweight tenant list (kept for back-compat)
app.get("/api/admin/tenants", _auth, requireSuper, async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT tenant_id,
            COUNT(*) AS user_count,
            MAX(CASE WHEN role IN ('owner','super_admin') THEN email END) AS owner_email
     FROM users GROUP BY tenant_id ORDER BY tenant_id`
  );
  res.json(rows.map(r => ({ tenant_id: r.tenant_id, user_count: Number(r.user_count), owner_email: r.owner_email })));
});

// GET /api/admin/stats - platform-wide totals across ALL companies
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

// GET /api/admin/audit - recent admin/org actions (accountability trail, A4)
app.get("/api/admin/audit", _auth, requireSuper, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
            u.email AS actor_email, u.role AS actor_role
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// POST /api/admin/users/:id/reset - force a password reset for any user
app.post("/api/admin/users/:id/reset", _auth, requireSuper, async (req, res) => {
  const { rows } = await pool.query("SELECT id FROM users WHERE id=$1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const tempPass = crypto.randomBytes(8).toString("hex");
  const hash = await bcrypt.hash(tempPass, 10);
  await pool.query(
    "UPDATE users SET password=$1, first_login=true, failed_attempts=0, locked_until=NULL WHERE id=$2",
    [hash, req.params.id]
  );
  writeAudit(req.user.id, "user.password_reset", "user", req.params.id, {});
  res.json({ password: tempPass });
});

// GET /api/admin/users/:id/detail - the 360 view (A2/A3, 2026-07 gap audit): recent
// login/device history and a per-user slice of the audit trail (both actions THIS user
// took, and actions taken ON this user by an admin), not just the last-login timestamp
// UserDetailModal already showed. Note: invoices/transactions have no per-user
// attribution column in this schema (they're tenant-scoped, not staff-attributed), so
// there's no honest "this user's own invoices" to add — the org-wide financials already
// shown on the user record are the real ceiling of what's attributable here.
app.get("/api/admin/users/:id/detail", _auth, requireSuper, async (req, res) => {
  const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id=$1", [req.params.id]);
  if (!userRows[0]) return res.status(404).json({ error: "Not found" });
  const { rows: recentLogins } = await pool.query(
    "SELECT ip, user_agent, created_at FROM login_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
    [req.params.id]
  );
  const { rows: auditTrail } = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at, u.email AS actor_email
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.user_id = $1::uuid OR (a.entity = 'user' AND a.entity_id = $1::text)
      ORDER BY a.created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json({ recentLogins, auditTrail });
});

// Super-admin console API (Users / Organisation / Subscription tabs)
app.use("/api/admin", require("./routes/adminConsole"));

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, req, res, _next) => {
  logger.error("unhandled_error", {
    msg: err.message,
    stack: (err.stack || "").split("\n").slice(0, 4).join(" | "),
    method: req.method,
    path: req.path,
    tenant: req.user?.tenant_id,
  });
  res.status(500).json({ error: "Internal server error" });
});

// Seed the platform super_admin. SAFE BY DESIGN:
//  - No hardcoded fallback credentials (no admin@headroom.app / Headroom@2024 backdoor).
//  - Only CREATES a brand-new super_admin from an explicit ADMIN_EMAIL + strong
//    ADMIN_PASSWORD; never auto-promotes an already-existing account (that would let
//    anyone self-register the admin email and get promoted on the next deploy).
//  - To promote YOUR existing account, run: node src/scripts/make-admin.js <email>
//    (operator-only, requires shell/DB access - no network attack surface).
async function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminPass  = process.env.ADMIN_PASSWORD || "";
  if (!adminEmail) {
    console.log("[seed] ADMIN_EMAIL not set - skipping super_admin seed. Promote an account with: node src/scripts/make-admin.js <email>");
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
    console.warn("[seed] ADMIN_PASSWORD missing or too short (min 10 chars) - not creating super_admin.");
    return;
  }
  const hash = await bcrypt.hash(adminPass, 10);
  await pool.query(
    "INSERT INTO users(email,password,role,tenant_id,first_login) VALUES($1,$2,'super_admin','admin',true)",
    [adminEmail, hash]
  );
  console.log(`[seed] created super_admin: ${adminEmail} (first_login=true - must set a new password on first sign-in)`);
}

initDb()
  .then(seed)
  .then(() => {
    const server = app.listen(PORT, () => console.log(`[server] :${PORT}`));
    // Graceful shutdown: Render sends SIGTERM on every deploy/restart. Stop accepting
    // new connections, let in-flight requests (money posts, webhooks, uploads) finish,
    // close the DB pool, then exit — instead of being hard-killed mid-transaction.
    let shuttingDown = false;
    const shutdown = (sig) => {
      if (shuttingDown) return; shuttingDown = true;
      console.log(`[shutdown] ${sig} — draining in-flight requests…`);
      const force = setTimeout(() => { console.error("[shutdown] forced exit after 25s"); process.exit(1); }, 25000);
      if (force.unref) force.unref();
      server.close((err) => {
        if (err) console.error("[shutdown] server.close:", err.message);
        pool.end().catch((e) => console.error("[shutdown] pool.end:", e.message))
          .finally(() => { clearTimeout(force); console.log("[shutdown] clean exit"); process.exit(err ? 1 : 0); });
      });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    // No more silent crashes: surface process-level errors (the audit flagged none were
    // captured). A truly uncaught exception leaves an undefined state → drain + let
    // Render restart cleanly; an unhandled rejection is logged but kept non-fatal.
    process.on("unhandledRejection", (reason) => require("./lib/logger").error("unhandledRejection", { reason: reason instanceof Error ? reason.stack : String(reason) }));
    // In an uncaught-exception the process state is undefined — log SYNCHRONOUSLY to
    // stderr (not via the async forwarder, which could itself fault) and drain-restart.
    process.on("uncaughtException", (err) => { console.error("[uncaughtException]", err && err.stack ? err.stack : String(err)); shutdown("uncaughtException"); });
    // Daily digest at 7:00 AM IST (01:30 UTC) - email + WhatsApp
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
    // Books: generate due recurring invoices/bills/journals daily at 07:30 IST.
    cron.schedule("0 2 * * *", () => {
      require("./modules/books/documents").runAllRecurring().catch(err => console.error("[books-recurring]", err.message));
      // Customer-facing recurring invoices (invoice_recurring → real numbered invoices,
      // optional auto-send). Skips missed periods; never back-bills a catch-up batch.
      require("./lib/recurringInvoices").runDueRecurringInvoices()
        .then(n => { if (n) console.log(`[recurring-invoices] generated ${n} invoice(s)`); })
        .catch(err => console.error("[recurring-invoices]", err.message));
    }, { timezone: "UTC" });
    // Lending: daily loan servicing at 08:00 IST (02:30 UTC), after recurring docs post.
    // First schedule any due e-NACH mandate presentations, then run servicing (DPD refresh,
    // NPA classification, penal-interest accrual) so a bounce escalates the same day.
    cron.schedule("30 2 * * *", async () => {
      try { const m = await require("./modules/lending/mandates").presentDueAll(); if (m && m.scheduled) console.log(`[lending-mandates] scheduled ${m.scheduled} presentation(s)`); }
      catch (err) { console.error("[lending-mandates]", err.message); }
      try {
        const r = await require("./modules/lending/servicing").runServicingDue();
        if (r && r.serviced) console.log(`[lending-servicing] serviced ${r.serviced} loan(s), ${r.penalPosted} penal accrual(s)`);
      } catch (err) { console.error("[lending-servicing]", err.message); }
      // AFTER servicing refreshed DPD: label underwriting runs from observed loan conduct —
      // the repay→relearn loop that makes the scorecard backtestable.
      try {
        const n2 = await require("./lib/underwritingRuns").labelOutcomes();
        if (n2) console.log(`[underwriting-runs] labelled ${n2} run outcome(s)`);
      } catch (err) { console.error("[underwriting-runs]", err.message); }
      // THEN refresh continuous pre-approval: expire stale offers, keep a fresh standing
      // working-capital offer (ladder-limited, 14d expiry) per pre-qualified tenant.
      require("./modules/lending").refreshStandingOffers()
        .then(r => { if (r && (r.created || r.expired)) console.log(`[lending-preapproval] ${r.created} offer(s) refreshed, ${r.expired} expired`); })
        .catch(err => console.error("[lending-preapproval]", err.message));
    }, { timezone: "UTC" });
    // Data retention (D5, 2026-07 gap audit): process self-requested erasures past their
    // grace window, age out audit_log past its retention window, and scan (dry-run unless
    // RETENTION_PURGE_ENFORCE=true) statutory records past the GST/IT-Act window. Nightly
    // at 04:00 UTC, clear of the other jobs above.
    cron.schedule("0 4 * * *", async () => {
      const retention = require("./lib/retention");
      try {
        const n = await retention.processDeletionRequests();
        if (n) console.log(`[retention] completed ${n} self-requested erasure(s)`);
      } catch (err) { console.error("[retention-deletion-requests]", err.message); }
      try {
        const n = await retention.purgeAuditLog();
        if (n) console.log(`[retention] aged out ${n} audit_log row(s)`);
      } catch (err) { console.error("[retention-audit-log]", err.message); }
      try {
        const r = await retention.purgeStatutoryRecords();
        if (r.invoices || r.transactions || r.loans) {
          console.log(`[retention] statutory ${r.enforced ? "purged" : "dry-run"}:`, r);
        }
      } catch (err) { console.error("[retention-statutory]", err.message); }
    }, { timezone: "UTC" });
    // Books: durable e-invoice worker (registers QUEUED vouchers with the GSP).
    require("./modules/books/einvoice").startWorker();
    // SMB agents: run scheduled (daily/weekly) agents each hour - read-only autonomous runs.
    cron.schedule("0 * * * *", () => {
      require("./modules/books").agents.runScheduledAgents(new Date())
        .then(r => { if (r && r.ran) console.log(`[agents] ran ${r.ran} scheduled agent(s)`); })
        .catch(err => console.error("[agents-scheduled]", err.message));
      // Flows: run scheduled workflows that are due this hour.
      require("./modules/flows/runner").runDueScheduled(new Date())
        .then(r => { if (r && r.ran) console.log(`[flows] ran ${r.ran} scheduled flow(s)`); })
        .catch(err => console.error("[flows-scheduled]", err.message));
    }, { timezone: "UTC" });
    // Overdue-invoice reminders daily at 08:30 IST (03:00 UTC) - raises in-app alerts.
    cron.schedule("0 3 * * *", () => {
      require("./lib/reminders").runOverdueReminders()
        .then(n => { if (n) console.log(`[reminders] raised ${n} overdue-invoice alert(s)`); })
        .catch(err => console.error("[reminders]", err.message));
      // Flows: emit the daily cash pulse to tenants with a cash.daily flow.
      require("./modules/flows/runner").runDailyCashEvents()
        .then(r => { if (r && r.fired) console.log(`[flows] cash.daily fired ${r.fired} flow(s)`); })
        .catch(err => console.error("[flows-cash-daily]", err.message));
      // Flows: emit invoice.overdue for each still-unpaid past-due invoice, so activated
      // "days overdue / status overdue" rules (converted from the Rule Builder) actually fire.
      require("./modules/flows/runner").runOverdueInvoiceEvents()
        .then(r => { if (r && r.fired) console.log(`[flows] invoice.overdue fired ${r.fired} event(s)`); })
        .catch(err => console.error("[flows-overdue]", err.message));
      // Analytics win-back: nudge businesses that have gone quiet (WhatsApp → email →
      // in-app alert, gated; dedup'd by cooldown). Turns retention data into action.
      require("./modules/analytics").runWinback({})
        .then(r => { if (r && r.scanned) console.log(`[winback] nudged ${r.scanned} dormant biz`, r.channels); })
        .catch(err => console.error("[winback]", err.message));
      // Expiry/renewal + DSC reminders: raise alerts as licenses/DSCs/AMCs/insurance near expiry.
      require("./lib/reminders").runExpiryReminders()
        .then(n => { if (n) console.log(`[reminders] raised ${n} expiry/renewal alert(s)`); })
        .catch(err => console.error("[reminders-expiry]", err.message));
    }, { timezone: "UTC" });
    // Subscriptions: generate due recurring invoices daily at 07:45 IST (02:15 UTC).
    cron.schedule("15 2 * * *", async () => {
      try {
        const { rows } = await require("./db").pool.query("SELECT DISTINCT tenant_id FROM book_subscriptions WHERE status IN ('active','trial') AND next_invoice_date <= CURRENT_DATE");
        const books = require("./modules/books");
        const today = new Date().toISOString().slice(0, 10);
        let n = 0;
        for (const r of rows) {
          const made = await books.generateDueInvoices(r.tenant_id, today).catch((e) => { console.error("[subscriptions]", r.tenant_id, e.message); return null; });
          if (made) n += (Array.isArray(made) ? made.length : (made.created?.length || made.invoices?.length || 0));
        }
        if (n) console.log(`[subscriptions] generated ${n} due invoice(s)`);
      } catch (e) { console.error("[subscriptions-cron]", e.message); }
    }, { timezone: "UTC" });
    console.log("[cron] daily digest 07:00 IST · Monday CFO brief 08:00 IST · books recurring 07:30 IST · overdue reminders 08:30 IST · subscriptions 07:45 IST · e-invoice worker on");
  })
  .catch(err => { console.error("[fatal]", err); process.exit(1); });
