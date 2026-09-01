-- ── Wave 16: the vendor portal ───────────────────────────────────────────────
-- The mirror of the customer portal (0038): a supplier could not see which of their bills
-- were booked, what had been paid, or when the rest was coming — so they called, and
-- someone re-typed the AP ledger into WhatsApp. Same design decisions as 0038, same
-- reasons: token stored hashed, one live link per vendor, NOT under FORCE RLS because the
-- public lookup has no tenant context (the token IS the authorisation; every
-- authenticated query scopes by tenant explicitly).
CREATE TABLE IF NOT EXISTS vendor_portal_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT NOT NULL,
  vendor_id      UUID NOT NULL REFERENCES vendor_master(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  token_hint     TEXT NOT NULL,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  view_count     INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_portal_links ON vendor_portal_links(tenant_id, vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_portal_active
  ON vendor_portal_links(tenant_id, vendor_id) WHERE revoked_at IS NULL;
