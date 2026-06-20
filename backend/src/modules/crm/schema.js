// CRM module schema — accounts, contacts, leads, deals (pipeline), activities.
// Tenant-scoped TEXT ids (Headroom convention); links to the books customer ledger.
const CRM_SCHEMA = `
  CREATE TABLE IF NOT EXISTS crm_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    industry        TEXT,
    website         TEXT,
    phone           TEXT,
    gstin           TEXT,
    books_ledger_id UUID,            -- linked Sundry-Debtors ledger once a deal is won
    owner_user_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_crm_accounts ON crm_accounts(tenant_id);

  CREATE TABLE IF NOT EXISTS crm_contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    account_id  UUID REFERENCES crm_accounts(id),
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    designation TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_contacts ON crm_contacts(tenant_id, account_id);

  CREATE TABLE IF NOT EXISTS crm_leads (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    name              TEXT NOT NULL,
    company           TEXT,
    email             TEXT,
    phone             TEXT,
    source            TEXT,
    status            TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','CONTACTED','QUALIFIED','UNQUALIFIED','CONVERTED')),
    owner_user_id     UUID,
    converted_deal_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_leads ON crm_leads(tenant_id, status);

  CREATE TABLE IF NOT EXISTS crm_deals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    title          TEXT NOT NULL,
    account_id     UUID REFERENCES crm_accounts(id),
    contact_id     UUID REFERENCES crm_contacts(id),
    value          NUMERIC(19,2) NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'INR',
    stage          TEXT NOT NULL DEFAULT 'QUALIFIED' CHECK (stage IN ('QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST')),
    probability    INT NOT NULL DEFAULT 20,
    expected_close DATE,
    status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WON','LOST')),
    owner_user_id  UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at      TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_crm_deals ON crm_deals(tenant_id, status, stage);

  CREATE TABLE IF NOT EXISTS crm_activities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'NOTE' CHECK (kind IN ('NOTE','TASK','CALL','EMAIL','MEETING')),
    subject     TEXT,
    body        TEXT,
    deal_id     UUID REFERENCES crm_deals(id),
    lead_id     UUID REFERENCES crm_leads(id),
    account_id  UUID REFERENCES crm_accounts(id),
    due_date    DATE,
    done        BOOLEAN NOT NULL DEFAULT false,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_activities ON crm_activities(tenant_id, deal_id);
`;

module.exports = { CRM_SCHEMA };
