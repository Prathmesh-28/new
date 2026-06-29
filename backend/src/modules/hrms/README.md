# HRMS — people, payroll & leave (`/api/hrms`)

HR + payroll: employees, attendance, leave (types/allocations/ledger/requests), salary structures, payroll runs & payslips, plus India statutory pieces (TDS projections, investment declarations, gratuity, employee loans, full-&-final). Domain logic ported from **Frappe HR** — notably the salary **component** model (earning/deduction, amount | formula | condition) and the leave ledger.

Payroll runs post their accounting entries through the `books` GL.

**Files:** `index.js` (ported payroll/leave/attendance logic) · `http.js` · `schema.js`.

**Key routes:** employees CRUD, `POST /attendance(/bulk)`, leave allocations/requests + `POST /leave/:id/decide`, salary structures/assignments, `POST /payroll/run`, `GET /slip-preview`.

**Tables:** `hrms_employees`, `hrms_attendance`, `hrms_leave_*`, `hrms_salary_structures`, `hrms_structure_assignments`, `hrms_payroll_runs`, `hrms_payslips`, `hrms_salary_components`, `hrms_tds_projections`, `hrms_investment_declarations`, `hrms_gratuity_slabs`, `hrms_employee_loans`, `hrms_full_and_final`.

See [/ARCHITECTURE.md](../../../../ARCHITECTURE.md) for the module pattern.
