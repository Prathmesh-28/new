// §5 - The books data model. Adapted to Headroom reality: tenant_id is TEXT
// (Headroom tenant ids look like "acme-3f2a", not UUIDs); user refs are UUID
// (users.id). Applied by db.js initDb() after the core schema. All CREATE/ALTER
// are IF NOT EXISTS so it's safe to run on every boot.
const BOOKS_SCHEMA = `
  -- §5.1 Account groups (Tally-style hierarchy)
  CREATE TABLE IF NOT EXISTS book_account_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES book_account_groups(id),
    nature      TEXT NOT NULL CHECK (nature IN ('ASSET','LIABILITY','INCOME','EXPENSE','EQUITY')),
    affects_pl  BOOLEAN NOT NULL,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_book_groups_parent ON book_account_groups(tenant_id, parent_id);

  -- §5.2 Ledgers (the actual accounts)
  CREATE TABLE IF NOT EXISTS book_ledgers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    name               TEXT NOT NULL,
    group_id           UUID NOT NULL REFERENCES book_account_groups(id),
    opening_balance    NUMERIC(19,4) NOT NULL DEFAULT 0,
    opening_is_debit   BOOLEAN NOT NULL DEFAULT true,
    is_party           BOOLEAN NOT NULL DEFAULT false,
    gstin              TEXT,
    pan                TEXT,
    state_code         TEXT,
    billing_address    TEXT,
    credit_period_days INT,
    is_bank            BOOLEAN NOT NULL DEFAULT false,
    account_number     TEXT,
    ifsc               TEXT,
    ext_account_id     UUID,
    ext_party_id       UUID,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_book_ledgers_group ON book_ledgers(tenant_id, group_id);

  -- §5.3 Vouchers (transaction headers)
  CREATE TABLE IF NOT EXISTS book_vouchers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               TEXT NOT NULL,
    voucher_type            TEXT NOT NULL CHECK (voucher_type IN
                              ('SALES','PURCHASE','PAYMENT','RECEIPT','CONTRA','JOURNAL','DEBIT_NOTE','CREDIT_NOTE')),
    voucher_number          BIGINT NOT NULL,
    voucher_date            DATE NOT NULL,
    financial_year          TEXT NOT NULL,
    narration               TEXT,
    reference               TEXT,
    party_ledger_id         UUID REFERENCES book_ledgers(id),
    is_cancelled            BOOLEAN NOT NULL DEFAULT false,
    reverses_voucher_id     UUID REFERENCES book_vouchers(id),
    cancelled_by_voucher_id UUID REFERENCES book_vouchers(id),
    idempotency_key         TEXT,
    source                  TEXT,
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, voucher_type, voucher_number, financial_year),
    UNIQUE (tenant_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS idx_book_vouchers_date  ON book_vouchers(tenant_id, voucher_date);
  CREATE INDEX IF NOT EXISTS idx_book_vouchers_party ON book_vouchers(tenant_id, party_ledger_id);

  -- §5.4 Voucher entries (the debits & credits)
  CREATE TABLE IF NOT EXISTS book_voucher_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    voucher_id     UUID NOT NULL REFERENCES book_vouchers(id),
    ledger_id      UUID NOT NULL REFERENCES book_ledgers(id),
    debit          NUMERIC(19,4) NOT NULL DEFAULT 0,
    credit         NUMERIC(19,4) NOT NULL DEFAULT 0,
    entry_order    INT NOT NULL DEFAULT 0,
    cost_centre_id UUID,
    CONSTRAINT chk_book_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
  );
  CREATE INDEX IF NOT EXISTS idx_book_entries_voucher ON book_voucher_entries(voucher_id);
  CREATE INDEX IF NOT EXISTS idx_book_entries_ledger  ON book_voucher_entries(tenant_id, ledger_id);

  -- §5.4 deferred per-voucher balance invariant (belt & braces vs rogue inserts)
  CREATE OR REPLACE FUNCTION assert_book_voucher_balanced() RETURNS trigger AS $$
  DECLARE d NUMERIC(19,4); c NUMERIC(19,4);
  BEGIN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
    FROM book_voucher_entries WHERE voucher_id = NEW.voucher_id;
    IF d <> c THEN
      RAISE EXCEPTION 'Voucher % unbalanced: debit %, credit %', NEW.voucher_id, d, c;
    END IF;
    RETURN NULL;
  END $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS trg_book_voucher_balanced ON book_voucher_entries;
  CREATE CONSTRAINT TRIGGER trg_book_voucher_balanced
    AFTER INSERT ON book_voucher_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_book_voucher_balanced();

  -- §5.5 Tax entries (authoritative GST/TDS breakdown)
  CREATE TABLE IF NOT EXISTS book_tax_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    voucher_id      UUID NOT NULL REFERENCES book_vouchers(id),
    line_entry_id   UUID REFERENCES book_voucher_entries(id),
    tax_kind        TEXT NOT NULL CHECK (tax_kind IN ('CGST','SGST','IGST','CESS','TDS','TCS')),
    rate            NUMERIC(9,4) NOT NULL,
    taxable_value   NUMERIC(19,4) NOT NULL,
    tax_amount      NUMERIC(19,4) NOT NULL,
    hsn_sac         TEXT,
    is_input        BOOLEAN NOT NULL DEFAULT false,
    place_of_supply TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_tax_voucher ON book_tax_entries(voucher_id);
  CREATE INDEX IF NOT EXISTS idx_book_tax_period  ON book_tax_entries(tenant_id, created_at);

  -- §5.6 Inventory (tables created now; movement logic lands in a later milestone)
  CREATE TABLE IF NOT EXISTS book_stock_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT NOT NULL,
    name             TEXT NOT NULL,
    unit             TEXT NOT NULL,
    hsn_sac          TEXT,
    gst_rate         NUMERIC(9,4),
    opening_qty      NUMERIC(19,4) NOT NULL DEFAULT 0,
    opening_value    NUMERIC(19,4) NOT NULL DEFAULT 0,
    valuation_method TEXT NOT NULL DEFAULT 'WEIGHTED_AVG' CHECK (valuation_method IN ('WEIGHTED_AVG','FIFO')),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS book_stock_movements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    voucher_id  UUID NOT NULL REFERENCES book_vouchers(id),
    item_id     UUID NOT NULL REFERENCES book_stock_items(id),
    qty_in      NUMERIC(19,4) NOT NULL DEFAULT 0,
    qty_out     NUMERIC(19,4) NOT NULL DEFAULT 0,
    rate        NUMERIC(19,4) NOT NULL,
    value       NUMERIC(19,4) NOT NULL,
    godown_id   UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_stock_item ON book_stock_movements(tenant_id, item_id);

  -- §5.7 Balance snapshots (read model; debit-positive convention)
  CREATE TABLE IF NOT EXISTS book_ledger_balances (
    tenant_id      TEXT NOT NULL,
    ledger_id      UUID NOT NULL REFERENCES book_ledgers(id),
    financial_year TEXT NOT NULL,
    period_month   INT NOT NULL,
    opening_signed NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_debit    NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_credit   NUMERIC(19,4) NOT NULL DEFAULT 0,
    closing_signed NUMERIC(19,4) NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, ledger_id, financial_year, period_month)
  );

  -- §5.8 Periods, sequences, audit
  CREATE TABLE IF NOT EXISTS book_periods (
    tenant_id      TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    period_month   INT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED','CLOSED')),
    locked_by      UUID,
    locked_at      TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, financial_year, period_month)
  );
  -- Cost-centre master (Tally-style). Vouchers already carry cost_centre_id; this is
  -- the master + categories that make department/branch/project-wise P&L possible.
  CREATE TABLE IF NOT EXISTS book_cost_centres (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    parent_id  UUID,
    category   TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_book_cost_centres ON book_cost_centres(tenant_id);
  CREATE TABLE IF NOT EXISTS book_voucher_counters (
    tenant_id      TEXT NOT NULL,
    voucher_type   TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    next_number    BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, voucher_type, financial_year)
  );
  CREATE TABLE IF NOT EXISTS book_audit_log (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  TEXT NOT NULL,
    actor_id   UUID,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  UUID,
    detail     JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_audit_tenant ON book_audit_log(tenant_id, created_at DESC);

  -- ── M2: non-posting documents (sales & purchase pipelines) ────────────────
  -- Estimate → Sales Order → Delivery Challan → (Invoice = posts a SALES voucher)
  -- Purchase Order → GRN → (Bill = posts a PURCHASE voucher)
  CREATE TABLE IF NOT EXISTS book_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    doc_kind            TEXT NOT NULL CHECK (doc_kind IN
                          ('ESTIMATE','SALES_ORDER','DELIVERY_CHALLAN','PURCHASE_ORDER','GRN')),
    doc_number          BIGINT NOT NULL,
    doc_date            DATE NOT NULL,
    financial_year      TEXT NOT NULL,
    party_ledger_id     UUID REFERENCES book_ledgers(id),
    status              TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','CONVERTED','CANCELLED')),
    parent_document_id  UUID REFERENCES book_documents(id),
    converted_voucher_id UUID REFERENCES book_vouchers(id),
    subtotal            NUMERIC(19,4) NOT NULL DEFAULT 0,
    gst_rate            NUMERIC(9,4) NOT NULL DEFAULT 0,
    inter_state         BOOLEAN NOT NULL DEFAULT false,
    hsn_sac             TEXT,
    lines               JSONB,
    narration           TEXT,
    reference           TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, doc_kind, doc_number, financial_year)
  );
  CREATE INDEX IF NOT EXISTS idx_book_docs_kind  ON book_documents(tenant_id, doc_kind, status);
  CREATE INDEX IF NOT EXISTS idx_book_docs_party ON book_documents(tenant_id, party_ledger_id);

  -- M2: recurring templates (auto-generate invoices/bills/journals on a schedule)
  CREATE TABLE IF NOT EXISTS book_recurring (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    name          TEXT NOT NULL,
    template_kind TEXT NOT NULL CHECK (template_kind IN ('SALES_INVOICE','BILL','JOURNAL','RECEIPT')),
    template      JSONB NOT NULL,
    frequency     TEXT NOT NULL CHECK (frequency IN ('WEEKLY','MONTHLY','QUARTERLY','YEARLY')),
    next_run      DATE NOT NULL,
    last_run      DATE,
    active        BOOLEAN NOT NULL DEFAULT true,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_recurring_due ON book_recurring(tenant_id, active, next_run);

  -- M2: allocations - how an advance/credit voucher is applied across invoices/bills
  -- (a reporting/aging link; the ledger movement itself is already posted).
  CREATE TABLE IF NOT EXISTS book_allocations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    source_voucher_id UUID NOT NULL REFERENCES book_vouchers(id),  -- advance RECEIPT/PAYMENT or CREDIT/DEBIT_NOTE
    target_voucher_id UUID NOT NULL REFERENCES book_vouchers(id),  -- the SALES/PURCHASE it offsets
    amount            NUMERIC(19,4) NOT NULL,
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_alloc_src ON book_allocations(tenant_id, source_voucher_id);
  CREATE INDEX IF NOT EXISTS idx_book_alloc_tgt ON book_allocations(tenant_id, target_voucher_id);

  -- ── M3: items + inventory depth ───────────────────────────────────────────
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS reorder_level   NUMERIC(19,4) NOT NULL DEFAULT 0;
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS current_qty     NUMERIC(19,4) NOT NULL DEFAULT 0;
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS current_value   NUMERIC(19,4) NOT NULL DEFAULT 0;
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS item_group      TEXT;
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS parent_item_id  UUID;  -- composite/variant parent
  ALTER TABLE book_stock_items ADD COLUMN IF NOT EXISTS allow_negative  BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE book_stock_movements ADD COLUMN IF NOT EXISTS warehouse_id UUID;

  CREATE TABLE IF NOT EXISTS book_warehouses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    address    TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS book_price_lists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    currency   TEXT NOT NULL DEFAULT 'INR',
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS book_price_list_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    price_list_id UUID NOT NULL REFERENCES book_price_lists(id),
    item_id       UUID NOT NULL REFERENCES book_stock_items(id),
    price         NUMERIC(19,4) NOT NULL,
    UNIQUE (price_list_id, item_id)
  );
  CREATE INDEX IF NOT EXISTS idx_book_pli ON book_price_list_items(tenant_id, item_id);
  -- per-warehouse stock balance (qty per godown; value tracked at item level for WAvg)
  CREATE TABLE IF NOT EXISTS book_stock_balances (
    tenant_id    TEXT NOT NULL,
    item_id      UUID NOT NULL REFERENCES book_stock_items(id),
    warehouse_id UUID NOT NULL REFERENCES book_warehouses(id),
    qty          NUMERIC(19,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, item_id, warehouse_id)
  );
  -- FIFO cost layers (consumed oldest-first). The feature INSERTs/SELECTs this on
  -- every receive/issue of a FIFO item; without the table those calls throw.
  CREATE TABLE IF NOT EXISTS book_stock_lots (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    item_id        UUID NOT NULL REFERENCES book_stock_items(id),
    warehouse_id   UUID,
    in_movement_id UUID,
    qty_remaining  NUMERIC(19,4) NOT NULL DEFAULT 0,
    rate           NUMERIC(19,4) NOT NULL DEFAULT 0,
    received_on    DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_stock_lots ON book_stock_lots(tenant_id, item_id, received_on, id);

  -- ── M4: GST classification on tax entries (for GSTR bucketing) ─────────────
  ALTER TABLE book_tax_entries ADD COLUMN IF NOT EXISTS supply_type        TEXT NOT NULL DEFAULT 'REGULAR';
    -- REGULAR | RCM | SEZ | EXPORT | NIL | EXEMPT | COMPOSITION
  ALTER TABLE book_tax_entries ADD COLUMN IF NOT EXISTS counterparty_gstin TEXT;

  -- ── M5: bank reconciliation bridge + payment links ────────────────────────
  -- Imported raw bank lines. amount: +inflow / -outflow.
  CREATE TABLE IF NOT EXISTS book_bank_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    bank_ledger_id  UUID NOT NULL REFERENCES book_ledgers(id),
    txn_date        DATE NOT NULL,
    amount          NUMERIC(19,4) NOT NULL,
    description     TEXT,
    reference       TEXT,
    status          TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED','MATCHED','POSTED','IGNORED')),
    voucher_id      UUID REFERENCES book_vouchers(id),
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_bank_lines ON book_bank_lines(tenant_id, bank_ledger_id, status);

  -- Online collection links (gateway-agnostic; live provider wiring needs keys).
  CREATE TABLE IF NOT EXISTS book_payment_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    invoice_voucher_id  UUID REFERENCES book_vouchers(id),
    party_ledger_id     UUID REFERENCES book_ledgers(id),
    provider            TEXT NOT NULL DEFAULT 'manual',
    amount              NUMERIC(19,4) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','PAID','FAILED','CANCELLED')),
    provider_ref        TEXT,
    link_url            TEXT,
    receipt_voucher_id  UUID REFERENCES book_vouchers(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_paylinks ON book_payment_links(tenant_id, status);

  -- ── M6: reporting depth (dimensions + budgets) ────────────────────────────
  -- Dimensional tags on each line (class/location/project): {"project":"X",...}
  ALTER TABLE book_voucher_entries ADD COLUMN IF NOT EXISTS tags JSONB;
  CREATE INDEX IF NOT EXISTS idx_book_entries_tags ON book_voucher_entries USING GIN (tags);

  CREATE TABLE IF NOT EXISTS book_tags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    dimension  TEXT NOT NULL,        -- 'project' | 'location' | 'class' | ...
    value      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, dimension, value)
  );

  CREATE TABLE IF NOT EXISTS book_budgets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    ledger_id      UUID NOT NULL REFERENCES book_ledgers(id),
    period_month   INT NOT NULL DEFAULT 0,   -- 0 = whole year, else 1..12 (Apr=1)
    amount         NUMERIC(19,4) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, financial_year, ledger_id, period_month)
  );

  -- ── M7: multi-currency, branches/GSTINs, fixed assets ─────────────────────
  ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS currency  TEXT NOT NULL DEFAULT 'INR';
  ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS fx_rate   NUMERIC(19,6) NOT NULL DEFAULT 1;
  ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS branch_id UUID;

  CREATE TABLE IF NOT EXISTS book_branches (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    gstin      TEXT,
    state_code TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );

  CREATE TABLE IF NOT EXISTS book_fixed_assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    cost            NUMERIC(19,4) NOT NULL,
    salvage         NUMERIC(19,4) NOT NULL DEFAULT 0,
    acquired_on     DATE NOT NULL,
    method          TEXT NOT NULL DEFAULT 'SLM' CHECK (method IN ('SLM','WDV')),
    rate            NUMERIC(9,4) NOT NULL,           -- annual % rate
    accumulated_dep NUMERIC(19,4) NOT NULL DEFAULT 0,
    last_dep_on     DATE,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_assets ON book_fixed_assets(tenant_id, is_active);
  -- Income-Tax Act classification (block-of-assets). Distinct from the Companies-Act rate
  -- above (that drives the book depreciation posted to the GL). it_rate NULL = unclassified.
  ALTER TABLE book_fixed_assets ADD COLUMN IF NOT EXISTS it_block TEXT;
  ALTER TABLE book_fixed_assets ADD COLUMN IF NOT EXISTS it_rate  NUMERIC(6,2);

  -- Income-Tax Act block-of-assets depreciation rollforward (WDV, block-wise). One row per
  -- (tenant, FY, block): opening (= prior FY closing) + additions − disposals, then dep with
  -- the <180-day half-rate rule; closing carries forward as next year's opening. The gap vs
  -- the Companies-Act book depreciation drives deferred tax.
  CREATE TABLE IF NOT EXISTS book_it_dep_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    fy              TEXT NOT NULL,            -- 'YYYY-YY'
    block           TEXT NOT NULL,           -- block label (grouping key)
    rate            NUMERIC(6,2) NOT NULL,
    opening_wdv     NUMERIC(19,2) NOT NULL DEFAULT 0,
    additions       NUMERIC(19,2) NOT NULL DEFAULT 0,
    additions_lt180 NUMERIC(19,2) NOT NULL DEFAULT 0,
    disposals       NUMERIC(19,2) NOT NULL DEFAULT 0,
    depreciation    NUMERIC(19,2) NOT NULL DEFAULT 0,
    closing_wdv     NUMERIC(19,2) NOT NULL DEFAULT 0,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, fy, block)
  );

  -- ── M8: automation (approvals, numbering, late fees, expenses, projects) ──
  CREATE TABLE IF NOT EXISTS book_approval_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    entity_type   TEXT NOT NULL,             -- voucher type or document kind
    min_amount    NUMERIC(19,4) NOT NULL DEFAULT 0,
    approver_role TEXT NOT NULL DEFAULT 'owner',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS book_approvals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    UUID,
    amount       NUMERIC(19,4) NOT NULL,
    status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    requested_by UUID,
    decided_by   UUID,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_book_approvals ON book_approvals(tenant_id, status);

  CREATE TABLE IF NOT EXISTS book_number_formats (
    tenant_id TEXT NOT NULL,
    doc_type  TEXT NOT NULL,
    prefix    TEXT NOT NULL DEFAULT '',
    pad       INT  NOT NULL DEFAULT 4,
    suffix    TEXT NOT NULL DEFAULT '',
    include_fy BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (tenant_id, doc_type)
  );
  CREATE TABLE IF NOT EXISTS book_reminders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    name           TEXT NOT NULL,
    days_after_due INT NOT NULL DEFAULT 7,
    fee_percent_pa NUMERIC(9,4) NOT NULL DEFAULT 0,
    active         BOOLEAN NOT NULL DEFAULT true
  );
  CREATE TABLE IF NOT EXISTS book_attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID NOT NULL,
    filename    TEXT NOT NULL,
    url         TEXT,
    uploaded_by UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_attach ON book_attachments(tenant_id, entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS book_projects (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    name               TEXT NOT NULL,
    customer_ledger_id UUID REFERENCES book_ledgers(id),
    status             TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE TABLE IF NOT EXISTS book_timesheets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    project_id  UUID NOT NULL REFERENCES book_projects(id),
    work_date   DATE NOT NULL,
    hours       NUMERIC(9,2) NOT NULL,
    rate        NUMERIC(19,4) NOT NULL DEFAULT 0,
    billable    BOOLEAN NOT NULL DEFAULT true,
    invoiced_voucher_id UUID REFERENCES book_vouchers(id),
    note        TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_ts ON book_timesheets(tenant_id, project_id);

  -- ── M10: e-invoice / e-way IRN tracking (GSP-backed, async) ───────────────
  CREATE TABLE IF NOT EXISTS book_einvoices (
    voucher_id   UUID PRIMARY KEY REFERENCES book_vouchers(id),
    tenant_id    TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'QUEUED',  -- QUEUED | REGISTERED | FAILED | PENDING_CONFIG
    irn          TEXT,
    ack_no       TEXT,
    ack_date     TEXT,
    signed_qr    TEXT,
    eway_bill_no TEXT,
    error        TEXT,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_einv_queue ON book_einvoices(status) WHERE status='QUEUED';

  CREATE TABLE IF NOT EXISTS book_expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    exp_date        DATE NOT NULL,
    category_ledger_id UUID NOT NULL REFERENCES book_ledgers(id),
    amount          NUMERIC(19,4) NOT NULL,
    paid_from_ledger_id UUID REFERENCES book_ledgers(id),
    billable        BOOLEAN NOT NULL DEFAULT false,
    customer_ledger_id  UUID REFERENCES book_ledgers(id),
    voucher_id      UUID REFERENCES book_vouchers(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Employee/staff expense ADVANCES: money given up front (Dr Employee Advances / Cr Bank),
  -- later SETTLED against an actual expense report (Dr expense categories / Cr Advances) with
  -- the balance refunded (employee returns cash) or reimbursed (spent more than advanced).
  CREATE TABLE IF NOT EXISTS book_expense_advances (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    person             TEXT NOT NULL,             -- employee / staff name
    purpose            TEXT,
    amount             NUMERIC(19,4) NOT NULL,    -- advanced
    settled_amount     NUMERIC(19,4) NOT NULL DEFAULT 0,   -- actual expenses booked at settle
    refund_amount      NUMERIC(19,4) NOT NULL DEFAULT 0,   -- cash returned by the employee
    reimburse_amount   NUMERIC(19,4) NOT NULL DEFAULT 0,   -- extra paid to the employee
    status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','settled')),
    advance_voucher_id UUID REFERENCES book_vouchers(id),
    settle_voucher_id  UUID REFERENCES book_vouchers(id),
    created_by         UUID,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at         TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_book_expense_advances ON book_expense_advances(tenant_id, status, created_at DESC);

  -- Generic renewals/expiry registry: licenses, DSCs, AMCs, agreements, registrations,
  -- insurance — anything with an expiry date that needs a renewal reminder. One engine drives
  -- the days-to-expiry + due/expired status + the "renewals due" list.
  CREATE TABLE IF NOT EXISTS book_expiry_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    kind          TEXT NOT NULL,             -- license|dsc|amc|agreement|registration|insurance|other
    name          TEXT NOT NULL,
    identifier    TEXT,                       -- license no / cert serial / contract no
    counterparty  TEXT,
    amount        NUMERIC(19,2),
    issued_on     DATE,
    expires_on    DATE NOT NULL,
    reminder_days INT NOT NULL DEFAULT 30,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewed','cancelled')),
    notes         TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_book_expiry_items ON book_expiry_items(tenant_id, status, expires_on);
`;

module.exports = { BOOKS_SCHEMA };
