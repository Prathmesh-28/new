-- RLS rollout, Phase 4: the HRMS (people/payroll) module — money tier (payroll posts to
-- the GL). All 17 hrms_* tables carry tenant_id; every query path (51 reads via q() + 4
-- multi-statement transactions via withTenant) was routed through lib/tenantDb in the same
-- change. Payroll GL posting (books.postVoucher/ledgerIdByName) runs OUTSIDE the withTenant
-- txn on its own connection against un-RLS'd book_* tables, so nothing is stranded.
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hrms_employees','hrms_attendance','hrms_leave_types','hrms_leave_allocations',
    'hrms_leave_ledger','hrms_leave_requests','hrms_salary_structures','hrms_structure_assignments',
    'hrms_payroll_runs','hrms_payslips','hrms_salary_components','hrms_payroll_periods',
    'hrms_tds_projections','hrms_investment_declarations','hrms_gratuity_slabs',
    'hrms_employee_loans','hrms_full_and_final'
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
