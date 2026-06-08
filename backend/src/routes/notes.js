const router = require("express").Router();
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

// GET /api/notes/:entity/:entityId
router.get("/:entity/:entityId", authenticate, async (req, res) => {
  const { entity, entityId } = req.params;
  const { rows } = await pool.query(
    `SELECT n.*, u.email as author_email FROM notes n
     JOIN users u ON n.author_id = u.id
     WHERE n.tenant_id=$1 AND n.entity=$2 AND n.entity_id=$3
     ORDER BY n.created_at ASC`,
    [req.user.tenant_id, entity, entityId]
  );
  res.json(rows);
});

// POST /api/notes/:entity/:entityId
router.post("/:entity/:entityId", authenticate, async (req, res) => {
  const { entity, entityId } = req.params;
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: "body required" });
  const { rows } = await pool.query(
    "INSERT INTO notes(tenant_id,author_id,entity,entity_id,body) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [req.user.tenant_id, req.user.id, entity, entityId, body]
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/notes/:id
router.delete("/:id", authenticate, async (req, res) => {
  await pool.query("DELETE FROM notes WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
