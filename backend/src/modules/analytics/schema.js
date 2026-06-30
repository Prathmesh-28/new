"use strict";
// Product analytics — first-party event stream + tenant onboarding profile, all in
// our own Postgres (no third-party, keeps data in-region for DPDP). Events are
// consent-gated in index.js (skipped when the user opted out of the 'analytics'
// purpose). Tenant-scoped throughout; collab_uuidv7() PKs.
const ANALYTICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id   TEXT NOT NULL,
  user_id     UUID,
  event       TEXT NOT NULL,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  session_id  TEXT,
  path        TEXT,
  ua          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aev_tenant_time ON analytics_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aev_event_time  ON analytics_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aev_user_time   ON analytics_events(user_id, created_at DESC);

-- One structured profile per tenant (the onboarding answers) — queryable for
-- segmentation (vs. burying it in the KV JSON blob).
CREATE TABLE IF NOT EXISTS tenant_profile (
  tenant_id          TEXT PRIMARY KEY,
  industry           TEXT,
  business_type      TEXT,
  gst_registered     BOOLEAN,
  gstin              TEXT,
  turnover_band      TEXT,
  team_size          TEXT,
  city               TEXT,
  state              TEXT,
  primary_goal       TEXT,
  acquisition_source TEXT,
  onboarded_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

module.exports = { ANALYTICS_SCHEMA };
