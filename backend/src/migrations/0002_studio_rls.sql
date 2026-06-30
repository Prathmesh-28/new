-- RLS rollout, Phase 1: studio's PRIVATE tables get FORCE row-level security keyed on
-- the app.current_tenant GUC (set per-txn by lib/tenantDb.withTenant). studio_deployments
-- and studio_app_agents are intentionally LEFT OUT — they are the public token→tenant
-- entry points (getPublished / resolveBridgeGrant read them with no tenant context) and
-- stay isolated by app-layer WHERE tenant_id. All studio_projects / studio_project_versions
-- query paths were routed through withTenant in the same change, so enabling RLS here can't
-- strand a query (a missed path would return 0 rows).
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['studio_projects', 'studio_project_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
