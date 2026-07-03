-- RLS for the counterparty intelligence tables (enrichment cache + anchor invites). Both carry
-- tenant_id and are FORCE-RLS like payouts/lending/invoices; all access routes through
-- q(tenantId,...) in modules/counterparty/index.js.
DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE counterparty_enrichments ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE counterparty_enrichments FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON counterparty_enrichments';
  EXECUTE $p$CREATE POLICY tenant_isolation ON counterparty_enrichments
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;

  EXECUTE 'ALTER TABLE counterparty_invites ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE counterparty_invites FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON counterparty_invites';
  EXECUTE $p$CREATE POLICY tenant_isolation ON counterparty_invites
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
