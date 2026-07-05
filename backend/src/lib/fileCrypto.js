"use strict";
// App-level envelope encryption for uploaded file bytes at rest (D3, 2026-07 gap audit —
// files.data was plaintext BYTEA). Same AES-256-GCM scheme + packed iv|tag|ciphertext
// layout as lib/totp.js's secret-at-rest encryption, keyed off JWT_SECRET (already-required
// infra — no new external credential/KMS needed to close the gap), with a distinct scrypt
// salt so the derived key never collides with the MFA one.
const crypto = require("crypto");

function fileKey() {
  return crypto.scryptSync(process.env.JWT_SECRET || "dev-secret", "headroom-files", 32);
}

function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", fileKey(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

function decryptBuffer(packed) {
  const iv = packed.subarray(0, 12), tag = packed.subarray(12, 28), enc = packed.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", fileKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}

module.exports = { encryptBuffer, decryptBuffer };
