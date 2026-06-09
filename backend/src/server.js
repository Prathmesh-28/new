require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt    = require("bcryptjs");
const { initDb, pool } = require("./db");

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
app.use(express.json({ limit: "10mb" }));

// Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
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

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("[error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL    || "admin@headroom.app";
  const adminPass  = process.env.ADMIN_PASSWORD || "Headroom@2024";

  const { rows } = await pool.query("SELECT id FROM users WHERE email=$1", [adminEmail]);
  if (!rows[0]) {
    const hash = await bcrypt.hash(adminPass, 10);
    await pool.query(
      "INSERT INTO users(email,password,role,tenant_id,first_login) VALUES($1,$2,'super_admin','default',false)",
      [adminEmail, hash]
    );
    console.log(`[seed] super_admin: ${adminEmail}`);
  }
}

initDb()
  .then(seed)
  .then(() => app.listen(PORT, () => console.log(`[server] :${PORT}`)))
  .catch(err => { console.error("[fatal]", err); process.exit(1); });
