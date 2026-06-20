import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Users, UserPlus, CalendarCheck, Plane, Wallet, Plus, RefreshCw,
  CheckCircle2, XCircle, IndianRupee, UserCheck, UserX, CalendarDays,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes inlined — backend confirmed)
// ─────────────────────────────────────────────────────────────────────────────
type EmpStatus = "ACTIVE" | "INACTIVE";
type AttStatus = "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY" | "HOLIDAY";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

interface Employee {
  id: string;
  name: string;
  department: string | null;
  designation: string | null;
  status: EmpStatus;
}

interface AttendanceDay {
  att_date: string;
  status: AttStatus;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: number;
  status: LeaveStatus;
}

interface PayrollRun {
  id: string;
  run_month: string;
  gross: string;
  net: string;
  voucher_id: string | null;
}

interface PayrollResult {
  run: PayrollRun;
  employees: number;
  gross: string;
  net: string;
}

type TabId = "employees" | "attendance" | "leave" | "payroll";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// Render an API money value with a ₹ prefix. Accepts strings ("11800.00") or numbers.
function rupee(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "₹0.00";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n)) {
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const s = String(v).trim();
  return s ? `₹${s}` : "₹0.00";
}

const LEAVE_TYPES = ["CASUAL", "SICK", "EARNED", "UNPAID"] as const;
const ATT_STATUSES: AttStatus[] = ["PRESENT", "ABSENT", "LEAVE", "HALF_DAY", "HOLIDAY"];
const WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager", "accountant", "hr_manager"]);

const EMP_STATUS_STYLE: Record<EmpStatus, string> = {
  ACTIVE:   "bg-green-900/30 text-green-300 border border-green-700/40",
  INACTIVE: "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]",
};

const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  PENDING:  "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  APPROVED: "bg-green-900/30 text-green-300 border border-green-700/40",
  REJECTED: "bg-red-900/30 text-red-300 border border-red-700/40",
};

const ATT_STATUS_STYLE: Record<AttStatus, string> = {
  PRESENT:  "bg-green-900/30 text-green-300 border border-green-700/40",
  ABSENT:   "bg-red-900/30 text-red-300 border border-red-700/40",
  LEAVE:    "bg-amber-900/30 text-amber-300 border border-amber-700/40",
  HALF_DAY: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  HOLIDAY:  "bg-purple-900/30 text-purple-300 border border-purple-700/40",
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
function EmpStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as EmpStatus;
  const cls = EMP_STATUS_STYLE[key] ?? EMP_STATUS_STYLE.INACTIVE;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{key || "—"}</span>;
}

function LeaveStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as LeaveStatus;
  const cls = LEAVE_STATUS_STYLE[key] ?? LEAVE_STATUS_STYLE.PENDING;
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{key || "—"}</span>;
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div
                className="h-3 rounded bg-[var(--color-border)] animate-pulse"
                style={{ width: `${40 + ((r + c) % 4) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-50 transition-colors";

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function HrmsPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const [tab, setTab] = useState<TabId>("employees");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const e = await api.get<Employee[]>("/api/hrms/employees");
      setEmployees(Array.isArray(e) ? e : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "employees",  label: "Employees",  icon: <Users size={14} /> },
    { id: "attendance", label: "Attendance", icon: <CalendarCheck size={14} /> },
    { id: "leave",      label: "Leave",      icon: <Plane size={14} /> },
    { id: "payroll",    label: "Payroll",    icon: <Wallet size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} className="text-[var(--color-primary)]" />
          HRMS — people &amp; payroll
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Employees · attendance · leave · salary runs posted to your books
        </p>
      </div>

      {/* PILL TAB BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BODY */}
      <div className="px-4 sm:px-6 py-5 pb-12">
        {tab === "employees" && (
          <EmployeesTab
            loading={loading}
            employees={employees}
            canWrite={canWrite}
            onReload={loadEmployees}
          />
        )}
        {tab === "attendance" && (
          <AttendanceTab employees={employees} canWrite={canWrite} />
        )}
        {tab === "leave" && (
          <LeaveTab employees={employees} canWrite={canWrite} />
        )}
        {tab === "payroll" && (
          <PayrollTab canWrite={canWrite} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES TAB
// ─────────────────────────────────────────────────────────────────────────────
function EmployeesTab({
  loading, employees, canWrite, onReload,
}: {
  loading: boolean;
  employees: Employee[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const [salaryFor, setSalaryFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter an employee name");
      return;
    }
    setSaving(true);
    try {
      await api.post<Employee>("/api/hrms/employees", {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
        designation: designation.trim() || undefined,
        dateOfJoining: dateOfJoining || undefined,
      });
      toast.success(`Employee "${name.trim()}" added`);
      setName("");
      setEmail("");
      setPhone("");
      setDepartment("");
      setDesignation("");
      setDateOfJoining(todayIso());
      setOpen(false);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (emp: Employee) => {
    const next: EmpStatus = emp.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBusyId(emp.id);
    try {
      await api.post(`/api/hrms/employees/${emp.id}/status`, { status: next });
      toast.success(next === "ACTIVE" ? `${emp.name} reactivated` : `${emp.name} deactivated`);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">
          {employees.length} employee{employees.length === 1 ? "" : "s"}
        </p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <UserPlus size={14} /> Add employee
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">Add employee</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Sharma" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email (optional)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="riya@company.in" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone (optional)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Department (optional)</label>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Finance" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Designation (optional)</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Accountant" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of joining</label>
              <input type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add employee
            </button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Name</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Department</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Designation</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Status</th>
                {canWrite && <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={canWrite ? 5 : 4} />
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 5 : 4} className="px-3 py-8 text-center text-[var(--color-muted)]">No employees yet.</td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <FragmentRow
                    key={emp.id}
                    emp={emp}
                    canWrite={canWrite}
                    busy={busyId === emp.id}
                    salaryOpen={salaryFor === emp.id}
                    onToggleSalary={() => setSalaryFor((cur) => (cur === emp.id ? null : emp.id))}
                    onToggleStatus={() => toggleStatus(emp)}
                    onSalarySaved={() => setSalaryFor(null)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  emp, canWrite, busy, salaryOpen, onToggleSalary, onToggleStatus, onSalarySaved,
}: {
  emp: Employee;
  canWrite: boolean;
  busy: boolean;
  salaryOpen: boolean;
  onToggleSalary: () => void;
  onToggleStatus: () => void;
  onSalarySaved: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[var(--color-border)] last:border-b-0">
        <td className="px-3 py-2.5 font-medium">{emp.name}</td>
        <td className="px-3 py-2.5 text-[var(--color-muted)]">{emp.department || "—"}</td>
        <td className="px-3 py-2.5 text-[var(--color-muted)]">{emp.designation || "—"}</td>
        <td className="px-3 py-2.5"><EmpStatusPill status={emp.status} /></td>
        {canWrite && (
          <td className="px-3 py-2.5">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onToggleSalary}
                className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]"
              >
                <IndianRupee size={13} /> Set salary
              </button>
              <button
                type="button"
                onClick={onToggleStatus}
                disabled={busy}
                className={`inline-flex items-center gap-1 text-xs disabled:opacity-40 ${
                  emp.status === "ACTIVE"
                    ? "text-[var(--color-muted)] hover:text-red-400"
                    : "text-[var(--color-muted)] hover:text-green-400"
                }`}
                title={emp.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
              >
                {busy ? <RefreshCw size={13} className="animate-spin" /> : emp.status === "ACTIVE" ? <UserX size={13} /> : <UserCheck size={13} />}
                {emp.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </td>
        )}
      </tr>
      {salaryOpen && canWrite && (
        <tr className="border-b border-[var(--color-border)]">
          <td colSpan={5} className="px-3 py-3 bg-[var(--color-bg)]/40">
            <SalaryForm employeeId={emp.id} employeeName={emp.name} onSaved={onSalarySaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function SalaryForm({ employeeId, employeeName, onSaved }: { employeeId: string; employeeName: string; onSaved: () => void }) {
  const [basic, setBasic] = useState("");
  const [hra, setHra] = useState("");
  const [allowances, setAllowances] = useState("");
  const [pf, setPf] = useState("");
  const [tds, setTds] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => Number(v) || 0;
  const earnings = num(basic) + num(hra) + num(allowances);
  const deductions = num(pf) + num(tds) + num(otherDeductions);
  const net = earnings - deductions;

  const submit = async () => {
    if (earnings <= 0) {
      toast.error("Enter at least a basic amount above zero");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/hrms/salary-structure", {
        employeeId,
        basic: num(basic),
        hra: num(hra),
        allowances: num(allowances),
        pf: num(pf),
        tds: num(tds),
        otherDeductions: num(otherDeductions),
      });
      toast.success(`Salary set for ${employeeName} — net ${rupee(net)}`);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const moneyInput = `${inputCls} font-mono tabular-nums`;

  return (
    <div>
      <h4 className="text-xs font-semibold mb-3 text-[var(--color-muted)] uppercase tracking-wide">Salary structure · {employeeName}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <label className={labelCls}>Basic</label>
          <input value={basic} onChange={(e) => setBasic(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
        <div>
          <label className={labelCls}>HRA</label>
          <input value={hra} onChange={(e) => setHra(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
        <div>
          <label className={labelCls}>Allowances</label>
          <input value={allowances} onChange={(e) => setAllowances(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
        <div>
          <label className={labelCls}>PF</label>
          <input value={pf} onChange={(e) => setPf(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
        <div>
          <label className={labelCls}>TDS</label>
          <input value={tds} onChange={(e) => setTds(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
        <div>
          <label className={labelCls}>Other deductions</label>
          <input value={otherDeductions} onChange={(e) => setOtherDeductions(e.target.value)} inputMode="decimal" placeholder="0" className={moneyInput} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
        <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
          Earnings {rupee(earnings)} · Deductions {rupee(deductions)} ·{" "}
          <span className="text-[var(--color-primary)] font-semibold">Net {rupee(net)}</span>
        </p>
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Save salary
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceTab({ employees, canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [busy, setBusy] = useState(false);

  // quick "mark today" control
  const [markEmployeeId, setMarkEmployeeId] = useState("");
  const [markDate, setMarkDate] = useState(todayIso());
  const [markStatus, setMarkStatus] = useState<AttStatus>("PRESENT");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) {
      setDays([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await api.get<AttendanceDay[]>(`/api/hrms/attendance?employeeId=${employeeId}&month=${month}`);
      setDays(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [employeeId, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async () => {
    if (!markEmployeeId) {
      toast.error("Pick an employee");
      return;
    }
    if (!markDate) {
      toast.error("Pick a date");
      return;
    }
    setMarking(true);
    try {
      await api.post("/api/hrms/attendance", { employeeId: markEmployeeId, date: markDate, status: markStatus });
      toast.success(`Marked ${markStatus.replace("_", " ").toLowerCase()} for ${markDate}`);
      // reload the table if it's showing the same employee + month
      if (markEmployeeId === employeeId && markDate.slice(0, 7) === month) {
        await load();
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* QUICK MARK */}
      {canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <CalendarCheck size={15} className="text-[var(--color-primary)]" /> Mark attendance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls}>Employee</label>
              <select value={markEmployeeId} onChange={(e) => setMarkEmployeeId(e.target.value)} className={inputCls}>
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={markStatus} onChange={(e) => setMarkStatus(e.target.value as AttStatus)} className={inputCls}>
                {ATT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={mark} disabled={marking} className={btnPrimary}>
              {marking ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Mark
            </button>
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={`${inputCls} min-w-[180px]`}>
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} min-w-[150px]`} />
          </div>
          <button type="button" onClick={() => void load()} className={`${btnGhost} ml-auto`} title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="p-4">
          {!employeeId ? (
            <p className="text-sm text-[var(--color-muted)] text-center py-8">Pick an employee to see their marked days.</p>
          ) : busy ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-7 w-24 rounded-full bg-[var(--color-border)] animate-pulse" />
              ))}
            </div>
          ) : days.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] text-center py-8">No attendance marked for this month.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {days.map((d) => {
                const key = (d.status || "").toUpperCase() as AttStatus;
                const cls = ATT_STATUS_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
                return (
                  <span
                    key={d.att_date}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}
                  >
                    <CalendarDays size={12} />
                    <span className="tabular-nums">{d.att_date}</span>
                    <span className="opacity-80">· {key.replace("_", " ")}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE TAB
// ─────────────────────────────────────────────────────────────────────────────
function LeaveTab({ employees, canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [busy, setBusy] = useState(true);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<LeaveRequest[]>("/api/hrms/leave");
      setRequests(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (req: LeaveRequest, approve: boolean) => {
    setDecidingId(req.id);
    try {
      await api.post(`/api/hrms/leave/${req.id}/decide`, { approve });
      toast.success(approve ? "Leave approved" : "Leave rejected");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <RequestLeaveForm employees={employees} onSaved={load} />
          </div>
          <SetBalanceForm employees={employees} />
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Leave requests <span className="text-[var(--color-muted)] tabular-nums">({requests.length})</span></h3>
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Employee</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Type</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Dates</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Days</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Status</th>
                {canWrite && <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={canWrite ? 6 : 5} rows={5} />
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 6 : 5} className="px-3 py-8 text-center text-[var(--color-muted)]">No leave requests yet.</td>
                </tr>
              ) : (
                requests.map((req) => {
                  const pending = (req.status || "").toUpperCase() === "PENDING";
                  const deciding = decidingId === req.id;
                  return (
                    <tr key={req.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="px-3 py-2.5 font-medium">{empName(req.employee_id)}</td>
                      <td className="px-3 py-2.5 capitalize">{(req.leave_type || "").toLowerCase()}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap tabular-nums">{req.from_date} → {req.to_date}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{req.days}</td>
                      <td className="px-3 py-2.5"><LeaveStatusPill status={req.status} /></td>
                      {canWrite && (
                        <td className="px-3 py-2.5">
                          {pending ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => decide(req, true)}
                                disabled={deciding}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-900/30 text-green-300 border border-green-700/40 hover:opacity-90 disabled:opacity-40"
                              >
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => decide(req, false)}
                                disabled={deciding}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-900/30 text-red-300 border border-red-700/40 hover:opacity-90 disabled:opacity-40"
                              >
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          ) : (
                            <p className="text-right text-xs text-[var(--color-muted)]">—</p>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RequestLeaveForm({ employees, onSaved }: { employees: Employee[]; onSaved: () => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPES[0]);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!employeeId) {
      toast.error("Pick an employee");
      return;
    }
    if (!fromDate || !toDate) {
      toast.error("Pick the leave dates");
      return;
    }
    if (toDate < fromDate) {
      toast.error("End date can't be before start date");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/hrms/leave", {
        employeeId,
        leaveType,
        fromDate,
        toDate,
        reason: reason.trim() || undefined,
      });
      toast.success("Leave request submitted");
      setReason("");
      await onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 h-full">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Plane size={15} className="text-[var(--color-primary)]" /> Request leave
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            <option value="">Select employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Leave type</label>
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputCls}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. family function" className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
          Submit request
        </button>
      </div>
    </div>
  );
}

function SetBalanceForm({ employees }: { employees: Employee[] }) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPES[0]);
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!employeeId) {
      toast.error("Pick an employee");
      return;
    }
    const bal = Number(balance);
    if (!Number.isFinite(bal) || bal < 0) {
      toast.error("Enter a balance of zero or more");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/hrms/leave-balance", { employeeId, leaveType, balance: bal });
      toast.success("Leave balance set");
      setBalance("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 h-full">
      <h3 className="text-sm font-semibold mb-4">Set leave balance</h3>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
            <option value="">Select employee…</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Leave type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className={inputCls}>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Balance (days)</label>
            <input value={balance} onChange={(e) => setBalance(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Save balance
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL TAB
// ─────────────────────────────────────────────────────────────────────────────
function PayrollTab({ canWrite }: { canWrite: boolean }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [busy, setBusy] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await api.get<PayrollRun[]>("/api/hrms/payroll");
      setRuns(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!month) {
      toast.error("Pick a month");
      return;
    }
    if (!window.confirm(`Run payroll for ${month}? This posts the salary journal to the ledger.`)) return;
    setRunning(true);
    try {
      const res = await api.post<PayrollResult>("/api/hrms/payroll/run", { month });
      toast.success(`Payroll posted — net ${rupee(res?.net)}`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Wallet size={15} className="text-[var(--color-primary)]" /> Run payroll
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} min-w-[160px]`} />
            </div>
            <button type="button" onClick={run} disabled={running} className={btnPrimary}>
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Wallet size={14} />}
              Run payroll
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-3">
            Computes net pay from each active employee&apos;s salary structure and posts the salary
            journal voucher to your books.
          </p>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Payroll runs <span className="text-[var(--color-muted)] tabular-nums">({runs.length})</span></h3>
          <button type="button" onClick={() => void load()} className="text-[var(--color-muted)] hover:text-[var(--color-text)]" title="Refresh">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Month</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Gross</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Net</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Posted to books</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <SkeletonRows cols={4} rows={5} />
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-muted)]">No payroll runs yet.</td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium tabular-nums">{r.run_month}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.gross)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)] font-semibold">{rupee(r.net)}</td>
                    <td className="px-3 py-2.5">
                      {r.voucher_id ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-900/30 text-green-300 border border-green-700/40">
                          <CheckCircle2 size={12} /> posted to books ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/40">
                          <XCircle size={12} /> not posted
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
