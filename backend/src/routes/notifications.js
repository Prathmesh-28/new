"use strict";
// ── Notification preferences ─────────────────────────────────────────────────
// There were none. Every alert went to the whole firm on every channel the code happened
// to use, which is why people turn notifications off entirely rather than tune them.
//
//   GET  /api/notifications/preferences   → the event catalogue + this user's choices
//   PUT  /api/notifications/preferences   → save them
//   GET  /api/notifications/quiet-hours   → the firm's send window for CUSTOMER messages
//   PUT  /api/notifications/quiet-hours
//   POST /api/notifications/test          → prove a channel actually works
const router = require("express").Router();
const { authenticate } = require("../middleware/auth");
const { pool } = require("../db");
const { q } = require("../lib/tenantDb");
const { notify, prefsFor, EVENTS, DEFAULT_PREFS } = require("../lib/notify");

router.get("/preferences", authenticate, async (req, res, next) => {
  try {
    res.json({
      events: EVENTS,
      preferences: await prefsFor(req.user.tenant_id, req.user.id),
      defaults: DEFAULT_PREFS,
    });
  } catch (e) { next(e); }
});

router.put("/preferences", authenticate, async (req, res, next) => {
  try {
    const body = req.body || {};
    const valid = new Set(EVENTS.map((e) => e.id));
    // Only known events and known channels are stored, so a stale or hostile client can't
    // fill the preference blob with junk.
    const events = {};
    for (const [id, chans] of Object.entries(body.events || {})) {
      if (!valid.has(id)) continue;
      events[id] = {
        inApp: chans?.inApp !== false,
        email: !!chans?.email,
        push: !!chans?.push,
      };
    }
    const value = {
      digest: ["off", "daily", "weekly"].includes(body.digest) ? body.digest : DEFAULT_PREFS.digest,
      digestHour: Number.isInteger(body.digestHour) && body.digestHour >= 0 && body.digestHour <= 23 ? body.digestHour : DEFAULT_PREFS.digestHour,
      events,
    };
    await q(req.user.tenant_id,
      `INSERT INTO user_prefs(tenant_id,user_id,key,value) VALUES($1,$2,'notifications',$3)
       ON CONFLICT (tenant_id,user_id,key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
      [req.user.tenant_id, req.user.id, value]);
    res.json(await prefsFor(req.user.tenant_id, req.user.id));
  } catch (e) { next(e); }
});

// Quiet hours apply to messages sent to CUSTOMERS (reminders, statements), not to the
// firm's own staff alerts — a cash warning at 22:00 is exactly when it matters.
router.get("/quiet-hours", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT quiet_hours_start, quiet_hours_end FROM tenant_profile WHERE tenant_id=$1", [req.user.tenant_id]);
    res.json({ start: rows[0]?.quiet_hours_start ?? null, end: rows[0]?.quiet_hours_end ?? null });
  } catch (e) { next(e); }
});

router.put("/quiet-hours", authenticate, async (req, res, next) => {
  const hour = (v) => (v === null || v === "" || v === undefined ? null : Math.min(23, Math.max(0, parseInt(v, 10) || 0)));
  const start = hour(req.body?.start), end = hour(req.body?.end);
  if ((start === null) !== (end === null)) return res.status(400).json({ error: "Set both a start and an end hour, or neither" });
  try {
    await pool.query(
      `INSERT INTO tenant_profile(tenant_id, quiet_hours_start, quiet_hours_end) VALUES($1,$2,$3)
       ON CONFLICT (tenant_id) DO UPDATE SET quiet_hours_start=EXCLUDED.quiet_hours_start, quiet_hours_end=EXCLUDED.quiet_hours_end`,
      [req.user.tenant_id, start, end]);
    res.json({ start, end });
  } catch (e) { next(e); }
});

router.post("/test", authenticate, async (req, res, next) => {
  try {
    const sent = await notify(req.user.tenant_id, {
      ruleId: "comment.mention", // uses the same path a real notification takes
      userId: req.user.id,
      severity: "low",
      title: "Test notification",
      message: "If you're reading this, notifications are working. Nothing is wrong.",
      link: "/settings#notifications",
    });
    // Say exactly what happened rather than a blanket "sent" — a preference or a missing
    // SMTP/FCM key silently dropping a channel is precisely what this screen is for.
    res.json({ sent, note: Object.entries(sent).filter(([, v]) => v).map(([k]) => k).join(", ") || "nothing (check your preferences below)" });
  } catch (e) { next(e); }
});

module.exports = router;
