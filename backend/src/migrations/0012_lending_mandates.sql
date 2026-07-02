-- e-NACH / UPI-Autopay mandate tables (auto-collection for loans). Same FORCE-RLS tenant
-- isolation as the rest of the lending module (migration 0006). The tables themselves are
-- created by LENDING_SCHEMA on every boot; this migration applies RLS once.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['loan_mandates', 'loan_mandate_presentations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING (tenant_id = current_setting('app.current_tenant', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$, t);
  END LOOP;
END
$rls$;
