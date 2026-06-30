-- 0001: speed up the win-back lift / reactivation queries, which scan analytics_events
-- for the decision rows (event IN winback_nudge/holdout) per tenant over time.
-- Idempotent + concurrent-safe shape; safe to run on a live DB.
CREATE INDEX IF NOT EXISTS idx_analytics_events_winback
  ON analytics_events (tenant_id, created_at)
  WHERE event IN ('winback_nudge', 'winback_holdout');
