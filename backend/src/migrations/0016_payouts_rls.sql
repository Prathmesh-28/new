-- RLS rollout: the shared payouts rail (payout_requests + payout_events) carries tenant_id and
-- is defense-in-depth FORCE-RLS like lending/invoices. EVERY access routes through
-- q(tenantId,...) in modules/payouts/index.js. The provider webhook (modules/payouts/http.js)
-- reads notes.tenant_id off the SIGNED payload and scopes with q(tenantId) — a plain pool.query
-- would return 0 rows under FORCE-RLS (intentional; there is no BYPASSRLS role).
DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE payout_requests FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON payout_requests';
  EXECUTE $p$CREATE POLICY tenant_isolation ON payout_requests
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;

  EXECUTE 'ALTER TABLE payout_events ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE payout_events FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON payout_events';
  EXECUTE $p$CREATE POLICY tenant_isolation ON payout_events
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
