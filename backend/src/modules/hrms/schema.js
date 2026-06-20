// HRMS module — employees, attendance, leave (allocation→ledger→application balance),
// salary STRUCTURES with earning/deduction COMPONENTS (amount | formula | condition |
// depends_on_payment_days | statutory), structure ASSIGNMENTS (a base salary per employee),
// salary-slip computation (working days / payment days / LOP proration), and PAYROLL RUNS
// that post ONE consolidated salary journal to the books ledger (the accounting truth).
//
// This is a faithful port of Frappe HR's payroll/leave/attendance domain model:
//   Salary Component  -> hrms_salary_components
//   Salary Structure  -> hrms_salary_structures (+ component rows in JSON)
//   SS Assignment     -> hrms_structure_assignments (carries `base`)
//   Salary Slip       -> hrms_payslips (full earning/deduction breakdown JSON)
//   Payroll Entry     -> hrms_payroll_runs
//   Leave Type        -> hrms_leave_types
//   Leave Allocation  -> hrms_leave_allocations (+ledger)
//   Leave Application -> hrms_leave_requests   (−ledger on approve)
//   Leave Ledger      -> hrms_leave_ledger     (balance = Σ leaves)
//   Attendance        -> hrms_attendance
const HRMS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS hrms_employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    department      TEXT,
    designation     TEXT,
    date_of_joining DATE,
    relieving_date  DATE,
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    user_id         UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_emp ON hrms_employees(tenant_id, status);

  -- Attendance. Frappe statuses: Present / Absent / On Leave / Half Day / Work From Home + Holiday.
  -- LOP (leave-without-pay) days are derived from ABSENT + unpaid-leave + the absent fraction of half days.
  CREATE TABLE IF NOT EXISTS hrms_attendance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hrms_employees(id),
    att_date        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PRESENT'
                      CHECK (status IN ('PRESENT','ABSENT','LEAVE','HALF_DAY','WFH','HOLIDAY')),
    half_day_status TEXT CHECK (half_day_status IN ('PRESENT','ABSENT')),
    leave_type      TEXT,
    UNIQUE (tenant_id, employee_id, att_date)
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_att ON hrms_attendance(tenant_id, employee_id, att_date);

  -- Leave types carry the annual allocation + whether the type is paid (Frappe is_lwp).
  CREATE TABLE IF NOT EXISTS hrms_leave_types (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          TEXT NOT NULL,
    leave_type_name    TEXT NOT NULL,
    annual_allocation  NUMERIC(9,2) NOT NULL DEFAULT 0,
    is_lwp             BOOLEAN NOT NULL DEFAULT false,   -- leave-without-pay (unpaid)
    include_holiday    BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (tenant_id, leave_type_name)
  );

  -- Leave Allocation -> a +ledger entry (new_leaves_allocated).
  CREATE TABLE IF NOT EXISTS hrms_leave_allocations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             TEXT NOT NULL,
    employee_id           UUID NOT NULL REFERENCES hrms_employees(id),
    leave_type            TEXT NOT NULL,
    from_date             DATE NOT NULL,
    to_date               DATE NOT NULL,
    new_leaves_allocated  NUMERIC(9,2) NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Leave Ledger Entry — the journal of all leave transactions.
  -- leaves > 0 == allocation (credit balance); leaves < 0 == consumption (an approved application).
  -- balance(employee, leave_type) = Σ leaves.
  CREATE TABLE IF NOT EXISTS hrms_leave_ledger (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         TEXT NOT NULL,
    employee_id       UUID NOT NULL REFERENCES hrms_employees(id),
    leave_type        TEXT NOT NULL,
    transaction_type  TEXT NOT NULL,   -- 'ALLOCATION' | 'APPLICATION'
    transaction_id    UUID,            -- allocation id or leave request id
    leaves            NUMERIC(9,2) NOT NULL,  -- +allocate / −consume
    from_date         DATE,
    to_date           DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_ledger ON hrms_leave_ledger(tenant_id, employee_id, leave_type);

  CREATE TABLE IF NOT EXISTS hrms_leave_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    employee_id UUID NOT NULL REFERENCES hrms_employees(id),
    leave_type  TEXT NOT NULL,
    from_date   DATE NOT NULL,
    to_date     DATE NOT NULL,
    half_day    BOOLEAN NOT NULL DEFAULT false,
    days        NUMERIC(9,2) NOT NULL,
    reason      TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_leave ON hrms_leave_requests(tenant_id, status);

  -- Salary STRUCTURE: a named template holding earning/deduction component rows (JSON),
  -- plus statutory flags (PF / ESI / PT / TDS) and a payroll frequency.
  -- components: [{name,type,amount,formula,condition,depends_on_payment_days,statutory,abbr,round}]
  CREATE TABLE IF NOT EXISTS hrms_salary_structures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    name                TEXT NOT NULL,
    payroll_frequency   TEXT NOT NULL DEFAULT 'Monthly',
    components          JSONB NOT NULL DEFAULT '[]',
    apply_pf            BOOLEAN NOT NULL DEFAULT true,
    apply_esi           BOOLEAN NOT NULL DEFAULT true,
    apply_pt            BOOLEAN NOT NULL DEFAULT true,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
  );

  -- Salary Structure ASSIGNMENT: ties an employee to a structure with a base salary,
  -- effective from a date. The base is the variable consumed by component formulas.
  CREATE TABLE IF NOT EXISTS hrms_structure_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    employee_id   UUID NOT NULL REFERENCES hrms_employees(id),
    structure_id  UUID NOT NULL REFERENCES hrms_salary_structures(id),
    base          NUMERIC(19,2) NOT NULL DEFAULT 0,
    from_date     DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_ssa ON hrms_structure_assignments(tenant_id, employee_id, from_date);

  CREATE TABLE IF NOT EXISTS hrms_payroll_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    run_month   TEXT NOT NULL,        -- 'YYYY-MM'
    status      TEXT NOT NULL DEFAULT 'POSTED',
    gross       NUMERIC(19,2) NOT NULL DEFAULT 0,
    total_deduction NUMERIC(19,2) NOT NULL DEFAULT 0,
    net         NUMERIC(19,2) NOT NULL DEFAULT 0,
    voucher_id  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, run_month)
  );

  -- A payslip carries the FULL computed breakdown: earnings[] and deductions[] (each a
  -- resolved component row with its amount), plus working/payment days and LOP.
  CREATE TABLE IF NOT EXISTS hrms_payslips (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    run_id          UUID NOT NULL REFERENCES hrms_payroll_runs(id),
    employee_id     UUID NOT NULL REFERENCES hrms_employees(id),
    employee_name   TEXT,
    total_working_days NUMERIC(9,2) NOT NULL DEFAULT 0,
    payment_days    NUMERIC(9,2) NOT NULL DEFAULT 0,
    lop_days        NUMERIC(9,2) NOT NULL DEFAULT 0,
    earnings        JSONB NOT NULL DEFAULT '[]',
    deductions      JSONB NOT NULL DEFAULT '[]',
    gross           NUMERIC(19,2) NOT NULL,
    total_deduction NUMERIC(19,2) NOT NULL,
    net             NUMERIC(19,2) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_payslips ON hrms_payslips(tenant_id, run_id);
`;

module.exports = { HRMS_SCHEMA };
