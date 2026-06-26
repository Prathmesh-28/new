// Headroom Flows — a NATIVE, n8n-independent workflow automation engine.
//
// A flow = a trigger (manual / schedule / event / webhook) + a graph of nodes
// (actions + logic) connected by edges. The runner walks the graph, passing each
// node the accumulated output of upstream nodes, and logs every node's result to
// flow_run (the execution log is what makes automations debuggable).
//
// Owned end-to-end by Headroom — no n8n code, no n8n license. Action nodes reuse
// the agent tool registry; AI nodes reuse the per-tenant LLM gateway.
//
// Applied by db.js initDb() after the collab schema (reuses collab_uuidv7()).

const FLOWS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS flows (
    id            UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    tenant_id     TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    trigger       JSONB NOT NULL DEFAULT '{"type":"manual"}'::jsonb,   -- {type, config:{cron/event/...}}
    graph         JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
    webhook_token TEXT,                                                -- for trigger.type='webhook'
    last_run_at   TIMESTAMPTZ,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at   TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS flows_tenant ON flows(tenant_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS flows_webhook_token ON flows(webhook_token) WHERE webhook_token IS NOT NULL;

  CREATE TABLE IF NOT EXISTS flow_runs (
    id           UUID PRIMARY KEY DEFAULT collab_uuidv7(),
    flow_id      UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    tenant_id    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
    trigger_kind TEXT,                                                 -- manual | schedule | event | webhook
    input        JSONB,                                                -- trigger payload
    results      JSONB,                                                -- { nodeId: {status, output, error, ms} }
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS flow_runs_flow ON flow_runs(flow_id, id DESC);
  CREATE INDEX IF NOT EXISTS flow_runs_tenant ON flow_runs(tenant_id, created_at DESC);
`;

module.exports = { FLOWS_SCHEMA };
