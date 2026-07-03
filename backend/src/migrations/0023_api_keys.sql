-- Public API (#185): per-tenant API keys. Only the SHA-256 hash is stored; the plaintext key is
-- shown once at creation. Not RLS'd — the key-auth path looks a key up by hash BEFORE any tenant
-- context exists (the hash is the capability, like the crowdfunding/passport public tokens); all
-- owner-facing management queries are tenant-scoped in the route.
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  name         TEXT,
  prefix       TEXT NOT NULL,                    -- shown to the user, e.g. hk_live_ab12cd
  key_hash     TEXT NOT NULL UNIQUE,             -- sha256(full key)
  scopes       TEXT[] NOT NULL DEFAULT ARRAY['read'],
  last_used_at TIMESTAMPTZ,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
