-- Partial & advance payments for the standalone invoices table (routes/invoices.js).
-- Until now invoices were binary paid/unpaid (status flip only), so an SMB could not record a
-- part-payment or an advance and see the balance drop. This adds:
--   • invoices.paid_amount — running total received (0 = nothing, = total_amount = fully paid).
--     Backfilled to total_amount for already-paid rows so the new invariant holds retroactively
--     and the settling-receipt paths never re-post a historical invoice.
--   • invoice_payments — one row per receipt (partial or full), the reconcilable ledger of
--     collections. FORCE-RLS like invoices (0015): EVERY access routes through q()/withTenant().
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
-- Backfill already-paid rows. invoices is FORCE-RLS (0015) and the migration runs with no
-- app.current_tenant GUC, so a plain UPDATE would match zero rows. The migration role owns the
-- table, so drop FORCE for the one maintenance statement, then restore it (all atomic in this
-- migration's transaction; a rollback restores FORCE anyway).
ALTER TABLE invoices NO FORCE ROW LEVEL SECURITY;
UPDATE invoices SET paid_amount = total_amount WHERE status = 'paid' AND paid_amount = 0;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL DEFAULT 'other',
  reference   TEXT,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  gl_posted   BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant_invoice ON invoice_payments(tenant_id, invoice_id);

DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE invoice_payments FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON invoice_payments';
  EXECUTE $p$CREATE POLICY tenant_isolation ON invoice_payments
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
