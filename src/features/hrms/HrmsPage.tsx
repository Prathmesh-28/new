import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/i18n";
import { toast } from "sonner";
import { api } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import {
  Users, UserPlus, CalendarCheck, Plane, Wallet, Plus, RefreshCw,
  CheckCircle2, XCircle, FileText, Layers, Trash2, Play, Eye,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - response shapes mirror the HRMS backend (Frappe-HR port)
// ─────────────────────────────────────────────────────────────────────────────
type EmpStatus = "ACTIVE" | "INACTIVE";
type AttStatus = "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY" | "WFH" | "HOLIDAY";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
type CompType = "earning" | "deduction";

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
  half_day_status: string | null;
  leave_type: string | null;
}

interface AttendanceSummary {
  month: string;
  counts: { present: number; absent: number; leave: number; half_day: number; wfh: number; holiday: number };
  working_days: number;
  lop_days: number;
  payment_days: number;
}

interface LeaveType {
  id: string;
  leave_type_name: string;
  annual_allocation: string;
  is_lwp: boolean;
}

interface LeaveBalance {
  leave_type: string;
  balance: number;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  days: string;
  half_day: boolean;
  status: LeaveStatus;
}

interface Component {
  name: string;
  abbr: string;
  type: CompType;
  amount: number;
  formula: string | null;
  condition: string | null;
  depends_on_payment_days: boolean;
  statutory: boolean;
  round: boolean;
}

interface Structure {
  id: string;
  name: string;
  payroll_frequency: string;
  components: Component[];
  apply_pf: boolean;
  apply_esi: boolean;
  apply_pt: boolean;
  is_active: boolean;
}

interface Assignment {
  id: string;
  employee_id: string;
  structure_id: string;
  employee_name: string;
  structure_name: string;
  base: string;
  from_date: string;
}

interface SlipLine { name: string; abbr: string; amount: number; statutory?: boolean }

interface SlipPreview {
  employeeId: string;
  structure: string;
  base: number;
  total_working_days: number;
  payment_days: number;
  lop_days: number;
  earnings: SlipLine[];
  deductions: SlipLine[];
  gross: number;
  total_deduction: number;
  net: number;
}

interface PayrollRun {
  id: string;
  run_month: string;
  gross: string;
  total_deduction: string;
  net: string;
  voucher_id: string | null;
}

interface PayrollResult {
  run: PayrollRun;
  employees: number;
  gross: string;
  total_deduction: string;
  net: string;
  breakdown: { pf: string; tds: string; esi: string; pt: string; other: string };
}

interface Payslip {
  id: string;
  employee_name: string;
  total_working_days: string;
  payment_days: string;
  lop_days: string;
  earnings: SlipLine[];
  deductions: SlipLine[];
  gross: string;
  total_deduction: string;
  net: string;
}

type TabId = "employees" | "attendance" | "leave" | "structures" | "payroll";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function currentMonth(): string { return new Date().toISOString().slice(0, 7); }

function rupee(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "₹0.00";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n)) {
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const s = String(v).trim();
  return s ? `₹${s}` : "₹0.00";
}

const ATT_STATUSES: AttStatus[] = ["PRESENT", "ABSENT", "LEAVE", "HALF_DAY", "WFH", "HOLIDAY"];
const WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager"]);

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
  WFH:      "bg-cyan-900/30 text-cyan-300 border border-cyan-700/40",
  HOLIDAY:  "bg-purple-900/30 text-purple-300 border border-purple-700/40",
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
function Pill({ text, cls }: { text: string; cls: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{text || "-"}</span>;
}
function EmpStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as EmpStatus;
  return <Pill text={key} cls={EMP_STATUS_STYLE[key] ?? EMP_STATUS_STYLE.INACTIVE} />;
}
function LeaveStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase() as LeaveStatus;
  return <Pill text={key} cls={LEAVE_STATUS_STYLE[key] ?? LEAVE_STATUS_STYLE.PENDING} />;
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div className="h-3 rounded bg-[var(--color-border)] animate-pulse" style={{ width: `${40 + ((r + c) % 4) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const inputCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost = "inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-50 transition-colors";
const thCls = "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const cardCls = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-[var(--color-muted)]">{text}</td></tr>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function HrmsPage() {
  const { user } = useAuth();
  const tr = useT();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const [tab, setTab] = useState<TabId>("employees");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const e = await api.get<Employee[]>("/api/hrms/employees");
      setEmployees(Array.isArray(e) ? e : []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadEmployees(); }, [loadEmployees]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "employees",  label: tr("hr.tab.employees"),  icon: <Users size={14} /> },
    { id: "attendance", label: tr("hr.tab.attendance"), icon: <CalendarCheck size={14} /> },
    { id: "leave",      label: tr("hr.tab.leave"),      icon: <Plane size={14} /> },
    { id: "structures", label: tr("hr.tab.structures"), icon: <Layers size={14} /> },
    { id: "payroll",    label: tr("hr.tab.payroll"),    icon: <Wallet size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} className="text-[var(--color-primary)]" />
          {tr("hr.title")}
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          {tr("hr.subtitle")}
        </p>
      </div>

      <div className="px-4 sm:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                  active ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"}`}>
                {t.icon}{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 pb-12">
        {tab === "employees"  && <EmployeesTab loading={loading} employees={employees} canWrite={canWrite} onReload={loadEmployees} />}
        {tab === "attendance" && <AttendanceTab employees={employees} canWrite={canWrite} />}
        {tab === "leave"      && <LeaveTab employees={employees} canWrite={canWrite} />}
        {tab === "structures" && <StructuresTab employees={employees} canWrite={canWrite} />}
        {tab === "payroll"    && <PayrollTab employees={employees} canWrite={canWrite} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES TAB
// ─────────────────────────────────────────────────────────────────────────────
function EmployeesTab({ loading, employees, canWrite, onReload }: {
  loading: boolean; employees: Employee[]; canWrite: boolean; onReload: () => Promise<void>;
}) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter an employee name"); return; }
    setSaving(true);
    try {
      await api.post<Employee>("/api/hrms/employees", {
        name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined,
        department: department.trim() || undefined, designation: designation.trim() || undefined,
        dateOfJoining: dateOfJoining || undefined,
      });
      toast.success(`Employee "${name.trim()}" added`);
      setName(""); setEmail(""); setPhone(""); setDepartment(""); setDesignation(""); setDateOfJoining(todayIso());
      setOpen(false);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (emp: Employee) => {
    const next: EmpStatus = emp.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBusyId(emp.id);
    try {
      await api.post(`/api/hrms/employees/${emp.id}/status`, { status: next });
      toast.success(next === "ACTIVE" ? `${emp.name} reactivated` : `${emp.name} deactivated`);
      await onReload();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{employees.length} employee{employees.length === 1 ? "" : "s"}</p>
        {canWrite && <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}><UserPlus size={14} /> {tr("hr.addEmployee")}</button>}
      </div>

      {open && canWrite && (
        <div className={`${cardCls} p-5`}>
          <h3 className="text-sm font-semibold mb-4">Add employee</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className={labelCls}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Sharma" className={inputCls} /></div>
            <div><label className={labelCls}>Email (optional)</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="riya@company.in" className={inputCls} /></div>
            <div><label className={labelCls}>Phone (optional)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" className={inputCls} /></div>
            <div><label className={labelCls}>Department (optional)</label><input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Finance" className={inputCls} /></div>
            <div><label className={labelCls}>Designation (optional)</label><input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Accountant" className={inputCls} /></div>
            <div><label className={labelCls}>Date of joining</label><input type="date" value={dateOfJoining} onChange={(e) => setDateOfJoining(e.target.value)} className={inputCls} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}Add employee</button>
          </div>
        </div>
      )}

      {!loading && employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title={tr("hr.empty.title")}
          description={tr("hr.empty.desc")}
          ctaText={canWrite ? tr("hr.empty.cta") : undefined}
          onCta={canWrite ? () => setOpen(true) : undefined}
        />
      ) : (
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Name</th><th className={thCls}>Department</th><th className={thCls}>Designation</th><th className={thCls}>Status</th>
              {canWrite && <th className={`${thCls} text-right`}>Actions</th>}
            </tr></thead>
            <tbody>
              {loading ? <SkeletonRows cols={canWrite ? 5 : 4} />
                : employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40">
                    <td className="px-3 py-2.5 font-medium">{emp.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{emp.department || "-"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{emp.designation || "-"}</td>
                    <td className="px-3 py-2.5"><EmpStatusPill status={emp.status} /></td>
                    {canWrite && (
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" disabled={busyId === emp.id} onClick={() => toggleStatus(emp)} className={btnGhost}>
                          {emp.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE TAB - grid + summary feeding the slip
// ─────────────────────────────────────────────────────────────────────────────
function AttendanceTab({ employees, canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [empId, setEmpId] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (employees.length && !empId) setEmpId(employees[0].id); }, [employees, empId]);

  const load = useCallback(async () => {
    if (!empId || !month) return;
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        api.get<AttendanceDay[]>(`/api/hrms/attendance?employeeId=${empId}&month=${month}`),
        api.get<AttendanceSummary>(`/api/hrms/attendance/summary?employeeId=${empId}&month=${month}`),
      ]);
      setDays(Array.isArray(d) ? d : []);
      setSummary(s);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, [empId, month]);

  useEffect(() => { void load(); }, [load]);

  const daysInMonth = (() => { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); })();
  const statusByDate = new Map(days.map((d) => [d.att_date.slice(0, 10), d]));

  const mark = async (day: number, status: AttStatus) => {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    try {
      await api.post("/api/hrms/attendance", { employeeId: empId, date, status, halfDayStatus: status === "HALF_DAY" ? "ABSENT" : undefined });
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div><label className={labelCls}>Employee</label>
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label className={labelCls}>Month</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} /></div>
        <button type="button" onClick={load} className={btnGhost}><RefreshCw size={14} /> Refresh</button>
      </div>

      {summary && (
        <div className={`${cardCls} p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center`}>
          <Stat label="Working days" value={summary.working_days} />
          <Stat label="Present" value={summary.counts.present} />
          <Stat label="Absent" value={summary.counts.absent} />
          <Stat label="Half day" value={summary.counts.half_day} />
          <Stat label="Leave" value={summary.counts.leave} />
          <Stat label="LOP days" value={summary.lop_days} accent="text-red-300" />
          <Stat label="Payment days" value={summary.payment_days} accent="text-green-300" />
        </div>
      )}

      <div className={`${cardCls} p-4`}>
        {loading ? <p className="text-sm text-[var(--color-muted)]">Loading…</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = `${month}-${String(day).padStart(2, "0")}`;
              const rec = statusByDate.get(date);
              const st = (rec?.status ?? "") as AttStatus | "";
              return (
                <div key={day} className="border border-[var(--color-border)] rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold tabular-nums">{day}</span>
                    {st && <Pill text={st === "HALF_DAY" ? "HALF" : st} cls={ATT_STATUS_STYLE[st as AttStatus]} />}
                  </div>
                  {canWrite && (
                    <select value={st} onChange={(e) => e.target.value && mark(day, e.target.value as AttStatus)}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1 py-1 text-[11px] outline-none">
                      <option value="">- mark -</option>
                      {ATT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div>
      <div className={`text-lg font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE TAB - types, allocation, balances (Σ ledger), applications
// ─────────────────────────────────────────────────────────────────────────────
function LeaveTab({ employees, canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balEmp, setBalEmp] = useState("");
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // forms
  const [typeName, setTypeName] = useState("");
  const [typeAlloc, setTypeAlloc] = useState("12");
  const [typeLwp, setTypeLwp] = useState(false);

  const [allocEmp, setAllocEmp] = useState("");
  const [allocType, setAllocType] = useState("");
  const [allocDays, setAllocDays] = useState("12");

  const [reqEmp, setReqEmp] = useState("");
  const [reqType, setReqType] = useState("");
  const [reqFrom, setReqFrom] = useState(todayIso());
  const [reqTo, setReqTo] = useState(todayIso());
  const [reqHalf, setReqHalf] = useState(false);

  const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? id.slice(0, 8);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([
        api.get<LeaveType[]>("/api/hrms/leave-types"),
        api.get<LeaveRequest[]>("/api/hrms/leave"),
      ]);
      setTypes(Array.isArray(t) ? t : []);
      setRequests(Array.isArray(r) ? r : []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (employees.length) { if (!allocEmp) setAllocEmp(employees[0].id); if (!reqEmp) setReqEmp(employees[0].id); if (!balEmp) setBalEmp(employees[0].id); }
  }, [employees, allocEmp, reqEmp, balEmp]);
  useEffect(() => { if (types.length) { if (!allocType) setAllocType(types[0].leave_type_name); if (!reqType) setReqType(types[0].leave_type_name); } }, [types, allocType, reqType]);

  const loadBalances = useCallback(async () => {
    if (!balEmp) return;
    try { setBalances(await api.get<LeaveBalance[]>(`/api/hrms/leave-balances?employeeId=${balEmp}`)); }
    catch (e) { toast.error(errMsg(e)); }
  }, [balEmp]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);

  const addType = async () => {
    if (!typeName.trim()) { toast.error("Leave type name required"); return; }
    try {
      await api.post("/api/hrms/leave-types", { leaveTypeName: typeName.trim(), annualAllocation: Number(typeAlloc) || 0, isLwp: typeLwp });
      toast.success("Leave type saved"); setTypeName(""); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const allocate = async () => {
    try {
      await api.post("/api/hrms/leave-allocations", {
        employeeId: allocEmp, leaveType: allocType, newLeavesAllocated: Number(allocDays) || 0,
        fromDate: `${currentMonth()}-01`, toDate: `${new Date().getFullYear()}-12-31`,
      });
      toast.success("Leave allocated (+ledger)"); await loadBalances();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const apply = async () => {
    try {
      await api.post("/api/hrms/leave", { employeeId: reqEmp, leaveType: reqType, fromDate: reqFrom, toDate: reqTo, halfDay: reqHalf });
      toast.success("Leave applied"); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const decide = async (id: string, approve: boolean) => {
    try {
      await api.post(`/api/hrms/leave/${id}/decide`, { approve });
      toast.success(approve ? "Approved (−ledger posted)" : "Rejected"); await load(); await loadBalances();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${cardCls} p-4 space-y-3`}>
            <h3 className="text-sm font-semibold">Leave type</h3>
            <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="e.g. Casual Leave" className={inputCls} />
            <div className="flex gap-2">
              <input value={typeAlloc} onChange={(e) => setTypeAlloc(e.target.value)} type="number" placeholder="Annual days" className={inputCls} />
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap"><input type="checkbox" checked={typeLwp} onChange={(e) => setTypeLwp(e.target.checked)} /> LWP (unpaid)</label>
            </div>
            <button type="button" onClick={addType} className={btnPrimary}><Plus size={14} /> Save type</button>
          </div>

          <div className={`${cardCls} p-4 space-y-3`}>
            <h3 className="text-sm font-semibold">Allocate leave (+ledger)</h3>
            <select value={allocEmp} onChange={(e) => setAllocEmp(e.target.value)} className={inputCls}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <select value={allocType} onChange={(e) => setAllocType(e.target.value)} className={inputCls}>{types.map((t) => <option key={t.id} value={t.leave_type_name}>{t.leave_type_name}</option>)}</select>
            <input value={allocDays} onChange={(e) => setAllocDays(e.target.value)} type="number" placeholder="Days" className={inputCls} />
            <button type="button" onClick={allocate} className={btnPrimary}><Plus size={14} /> Allocate</button>
          </div>

          <div className={`${cardCls} p-4 space-y-3`}>
            <h3 className="text-sm font-semibold">Apply for leave</h3>
            <select value={reqEmp} onChange={(e) => setReqEmp(e.target.value)} className={inputCls}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <select value={reqType} onChange={(e) => setReqType(e.target.value)} className={inputCls}>{types.map((t) => <option key={t.id} value={t.leave_type_name}>{t.leave_type_name}</option>)}</select>
            <div className="flex gap-2">
              <input type="date" value={reqFrom} onChange={(e) => setReqFrom(e.target.value)} className={inputCls} />
              <input type="date" value={reqTo} onChange={(e) => setReqTo(e.target.value)} className={inputCls} />
            </div>
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={reqHalf} onChange={(e) => setReqHalf(e.target.checked)} /> Half day (−0.5)</label>
            <button type="button" onClick={apply} className={btnPrimary}><Plus size={14} /> Apply</button>
          </div>
        </div>
      )}

      {/* Balances */}
      <div className={`${cardCls} p-4`}>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold">Leave balances (Σ ledger)</h3>
          <select value={balEmp} onChange={(e) => setBalEmp(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-sm">
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        {balances.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No allocations yet.</p> : (
          <div className="flex flex-wrap gap-3">
            {balances.map((b) => (
              <div key={b.leave_type} className="border border-[var(--color-border)] rounded-lg px-4 py-2">
                <div className="text-lg font-bold tabular-nums">{b.balance}</div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{b.leave_type}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Employee</th><th className={thCls}>Type</th><th className={thCls}>From</th><th className={thCls}>To</th>
              <th className={`${thCls} text-right`}>Days</th><th className={thCls}>Status</th>{canWrite && <th className={`${thCls} text-right`}>Decide</th>}
            </tr></thead>
            <tbody>
              {loading ? <SkeletonRows cols={canWrite ? 7 : 6} />
                : requests.length === 0 ? <EmptyRow cols={canWrite ? 7 : 6} text="No leave applications." />
                : requests.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40">
                    <td className="px-3 py-2.5 font-medium">{empName(r.employee_id)}</td>
                    <td className="px-3 py-2.5">{r.leave_type}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.from_date.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.to_date.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.days}</td>
                    <td className="px-3 py-2.5"><LeaveStatusPill status={r.status} /></td>
                    {canWrite && (
                      <td className="px-3 py-2.5 text-right">
                        {r.status === "PENDING" ? (
                          <div className="inline-flex gap-1.5">
                            <button type="button" onClick={() => decide(r.id, true)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-700/40 text-green-300 hover:bg-green-900/20"><CheckCircle2 size={13} /> Approve</button>
                            <button type="button" onClick={() => decide(r.id, false)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-700/40 text-red-300 hover:bg-red-900/20"><XCircle size={13} /> Reject</button>
                          </div>
                        ) : <span className="text-xs text-[var(--color-muted)]">-</span>}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURES TAB - component-row builder + assignment + slip preview
// ─────────────────────────────────────────────────────────────────────────────
interface DraftComponent {
  name: string; type: CompType; amount: string; formula: string; condition: string;
  dependsOnPaymentDays: boolean; statutory: boolean;
}
const blankComponent = (type: CompType): DraftComponent => ({ name: "", type, amount: "", formula: "", condition: "", dependsOnPaymentDays: true, statutory: false });

function StructuresTab({ employees, canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [structures, setStructures] = useState<Structure[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // builder
  const [sName, setSName] = useState("");
  const [applyPf, setApplyPf] = useState(true);
  const [applyEsi, setApplyEsi] = useState(true);
  const [applyPt, setApplyPt] = useState(true);
  const [rows, setRows] = useState<DraftComponent[]>([
    { name: "Basic", type: "earning", amount: "", formula: "base * 0.5", condition: "", dependsOnPaymentDays: true, statutory: false },
    { name: "House Rent Allowance", type: "earning", amount: "", formula: "base * 0.2", condition: "", dependsOnPaymentDays: true, statutory: false },
    { name: "Special Allowance", type: "earning", amount: "", formula: "base * 0.3", condition: "", dependsOnPaymentDays: true, statutory: false },
  ]);

  // assignment
  const [aEmp, setAEmp] = useState("");
  const [aStruct, setAStruct] = useState("");
  const [aBase, setABase] = useState("50000");
  const [aFrom, setAFrom] = useState(`${currentMonth()}-01`);

  // preview
  const [pvEmp, setPvEmp] = useState("");
  const [pvMonth, setPvMonth] = useState(currentMonth());
  const [pv, setPv] = useState<SlipPreview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([api.get<Structure[]>("/api/hrms/structures"), api.get<Assignment[]>("/api/hrms/assignments")]);
      setStructures(Array.isArray(s) ? s : []);
      setAssignments(Array.isArray(a) ? a : []);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => { if (employees.length) { if (!aEmp) setAEmp(employees[0].id); if (!pvEmp) setPvEmp(employees[0].id); } }, [employees, aEmp, pvEmp]);
  useEffect(() => { if (structures.length && !aStruct) setAStruct(structures[0].id); }, [structures, aStruct]);

  const setRow = (i: number, patch: Partial<DraftComponent>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = (type: CompType) => setRows((rs) => [...rs, blankComponent(type)]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const saveStructure = async () => {
    if (!sName.trim()) { toast.error("Structure name required"); return; }
    const components = rows.filter((r) => r.name.trim()).map((r) => ({
      name: r.name.trim(), type: r.type,
      amount: r.amount ? Number(r.amount) : 0,
      formula: r.formula.trim() || undefined, condition: r.condition.trim() || undefined,
      dependsOnPaymentDays: r.dependsOnPaymentDays, statutory: r.statutory,
    }));
    if (!components.length) { toast.error("Add at least one component"); return; }
    try {
      await api.post("/api/hrms/structures", { name: sName.trim(), components, applyPf, applyEsi, applyPt });
      toast.success(`Structure "${sName.trim()}" saved`); setSName(""); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const assign = async () => {
    try {
      await api.post("/api/hrms/assignments", { employeeId: aEmp, structureId: aStruct, base: Number(aBase) || 0, fromDate: aFrom });
      toast.success("Structure assigned"); await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const preview = async () => {
    try { setPv(await api.get<SlipPreview>(`/api/hrms/slip-preview?employeeId=${pvEmp}&month=${pvMonth}`)); }
    catch (e) { toast.error(errMsg(e)); setPv(null); }
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className={`${cardCls} p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={15} /> Build a salary structure</h3>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={applyPf} onChange={(e) => setApplyPf(e.target.checked)} /> PF (12% basic)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={applyEsi} onChange={(e) => setApplyEsi(e.target.checked)} /> ESI (≤₹21k)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={applyPt} onChange={(e) => setApplyPt(e.target.checked)} /> PT slab</label>
            </div>
          </div>
          <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Structure name e.g. Standard 2026" className={inputCls} />
          <p className="text-[11px] text-[var(--color-muted)]">Formulas may use <code className="text-[var(--color-text)]">base</code>, <code className="text-[var(--color-text)]">payment_days</code>, <code className="text-[var(--color-text)]">working_days</code> and other component abbreviations. Arithmetic only - no functions. e.g. <code className="text-[var(--color-text)]">base * 0.5</code></p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Component</th><th className={thCls}>Type</th><th className={thCls}>Amount</th><th className={thCls}>Formula</th><th className={thCls}>Condition</th><th className={`${thCls} text-center`}>Prorate</th><th className={`${thCls} text-center`}>Stat.</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)]">
                    <td className="px-2 py-1.5"><input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="Name" className={inputCls} /></td>
                    <td className="px-2 py-1.5">
                      <select value={r.type} onChange={(e) => setRow(i, { type: e.target.value as CompType })} className={inputCls}>
                        <option value="earning">earning</option><option value="deduction">deduction</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><input value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} type="number" placeholder="0" className={`${inputCls} w-24`} /></td>
                    <td className="px-2 py-1.5"><input value={r.formula} onChange={(e) => setRow(i, { formula: e.target.value })} placeholder="base * 0.5" className={`${inputCls} font-mono text-xs`} /></td>
                    <td className="px-2 py-1.5"><input value={r.condition} onChange={(e) => setRow(i, { condition: e.target.value })} placeholder="base > 10000" className={`${inputCls} font-mono text-xs`} /></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.dependsOnPaymentDays} onChange={(e) => setRow(i, { dependsOnPaymentDays: e.target.checked })} /></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.statutory} onChange={(e) => setRow(i, { statutory: e.target.checked })} /></td>
                    <td className="px-2 py-1.5"><button type="button" onClick={() => delRow(i)} className="text-[var(--color-muted)] hover:text-red-300"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => addRow("earning")} className={btnGhost}><Plus size={14} /> Earning</button>
            <button type="button" onClick={() => addRow("deduction")} className={btnGhost}><Plus size={14} /> Deduction</button>
            <button type="button" onClick={saveStructure} className={`${btnPrimary} ml-auto`}><CheckCircle2 size={14} /> Save structure</button>
          </div>
        </div>
      )}

      {/* Existing structures */}
      <div className={`${cardCls} p-4`}>
        <h3 className="text-sm font-semibold mb-3">Structures</h3>
        {loading ? <p className="text-sm text-[var(--color-muted)]">Loading…</p>
          : structures.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No structures yet.</p>
          : <div className="space-y-2">
              {structures.map((s) => (
                <div key={s.id} className="border border-[var(--color-border)] rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">{s.payroll_frequency} · {s.apply_pf ? "PF " : ""}{s.apply_esi ? "ESI " : ""}{s.apply_pt ? "PT" : ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(s.components || []).map((c, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${c.type === "earning" ? "border-green-700/40 text-green-300" : "border-red-700/40 text-red-300"}`}>
                        {c.name}{c.formula ? ` = ${c.formula}` : c.amount ? ` ₹${c.amount}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>}
      </div>

      {canWrite && (
        <div className={`${cardCls} p-4 space-y-3`}>
          <h3 className="text-sm font-semibold">Assign structure (sets base salary)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select value={aEmp} onChange={(e) => setAEmp(e.target.value)} className={inputCls}>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <select value={aStruct} onChange={(e) => setAStruct(e.target.value)} className={inputCls}>{structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input value={aBase} onChange={(e) => setABase(e.target.value)} type="number" placeholder="Base salary" className={inputCls} />
            <input value={aFrom} onChange={(e) => setAFrom(e.target.value)} type="date" className={inputCls} />
          </div>
          <button type="button" onClick={assign} className={btnPrimary}><Plus size={14} /> Assign</button>
          {assignments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {assignments.map((a) => (
                <span key={a.id} className="text-[11px] px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)]">
                  {a.employee_name} → {a.structure_name} · base {rupee(a.base)} · from {a.from_date.slice(0, 10)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slip preview */}
      <div className={`${cardCls} p-4 space-y-3`}>
        <div className="flex items-end gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Eye size={15} /> Slip preview</h3>
          <select value={pvEmp} onChange={(e) => setPvEmp(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm">{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <input type="month" value={pvMonth} onChange={(e) => setPvMonth(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm" />
          <button type="button" onClick={preview} className={btnGhost}><Eye size={14} /> Preview</button>
        </div>
        {pv && <SlipBreakdown slip={pv} />}
      </div>
    </div>
  );
}

function SlipBreakdown({ slip }: { slip: SlipPreview }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-[var(--color-muted)]">
        <span>Structure: <b className="text-[var(--color-text)]">{slip.structure}</b></span>
        <span>Base: <b className="text-[var(--color-text)]">{rupee(slip.base)}</b></span>
        <span>Working days: <b className="text-[var(--color-text)]">{slip.total_working_days}</b></span>
        <span>LOP: <b className="text-red-300">{slip.lop_days}</b></span>
        <span>Payment days: <b className="text-green-300">{slip.payment_days}</b></span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Earnings</div>
          {slip.earnings.map((e, i) => (
            <div key={i} className="flex justify-between text-sm py-0.5"><span>{e.name}</span><span className="tabular-nums">{rupee(e.amount)}</span></div>
          ))}
          <div className="flex justify-between text-sm font-semibold border-t border-[var(--color-border)] mt-1 pt-1"><span>Gross</span><span className="tabular-nums">{rupee(slip.gross)}</span></div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Deductions</div>
          {slip.deductions.length === 0 ? <div className="text-sm text-[var(--color-muted)]">None</div> : slip.deductions.map((d, i) => (
            <div key={i} className="flex justify-between text-sm py-0.5"><span>{d.name}{d.statutory ? " *" : ""}</span><span className="tabular-nums text-red-300">{rupee(d.amount)}</span></div>
          ))}
          <div className="flex justify-between text-sm font-semibold border-t border-[var(--color-border)] mt-1 pt-1"><span>Total deduction</span><span className="tabular-nums text-red-300">{rupee(slip.total_deduction)}</span></div>
        </div>
      </div>
      <div className="flex justify-between text-base font-bold border-t-2 border-[var(--color-primary)]/40 mt-3 pt-2">
        <span>Net pay</span><span className="tabular-nums text-[var(--color-primary)]">{rupee(slip.net)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL TAB - run a month + see consolidated journal + per-employee payslips
// ─────────────────────────────────────────────────────────────────────────────
function PayrollTab({ canWrite }: { employees: Employee[]; canWrite: boolean }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<PayrollResult | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [slips, setSlips] = useState<Payslip[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get<PayrollRun[]>("/api/hrms/payroll"); setRuns(Array.isArray(r) ? r : []); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const res = await api.post<PayrollResult>("/api/hrms/payroll/run", { month });
      setLast(res);
      toast.success(`Payroll ${month}: ${res.employees} slips · net ${rupee(res.net)}`);
      await load();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setRunning(false); }
  };

  const viewSlips = async (id: string) => {
    if (openRun === id) { setOpenRun(null); return; }
    try { setSlips(await api.get<Payslip[]>(`/api/hrms/payroll/${id}/payslips`)); setOpenRun(id); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className={`${cardCls} p-4 flex items-end gap-3 flex-wrap`}>
          <div><label className={labelCls}>Run month</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} /></div>
          <button type="button" onClick={run} disabled={running} className={btnPrimary}>{running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Run payroll</button>
          <p className="text-[11px] text-[var(--color-muted)] max-w-md">Builds a slip per assigned active employee (attendance-driven LOP proration + PF/ESI/PT statutory), then posts ONE consolidated journal: Dr Salaries / Cr PF Payable · TDS Payable · Staff Deductions · Salaries Payable.</p>
        </div>
      )}

      {last && (
        <div className={`${cardCls} p-4`}>
          <h3 className="text-sm font-semibold mb-2">Last run - {last.run.run_month}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center">
            <Stat label="Employees" value={last.employees} />
            <Stat label="Gross" value={rupee(last.gross)} />
            <Stat label="Deductions" value={rupee(last.total_deduction)} accent="text-red-300" />
            <Stat label="PF" value={rupee(last.breakdown.pf)} />
            <Stat label="TDS+stat" value={rupee(String(Number(last.breakdown.tds) + Number(last.breakdown.esi) + Number(last.breakdown.pt) + Number(last.breakdown.other)))} />
            <Stat label="Net payable" value={rupee(last.net)} accent="text-[var(--color-primary)]" />
          </div>
        </div>
      )}

      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Month</th><th className={`${thCls} text-right`}>Gross</th><th className={`${thCls} text-right`}>Deductions</th><th className={`${thCls} text-right`}>Net</th><th className={thCls}>Journal</th><th></th>
            </tr></thead>
            <tbody>
              {loading ? <SkeletonRows cols={6} />
                : runs.length === 0 ? <EmptyRow cols={6} text="No payroll runs yet." />
                : runs.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40">
                      <td className="px-3 py-2.5 font-medium">{r.run_month}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.gross)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-300">{rupee(r.total_deduction)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{rupee(r.net)}</td>
                      <td className="px-3 py-2.5">{r.voucher_id ? <Pill text="POSTED" cls="bg-green-900/30 text-green-300 border border-green-700/40" /> : "-"}</td>
                      <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => viewSlips(r.id)} className={btnGhost}><FileText size={13} /> {openRun === r.id ? "Hide" : "Payslips"}</button></td>
                    </tr>
                    {openRun === r.id && (
                      <tr><td colSpan={6} className="px-3 py-3 bg-[var(--color-bg)]/30">
                        <div className="space-y-3">
                          {slips.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No payslips.</p> : slips.map((s) => (
                            <PayslipCard key={s.id} slip={s} />
                          ))}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PayslipCard({ slip }: { slip: Payslip }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <span className="font-medium">{slip.employee_name}</span>
        <span className="text-[10px] text-[var(--color-muted)]">working {slip.total_working_days} · LOP {slip.lop_days} · pay days {slip.payment_days}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Earnings</div>
          {(slip.earnings || []).map((e, i) => <div key={i} className="flex justify-between text-sm py-0.5"><span>{e.name}</span><span className="tabular-nums">{rupee(e.amount)}</span></div>)}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] mb-1">Deductions</div>
          {(slip.deductions || []).length === 0 ? <div className="text-sm text-[var(--color-muted)]">None</div> : (slip.deductions || []).map((d, i) => <div key={i} className="flex justify-between text-sm py-0.5"><span>{d.name}{d.statutory ? " *" : ""}</span><span className="tabular-nums text-red-300">{rupee(d.amount)}</span></div>)}
        </div>
      </div>
      <div className="flex justify-between text-sm font-semibold border-t border-[var(--color-border)] mt-2 pt-2">
        <span>Gross {rupee(slip.gross)} − Deductions {rupee(slip.total_deduction)}</span>
        <span className="text-[var(--color-primary)]">Net {rupee(slip.net)}</span>
      </div>
    </div>
  );
}
