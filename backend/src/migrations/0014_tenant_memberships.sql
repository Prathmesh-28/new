-- 0014 · Multi-firm membership (#197 firm switcher).
-- Introduces tenant_memberships: the set of firms a user may act in, and their role
-- in each. users.tenant_id stays the HOME/default firm; this table is the switch
-- allow-list, re-authorized in authenticate on every request. Backfill is one-to-one
-- with today's single-firm model, so existing behavior is unchanged (each user gets
-- exactly one membership = their current home firm+role). Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer',
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user   ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);

-- Backfill: one active membership per existing user from their current home tenant+role.
INSERT INTO tenant_memberships (user_id, tenant_id, role, status)
SELECT id, tenant_id, role, 'active' FROM users
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- OPT-IN (default OFF): also grant accountants/advisors a switch path into their linked
-- client firms. This would change them from read-only-via-kv to header-switchable, so it
-- is deliberately left commented out — enable only with an explicit product/security
-- decision, and keep the granted role low-write (writes stay gated by role checks).
-- INSERT INTO tenant_memberships (user_id, tenant_id, role, status)
-- SELECT advisor_id, client_tenant_id, 'accountant', 'active' FROM advisor_client_links
-- ON CONFLICT (user_id, tenant_id) DO NOTHING;
