const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const FROM       = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886"; // Twilio sandbox default

let _client = null;

function getClient() {
  if (!_client && accountSid && authToken) {
    _client = twilio(accountSid, authToken);
  }
  return _client;
}

// Normalise any phone string to E.164 (+91XXXXXXXXXX) and strip whatsapp: prefix
function normalizePhone(raw = "") {
  return raw.replace(/^whatsapp:/i, "").replace(/\s/g, "");
}

async function sendWhatsApp(to, body) {
  const c = getClient();
  const toWa = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  if (!c) {
    console.log(`[whatsapp] MOCK → ${toWa}: ${body.slice(0, 80)}`);
    return false; // not actually delivered (Twilio not configured)
  }
  await c.messages.create({ from: FROM, to: toWa, body });
  return true;
}

// Returns true when signature is valid. Skips check in dev mode (no auth token).
// Behind a proxy (Render/Vercel) the original scheme/host arrive in x-forwarded-*
// headers — Twilio signed the PUBLIC https URL, so we must rebuild that exact URL
// (TWILIO_PUBLIC_URL overrides if set) or validation wrongly 403s every webhook.
function validateSignature(req) {
  if (!authToken) return true;
  const sig   = req.headers["x-twilio-signature"] || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"] || req.get("host");
  const base  = (process.env.TWILIO_PUBLIC_URL || `${proto}://${host}`).replace(/\/$/, "");
  const url   = `${base}${req.originalUrl}`;
  return twilio.validateRequest(authToken, sig, url, req.body);
}

module.exports = { sendWhatsApp, validateSignature, normalizePhone };
