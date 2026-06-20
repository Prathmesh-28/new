// ERP module — manufacturing on top of the books inventory module: Bills of
// Materials + Work Orders. Completing a work order consumes components and
// produces the finished good (at rolled-up component cost) via books inventory.
const ERP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS erp_boms (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    item_id     UUID,                 -- finished good (book_stock_items.id)
    output_qty  NUMERIC(19,4) NOT NULL DEFAULT 1,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS erp_bom_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    bom_id             UUID NOT NULL REFERENCES erp_boms(id),
    component_item_id  UUID NOT NULL,
    qty                NUMERIC(19,4) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_erp_bom_items ON erp_bom_items(tenant_id, bom_id);

  CREATE TABLE IF NOT EXISTS erp_work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    bom_id          UUID NOT NULL REFERENCES erp_boms(id),
    qty             NUMERIC(19,4) NOT NULL,
    finished_item_id UUID,
    warehouse_id    UUID,
    status          TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
    cogs            NUMERIC(19,4),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_erp_wo ON erp_work_orders(tenant_id, status);
`;

module.exports = { ERP_SCHEMA };
