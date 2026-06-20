// ERP module — manufacturing on top of the books inventory module. A faithful
// port of ERPNext's manufacturing + stock domain logic:
//   • Bills of Materials with components (optionally sub-assemblies that have
//     their OWN default BOM) + routing operations (workstation, time, rate).
//   • Multi-level BOM explosion → flat raw-material requirements.
//   • Cost rollup = Σ(component rate×qty) + Σ(operation operating cost).
//   • Work Order lifecycle (Not Started → In Process → Completed) with a real
//     qty state machine (required / transferred / consumed / produced).
//   • Job cards per operation: start/complete time logging → actual operating cost.
//   • Material requests (PURCHASE / TRANSFER / MANUFACTURE) + auto-reorder.
// The stock + valuation TRUTH always stays in books (books.receive / books.issue);
// the ERP layer only orchestrates it. Money flows: issuing components debits a
// WIP holding ledger (Dr WIP / Cr Stock-in-hand handled inside books.issue's COGS
// posting model), and the finished good is received at component + operating cost
// so books stays balanced and finished-good valuation includes labour.
const ERP_SCHEMA = `
  -- ── Bills of Materials ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS erp_boms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    item_id         UUID,                  -- finished good (book_stock_items.id)
    output_qty      NUMERIC(19,4) NOT NULL DEFAULT 1,   -- BOM "quantity" in ERPNext
    is_active       BOOLEAN NOT NULL DEFAULT true,
    is_default      BOOLEAN NOT NULL DEFAULT true,       -- the default BOM for its item (used by sub-assembly explosion)
    -- cached cost rollup (recomputed on save); per-batch (for output_qty units)
    raw_material_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    operating_cost    NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_cost        NUMERIC(19,4) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_erp_boms_item ON erp_boms(tenant_id, item_id);

  CREATE TABLE IF NOT EXISTS erp_bom_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    bom_id             UUID NOT NULL REFERENCES erp_boms(id) ON DELETE CASCADE,
    component_item_id  UUID NOT NULL,      -- book_stock_items.id
    qty                NUMERIC(19,4) NOT NULL,   -- qty per the BOM's output_qty batch
    sub_bom_id         UUID REFERENCES erp_boms(id),  -- optional explicit sub-assembly BOM
    seq                INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_erp_bom_items ON erp_bom_items(tenant_id, bom_id);

  CREATE TABLE IF NOT EXISTS erp_bom_operations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    bom_id        UUID NOT NULL REFERENCES erp_boms(id) ON DELETE CASCADE,
    operation     TEXT NOT NULL,                 -- e.g. "Cutting"
    workstation   TEXT,                          -- e.g. "Laser Cutter 1"
    time_mins     NUMERIC(19,4) NOT NULL DEFAULT 0,   -- per output_qty batch
    hourly_rate   NUMERIC(19,4) NOT NULL DEFAULT 0,   -- workstation hour_rate
    seq           INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_erp_bom_ops ON erp_bom_operations(tenant_id, bom_id);

  -- ── Work Orders ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS erp_work_orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    bom_id            UUID NOT NULL REFERENCES erp_boms(id),
    qty               NUMERIC(19,4) NOT NULL,             -- qty to manufacture
    finished_item_id  UUID,
    warehouse_id      UUID,
    use_multi_level   BOOLEAN NOT NULL DEFAULT true,      -- explode sub-assemblies?
    -- qty state machine (ERPNext semantics)
    material_transferred NUMERIC(19,4) NOT NULL DEFAULT 0, -- transferred to WIP
    produced_qty      NUMERIC(19,4) NOT NULL DEFAULT 0,    -- finished good received
    -- NOT_STARTED → IN_PROCESS → COMPLETED (+ STOPPED / CANCELLED)
    status            TEXT NOT NULL DEFAULT 'NOT_STARTED'
                      CHECK (status IN ('NOT_STARTED','IN_PROCESS','COMPLETED','STOPPED','CANCELLED')),
    planned_operating_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    actual_operating_cost  NUMERIC(19,4) NOT NULL DEFAULT 0,
    raw_material_cost      NUMERIC(19,4) NOT NULL DEFAULT 0,  -- actual COGS of components issued
    total_cogs        NUMERIC(19,4),                       -- rm + operating, set on completion
    produced_rate     NUMERIC(19,4),                       -- per-unit cost the FG was received at
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_erp_wo ON erp_work_orders(tenant_id, status);

  CREATE TABLE IF NOT EXISTS erp_work_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    work_order_id     UUID NOT NULL REFERENCES erp_work_orders(id) ON DELETE CASCADE,
    item_id           UUID NOT NULL,
    required_qty      NUMERIC(19,4) NOT NULL,             -- from exploded BOM × wo.qty
    transferred_qty   NUMERIC(19,4) NOT NULL DEFAULT 0,   -- issued into WIP
    consumed_qty      NUMERIC(19,4) NOT NULL DEFAULT 0,   -- actually consumed on manufacture
    rate              NUMERIC(19,4) NOT NULL DEFAULT 0,    -- per-unit rate at planning time
    is_sub_assembly   BOOLEAN NOT NULL DEFAULT false
  );
  CREATE INDEX IF NOT EXISTS idx_erp_wo_items ON erp_work_order_items(tenant_id, work_order_id);

  CREATE TABLE IF NOT EXISTS erp_work_order_operations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    work_order_id     UUID NOT NULL REFERENCES erp_work_orders(id) ON DELETE CASCADE,
    operation         TEXT NOT NULL,
    workstation       TEXT,
    time_mins         NUMERIC(19,4) NOT NULL DEFAULT 0,   -- planned, scaled to wo.qty
    hourly_rate       NUMERIC(19,4) NOT NULL DEFAULT 0,
    planned_operating_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
    actual_time_mins  NUMERIC(19,4) NOT NULL DEFAULT 0,   -- summed from job cards
    actual_operating_cost  NUMERIC(19,4) NOT NULL DEFAULT 0,
    completed_qty     NUMERIC(19,4) NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED')),
    seq               INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_erp_wo_ops ON erp_work_order_operations(tenant_id, work_order_id);

  -- ── Job cards (time logging per operation) ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS erp_job_cards (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    work_order_id     UUID NOT NULL REFERENCES erp_work_orders(id) ON DELETE CASCADE,
    wo_operation_id   UUID REFERENCES erp_work_order_operations(id) ON DELETE CASCADE,
    operation         TEXT NOT NULL,
    workstation       TEXT,
    hourly_rate       NUMERIC(19,4) NOT NULL DEFAULT 0,
    for_qty           NUMERIC(19,4) NOT NULL DEFAULT 0,    -- qty this card is meant to produce
    from_time         TIMESTAMPTZ,                          -- set on start
    to_time           TIMESTAMPTZ,                          -- set on complete
    time_mins         NUMERIC(19,4) NOT NULL DEFAULT 0,    -- (to_time - from_time) in minutes
    completed_qty     NUMERIC(19,4) NOT NULL DEFAULT 0,
    operating_cost    NUMERIC(19,4) NOT NULL DEFAULT 0,    -- time_mins/60 × hourly_rate
    status            TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_erp_jc ON erp_job_cards(tenant_id, work_order_id);

  -- ── Material Requests ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS erp_material_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    request_type      TEXT NOT NULL DEFAULT 'PURCHASE'
                      CHECK (request_type IN ('PURCHASE','TRANSFER','MANUFACTURE')),
    -- PENDING → PARTIALLY_ORDERED → ORDERED (derived from per_ordered)
    status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('DRAFT','PENDING','PARTIALLY_ORDERED','ORDERED','CANCELLED')),
    source            TEXT NOT NULL DEFAULT 'manual'       -- 'manual' | 'reorder'
                       CHECK (source IN ('manual','reorder')),
    note              TEXT,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_erp_mr ON erp_material_requests(tenant_id, status);

  CREATE TABLE IF NOT EXISTS erp_material_request_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    material_request_id UUID NOT NULL REFERENCES erp_material_requests(id) ON DELETE CASCADE,
    item_id             UUID NOT NULL,
    qty                 NUMERIC(19,4) NOT NULL,
    ordered_qty         NUMERIC(19,4) NOT NULL DEFAULT 0,
    -- snapshot at reorder time (ERPNext stores projected_on_hand + reorder_level)
    projected_qty       NUMERIC(19,4),
    reorder_level       NUMERIC(19,4)
  );
  CREATE INDEX IF NOT EXISTS idx_erp_mr_items ON erp_material_request_items(tenant_id, material_request_id);
`;

module.exports = { ERP_SCHEMA };
