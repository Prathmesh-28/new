-- ── Wave 18: the security tail ───────────────────────────────────────────────
-- Step-up auth: a session proves it recently re-entered the password before the handful
-- of actions with no undo (permanent purge, sign-out-everywhere). 10-minute window.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS elevated_until TIMESTAMPTZ;

-- Trusted devices for 2FA: after a successful code, a device can be remembered for 30
-- days. The trust is a signed token bound to the user; revoking sessions does not revoke
-- trust (it only skips the OTP prompt — the password is still required every time).
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_trust_version INTEGER NOT NULL DEFAULT 1;

-- Owner-set IP allowlist. mode='monitor' (default) only records violations — turning
-- enforcement on is an explicit second step, because a fat-fingered CIDR in enforce mode
-- locks the whole firm out.
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS ip_allowlist      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS ip_allowlist_mode TEXT NOT NULL DEFAULT 'monitor';

-- Profile photo: an avatar file in the existing encrypted vault.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_file_id UUID;
