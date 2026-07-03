"use strict";
// SMB embedded lending - LOS (offers + KFS) + LMS (loans, amortization schedule,
// repayments, DPD). Tenant-scoped; collab_uuidv7 PKs. Models the SMB-SIDE of the
// loan (Headroom is the SMB's books): a disbursal is cash in + a Borrowings LIABILITY;
// repayment splits principal/interest. The invoice-financing wedge links a loan to a
// source invoice and auto-collects when that invoice is paid (self-liquidating).
const LENDING_SCHEMA = `
CREATE TABLE IF NOT EXISTS loan_offers (
  id                UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id         TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'working_capital'
                      CHECK (kind IN ('invoice_finance','working_capital','term')),
  principal         NUMERIC(15,2) NOT NULL,
  processing_fee    NUMERIC(15,2) NOT NULL DEFAULT 0,
  apr               NUMERIC(6,2)  NOT NULL DEFAULT 0,      -- annual %, all-in
  tenure_months     INT,                                   -- for EMI products
  tenure_days       INT,                                   -- for bullet (invoice finance)
  source_invoice_id TEXT,                                  -- invoice-finance wedge anchor
  kfs               JSONB NOT NULL DEFAULT '{}'::jsonb,     -- RBI Key Fact Statement
  status            TEXT NOT NULL DEFAULT 'offered'
                      CHECK (status IN ('offered','accepted','declined','expired')),
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_loan_offers_tenant ON loan_offers(tenant_id, created_at DESC);
-- One live advance per invoice (enforce, not just check-then-insert): at most one OPEN offer
-- per source invoice. Partial + IS NOT NULL, so pre-wedge rows (source_invoice_id NULL) and
-- non-invoice products are unaffected. The read-guard in createOffer is the friendly path;
-- this index closes the concurrent double-submit / webhook+manual TOCTOU race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_offers_open_invoice ON loan_offers(tenant_id, source_invoice_id) WHERE status='offered' AND source_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loans (
  id                   UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  tenant_id            TEXT NOT NULL,
  offer_id             UUID REFERENCES loan_offers(id),
  kind                 TEXT NOT NULL,
  principal            NUMERIC(15,2) NOT NULL,
  apr                  NUMERIC(6,2) NOT NULL DEFAULT 0,
  outstanding_principal NUMERIC(15,2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending_disbursal'
                         CHECK (status IN ('pending_disbursal','active','closed','written_off')),
  source_invoice_id    TEXT,
  disbursed_amount     NUMERIC(15,2),
  disbursed_at         TIMESTAMPTZ,
  due_date             DATE,
  disbursal_voucher_id UUID,
  -- Servicing lifecycle (migration 0011): DPD cache, asset classification, penal accrual.
  dpd                   INT           NOT NULL DEFAULT 0,
  asset_class           TEXT          NOT NULL DEFAULT 'standard',  -- standard | overdue | npa
  dpd_updated_on        DATE,
  penal_rate_pct        NUMERIC(6,2)  NOT NULL DEFAULT 24,
  penal_accrued         NUMERIC(15,2) NOT NULL DEFAULT 0,
  penal_last_accrued_on DATE,
  settled_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loans(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loans_invoice ON loans(tenant_id, source_invoice_id) WHERE source_invoice_id IS NOT NULL;
-- The money-safety guard: at most one ACTIVE loan per invoice, so two accepted offers on the
-- same invoice cannot both disburse (onInvoicePaid recovers by source_invoice_id and would
-- otherwise leave the second advance outstanding). Partial + IS NOT NULL → pre-wedge/non-invoice
-- loans (source_invoice_id NULL) are unaffected. acceptOffer catches the 23505 as a friendly error.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loans_active_invoice ON loans(tenant_id, source_invoice_id) WHERE status='active' AND source_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loan_schedule (
  id             UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id        UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL,
  installment_no INT NOT NULL,
  due_date       DATE NOT NULL,
  principal_due  NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_due   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_due      NUMERIC(15,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','paid','overdue','partial')),
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_loan_schedule_loan ON loan_schedule(loan_id, installment_no);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id                  UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id           TEXT NOT NULL,
  amount              NUMERIC(15,2) NOT NULL,
  principal_component NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_component  NUMERIC(15,2) NOT NULL DEFAULT 0,
  method              TEXT,                 -- 'auto_invoice' | 'manual' | 'nach' | ...
  ref                 TEXT,
  gl_voucher_id       UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_repayments_ref ON loan_repayments(ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan ON loan_repayments(loan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loan_settlements (
  id                UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id           UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL,
  settlement_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  waiver_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  gl_voucher_id     UUID,
  note              TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_loan ON loan_settlements(loan_id);

CREATE TABLE IF NOT EXISTS loan_servicing_events (
  id           UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id      UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL,
  as_of        DATE NOT NULL,
  dpd          INT NOT NULL DEFAULT 0,
  asset_class  TEXT NOT NULL,
  penal_charge NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_servicing_events_loan ON loan_servicing_events(loan_id, as_of DESC);

-- e-NACH / UPI-Autopay auto-collection mandates. State machine: initiated → active →
-- paused/revoked/failed. The actual debit is provider-gated (Razorpay/Digio); this models the
-- mandate lifecycle + presentation scheduling against the repayment schedule. On a successful
-- presentation we record a repayment; on a bounce the installment stays unpaid so servicing DPD
-- picks it up.
CREATE TABLE IF NOT EXISTS loan_mandates (
  id            UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id       UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'manual',   -- 'razorpay' | 'digio' | 'manual'
  max_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,  -- per-debit cap
  frequency     TEXT NOT NULL DEFAULT 'as_presented',
  status        TEXT NOT NULL DEFAULT 'initiated'
                  CHECK (status IN ('initiated','active','paused','revoked','failed')),
  provider_ref  TEXT,                              -- UMRN / provider mandate id
  debit_account TEXT,                              -- masked (e.g. ••1234)
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_loan_mandates_loan ON loan_mandates(loan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loan_mandate_presentations (
  id            UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  mandate_id    UUID NOT NULL REFERENCES loan_mandates(id) ON DELETE CASCADE,
  loan_id       UUID NOT NULL,
  tenant_id     TEXT NOT NULL,
  installment_no INT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','success','bounced','skipped')),
  provider_ref  TEXT,
  result_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mandate_id, installment_no)   -- one presentation per installment (idempotent)
);
CREATE INDEX IF NOT EXISTS idx_loan_presentations_mandate ON loan_mandate_presentations(mandate_id, installment_no);
`;

module.exports = { LENDING_SCHEMA };
