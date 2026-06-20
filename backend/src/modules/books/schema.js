// §5 — The books data model. Adapted to Headroom reality: tenant_id is TEXT
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
`;

module.exports = { BOOKS_SCHEMA };
