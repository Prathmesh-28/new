-- RLS rollout: the invoices table (defense-in-depth tenant isolation at the DB, matching the
-- lending/collab/studio/hrms/erp/crm FORCE-RLS tables). invoices carries tenant_id; EVERY
-- access was routed through q(tenantId,...) / withTenant(tenantId, fn) in the SAME change:
--   routes: invoices.js, collections.js (incl. the Razorpay webhook — legacy tenant-less
--           links now log+skip, modern links carry notes.tenant_id), account.js, gst.js
--   lib:    reminders.js (global cron → per-tenant loop), underwriting.js, forecastInputs.js,
--           exitReadiness.js, counterpartyDedupe.js, customerScore.js
--   modules: lending/index.js, flows/runner.js (overdue cron), analytics/index.js
-- invoice_items has NO tenant_id and stays PARENT-scoped: its reads are gated by the invoices
-- join (only visible-parent items surface once invoices is RLS'd) and its writes/deletes run
-- inside the same withTenant transaction as the parent invoice. No policy on invoice_items.
-- A plain pool.query on invoices now returns 0 rows / fails WITH CHECK — this is intentional.
DO $rls$
BEGIN
  EXECUTE 'ALTER TABLE invoices ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE invoices FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON invoices';
  EXECUTE $p$CREATE POLICY tenant_isolation ON invoices
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true))$p$;
END
$rls$;
