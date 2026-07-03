"use strict";
// Outbound webhook delivery (#148/#185). dispatch() is called from the Flows event bus (emitEvent)
// for every top-level tenant event; it fans the event out to each active, subscribed webhook,
// HMAC-signs the body, delivers best-effort with one retry, and logs the outcome. Fire-and-forget:
// a failing webhook never blocks the emitting operation. Payloads are what the bus already carries.
const crypto = require("crypto");
const { pool } = require("../db");
const { resolveIsPublic } = require("./ssrfGuard");

async function deliver(w, event, body, attempt = 1) {
  const sig = crypto.createHmac("sha256", w.secret).update(body).digest("hex");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let code = null, ok = false, err = null;
  try {
    // Authoritative SSRF check at delivery time: a public DNS name can resolve to a private IP,
    // so re-validate every resolved address here (not just the literal check at registration).
    let host; try { host = new URL(w.url).hostname; } catch { host = ""; }
    if (!host || !(await resolveIsPublic(host))) { err = "blocked (private/unresolvable host)"; }
    else {
      const r = await fetch(w.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Headroom-Event": event, "X-Headroom-Signature": `sha256=${sig}` },
        body, signal: ctrl.signal,
        redirect: "manual", // never follow a 3xx to an unvetted (possibly private) host
      });
      code = r.status; ok = r.ok; // a 3xx is not ok → treated as a failed delivery, not followed
    }
  } catch (e) { err = e.name === "AbortError" ? "timeout" : e.message; }
  finally { clearTimeout(timer); }
  await pool.query(
    "INSERT INTO api_webhook_deliveries(tenant_id, webhook_id, event, status_code, ok, error, attempt) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [w.tenant_id, w.id, event, code, ok, err ? String(err).slice(0, 300) : null, attempt]
  ).catch(() => {});
  if (!ok && attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); return deliver(w, event, body, attempt + 1); }
  return ok;
}

async function dispatch(tenantId, event, payload = {}) {
  if (!tenantId || !event) return { sent: 0 };
  let subs = [];
  try {
    const { rows } = await pool.query("SELECT id, tenant_id, url, events, secret FROM api_webhooks WHERE tenant_id=$1 AND active=true", [tenantId]);
    subs = rows.filter((w) => (w.events || []).includes("*") || (w.events || []).includes(event));
  } catch (e) { console.warn("[webhooks] lookup failed:", e.message); return { sent: 0 }; }
  if (!subs.length) return { sent: 0 };
  const body = JSON.stringify({ event, tenant_id: tenantId, data: payload, ts: new Date().toISOString() });
  for (const w of subs) deliver(w, event, body).catch(() => {}); // each fire-and-forget
  return { sent: subs.length };
}

module.exports = { dispatch };
