"use strict";
// TOTP (RFC 6238) for opt-in MFA — pure Node crypto, no dependencies. Secrets are
// stored AES-256-GCM encrypted at rest (key derived from JWT_SECRET, same posture as
// the tenant LLM keys). Authenticator apps (Google Authenticator, Authy, 1Password)
// consume the otpauth:// URL.
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0, val = 0, out = "";
  for (const byte of buf) {
    val = (val << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0; const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c); if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function genSecret(bytes = 20) { return base32Encode(crypto.randomBytes(bytes)); }

// HOTP (RFC 4226) — the building block of TOTP.
function hotp(key, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}
function totp(secretB32, { t = Date.now(), step = 30, digits = 6 } = {}) {
  return hotp(base32Decode(secretB32), Math.floor(t / 1000 / step), digits);
}
// Accept the current step ±`window` (clock drift / submit lag). Constant-time compare.
function verifyTotp(secretB32, token, { t = Date.now(), step = 30, digits = 6, window = 1 } = {}) {
  const tok = String(token || "").trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(tok)) return false;
  const key = base32Decode(secretB32), counter = Math.floor(t / 1000 / step);
  const a = Buffer.from(tok);
  for (let w = -window; w <= window; w++) {
    const cand = Buffer.from(hotp(key, counter + w, digits));
    if (cand.length === a.length && crypto.timingSafeEqual(cand, a)) return true;
  }
  return false;
}

// Like verifyTotp but returns the MATCHED step counter (or -1), and refuses any
// counter <= `after` — so a code already used (its counter recorded) can't be replayed.
function verifyTotpCounter(secretB32, token, { t = Date.now(), step = 30, digits = 6, window = 1, after = 0 } = {}) {
  const tok = String(token || "").trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(tok)) return -1;
  const key = base32Decode(secretB32), counter = Math.floor(t / 1000 / step), a = Buffer.from(tok);
  for (let w = -window; w <= window; w++) {
    const c = counter + w;
    if (c <= after) continue; // anti-replay
    const cand = Buffer.from(hotp(key, c, digits));
    if (cand.length === a.length && crypto.timingSafeEqual(cand, a)) return c;
  }
  return -1;
}

function otpauthURL(secretB32, label, issuer = "Headroom") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Backup (recovery) codes — high-entropy, so a single SHA-256 hash is sufficient.
function genBackupCodes(n = 10) {
  return Array.from({ length: n }, () => crypto.randomBytes(8).toString("hex")); // 16 hex chars = 64 bits each
}
const hashBackup = (code) => crypto.createHash("sha256").update(String(code).trim().toLowerCase()).digest("hex");

// ── Secret-at-rest encryption (AES-256-GCM; key = scrypt(JWT_SECRET)).
function aesKey() { return crypto.scryptSync(process.env.JWT_SECRET || "dev-secret", "headroom-mfa", 32); }
function encSecret(plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function decSecret(blob) {
  const b = Buffer.from(String(blob), "base64");
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), enc = b.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", aesKey(), iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

module.exports = { genSecret, hotp, totp, verifyTotp, verifyTotpCounter, otpauthURL, genBackupCodes, hashBackup, encSecret, decSecret, base32Encode, base32Decode };
