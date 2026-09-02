-- ── Launch hotfix: FORCE RLS vs the app's own role ───────────────────────────
-- The pre-launch audit caught a class error: user_sessions and report_schedules were
-- created with FORCE row-level security, but both are accessed by paths that CANNOT set a
-- tenant GUC:
--   • user_sessions is written during LOGIN and read by the auth middleware — i.e. before
--     any tenant context exists. Under FORCE, the login INSERT itself violates the policy
--     and every sign-in 500s. (Development testing missed this because a local superuser
--     bypasses RLS entirely; production's owner role does not.)
--   • report_schedules is swept by the hourly cron across ALL tenants.
-- Dropping FORCE (keeping ENABLE + the policy) puts them on the same footing as the other
-- auth/public-lookup tables (credit_passports, portal links): the owning app role reads
-- them directly and scopes by column, while any future non-owner role still hits the policy.
ALTER TABLE user_sessions    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE report_schedules NO FORCE ROW LEVEL SECURITY;

-- Concurrent-tab refresh grace: two tabs presenting the same refresh token within a
-- moment of each other is the NORMAL multi-tab case, not theft. The previous hash stays
-- valid for a short grace window; reuse detection still fires for anything older.
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS prev_refresh_hash TEXT;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS rotated_at        TIMESTAMPTZ;
