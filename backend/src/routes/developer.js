"use strict";
// Developer settings (#185): owner-facing management of public-API keys. Session-authenticated
// (app JWT), owner/admin only. Creating a key returns the plaintext ONCE — thereafter only the
// prefix + metadata are visible.
const router = require("express").Router();
const { authenticate, requireOwnerOrAdmin } = require("../middleware/auth");
const apiKeys = require("../lib/apiKeys");

router.use(authenticate);
const tenantOf = (req) => (req.user.role === "super_admin" && req.query.tenant_id ? String(req.query.tenant_id) : req.user.tenant_id);

router.get("/keys", async (req, res) => {
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

module.exports = router;
