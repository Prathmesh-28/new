-- Credit Passport (#90): a shareable, verified creditworthiness profile an SMB can hand to a
-- lender. Powered by the existing underwriting score() engine. Token-gated public read (the
-- unguessable token IS the capability, like the crowdfunding public backer page) — NOT RLS'd;
-- owner writes are tenant-scoped in the route. One passport per tenant (upsert), owner-revocable.
CREATE TABLE IF NOT EXISTS credit_passports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL,
  token              TEXT NOT NULL UNIQUE,
  include_score      BOOLEAN NOT NULL DEFAULT true,
  include_financials BOOLEAN NOT NULL DEFAULT true,
  headline           TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at         DATE,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_passports_tenant ON credit_passports(tenant_id);
