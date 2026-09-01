-- ── Wave 5: sessions you can actually see and end ────────────────────────────
-- Refresh tokens were stateless 7-day JWTs. That means:
--   • the product could not show "where am I signed in?" — there was nothing to list;
--   • "log out of all devices" was impossible, so a stolen token stayed valid for a week
--     even after the user changed their password;
--   • a token that had already been used to refresh could be replayed indefinitely.
-- A session row per sign-in fixes all three, and lets a rotated-token replay be DETECTED
-- (the classic refresh-token-reuse signal) and kill the whole session rather than being
-- silently honoured.
CREATE TABLE IF NOT EXISTS user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL,
  -- SHA-256 of the refresh token currently valid for this session. Never the token itself:
  -- a leaked database dump must not hand out working sessions.
  refresh_hash  TEXT,
  ip            TEXT,
  user_agent    TEXT,
  device_label  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  revoked_at    TIMESTAMPTZ,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, revoked_at, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at) WHERE revoked_at IS NULL;

-- Login history is recorded but was never shown to the person it is about, and a sign-in
-- from a new device produced no notification at all. These let both happen.
ALTER TABLE login_events ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE login_events ADD COLUMN IF NOT EXISTS new_device BOOLEAN NOT NULL DEFAULT false;

-- ── Don't-contact list ───────────────────────────────────────────────────────
-- Automated reminders had no suppression list: a customer who asked to be left alone, or
-- one in a payment dispute, kept receiving chasers. Every send path checks this.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS do_not_contact        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT;

-- ── Quiet hours ──────────────────────────────────────────────────────────────
-- Reminders fired whenever a cron happened to run. A firm can now say when its customers
-- may be messaged; the sender honours it rather than every job re-inventing a rule.
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT;  -- 0-23, local (Asia/Kolkata)
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS quiet_hours_end   SMALLINT;

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON user_sessions';
  EXECUTE $p$CREATE POLICY tenant_isolation ON user_sessions
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
