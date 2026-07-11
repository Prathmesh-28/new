"use strict";
// Single, shared entry point for creating an alert - the ONE place a row is
// inserted into `alerts`, so escalation dispatch (Alerts -> Escalation Rules)
// runs for every alert-creation site instead of only ones that remember to call
// it by hand. An audit found escalation rules were saved (persisted, synced
// across devices) but had ZERO backend consumer - "a critical cash shortfall
// pings the founder on WhatsApp" was a promise nothing ever fulfilled.
const { pool } = require("../db");

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const isPhoneish = (s) => /^\+?[0-9][0-9\s-]{7,14}[0-9]$/.test(String(s || "").trim());

// Escalation rules live in the tenant's synced KV app-store (same place the
// Alerts page's useFeatureState("alr-escalation-rules", ...) writes them) -
// read directly from kv_store rather than round-tripping through an HTTP call.
async function escalationRulesFor(tenantId) {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM kv_store WHERE tenant_id=$1 AND namespace='app' AND key='store'", [tenantId]
    );
    const rules = rows[0]?.value?.value?.featureData?.["alr-escalation-rules"];
    return Array.isArray(rules) ? rules : [];
  } catch { return []; }
}

async function dispatchEscalation(tenantId, alert) {
  const rules = await escalationRulesFor(tenantId);
  const matches = rules.filter((r) => r && r.severity === alert.severity && r.recipient);
  if (!matches.length) return;
  const { sendWhatsApp } = require("./whatsapp");
  const { sendMail } = require("./email");
  const text = `[${String(alert.severity).toUpperCase()}] ${alert.title}\n${alert.message}`;
  for (const r of matches) {
    try {
      if (r.channel === "whatsapp" && isPhoneish(r.recipient)) {
        await sendWhatsApp(r.recipient.trim(), text);
      } else if (r.channel === "email" && isEmail(r.recipient)) {
        await sendMail({ to: r.recipient.trim(), subject: `Headroom alert: ${alert.title}`, html: `<p>${text.replace(/\n/g, "<br>")}</p>` });
      }
      // channel === 'call' (or a channel/recipient mismatch, e.g. whatsapp channel
      // with an email-shaped recipient): no voice-provider integration exists -
      // honestly skipped, matching the tab's own copy ("requires a connected
      // voice provider").
    } catch (e) {
      console.warn("[alerts] escalation dispatch failed", tenantId, r.recipient, e.message);
    }
  }
}

// Insert one alert row + best-effort escalation dispatch. Returns the inserted row.
async function raiseAlert(tenantId, { ruleId, severity = "medium", title, message, meta } = {}) {
  if (!ruleId) throw new Error("raiseAlert: ruleId is required");
  const { rows } = await pool.query(
    `INSERT INTO alerts(tenant_id, rule_id, severity, title, message, meta)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, ruleId, severity, title, message, meta !== undefined ? JSON.stringify(meta) : null]
  );
  const alert = rows[0];
  dispatchEscalation(tenantId, alert).catch((e) => console.warn("[alerts] escalation error", e.message));
  return alert;
}

module.exports = { raiseAlert };
