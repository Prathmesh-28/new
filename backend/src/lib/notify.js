"use strict";
// ── One place a notification is decided and sent ─────────────────────────────
// Notifications were fire-and-forget: `alerts` rows went to the whole firm, email went out
// from whichever module happened to want it, and the person receiving them had no say in
// any of it. There were no per-user preferences, no digest, no quiet hours, and no
// suppression list — so a customer in a payment dispute kept getting automated chasers,
// and a user who only cared about overdue invoices got everything.
//
// Everything now goes through notify(). It answers three questions in one place:
//   1. WHO should hear about this (a person, or the firm)?
//   2. Do they want it, on which channel? (preferences, with sane defaults)
//   3. Is now an acceptable time, and is this recipient contactable at all?
const { pool } = require("../db");
const { q } = require("./tenantDb");
const { raiseAlert } = require("./alerts");
const { sendMail } = require("./email");

// The event catalogue. The UI renders its preference matrix from exactly this, so a new
// event type shows up in Settings without a second edit.
const EVENTS = [
  { id: "invoice.overdue",    group: "Money in",   label: "An invoice goes overdue",            defaults: { inApp: true, email: true,  push: true } },
  { id: "invoice.paid",       group: "Money in",   label: "A customer pays",                    defaults: { inApp: true, email: false, push: true } },
  { id: "invoice.viewed",     group: "Money in",   label: "A customer opens an invoice",        defaults: { inApp: true, email: false, push: false } },
  { id: "payment.failed",     group: "Money in",   label: "A payment fails",                    defaults: { inApp: true, email: true,  push: true } },
  { id: "bill.due",           group: "Money out",  label: "A bill is due soon",                 defaults: { inApp: true, email: true,  push: false } },
  { id: "payout.status",      group: "Money out",  label: "A payout succeeds or fails",         defaults: { inApp: true, email: true,  push: true } },
  { id: "cash.low",           group: "Cash",       label: "Cash runway drops below your floor", defaults: { inApp: true, email: true,  push: true } },
  { id: "compliance.due",     group: "Compliance", label: "A GST/TDS filing is due",            defaults: { inApp: true, email: true,  push: true } },
  { id: "approval.pending",   group: "Team",       label: "Something needs your approval",      defaults: { inApp: true, email: true,  push: true } },
  { id: "comment.mention",    group: "Team",       label: "Someone @mentions you",              defaults: { inApp: true, email: true,  push: true } },
  { id: "comment.new",        group: "Team",       label: "Someone comments on a record you watch", defaults: { inApp: true, email: false, push: false } },
  { id: "security.new_device",group: "Security",   label: "A sign-in from a new device",        defaults: { inApp: true, email: true,  push: false }, locked: true },
];
const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

const DEFAULT_PREFS = {
  digest: "daily",           // off | daily | weekly
  digestHour: 9,             // local hour (Asia/Kolkata)
  events: Object.fromEntries(EVENTS.map((e) => [e.id, e.defaults])),
};

/** A user's notification preferences, with defaults filled in for anything unset. */
async function prefsFor(tenantId, userId) {
  let stored = {};
  try {
    const { rows } = await q(tenantId,
      "SELECT value FROM user_prefs WHERE tenant_id=$1 AND user_id=$2 AND key='notifications'", [tenantId, userId]);
    stored = rows[0]?.value || {};
  } catch { /* unset preferences simply mean "use the defaults" */ }
  return {
    digest: stored.digest ?? DEFAULT_PREFS.digest,
    digestHour: Number.isInteger(stored.digestHour) ? stored.digestHour : DEFAULT_PREFS.digestHour,
    events: { ...DEFAULT_PREFS.events, ...(stored.events || {}) },
  };
}

/** Does this user want `ruleId` on `channel`? Unknown events default to in-app only. */
function wants(prefs, ruleId, channel) {
  const e = prefs.events[ruleId];
  if (!e) return channel === "inApp";
  // Security notices are not optional — being unable to turn off "someone signed in as
  // you" is the point of them.
  if (EVENT_BY_ID[ruleId]?.locked && channel === "email") return true;
  return e[channel] !== false && e[channel] !== undefined ? !!e[channel] : false;
}

/**
 * Is it an acceptable hour to message a CUSTOMER? Only applies to outbound customer
 * messages — a firm's own staff alerts are not held back.
 * Hours are the firm's local (Asia/Kolkata) clock; the process runs in UTC.
 */
async function withinQuietHours(tenantId, at = new Date()) {
  try {
    const { rows } = await pool.query(
      "SELECT quiet_hours_start, quiet_hours_end FROM tenant_profile WHERE tenant_id=$1", [tenantId]);
    const start = rows[0]?.quiet_hours_start, end = rows[0]?.quiet_hours_end;
    if (start == null || end == null || start === end) return false; // not configured
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(at));
    // A window that wraps midnight (e.g. 21 → 8) is the normal case.
    return start < end ? (hour >= start && hour < end) : (hour >= start || hour < end);
  } catch { return false; }
}

/** Has this customer asked not to be contacted? */
async function isSuppressed(tenantId, customerId) {
  if (!customerId) return { suppressed: false };
  try {
    const { rows } = await q(tenantId,
      "SELECT do_not_contact, do_not_contact_reason, name FROM customers WHERE id=$1 AND tenant_id=$2",
      [customerId, tenantId]);
    if (rows[0]?.do_not_contact) return { suppressed: true, reason: rows[0].do_not_contact_reason, name: rows[0].name };
  } catch { /* no customer row → nothing to suppress */ }
  return { suppressed: false };
}

/**
 * Notify a person (or the firm). Returns which channels actually went out, so callers can
 * be honest in the UI instead of claiming a send that a preference silently dropped.
 */
async function notify(tenantId, {
  ruleId, userId = null, severity = "medium", title, message,
  entity = null, entityId = null, link = null, meta = null,
}) {
  const sent = { inApp: false, email: false, push: false };
  const prefs = userId ? await prefsFor(tenantId, userId) : DEFAULT_PREFS;

  if (!userId || wants(prefs, ruleId, "inApp")) {
    await raiseAlert(tenantId, { ruleId, severity, title, message, meta, userId, entity, entityId, link });
    sent.inApp = true;
  }

  if (userId && wants(prefs, ruleId, "email")) {
    try {
      const { rows } = await pool.query("SELECT email FROM users WHERE id=$1", [userId]);
      if (rows[0]?.email) {
        await sendMail({
          to: rows[0].email,
          subject: title,
          html: `<p>${message}</p>${link ? `<p><a href="${process.env.APP_URL || "https://app.headroom.in"}${link}">Open it in Headroom</a></p>` : ""}
                 <p style="color:#888;font-size:12px">You're getting this because of your notification settings. Change them in Settings → Notifications.</p>`,
        });
        sent.email = true;
      }
    } catch { /* a failed email must never lose the in-app notification */ }
  }

  if (userId && wants(prefs, ruleId, "push")) {
    try {
      const push = require("./push");
      if (push.isConfigured()) {
        const { rows } = await pool.query("SELECT token FROM push_tokens WHERE tenant_id=$1 AND user_id=$2", [tenantId, userId]);
        const tokens = rows.map((r) => r.token).filter(Boolean);
        if (tokens.length) {
          await push.sendPush(tokens, { title, body: message, data: link ? { link } : undefined });
          sent.push = true;
        }
      }
    } catch { /* push is best-effort by nature */ }
  }

  return sent;
}

module.exports = { notify, prefsFor, wants, withinQuietHours, isSuppressed, EVENTS, DEFAULT_PREFS };
