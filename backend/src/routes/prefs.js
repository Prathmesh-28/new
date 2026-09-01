"use strict";
// ── Per-user preferences + saved list views ──────────────────────────────────
// Everything a user tunes about the UI lived nowhere (or in localStorage, so it did not
// follow them to their phone): theme, table density, which columns they care about,
// which notifications they want, and the filter sets they re-apply every morning.
//
//   GET    /api/prefs                     → all of this user's prefs as one object
//   PUT    /api/prefs/:key   { value }    → upsert one pref
//   DELETE /api/prefs/:key                → reset to default
//   GET    /api/prefs/views?listKey=      → saved views for a list (own + firm-shared)
//   POST   /api/prefs/views               → create
//   PATCH  /api/prefs/views/:id           → rename / re-save / share / set default
//   DELETE /api/prefs/views/:id           → delete (own only)
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { q } = require("../lib/tenantDb");

// Bound what a client may store so prefs can never become a general-purpose blob store.
const MAX_VALUE_BYTES = 32 * 1024;
const tooBig = (v) => Buffer.byteLength(JSON.stringify(v ?? null)) > MAX_VALUE_BYTES;

router.get("/", authenticate, async (req, res) => {
  const { rows } = await q(req.user.tenant_id,
    "SELECT key, value FROM user_prefs WHERE tenant_id=$1 AND user_id=$2",
    [req.user.tenant_id, req.user.id]);
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

router.put("/:key", authenticate, async (req, res) => {
  const key = String(req.params.key).slice(0, 80);
  const value = req.body?.value;
  if (value === undefined) return res.status(400).json({ error: "value is required" });
  if (tooBig(value)) return res.status(413).json({ error: "Preference is too large" });
  const { rows } = await q(req.user.tenant_id,
    `INSERT INTO user_prefs(tenant_id,user_id,key,value) VALUES($1,$2,$3,$4)
     ON CONFLICT (tenant_id,user_id,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()
     RETURNING key, value`,
    [req.user.tenant_id, req.user.id, key, value]);
  res.json(rows[0]);
});

router.delete("/:key", authenticate, async (req, res) => {
  await q(req.user.tenant_id, "DELETE FROM user_prefs WHERE tenant_id=$1 AND user_id=$2 AND key=$3",
    [req.user.tenant_id, req.user.id, String(req.params.key)]);
  res.json({ ok: true });
});

// ── Saved views ──────────────────────────────────────────────────────────────
router.get("/views", authenticate, async (req, res) => {
  const listKey = String(req.query.listKey || "").slice(0, 80);
  const params = [req.user.tenant_id, req.user.id];
  let where = "tenant_id=$1 AND (user_id=$2 OR shared=true)";
  if (listKey) { params.push(listKey); where += ` AND list_key=$${params.length}`; }
  const { rows } = await q(req.user.tenant_id,
    `SELECT v.*, (v.user_id=$2) AS is_mine FROM saved_views v WHERE ${where} ORDER BY v.is_default DESC, lower(v.name)`,
    params);
  res.json(rows);
});

router.post("/views", authenticate, async (req, res) => {
  const { listKey, name, config = {}, shared = false, isDefault = false } = req.body || {};
  if (!listKey || !name) return res.status(400).json({ error: "listKey and name are required" });
  if (tooBig(config)) return res.status(413).json({ error: "View is too large" });
  try {
    const { rows } = await q(req.user.tenant_id,
      `INSERT INTO saved_views(tenant_id,user_id,list_key,name,config,shared,is_default)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.tenant_id, req.user.id, String(listKey).slice(0, 80), String(name).slice(0, 80), config, !!shared, !!isDefault]);
    if (isDefault) await clearOtherDefaults(req, String(listKey), rows[0].id);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "You already have a view with that name" });
    throw e;
  }
});

router.patch("/views/:id", authenticate, async (req, res) => {
  const own = await q(req.user.tenant_id,
    "SELECT * FROM saved_views WHERE id=$1 AND tenant_id=$2 AND user_id=$3",
    [req.params.id, req.user.tenant_id, req.user.id]);
  if (!own.rows[0]) return res.status(404).json({ error: "View not found (you can only edit views you created)" });
  const b = req.body || {};
  if (b.config !== undefined && tooBig(b.config)) return res.status(413).json({ error: "View is too large" });
  const { rows } = await q(req.user.tenant_id,
    `UPDATE saved_views SET
       name       = COALESCE($4, name),
       config     = COALESCE($5, config),
       shared     = COALESCE($6, shared),
       is_default = COALESCE($7, is_default),
       updated_at = now()
     WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING *`,
    [req.params.id, req.user.tenant_id, req.user.id,
     b.name ? String(b.name).slice(0, 80) : null, b.config ?? null,
     b.shared === undefined ? null : !!b.shared, b.isDefault === undefined ? null : !!b.isDefault]);
  if (b.isDefault) await clearOtherDefaults(req, rows[0].list_key, rows[0].id);
  res.json(rows[0]);
});

router.delete("/views/:id", authenticate, async (req, res) => {
  const r = await q(req.user.tenant_id,
    "DELETE FROM saved_views WHERE id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING id",
    [req.params.id, req.user.tenant_id, req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "View not found (you can only delete views you created)" });
  res.json({ ok: true });
});

// Exactly one default per (user, list): setting a new one clears the previous.
async function clearOtherDefaults(req, listKey, keepId) {
  await q(req.user.tenant_id,
    "UPDATE saved_views SET is_default=false WHERE tenant_id=$1 AND user_id=$2 AND list_key=$3 AND id<>$4",
    [req.user.tenant_id, req.user.id, listKey, keepId]);
}

module.exports = router;
