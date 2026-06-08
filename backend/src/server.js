require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const bcrypt   = require("bcryptjs");
const { initDb, pool } = require("./db");

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: [process.env.FRONTEND_URL || "http://localhost:5173", /localhost:\d+/],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Routes
app.use("/auth",      require("./routes/auth"));
app.use("/api/kv",    require("./routes/kv"));
app.use("/api/users", require("./routes/users"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/files", require("./routes/files"));
app.use("/api/ai",    require("./routes/ai"));

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
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
    console.log(`[seed] super_admin created: ${adminEmail}`);
  }
}

initDb()
  .then(seed)
  .then(() => app.listen(PORT, () => console.log(`[server] running on :${PORT}`)))
  .catch(err => { console.error("[fatal]", err); process.exit(1); });
