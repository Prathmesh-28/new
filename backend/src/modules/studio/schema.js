// Headroom Studio — App Builder, Phase 0 data model.
//
// A "project" is a generated app: a file tree captured as ordered versions, plus
// deployment records. The codegen orchestrator (Phase 1) writes versions; the
// preview (Phase 2) renders the current version; publish (Phase 5) writes
// deployments. Phase 0 is just the durable foundation + tenant-scoped CRUD.
//
// Headroom reality (vs. the playbook): the spec's org_id → tenant_id TEXT (no
// organizations table); ids are the time-sortable collab_uuidv7() so keyset
// pagination works (ORDER BY id DESC + WHERE id < cursor). That function is
// defined by the collab schema, which db.js applies BEFORE this one.
//
// Applied by db.js initDb() after the collab schema.

const STUDIO_SCHEMA = `
  -- ── Projects ─────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS studio_projects (
    id                  UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    tenant_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL,                 -- reserved for {slug}.headroom.app (Phase 5)
    created_by          UUID REFERENCES users(id),
    current_version_id  UUID,                          -- denormalized pointer to the latest version
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at         TIMESTAMPTZ,
    UNIQUE (tenant_id, slug)
  );
  CREATE INDEX IF NOT EXISTS studio_projects_tenant ON studio_projects(tenant_id, created_at DESC);

  -- ── Versions (ordered snapshots of the file tree) ────────────────────────────
  CREATE TABLE IF NOT EXISTS studio_project_versions (
    id                 UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    project_id         UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
    tenant_id          TEXT NOT NULL,
    parent_version_id  UUID,                            -- previous version (undo/restore lineage)
    file_tree          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "path/to/file": "contents", ... }
    prompt             TEXT,                            -- the prompt that produced this version (Phase 1)
    summary            TEXT,
    created_by         UUID REFERENCES users(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS studio_versions_project ON studio_project_versions(project_id, id DESC);

  -- ── Deployments (Phase 5 populates these) ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS studio_deployments (
    id          UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    project_id  UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL,
    version_id  UUID REFERENCES studio_project_versions(id),
    token       TEXT,                          -- public, unguessable id for /api/pub/:token (v1 publish)
    url         TEXT,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','building','live','failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE studio_deployments ADD COLUMN IF NOT EXISTS token TEXT;
  ALTER TABLE studio_deployments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  CREATE INDEX IF NOT EXISTS studio_deployments_project ON studio_deployments(project_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS studio_deployments_token ON studio_deployments(token) WHERE token IS NOT NULL;
`;

module.exports = { STUDIO_SCHEMA };
