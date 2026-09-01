"use strict";
// ── Help, feedback and release notes ─────────────────────────────────────────
// There was no way to reach a human from inside the product, and no record of what had
// changed in it. Both were zero-implementation gaps in the audit.
//
//   POST /api/support/tickets     raise a question / bug / idea (page + error ref attached)
//   GET  /api/support/tickets     the ones I've raised, and any replies
//   GET  /api/support/changelog   what's new (public to signed-in users)
//   POST /api/support/changelog   publish an entry (platform owner only)
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { pool } = require("../db");
const { q } = require("../lib/tenantDb");
const { sendMail } = require("../lib/email");
const { auditReq } = require("../lib/audit");

const KINDS = new Set(["question", "bug", "idea"]);

router.post("/tickets", authenticate, async (req, res, next) => {
  const b = req.body || {};
  const subject = String(b.subject || "").trim();
  const body = String(b.body || "").trim();
  if (!subject) return res.status(400).json({ error: "Give it a one-line subject so it can be picked up quickly", errors: { subject: "Required" } });
  if (!body) return res.status(400).json({ error: "Tell us what happened", errors: { body: "Required" } });
  const kind = KINDS.has(b.kind) ? b.kind : "question";
  try {
    const { rows } = await q(req.user.tenant_id,
      `INSERT INTO support_tickets(tenant_id, user_id, kind, subject, body, page_url, error_ref)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.tenant_id, req.user.id, kind, subject.slice(0, 200), body.slice(0, 5000),
       String(b.pageUrl || "").slice(0, 300) || null, String(b.errorRef || "").slice(0, 40) || null]);
    const t = rows[0];

    // Reaching a human is the point; the DB row is the backup, not the delivery.
    const to = process.env.SUPPORT_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[${kind}] ${subject} — ${req.user.email}`,
        html: `<p><strong>${kind}</strong> from ${req.user.email} (tenant ${req.user.tenant_id})</p>
               <p>${body.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>
               ${t.page_url ? `<p>Page: ${t.page_url}</p>` : ""}
               ${t.error_ref ? `<p>Error reference: <code>${t.error_ref}</code></p>` : ""}
               <p>Ticket ${t.id}</p>`,
      }).catch(() => { /* the ticket is still recorded */ });
    }
    auditReq(req, "support_ticket", "support", t.id, { kind, subject });
    // Be honest about whether a human was actually paged.
    res.status(201).json({ ...t, emailed: !!to });
  } catch (e) { next(e); }
});

router.get("/tickets", authenticate, async (req, res, next) => {
  try {
    const { rows } = await q(req.user.tenant_id,
      `SELECT id, kind, subject, body, status, reply, replied_at, created_at, page_url, error_ref
         FROM support_tickets WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50`,
      [req.user.tenant_id, req.user.id]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get("/changelog", authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const { rows } = await pool.query(
      "SELECT id, title, body, kind, published_at FROM changelog_entries ORDER BY published_at DESC LIMIT $1", [limit]);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/changelog", authenticate, async (req, res, next) => {
  if (req.user.role !== "super_admin") return res.status(403).json({ error: "Only the platform owner can publish release notes" });
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!title || !body) return res.status(400).json({ error: "A title and a body are required" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO changelog_entries(title, body, kind, created_by) VALUES($1,$2,$3,$4) RETURNING *",
      [title.slice(0, 200), body.slice(0, 4000), ["feature", "improvement", "fix"].includes(req.body?.kind) ? req.body.kind : "improvement", req.user.id]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
