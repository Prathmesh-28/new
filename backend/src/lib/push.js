// Firebase Cloud Messaging sender - FCM HTTP v1 API.
//
// The legacy `https://fcm.googleapis.com/fcm/send` + "key=SERVER_KEY" transport
// was shut down by Google in mid-2024, so this uses the v1 API, which authenticates
// with a Google service-account OAuth token (scope firebase.messaging) and posts to
//   https://fcm.googleapis.com/v1/projects/<project_id>/messages:send
// v1 routes to APNs for iOS automatically. No-ops (mock) when unconfigured.
//
// Configure with FCM_SERVICE_ACCOUNT = the service-account JSON, either raw or
// base64-encoded (Firebase → Project settings → Service accounts → Generate key).
const jwt = require("jsonwebtoken");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

// Parse FCM_SERVICE_ACCOUNT once. Accepts raw JSON or base64 (safer for env vars,
// since the PEM private_key contains newlines). Returns null when unconfigured.
let _sa; // undefined = not parsed yet, null = absent/invalid
function serviceAccount() {
  if (_sa !== undefined) return _sa;
  const raw = (process.env.FCM_SERVICE_ACCOUNT || "").trim();
  if (!raw) return (_sa = null);
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error("missing fields");
    return (_sa = sa);
  } catch (e) {
    console.error("[push] FCM_SERVICE_ACCOUNT is invalid:", e.message);
    return (_sa = null);
  }
}

function isConfigured() {
  return !!serviceAccount();
}

// Cache the OAuth access token until ~1 min before it expires.
let _token = null; // { value, exp }
async function getAccessToken(sa) {
  if (_token && _token.exp - 60_000 > Date.now()) return _token.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { scope: SCOPE },
    sa.private_key,
    { algorithm: "RS256", issuer: sa.client_email, audience: TOKEN_URL, expiresIn: 3600, header: { alg: "RS256", typ: "JWT" }, keyid: sa.private_key_id }
  );
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j.access_token) throw new Error(`token exchange failed: ${resp.status} ${j.error_description || j.error || ""}`);
  _token = { value: j.access_token, exp: now * 1000 + (j.expires_in || 3600) * 1000 };
  return _token.value;
}

// FCM v1 data values must all be strings.
function stringifyData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[k] = typeof v === "string" ? v : JSON.stringify(v);
  return out;
}

// sendPush(tokens, { title, body, data }) → { sent, failure, mock }.
// Same signature as before so callers (routes/push.js, whatsapp.js) are unchanged.
async function sendPush(tokens, { title, body, data } = {}) {
  const sa = serviceAccount();
  const list = (tokens || []).filter(Boolean);
  if (!sa || !list.length) return { sent: 0, mock: true };

  let accessToken;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    console.error("[push] auth failed:", e.message);
    return { sent: 0, error: e.message };
  }

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const dataStr = stringifyData(data);
  let sent = 0, failure = 0;
  const stale = []; // tokens FCM reports as unregistered, for the caller to prune

  // v1 sends one message per token. Fan out with bounded concurrency.
  await Promise.all(list.map(async (token) => {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: dataStr,
            android: { priority: "high", notification: { sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      if (resp.ok) { sent++; return; }
      failure++;
      const j = await resp.json().catch(() => ({}));
      const status = j?.error?.details?.find?.(d => d.errorCode)?.errorCode || j?.error?.status;
      if (status === "UNREGISTERED" || status === "INVALID_ARGUMENT" || resp.status === 404) stale.push(token);
    } catch (e) {
      failure++;
      console.error("[push] send failed:", e.message);
    }
  }));

  return { sent, failure, mock: false, stale };
}

module.exports = { sendPush, isConfigured };
