-- ── Wave 12: reports that come to you ────────────────────────────────────────
-- Reports existed all over the product but none could be scheduled: the owner had to
-- remember to open the app to learn yesterday's number. One row per (user, report,
-- cadence); the hourly cron sends the ones that are due in the firm's local morning.
CREATE TABLE IF NOT EXISTS report_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_key   TEXT NOT NULL,                 -- business_summary | receivables | cashflow
  cadence      TEXT NOT NULL DEFAULT 'daily', -- daily | weekly (Monday)
  send_hour    SMALLINT NOT NULL DEFAULT 8,   -- Asia/Kolkata local hour
  last_sent_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_report_schedule ON report_schedules(tenant_id, user_id, report_key);
DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE report_schedules FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON report_schedules';
  EXECUTE $p$CREATE POLICY tenant_isolation ON report_schedules
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
