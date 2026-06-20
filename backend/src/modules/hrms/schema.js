// HRMS module — employees, attendance, leave, salary structure, payroll. Running
// payroll posts the salary journal to the books ledger (the accounting truth).
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
    status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    user_id         UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_emp ON hrms_employees(tenant_id, status);

  CREATE TABLE IF NOT EXISTS hrms_attendance (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    employee_id UUID NOT NULL REFERENCES hrms_employees(id),
    att_date    DATE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT','ABSENT','LEAVE','HALF_DAY','HOLIDAY')),
    UNIQUE (tenant_id, employee_id, att_date)
  );

  CREATE TABLE IF NOT EXISTS hrms_leave_balances (
    tenant_id   TEXT NOT NULL,
    employee_id UUID NOT NULL REFERENCES hrms_employees(id),
    leave_type  TEXT NOT NULL,
    balance     NUMERIC(9,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, employee_id, leave_type)
  );
  CREATE TABLE IF NOT EXISTS hrms_leave_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    employee_id UUID NOT NULL REFERENCES hrms_employees(id),
    leave_type  TEXT NOT NULL,
    from_date   DATE NOT NULL,
    to_date     DATE NOT NULL,
    days        NUMERIC(9,2) NOT NULL,
    reason      TEXT,
    status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_leave ON hrms_leave_requests(tenant_id, status);

  CREATE TABLE IF NOT EXISTS hrms_salary_structures (
    tenant_id        TEXT NOT NULL,
    employee_id      UUID NOT NULL REFERENCES hrms_employees(id),
    basic            NUMERIC(19,2) NOT NULL DEFAULT 0,
    hra              NUMERIC(19,2) NOT NULL DEFAULT 0,
    allowances       NUMERIC(19,2) NOT NULL DEFAULT 0,
    pf               NUMERIC(19,2) NOT NULL DEFAULT 0,
    tds              NUMERIC(19,2) NOT NULL DEFAULT 0,
    other_deductions NUMERIC(19,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, employee_id)
  );

  CREATE TABLE IF NOT EXISTS hrms_payroll_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    run_month   TEXT NOT NULL,        -- 'YYYY-MM'
    status      TEXT NOT NULL DEFAULT 'POSTED',
    gross       NUMERIC(19,2) NOT NULL DEFAULT 0,
    net         NUMERIC(19,2) NOT NULL DEFAULT 0,
    voucher_id  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, run_month)
  );
  CREATE TABLE IF NOT EXISTS hrms_payslips (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    run_id      UUID NOT NULL REFERENCES hrms_payroll_runs(id),
    employee_id UUID NOT NULL REFERENCES hrms_employees(id),
    gross       NUMERIC(19,2) NOT NULL,
    deductions  NUMERIC(19,2) NOT NULL,
    net         NUMERIC(19,2) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hrms_payslips ON hrms_payslips(tenant_id, run_id);
`;

module.exports = { HRMS_SCHEMA };
