// Firebase Cloud Messaging (legacy HTTP) sender — graceful when unconfigured.
// Set FCM_SERVER_KEY (Firebase → Project settings → Cloud Messaging → Server key).
// Routes to APNs for iOS automatically through FCM. No-ops (mock) without a key.
async function sendPush(tokens, { title, body, data } = {}) {
  const key = (process.env.FCM_SERVER_KEY || "").trim();
  const list = (tokens || []).filter(Boolean);
  if (!key || !list.length) return { sent: 0, mock: true };
  try {
    const resp = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `key=${key}` },
      body: JSON.stringify({
        registration_ids: list,
        notification: { title, body, sound: "default" },
        data: data || {},
        priority: "high",
      }),
    });
    const j = await resp.json().catch(() => ({}));
    return { sent: j.success || 0, failure: j.failure || 0, mock: false };
  } catch (e) {
    console.error("[push] send failed:", e.message);
    return { sent: 0, error: e.message };
  }
}

module.exports = { sendPush };
