-- RLS rollout, Phase 5: the LENDING (LOS/LMS) module — money tier (loan disbursal/repayment
-- post to the GL). The 4 lending tables carry tenant_id; all reads/writes were routed through
-- q(tenantId,...) in the same change (there are no multi-statement transactions). GL posting
-- (books.postVoucher) + the ledger lookups run on their own connection against un-RLS'd book_*
-- tables, so enabling FORCE RLS here can't strand a query.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loan_offers', 'loans', 'loan_schedule', 'loan_repayments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
