-- ── Wave 1: platform foundation ───────────────────────────────────────────────
-- The 200-gap audit found that the product has deep business modules but no shared
-- plumbing underneath them: no per-user preferences, no saved list views, no trash,
-- no per-record comments/followers, no idempotency on money-moving POSTs, and no
-- "recently viewed". Every page hand-rolled its own table and its own delete. This
-- migration adds the storage those cross-cutting features need, once, for ALL
-- entities — keyed by (entity, entity_id) so a new module gets them for free.
--
-- Every table here is tenant-scoped and FORCE-RLS, matching 0015/0026: the ONLY
-- sanctioned access path is q()/withTenant() (lib/tenantDb.js).

-- ── Per-user preferences ──────────────────────────────────────────────────────
-- One row per (tenant, user, key). Holds theme, table density, column visibility,
-- notification preferences, dismissed hints. JSONB so a new preference never needs
-- a migration. Scoped by tenant too, so the same person switching firms (#197) can
-- keep different column layouts per firm.
CREATE TABLE IF NOT EXISTS user_prefs (
  tenant_id  TEXT NOT NULL,
  user_id    UUID NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, key)
);

-- ── Saved list views ──────────────────────────────────────────────────────────
-- A named, reusable filter+sort+column set for one list ("My overdue > 1L").
-- shared=true makes it visible to the whole firm; the owner can still edit only
-- their own. is_default auto-applies on first open of that list.
CREATE TABLE IF NOT EXISTS saved_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  user_id    UUID NOT NULL,
  list_key   TEXT NOT NULL,
  name       TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  shared     BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_views_lookup ON saved_views(tenant_id, list_key, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_views_name ON saved_views(tenant_id, user_id, list_key, lower(name));

-- ── Comments on any record ────────────────────────────────────────────────────
-- `notes` already stores free text keyed by (entity, entity_id) but had no author
-- display, no editing, no @mentions and NO UI anywhere. Rather than introduce a second
-- comments concept, the existing table is extended in place — every note already
-- written stays a comment.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS mentions   UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_notes_entity ON notes(tenant_id, entity, entity_id, created_at);

-- ── Audit trail: tenant scope ─────────────────────────────────────────────────
-- audit_log had no tenant_id, so "show me this record's history" could only be answered
-- by matching entity_id across ALL tenants. Adding the column (backfilled from the actor)
-- makes the per-record activity timeline safe to expose in the UI.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE audit_log a SET tenant_id = u.tenant_id FROM users u WHERE u.id = a.user_id AND a.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(tenant_id, entity, entity_id, created_at DESC);

-- ── Notifications: per-user targeting, deep links, snooze ─────────────────────
-- `alerts` was firm-wide only: every alert went to everyone, nothing could be addressed
-- to one person, nothing linked back to the record it was about, and there was no way to
-- say "not now". user_id NULL keeps the existing firm-wide behaviour, so every alert
-- already raised is unchanged.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS entity        TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS entity_id     TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS link          TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_alerts_inbox ON alerts(tenant_id, user_id, is_read, created_at DESC);

-- ── Followers ("watch this record") ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS record_follows (
  tenant_id  TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity, entity_id, user_id)
);

-- ── Recently viewed ───────────────────────────────────────────────────────────
-- Server-side (not localStorage) so it follows the user across devices. One row per
-- (user, entity, entity_id); re-opening a record bumps viewed_at instead of inserting.
CREATE TABLE IF NOT EXISTS recently_viewed (
  tenant_id TEXT NOT NULL,
  user_id   UUID NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label     TEXT NOT NULL DEFAULT '',
  href      TEXT NOT NULL DEFAULT '',
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, entity, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed(tenant_id, user_id, viewed_at DESC);

-- ── Trash ─────────────────────────────────────────────────────────────────────
-- Deliberately an ARCHIVE table rather than a `deleted_at` column on every entity.
-- A soft-delete column would have required auditing and amending ~36 existing
-- `FROM invoices` queries (and 11 on transactions); any one missed would silently
-- leak deleted rows back into revenue/AR aggregates — a correctness hazard far worse
-- than the missing feature. Snapshotting the row (plus its child rows) as JSONB and
-- issuing the real DELETE keeps every existing read query correct by construction,
-- and restore re-inserts the exact row, id included.
CREATE TABLE IF NOT EXISTS deleted_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  snapshot    JSONB NOT NULL,
  children    JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_by  UUID,
  deleted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX IF NOT EXISTS idx_deleted_records_tenant ON deleted_records(tenant_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_records_purge ON deleted_records(purge_after) WHERE restored_at IS NULL;

-- ── Idempotency ───────────────────────────────────────────────────────────────
-- A retried/double-clicked POST that moves money must not move it twice. The client
-- sends Idempotency-Key; the first request stores its response, replays win it back.
-- in_flight distinguishes "still running" (409, tell the client to wait) from "done".
CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id    TEXT NOT NULL,
  key          TEXT NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code  INTEGER,
  response     JSONB,
  in_flight    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);

DO $rls$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_prefs','saved_views','record_follows',
                           'recently_viewed','deleted_records','idempotency_keys'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
