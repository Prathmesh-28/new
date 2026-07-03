"use strict";
// Developer settings (#185): owner-facing management of public-API keys. Session-authenticated
// (app JWT), owner/admin only. Creating a key returns the plaintext ONCE — thereafter only the
// prefix + metadata are visible.
const router = require("express").Router();
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const apiKeys = require("../lib/apiKeys");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);

router.get("/keys", requireOwnerOrAdmin, async (req, res) => {
  try { res.json(await apiKeys.listKeys(tenantOf(req))); } catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.post("/keys", requireOwnerOrAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const created = await apiKeys.createKey(tenantOf(req), req.user.id, { name: b.name, scopes: b.scopes });
    require("../modules/analytics").track(req.user.tenant_id, req.user.id, { event: "api_key_created", props: { scopes: created.scopes } }).catch(() => {});
    res.status(201).json(created); // includes the plaintext key ONCE
  } catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.delete("/keys/:id", requireOwnerOrAdmin, async (req, res) => {
  try { res.json(await apiKeys.revokeKey(tenantOf(req), req.params.id)); } catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});

// ── Outbound webhooks ──
const crypto = require("crypto");
const { pool } = require("../db");
// SSRF: literal fast-fail at registration; the authoritative resolve-and-check happens per delivery
// in lib/webhookDispatch (a public DNS name can resolve to a private IP).
const { assertPublicUrl } = require("../lib/ssrfGuard");
router.get("/webhooks", requireOwnerOrAdmin, async (req, res) => {
  try { const { rows } = await pool.query("SELECT id, url, events, active, created_at FROM api_webhooks WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantOf(req)]); res.json(rows); }
  catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.post("/webhooks", requireOwnerOrAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.url || !/^https?:\/\//.test(b.url)) return res.status(400).json({ error: "A valid https URL is required" });
    const pub = assertPublicUrl(b.url); if (!pub.ok) return res.status(400).json({ error: `Webhook URL rejected (${pub.reason}) — must be a public http(s) host.` });
    const events = Array.isArray(b.events) && b.events.length ? b.events : ["*"];
    const secret = "whsec_" + crypto.randomBytes(18).toString("base64url");
    const { rows } = await pool.query(
      "INSERT INTO api_webhooks(tenant_id, url, events, secret, created_by) VALUES($1,$2,$3,$4,$5) RETURNING id, url, events, active, created_at",
      [tenantOf(req), b.url, events, secret, req.user.id]);
    res.status(201).json({ ...rows[0], secret }); // secret shown once for signature verification
  } catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.delete("/webhooks/:id", requireOwnerOrAdmin, async (req, res) => {
  try { const { rowCount } = await pool.query("DELETE FROM api_webhooks WHERE tenant_id=$1 AND id=$2", [tenantOf(req), req.params.id]); res.json({ deleted: rowCount > 0 }); }
  catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});
router.get("/webhook-deliveries", requireOwnerOrAdmin, async (req, res) => {
  try { const { rows } = await pool.query("SELECT event, status_code, ok, error, attempt, created_at FROM api_webhook_deliveries WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50", [tenantOf(req)]); res.json(rows); }
  catch (e) { console.error("[developer]", e.message); res.status(500).json({ error: "Internal error" }); }
});

module.exports = router;
