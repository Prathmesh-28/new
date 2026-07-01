-- Employee-record convergence (unblocks 24Q/Form-16 PAN). Two employee tables exist with
-- no join key: the legacy payroll `employees` (holds the encrypted PAN/bank) and the HRMS
-- `hrms_employees` (where payroll TDS is keyed). This adds an EXPLICIT link so PAN (on
-- employees) and TDS (on hrms_employees) can be paired without ever name-guessing — the
-- link is populated by an email-exact-match linker; unmatched employees keep PAN blank and
-- are flagged. Nullable + non-destructive; hrms_employees is FORCE-RLS (0005), unaffected.
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS legacy_employee_id UUID;
CREATE INDEX IF NOT EXISTS idx_hrms_emp_legacy ON hrms_employees(tenant_id, legacy_employee_id);
