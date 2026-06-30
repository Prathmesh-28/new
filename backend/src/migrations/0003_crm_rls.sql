-- RLS rollout, Phase 2: the CRM module. All 9 crm_* tables carry tenant_id and every
-- query path (crm/index.js + the insights BI runQuery cross-module reader) was routed
-- through lib/tenantDb in the same change, so enabling FORCE RLS here can't strand a query.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_accounts','crm_contacts','crm_slas','crm_leads','crm_deals',
    'crm_tasks','crm_notes','crm_status_change_log','crm_activities'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
