-- Loan servicing lifecycle (LMS depth): a daily servicing run refreshes DPD + asset
-- classification (standard / overdue / npa at 90 DPD), accrues penal interest on overdue
-- loans and posts it to the GL (SMB-borrower side: a penal-interest EXPENSE + a PAYABLE),
-- and records settlements/waivers. New columns on loans + two new tenant-scoped tables,
-- which get the SAME FORCE-RLS tenant isolation as the rest of the lending module (0006).

ALTER TABLE loans ADD COLUMN IF NOT EXISTS dpd                   INT           NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS asset_class           TEXT          NOT NULL DEFAULT 'standard';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS dpd_updated_on        DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS penal_rate_pct        NUMERIC(6,2)  NOT NULL DEFAULT 24;   -- annualised penal % on the overdue balance
ALTER TABLE loans ADD COLUMN IF NOT EXISTS penal_accrued         NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS penal_last_accrued_on DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS settled_at            TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS loan_settlements (
  id                UUID PRIMARY KEY DEFAULT collab_uuidv7(),
  loan_id           UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL,
  settlement_amount NUMERIC(15,2) NOT NULL DEFAULT 0,   -- cash the borrower pays
  waiver_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,   -- principal the lender forgives (borrower income)
  gl_voucher_id     UUID,
  note              TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loan_settlements_loan ON loan_settlements(loan_id);

-- Per-run snapshot: one row per loan per servicing date (DPD, class, penal charged).
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

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loan_settlements', 'loan_servicing_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
