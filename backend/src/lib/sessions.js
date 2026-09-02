"use strict";
// ── Sign-in sessions ─────────────────────────────────────────────────────────
// Refresh tokens used to be stateless 7-day JWTs: nothing to list, nothing to revoke, and
// an already-rotated token could be replayed for the rest of the week. Each sign-in now
// gets a session row, and the refresh token carries its id (`sid`).
//
// Rotation with reuse detection is the important part. On every refresh the stored hash is
// replaced. If a token arrives whose hash is NOT the current one, it is a replay of a token
// that was already exchanged — the textbook signal that a token was stolen — so the whole
// session is revoked rather than the request being quietly honoured.
const crypto = require("crypto");
const { pool } = require("../db");

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/** "Chrome on macOS" from a user-agent string — a label a human can recognise. */
function deviceLabel(ua = "") {
  const s = String(ua);
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\//.test(s) ? "Opera" :
    /Chrome\//.test(s) ? "Chrome" :
    /Safari\//.test(s) && !/Chrome/.test(s) ? "Safari" :
    /Firefox\//.test(s) ? "Firefox" :
    /okhttp|Dalvik/i.test(s) ? "Android app" :
    /CFNetwork|Darwin/i.test(s) ? "iOS app" : "Browser";
  const os =
    /iPhone|iPad|iOS/i.test(s) ? "iPhone/iPad" :
    /Android/i.test(s) ? "Android" :
    /Mac OS X|Macintosh/i.test(s) ? "macOS" :
    /Windows/i.test(s) ? "Windows" :
    /Linux/i.test(s) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

async function createSession({ userId, tenantId, ip, userAgent, refreshToken }) {
  const { rows } = await pool.query(
    `INSERT INTO user_sessions(user_id, tenant_id, refresh_hash, ip, user_agent, device_label)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [userId, tenantId, hash(refreshToken), ip || null, String(userAgent || "").slice(0, 300), deviceLabel(userAgent)]
  );
  return rows[0];
}

/**
 * Validate a presented refresh token against its session and rotate it.
 * @returns {{ok:true, session}} | {{ok:false, reason:"revoked"|"expired"|"reuse"|"missing"}}
 */
async function rotate({ sessionId, presentedToken, newToken, ip }) {
  const { rows } = await pool.query("SELECT * FROM user_sessions WHERE id=$1", [sessionId]);
  const s = rows[0];
  if (!s) return { ok: false, reason: "missing" };
  if (s.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(s.expires_at) < new Date()) return { ok: false, reason: "expired" };

  const presented = hash(presentedToken);
  if (s.refresh_hash && s.refresh_hash !== presented) {
    // Two tabs refreshing within a moment of each other both present the token that was
    // just exchanged — that is the NORMAL multi-tab case, not theft. The immediately-
    // previous hash stays acceptable for a 60s grace window; both tabs end up holding a
    // valid token and re-rotate on their next refresh.
    const graceOk = s.prev_refresh_hash === presented
      && s.rotated_at && (Date.now() - new Date(s.rotated_at).getTime()) < 60_000;
    if (!graceOk) {
      // Anything older is a genuine replay of an exchanged token — the classic stolen-
      // token signal. End the session; the legitimate holder signs in again, the thief
      // loses access.
      await revoke(sessionId, "refresh token reuse detected");
      return { ok: false, reason: "reuse" };
    }
  }

  await pool.query(
    `UPDATE user_sessions SET prev_refresh_hash = refresh_hash, refresh_hash=$2, rotated_at=now(),
            last_seen_at=now(), ip=COALESCE($3, ip) WHERE id=$1`,
    [sessionId, hash(newToken), ip || null]
  );
  return { ok: true, session: s };
}

const revoke = (sessionId, reason = "signed out") =>
  pool.query("UPDATE user_sessions SET revoked_at=now(), revoked_reason=$2 WHERE id=$1 AND revoked_at IS NULL", [sessionId, reason]);

/** End every session for a user, optionally sparing the one they're using right now. */
async function revokeAll(userId, { exceptSessionId = null, reason = "signed out everywhere" } = {}) {
  const { rowCount } = await pool.query(
    `UPDATE user_sessions SET revoked_at=now(), revoked_reason=$3
      WHERE user_id=$1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, exceptSessionId, reason]
  );
  return rowCount;
}

const list = (userId) => pool.query(
  `SELECT id, ip, user_agent, device_label, created_at, last_seen_at, expires_at, revoked_at
     FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()
    ORDER BY last_seen_at DESC`, [userId]).then((r) => r.rows);

/**
 * Has this user signed in from this device before? Used to decide whether to send a
 * "new sign-in" email. Matched on the device label rather than the exact user-agent, so a
 * browser version bump isn't reported as a new device every time.
 */
async function isNewDevice(userId, userAgent) {
  const label = deviceLabel(userAgent);
  const { rows } = await pool.query(
    "SELECT 1 FROM user_sessions WHERE user_id=$1 AND device_label=$2 LIMIT 1", [userId, label]);
  return { isNew: rows.length === 0, label };
}

/** Housekeeping: drop sessions that expired or were revoked long ago. */
const purgeExpired = () => pool.query(
  "DELETE FROM user_sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'"
).then((r) => r.rowCount);

module.exports = { createSession, rotate, revoke, revokeAll, list, isNewDevice, deviceLabel, purgeExpired, hash };
