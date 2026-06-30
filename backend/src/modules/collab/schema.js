// Headroom Collab - Phase 0 data model (Teams-style real-time collaboration).
//
// Adapted to Headroom reality vs. the build spec:
//  • The spec's `org_id UUID REFERENCES organizations(id)` becomes `tenant_id TEXT`
//    - Headroom's tenancy unit is the TEXT tenant id (e.g. "acme-3f2a"), there is
//    no `organizations` table. user refs stay UUID (users.id).
//  • All tables are prefixed `collab_` to match Headroom's module convention
//    (book_*, crm_*…) and avoid any name collision. The wire/REST contract keeps
//    the clean names (teams, conversations, messages) - see ./contract.js.
//  • Spec enums (conversation_type, member_role, …) are modelled as TEXT + CHECK,
//    matching the rest of the Headroom schema and keeping the whole file
//    re-runnable with plain IF NOT EXISTS on every boot.
//  • IDs are time-sortable UUIDv7 via collab_uuidv7() (PG16 has no native one),
//    so `ORDER BY id` gives chronological order and keyset pagination needs no
//    separate sequence. The function encodes sub-millisecond precision into the
//    rand_a field (RFC 9562 method 3) so rapid same-millisecond inserts stay
//    strictly ordered (validated: 0 inversions in 5000 rapid calls).
//
// Row-Level Security (defense-in-depth, spec §2/§8): every table has RLS ENABLED
// and FORCED, isolated on the `app.current_tenant` session GUC. All reads/writes
// MUST go through tenantContext.withTenant() (which sets that GUC inside a
// transaction) - the authoritative conversation-membership check still lives in
// the app layer; RLS is the backstop that stops a query bug leaking across
// tenants. FORCE means even the table owner is subject to the policy, so the
// backstop is real and not silently bypassed.
//
// Applied by db.js initDb() after the core schema.

const COLLAB_SCHEMA = `
  -- ── Time-sortable UUIDv7 (RFC 9562) ────────────────────────────────────────
  -- 48-bit ms timestamp prefix + 12-bit sub-ms fraction in rand_a + v7/variant
  -- bits. Used as the PK default for ordered tables so keyset pagination works.
  CREATE OR REPLACE FUNCTION collab_uuidv7() RETURNS uuid AS $$
  DECLARE
    ts     timestamptz := clock_timestamp();
    epoch  numeric      := extract(epoch FROM ts);
    ms     bigint       := floor(epoch * 1000)::bigint;
    sub_ms int          := floor((epoch * 1000 - ms) * 4096)::int;  -- 12-bit sub-ms → rand_a
    b      bytea        := uuid_send(gen_random_uuid());
  BEGIN
    b := overlay(b PLACING substring(int8send(ms) FROM 3) FROM 1 FOR 6);  -- bytes 0-5: 48-bit ms
    b := set_byte(b, 6, 112 | ((sub_ms >> 8) & 15));                      -- byte 6: version 7 | hi sub-ms
    b := set_byte(b, 7, sub_ms & 255);                                    -- byte 7: lo 8 bits sub-ms
    b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);                     -- byte 8: variant 10xx
    RETURN encode(b, 'hex')::uuid;
  END;
  $$ LANGUAGE plpgsql VOLATILE;

  -- ── Teams ──────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS collab_teams (
    id           UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    tenant_id    TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT,
    icon_key     TEXT,
    visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
    created_by   UUID NOT NULL REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at  TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS collab_teams_tenant ON collab_teams(tenant_id);

  CREATE TABLE IF NOT EXISTS collab_team_members (
    team_id    UUID NOT NULL REFERENCES collab_teams(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id),
    tenant_id  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','guest')),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS collab_team_members_user ON collab_team_members(user_id);

  -- ── Conversations (channels / group DMs / 1:1 DMs) ───────────────────────────
  CREATE TABLE IF NOT EXISTS collab_conversations (
    id               UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    tenant_id        TEXT NOT NULL,
    type             TEXT NOT NULL CHECK (type IN ('channel','group','dm')),
    team_id          UUID REFERENCES collab_teams(id) ON DELETE CASCADE,
    name             TEXT,
    topic            TEXT,
    visibility       TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
    created_by       UUID NOT NULL REFERENCES users(id),
    last_message_id  UUID,                       -- denormalized for sidebar sort (no FK: circular)
    last_message_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at      TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS collab_conversations_tenant ON collab_conversations(tenant_id, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS collab_conversations_team   ON collab_conversations(team_id);

  CREATE TABLE IF NOT EXISTS collab_conversation_members (
    conversation_id       UUID NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES users(id),
    tenant_id             TEXT NOT NULL,
    role                  TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','guest')),
    last_read_message_id  UUID,                  -- drives unread counts (pointer vs latest)
    last_read_at          TIMESTAMPTZ,
    notify_pref           TEXT NOT NULL DEFAULT 'all' CHECK (notify_pref IN ('all','mentions','none')),
    muted_until           TIMESTAMPTZ,
    joined_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS collab_conversation_members_user ON collab_conversation_members(user_id);

  -- ── Messages ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS collab_messages (
    id                   UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    conversation_id      UUID NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
    tenant_id            TEXT NOT NULL,
    sender_id            UUID NOT NULL REFERENCES users(id),
    parent_message_id    UUID REFERENCES collab_messages(id),    -- NULL = top-level; set = thread reply
    body                 TEXT,                                   -- plain-text fallback + search source
    rich_content         JSONB,                                  -- sanitized structured blocks (never raw HTML)
    type                 TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal','system')),
    thread_reply_count   INT NOT NULL DEFAULT 0,
    thread_last_reply_at TIMESTAMPTZ,
    edited_at            TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_tsv           tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED
  );
  -- Primary keyset-pagination index (newest-first), excluding soft-deletes:
  CREATE INDEX IF NOT EXISTS collab_messages_conv     ON collab_messages(conversation_id, id DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS collab_messages_parent   ON collab_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS collab_messages_search    ON collab_messages USING GIN (search_tsv);

  CREATE TABLE IF NOT EXISTS collab_message_attachments (
    id            UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    message_id    UUID NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
    tenant_id     TEXT NOT NULL,
    file_key      TEXT NOT NULL,                 -- object-storage key, prefixed tenant/{tenant_id}/...
    file_name     TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL,
    width         INT,
    height        INT,
    thumbnail_key TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS collab_message_attachments_msg ON collab_message_attachments(message_id);

  CREATE TABLE IF NOT EXISTS collab_message_reactions (
    message_id  UUID NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    tenant_id   TEXT NOT NULL,                   -- added vs spec: uniform RLS backstop
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
  );

  -- mentioned_user_id is NULL for channel/everyone, so a surrogate id PK + a
  -- NULLS-NOT-DISTINCT unique index (PG15+) replaces the spec's nullable-column PK.
  CREATE TABLE IF NOT EXISTS collab_message_mentions (
    id                 UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    message_id         UUID NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
    mentioned_user_id  UUID REFERENCES users(id),   -- NULL for channel/everyone
    tenant_id          TEXT NOT NULL,
    kind               TEXT NOT NULL CHECK (kind IN ('user','channel','everyone')),
    CONSTRAINT collab_message_mentions_uq UNIQUE NULLS NOT DISTINCT (message_id, mentioned_user_id, kind)
  );
  CREATE INDEX IF NOT EXISTS collab_message_mentions_user ON collab_message_mentions(mentioned_user_id);

  CREATE TABLE IF NOT EXISTS collab_pinned_messages (
    conversation_id  UUID NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
    message_id       UUID NOT NULL REFERENCES collab_messages(id) ON DELETE CASCADE,
    tenant_id        TEXT NOT NULL,              -- added vs spec: uniform RLS backstop
    pinned_by        UUID NOT NULL REFERENCES users(id),
    pinned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, message_id)
  );

  -- Headroom differentiator: anchor a conversation to a financial object.
  -- entity_id is TEXT (not UUID) because Headroom entity ids are heterogeneous
  -- (invoice UUID, gst filing period, reconciliation run id, …).
  CREATE TABLE IF NOT EXISTS collab_contextual_links (
    conversation_id  UUID NOT NULL REFERENCES collab_conversations(id) ON DELETE CASCADE,
    tenant_id        TEXT NOT NULL,
    entity_type      TEXT NOT NULL CHECK (entity_type IN ('client','deal','reconciliation','invoice','gst_filing')),
    entity_id        TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, entity_type, entity_id)
  );
  CREATE INDEX IF NOT EXISTS collab_contextual_links_entity ON collab_contextual_links(tenant_id, entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS collab_notifications (
    id                UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    tenant_id         TEXT NOT NULL,
    user_id           UUID NOT NULL REFERENCES users(id),     -- recipient
    kind              TEXT NOT NULL CHECK (kind IN ('message','mention','reaction','thread_reply','system')),
    conversation_id   UUID REFERENCES collab_conversations(id) ON DELETE CASCADE,
    source_message_id UUID REFERENCES collab_messages(id) ON DELETE CASCADE,
    actor_id          UUID REFERENCES users(id),
    read_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS collab_notifications_unread ON collab_notifications(user_id, created_at DESC) WHERE read_at IS NULL;

  -- ── Row-Level Security (defense-in-depth) ────────────────────────────────────
  -- Every collab table is isolated on the app.current_tenant GUC. FORCE applies
  -- the policy even to the table owner, so the backstop can't be silently
  -- bypassed. tenantContext.withTenant() sets the GUC per transaction.
  DO $$
  DECLARE t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'collab_teams','collab_team_members','collab_conversations','collab_conversation_members',
      'collab_messages','collab_message_attachments','collab_message_reactions','collab_message_mentions',
      'collab_pinned_messages','collab_contextual_links','collab_notifications'
    ] LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.current_tenant', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
    END LOOP;
  END $$;
`;

module.exports = { COLLAB_SCHEMA };
