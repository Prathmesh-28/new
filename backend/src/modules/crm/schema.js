// CRM module schema — accounts, contacts, leads, deals (pipeline), tasks, notes,
// activities, SLAs. Tenant-scoped TEXT ids (Headroom convention); links to the
// books customer ledger. Domain logic ported from Frappe CRM (fcrm).
//
// NOTE: the base tables (accounts/contacts/leads/deals/activities) already exist in
// production. We add the Frappe-faithful columns with ALTER ... ADD COLUMN IF NOT
// EXISTS, and relax the original CHECK constraints (which only allowed a tiny status
// vocabulary) so the richer Frappe status/stage workflows fit. New domain tables
// (slas, tasks, notes, status_change_log) are CREATE TABLE IF NOT EXISTS.
const CRM_SCHEMA = `
  CREATE TABLE IF NOT EXISTS crm_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    industry        TEXT,
    website         TEXT,
    phone           TEXT,
    gstin           TEXT,
    annual_revenue  NUMERIC(19,2),
    territory       TEXT,
    books_ledger_id UUID,            -- linked Sundry-Debtors ledger once a deal is won
    owner_user_id   UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_crm_accounts ON crm_accounts(tenant_id);
  ALTER TABLE crm_accounts ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(19,2);
  ALTER TABLE crm_accounts ADD COLUMN IF NOT EXISTS territory TEXT;

  CREATE TABLE IF NOT EXISTS crm_contacts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    account_id  UUID REFERENCES crm_accounts(id),
    name        TEXT NOT NULL,
    salutation  TEXT,
    first_name  TEXT,
    last_name   TEXT,
    email       TEXT,
    phone       TEXT,
    mobile_no   TEXT,
    designation TEXT,
    gender      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_contacts ON crm_contacts(tenant_id, account_id);
  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS salutation TEXT;
  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS mobile_no TEXT;
  ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS gender TEXT;

  -- Service Level Agreements (ported from CRM Service Level Agreement + priorities +
  -- working hours + holidays). priorities/working_hours/holidays kept as JSONB:
  --   priorities:     [{ priority, response_time, resolution_time, default_priority }]  (hours)
  --   working_hours:  { Monday: { start: "09:00", end: "18:00" }, ... }                 (24h local)
  --   holidays:       [ "2026-01-26", ... ]                                             (ISO dates)
  CREATE TABLE IF NOT EXISTS crm_slas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    name          TEXT NOT NULL,
    apply_on      TEXT NOT NULL DEFAULT 'Lead' CHECK (apply_on IN ('Lead','Deal')),
    enabled       BOOLEAN NOT NULL DEFAULT true,
    is_default    BOOLEAN NOT NULL DEFAULT false,
    priorities    JSONB NOT NULL DEFAULT '[]'::jsonb,
    working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    holidays      JSONB NOT NULL DEFAULT '[]'::jsonb,
    start_date    DATE,
    end_date      DATE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );
  CREATE INDEX IF NOT EXISTS idx_crm_slas ON crm_slas(tenant_id, apply_on, enabled);

  CREATE TABLE IF NOT EXISTS crm_leads (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    name              TEXT NOT NULL,
    company           TEXT,
    email             TEXT,
    phone             TEXT,
    source            TEXT,
    status            TEXT NOT NULL DEFAULT 'NEW',
    industry          TEXT,
    territory         TEXT,
    job_title         TEXT,
    annual_revenue    NUMERIC(19,2),
    no_of_employees   TEXT,
    website           TEXT,
    priority          TEXT,            -- maps to SLA priority / communication_status
    score             INT NOT NULL DEFAULT 0,
    lost_reason       TEXT,
    -- SLA tracking
    sla_id            UUID REFERENCES crm_slas(id),
    sla_creation      TIMESTAMPTZ,
    response_by       TIMESTAMPTZ,
    resolution_by     TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    sla_status        TEXT,            -- 'First Response Due' | 'Fulfilled' | 'Failed'
    escalated         BOOLEAN NOT NULL DEFAULT false,
    owner_user_id     UUID,
    converted_deal_id UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_leads ON crm_leads(tenant_id, status);
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS industry TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS territory TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS job_title TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(19,2);
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS no_of_employees TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS website TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS priority TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sla_id UUID;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sla_creation TIMESTAMPTZ;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS response_by TIMESTAMPTZ;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS resolution_by TIMESTAMPTZ;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS sla_status TEXT;
  ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false;
  -- relax the original tight status CHECK so the Frappe-style status workflow fits
  ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_status_check;

  CREATE TABLE IF NOT EXISTS crm_deals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    title          TEXT NOT NULL,
    account_id     UUID REFERENCES crm_accounts(id),
    contact_id     UUID REFERENCES crm_contacts(id),     -- primary contact
    value          NUMERIC(19,2) NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'INR',
    stage          TEXT NOT NULL DEFAULT 'QUALIFICATION',
    probability    INT NOT NULL DEFAULT 20,
    expected_close DATE,
    next_step      TEXT,
    status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WON','LOST')),
    lead_id        UUID REFERENCES crm_leads(id),
    source         TEXT,
    lost_reason    TEXT,
    priority       TEXT,
    -- SLA tracking (carried over from lead on conversion)
    sla_id            UUID REFERENCES crm_slas(id),
    sla_creation      TIMESTAMPTZ,
    response_by       TIMESTAMPTZ,
    resolution_by     TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    sla_status        TEXT,
    escalated         BOOLEAN NOT NULL DEFAULT false,
    owner_user_id  UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at      TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_crm_deals ON crm_deals(tenant_id, status, stage);
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS next_step TEXT;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS lead_id UUID;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS source TEXT;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS lost_reason TEXT;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS priority TEXT;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS sla_id UUID;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS sla_creation TIMESTAMPTZ;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS response_by TIMESTAMPTZ;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS resolution_by TIMESTAMPTZ;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS sla_status TEXT;
  ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT false;
  -- relax the original tight stage CHECK (was QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST)
  ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_stage_check;

  -- Tasks (ported from CRM Task): status workflow + priority + due date, linked to a
  -- lead or deal via (reference_type, reference_id).
  CREATE TABLE IF NOT EXISTS crm_tasks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    status         TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('BACKLOG','TODO','IN_PROGRESS','DONE','CANCELED')),
    priority       TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
    start_date     DATE,
    due_date       TIMESTAMPTZ,
    reference_type TEXT CHECK (reference_type IN ('LEAD','DEAL')),
    reference_id   UUID,
    assigned_to    UUID,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_crm_tasks ON crm_tasks(tenant_id, reference_type, reference_id);

  -- Notes (ported from FCRM Note).
  CREATE TABLE IF NOT EXISTS crm_notes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    title          TEXT,
    content        TEXT NOT NULL,
    reference_type TEXT CHECK (reference_type IN ('LEAD','DEAL')),
    reference_id   UUID,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_notes ON crm_notes(tenant_id, reference_type, reference_id);

  -- Status change log (ported from CRM Status Change Log) — feeds the timeline.
  CREATE TABLE IF NOT EXISTS crm_status_change_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('LEAD','DEAL')),
    reference_id   UUID NOT NULL,
    from_status    TEXT,
    to_status      TEXT,
    duration_secs  BIGINT,           -- seconds spent in from_status
    log_owner      UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_crm_status_log ON crm_status_change_log(tenant_id, reference_type, reference_id);

  CREATE TABLE IF NOT EXISTS crm_activities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'NOTE' CHECK (kind IN ('NOTE','TASK','CALL','EMAIL','MEETING')),
    direction   TEXT CHECK (direction IN ('INBOUND','OUTBOUND')),  -- outbound logs first response
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
  CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_activities(tenant_id, lead_id);
  ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS direction TEXT;
`;

module.exports = { CRM_SCHEMA };
