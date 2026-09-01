-- ── Wave 7: getting help, and knowing what changed ───────────────────────────
-- The audit found: no help centre, no way to contact support from inside the product, no
-- feedback path, and no changelog anywhere (zero implementations). When something broke,
-- the user got a generic error screen with nothing to quote to anyone.

-- A ticket the user raises from wherever they hit the problem, with the page and the
-- error reference already attached — so support isn't asking "what were you doing?".
CREATE TABLE IF NOT EXISTS support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'question',   -- question | bug | idea
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  page_url   TEXT,
  error_ref  TEXT,
  status     TEXT NOT NULL DEFAULT 'open',       -- open | answered | closed
  reply      TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets ON support_tickets(tenant_id, created_at DESC);

-- Platform-wide release notes. Deliberately NOT tenant-scoped and NOT RLS: one list, the
-- same for everyone, written by the platform owner.
CREATE TABLE IF NOT EXISTS changelog_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'improvement', -- feature | improvement | fix
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID
);
CREATE INDEX IF NOT EXISTS idx_changelog_published ON changelog_entries(published_at DESC);

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON support_tickets';
  EXECUTE $p$CREATE POLICY tenant_isolation ON support_tickets
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
