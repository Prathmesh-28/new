const router = require("express").Router();
const multer = require("multer");
const { pool } = require("../db");
const { authenticate } = require("../middleware/auth");
const { encryptBuffer, decryptBuffer } = require("../lib/fileCrypto");
const { signToken, verifyToken } = require("../modules/books/portal");

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

// A share link is a stateless HMAC token carrying only the file_shares row id -
// so the same row always reproduces the same path, and revoking/expiring is
// enforced by re-checking the row (not anything encoded in the token) on every fetch.
function sharePath(tenantId, shareId) {
  return `/api/files/public/${signToken({ kind: "file-share", tenant: tenantId, shareId })}`;
}

// GET /api/files/shares - this tenant's share-link register
router.get("/shares", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.recipient, s.access, s.created_at, s.expires_at, s.revoked_at, f.name AS doc_name
       FROM file_shares s JOIN files f ON f.id = s.file_id
      WHERE s.tenant_id=$1 ORDER BY s.created_at DESC`,
    [req.user.tenant_id]
  );
  res.json(rows.map(r => ({ ...r, path: sharePath(req.user.tenant_id, r.id) })));
});

// POST /api/files/:id/share - mint a share link for a vault document
router.post("/:id/share", authenticate, async (req, res) => {
  const { rows: fileRows } = await pool.query("SELECT id FROM files WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  if (!fileRows[0]) return res.status(404).json({ error: "Document not found" });
  const access = req.body?.access === "download" ? "download" : "view";
  const days = parseInt(req.body?.days, 10);
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000) : null;
  const { rows } = await pool.query(
    `INSERT INTO file_shares(tenant_id,file_id,recipient,access,created_by,expires_at)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id, recipient, access, created_at, expires_at, revoked_at`,
    [req.user.tenant_id, req.params.id, req.body?.recipient || null, access, req.user.id, expiresAt]
  );
  res.status(201).json({ ...rows[0], path: sharePath(req.user.tenant_id, rows[0].id) });
});

// POST /api/files/shares/:id/revoke
router.post("/shares/:id/revoke", authenticate, async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE file_shares SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL RETURNING id",
    [req.params.id, req.user.tenant_id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Share link not found" });
  res.json({ ok: true });
});

// DELETE /api/files/shares/:id - drop from the register (does not itself revoke;
// use the /revoke endpoint above to kill live access before deleting the row).
router.delete("/shares/:id", authenticate, async (req, res) => {
  await pool.query("DELETE FROM file_shares WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tenant_id]);
  res.json({ ok: true });
});

// GET /api/files/public/:token - PUBLIC, no auth. Serves the file iff the backing
// file_shares row is still live (not revoked, not past its expiry).
router.get("/public/:token", async (req, res) => {
  const p = verifyToken(req.params.token);
  if (!p || p.kind !== "file-share" || !p.shareId || !p.tenant) return res.status(401).json({ error: "Invalid or expired link" });
  const { rows } = await pool.query(
    `SELECT s.access, s.expires_at, s.revoked_at, f.name, f.mime_type, f.data, f.encrypted
       FROM file_shares s JOIN files f ON f.id = s.file_id
      WHERE s.id=$1 AND s.tenant_id=$2`,
    [p.shareId, p.tenant]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Link not found" });
  if (row.revoked_at) return res.status(410).json({ error: "This link has been revoked" });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return res.status(410).json({ error: "This link has expired" });
  res.set("Content-Type", row.mime_type);
  res.set("Content-Disposition", `${row.access === "download" ? "attachment" : "inline"}; filename="${row.name}"`);
  res.send(row.encrypted ? decryptBuffer(row.data) : row.data);
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
