const router = require("express").Router();
const { pool } = require("../db");
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");

// Owner-scoped organisation views — an owner sees everything happening inside
// THEIR OWN tenant (never across tenants; that's the super-admin console).

// GET /api/org/audit — recent actions by this tenant's own members (accountability)
router.get("/audit", authenticate, requireOwnerOrAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at,
            u.email AS actor_email, u.role AS actor_role
     FROM audit_log a JOIN users u ON u.id = a.user_id
     WHERE u.tenant_id = $1
     ORDER BY a.created_at DESC LIMIT $2`,
    [req.user.tenant_id, limit]
  );
  res.json(rows);
});

module.exports = router;
