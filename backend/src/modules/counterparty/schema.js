"use strict";
// Counterparty intelligence — the single surface for knowing who you trade with. It re-exposes
// the EXISTING local signals (PAN-dedup entity groups + payment-behaviour customer scores, both
// computed from the tenant's own ledger) and adds a GATED external-enrichment layer (GSTN filing
// status, MCA corporate extract, GSP GSTIN validation, Udyam MSME lookup). External calls need
// real credentials; without them a lookup is recorded as 'gated' — we NEVER fabricate registry
// data. Results are cached (TTL) so repeat views don't re-hit the provider. Plus anchor-led
// invites (invite your dealers/vendors onto the platform — the network-effect loop).
const COUNTERPARTY_SCHEMA = `
CREATE TABLE IF NOT EXISTS counterparty_enrichments (
  id           UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('gstn','mca','gsp','udyam','ecourts')),
  identifier   TEXT NOT NULL,                         -- GSTIN / CIN / PAN / Udyam no.
  status       TEXT NOT NULL DEFAULT 'gated' CHECK (status IN ('ok','gated','error')),
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,    -- provider payload (empty when gated)
  message      TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_days     INT NOT NULL DEFAULT 30
);
CREATE INDEX IF NOT EXISTS idx_counterparty_enrichments ON counterparty_enrichments(tenant_id, kind, identifier, fetched_at DESC);

-- Anchor-led onboarding: the buyer (anchor) invites a dealer/supplier; they join and link back.
CREATE TABLE IF NOT EXISTS counterparty_invites (
  id           UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id    TEXT NOT NULL,
  name         TEXT,
  email        TEXT,
  phone        TEXT,
  relation     TEXT DEFAULT 'vendor',                 -- vendor | customer | dealer | distributor
  token        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined')),
  channels     TEXT[],                                -- which channels the invite was sent on
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_counterparty_invites ON counterparty_invites(tenant_id, status, created_at DESC);

-- Post-transaction ratings a tenant records about a counterparty (quality/delivery/payment).
-- Feeds the counterparty's overall reliability picture; RLS'd (migration 0020).
CREATE TABLE IF NOT EXISTS counterparty_ratings (
  id             UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id      TEXT NOT NULL,
  counterparty   TEXT NOT NULL,                          -- name or GSTIN of the rated party
  gstin          TEXT,
  category       TEXT NOT NULL DEFAULT 'overall' CHECK (category IN ('overall','quality','delivery','payment','service')),
  rating         INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  txn_ref        TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_counterparty_ratings ON counterparty_ratings(tenant_id, counterparty, created_at DESC);
`;

module.exports = { COUNTERPARTY_SCHEMA };
