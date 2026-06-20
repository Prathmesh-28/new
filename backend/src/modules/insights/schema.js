// Insights module schema.
//
//  1. insights_dashboards — saved dashboards (a list of widgets). KPI widgets are
//     computed live across books / CRM / HRMS so they always reconcile; widgets may
//     also reference saved charts ({ type:'chart', chartId }).
//  2. insights_queries   — a stored SAFE query model (Frappe-Insights-style): a
//     whitelisted dataset + columns/aggregates + filters + group-by + order + limit.
//     The model is JSONB; it is compiled to PARAMETERIZED SQL at run time (see
//     index.js `compile`). No raw SQL is ever stored or executed.
//  3. insights_charts    — a chart references a saved query + a render config
//     (type: bar|line|pie|number|table, x, y/series).
const INSIGHTS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS insights_dashboards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    widgets     JSONB NOT NULL DEFAULT '[]',
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );

  CREATE TABLE IF NOT EXISTS insights_queries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL,                 -- whitelisted dataset key
    model       JSONB NOT NULL DEFAULT '{}',   -- { columns, filters, group_by, order_by, limit }
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );

  CREATE TABLE IF NOT EXISTS insights_charts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    query_id    UUID NOT NULL REFERENCES insights_queries(id) ON DELETE CASCADE,
    config      JSONB NOT NULL DEFAULT '{}',   -- { type, x, y, series }
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
`;

module.exports = { INSIGHTS_SCHEMA };
