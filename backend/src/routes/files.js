const router = require("express").Router();
const multer = require("multer");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/files
router.post("/", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const { rows } = await pool.query(
    "INSERT INTO files(tenant_id,uploader_id,name,mime_type,size,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,mime_type,size,created_at",
    [req.user.tenant_id, req.user.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
  );
  res.status(201).json(rows[0]);
});

// GET /api/files — list
router.get("/", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,name,mime_type,size,created_at FROM files WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// GET /api/files/:id — download
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT name,mime_type,data FROM files WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.set("Content-Type", rows[0].mime_type);
  res.set("Content-Disposition", `attachment; filename="${rows[0].name}"`);
  res.send(rows[0].data);
});

// DELETE /api/files/:id
router.delete("/:id", authenticate, async (req, res) => {
  await pool.query("DELETE FROM files WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
