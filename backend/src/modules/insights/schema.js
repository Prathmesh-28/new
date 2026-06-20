// Insights module — saved dashboards (a list of KPI widgets). The KPIs themselves
// are computed live across books / CRM / HRMS, so they always reconcile.
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
`;

module.exports = { INSIGHTS_SCHEMA };
