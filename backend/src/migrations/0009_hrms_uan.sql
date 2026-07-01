-- Payroll statutory identifiers on employees, needed for the EPFO ECR (UAN) and ESIC
-- returns (IP number). Nullable so existing employees stay valid; the ECR flags members
-- that still lack a UAN. hrms_employees is FORCE-RLS (migration 0005) — adding columns is
-- unaffected.
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS uan         TEXT;  -- EPFO Universal Account Number
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS pf_number   TEXT;  -- EPF member id (estt/member)
ALTER TABLE hrms_employees ADD COLUMN IF NOT EXISTS esic_ip     TEXT;  -- ESIC Insured Person number
