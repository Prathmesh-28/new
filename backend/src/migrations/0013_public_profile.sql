-- Public company profile / digital business card (roadmap #166). Opt-in public page addressed
-- by a slug; only the fields the owner chooses to expose are served unauthenticated.
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS public_slug    TEXT;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS public_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS public_about   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_public_slug ON tenant_profile(public_slug) WHERE public_slug IS NOT NULL;
