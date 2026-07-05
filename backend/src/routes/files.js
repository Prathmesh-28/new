const router = require("express").Router();
const multer = require("multer");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { encryptBuffer, decryptBuffer } = require("../lib/fileCrypto");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Allowlist of business-document MIME types. Anything else is rejected so the
// vault can't be used to store/serve executables or scripts (stored-XSS / malware).
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv", "text/plain",
]);

// POST /api/files
router.post("/", authenticate, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  if (!ALLOWED_MIME.has(req.file.mimetype)) {
    return res.status(415).json({ error: "Unsupported file type. Allowed: PDF, image, Excel, Word, CSV." });
  }
  const { category, expires_at, name } = req.body || {};
  const fileName = (name && String(name).trim()) || req.file.originalname;
  // tags may arrive as a comma-separated string or a JSON array.
  let tags = req.body?.tags;
  if (typeof tags === "string") {
    try { tags = JSON.parse(tags); } catch { tags = tags.split(",").map(t => t.trim()).filter(Boolean); }
  }
  if (!Array.isArray(tags)) tags = [];
  // Encrypt at rest (D3): `size` is recorded from the ORIGINAL plaintext buffer, not the
  // (slightly larger, iv+tag-prefixed) ciphertext, so downloads/listings show the real file size.
  const { rows } = await pool.query(
    `INSERT INTO files(tenant_id,uploader_id,name,mime_type,size,data,category,tags,expires_at,encrypted)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
     RETURNING id,name,mime_type,size,created_at,category,tags,expires_at`,
    [req.user.tenant_id, req.user.id, fileName, req.file.mimetype, req.file.size, encryptBuffer(req.file.buffer),
     category || null, tags.slice(0, 20), expires_at || null]
  );
  res.status(201).json(rows[0]);
});

// GET /api/files - list
router.get("/", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,name,mime_type,size,created_at,category,tags,expires_at FROM files WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tenant_id]
  );
  res.json(rows);
});

// GET /api/files/:id - download
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT name,mime_type,data,encrypted FROM files WHERE id=$1 AND tenant_id=$2",
    [req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.set("Content-Type", rows[0].mime_type);
  res.set("Content-Disposition", `attachment; filename="${rows[0].name}"`);
  // Legacy rows (uploaded before D3) are still plaintext — encrypted flags which decode path applies.
  res.send(rows[0].encrypted ? decryptBuffer(rows[0].data) : rows[0].data);
});

// DELETE /api/files/:id
router.delete("/:id", authenticate, async (req, res) => {
  await pool.query("DELETE FROM files WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

module.exports = router;
