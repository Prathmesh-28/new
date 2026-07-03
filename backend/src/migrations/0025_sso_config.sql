-- SSO (#188): per-tenant OIDC single sign-on. OPT-IN and OFF by default — the existing password
-- login is untouched. Not RLS'd: /sso/start resolves a tenant by the user's email domain BEFORE
-- any session exists (config is keyed by tenant, looked up via allowed_domains); owner management
-- is tenant-scoped in the route. client_secret is encrypted at rest (lib/fieldcrypto).
CREATE TABLE IF NOT EXISTS sso_config (
  tenant_id       TEXT PRIMARY KEY,
  issuer          TEXT,                                   -- OIDC issuer (…/.well-known/openid-configuration)
  client_id       TEXT,
  client_secret   TEXT,                                   -- encrypted
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',           -- email domains this tenant owns
  default_role    TEXT NOT NULL DEFAULT 'finance_manager',-- role for JIT-provisioned users
  jit_provision   BOOLEAN NOT NULL DEFAULT true,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sso_config_domains ON sso_config USING GIN (allowed_domains) WHERE enabled = true;
