// HRMS module - employees, attendance, leave (allocation→ledger→application balance),
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

  -- Leave Ledger Entry - the journal of all leave transactions.
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

  -- ════════════════════════════════════════════════════════════════════════════
  -- INDIA-PAYROLL DEPTH (frappe/hrms port): formula components, annualized TDS,
  -- investment declarations, two-stage GL, gratuity, full-and-final.
  -- ════════════════════════════════════════════════════════════════════════════

  -- (3) FORMULA-DRIVEN SALARY COMPONENT MASTER - a first-class entity (Frappe
  -- "Salary Component"). Each row is an earning|deduction with an optional FORMULA
  -- and CONDITION that may reference OTHER components by their abbreviation, plus a
  -- STATISTICAL flag (a non-paid input row used only to feed other formulas, Frappe
  -- "statistical_component"). variable_based_on_taxable_salary marks a TDS row.
  CREATE TABLE IF NOT EXISTS hrms_salary_components (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    component_name  TEXT NOT NULL,
    abbr            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('earning','deduction')),
    formula         TEXT,                 -- references other abbrs (dependency-ordered)
    condition       TEXT,                 -- gate; falsy → row skipped
    amount          NUMERIC(19,2) NOT NULL DEFAULT 0,  -- used when no formula
    depends_on_payment_days BOOLEAN NOT NULL DEFAULT true,
    is_statistical  BOOLEAN NOT NULL DEFAULT false,     -- non-paid input component
    is_tax_applicable BOOLEAN NOT NULL DEFAULT true,    -- counts toward taxable salary
    statutory       BOOLEAN NOT NULL DEFAULT false,
    variable_based_on_taxable_salary BOOLEAN NOT NULL DEFAULT false, -- TDS row
    round_to_integer BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, component_name)
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_components ON hrms_salary_components(tenant_id, type);

  -- (1) PAYROLL PERIOD / payroll-year config. A payroll year runs Apr→Mar; the
  -- assessment year + regime + entity drive the income-tax engine. start_date/
  -- end_date frame the projection window for the annualized TDS.
  CREATE TABLE IF NOT EXISTS hrms_payroll_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    fy              TEXT NOT NULL,            -- 'YYYY-YY' financial year e.g. '2024-25'
    assessment_year TEXT NOT NULL,            -- 'YYYY-YY' e.g. '2025-26'
    start_date      DATE NOT NULL,            -- 1-Apr
    end_date        DATE NOT NULL,            -- 31-Mar
    regime          TEXT NOT NULL DEFAULT 'new' CHECK (regime IN ('new','old')),
    standard_deduction NUMERIC(19,2) NOT NULL DEFAULT 50000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, fy)
  );

  -- (1) ANNUALIZED TDS PROJECTION - one row per employee per payroll year. Stores
  -- the projected annual taxable salary, the total annual tax, tax already deducted
  -- to date, the per-month TDS to deduct going forward (spread over remaining
  -- months), and the full computation JSON for audit. Monthly payroll reads
  -- tds_per_month from here. Recomputed (a mid-year TRUE-UP) whenever declarations
  -- change or a month is run.
  CREATE TABLE IF NOT EXISTS hrms_tds_projections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    employee_id         UUID NOT NULL REFERENCES hrms_employees(id),
    fy                  TEXT NOT NULL,
    regime              TEXT NOT NULL DEFAULT 'new',
    projected_gross     NUMERIC(19,2) NOT NULL DEFAULT 0,
    total_exemptions    NUMERIC(19,2) NOT NULL DEFAULT 0,  -- HRA + standard ded etc.
    chapter_via         NUMERIC(19,2) NOT NULL DEFAULT 0,  -- 80C/80D/... from declarations
    projected_taxable   NUMERIC(19,2) NOT NULL DEFAULT 0,
    annual_tax          NUMERIC(19,2) NOT NULL DEFAULT 0,
    tds_paid_to_date    NUMERIC(19,2) NOT NULL DEFAULT 0,
    remaining_months    INTEGER NOT NULL DEFAULT 12,
    tds_per_month       NUMERIC(19,2) NOT NULL DEFAULT 0,
    computation         JSONB NOT NULL DEFAULT '{}',
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, employee_id, fy)
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_tds ON hrms_tds_projections(tenant_id, fy);

  -- (2) INVESTMENT DECLARATION + PROOF lifecycle. At year start the employee DECLARES
  -- planned investments (80C / 80D / HRA with rent + city). At year end they submit
  -- actual PROOFS. status walks DRAFT → SUBMITTED (declared) → PROOF_SUBMITTED →
  -- VERIFIED. The amounts feeding the TDS projection switch from declared to
  -- proof-verified once proofs are in. HRA carries rent + metro flag for the
  -- least-of-three HRA exemption.
  CREATE TABLE IF NOT EXISTS hrms_investment_declarations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    employee_id         UUID NOT NULL REFERENCES hrms_employees(id),
    fy                  TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','SUBMITTED','PROOF_SUBMITTED','VERIFIED')),
    -- HRA inputs
    monthly_rent        NUMERIC(19,2) NOT NULL DEFAULT 0,
    is_metro            BOOLEAN NOT NULL DEFAULT false,  -- 50% vs 40% of basic
    -- declared (planned) section totals
    declared            JSONB NOT NULL DEFAULT '{}',     -- {"80C":..,"80D":..,"80CCD1B":..,..}
    -- actual proofs
    proofs              JSONB NOT NULL DEFAULT '{}',
    submitted_at        TIMESTAMPTZ,
    proof_submitted_at  TIMESTAMPTZ,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, employee_id, fy)
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_decl ON hrms_investment_declarations(tenant_id, fy);

  -- (4) Two-stage payroll GL. Each payroll run now posts an ACCRUAL journal on
  -- slip submit (Dr expense, Cr payable) and a PAYMENT journal later (Dr payable,
  -- Cr bank). We track both voucher ids + the payment status on the run.
  ALTER TABLE hrms_payroll_runs ADD COLUMN IF NOT EXISTS accrual_voucher_id UUID;
  ALTER TABLE hrms_payroll_runs ADD COLUMN IF NOT EXISTS payment_voucher_id UUID;
  ALTER TABLE hrms_payroll_runs ADD COLUMN IF NOT EXISTS pay_status TEXT NOT NULL DEFAULT 'ACCRUED';
  ALTER TABLE hrms_payroll_runs ADD COLUMN IF NOT EXISTS cost_centre_id UUID;
  -- carry the per-month TDS that was actually deducted into each payslip.
  ALTER TABLE hrms_payslips ADD COLUMN IF NOT EXISTS tds NUMERIC(19,2) NOT NULL DEFAULT 0;

  -- (4) Region-based GRATUITY slabs. Frappe "Gratuity Rule": a fraction-of-salary
  -- per year of service, banded by completed years, keyed by region. e.g. India:
  -- 15/26 of last basic per year of service after 5 years.
  CREATE TABLE IF NOT EXISTS hrms_gratuity_slabs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    region          TEXT NOT NULL DEFAULT 'India',
    from_year       NUMERIC(5,2) NOT NULL DEFAULT 0,   -- completed years lower bound
    to_year         NUMERIC(5,2),                       -- null = open
    fraction_per_year NUMERIC(10,6) NOT NULL DEFAULT 0, -- e.g. 0.576923 = 15/26
    min_years       NUMERIC(5,2) NOT NULL DEFAULT 5,    -- eligibility threshold
    max_amount      NUMERIC(19,2),                      -- statutory cap (e.g. 2000000)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_gratuity ON hrms_gratuity_slabs(tenant_id, region, from_year);

  -- (4) EMPLOYEE LOANS - outstanding principal recovered in F&F.
  CREATE TABLE IF NOT EXISTS hrms_employee_loans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    employee_id     UUID NOT NULL REFERENCES hrms_employees(id),
    principal       NUMERIC(19,2) NOT NULL DEFAULT 0,
    outstanding     NUMERIC(19,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_loans ON hrms_employee_loans(tenant_id, employee_id, status);

  -- (4) FULL & FINAL settlement - combines outstanding dues, gratuity, leave
  -- encashment and loan recovery into a single net-payable, with the breakdown JSON
  -- and the GL voucher it posted.
  CREATE TABLE IF NOT EXISTS hrms_full_and_final (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    employee_id         UUID NOT NULL REFERENCES hrms_employees(id),
    relieving_date      DATE NOT NULL,
    gratuity            NUMERIC(19,2) NOT NULL DEFAULT 0,
    leave_encashment    NUMERIC(19,2) NOT NULL DEFAULT 0,
    pending_salary      NUMERIC(19,2) NOT NULL DEFAULT 0,
    other_dues          NUMERIC(19,2) NOT NULL DEFAULT 0,
    loan_recovery       NUMERIC(19,2) NOT NULL DEFAULT 0,
    other_deductions    NUMERIC(19,2) NOT NULL DEFAULT 0,
    net_payable         NUMERIC(19,2) NOT NULL DEFAULT 0,
    breakdown           JSONB NOT NULL DEFAULT '{}',
    voucher_id          UUID,
    status              TEXT NOT NULL DEFAULT 'POSTED',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_fnf ON hrms_full_and_final(tenant_id, employee_id);
`;

module.exports = { HRMS_SCHEMA };
