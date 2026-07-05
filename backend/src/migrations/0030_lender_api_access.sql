-- Access log for the B2B lender API (KreditBee-grade plan #3). Every score pull by an
-- external lender is recorded: which lender key, which tenant, when, from where, and
-- whether it was served or refused (bad key / no consent). This is both the audit trail
-- RBI-adjacent diligence asks for and the usage record a commercial lender-API needs.
CREATE TABLE IF NOT EXISTS lender_api_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lender_name TEXT,
  tenant_id   TEXT NOT NULL,
  outcome     TEXT NOT NULL,              -- served | bad_key | no_consent | not_found
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lender_api_access ON lender_api_access(tenant_id, created_at DESC);
