"use strict";
// ── Trash: undo a delete ─────────────────────────────────────────────────────
// Deleting anything used to be final. Now every delete that routes through
// lib/trash.softDelete lands here for 30 days, and the UI can offer both an immediate
// Undo toast and a bin the user can browse later.
//
//   GET    /api/trash?entity=invoice   → what's in the bin
//   POST   /api/trash/:id/restore      → put it back (original id, children included)
//   DELETE /api/trash/:id              → permanent, on purpose
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { auditReq } = require("../lib/audit");
const trash = require("../lib/trash");

// Restoring re-creates business records, so it is a write: same gate as the delete that
// put the row here. Deleting FOREVER is owner/admin only — it is the one action in this
// module with no undo of its own.
const WRITE_ROLES = ["super_admin", "owner", "finance_manager", "accountant", "sales"];
const PURGE_ROLES = ["super_admin", "owner", "admin"];
const gate = (roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "You don't have permission to do that" });

router.get("/", authenticate, async (req, res, next) => {
  try {
    const limit  = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const { rows, total } = await trash.list(req.user.tenant_id, { limit, offset, entity: req.query.entity });
    res.json({ data: rows, total, limit, offset });
  } catch (e) { next(e); }
});

router.post("/:id/restore", authenticate, gate(WRITE_ROLES), async (req, res, next) => {
  try {
    const out = await trash.restore(req.user.tenant_id, req.params.id);
    auditReq(req, "restored", out.entity, out.entityId, { label: out.label });
    res.json(out);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

router.delete("/:id", authenticate, gate(PURGE_ROLES), async (req, res, next) => {
  try {
    res.json(await trash.purge(req.user.tenant_id, req.params.id));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
