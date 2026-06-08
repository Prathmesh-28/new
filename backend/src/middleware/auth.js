const { verifyAccess } = require("../lib/jwt");
const { pool } = require("../db");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const payload = verifyAccess(token);
    const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  next();
}

function requireOwnerOrAdmin(req, res, next) {
  if (!["super_admin", "owner"].includes(req.user?.role)) return res.status(403).json({ error: "Forbidden" });
  next();
}

async function audit(action, entity, entityId) {
  return (req, res, next) => {
    res.on("finish", async () => {
      if (res.statusCode < 400 && req.user) {
        try {
          await pool.query(
            "INSERT INTO audit_log(user_id, action, entity, entity_id, meta) VALUES($1,$2,$3,$4,$5)",
            [req.user.id, action, entity, entityId || null, { method: req.method, path: req.path }]
          );
        } catch {}
      }
    });
    next();
  };
}

module.exports = { authenticate, requireAdmin, requireOwnerOrAdmin, audit };
