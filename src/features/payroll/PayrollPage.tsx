import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useFeatureState } from "@/hooks/useFeatureState";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { exportElementAsPdf as exportPdf } from "@/lib/exporters";
import { Users, Plus, Play, X, CheckCircle2, Clock, ChevronDown, ChevronUp, Banknote, FileText, Download, Building2, FileCheck, AlertTriangle, ShieldCheck, TrendingUp, Wallet, CalendarDays, Receipt, Percent, Briefcase, BarChart3, Sparkles, BookOpen, UsersRound, PiggyBank, Send, Timer, Plane, LogOut, HandCoins, Landmark, Scale, Baby, Target, Calculator, UserMinus, Coins, Umbrella, Sun, ClipboardList, FileSpreadsheet, CalendarClock, Gauge } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PreviewBadge from "@/components/PreviewBadge";
import BulkUpload from "@/components/BulkUpload";
import ExportMenu from "@/components/ExportMenu";

// Roles allowed to write payroll/HRMS data — mirrors the backend hrms WRITE_ROLES gate.
const PAYROLL_WRITE_ROLES = new Set(["super_admin", "owner", "finance_manager"]);

interface Employee {
  id: string; name: string; email?: string; pan?: string;
  bank_account?: string; bank_ifsc?: string;
  gross_salary: number; tds_monthly: number; status: string; joining_date?: string;
}
interface PayrollRun {
  id: string; run_month: number; run_year: number;
  total_gross: number; total_tds: number; total_net: number;
  status: string; disbursed_at?: string; created_at: string;
  breakdown?: { employee_id: string; name: string; gross: number; tds: number; net: number; bank_account?: string; }[];
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Statutory salary engine (local, frontend-only) ─────────────────────────────
// New-regime FY25-26 slabs used for the actual payroll run so TDS reflects the
// ₹75k standard deduction and the 87A rebate, and PF/ESI/PT are deducted inline.
const RUN_NEW_SLABS: [number, number][] = [
  [300000, 0], [700000, 0.05], [1000000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30],
];
function runSlabTax(taxable: number, bands: [number, number][]): number {
  let tax = 0, prev = 0;
  for (const [upTo, rate] of bands) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}
type StatutoryConfig = { basicPct: number; capPf: boolean };
type StatutoryLine = {
  gross: number; basic: number; hra: number; allowances: number;
  pf: number; esi: number; pt: number; tds: number; totalDeductions: number; net: number;
};
// Computes a correct monthly net from a monthly gross + CTC structure.
function computeStatutoryNet(grossMonthly: number, cfg: StatutoryConfig): StatutoryLine {
  const gross = Math.max(0, Math.round(grossMonthly));
  const basic = Math.round(gross * (cfg.basicPct / 100));
  const hra = Math.round(basic * 0.4);                     // HRA = 40% of Basic
  const allowances = Math.max(0, gross - basic - hra);     // special allowance balances the structure
  // PF: 12% of Basic, optionally capped at the ₹15,000 wage ceiling.
  const pfWage = cfg.capPf ? Math.min(basic, 15000) : basic;
  const pf = Math.round(pfWage * 0.12);
  // ESI: 0.75% of gross when gross ≤ ₹21,000.
  const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
  // Professional Tax: simple ~₹200/mo state slab (nil for very low wages).
  const pt = gross >= 15000 ? 200 : (gross > 7500 ? 100 : 0);
  // TDS — new regime FY25-26 with ₹75,000 standard deduction + 87A rebate (≤ ₹7L taxable → nil).
  const annualGross = gross * 12;
  const taxable = Math.max(0, annualGross - 75000);
  let annualTax = runSlabTax(taxable, RUN_NEW_SLABS);
  if (taxable <= 700000) annualTax = 0;                    // 87A rebate
  annualTax = Math.round(annualTax * 1.04);                // + 4% health & education cess
  const tds = Math.round(annualTax / 12);
  const totalDeductions = pf + esi + pt + tds;
  const net = Math.max(0, gross - totalDeductions);
  return { gross, basic, hra, allowances, pf, esi, pt, tds, totalDeductions, net };
}

function AddEmployeeModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", pan: "", bank_account: "", bank_ifsc: "", gross_salary: "", joining_date: "" });
  const [saving, setSaving] = useState(false);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "block text-xs font-medium text-[var(--color-muted)] mb-1";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.gross_salary) { toast.error("Name and gross salary required"); return; }
    setSaving(true);
    try {
      await api.post("/api/payroll/employees", { ...form, gross_salary: parseFloat(form.gross_salary) });
      toast.success("Employee added");
      onAdded(); onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add employee");
    } finally { setSaving(false); }
  };

  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Add Employee</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Full name *</label>
              <input value={form.name} onChange={e => f("name", e.target.value)} required className={inp} placeholder="Ananya Sharma" />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input type="email" value={form.email} onChange={e => f("email", e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>PAN</label>
              <input value={form.pan} onChange={e => f("pan", e.target.value.toUpperCase())} className={inp} placeholder="ABCDE1234F" maxLength={10} />
            </div>
            <div>
              <label className={lbl}>Gross salary / month *</label>
              <input type="number" min="0" value={form.gross_salary} onChange={e => f("gross_salary", e.target.value)} required className={inp} placeholder="50000" />
            </div>
            <div>
              <label className={lbl}>Joining date</label>
              <input type="date" value={form.joining_date} onChange={e => f("joining_date", e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Bank account</label>
              <input value={form.bank_account} onChange={e => f("bank_account", e.target.value)} className={inp} placeholder="Account number" />
            </div>
            <div>
              <label className={lbl}>IFSC</label>
              <input value={form.bank_ifsc} onChange={e => f("bank_ifsc", e.target.value.toUpperCase())} className={inp} placeholder="HDFC0001234" maxLength={11} />
            </div>
          </div>
          {form.gross_salary && (
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2">
              Estimated monthly TDS: <strong className="text-[var(--color-text)]">
                {formatCurrency((() => {
                  try {
                    // Route through the single statutory engine (₹75k std deduction
                    // + 87A rebate) so the preview matches the run / slip / Form 16.
                    return computeStatutoryNet(parseFloat(form.gross_salary) || 0, { basicPct: 50, capPf: true }).tds;
                  } catch { return 0; }
                })())}
              </strong> (new tax regime)
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? "Saving…" : "Add Employee"}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PayrollPage() {
  const now = new Date();
  const { store, currentRole } = useApp();
  const canWrite = PAYROLL_WRITE_ROLES.has(currentRole);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns]           = useState<PayrollRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [expandRun, setExpandRun] = useState<string | null>(null);
  const [running, setRunning]     = useState(false);
  const [tab, setTab]             = useState<"employees" | "runs" | "ewa" | "slips" | "form16" | "ecr" | "labor" | "fnf" | "variance" | "pt" | "flexi" | "lwf" | "offer" | "esop" | "ctc" | "attendance" | "gratuity" | "reimburse" | "tds192" | "bonus" | "contractor" | "benchmark" | "appraisal" | "journal" | "headcount" | "liability" | "portal" | "overtime" | "leave-encash" | "notice" | "advance" | "nps" | "minwage" | "maternity" | "roi" | "takehome" | "attrition-cost" | "incentive" | "superann" | "gpa" | "pf-challan" | "register" | "penalty" | "lwp">("employees");
  const [slipEmp, setSlipEmp]     = useState<Employee | null>(null);
  const [slipMonth, setSlipMonth] = useState(now.getMonth() + 1);
  const [slipYear, setSlipYear]   = useState(now.getFullYear());
  const slipRef = useRef<HTMLDivElement>(null);
  const [slipFY, setSlipFY]       = useState<number>(() => { const y = new Date().getFullYear(); return new Date().getMonth() >= 3 ? y : y - 1; });
  const [ewaData, setEwaData]     = useState<{ day_of_month: number; employees: { id: string; name: string; gross_salary: number; earned_to_date: number; max_advance: number; advances_taken: number }[] } | null>(null);
  const [ewaLoading, setEwaLoading] = useState(false);
  const [requesting, setRequesting] = useState<Record<string, boolean>>({});

  const [runMonth] = useState(now.getMonth() + 1);
  const [runYear]  = useState(now.getFullYear());

  // CTC structure used by the actual payroll run to deduct PF/ESI/PT/TDS correctly.
  const [basicPct, setBasicPct] = useState(50);   // Basic defaults to 50% of gross
  const [capPf, setCapPf]       = useState(true);  // cap PF at the ₹15,000 wage ceiling
  const statCfg = useMemo<StatutoryConfig>(() => ({ basicPct, capPf }), [basicPct, capPf]);

  const load = useCallback(async () => {
    setLoading(true);
    const [emps, payRuns] = await Promise.allSettled([
      api.get<Employee[]>("/api/payroll/employees"),
      api.get<PayrollRun[]>("/api/payroll/runs"),
    ]);
    if (emps.status === "fulfilled") setEmployees(emps.value);
    if (payRuns.status === "fulfilled") setRuns(payRuns.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEwa = async () => {
    setEwaLoading(true);
    try {
      const d = await api.get<typeof ewaData>("/api/ewa");
      setEwaData(d);
    } catch { /* ok */ } finally { setEwaLoading(false); }
  };

  useEffect(() => { if (tab === "ewa") loadEwa(); }, [tab]);

  const requestAdvance = async (empId: string, empName: string, amount: number) => {
    setRequesting(r => ({ ...r, [empId]: true }));
    try {
      await api.post("/api/ewa/request", { employee_id: empId, amount });
      toast.success(`Advance of ${formatCurrency(amount)} approved for ${empName}`);
      loadEwa();
    } catch {
      toast.error("Could not request advance");
    } finally { setRequesting(r => ({ ...r, [empId]: false })); }
  };

  const runPayroll = async () => {
    setRunning(true);
    try {
      const run = await api.post<PayrollRun>("/api/payroll/run", { run_month: runMonth, run_year: runYear });
      setRuns(prev => [run, ...prev.filter(r => !(r.run_month === run.run_month && r.run_year === run.run_year))]);
      toast.success(`Payroll for ${MONTH_NAMES[runMonth - 1]} ${runYear} computed — ${formatCurrency(run.total_net)} net`);
      setTab("runs");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to run payroll");
    } finally { setRunning(false); }
  };

  const disburse = async (runId: string) => {
    try {
      await api.post(`/api/payroll/runs/${runId}/disburse`, {});
      toast.success("Payroll marked as disbursed");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to disburse");
    }
  };

  const totalMonthly = employees.filter(e => e.status === "active").reduce((s, e) => s + parseFloat(String(e.gross_salary)), 0);
  const totalTds     = employees.filter(e => e.status === "active").reduce((s, e) => s + parseFloat(String(e.tds_monthly)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Payroll</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">TDS auto-computed · first-class forecast outflow</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] font-medium px-3 py-2 rounded-lg hover:border-[var(--color-primary)]/40">
            <Plus size={12} /> Add Employee
          </button>
          <BulkUpload
            title="Bulk upload employees"
            templateName="employees-template"
            label="Bulk upload"
            canWrite={canWrite}
            onDone={load}
            endpoint="/api/hrms/employees/bulk"
            columns={[
              { key: "name", label: "Name", example: "Ananya Sharma", required: true },
              { key: "email", label: "Email", example: "ananya@acme.in" },
              { key: "designation", label: "Designation", example: "Software Engineer" },
              { key: "ctc", label: "CTC (annual)", example: "1200000" },
              { key: "pan", label: "PAN", example: "ABCDE1234F" },
              { key: "pf_no", label: "PF No", example: "MH/12345/0001" },
              { key: "doj", label: "Date of joining", example: "2024-04-01" },
            ]}
            transform={r => ({
              name: r.name,
              email: r.email || null,
              designation: r.designation || null,
              ctc: r.ctc ? Number(r.ctc) : null,
              pan: r.pan || null,
              pf_no: r.pf_no || null,
              dateOfJoining: r.doj || null,
            })}
          />
          <button onClick={runPayroll} disabled={running || employees.length === 0}
            className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            <Play size={12} /> Run {MONTH_NAMES[runMonth - 1]} Payroll
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active employees", value: employees.filter(e => e.status === "active").length.toString(), color: "text-[var(--color-text)]" },
          { label: "Gross monthly",    value: formatCurrency(totalMonthly),                                    color: "text-[var(--color-primary)]" },
          { label: "TDS monthly",      value: formatCurrency(totalTds),                                        color: "text-orange-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit flex-wrap">
        {([["employees", `Employees (${employees.length})`, Users], ["runs", `Payroll runs (${runs.length})`, Play], ["ewa", "EWA", Banknote], ["slips", "Salary Slips", FileText], ["form16", "Form 16", FileCheck], ["ecr", "PF ECR", Download], ["labor", "ESI / Bonus", CheckCircle2], ["fnf", "F&F Settlement", FileText], ["variance", "Variance", Building2], ["pt", "Prof. Tax", ShieldCheck], ["flexi", "Flexi Benefits", Banknote], ["lwf", "LWF", ShieldCheck], ["offer", "Offer Letter", FileText], ["esop", "ESOP Pool", TrendingUp], ["ctc", "CTC Optimizer", Wallet], ["attendance", "Attendance", CalendarDays], ["gratuity", "Gratuity", PiggyBank], ["reimburse", "Reimbursements", Receipt], ["tds192", "TDS u/s 192", Percent], ["bonus", "Bonus Accrual", Sparkles], ["contractor", "Contractor Payouts", Briefcase], ["benchmark", "Salary Benchmark", BarChart3], ["appraisal", "Appraisal Planner", TrendingUp], ["journal", "Payroll Journal", BookOpen], ["headcount", "Headcount Cost", UsersRound], ["liability", "Statutory Liability", ShieldCheck], ["portal", "Payslip Portal", Send], ["overtime", "Overtime & Shift", Timer], ["leave-encash", "Leave Encashment", Plane], ["notice", "Notice Recovery", LogOut], ["advance", "Salary Advance", HandCoins], ["nps", "NPS Optimizer", Landmark], ["minwage", "Min-Wage Check", Scale], ["maternity", "Maternity Benefit", Baby], ["roi", "People ROI", Target], ["takehome", "Take-Home Breakup", Calculator], ["attrition-cost", "Attrition Cost", UserMinus], ["incentive", "Incentive Engine", Coins], ["superann", "Superannuation", Sun], ["gpa", "Group Insurance", Umbrella], ["pf-challan", "PF / ESI Challan", ClipboardList], ["register", "Payroll Register", FileSpreadsheet], ["penalty", "Penalty Predictor", Gauge], ["lwp", "LWP Impact", CalendarClock]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--color-muted)]">Loading…</div>
      ) : tab === "employees" ? (
        employees.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-12 text-center">
            <Users size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No employees yet. Add your first employee to start tracking payroll.</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg">Add Employee</button>
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-muted)]">{employees.length} employee(s)</span>
              <ExportMenu
                size="sm"
                filename="employees"
                title="Employees"
                columns={[
                  { key: "name", label: "Name" },
                  { key: "email", label: "Email" },
                  { key: "gross", label: "Gross Salary" },
                  { key: "tds", label: "TDS / month" },
                  { key: "net", label: "Net Pay" },
                  { key: "status", label: "Status" },
                ]}
                rows={employees.map(e => {
                  const c = computeStatutoryNet(parseFloat(String(e.gross_salary)) || 0, statCfg);
                  return { name: e.name, email: e.email ?? "", gross: c.gross, tds: c.tds, net: c.net, status: e.status };
                })}
              />
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  {["Name", "Email", "Gross Salary", "TDS / month", "Net Pay", "Status"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {employees.map(e => {
                  // Single statutory engine so PF/ESI/PT/TDS/net match the run, slip & Form 16.
                  const calc = computeStatutoryNet(parseFloat(String(e.gross_salary)) || 0, statCfg);
                  return (
                    <tr key={e.id} className="hover:bg-white/2">
                      <td className="px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 inline-flex items-center justify-center text-xs font-bold text-[var(--color-primary)] mr-2">{e.name[0].toUpperCase()}</div>
                        {e.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{e.email ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{formatCurrency(parseFloat(String(e.gross_salary)))}</td>
                      <td className="px-4 py-3 tabular-nums text-orange-400">{formatCurrency(calc.tds)}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{formatCurrency(calc.net)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${e.status === "active" ? "bg-green-900/20 text-green-400 border-green-800/30" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )
      ) : (
        runs.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center text-sm text-[var(--color-muted)]">
            No payroll runs yet. Click "Run Payroll" to process this month.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Payroll runs toolbar — export the consolidated run summary on screen */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--color-muted)]">{runs.length} payroll run(s)</span>
              <ExportMenu
                size="sm"
                filename="payroll-runs"
                title="Payroll runs"
                columns={[
                  { key: "period", label: "Period" },
                  { key: "status", label: "Status" },
                  { key: "gross", label: "Gross" },
                  { key: "pf", label: "PF" },
                  { key: "esi", label: "ESI" },
                  { key: "pt", label: "PT" },
                  { key: "tds", label: "TDS" },
                  { key: "net", label: "Net" },
                ]}
                rows={runs.map(run => {
                  const lines = (run.breakdown ?? []).map(b => computeStatutoryNet(Number(b.gross), statCfg));
                  const s = lines.reduce((a, c) => ({
                    gross: a.gross + c.gross, pf: a.pf + c.pf, esi: a.esi + c.esi,
                    pt: a.pt + c.pt, tds: a.tds + c.tds, net: a.net + c.net,
                  }), { gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, net: 0 });
                  const has = lines.length > 0;
                  return {
                    period: `${MONTH_NAMES[run.run_month - 1]} ${run.run_year}`,
                    status: run.status,
                    gross: has ? s.gross : run.total_gross,
                    pf: s.pf, esi: s.esi, pt: s.pt,
                    tds: has ? s.tds : run.total_tds,
                    net: has ? s.net : run.total_net,
                  };
                })}
              />
            </div>
            {/* CTC structure controls — drive the statutory deductions inside every run */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <span className="font-semibold flex items-center gap-1.5"><Calculator size={12} /> CTC structure</span>
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--color-muted)]">Basic % of gross</span>
                <input type="number" min={20} max={60} value={basicPct}
                  onChange={e => setBasicPct(Math.min(60, Math.max(20, Number(e.target.value) || 0)))}
                  className="w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 outline-none focus:border-[var(--color-primary)] tabular-nums" />
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={capPf} onChange={e => setCapPf(e.target.checked)} />
                <span className="text-[var(--color-muted)]">Cap PF at ₹15,000 wage ceiling</span>
              </label>
              <span className="text-[10px] text-[var(--color-muted)]">PF 12% of Basic · ESI 0.75% if gross ≤ ₹21k · PT ~₹200 · TDS new regime w/ ₹75k std deduction + 87A rebate</span>
            </div>
            {runs.map(run => {
              const expanded = expandRun === run.id;
              // Recompute the run from the per-employee gross using the CTC structure so
              // PF/ESI/PT and a correct (std-deduction + 87A) TDS are deducted inline.
              const lines = (run.breakdown ?? []).map(b => ({ b, calc: computeStatutoryNet(Number(b.gross), statCfg) }));
              const sum = lines.reduce((a, { calc }) => ({
                gross: a.gross + calc.gross, pf: a.pf + calc.pf, esi: a.esi + calc.esi,
                pt: a.pt + calc.pt, tds: a.tds + calc.tds, net: a.net + calc.net,
              }), { gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, net: 0 });
              const hasLines = lines.length > 0;
              const exportRun = () => {
                try {
                  const rows: (string | number)[][] = [["Employee", "Gross", "Basic", "HRA", "Allowances", "PF", "ESI", "PT", "TDS", "Net"]];
                  lines.forEach(({ b, calc }) => rows.push([b.name, calc.gross, calc.basic, calc.hra, calc.allowances, calc.pf, calc.esi, calc.pt, calc.tds, calc.net]));
                  rows.push(["TOTAL", sum.gross, "", "", "", sum.pf, sum.esi, sum.pt, sum.tds, sum.net]);
                  downloadCsvRows(rows, `payroll-${MONTH_NAMES[run.run_month - 1]}-${run.run_year}.csv`);
                  toast.success("Run exported");
                } catch (err) { toast.error(err instanceof Error ? err.message : "Export failed"); }
              };
              return (
                <div key={run.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{MONTH_NAMES[run.run_month - 1]} {run.run_year}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">
                        {formatCurrency(hasLines ? sum.gross : run.total_gross)} gross · {formatCurrency(hasLines ? (sum.pf + sum.esi + sum.pt + sum.tds) : run.total_tds)} deductions ·{" "}
                        <span className="text-green-400 font-semibold">{formatCurrency(hasLines ? sum.net : run.total_net)} net</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${run.status === "disbursed" ? "bg-green-900/20 text-green-400 border-green-800/30" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                        {run.status === "disbursed" ? <><CheckCircle2 size={9} className="inline mr-1" />Disbursed</> : <><Clock size={9} className="inline mr-1" />Draft</>}
                      </span>
                      {run.status === "draft" && (
                        <button onClick={() => disburse(run.id)}
                          className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-2 py-1 rounded hover:opacity-90">
                          Disburse
                        </button>
                      )}
                      {hasLines && (
                        <button onClick={() => setExpandRun(expanded ? null : run.id)}
                          className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && hasLines && (
                    <div className="mt-3 border-t border-[var(--color-border)] pt-3 space-y-2">
                      <div className="flex justify-end">
                        <button onClick={exportRun} className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] rounded px-2 py-1">
                          <Download size={10} /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[620px]">
                        <thead>
                          <tr className="text-[var(--color-muted)]">
                            <th className="text-left pb-1.5">Employee</th>
                            <th className="text-right pb-1.5">Gross</th>
                            <th className="text-right pb-1.5">PF</th>
                            <th className="text-right pb-1.5">ESI</th>
                            <th className="text-right pb-1.5">PT</th>
                            <th className="text-right pb-1.5">TDS</th>
                            <th className="text-right pb-1.5">Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {lines.map(({ b, calc }) => (
                            <tr key={b.employee_id} title={`Basic ${formatCurrency(calc.basic)} · HRA ${formatCurrency(calc.hra)} · Allowances ${formatCurrency(calc.allowances)}`}>
                              <td className="py-1">{b.name}</td>
                              <td className="py-1 text-right tabular-nums">{formatCurrency(calc.gross)}</td>
                              <td className="py-1 text-right tabular-nums text-red-400">{calc.pf ? formatCurrency(calc.pf) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-red-400">{calc.esi ? formatCurrency(calc.esi) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-red-400">{calc.pt ? formatCurrency(calc.pt) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-orange-400">{calc.tds ? formatCurrency(calc.tds) : "—"}</td>
                              <td className="py-1 text-right tabular-nums text-green-400 font-semibold">{formatCurrency(calc.net)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-[var(--color-border)] font-semibold">
                            <td className="py-1.5">Total ({lines.length})</td>
                            <td className="py-1.5 text-right tabular-nums">{formatCurrency(sum.gross)}</td>
                            <td className="py-1.5 text-right tabular-nums text-red-400">{formatCurrency(sum.pf)}</td>
                            <td className="py-1.5 text-right tabular-nums text-red-400">{formatCurrency(sum.esi)}</td>
                            <td className="py-1.5 text-right tabular-nums text-red-400">{formatCurrency(sum.pt)}</td>
                            <td className="py-1.5 text-right tabular-nums text-orange-400">{formatCurrency(sum.tds)}</td>
                            <td className="py-1.5 text-right tabular-nums text-green-400">{formatCurrency(sum.net)}</td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                      <p className="text-[10px] text-[var(--color-muted)]">Hover a row for the Basic / HRA / allowance split. Deductions computed live from this CTC structure; the bank payout itself is production-pending.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "ewa" && (
        ewaLoading ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted)]">Loading…</div>
        ) : !ewaData || ewaData.employees.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
            <Banknote size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No active employees. Add employees to enable Earned Wage Access.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-blue-300 mb-0.5 flex items-center gap-2">Earned Wage Access · Day {ewaData.day_of_month} of month <PreviewBadge capability="ewaPayout" /></p>
              <p className="text-xs text-[var(--color-muted)]">Employees can access up to 50% of wages earned so far this month. Deducted from next salary.</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>
                    {["Employee", "Gross Salary", "Earned To Date", "Max Advance", "Action"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {ewaData.employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-white/2">
                      <td className="px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 inline-flex items-center justify-center text-xs font-bold text-[var(--color-primary)] mr-2">{emp.name[0].toUpperCase()}</div>
                        {emp.name}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(emp.gross_salary)}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{formatCurrency(emp.earned_to_date)}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(emp.max_advance)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => requestAdvance(emp.id, emp.name, emp.max_advance)}
                          disabled={requesting[emp.id] || emp.max_advance === 0}
                          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">
                          <Banknote size={11} /> {requesting[emp.id] ? "Requesting…" : "Request Advance"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Salary Slips tab */}
      {tab === "slips" && (() => {
        const emp = slipEmp ?? (employees[0] ?? null);
        if (!emp) return (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
            <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">Add employees first to generate salary slips.</p>
          </div>
        );

        // Single statutory engine so the slip's PF/ESI/PT/TDS/net match the
        // Employees tab, the run, and Form 16 (incl. ESI + capped PF + ₹75k std deduction).
        const slipCalc  = computeStatutoryNet(parseFloat(String(emp.gross_salary)) || 0, statCfg);
        const gross     = slipCalc.gross;
        const basic     = slipCalc.basic;
        const hra       = slipCalc.hra;
        const special   = slipCalc.allowances;
        const pf        = slipCalc.pf;
        const esi       = slipCalc.esi;
        const profTax   = slipCalc.pt;
        const tds       = slipCalc.tds;
        const totalDeductions = slipCalc.totalDeductions;
        const net       = slipCalc.net;
        const monthName = MONTH_NAMES[slipMonth - 1];

        return (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={emp?.id} onChange={e => setSlipEmp(employees.find(em => em.id === e.target.value) ?? null)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {employees.map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
              </select>
              <select value={slipMonth} onChange={e => setSlipMonth(parseInt(e.target.value))}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={slipYear} onChange={e => setSlipYear(parseInt(e.target.value) || slipYear)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none w-20" />
              <button
                onClick={async () => {
                  if (slipRef.current) {
                    await exportPdf(slipRef.current, `salary-slip-${emp.name}-${monthName}-${slipYear}`);
                  } else {
                    toast.error("Could not render slip");
                  }
                }}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
                <Download size={12} /> Download PDF
              </button>
            </div>

            {/* Salary slip preview */}
            <div ref={slipRef} className="bg-white text-gray-900 rounded-lg border border-gray-200 p-6 max-w-2xl text-xs font-mono">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
                <div>
                  <p className="text-base font-bold text-gray-900 font-sans">SALARY SLIP</p>
                  <p className="text-gray-600 font-sans">For the month of {monthName} {slipYear}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 font-sans">Headroom Business</p>
                  <p className="text-gray-600">payroll@headroom.in</p>
                </div>
              </div>

              {/* Employee details */}
              <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200">
                <div>
                  <p className="text-gray-500 mb-0.5">Employee Name</p>
                  <p className="font-semibold">{emp.name}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-0.5">PAN</p>
                  <p className="font-semibold">{emp.pan || "XXXXX0000X"}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-0.5">Bank Account</p>
                  <p className="font-semibold">{emp.bank_account ? "****" + emp.bank_account.slice(-4) : "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-0.5">Pay Date</p>
                  <p className="font-semibold">28 {monthName} {slipYear}</p>
                </div>
              </div>

              {/* Earnings + Deductions */}
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <p className="font-bold text-gray-700 mb-2 font-sans">EARNINGS</p>
                  <table className="w-full">
                    <tbody>
                      {[
                        ["Basic Salary",          basic],
                        ["House Rent Allowance",  hra],
                        ["Special Allowance",     special],
                      ].map(([label, val]) => (
                        <tr key={label as string} className="border-b border-gray-100">
                          <td className="py-1 text-gray-600">{label as string}</td>
                          <td className="py-1 text-right font-semibold">₹{(val as number).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="pt-2">Gross Earnings</td>
                        <td className="pt-2 text-right">₹{gross.toLocaleString("en-IN")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="font-bold text-gray-700 mb-2 font-sans">DEDUCTIONS</p>
                  <table className="w-full">
                    <tbody>
                      {[
                        ["Provident Fund (12%)", pf],
                        ["ESI (0.75%)",          esi],
                        ["Professional Tax",    profTax],
                        ["TDS (Income Tax)",    tds],
                      ].map(([label, val]) => (
                        <tr key={label as string} className="border-b border-gray-100">
                          <td className="py-1 text-gray-600">{label as string}</td>
                          <td className="py-1 text-right text-red-600 font-semibold">₹{(val as number).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="pt-2">Total Deductions</td>
                        <td className="pt-2 text-right text-red-700">₹{totalDeductions.toLocaleString("en-IN")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net pay */}
              <div className="bg-gray-50 border border-gray-200 rounded p-3 flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-[10px]">NET PAY (take-home)</p>
                  <p className="text-xl font-bold text-green-700 font-sans">₹{net.toLocaleString("en-IN")}</p>
                </div>
                <div className="text-right text-[10px] text-gray-500">
                  <p>Amount in words:</p>
                  <p className="italic">{net.toLocaleString("en-IN")} Rupees only</p>
                </div>
              </div>

              <p className="text-gray-400 text-[9px] mt-3 text-center">This is a computer-generated salary slip. No signature required. · Generated by Headroom</p>
            </div>
          </div>
        );
      })()}

      {tab === "form16" && (() => {
        const emp = slipEmp ?? (employees[0] ?? null);
        if (!emp) return (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center">
            <FileCheck size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">Add employees first to generate Form 16.</p>
          </div>
        );

        const gross = parseFloat(String(emp.gross_salary));
        const annualGross = gross * 12;
        const standardDeduction = 75000;
        const netTaxable = Math.max(0, annualGross - standardDeduction);

        // New regime tax slabs FY25 onwards
        let slabTax = 0;
        const slabs: [number, number, number][] = [
          [0, 300000, 0],
          [300000, 700000, 0.05],
          [700000, 1000000, 0.10],
          [1000000, 1200000, 0.15],
          [1200000, 1500000, 0.20],
          [1500000, Infinity, 0.30],
        ];
        let remaining = netTaxable;
        for (const [low, high, rate] of slabs) {
          if (remaining <= 0) break;
          const taxable = Math.min(remaining, high - low);
          slabTax += taxable * rate;
          remaining -= taxable;
        }
        const cess = Math.round(slabTax * 0.04);
        const annualTDS = Math.round(slabTax + cess);
        const monthlyTDS = Math.round(annualTDS / 12);

        const fyLabel = `FY ${slipFY}-${String(slipFY + 1).slice(2)}`;

        const handleDownloadCSV = () => {
          const rows = [
            ["Form 16 Summary", fyLabel],
            [],
            ["Part A – TDS Summary"],
            ["Employer Name", "Headroom Business"],
            ["Employee Name", emp.name],
            ["PAN", emp.pan || "XXXXX0000X"],
            ["TAN", "MUMB00000A"],
            ["Total TDS Deducted (Annual)", annualTDS],
            ["Monthly TDS", monthlyTDS],
            [],
            ["Part B – Income Details"],
            ["Annual Gross Salary", annualGross],
            ["Standard Deduction", standardDeduction],
            ["Net Taxable Income", netTaxable],
            ["Income Tax (slab)", Math.round(slabTax)],
            ["Health & Education Cess (4%)", cess],
            ["Net Tax Payable", annualTDS],
          ];
          const csv = rows.map(r => r.join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Form16_${emp.name.replace(/\s+/g, "_")}_${fyLabel.replace(/\s+/g, "_")}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        };

        return (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={emp?.id} onChange={e => setSlipEmp(employees.find(em => em.id === e.target.value) ?? null)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {employees.map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
              </select>
              <select value={slipFY} onChange={e => setSlipFY(parseInt(e.target.value))}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}</option>
                ))}
              </select>
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
                <Download size={12} /> Download CSV
              </button>
            </div>

            {/* Form 16 card */}
            <div className="bg-white text-gray-900 rounded-lg border border-gray-200 p-6 max-w-2xl text-xs font-mono">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
                <div>
                  <p className="text-base font-bold text-gray-900 font-sans">FORM 16</p>
                  <p className="text-gray-600 font-sans">Certificate of Tax Deducted at Source · {fyLabel}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 font-sans">Headroom Business</p>
                  <p className="text-gray-600">payroll@headroom.in</p>
                </div>
              </div>

              {/* Part A */}
              <p className="font-bold text-gray-700 mb-2 font-sans text-sm">Part A — TDS Summary</p>
              <table className="w-full mb-4">
                <tbody>
                  {[
                    ["Employer Name", "Headroom Business"],
                    ["Employee Name", emp.name],
                    ["PAN of Employee", emp.pan || "XXXXX0000X"],
                    ["TAN of Employer", "MUMB00000A"],
                    ["Total TDS Deducted (Annual)", `₹${annualTDS.toLocaleString("en-IN")}`],
                    ["Monthly TDS", `₹${monthlyTDS.toLocaleString("en-IN")}`],
                  ].map(([label, val]) => (
                    <tr key={label} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-500 w-1/2">{label}</td>
                      <td className="py-1.5 font-semibold text-right">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Part B */}
              <p className="font-bold text-gray-700 mb-2 font-sans text-sm">Part B — Income Details (New Regime)</p>
              <table className="w-full mb-4">
                <tbody>
                  {[
                    ["Annual Gross Salary", annualGross],
                    ["Less: Standard Deduction", standardDeduction],
                    ["Net Taxable Income", netTaxable],
                    ["Income Tax on Slab", Math.round(slabTax)],
                    ["Health & Education Cess (4%)", cess],
                    ["Net Tax Payable", annualTDS],
                  ].map(([label, val]) => (
                    <tr key={label as string} className={`border-b border-gray-100 ${label === "Net Tax Payable" ? "font-bold" : ""}`}>
                      <td className="py-1.5 text-gray-500 w-1/2">{label as string}</td>
                      <td className={`py-1.5 text-right font-semibold ${label === "Net Tax Payable" ? "text-blue-700" : ""}`}>₹{(val as number).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-gray-400 text-[9px] mt-3 text-center">This is a system-generated Form 16 summary. File with your CA for ITR filing. · Generated by Headroom</p>
            </div>
          </div>
        );
      })()}

      {tab === "ecr" && (() => {
        const activeEmps = employees.filter(e => e.status === "active");
        if (activeEmps.length === 0) return (
          <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
            <Download size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">Add active employees to generate PF ECR file.</p>
          </div>
        );

        const ecrRows = activeEmps.map((e, i) => {
          const gross   = parseFloat(String(e.gross_salary));
          const pfWages = Math.min(gross, 15000);
          const empEpf  = Math.round(pfWages * 0.12);
          const empEps  = Math.min(Math.round(pfWages * 0.0833), 1250);
          const empEpfDiff = Math.round(pfWages * 0.12) - empEps;
          const uan     = `10000000000${String(i + 1).padStart(2, "0")}`;
          return { name: e.name, gross, pfWages, empEpf, empEps, empEpfDiff, uan, totalContrib: empEpf + empEpfDiff + empEps };
        });

        const totals = ecrRows.reduce((acc, r) => ({
          gross:    acc.gross    + r.gross,
          pfWages:  acc.pfWages  + r.pfWages,
          empEpf:   acc.empEpf   + r.empEpf,
          empEps:   acc.empEps   + r.empEps,
          empEpfDiff: acc.empEpfDiff + r.empEpfDiff,
          total:    acc.total    + r.totalContrib,
        }), { gross: 0, pfWages: 0, empEpf: 0, empEps: 0, empEpfDiff: 0, total: 0 });

        const downloadECR = () => {
          const header = "UAN,Member Name,Gross Wages,EPF Wages,EPS Wages,ECR Wages,NCP Days,Refund of Advances,EE EPF Contribution,ER EPF Contribution,ER EPS Contribution";
          const rows = ecrRows.map(r =>
            `${r.uan},${r.name},${Math.round(r.gross)},${Math.round(r.pfWages)},${Math.round(r.pfWages)},${Math.round(r.pfWages)},0,0,${r.empEpf},${r.empEpfDiff},${r.empEps}`
          );
          const csv = [header, ...rows].join("\n");
          const blob = new Blob([csv], { type: "text/plain" });
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement("a");
          a.href = url;
          a.download = `PF_ECR_${format(new Date(), "MMM_yyyy")}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        };

        const monthLabel = format(new Date(), "MMMM yyyy");
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">PF ECR — {monthLabel}</h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Electronic Challan-cum-Return for EPFO. PF wages capped at ₹15,000 as per statutory limit.</p>
              </div>
              <button onClick={downloadECR}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
                <Download size={12} /> Download ECR (.txt)
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Members",          value: activeEmps.length.toString(),          color: "text-[var(--color-text)]" },
                { label: "Total PF Wages",   value: formatCurrency(totals.pfWages),        color: "text-blue-400" },
                { label: "Employee EPF",      value: formatCurrency(totals.empEpf),         color: "text-orange-400" },
                { label: "Total Remittance",  value: formatCurrency(totals.total),          color: "text-[var(--color-primary)]" },
              ].map(c => (
                <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                  <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["UAN", "Name", "Gross", "PF Wages", "EE EPF (12%)", "ER EPF", "ER EPS (8.33%)", "Total"].map(h => (
                      <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ecrRows.map(r => (
                    <tr key={r.uan} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                      <td className="px-3 py-2.5 font-mono text-[var(--color-muted)]">{r.uan}</td>
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatCurrency(r.gross)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-blue-400">{formatCurrency(r.pfWages)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.empEpf)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-purple-400">{formatCurrency(r.empEpfDiff)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-green-400">{formatCurrency(r.empEps)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(r.totalContrib)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-accent)]/30">
                  <tr>
                    <td className="px-3 py-2.5 font-bold text-xs" colSpan={2}>Total ({activeEmps.length} members)</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{formatCurrency(totals.gross)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-blue-400">{formatCurrency(totals.pfWages)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-orange-400">{formatCurrency(totals.empEpf)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-purple-400">{formatCurrency(totals.empEpfDiff)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(totals.empEps)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold text-[var(--color-primary)]">{formatCurrency(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg px-4 py-3 text-[11px] text-[var(--color-muted)]">
              UAN numbers shown are placeholders — replace with actual UANs from the EPFO unified portal before filing. Deposit ECR on the EPFO portal by the 15th of the following month.
            </div>
          </div>
        );
      })()}

      {tab === "labor" && (() => {
        const activeEmps = employees.filter(e => e.status === "active");
        // ESI: employees earning ≤ ₹21,000/month
        const ESI_LIMIT = 21000;
        const esiEligible = activeEmps.filter(e => parseFloat(String(e.gross_salary)) <= ESI_LIMIT);
        const esiRows = esiEligible.map(e => {
          const gross = parseFloat(String(e.gross_salary));
          const empEsi = Math.round(gross * 0.0075);
          const erEsi  = Math.round(gross * 0.0325);
          return { name: e.name, gross, empEsi, erEsi, total: empEsi + erEsi };
        });
        const esiTotals = esiRows.reduce((a, r) => ({ emp: a.emp + r.empEsi, er: a.er + r.erEsi, total: a.total + r.total }), { emp: 0, er: 0, total: 0 });

        // Bonus Act: employees earning ≤ ₹21,000/month
        const BONUS_WAGE_CEILING = 7000; // calculation ceiling
        const bonusRows = activeEmps.filter(e => parseFloat(String(e.gross_salary)) <= 21000).map(e => {
          const gross    = parseFloat(String(e.gross_salary));
          const calcWage = Math.min(gross, BONUS_WAGE_CEILING);
          const minBonus = Math.round(calcWage * 12 * 0.0833);
          const maxBonus = Math.round(calcWage * 12 * 0.20);
          return { name: e.name, gross, calcWage, minBonus, maxBonus };
        });

        // Gratuity: 15/26 × monthly salary × years (assume 1 year for illustration)
        const gratuityRows = activeEmps.map(e => {
          const monthly = parseFloat(String(e.gross_salary));
          const gratuityPerYear = Math.round((15 / 26) * monthly);
          return { name: e.name, monthly, gratuityPerYear, provision5yr: gratuityPerYear * 5 };
        });

        return (
          <div className="space-y-6">
            {/* ESI */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <CheckCircle2 size={13} className="text-green-400" />
                <h3 className="text-sm font-semibold">ESI Contributions</h3>
                <span className="text-xs text-[var(--color-muted)] ml-1">Employee ≤ ₹21,000/month · EE 0.75% + ER 3.25%</span>
                <span className="ml-auto text-xs font-semibold text-green-400">{esiEligible.length} eligible · Total: {formatCurrency(esiTotals.total)}/mo</span>
              </div>
              {esiEligible.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-muted)]">No employees in ESI bracket (all earning &gt; ₹21,000/month).</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Name","Gross","EE ESI (0.75%)","ER ESI (3.25%)","Monthly Total"].map(h => (
                        <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {esiRows.map(r => (
                      <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.gross)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-blue-400">{formatCurrency(r.empEsi)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(r.erEsi)}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-accent)]/30">
                    <tr>
                      <td className="px-4 py-2 font-bold text-xs" colSpan={2}>Total</td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-blue-400">{formatCurrency(esiTotals.emp)}</td>
                      <td className="px-4 py-2 tabular-nums font-semibold text-orange-400">{formatCurrency(esiTotals.er)}</td>
                      <td className="px-4 py-2 tabular-nums font-bold text-[var(--color-primary)]">{formatCurrency(esiTotals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Bonus Act */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <CheckCircle2 size={13} className="text-yellow-400" />
                <h3 className="text-sm font-semibold">Payment of Bonus Act</h3>
                <span className="text-xs text-[var(--color-muted)] ml-1">Min 8.33% · Max 20% · Wage ceiling ₹7,000/month</span>
              </div>
              {bonusRows.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-muted)]">No employees eligible (all earn &gt; ₹21,000/month).</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Name","Gross","Calc. Wage","Min Bonus (8.33%)","Max Bonus (20%)"].map(h => (
                        <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bonusRows.map(r => (
                      <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.gross)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.calcWage)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-400 font-semibold">{formatCurrency(r.minBonus)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{formatCurrency(r.maxBonus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="px-4 py-2.5 text-[10px] text-[var(--color-muted)] border-t border-[var(--color-border)]">Annual bonus — payable to employees who complete ≥30 working days. Allocable surplus must exist. Shown amounts are annual totals.</p>
            </div>

            {/* Gratuity */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                <CheckCircle2 size={13} className="text-purple-400" />
                <h3 className="text-sm font-semibold">Gratuity Provision</h3>
                <span className="text-xs text-[var(--color-muted)] ml-1">15/26 × last drawn salary × years of service</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {["Name","Monthly Salary","Per Year Provision","5-Year Total (₹)"].map(h => (
                      <th key={h} className="text-left font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gratuityRows.map(r => (
                    <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.monthly)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-purple-400 font-semibold">{formatCurrency(r.gratuityPerYear)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(r.provision5yr)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-accent)]/30">
                  <tr>
                    <td className="px-4 py-2 font-bold text-xs" colSpan={2}>Total annual provision</td>
                    <td className="px-4 py-2 tabular-nums font-bold text-purple-400" colSpan={2}>{formatCurrency(gratuityRows.reduce((s, r) => s + r.gratuityPerYear, 0))}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="px-4 py-2.5 text-[10px] text-[var(--color-muted)] border-t border-[var(--color-border)]">Payable on resignation/retirement after ≥5 years of service. Max gratuity: ₹20 lakh. Consider a Group Gratuity scheme for tax-efficient provisioning.</p>
            </div>
          </div>
        );
      })()}

      {tab === "fnf" && <FnFTab employees={employees} />}
      {tab === "variance" && <PayrollVarianceTab />}
      {tab === "pt" && <PtCalculatorTab employees={employees} />}
      {tab === "flexi" && <FlexiBenefitTab employees={employees} />}
      {tab === "lwf" && <LwfCalculatorTab employees={employees} />}
      {tab === "offer" && <OfferLetterTab employees={employees} firmName={store.firm?.name ?? "Your Company"} />}
      {tab === "esop" && <EsopTab employees={employees} />}
      {tab === "ctc" && <CtcOptimizerTab employees={employees} />}
      {tab === "attendance" && <AttendanceRegisterTab employees={employees} />}
      {tab === "gratuity" && <GratuityProvisionTab employees={employees} />}
      {tab === "reimburse" && <ReimbursementTab employees={employees} />}
      {tab === "tds192" && <Tds192ProjectionTab employees={employees} />}
      {tab === "bonus" && <BonusAccrualTab employees={employees} />}
      {tab === "contractor" && <ContractorPayoutTab />}
      {tab === "benchmark" && <SalaryBenchmarkTab employees={employees} />}
      {tab === "appraisal" && <AppraisalPlannerTab employees={employees} />}
      {tab === "journal" && <PayrollJournalTab employees={employees} />}
      {tab === "headcount" && <HeadcountForecastTab employees={employees} />}
      {tab === "liability" && <StatutoryLiabilityTab employees={employees} />}
      {tab === "portal" && <PayslipPortalTab employees={employees} firmName={store.firm?.name ?? "Your Company"} />}
      {tab === "overtime" && <OvertimeShiftTab employees={employees} />}
      {tab === "leave-encash" && <LeaveEncashmentTab employees={employees} />}
      {tab === "notice" && <NoticeRecoveryTab employees={employees} />}
      {tab === "advance" && <SalaryAdvanceTab employees={employees} />}
      {tab === "nps" && <NpsOptimizerTab employees={employees} />}
      {tab === "minwage" && <MinWageCheckTab employees={employees} />}
      {tab === "maternity" && <MaternityBenefitTab employees={employees} />}
      {tab === "roi" && <PeopleRoiTab employees={employees} />}
      {tab === "takehome" && <TakeHomeBreakupTab employees={employees} />}
      {tab === "attrition-cost" && <AttritionCostTab employees={employees} />}
      {tab === "incentive" && <IncentiveEngineTab employees={employees} />}
      {tab === "superann" && <SuperannuationTab employees={employees} />}
      {tab === "gpa" && <GroupInsuranceTab employees={employees} />}
      {tab === "pf-challan" && <PfEsiChallanTab employees={employees} />}
      {tab === "register" && <PayrollRegisterTab employees={employees} />}
      {tab === "penalty" && <PenaltyPredictorTab employees={employees} />}
      {tab === "lwp" && <LwpImpactTab employees={employees} />}

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}

function FnFTab({ employees }: { employees: { id: string; name: string; gross_salary: number; tds_monthly: number; status: string; joining_date?: string }[] }) {
  const [empId,         setEmpId]         = useState(employees[0]?.id ?? "");
  const [lastWorkDay,   setLastWorkDay]   = useState(() => new Date().toISOString().split("T")[0]);
  const [noticePeriod,  setNoticePeriod]  = useState(30);   // days
  const [noticePaid,    setNoticePaid]    = useState(false); // employer waiving notice
  const [leaveDays,     setLeaveDays]     = useState(0);    // earned leave balance
  const [advanceOwed,   setAdvanceOwed]   = useState("");   // salary advance outstanding

  const emp = employees.find(e => e.id === empId);
  const gross  = emp ? parseFloat(String(emp.gross_salary)) : 0;
  const perDay = gross / 26; // 26 working days standard

  const joiningDate     = emp?.joining_date ? new Date(emp.joining_date) : null;
  const lastDay         = new Date(lastWorkDay);
  const yearsOfService  = joiningDate ? Math.max(0, (lastDay.getTime() - joiningDate.getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;

  // Components
  const noticePay       = noticePaid ? 0 : Math.round(perDay * noticePeriod); // if notice not served
  const leaveEncash     = Math.round(perDay * leaveDays);
  const gratuity        = yearsOfService >= 5 ? Math.round((15 / 26) * gross * Math.floor(yearsOfService)) : 0;
  const daysInLastMonth = lastDay.getDate();
  const salaryDue       = Math.round(perDay * daysInLastMonth);
  const advance         = parseFloat(advanceOwed) || 0;
  const grossSettlement = noticePay + leaveEncash + gratuity + salaryDue;
  const netSettlement   = Math.max(0, grossSettlement - advance);

  const downloadFnF = () => {
    const rows = [
      ["Full & Final Settlement", emp?.name ?? ""],
      ["Last Working Day", lastWorkDay],
      ["Years of Service", yearsOfService.toFixed(1)],
      [],
      ["Component","Amount (₹)"],
      ["Salary for last month (proportionate)", salaryDue],
      ["Notice pay (if applicable)", noticePay],
      ["Leave encashment", leaveEncash],
      ["Gratuity", gratuity],
      ["Total Gross Settlement", grossSettlement],
      ["Less: Outstanding advance", advance],
      ["Net Payable", netSettlement],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `FnF_${(emp?.name ?? "employee").replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  if (employees.length === 0) return (
    <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
      <Users size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
      <p className="text-sm text-[var(--color-muted)]">Add employees first to compute F&F settlements.</p>
    </div>
  );

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1">Full & Final Settlement Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Computes all dues payable on separation: proportionate salary, notice pay, earned leave encashment, and gratuity.</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Employee</label>
              <select value={empId} onChange={e => setEmpId(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Last working day</label>
              <input type="date" value={lastWorkDay} onChange={e => setLastWorkDay(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Notice period (days)</label>
              <input type="number" min={0} value={noticePeriod} onChange={e => setNoticePeriod(Number(e.target.value))}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Earned leave balance (days)</label>
              <input type="number" min={0} value={leaveDays} onChange={e => setLeaveDays(Number(e.target.value))}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Outstanding advance / loan (₹)</label>
            <input type="number" min={0} value={advanceOwed} onChange={e => setAdvanceOwed(e.target.value)}
              placeholder="0"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={noticePaid} onChange={e => setNoticePaid(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>Notice period waived by employer (no notice pay deducted)</span>
          </label>
        </div>
      </div>

      {gross > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Settlement Computation — {emp?.name}</h3>
            <button onClick={downloadFnF} className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline">
              <Download size={11} /> Download CSV
            </button>
          </div>
          {joiningDate && (
            <p className="text-xs text-[var(--color-muted)] mb-3">Joining: {joiningDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {yearsOfService.toFixed(1)} years of service</p>
          )}
          <div className="space-y-2">
            {[
              { label: `Salary (${daysInLastMonth} days @ ${formatCurrency(Math.round(perDay))}/day)`, value: salaryDue, color: "text-[var(--color-text)]" },
              { label: `Notice pay (${noticePeriod}d${noticePaid ? " — waived" : ""})`, value: noticePay, color: noticePaid ? "text-[var(--color-muted)]" : "text-blue-400" },
              { label: `Leave encashment (${leaveDays} days)`, value: leaveEncash, color: "text-green-400" },
              { label: `Gratuity${yearsOfService < 5 ? " (min 5 yrs req.)" : ` (${Math.floor(yearsOfService)} yrs)`}`, value: gratuity, color: yearsOfService >= 5 ? "text-purple-400" : "text-[var(--color-muted)]" },
              { label: "Gross Settlement", value: grossSettlement, color: "text-[var(--color-text)] font-bold" },
              { label: "Less: Outstanding advance", value: advance > 0 ? -advance : 0, color: "text-red-400" },
              { label: "Net Payable", value: netSettlement, color: "text-[var(--color-primary)] font-bold text-base" },
            ].map(r => (
              <div key={r.label} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0 ${r.label === "Net Payable" ? "pt-1" : ""}`}>
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{r.value < 0 ? `(${formatCurrency(Math.abs(r.value))})` : formatCurrency(r.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PayrollVarianceTab() {
  const { store } = useApp();

  const monthlyPayroll = useMemo(() => {
    const map: Record<string, number> = {};
    store.transactions
      .filter(t => t.category === "payroll" && t.amount < 0)
      .forEach(t => {
        const key = t.date.slice(0, 7);
        map[key] = (map[key] ?? 0) + Math.abs(t.amount);
      });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, total]) => {
        const d = new Date(key + "-01");
        return { key, label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), total };
      });
  }, [store.transactions]);

  const rows = monthlyPayroll.map((m, i) => {
    const prev = monthlyPayroll[i - 1]?.total ?? null;
    const change = prev !== null ? m.total - prev : null;
    const pct    = prev !== null && prev > 0 ? Math.round(((m.total - prev) / prev) * 100) : null;
    return { ...m, prev, change, pct };
  });

  const avgMonthly = rows.length > 0 ? Math.round(rows.reduce((s,r) => s + r.total, 0) / rows.length) : 0;
  const maxMonth   = rows.reduce((a, r) => r.total > (a?.total ?? 0) ? r : a, rows[0] ?? null);
  const minMonth   = rows.reduce((a, r) => r.total < (a?.total ?? Infinity) ? r : a, rows[0] ?? null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Avg monthly payroll (12m)", value: formatCurrency(avgMonthly),              color: "text-[var(--color-text)]" },
          { label: "Highest month",             value: maxMonth ? `${formatCurrency(maxMonth.total)} (${maxMonth.label})` : "—", color: "text-red-400" },
          { label: "Lowest month",              value: minMonth ? `${formatCurrency(minMonth.total)} (${minMonth.label})` : "—", color: "text-green-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Month-over-Month Payroll Variance</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No payroll transactions found. Tag transactions as "payroll" category to see variance analysis.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Month","Payroll Cost","vs Prior Month","Change %","Trend"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.slice().reverse().map((r, i) => (
                  <tr key={r.key} className={`hover:bg-white/2 ${i === 0 ? "bg-[var(--color-primary)]/5" : ""}`}>
                    <td className="px-4 py-3 font-medium">{r.label}{i === 0 ? <span className="ml-1.5 text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] px-1.5 py-0.5 rounded-full">Latest</span> : ""}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatCurrency(r.total)}</td>
                    <td className={`px-4 py-3 tabular-nums ${r.change !== null ? (r.change > 0 ? "text-red-400" : r.change < 0 ? "text-green-400" : "text-[var(--color-muted)]") : "text-[var(--color-muted)]"}`}>
                      {r.change !== null ? `${r.change >= 0 ? "+" : ""}${formatCurrency(r.change)}` : "—"}
                    </td>
                    <td className={`px-4 py-3 tabular-nums font-semibold ${r.pct !== null ? (r.pct > 5 ? "text-red-400" : r.pct < -5 ? "text-green-400" : "text-[var(--color-muted)]") : "text-[var(--color-muted)]"}`}>
                      {r.pct !== null ? `${r.pct >= 0 ? "+" : ""}${r.pct}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.pct !== null && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                          r.pct > 10  ? "bg-red-900/30 text-red-400 border-red-800/40" :
                          r.pct > 0   ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/40" :
                          r.pct < -5  ? "bg-green-900/30 text-green-400 border-green-800/40" :
                                        "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"
                        }`}>{r.pct > 10 ? "Spike" : r.pct > 0 ? "Up" : r.pct < -5 ? "Down" : "Flat"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.some(r => r.pct !== null && r.pct > 15) && (
        <div className="bg-orange-950/30 border border-orange-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
          <AlertTriangle size={14} className="text-orange-400 shrink-0" />
          <span>One or more months show &gt;15% payroll spike. Review for off-cycle bonuses, increments, or new hires driving the jump.</span>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Data sourced from transactions tagged as "payroll" category. For per-employee breakdown, use the Payroll Runs tab to run monthly payroll cycles.
      </div>
    </div>
  );
}

function PtCalculatorTab({ employees }: { employees: { id: string; name: string; gross_salary: number }[] }) {
  type PtSlab = { upTo: number | null; tax: number };
  type StateData = { name: string; slabs: PtSlab[]; note: string };

  const STATES: Record<string, StateData> = {
    MH: { name: "Maharashtra",    note: "₹200/mo for salary ≥₹10K; ₹175/mo for ₹7.5K–₹10K",   slabs: [{ upTo: 7500, tax: 0 }, { upTo: 10000, tax: 175 }, { upTo: null, tax: 200 }] },
    KA: { name: "Karnataka",      note: "₹200/mo above ₹35K; ₹175 for ₹25K–₹35K; ₹150 for ₹15K–₹25K", slabs: [{ upTo: 15000, tax: 0 }, { upTo: 25000, tax: 150 }, { upTo: 35000, tax: 175 }, { upTo: null, tax: 200 }] },
    WB: { name: "West Bengal",    note: "Graduated slabs; max ₹200/mo for salary above ₹40K",   slabs: [{ upTo: 10000, tax: 0 }, { upTo: 15000, tax: 110 }, { upTo: 25000, tax: 130 }, { upTo: 40000, tax: 150 }, { upTo: null, tax: 200 }] },
    TN: { name: "Tamil Nadu",     note: "₹208/mo (semi-annual ₹1,250) for salary ≥₹21K",        slabs: [{ upTo: 21000, tax: 0 }, { upTo: null, tax: 208 }] },
    AP: { name: "Andhra Pradesh", note: "₹200/mo above ₹20K; ₹150/mo for ₹15K–₹20K",           slabs: [{ upTo: 15000, tax: 0 }, { upTo: 20000, tax: 150 }, { upTo: null, tax: 200 }] },
    TS: { name: "Telangana",      note: "Same as Andhra Pradesh post-bifurcation",                slabs: [{ upTo: 15000, tax: 0 }, { upTo: 20000, tax: 150 }, { upTo: null, tax: 200 }] },
    GJ: { name: "Gujarat",        note: "₹200/mo above ₹12K; ₹150 for ₹9K–₹12K",               slabs: [{ upTo: 6000, tax: 0 }, { upTo: 9000, tax: 80 }, { upTo: 12000, tax: 150 }, { upTo: null, tax: 200 }] },
    MP: { name: "Madhya Pradesh", note: "₹208/mo (annual ₹2,500) for salary above ₹18.75K",     slabs: [{ upTo: 18750, tax: 0 }, { upTo: null, tax: 208 }] },
  };

  const [state, setState] = useState<string>("MH");

  const calcPt = (grossMonthly: number): number => {
    const s = STATES[state];
    for (const slab of s.slabs) {
      if (slab.upTo === null || grossMonthly <= slab.upTo) return slab.tax;
    }
    return 0;
  };

  const sd = STATES[state];
  const totalEmpPt  = employees.reduce((s,e) => s + calcPt(e.gross_salary), 0);
  const totalAnnual = totalEmpPt * 12;

  const downloadCsv = () => {
    const rows = [["Employee","Gross Salary","Monthly PT","Annual PT"], ...employees.map(e => [e.name, e.gross_salary, calcPt(e.gross_salary), calcPt(e.gross_salary) * 12])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = `PT-${sd.name.replace(/\s/g,"-")}.csv`; a.click();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1">Professional Tax — State-wise Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">PT is a state-level tax deducted from employee salary. Select your state to compute deductions for your team.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(STATES).map(([code, s]) => (
            <button key={code} onClick={() => setState(code)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${state === code ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {s.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-3 p-3 bg-[var(--color-bg)] rounded-lg">{sd.note}</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">{sd.name} — PT Slabs</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Monthly Gross","Monthly PT"].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sd.slabs.map((sl, i) => {
              const from = i === 0 ? 0 : (sd.slabs[i-1].upTo ?? 0) + 1;
              return (
                <tr key={i}>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{formatCurrency(from)} – {sl.upTo ? formatCurrency(sl.upTo) : "above"}</td>
                  <td className={`px-4 py-2.5 text-xs tabular-nums font-semibold ${sl.tax > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{sl.tax > 0 ? formatCurrency(sl.tax) : "Nil"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {employees.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Employee-wise PT — {sd.name}</p>
              <p className="text-[10px] text-[var(--color-muted)]">Total monthly: {formatCurrency(totalEmpPt)} · Annual: {formatCurrency(totalAnnual)}</p>
            </div>
            <button onClick={downloadCsv} className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Employee","Gross Salary","Monthly PT","Annual PT"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {employees.map(e => {
                const pt = calcPt(e.gross_salary);
                return (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(e.gross_salary)}</td>
                    <td className={`px-4 py-3 tabular-nums font-semibold ${pt > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{pt > 0 ? formatCurrency(pt) : "Nil"}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{pt > 0 ? formatCurrency(pt * 12) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {employees.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-8 text-center">
          <Users size={24} className="mx-auto mb-2 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add employees to compute PT deductions.</p>
        </div>
      )}
    </div>
  );
}

function FlexiBenefitTab({ employees }: { employees: { id: string; name: string; gross_salary: number }[] }) {
  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const [hra,   setHra]   = useState(40); // % of basic
  const [lta,   setLta]   = useState(12000); // annual
  const [food,  setFood]  = useState(2400); // annual ₹200/mo
  const [nps,   setNps]   = useState(10);  // % of basic (employer 80CCD(2))
  const [basicPct, setBasicPct] = useState(50); // % of gross

  const emp   = employees.find(e => e.id === empId);
  const gross = emp ? Number(emp.gross_salary) * 12 : 0; // annual
  const basic = Math.round(gross * basicPct / 100);
  const hraAmt    = Math.round(basic * hra / 100);
  const ltaAmt    = Math.min(lta, basic);
  const foodAmt   = Math.min(food, 26400); // capped ₹2200/mo
  const npsAmt    = Math.round(basic * nps / 100);
  const specialAllowance = Math.max(0, gross - basic - hraAmt - ltaAmt - foodAmt - npsAmt);

  // Tax saving estimate (30% slab)
  const hraTaxFree   = Math.round(hraAmt * 0.8); // 80% of HRA exempt for metro simplification
  const ltaTaxFree   = ltaAmt;
  const foodTaxFree  = foodAmt;
  const npsTaxFree   = npsAmt; // 80CCD(2) fully exempt
  const totalTaxFree = hraTaxFree + ltaTaxFree + foodTaxFree + npsTaxFree;
  const taxSaving    = Math.round(totalTaxFree * 0.30);

  const fc = formatCurrency;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  const rows = [
    { label: "Basic Salary",         amount: basic,            taxable: basic,            exemptBasis: "Fully taxable" },
    { label: "HRA",                  amount: hraAmt,           taxable: hraAmt - hraTaxFree, exemptBasis: "Sec 10(13A) — metro 50% of basic" },
    { label: "LTA",                  amount: ltaAmt,           taxable: 0,                exemptBasis: "Sec 10(5) — 2 trips in 4yr block" },
    { label: "Food Coupons",         amount: foodAmt,          taxable: 0,                exemptBasis: "₹2,200/mo perquisite exemption" },
    { label: "NPS (Employer 80CCD(2))", amount: npsAmt,        taxable: 0,                exemptBasis: "Up to 10% of basic — over-and-above 80C" },
    { label: "Special Allowance",    amount: specialAllowance, taxable: specialAllowance, exemptBasis: "Fully taxable" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">Salary Structure Inputs</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={inp}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {fc(e.gross_salary)}/mo</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Basic as % of Gross</label>
            <div className="flex items-center gap-2">
              <input type="range" min={30} max={70} value={basicPct} onChange={e => setBasicPct(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-8 tabular-nums">{basicPct}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">HRA % of Basic</label>
            <div className="flex items-center gap-2">
              <input type="range" min={20} max={60} step={5} value={hra} onChange={e => setHra(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-8 tabular-nums">{hra}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">LTA (Annual ₹)</label>
            <input type="number" value={lta} onChange={e => setLta(Number(e.target.value))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Food Coupons (Annual ₹)</label>
            <input type="number" value={food} onChange={e => setFood(Number(e.target.value))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">NPS Employer Contrib % of Basic</label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={14} value={nps} onChange={e => setNps(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-8 tabular-nums">{nps}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual CTC",       value: fc(gross + npsAmt), color: "text-[var(--color-primary)]" },
          { label: "Tax-Free Amount",  value: fc(totalTaxFree),    color: "text-green-400" },
          { label: "Est. Tax Saving",  value: fc(taxSaving),       color: "text-yellow-400" },
          { label: "Taxable Salary",   value: fc(gross - totalTaxFree + basic), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Banknote size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Optimised Salary Breakup (Annual)</span>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Component","Amount","Taxable Portion","Exemption Basis"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 tabular-nums">{fc(r.amount)}</td>
                <td className={`px-4 py-3 tabular-nums ${r.taxable === 0 ? "text-green-400" : "text-orange-400"}`}>{fc(r.taxable)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.exemptBasis}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 font-bold tabular-nums">{fc(rows.reduce((s, r) => s + r.amount, 0))}</td>
              <td className="px-4 py-3 font-bold tabular-nums text-orange-400">{fc(rows.reduce((s, r) => s + r.taxable, 0))}</td>
              <td className="px-4 py-3 text-xs text-green-400 font-semibold">Est. ₹{Math.round(taxSaving / 1000)}k/yr saved (30% slab)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">HRA exemption simplified as 80% (metro). LTA exempt for 2 journeys/block. Food coupons capped ₹2,200/mo. NPS via Sec 80CCD(2) — above ₹1.5L 80C limit. Always verify with your CA.</p>
    </div>
  );
}

function LwfCalculatorTab({ employees }: { employees: { id: string; name: string; gross_salary: number }[] }) {
  const [state, setState] = useState("Maharashtra");

  type LwfSlab = { employee: number; employer: number; freq: string; note: string };
  const LWF_STATES: Record<string, LwfSlab> = {
    Maharashtra:   { employee: 6,    employer: 12,   freq: "Jun & Dec", note: "₹6 + ₹12 per employee" },
    Karnataka:     { employee: 20,   employer: 40,   freq: "Jun & Dec", note: "₹20 + ₹40 per employee" },
    "Tamil Nadu":  { employee: 10,   employer: 20,   freq: "Annual",    note: "₹10 + ₹20 per employee" },
    "Andhra Pradesh": { employee: 30, employer: 70,  freq: "Annual",    note: "₹30 + ₹70 per employee" },
    Telangana:     { employee: 30,   employer: 70,   freq: "Annual",    note: "₹30 + ₹70 per employee" },
    Gujarat:       { employee: 6,    employer: 12,   freq: "Jun & Dec", note: "₹6 + ₹12 per employee" },
    "West Bengal": { employee: 3,    employer: 6,    freq: "Monthly",   note: "₹3 + ₹6 per employee/mo" },
    "Madhya Pradesh": { employee: 10, employer: 20,  freq: "Annual",    note: "₹10 + ₹20 per employee" },
    Punjab:        { employee: 5,    employer: 20,   freq: "Annual",    note: "₹5 + ₹20 per employee" },
    Kerala:        { employee: 4,    employer: 8,    freq: "Jun & Dec", note: "₹4 + ₹8 per employee" },
    Delhi:         { employee: 0,    employer: 0,    freq: "N/A",       note: "LWF not applicable in Delhi" },
    Rajasthan:     { employee: 0,    employer: 0,    freq: "N/A",       note: "LWF not applicable in Rajasthan" },
  };

  const slab = LWF_STATES[state] ?? { employee: 0, employer: 0, freq: "N/A", note: "State not configured" };
  const count = employees.length || 10;
  const annualMultiplier = slab.freq === "Monthly" ? 12 : slab.freq === "Jun & Dec" ? 2 : 1;
  const totalEmployee = slab.employee * count * annualMultiplier;
  const totalEmployer = slab.employer * count * annualMultiplier;
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Labour Welfare Fund Calculator</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">State</label>
            <select value={state} onChange={e => setState(e.target.value)}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
              {Object.keys(LWF_STATES).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="bg-[var(--color-accent)] rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Frequency</span><span className="font-semibold">{slab.freq}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Employee contrib</span><span className="font-semibold">₹{slab.employee}/employee</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Employer contrib</span><span className="font-semibold">₹{slab.employer}/employee</span></div>
            <p className="text-[var(--color-muted)] pt-1">{slab.note}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Employees",            value: count.toString(),         color: "text-[var(--color-primary)]" },
          { label: "Annual Employee Share", value: fc(totalEmployee),       color: "text-blue-400" },
          { label: "Annual Employer Share", value: fc(totalEmployer),       color: "text-orange-400" },
          { label: "Total Annual Outflow",  value: fc(totalEmployee + totalEmployer), color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Per-Employee LWF Deductions</span>
        </div>
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Employee","Employee Contrib","Employer Contrib","Total"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(employees.length > 0 ? employees : [{ id: "demo", name: "Sample Employee", gross_salary: 30000 }]).map(e => (
              <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3 tabular-nums">₹{slab.employee * annualMultiplier}</td>
                <td className="px-4 py-3 tabular-nums text-orange-400">₹{slab.employer * annualMultiplier}</td>
                <td className="px-4 py-3 tabular-nums font-semibold">₹{(slab.employee + slab.employer) * annualMultiplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">LWF rates are state-specific and change annually. Deduct from employee salary and remit to respective State Labour Welfare Board. Not applicable in Delhi, Rajasthan, and some UTs.</p>
    </div>
  );
}

function OfferLetterTab({ employees, firmName }: { employees: { id: string; name: string; gross_salary: number }[]; firmName: string }) {
  const [candidateName, setCandidateName] = useState("");
  const [designation,   setDesignation]   = useState("");
  const [department,    setDepartment]    = useState("");
  const [joiningDate,   setJoiningDate]   = useState("");
  const [grossSalary,   setGrossSalary]   = useState("");
  const [probation,     setProbation]     = useState("6");
  const [workLocation,  setWorkLocation]  = useState("");
  const [reportingTo,   setReportingTo]   = useState("");
  const [copied,        setCopied]        = useState(false);

  const gross = parseFloat(grossSalary) || 0;
  const basic = Math.round(gross * 0.5);
  const hra   = Math.round(gross * 0.2);
  const special = gross - basic - hra;
  const fc = formatCurrency;

  const letter = `OFFER LETTER

${firmName}

Date: ${joiningDate ? new Date(joiningDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "[Date]"}

To,
${candidateName || "[Candidate Name]"}

Subject: Offer of Employment — ${designation || "[Designation]"}

Dear ${candidateName || "[Candidate Name]"},

We are pleased to offer you the position of ${designation || "[Designation]"} in the ${department || "[Department]"} department at ${firmName}.

EMPLOYMENT DETAILS
• Designation:   ${designation || "—"}
• Department:    ${department || "—"}
• Reporting to:  ${reportingTo || "—"}
• Work Location: ${workLocation || "—"}
• Joining Date:  ${joiningDate || "—"}
• Probation:     ${probation} months

COMPENSATION (Monthly)
• Basic Salary:        ${fc(basic)}
• HRA:                 ${fc(hra)}
• Special Allowance:   ${fc(special)}
• Gross Monthly CTC:   ${fc(gross)}
• Annual CTC:          ${fc(gross * 12)}

TERMS & CONDITIONS
1. This offer is subject to satisfactory verification of your documents and references.
2. During probation, either party may terminate with 7 days' notice.
3. Post-confirmation, notice period is 30 days from either side.
4. You will be governed by the company's policies, code of conduct, and applicable labour laws.
5. This offer is valid for 7 days from the date above.

Please sign and return one copy of this letter as your acceptance.

Congratulations and welcome to the team!

Yours sincerely,

_______________________
Authorised Signatory
${firmName}


ACCEPTANCE

I, ${candidateName || "[Name]"}, accept the above offer and agree to join on ${joiningDate || "[date]"}.

Signature: _______________________   Date: ___________`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(letter).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Offer Letter Generator</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Candidate Name *</label>
            <input value={candidateName} onChange={e => setCandidateName(e.target.value)} placeholder="Rahul Sharma" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Designation *</label>
            <input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Senior Accountant" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Department</label>
            <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Finance" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross Monthly Salary (₹) *</label>
            <input type="number" value={grossSalary} onChange={e => setGrossSalary(e.target.value)} placeholder="35000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date of Joining</label>
            <input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Probation (months)</label>
            <select value={probation} onChange={e => setProbation(e.target.value)} className={inp}>
              {["1","2","3","6","12"].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Work Location</label>
            <input value={workLocation} onChange={e => setWorkLocation(e.target.value)} placeholder="Mumbai" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reporting To</label>
            <input value={reportingTo} onChange={e => setReportingTo(e.target.value)} placeholder="CFO / Manager" className={inp} />
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Preview</span>
          <button onClick={copyToClipboard}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
            <FileText size={11} /> {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
        </div>
        <pre className="p-4 text-xs font-mono text-[var(--color-muted)] whitespace-pre-wrap leading-relaxed overflow-x-auto">
          {letter}
        </pre>
      </div>
      {employees.length > 0 && (
        <p className="text-[10px] text-[var(--color-muted)]">Tip: Select an existing employee to pre-fill — or type a new candidate's details above.</p>
      )}
    </div>
  );
}

function EsopTab({ employees }: { employees: { id: string; name: string; gross_salary: number }[] }) {
  type Grant = { id: string; name: string; options: number; grantDate: string; vestingYears: number; cliffMonths: number };

  const [poolSize, setPoolSize] = useFeatureState<number>("esop-pool-size", 100000);
  const [fmv,      setFmv]      = useFeatureState<number>("esop-fmv", 150);   // current FMV / share price (₹)
  const [strike,   setStrike]   = useFeatureState<number>("esop-strike", 10);    // exercise / strike price (₹)

  const today = new Date().toISOString().split("T")[0];
  const [grants, setGrants] = useFeatureState<Grant[]>("esop-grants", []);
  const [form, setForm] = useState<{ name: string; options: string; grantDate: string; vestingYears: string; cliffMonths: string }>({
    name: employees[0]?.name ?? "",
    options: "",
    grantDate: today,
    vestingYears: "4",
    cliffMonths: "12",
  });

  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const monthsBetween = (fromIso: string, to: Date) => {
    const from = new Date(fromIso);
    if (isNaN(from.getTime())) return 0;
    let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) m -= 1;
    return Math.max(0, m);
  };

  const computed = useMemo(() => {
    const now = new Date();
    return (grants ?? []).map(g => {
      const granted      = g.options || 0;
      const vestingMonths = (g.vestingYears || 0) * 12;
      const monthsElapsed = monthsBetween(g.grantDate, now);
      let vested = 0;
      if (vestingMonths > 0 && monthsElapsed >= (g.cliffMonths || 0)) {
        vested = Math.floor(granted * Math.min(monthsElapsed, vestingMonths) / vestingMonths);
      }
      const unvested  = Math.max(0, granted - vested);
      const vestedPct = granted > 0 ? (vested / granted) * 100 : 0;
      const notional  = vested * Math.max(0, fmv - strike);
      return { ...g, granted, vested, unvested, vestedPct, notional, monthsElapsed };
    });
  }, [grants, today, fmv, strike]);

  const totalGranted = computed.reduce((s, g) => s + g.granted, 0);
  const totalVested  = computed.reduce((s, g) => s + g.vested, 0);
  const totalNotional = computed.reduce((s, g) => s + g.notional, 0);
  const utilisation  = (poolSize || 0) > 0 ? (totalGranted / (poolSize || 1)) * 100 : 0;
  const remainingPool = (poolSize || 0) - totalGranted;
  const overAllocated = utilisation > 100;

  const addGrant = () => {
    const opts = parseInt(form.options) || 0;
    if (!form.name.trim() || opts <= 0) { toast.error("Employee name and options granted (> 0) required"); return; }
    setGrants(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: form.name.trim(),
      options: opts,
      grantDate: form.grantDate || today,
      vestingYears: parseFloat(form.vestingYears) || 4,
      cliffMonths: parseInt(form.cliffMonths) || 12,
    }]);
    setForm(f => ({ ...f, options: "" }));
    toast.success(`Grant added for ${form.name.trim()}`);
  };

  const removeGrant = (id: string) => setGrants(prev => prev.filter(g => g.id !== id));

  const kpis = [
    { label: "Pool Size",        value: `${(poolSize || 0).toLocaleString("en-IN")} opts`, color: "text-[var(--color-text)]" },
    { label: "Granted",          value: `${totalGranted.toLocaleString("en-IN")} opts`,    color: "text-blue-400" },
    { label: "Pool Utilisation", value: `${utilisation.toFixed(1)}%`,                       color: overAllocated ? "text-red-400" : "text-[var(--color-primary)]" },
    { label: "Total Vested",     value: `${totalVested.toLocaleString("en-IN")} opts`,      color: "text-green-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Pool inputs */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">ESOP Pool Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total Pool Size (options reserved)</label>
            <input type="number" min={0} value={poolSize} onChange={e => setPoolSize(Number(e.target.value))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current FMV / Share Price (₹)</label>
            <input type="number" min={0} value={fmv} onChange={e => setFmv(Number(e.target.value))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Exercise / Strike Price (₹)</label>
            <input type="number" min={0} value={strike} onChange={e => setStrike(Number(e.target.value))} className={inp} />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {overAllocated && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <span>Pool over-allocated — {totalGranted.toLocaleString("en-IN")} options granted exceed the pool size of {(poolSize || 0).toLocaleString("en-IN")}. Expand the pool or claw back unallocated grants.</span>
        </div>
      )}

      {!overAllocated && (
        <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
          Remaining pool: <span className="font-semibold text-[var(--color-text)]">{remainingPool.toLocaleString("en-IN")} options</span> · Total notional gain at exercise: <span className="font-semibold text-green-400">{fc(totalNotional)}</span>
        </div>
      )}

      {/* Add grant */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add Grant</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
            {employees.length > 0 ? (
              <select value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp}>
                {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            ) : (
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Employee name" className={inp} />
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Options Granted</label>
            <input type="number" min={0} value={form.options} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} placeholder="5000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Grant Date</label>
            <input type="date" value={form.grantDate} onChange={e => setForm(f => ({ ...f, grantDate: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Vesting (years)</label>
            <input type="number" min={1} value={form.vestingYears} onChange={e => setForm(f => ({ ...f, vestingYears: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cliff (months)</label>
            <input type="number" min={0} value={form.cliffMonths} onChange={e => setForm(f => ({ ...f, cliffMonths: e.target.value }))} className={inp} />
          </div>
        </div>
        <button onClick={addGrant}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Add Grant
        </button>
      </div>

      {/* Grants table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <TrendingUp size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Grants &amp; Vesting (as of {new Date(today).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })})</span>
        </div>
        {computed.length === 0 ? (
          <div className="p-8 text-center">
            <TrendingUp size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
            <p className="text-sm text-[var(--color-muted)]">No grants yet. Add a grant above to track vesting and notional value.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Employee","Granted","Vested","Unvested","Vested %","Notional Value",""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.map(g => (
                <tr key={g.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3 tabular-nums">{g.granted.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{g.vested.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{g.unvested.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 tabular-nums text-blue-400 font-semibold">{g.vestedPct.toFixed(1)}%</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-primary)] font-semibold">{fc(g.notional)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => removeGrant(g.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
              <tr>
                <td className="px-4 py-3 font-bold text-xs">Total</td>
                <td className="px-4 py-3 tabular-nums font-bold">{totalGranted.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 tabular-nums font-bold text-green-400">{totalVested.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 tabular-nums font-bold text-[var(--color-muted)]">{Math.max(0, totalGranted - totalVested).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 tabular-nums font-bold text-blue-400">{totalGranted > 0 ? ((totalVested / totalGranted) * 100).toFixed(1) : "0.0"}%</td>
                <td className="px-4 py-3 tabular-nums font-bold text-[var(--color-primary)]">{fc(totalNotional)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">Vested = floor(granted × min(monthsElapsed, vestingYears×12) ÷ (vestingYears×12)); zero until the cliff is crossed. Notional value = vested × max(0, FMV − strike). ESOP taxation — perquisite tax at exercise on (FMV − strike), capital gains at sale; eligible startups get tax deferral under Sec 80-IAC / 192(1C). Consult a CA.</p>
    </div>
  );
}

// ── Shared helpers for new Payroll & HR tools ──────────────────────────────────
type EmpLite = { id: string; name: string; gross_salary: number; tds_monthly?: number; status?: string; joining_date?: string; pan?: string; email?: string };

const NEW_SLAB_BANDS: [number, number][] = [
  [300000, 0], [700000, 0.05], [1000000, 0.10], [1200000, 0.15], [1500000, 0.20], [Infinity, 0.30],
];
const OLD_SLAB_BANDS: [number, number][] = [
  [250000, 0], [500000, 0.05], [1000000, 0.20], [Infinity, 0.30],
];
function computeSlabTax(taxable: number, bands: [number, number][]): number {
  let tax = 0, prev = 0;
  for (const [upTo, rate] of bands) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}
function downloadCsvRows(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r => r.map(c => (typeof c === "string" && c.includes(",") ? `"${c}"` : c)).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
const EMPTY_HINT = "Add employees first to use this tool.";
function EmptyState({ icon: Icon, msg }: { icon: typeof Users; msg: string }) {
  return (
    <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
      <Icon size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
      <p className="text-sm text-[var(--color-muted)]">{msg}</p>
    </div>
  );
}

// ── 26. CTC Structuring Optimizer ──────────────────────────────────────────────
function CtcOptimizerTab({ employees }: { employees: EmpLite[] }) {
  const [empId,    setEmpId]    = useState(employees[0]?.id ?? "");
  const [ctcInput, setCtcInput] = useState("");
  const [basicPct, setBasicPct] = useState(40);
  const [metro,    setMetro]    = useState(true);
  const [rentPaid, setRentPaid] = useState("");
  const [nps,      setNps]      = useState(10);

  const emp = employees.find(e => e.id === empId);
  const annualCtc = (parseFloat(ctcInput) || (emp ? Number(emp.gross_salary) * 12 : 0));
  const basic   = Math.round(annualCtc * basicPct / 100);
  const hra     = Math.round(basic * (metro ? 0.50 : 0.40));
  const npsEr   = Math.round(basic * Math.min(nps, 14) / 100); // 80CCD(2)
  // EPF employer 12% on basic (capped at ₹15k/mo ⇒ ₹1.8L/yr basic ceiling)
  const pfEr    = Math.round(Math.min(basic, 180000) * 0.12);
  const lta     = Math.min(Math.round(basic * 0.10), 60000);
  const food    = 26400; // ₹2,200/mo
  const special = Math.max(0, annualCtc - basic - hra - npsEr - pfEr - lta - food);

  // HRA exemption u/s 10(13A) = min(actual HRA, rent − 10% basic, 40/50% basic)
  const rent = parseFloat(rentPaid) || 0;
  const hraExempt = rent > 0 ? Math.max(0, Math.min(hra, rent - 0.10 * basic, basic * (metro ? 0.50 : 0.40))) : 0;
  const taxFree   = hraExempt + lta + food + npsEr;
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  if (employees.length === 0 && !ctcInput) return <EmptyState icon={Wallet} msg="Add an employee or enter a CTC below to structure compensation." />;

  const rows = [
    { label: "Basic Salary",              amount: basic,   taxable: basic,    note: "Fully taxable · PF base" },
    { label: "HRA",                       amount: hra,     taxable: hra - hraExempt, note: "Sec 10(13A) — enter rent for exemption" },
    { label: "LTA",                       amount: lta,     taxable: 0,        note: "Sec 10(5) — 2 trips per 4-yr block" },
    { label: "Food Coupons",              amount: food,    taxable: 0,        note: "₹2,200/mo perquisite exemption" },
    { label: "NPS Employer 80CCD(2)",     amount: npsEr,   taxable: 0,        note: "Up to 14% basic (govt) / 10% (others)" },
    { label: "EPF Employer",              amount: pfEr,    taxable: 0,        note: "12% of basic (capped ₹15k/mo wage)" },
    { label: "Special Allowance",         amount: special, taxable: special,  note: "Balancing — fully taxable" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold">CTC Structuring Optimizer (Old Regime tax-efficient split)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {employees.length > 0 && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
              <select value={empId} onChange={e => { setEmpId(e.target.value); setCtcInput(""); }} className={inp}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual CTC (₹)</label>
            <input type="number" min={0} value={ctcInput} onChange={e => setCtcInput(e.target.value)} placeholder={emp ? String(Number(emp.gross_salary) * 12) : "1200000"} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Basic as % of CTC</label>
            <div className="flex items-center gap-2">
              <input type="range" min={30} max={60} value={basicPct} onChange={e => setBasicPct(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-10 tabular-nums">{basicPct}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">NPS Employer % of Basic</label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={14} value={nps} onChange={e => setNps(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-10 tabular-nums">{nps}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Annual Rent Paid (₹)</label>
            <input type="number" min={0} value={rentPaid} onChange={e => setRentPaid(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input type="checkbox" checked={metro} onChange={e => setMetro(e.target.checked)} className="accent-[var(--color-primary)]" />
              Metro city (HRA 50% of basic)
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual CTC",      value: fc(annualCtc),               color: "text-[var(--color-primary)]" },
          { label: "Tax-Free Amount", value: fc(taxFree),                 color: "text-green-400" },
          { label: "Taxable Base",    value: fc(annualCtc - taxFree),     color: "text-orange-400" },
          { label: "Tax-Free of CTC",  value: `${annualCtc > 0 ? Math.round((taxFree / annualCtc) * 100) : 0}%`, color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Wallet size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Optimised Annual Salary Structure</span>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Component", "Amount", "Taxable", "Basis"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 tabular-nums">{fc(r.amount)}</td>
                <td className={`px-4 py-3 tabular-nums ${r.taxable === 0 ? "text-green-400" : "text-orange-400"}`}>{fc(r.taxable)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{r.note}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 font-bold tabular-nums">{fc(rows.reduce((s, r) => s + r.amount, 0))}</td>
              <td className="px-4 py-3 font-bold tabular-nums text-orange-400">{fc(rows.reduce((s, r) => s + r.taxable, 0))}</td>
              <td className="px-4 py-3 text-xs text-green-400 font-semibold">{fc(taxFree)} kept tax-free</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">HRA exemption = min(HRA, rent − 10% basic, 50%/40% of basic). Employer NPS u/s 80CCD(2) and EPF are over-and-above the ₹1.5L 80C limit. New regime allows only ₹75k standard deduction + 80CCD(2). Verify with your CA.</p>
    </div>
  );
}

// ── 27. Attendance & Leave Register ────────────────────────────────────────────
function AttendanceRegisterTab({ employees }: { employees: EmpLite[] }) {
  type Att = { id: string; empId: string; month: string; payableDays: number; present: number; lop: number; compOff: number; leaveEncash: number };
  const [rows, setRows] = useFeatureState<Att[]>("payroll-attendance", []);
  const monthDefault = new Date().toISOString().slice(0, 7);
  const [form, setForm] = useState({ empId: employees[0]?.id ?? "", month: monthDefault, payableDays: "26", present: "26", lop: "0", compOff: "0", leaveEncash: "0" });
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;

  const empById = (id: string) => employees.find(e => e.id === id);

  const addRow = () => {
    if (!form.empId) { toast.error("Select an employee"); return; }
    setRows(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      empId: form.empId, month: form.month,
      payableDays: Number(form.payableDays) || 26,
      present: Number(form.present) || 0,
      lop: Number(form.lop) || 0,
      compOff: Number(form.compOff) || 0,
      leaveEncash: Number(form.leaveEncash) || 0,
    }]);
    toast.success("Attendance recorded");
  };
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const computed = rows.map(r => {
    const emp = empById(r.empId);
    const gross = emp ? Number(emp.gross_salary) : 0;
    const perDay = r.payableDays > 0 ? gross / r.payableDays : 0;
    const lopDeduction = Math.round(perDay * r.lop);
    const encashAmt    = Math.round(perDay * r.leaveEncash);
    const netPay        = Math.max(0, Math.round(gross - lopDeduction + encashAmt));
    return { ...r, name: emp?.name ?? "—", gross, perDay, lopDeduction, encashAmt, netPay };
  });

  if (employees.length === 0) return <EmptyState icon={CalendarDays} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Attendance & Leave Register</h3>
        <p className="text-xs text-[var(--color-muted)]">Loss-of-pay (LOP) days reduce salary pro-rata; leave-encashment days add back at the same per-day rate. Feeds the net payable.</p>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
            <select value={form.empId} onChange={e => setForm(f => ({ ...f, empId: e.target.value }))} className={inp}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Month</label>
            <input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payable Days</label>
            <input type="number" min={1} value={form.payableDays} onChange={e => setForm(f => ({ ...f, payableDays: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Present</label>
            <input type="number" min={0} value={form.present} onChange={e => setForm(f => ({ ...f, present: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">LOP Days</label>
            <input type="number" min={0} value={form.lop} onChange={e => setForm(f => ({ ...f, lop: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Comp-Off</label>
            <input type="number" min={0} value={form.compOff} onChange={e => setForm(f => ({ ...f, compOff: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Leave Encash (days)</label>
            <input type="number" min={0} value={form.leaveEncash} onChange={e => setForm(f => ({ ...f, leaveEncash: e.target.value }))} className={inp} />
          </div>
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Record Attendance
        </button>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Register ({computed.length})</span>
          {computed.length > 0 && (
            <button onClick={() => downloadCsvRows([["Employee", "Month", "Payable", "Present", "LOP", "Comp-Off", "Encash Days", "LOP Deduction", "Encash Amt", "Net Pay"], ...computed.map(r => [r.name, r.month, r.payableDays, r.present, r.lop, r.compOff, r.leaveEncash, r.lopDeduction, r.encashAmt, r.netPay])], "attendance-register.csv")}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
          )}
        </div>
        {computed.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)]">No attendance recorded yet.</p>
        ) : (
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                {["Employee", "Month", "Payable", "Present", "LOP", "Encash Days", "LOP Deduction", "Encash Amt", "Net Pay", ""].map(h => (
                  <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5">{r.month}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.payableDays}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.present}</td>
                  <td className="px-3 py-2.5 tabular-nums text-red-400">{r.lop}</td>
                  <td className="px-3 py-2.5 tabular-nums text-green-400">{r.leaveEncash}</td>
                  <td className="px-3 py-2.5 tabular-nums text-red-400">{r.lopDeduction > 0 ? `(${fc(r.lopDeduction)})` : "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-green-400">{r.encashAmt > 0 ? fc(r.encashAmt) : "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{fc(r.netPay)}</td>
                  <td className="px-3 py-2.5 text-right"><button onClick={() => removeRow(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Per-day rate = monthly gross ÷ payable days. LOP reduces and leave-encashment adds at this rate. Records persist and sync across devices.</p>
    </div>
  );
}

// ── 28. Gratuity Provision Calculator ──────────────────────────────────────────
function GratuityProvisionTab({ employees }: { employees: EmpLite[] }) {
  const [rate, setRate] = useState(0.07); // annual salary growth assumption
  const fc = formatCurrency;
  const GRATUITY_CAP = 2000000; // ₹20 lakh statutory ceiling

  const today = new Date();
  const rows = employees.map(e => {
    const monthly = Number(e.gross_salary);
    const basic = Math.round(monthly * 0.50); // basic+DA ≈ 50% of gross as proxy
    const join = e.joining_date ? new Date(e.joining_date) : null;
    const yearsRaw = join ? Math.max(0, (today.getTime() - join.getTime()) / (365.25 * 24 * 3600 * 1000)) : 0;
    // rounding rule: >6 months counts as a full year
    const completedYears = Math.floor(yearsRaw);
    const extraMonths = (yearsRaw - completedYears) * 12;
    const eligibleYears = completedYears + (extraMonths > 6 ? 1 : 0);
    const accrued = Math.min(GRATUITY_CAP, Math.round((15 / 26) * basic * eligibleYears));
    const perYear = Math.round((15 / 26) * basic);
    const isEligible = yearsRaw >= 5;
    return { id: e.id, name: e.name, monthly, basic, yearsRaw, eligibleYears, accrued, perYear, isEligible };
  });

  const totalAccrued = rows.reduce((s, r) => s + r.accrued, 0);
  const totalEligible = rows.filter(r => r.isEligible).reduce((s, r) => s + r.accrued, 0);
  const totalAnnualCost = rows.reduce((s, r) => s + r.perYear, 0);

  if (employees.length === 0) return <EmptyState icon={PiggyBank} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1">Gratuity Provision Calculator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Payment of Gratuity Act, 1972 — 15/26 × last drawn (basic + DA) × years of service. Vests after 5 continuous years; capped at ₹20 lakh. &gt;6 months counts as a full year.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Salary growth assumption (for accrual)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={0.15} step={0.01} value={rate} onChange={e => setRate(Number(e.target.value))} className="accent-[var(--color-primary)] w-40" />
            <span className="text-sm font-bold tabular-nums">{(rate * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Accrued Liability", value: fc(totalAccrued),  color: "text-orange-400" },
          { label: "Vested (≥5 yrs)",          value: fc(totalEligible), color: "text-red-400" },
          { label: "Annual Accrual Cost",      value: fc(totalAnnualCost), color: "text-[var(--color-primary)]" },
          { label: "Eligible Employees",       value: rows.filter(r => r.isEligible).length.toString(), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Per-Employee Gratuity</span>
          <button onClick={() => downloadCsvRows([["Employee", "Basic (proxy)", "Years", "Eligible Years", "Accrued", "Vested"], ...rows.map(r => [r.name, r.basic, r.yearsRaw.toFixed(1), r.eligibleYears, r.accrued, r.isEligible ? "Yes" : "No"])], "gratuity-provision.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Basic+DA (proxy)", "Service (yrs)", "Eligible Years", "Accrued Liability", "Status"].map(h => (
                <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.basic)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.yearsRaw.toFixed(1)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.eligibleYears}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400 font-semibold">{fc(r.accrued)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${r.isEligible ? "bg-green-900/20 text-green-400 border-green-800/30" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                    {r.isEligible ? "Vested" : "Not vested (<5 yr)"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-4 py-3 font-bold" colSpan={4}>Total accrued actuarial liability</td>
              <td className="px-4 py-3 font-bold tabular-nums text-orange-400" colSpan={2}>{fc(totalAccrued)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Basic+DA taken as 50% of gross as a proxy where not separately defined. Book the accrued amount as a provision (AS-15 / Ind AS 19) — an actuarial valuation is required for audited financials. Capped at ₹20 lakh per employee.</p>
    </div>
  );
}

// ── 29. Reimbursement & Expense Claims ─────────────────────────────────────────
function ReimbursementTab({ employees }: { employees: EmpLite[] }) {
  type Claim = { id: string; empId: string; date: string; category: string; amount: number; description: string; status: "pending" | "approved" | "rejected" };
  const [claims, setClaims] = useFeatureState<Claim[]>("payroll-reimbursements", []);
  const CATEGORIES = ["Travel", "Food", "Telecom", "Internet", "Fuel", "Medical", "Office Supplies", "Other"];
  const [form, setForm] = useState({ empId: employees[0]?.id ?? "", date: new Date().toISOString().slice(0, 10), category: CATEGORIES[0], amount: "", description: "" });
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;
  const empName = (id: string) => employees.find(e => e.id === id)?.name ?? "—";

  const addClaim = () => {
    const amt = parseFloat(form.amount) || 0;
    if (!form.empId || amt <= 0) { toast.error("Employee and a positive amount required"); return; }
    setClaims(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, empId: form.empId, date: form.date, category: form.category, amount: amt, description: form.description.trim(), status: "pending" }, ...prev]);
    setForm(f => ({ ...f, amount: "", description: "" }));
    toast.success("Claim submitted");
  };
  const setStatus = (id: string, status: Claim["status"]) => setClaims(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  const removeClaim = (id: string) => setClaims(prev => prev.filter(c => c.id !== id));

  const pending  = claims.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const approved = claims.filter(c => c.status === "approved").reduce((s, c) => s + c.amount, 0);

  if (employees.length === 0) return <EmptyState icon={Receipt} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Reimbursement & Expense Claims</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
            <select value={form.empId} onChange={e => setForm(f => ({ ...f, empId: e.target.value }))} className={inp}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Client visit cab" className={inp} />
          </div>
        </div>
        <button onClick={addClaim} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Submit Claim
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Claims",     value: claims.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Pending Approval", value: fc(pending),  color: "text-yellow-400" },
          { label: "Approved (to pay)", value: fc(approved), color: "text-green-400" },
          { label: "Merge to Payroll",  value: fc(approved), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><span className="text-sm font-semibold">Claims</span></div>
        {claims.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)]">No claims yet.</p>
        ) : (
          <table className="w-full text-xs min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                {["Employee", "Date", "Category", "Description", "Amount", "Status", ""].map(h => (
                  <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{empName(c.empId)}</td>
                  <td className="px-3 py-2.5">{c.date}</td>
                  <td className="px-3 py-2.5">{c.category}</td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)]">{c.description || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold">{fc(c.amount)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c.status === "approved" ? "bg-green-900/20 text-green-400 border-green-800/30" : c.status === "rejected" ? "bg-red-900/20 text-red-400 border-red-800/30" : "bg-yellow-900/20 text-yellow-400 border-yellow-800/30"}`}>{c.status}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {c.status === "pending" && (
                      <>
                        <button onClick={() => setStatus(c.id, "approved")} className="text-green-400 hover:underline mr-2">Approve</button>
                        <button onClick={() => setStatus(c.id, "rejected")} className="text-red-400 hover:underline mr-2">Reject</button>
                      </>
                    )}
                    <button onClick={() => removeClaim(c.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} className="inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Approved claims are tax-free reimbursements when supported by bills (not perquisites). Merge the approved total into the month's payroll disbursement. Claims persist and sync.</p>
    </div>
  );
}

// ── 30. TDS-on-Salary Projection (per employee, Sec 192) ───────────────────────
function Tds192ProjectionTab({ employees }: { employees: EmpLite[] }) {
  const [empId,    setEmpId]    = useState(employees[0]?.id ?? "");
  const [regime,   setRegime]   = useState<"new" | "old">("new");
  const [d80c,     setD80c]     = useState("");
  const [d80d,     setD80d]     = useState("");
  const [d80ccd,   setD80ccd]   = useState("");
  const [homeLoan, setHomeLoan] = useState("");
  const [hraEx,    setHraEx]    = useState("");
  const [monthsDeducted, setMonthsDeducted] = useState(0);

  const emp = employees.find(e => e.id === empId);
  const annualGross = emp ? Number(emp.gross_salary) * 12 : 0;
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const deductions = regime === "old"
    ? Math.min(parseFloat(d80c) || 0, 150000) + Math.min(parseFloat(d80d) || 0, 50000) + Math.min(parseFloat(d80ccd) || 0, 50000) + Math.min(parseFloat(homeLoan) || 0, 200000) + (parseFloat(hraEx) || 0)
    : 0;
  const stdDeduction = regime === "new" ? 75000 : 50000;
  const taxable = Math.max(0, annualGross - stdDeduction - deductions);
  const bands = regime === "new" ? NEW_SLAB_BANDS : OLD_SLAB_BANDS;
  const slab = computeSlabTax(taxable, bands);
  const rebateLimit = regime === "new" ? 700000 : 500000;
  const rebateCap   = regime === "new" ? Infinity : 12500;
  const rebate = taxable <= rebateLimit ? Math.min(slab, rebateCap) : 0;
  const afterRebate = slab - rebate;
  const cess = afterRebate * 0.04;
  const annualTds = Math.round(afterRebate + cess);
  const remainingMonths = Math.max(1, 12 - monthsDeducted);
  const monthlyTds = Math.round(annualTds / 12);
  const balanceMonthly = Math.round(annualTds / remainingMonths); // remaining liability over remaining months

  if (employees.length === 0) return <EmptyState icon={Percent} msg={EMPTY_HINT} />;

  const breakdown = [
    { label: "Annual Gross Salary", value: annualGross },
    { label: `Standard Deduction`, value: -stdDeduction },
    { label: "Chapter VI-A & 24(b)", value: -deductions },
    { label: "Net Taxable Income", value: taxable, bold: true },
    { label: "Slab Tax", value: Math.round(slab) },
    { label: "Less: 87A Rebate", value: -Math.round(rebate) },
    { label: "Health & Edu Cess 4%", value: Math.round(cess) },
    { label: "Annual TDS Payable", value: annualTds, bold: true },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">TDS-on-Salary Projection (Sec 192)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={inp}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Regime</label>
            <select value={regime} onChange={e => setRegime(e.target.value as "new" | "old")} className={inp}>
              <option value="new">New (default)</option>
              <option value="old">Old (with declarations)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">TDS already deducted (months)</label>
            <input type="number" min={0} max={11} value={monthsDeducted} onChange={e => setMonthsDeducted(Number(e.target.value))} className={inp} />
          </div>
          {regime === "old" && (
            <>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">80C (max ₹1.5L)</label>
                <input type="number" min={0} value={d80c} onChange={e => setD80c(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">80D (max ₹50k)</label>
                <input type="number" min={0} value={d80d} onChange={e => setD80d(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">80CCD(1B) (max ₹50k)</label>
                <input type="number" min={0} value={d80ccd} onChange={e => setD80ccd(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Home Loan 24(b) (max ₹2L)</label>
                <input type="number" min={0} value={homeLoan} onChange={e => setHomeLoan(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">HRA Exemption</label>
                <input type="number" min={0} value={hraEx} onChange={e => setHraEx(e.target.value)} placeholder="0" className={inp} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual TDS (192)",       value: fc(annualTds),     color: "text-orange-400" },
          { label: "Even Monthly TDS",       value: fc(monthlyTds),    color: "text-[var(--color-text)]" },
          { label: `Balance / mo (${remainingMonths} left)`, value: fc(balanceMonthly), color: "text-[var(--color-primary)]" },
          { label: "Effective Rate",         value: `${annualGross > 0 ? (annualTds / annualGross * 100).toFixed(1) : "0.0"}%`, color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]"><th className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">Particulars</th><th className="text-right text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">Amount</th></tr>
          </thead>
          <tbody>
            {breakdown.map(r => (
              <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                <td className="px-4 py-2.5">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.value < 0 ? `(${fc(Math.abs(r.value))})` : fc(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Employer must deduct TDS u/s 192 on the average rate basis. If {monthsDeducted} months are already deducted, recover the balance evenly over the remaining {remainingMonths} months. Surcharge above ₹50L not modelled. Verify with your CA.</p>
    </div>
  );
}

// ── 31. Bonus Act Eligibility & Accrual ────────────────────────────────────────
function BonusAccrualTab({ employees }: { employees: EmpLite[] }) {
  const [pct, setPct] = useState(8.33); // declared bonus %
  const ELIG_CEILING = 21000;  // eligibility wage ceiling /mo
  const CALC_CEILING = 7000;   // calculation ceiling /mo (or min wage if higher)
  const fc = formatCurrency;

  const rows = employees.map(e => {
    const gross = Number(e.gross_salary);
    const eligible = gross <= ELIG_CEILING;
    const calcWage = Math.min(gross, CALC_CEILING);
    const annualCalcWage = calcWage * 12;
    const minBonus = Math.round(annualCalcWage * 0.0833);
    const maxBonus = Math.round(annualCalcWage * 0.20);
    const declared = Math.round(annualCalcWage * Math.min(Math.max(pct, 8.33), 20) / 100);
    return { id: e.id, name: e.name, gross, eligible, calcWage, minBonus, maxBonus, declared };
  });
  const eligibleRows = rows.filter(r => r.eligible);
  const totalDeclared = eligibleRows.reduce((s, r) => s + r.declared, 0);
  const totalMin = eligibleRows.reduce((s, r) => s + r.minBonus, 0);
  const totalMax = eligibleRows.reduce((s, r) => s + r.maxBonus, 0);

  if (employees.length === 0) return <EmptyState icon={Sparkles} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Payment of Bonus Act, 1965 — Eligibility & Accrual</h3>
        <p className="text-xs text-[var(--color-muted)]">Eligible: salary ≤ ₹21,000/mo and ≥30 working days. Bonus computed on min(salary, ₹7,000) wage ceiling. Statutory range 8.33%–20% of the allocable surplus.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Declared bonus rate</label>
          <div className="flex items-center gap-2">
            <input type="range" min={8.33} max={20} step={0.01} value={pct} onChange={e => setPct(Number(e.target.value))} className="accent-[var(--color-primary)] w-48" />
            <span className="text-sm font-bold tabular-nums w-14">{pct.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Eligible Employees",  value: eligibleRows.length.toString(), color: "text-green-400" },
          { label: "Minimum (8.33%)",     value: fc(totalMin),     color: "text-[var(--color-text)]" },
          { label: "Declared Accrual",    value: fc(totalDeclared), color: "text-[var(--color-primary)]" },
          { label: "Maximum (20%)",       value: fc(totalMax),     color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Statutory Bonus Register</span>
          <button onClick={() => downloadCsvRows([["Employee", "Gross", "Eligible", "Calc Wage", "Min 8.33%", `Declared ${pct.toFixed(2)}%`, "Max 20%"], ...rows.map(r => [r.name, r.gross, r.eligible ? "Yes" : "No", r.calcWage, r.minBonus, r.eligible ? r.declared : 0, r.maxBonus])], "bonus-register.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-xs min-w-[680px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Gross", "Eligible", "Calc. Wage", "Min (8.33%)", `Declared (${pct.toFixed(2)}%)`, "Max (20%)"].map(h => (
                <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.gross)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${r.eligible ? "bg-green-900/20 text-green-400 border-green-800/30" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{r.eligible ? "Yes" : "No"}</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(r.calcWage)}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.eligible ? fc(r.minBonus) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{r.eligible ? fc(r.declared) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.eligible ? fc(r.maxBonus) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-4 py-3 font-bold" colSpan={4}>Total accrual (eligible only)</td>
              <td className="px-4 py-3 tabular-nums font-bold">{fc(totalMin)}</td>
              <td className="px-4 py-3 tabular-nums font-bold text-[var(--color-primary)]">{fc(totalDeclared)}</td>
              <td className="px-4 py-3 tabular-nums font-bold text-orange-400">{fc(totalMax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Bonus is payable within 8 months of the close of the accounting year. Where minimum wage &gt; ₹7,000, use the minimum wage as the calculation ceiling. Maintain Form A/B/C registers. Verify with your CA.</p>
    </div>
  );
}

// ── 32. Contractor / Gig Payout Register ───────────────────────────────────────
function ContractorPayoutTab() {
  type Payout = { id: string; name: string; pan: string; section: "194C" | "194J"; date: string; gross: number; hasPan: boolean };
  const [rows, setRows] = useFeatureState<Payout[]>("payroll-contractor-payouts", []);
  const [form, setForm] = useState({ name: "", pan: "", section: "194C" as "194C" | "194J", date: new Date().toISOString().slice(0, 10), gross: "" });
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;

  // 194C: 1% individual/HUF, 2% others ⇒ use 1% default; 194J: 10% (2% for technical). No PAN ⇒ 20%.
  const rateFor = (section: Payout["section"], hasPan: boolean) => {
    if (!hasPan) return 20;
    return section === "194C" ? 1 : 10;
  };
  const thresholdFor = (section: Payout["section"]) => section === "194C" ? 30000 : 30000; // per transaction

  const addRow = () => {
    const gross = parseFloat(form.gross) || 0;
    if (!form.name.trim() || gross <= 0) { toast.error("Contractor name and gross amount required"); return; }
    const hasPan = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan.trim().toUpperCase());
    setRows(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: form.name.trim(), pan: form.pan.trim().toUpperCase(), section: form.section, date: form.date, gross, hasPan }, ...prev]);
    setForm(f => ({ ...f, name: "", pan: "", gross: "" }));
    toast.success("Payout recorded");
  };
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const computed = rows.map(r => {
    const rate = rateFor(r.section, r.hasPan);
    const tds = r.gross >= thresholdFor(r.section) ? Math.round(r.gross * rate / 100) : 0;
    return { ...r, rate, tds, net: r.gross - tds };
  });
  const totalGross = computed.reduce((s, r) => s + r.gross, 0);
  const totalTds   = computed.reduce((s, r) => s + r.tds, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Contractor / Gig Payout Register (TDS 194C / 194J)</h3>
        <p className="text-xs text-[var(--color-muted)]">Separate from salary. 194C contracts: 1% (individual/HUF). 194J professional/technical: 10%. No valid PAN ⇒ 20%. Threshold ₹30,000 per payment (or ₹1L aggregate/yr).</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Contractor Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Services" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">PAN</label>
            <input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} maxLength={10} placeholder="ABCDE1234F" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Section</label>
            <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value as "194C" | "194J" }))} className={inp}>
              <option value="194C">194C — Contract</option>
              <option value="194J">194J — Professional</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross (₹)</label>
            <input type="number" min={0} value={form.gross} onChange={e => setForm(f => ({ ...f, gross: e.target.value }))} placeholder="50000" className={inp} />
          </div>
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Record Payout
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Payouts",        value: computed.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Total Gross",    value: fc(totalGross), color: "text-[var(--color-primary)]" },
          { label: "Total TDS",      value: fc(totalTds),   color: "text-orange-400" },
          { label: "Net Disbursed",  value: fc(totalGross - totalTds), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Payout Register</span>
          {computed.length > 0 && (
            <button onClick={() => downloadCsvRows([["Name", "PAN", "Section", "Date", "Gross", "Rate %", "TDS", "Net"], ...computed.map(r => [r.name, r.pan || "NO PAN", r.section, r.date, r.gross, r.rate, r.tds, r.net])], "contractor-payouts.csv")}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV (26Q feed)</button>
          )}
        </div>
        {computed.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)]">No payouts recorded yet.</p>
        ) : (
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                {["Name", "PAN", "Section", "Date", "Gross", "Rate", "TDS", "Net", ""].map(h => (
                  <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono">{r.hasPan ? r.pan : <span className="text-red-400">NO PAN</span>}</td>
                  <td className="px-3 py-2.5">{r.section}</td>
                  <td className="px-3 py-2.5">{r.date}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fc(r.gross)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.rate}%</td>
                  <td className="px-3 py-2.5 tabular-nums text-orange-400">{fc(r.tds)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-green-400 font-semibold">{fc(r.net)}</td>
                  <td className="px-3 py-2.5 text-right"><button onClick={() => removeRow(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">194C contractors who are companies/firms attract 2% — adjust manually if needed. Deposit TDS by the 7th of the next month; file Form 26Q quarterly. Records persist and sync.</p>
    </div>
  );
}

// ── 33. Salary Benchmark by Role/City ──────────────────────────────────────────
function SalaryBenchmarkTab({ employees }: { employees: EmpLite[] }) {
  type Band = { p25: number; p50: number; p75: number };
  // Annual CTC benchmarks (₹), illustrative market medians
  const ROLES: Record<string, Band> = {
    "Accountant":          { p25: 300000, p50: 450000, p75: 650000 },
    "Senior Accountant":   { p25: 500000, p50: 750000, p75: 1100000 },
    "Finance Manager":     { p25: 900000, p50: 1400000, p75: 2200000 },
    "Sales Executive":     { p25: 300000, p50: 450000, p75: 700000 },
    "Sales Manager":       { p25: 800000, p50: 1300000, p75: 2000000 },
    "Operations Executive":{ p25: 280000, p50: 400000, p75: 600000 },
    "Software Engineer":   { p25: 600000, p50: 1200000, p75: 2400000 },
    "HR Executive":        { p25: 300000, p50: 480000, p75: 750000 },
    "Office Admin":        { p25: 220000, p50: 320000, p75: 480000 },
  };
  const CITY_FACTOR: Record<string, number> = {
    "Bengaluru": 1.15, "Mumbai": 1.20, "Delhi NCR": 1.12, "Hyderabad": 1.05,
    "Pune": 1.05, "Chennai": 1.00, "Kolkata": 0.92, "Ahmedabad": 0.90, "Tier-2/3": 0.80,
  };
  const [role, setRole] = useState(Object.keys(ROLES)[0]);
  const [city, setCity] = useState("Bengaluru");
  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const factor = CITY_FACTOR[city] ?? 1;
  const band = ROLES[role];
  const adj = { p25: Math.round(band.p25 * factor), p50: Math.round(band.p50 * factor), p75: Math.round(band.p75 * factor) };
  const emp = employees.find(e => e.id === empId);
  const empCtc = emp ? Number(emp.gross_salary) * 12 : 0;

  let position = "—", posColor = "text-[var(--color-muted)]";
  if (empCtc > 0) {
    if (empCtc < adj.p25) { position = "Below 25th percentile — under-paid"; posColor = "text-red-400"; }
    else if (empCtc < adj.p50) { position = "25th–50th percentile"; posColor = "text-yellow-400"; }
    else if (empCtc < adj.p75) { position = "50th–75th percentile — competitive"; posColor = "text-green-400"; }
    else { position = "Above 75th percentile — premium"; posColor = "text-blue-400"; }
  }
  const gapToMedian = empCtc > 0 ? adj.p50 - empCtc : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Salary Benchmark by Role & City</h3>
        <p className="text-xs text-[var(--color-muted)]">Illustrative market annual-CTC bands adjusted for city cost-of-living. Use as directional pay-band guidance, not a live market feed.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className={inp}>
              {Object.keys(ROLES).map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">City</label>
            <select value={city} onChange={e => setCity(e.target.value)} className={inp}>
              {Object.keys(CITY_FACTOR).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {employees.length > 0 && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Compare an employee</label>
              <select value={empId} onChange={e => setEmpId(e.target.value)} className={inp}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {fc(Number(e.gross_salary) * 12)}/yr</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "25th Percentile", value: fc(adj.p25), color: "text-[var(--color-muted)]" },
          { label: "Median (50th)",   value: fc(adj.p50), color: "text-[var(--color-primary)]" },
          { label: "75th Percentile", value: fc(adj.p75), color: "text-blue-400" },
          { label: "City Factor",     value: `${factor.toFixed(2)}×`, color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {emp && empCtc > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold">{emp.name} · {role} · {city}</p>
              <p className="text-xs text-[var(--color-muted)]">Current CTC {fc(empCtc)}/yr vs median {fc(adj.p50)}/yr</p>
            </div>
            <span className={`text-sm font-bold ${posColor}`}>{position}</span>
          </div>
          {gapToMedian > 0
            ? <p className="text-xs text-orange-400">Below median by {fc(gapToMedian)}/yr — consider a correction of {fc(Math.round(gapToMedian / 12))}/mo to reach market.</p>
            : <p className="text-xs text-green-400">At or above the market median by {fc(Math.abs(gapToMedian))}/yr.</p>}
          {/* simple visual bar */}
          <div className="relative h-2 rounded-full bg-[var(--color-accent)] mt-2">
            <div className="absolute top-0 h-2 rounded-full bg-[var(--color-primary)]/40" style={{ left: 0, width: `${Math.min(100, Math.max(0, (empCtc / adj.p75) * 100))}%` }} />
            <div className="absolute -top-1 w-1 h-4 bg-[var(--color-primary)] rounded" style={{ left: `${Math.min(100, (adj.p50 / adj.p75) * 100)}%` }} title="Median" />
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Bar shows current CTC vs the 75th-percentile cap; the tick marks the median.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Benchmarks are static illustrative medians for SMB roles in India and should be refreshed against a live survey before hiring decisions.</p>
    </div>
  );
}

// ── 34. Appraisal & Increment Cycle Planner ────────────────────────────────────
function AppraisalPlannerTab({ employees }: { employees: EmpLite[] }) {
  const [budgetPct, setBudgetPct] = useState(10); // total hike budget as % of current payroll
  const [hikes, setHikes] = useFeatureState<Record<string, number>>("payroll-appraisal-hikes", {});
  const fc = formatCurrency;

  const currentAnnual = employees.reduce((s, e) => s + Number(e.gross_salary) * 12, 0);
  const budgetAmount = Math.round(currentAnnual * budgetPct / 100);

  const rows = employees.map(e => {
    const annual = Number(e.gross_salary) * 12;
    const hikePct = hikes[e.id] ?? 0;
    const hikeAmt = Math.round(annual * hikePct / 100);
    return { id: e.id, name: e.name, annual, hikePct, hikeAmt, newAnnual: annual + hikeAmt };
  });
  const allocated = rows.reduce((s, r) => s + r.hikeAmt, 0);
  const remaining = budgetAmount - allocated;
  const overBudget = remaining < 0;

  const setHike = (id: string, val: number) => setHikes(prev => ({ ...prev, [id]: Math.max(0, Math.min(100, val)) }));
  const distributeEvenly = () => {
    if (currentAnnual === 0) return;
    const evenPct = budgetPct; // give everyone the same % within budget
    setHikes(Object.fromEntries(employees.map(e => [e.id, evenPct])));
    toast.success(`Applied ${evenPct}% to all employees`);
  };

  if (employees.length === 0) return <EmptyState icon={TrendingUp} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Appraisal & Increment Cycle Planner</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Total hike budget (% of current payroll)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={30} value={budgetPct} onChange={e => setBudgetPct(Number(e.target.value))} className="accent-[var(--color-primary)] w-48" />
            <span className="text-sm font-bold tabular-nums w-12">{budgetPct}%</span>
          </div>
          <button onClick={distributeEvenly} className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] font-medium px-3 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40">Distribute evenly</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current Annual Payroll", value: fc(currentAnnual), color: "text-[var(--color-text)]" },
          { label: "Hike Budget",            value: fc(budgetAmount),  color: "text-[var(--color-primary)]" },
          { label: "Allocated",              value: fc(allocated),     color: overBudget ? "text-red-400" : "text-yellow-400" },
          { label: overBudget ? "Over Budget" : "Remaining", value: fc(Math.abs(remaining)), color: overBudget ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {overBudget && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <span>Allocated increments exceed the budget by {fc(Math.abs(remaining))}. Reduce individual hikes or raise the budget %.</span>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Per-Employee Increment</span>
          <button onClick={() => downloadCsvRows([["Employee", "Current Annual", "Hike %", "Hike Amount", "New Annual"], ...rows.map(r => [r.name, r.annual, r.hikePct, r.hikeAmt, r.newAnnual])], "appraisal-plan.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Current Annual", "Hike %", "Hike Amount", "New Annual"].map(h => (
                <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.annual)}</td>
                <td className="px-4 py-2.5">
                  <input type="number" min={0} max={100} value={r.hikePct} onChange={e => setHike(r.id, Number(e.target.value))}
                    className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-yellow-400">{fc(r.hikeAmt)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)] font-semibold">{fc(r.newAnnual)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 tabular-nums font-bold">{fc(currentAnnual)}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 tabular-nums font-bold text-yellow-400">{fc(allocated)}</td>
              <td className="px-4 py-3 tabular-nums font-bold text-[var(--color-primary)]">{fc(currentAnnual + allocated)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Plan persists and syncs across devices. Hikes do not auto-apply to live salaries — edit each employee's gross after the cycle is finalised.</p>
    </div>
  );
}

// ── 35. Payroll Journal / GL Posting ───────────────────────────────────────────
function PayrollJournalTab({ employees }: { employees: EmpLite[] }) {
  const active = employees.filter(e => (e.status ?? "active") === "active");
  const fc = formatCurrency;

  const totals = active.reduce((acc, e) => {
    const gross = Number(e.gross_salary);
    const basic = Math.round(gross * 0.50);
    const pfWage = Math.min(gross, 15000);
    const pfEmp = Math.round(pfWage * 0.12);
    const pfEr  = Math.round(pfWage * 0.12);
    const esiEmp = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
    const esiEr  = gross <= 21000 ? Math.round(gross * 0.0325) : 0;
    const pt = gross > 15000 ? 200 : (gross > 7500 ? 175 : 0);
    const tds = Math.round(Number(e.tds_monthly ?? 0));
    acc.gross += gross; acc.basic += basic;
    acc.pfEmp += pfEmp; acc.pfEr += pfEr;
    acc.esiEmp += esiEmp; acc.esiEr += esiEr;
    acc.pt += pt; acc.tds += tds;
    return acc;
  }, { gross: 0, basic: 0, pfEmp: 0, pfEr: 0, esiEmp: 0, esiEr: 0, pt: 0, tds: 0 });

  const salaryExpense = totals.gross + totals.pfEr + totals.esiEr; // employer cost
  const netPayable = totals.gross - totals.pfEmp - totals.esiEmp - totals.pt - totals.tds;
  const pfPayable = totals.pfEmp + totals.pfEr;
  const esiPayable = totals.esiEmp + totals.esiEr;

  const entries = [
    { account: "Salaries & Wages (incl. employer contrib)", debit: salaryExpense, credit: 0 },
    { account: "Salaries Payable (net to employees)",       debit: 0, credit: netPayable },
    { account: "PF Payable (EPFO)",                          debit: 0, credit: pfPayable },
    { account: "ESI Payable (ESIC)",                         debit: 0, credit: esiPayable },
    { account: "Professional Tax Payable",                   debit: 0, credit: totals.pt },
    { account: "TDS Payable (Sec 192)",                      debit: 0, credit: totals.tds },
  ];
  const totalDebit  = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const balanced = totalDebit === totalCredit;

  if (employees.length === 0) return <EmptyState icon={BookOpen} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1">Payroll Journal / GL Posting</h3>
        <p className="text-xs text-[var(--color-muted)]">Auto-builds the month-end salary journal voucher (JV) for {active.length} active employees: salary expense debited, net pay and statutory dues credited as payables.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Salary Expense (Dr)", value: fc(salaryExpense), color: "text-orange-400" },
          { label: "Net Payable (Cr)",    value: fc(netPayable),    color: "text-green-400" },
          { label: "Statutory Dues (Cr)", value: fc(pfPayable + esiPayable + totals.pt + totals.tds), color: "text-[var(--color-primary)]" },
          { label: "JV Balanced",         value: balanced ? "Yes" : "No", color: balanced ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Journal Voucher — {format(new Date(), "MMMM yyyy")}</span>
          <button onClick={() => downloadCsvRows([["Account", "Debit", "Credit"], ...entries.map(e => [e.account, e.debit, e.credit]), ["TOTAL", totalDebit, totalCredit]], "payroll-journal.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              <th className="text-left text-xs font-semibold px-4 py-2.5">Ledger Account</th>
              <th className="text-right text-xs font-semibold px-4 py-2.5">Debit</th>
              <th className="text-right text-xs font-semibold px-4 py-2.5">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.account} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5">{e.account}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{e.debit > 0 ? fc(e.debit) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{e.credit > 0 ? fc(e.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-4 py-3 font-bold">Total</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold">{fc(totalDebit)}</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold">{fc(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!balanced && (
        <div className="bg-orange-950/30 border border-orange-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
          <AlertTriangle size={14} className="text-orange-400 shrink-0" />
          <span>Debit and credit do not tie out by {fc(Math.abs(totalDebit - totalCredit))} — review rounding in PF/ESI/PT computation.</span>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">PF/ESI capped at statutory wage ceilings (₹15k PF, ₹21k ESI eligibility). PT taken as ₹200 (Maharashtra) — adjust per state. Post this JV in your books on the salary disbursal date.</p>
    </div>
  );
}

// ── 36. Headcount Cost Forecast ────────────────────────────────────────────────
function HeadcountForecastTab({ employees }: { employees: EmpLite[] }) {
  type Hire = { id: string; role: string; monthlyCtc: number; startMonth: number };
  const [hires, setHires] = useFeatureState<Hire[]>("payroll-planned-hires", []);
  const [form, setForm] = useState({ role: "", monthlyCtc: "", startMonth: "1" });
  const [horizon] = useState(12);
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const fc = formatCurrency;

  // fully-loaded factor: employer PF + ESI + gratuity + bonus accrual ≈ 1.18×
  const LOAD = 1.18;
  const baseMonthly = employees.filter(e => (e.status ?? "active") === "active").reduce((s, e) => s + Number(e.gross_salary), 0);

  const addHire = () => {
    const ctc = parseFloat(form.monthlyCtc) || 0;
    if (!form.role.trim() || ctc <= 0) { toast.error("Role and monthly CTC required"); return; }
    setHires(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: form.role.trim(), monthlyCtc: ctc, startMonth: Number(form.startMonth) || 1 }]);
    setForm({ role: "", monthlyCtc: "", startMonth: "1" });
    toast.success("Planned hire added");
  };
  const removeHire = (id: string) => setHires(prev => prev.filter(h => h.id !== id));

  const months = Array.from({ length: horizon }, (_, i) => {
    const monthIdx = i + 1;
    const newHireCost = hires.filter(h => h.startMonth <= monthIdx).reduce((s, h) => s + h.monthlyCtc, 0);
    const loaded = Math.round((baseMonthly + newHireCost) * LOAD);
    const d = new Date(); d.setMonth(d.getMonth() + i);
    return { label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }), base: baseMonthly, newHireCost, loaded };
  });
  const annualLoaded = months.reduce((s, m) => s + m.loaded, 0);
  const exitLoaded = months[months.length - 1]?.loaded ?? 0;

  if (employees.length === 0 && hires.length === 0) return <EmptyState icon={UsersRound} msg="Add employees or plan a hire below to forecast fully-loaded headcount cost." />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Headcount Cost Forecast (fully-loaded, {horizon} months)</h3>
        <p className="text-xs text-[var(--color-muted)]">Fully-loaded = gross × 1.18 (employer PF + ESI + gratuity + bonus accrual). Add planned hires with a start month to project the ramp.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Planned Role</label>
            <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Sales Executive" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly CTC (₹)</label>
            <input type="number" min={0} value={form.monthlyCtc} onChange={e => setForm(f => ({ ...f, monthlyCtc: e.target.value }))} placeholder="60000" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Start Month (1–{horizon})</label>
            <input type="number" min={1} max={horizon} value={form.startMonth} onChange={e => setForm(f => ({ ...f, startMonth: e.target.value }))} className={inp} />
          </div>
        </div>
        <button onClick={addHire} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Add Planned Hire
        </button>
      </div>

      {hires.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><span className="text-sm font-semibold">Planned Hires</span></div>
          <table className="w-full text-xs min-w-[420px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                {["Role", "Monthly CTC", "Starts Month", ""].map(h => <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {hires.map(h => (
                <tr key={h.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-2.5 font-medium">{h.role}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fc(h.monthlyCtc)}</td>
                  <td className="px-4 py-2.5 tabular-nums">M{h.startMonth}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => removeHire(h.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current Monthly (loaded)", value: fc(Math.round(baseMonthly * LOAD)), color: "text-[var(--color-text)]" },
          { label: "Exit-Month (loaded)",      value: fc(exitLoaded), color: "text-orange-400" },
          { label: "12-Month Total",           value: fc(annualLoaded), color: "text-[var(--color-primary)]" },
          { label: "Planned Hires",            value: hires.length.toString(), color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Monthly Projection</span>
          <button onClick={() => downloadCsvRows([["Month", "Base", "New Hires", "Fully-Loaded"], ...months.map(m => [m.label, m.base, m.newHireCost, m.loaded])], "headcount-forecast.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Month", "Base Payroll", "New Hire Cost", "Fully-Loaded"].map(h => <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.label} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 font-medium">{m.label}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(m.base)}</td>
                <td className="px-4 py-2.5 tabular-nums text-blue-400">{m.newHireCost > 0 ? fc(m.newHireCost) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{fc(m.loaded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Load factor 1.18× is an SMB approximation of employer statutory cost; tune for your basic-split and ESI coverage. Planned hires persist and sync.</p>
    </div>
  );
}

// ── 37. Statutory Bonus & Leave-Encashment Liability ───────────────────────────
function StatutoryLiabilityTab({ employees }: { employees: EmpLite[] }) {
  const [leaveDays, setLeaveDays] = useState(15); // avg accrued earned-leave per employee
  const fc = formatCurrency;

  const rows = employees.map(e => {
    const gross = Number(e.gross_salary);
    const eligibleBonus = gross <= 21000;
    const calcWage = Math.min(gross, 7000);
    const bonusLiab = eligibleBonus ? Math.round(calcWage * 12 * 0.0833) : 0;
    const perDay = gross / 26;
    const leaveLiab = Math.round(perDay * leaveDays);
    return { id: e.id, name: e.name, gross, bonusLiab, leaveLiab, total: bonusLiab + leaveLiab };
  });
  const totalBonus = rows.reduce((s, r) => s + r.bonusLiab, 0);
  const totalLeave = rows.reduce((s, r) => s + r.leaveLiab, 0);
  const grandTotal = totalBonus + totalLeave;

  if (employees.length === 0) return <EmptyState icon={ShieldCheck} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Statutory Bonus & Leave-Encashment Liability</h3>
        <p className="text-xs text-[var(--color-muted)]">Balance-sheet provisions: minimum statutory bonus (8.33% of capped wage) for eligible employees + earned-leave encashment at per-day rate.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">Avg accrued earned-leave per employee (days)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={45} value={leaveDays} onChange={e => setLeaveDays(Number(e.target.value))} className="accent-[var(--color-primary)] w-44" />
            <span className="text-sm font-bold tabular-nums w-10">{leaveDays}d</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Bonus Provision",          value: fc(totalBonus), color: "text-yellow-400" },
          { label: "Leave-Encashment Provision", value: fc(totalLeave), color: "text-blue-400" },
          { label: "Total Liability",           value: fc(grandTotal), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Per-Employee Provisions</span>
          <button onClick={() => downloadCsvRows([["Employee", "Gross", "Bonus Provision", "Leave-Encash Provision", "Total"], ...rows.map(r => [r.name, r.gross, r.bonusLiab, r.leaveLiab, r.total])], "statutory-liability.csv")}
            className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Download size={11} /> CSV</button>
        </div>
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Gross", "Bonus Provision", "Leave-Encash", "Total"].map(h => <th key={h} className="text-left font-semibold px-4 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 font-medium">{r.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{fc(r.gross)}</td>
                <td className="px-4 py-2.5 tabular-nums text-yellow-400">{r.bonusLiab > 0 ? fc(r.bonusLiab) : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums text-blue-400">{fc(r.leaveLiab)}</td>
                <td className="px-4 py-2.5 tabular-nums font-semibold text-orange-400">{fc(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-4 py-3 font-bold" colSpan={2}>Total provision</td>
              <td className="px-4 py-3 tabular-nums font-bold text-yellow-400">{fc(totalBonus)}</td>
              <td className="px-4 py-3 tabular-nums font-bold text-blue-400">{fc(totalLeave)}</td>
              <td className="px-4 py-3 tabular-nums font-bold text-orange-400">{fc(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Book these as current provisions (AS-15 / Ind AS 19). Leave-encashment uses gross ÷ 26 per-day; refine with each employee's actual leave balance from the Attendance register. Verify with your CA.</p>
    </div>
  );
}

// ── 38. Employee Self-Service Payslip Portal link ──────────────────────────────
function PayslipPortalTab({ employees, firmName }: { employees: EmpLite[]; firmName: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [declarations, setDeclarations] = useFeatureState<Record<string, boolean>>("payroll-it-declarations", {});
  const [copied, setCopied] = useState<string | null>(null);
  const fc = formatCurrency;

  const monthLabel = (() => { const [y, m] = month.split("-"); return `${MONTH_NAMES[Number(m) - 1]} ${y}`; })();

  const linkFor = (emp: EmpLite) => {
    const token = btoa(`${emp.id}:${month}`).replace(/=/g, "");
    return `https://portal.headroom.in/payslip/${token}`;
  };
  const messageFor = (emp: EmpLite) => {
    const gross = Number(emp.gross_salary);
    const net = gross - Number(emp.tds_monthly ?? 0);
    return `Hi ${emp.name}, your payslip for ${monthLabel} from ${firmName} is ready. Net pay: ${fc(net)}. View & download: ${linkFor(emp)}\nPlease submit your IT investment declaration if pending.`;
  };

  const share = (emp: EmpLite) => {
    const msg = messageFor(emp);
    if (channel === "whatsapp") {
      const phone = ""; // no stored phone; open compose
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    } else if (emp.email) {
      window.open(`mailto:${emp.email}?subject=${encodeURIComponent(`Payslip — ${monthLabel}`)}&body=${encodeURIComponent(msg)}`, "_blank");
    } else {
      toast.error(`No email on file for ${emp.name}`);
    }
  };
  const copyLink = (emp: EmpLite) => {
    navigator.clipboard.writeText(linkFor(emp)).then(() => { setCopied(emp.id); setTimeout(() => setCopied(null), 1500); });
  };
  const toggleDeclaration = (id: string) => setDeclarations(prev => ({ ...prev, [id]: !prev[id] }));

  const declaredCount = employees.filter(e => declarations[e.id]).length;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  if (employees.length === 0) return <EmptyState icon={Send} msg={EMPTY_HINT} />;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Employee Self-Service Payslip Portal</h3>
        <p className="text-xs text-[var(--color-muted)]">Generate a per-employee payslip link and push it via WhatsApp or email. Track IT-declaration submission status here.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as "whatsapp" | "email")} className={inp}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Employees",            value: employees.length.toString(), color: "text-[var(--color-text)]" },
          { label: "IT Declarations Done", value: `${declaredCount}/${employees.length}`, color: declaredCount === employees.length ? "text-green-400" : "text-yellow-400" },
          { label: "Payslip Month",        value: monthLabel, color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><span className="text-sm font-semibold">Distribution & Declarations</span></div>
        <table className="w-full text-xs min-w-[680px]">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Net Pay", "Portal Link", "IT Declaration", "Send"].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {employees.map(e => {
              const net = Number(e.gross_salary) - Number(e.tds_monthly ?? 0);
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  <td className="px-3 py-2.5 tabular-nums text-green-400 font-semibold">{fc(net)}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => copyLink(e)} className="text-[var(--color-primary)] hover:underline">{copied === e.id ? "Copied!" : "Copy link"}</button>
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!declarations[e.id]} onChange={() => toggleDeclaration(e.id)} className="accent-[var(--color-primary)]" />
                      <span className={declarations[e.id] ? "text-green-400" : "text-[var(--color-muted)]"}>{declarations[e.id] ? "Submitted" : "Pending"}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => share(e)} className="flex items-center gap-1 text-[var(--color-primary)] hover:underline">
                      <Send size={11} /> {channel === "whatsapp" ? "WhatsApp" : "Email"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Portal links are illustrative tokens (portal.headroom.in) — wire to your hosted self-service portal before going live. Declaration status persists and syncs across devices.</p>
    </div>
  );
}

// ── 39. Overtime & Shift-Allowance Calculator ──────────────────────────────────
// Factories Act §59: overtime payable at 2× ordinary wages for hours beyond the
// statutory limit. Ordinary hourly rate computed on (basic + DA) ÷ monthly hours.
function OvertimeShiftTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]       = useState(employees[0]?.id ?? "");
  const [otHours, setOtHours]   = useState(10);
  const [monthHours, setMonthHours] = useState(208); // 26 days × 8h
  const [nightShifts, setNightShifts] = useState(4);
  const [nightAllow, setNightAllow]   = useState(150); // per night-shift
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Timer} msg={EMPTY_HINT} />;

  const emp   = employees.find(e => e.id === empId) ?? employees[0];
  const gross = Number(emp.gross_salary);
  const basicDa = Math.round(gross * 0.50); // basic+DA proxy = 50% of gross
  const hourlyOrdinary = monthHours > 0 ? basicDa / monthHours : 0;
  const otRate  = hourlyOrdinary * 2; // statutory 2×
  const otPay   = Math.round(otRate * otHours);
  const nightPay = nightShifts * nightAllow;
  const totalAddl = otPay + nightPay;

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} /> Overtime & Shift-Allowance Calculator</h3>
        <p className="text-xs text-[var(--color-muted)]">Factories Act §59 mandates overtime at twice ordinary wages. Ordinary hourly rate is computed on basic + DA divided by the month's working hours.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>OT hours this month</label><input type="number" min="0" value={otHours} onChange={e => setOtHours(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Standard monthly hours</label><input type="number" min="1" value={monthHours} onChange={e => setMonthHours(Math.max(1, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Night shifts worked</label><input type="number" min="0" value={nightShifts} onChange={e => setNightShifts(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Night allowance / shift (₹)</label><input type="number" min="0" value={nightAllow} onChange={e => setNightAllow(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ordinary hourly rate", value: fc(Math.round(hourlyOrdinary)), color: "text-[var(--color-text)]" },
          { label: "OT rate (2×)",          value: fc(Math.round(otRate)),          color: "text-blue-400" },
          { label: "Overtime pay",          value: fc(otPay),                       color: "text-orange-400" },
          { label: "Total additional pay",  value: fc(totalAddl),                   color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Basic + DA (proxy 50% of gross)</span><span className="tabular-nums font-semibold">{fc(basicDa)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Overtime ({otHours}h × {fc(Math.round(otRate))})</span><span className="tabular-nums text-orange-400 font-semibold">{fc(otPay)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Night-shift allowance ({nightShifts} × {fc(nightAllow)})</span><span className="tabular-nums text-blue-400 font-semibold">{fc(nightPay)}</span></div>
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Add to {emp.name}'s gross this run</span><span className="tabular-nums font-bold text-[var(--color-primary)]">{fc(totalAddl)}</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Overtime under the Factories Act / state Shops &amp; Establishments Acts is statutorily 2×. Some awards prescribe higher multiples — confirm the applicable rule for your sector.</p>
    </div>
  );
}

// ── 40. Leave Balance & Encashment Calculator ──────────────────────────────────
// Encashment = (basic + DA) ÷ 26 × encashable days. §10(10AA) exemption on
// non-government employees capped at ₹25 lakh lifetime.
function LeaveEncashmentTab({ employees }: { employees: EmpLite[] }) {
  type LeaveRow = { earned: number; availed: number };
  const [rows, setRows] = useFeatureState<Record<string, LeaveRow>>("payroll-leave-balances", {});
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Plane} msg={EMPTY_HINT} />;

  const get = (id: string): LeaveRow => rows[id] ?? { earned: 18, availed: 6 };
  const set = (id: string, patch: Partial<LeaveRow>) =>
    setRows(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));

  const computed = employees.map(e => {
    const r = get(e.id);
    const balance = Math.max(0, r.earned - r.availed);
    const gross = Number(e.gross_salary);
    const basicDa = Math.round(gross * 0.50);
    const perDay = basicDa / 26;
    const encashment = Math.round(perDay * balance);
    return { e, balance, perDay, encashment };
  });
  const totalDays = computed.reduce((s, c) => s + c.balance, 0);
  const totalAmt  = computed.reduce((s, c) => s + c.encashment, 0);

  const numInp = "w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Plane size={14} /> Leave Balance &amp; Encashment</h3>
        <p className="text-xs text-[var(--color-muted)] mt-1">Encashable balance = earned − availed. Encashment value uses (basic + DA) ÷ 26 per leave day. §10(10AA) exemption is capped at ₹25 lakh over a lifetime for non-government staff.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Employees", value: employees.length.toString(), color: "text-[var(--color-text)]" },
          { label: "Encashable days", value: totalDays.toString(), color: "text-blue-400" },
          { label: "Total encashment liability", value: fc(totalAmt), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            {["Employee", "Earned", "Availed", "Balance", "Per-day", "Encashment"].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {computed.map(({ e, balance, perDay, encashment }) => {
              const r = get(e.id);
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  <td className="px-3 py-2.5"><input type="number" min="0" value={r.earned} onChange={ev => set(e.id, { earned: Math.max(0, Number(ev.target.value)) })} className={numInp} /></td>
                  <td className="px-3 py-2.5"><input type="number" min="0" value={r.availed} onChange={ev => set(e.id, { availed: Math.max(0, Number(ev.target.value)) })} className={numInp} /></td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-blue-400">{balance}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(Math.round(perDay))}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-green-400">{fc(encashment)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-3 py-2.5 font-bold" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 tabular-nums font-bold text-blue-400">{totalDays}</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 tabular-nums font-bold text-[var(--color-primary)]">{fc(totalAmt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Balances persist &amp; sync across devices. Provision unutilised leave as a liability (Ind AS 19). Encashment paid on separation is taxable beyond the ₹25 lakh §10(10AA) ceiling.</p>
    </div>
  );
}

// ── 41. Notice-Period Recovery Calculator ──────────────────────────────────────
// Shortfall notice days recovered at (gross ÷ days-in-month) per shortfall day,
// netted against final settlement.
function NoticeRecoveryTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]       = useState(employees[0]?.id ?? "");
  const [required, setRequired] = useState(60);
  const [served, setServed]     = useState(30);
  const [basis, setBasis]       = useState<"gross" | "basic">("gross");
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={LogOut} msg={EMPTY_HINT} />;

  const emp   = employees.find(e => e.id === empId) ?? employees[0];
  const gross = Number(emp.gross_salary);
  const recoveryBase = basis === "gross" ? gross : Math.round(gross * 0.50);
  const perDay  = recoveryBase / 30;
  const shortfall = Math.max(0, required - served);
  const recovery  = Math.round(perDay * shortfall);
  const buyout    = recovery; // amount employee pays to waive shortfall

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><LogOut size={14} /> Notice-Period Recovery</h3>
        <p className="text-xs text-[var(--color-muted)]">Net the shortfall notice days against the employee's full-and-final settlement. Choose the recovery basis per your appointment letter.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Required notice (days)</label><input type="number" min="0" value={required} onChange={e => setRequired(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Days served</label><input type="number" min="0" value={served} onChange={e => setServed(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div>
            <label className={lbl}>Recovery basis</label>
            <select value={basis} onChange={e => setBasis(e.target.value as "gross" | "basic")} className={`${inp} w-full`}>
              <option value="gross">Gross salary</option>
              <option value="basic">Basic (50%)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Shortfall days", value: shortfall.toString(), color: shortfall > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Per-day rate", value: fc(Math.round(perDay)), color: "text-[var(--color-text)]" },
          { label: "Recovery from F&F", value: fc(recovery), color: "text-red-400" },
          { label: "Notice buyout amount", value: fc(buyout), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">{shortfall === 0 ? "Full notice served — no recovery applies." : `${emp.name} served ${served}/${required} days; recover ${fc(recovery)} from final settlement or collect as buyout.`} Recovery on gross may be challenged — many letters limit it to basic. Confirm against the signed appointment terms.</p>
    </div>
  );
}

// ── 42. Salary Advance / Loan Tracker ──────────────────────────────────────────
// Issue advances against salary, set EMI recovery, and track outstanding.
function SalaryAdvanceTab({ employees }: { employees: EmpLite[] }) {
  type Advance = { id: string; empId: string; principal: number; emi: number; paid: number; date: string };
  const [advances, setAdvances] = useFeatureState<Advance[]>("payroll-salary-advances", []);
  const [empId, setEmpId]       = useState(employees[0]?.id ?? "");
  const [principal, setPrincipal] = useState("");
  const [tenure, setTenure]       = useState(6);
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={HandCoins} msg={EMPTY_HINT} />;

  const issue = () => {
    const p = Number(principal);
    if (!empId || !p || p <= 0) { toast.error("Select an employee and enter a valid amount"); return; }
    const emp = employees.find(e => e.id === empId);
    const maxAdvance = emp ? Number(emp.gross_salary) * 3 : Infinity;
    if (p > maxAdvance) { toast.error(`Advance exceeds 3× monthly gross (${fc(maxAdvance)})`); return; }
    const emi = Math.ceil(p / Math.max(1, tenure));
    setAdvances(prev => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, empId, principal: p, emi, paid: 0, date: new Date().toISOString().slice(0, 10) }, ...prev]);
    setPrincipal("");
    toast.success(`Advance of ${fc(p)} issued · EMI ${fc(emi)} × ${tenure}`);
  };
  const recordEmi = (id: string) => setAdvances(prev => prev.map(a => a.id === id ? { ...a, paid: Math.min(a.principal, a.paid + a.emi) } : a));
  const remove = (id: string) => setAdvances(prev => prev.filter(a => a.id !== id));

  const nameOf = (id: string) => employees.find(e => e.id === id)?.name ?? "—";
  const totalOutstanding = advances.reduce((s, a) => s + Math.max(0, a.principal - a.paid), 0);
  const monthlyRecovery  = advances.filter(a => a.paid < a.principal).reduce((s, a) => s + a.emi, 0);

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><HandCoins size={14} /> Salary Advance / Loan Tracker</h3>
        <p className="text-xs text-[var(--color-muted)]">Issue interest-free advances against salary (capped at 3× monthly gross) and recover via EMI in subsequent runs.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Advance amount (₹)</label><input type="number" min="0" value={principal} onChange={e => setPrincipal(e.target.value)} className={`${inp} w-full`} placeholder="25000" /></div>
          <div><label className={lbl}>Recovery tenure (months)</label><input type="number" min="1" value={tenure} onChange={e => setTenure(Math.max(1, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <button onClick={issue} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg text-sm hover:opacity-90">Issue Advance</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Active advances", value: advances.filter(a => a.paid < a.principal).length.toString(), color: "text-[var(--color-text)]" },
          { label: "Total outstanding", value: fc(totalOutstanding), color: "text-orange-400" },
          { label: "Monthly EMI recovery", value: fc(monthlyRecovery), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {advances.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] border border-dashed border-[var(--color-border)] rounded-lg p-6 text-center">No advances issued yet.</p>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["Employee", "Issued", "Principal", "EMI", "Recovered", "Outstanding", ""].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {advances.map(a => {
                const outstanding = Math.max(0, a.principal - a.paid);
                const cleared = outstanding === 0;
                return (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-3 py-2.5 font-medium">{nameOf(a.empId)}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{a.date}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fc(a.principal)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-blue-400">{fc(a.emi)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-green-400">{fc(a.paid)}</td>
                    <td className={`px-3 py-2.5 tabular-nums font-semibold ${cleared ? "text-green-400" : "text-orange-400"}`}>{cleared ? "Cleared" : fc(outstanding)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {!cleared && <button onClick={() => recordEmi(a.id)} className="text-[var(--color-primary)] hover:underline">Record EMI</button>}
                        <button onClick={() => remove(a.id)} className="text-red-400 hover:underline">Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Advances persist &amp; sync across devices. Interest-free advances above ₹20,000 may attract perquisite valuation under Rule 3(7)(i) — check with your CA.</p>
    </div>
  );
}

// ── 43. NPS Employer-Contribution Optimizer (80CCD(2)) ─────────────────────────
// Employer NPS up to 14% of (basic+DA) is deductible u/s 80CCD(2) in the new
// regime (10% in old). Models the take-home/tax trade-off of routing CTC via NPS.
function NpsOptimizerTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]   = useState(employees[0]?.id ?? "");
  const [regime, setRegime] = useState<"new" | "old">("new");
  const [pct, setPct]       = useState(10);
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Landmark} msg={EMPTY_HINT} />;

  const emp   = employees.find(e => e.id === empId) ?? employees[0];
  const gross = Number(emp.gross_salary);
  const annualGross = gross * 12;
  const basicDaAnnual = Math.round(annualGross * 0.50);
  const cap = regime === "new" ? 0.14 : 0.10;
  const cappedPct = Math.min(pct, cap * 100);
  const npsAnnual = Math.round(basicDaAnnual * (cappedPct / 100));

  // Marginal-rate proxy off taxable income (new regime, std deduction 75k).
  const taxableNoNps = Math.max(0, annualGross - 75000);
  const marginalRate =
    taxableNoNps > 1500000 ? 0.30 :
    taxableNoNps > 1200000 ? 0.20 :
    taxableNoNps > 1000000 ? 0.15 :
    taxableNoNps > 700000  ? 0.10 :
    taxableNoNps > 300000  ? 0.05 : 0;
  const taxSaved = Math.round(npsAnnual * marginalRate * 1.04); // incl. 4% cess

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Landmark size={14} /> NPS Employer-Contribution Optimizer</h3>
        <p className="text-xs text-[var(--color-muted)]">Corporate NPS u/s 80CCD(2) is deductible up to {regime === "new" ? "14%" : "10%"} of (basic + DA) — over and above the §80C limit. Route part of CTC via NPS to cut tax without raising cash cost.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Tax regime</label>
            <select value={regime} onChange={e => setRegime(e.target.value as "new" | "old")} className={`${inp} w-full`}>
              <option value="new">New (14% cap)</option>
              <option value="old">Old (10% cap)</option>
            </select>
          </div>
          <div><label className={lbl}>Contribution % of basic+DA</label><input type="number" min="0" max={cap * 100} value={pct} onChange={e => setPct(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Basic + DA (annual)", value: fc(basicDaAnnual), color: "text-[var(--color-text)]" },
          { label: `Applied % (cap ${cap * 100}%)`, value: `${cappedPct}%`, color: cappedPct < pct ? "text-orange-400" : "text-blue-400" },
          { label: "NPS employer contribution / yr", value: fc(npsAnnual), color: "text-[var(--color-primary)]" },
          { label: "Estimated annual tax saved", value: fc(taxSaved), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Monthly employer NPS outflow: {fc(Math.round(npsAnnual / 12))}. Tax saved assumes a {Math.round(marginalRate * 100)}% marginal slab (incl. 4% cess). 80CCD(2) is independent of the ₹1.5L §80C / ₹50k §80CCD(1B) limits. Confirm scheme registration (PRAN) before deducting.</p>
    </div>
  );
}

// ── 44. State-wise Minimum-Wages Compliance Checker ────────────────────────────
// Compares each employee's monthly gross against the applicable state minimum
// wage for the chosen skill category, flagging shortfalls.
const MIN_WAGE: Record<string, { Unskilled: number; SemiSkilled: number; Skilled: number }> = {
  Maharashtra:   { Unskilled: 13000, SemiSkilled: 14500, Skilled: 16000 },
  Karnataka:     { Unskilled: 14400, SemiSkilled: 15600, Skilled: 17000 },
  Delhi:         { Unskilled: 17494, SemiSkilled: 19279, Skilled: 21215 },
  TamilNadu:     { Unskilled: 11500, SemiSkilled: 12800, Skilled: 14200 },
  Gujarat:       { Unskilled: 12000, SemiSkilled: 13000, Skilled: 14500 },
  Telangana:     { Unskilled: 12500, SemiSkilled: 13800, Skilled: 15500 },
  UttarPradesh:  { Unskilled: 10648, SemiSkilled: 11700, Skilled: 13104 },
  WestBengal:    { Unskilled: 10200, SemiSkilled: 11200, Skilled: 12500 },
};
function MinWageCheckTab({ employees }: { employees: EmpLite[] }) {
  const states = Object.keys(MIN_WAGE);
  const [state, setState] = useState(states[0]);
  const [skill, setSkill] = useState<"Unskilled" | "SemiSkilled" | "Skilled">("Unskilled");
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Scale} msg={EMPTY_HINT} />;

  const threshold = MIN_WAGE[state][skill];
  const rows = employees.map(e => {
    const gross = Number(e.gross_salary);
    const shortfall = Math.max(0, threshold - gross);
    return { e, gross, shortfall, compliant: shortfall === 0 };
  });
  const breaches = rows.filter(r => !r.compliant);

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Scale size={14} /> Minimum-Wages Compliance Checker</h3>
        <p className="text-xs text-[var(--color-muted)]">Validate every salary against the state minimum-wage notification for the selected skill category. Underpayment invites prosecution under the Minimum Wages Act / Code on Wages.</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className={lbl}>State of employment</label>
            <select value={state} onChange={e => setState(e.target.value)} className={`${inp} w-full`}>
              {states.map(s => <option key={s} value={s}>{s.replace(/([a-z])([A-Z])/g, "$1 $2")}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Skill category</label>
            <select value={skill} onChange={e => setSkill(e.target.value as typeof skill)} className={`${inp} w-full`}>
              <option value="Unskilled">Unskilled</option>
              <option value="SemiSkilled">Semi-skilled</option>
              <option value="Skilled">Skilled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Applicable minimum / month", value: fc(threshold), color: "text-[var(--color-text)]" },
          { label: "Employees checked", value: employees.length.toString(), color: "text-blue-400" },
          { label: "Below minimum", value: breaches.length.toString(), color: breaches.length > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            {["Employee", "Gross / month", "Minimum", "Shortfall", "Status"].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(({ e, gross, shortfall, compliant }) => (
              <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-3 py-2.5 font-medium">{e.name}</td>
                <td className="px-3 py-2.5 tabular-nums">{fc(gross)}</td>
                <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(threshold)}</td>
                <td className="px-3 py-2.5 tabular-nums text-red-400">{shortfall > 0 ? fc(shortfall) : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] ${compliant ? "bg-green-900/20 text-green-400 border-green-800/30" : "bg-red-900/20 text-red-400 border-red-800/30"}`}>
                    {compliant ? "Compliant" : "Below minimum"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative rates — minimum wages are revised twice yearly (basic + VDA) and vary by scheduled employment. Verify the latest gazette notification for {state.replace(/([a-z])([A-Z])/g, "$1 $2")} before relying on these figures.</p>
    </div>
  );
}

// ── 45. Maternity / Paternity Benefit Calculator ───────────────────────────────
// Maternity Benefit Act 1961 (am. 2017): 26 weeks paid (12 for 3rd+ child),
// average daily wage of the 3 months preceding leave.
function MaternityBenefitTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]     = useState(employees[0]?.id ?? "");
  const [childNo, setChildNo] = useState(1);
  const [paternity, setPaternity] = useState(false);
  const [patDays, setPatDays] = useState(15);
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Baby} msg={EMPTY_HINT} />;

  const emp   = employees.find(e => e.id === empId) ?? employees[0];
  const gross = Number(emp.gross_salary);
  const avgDailyWage = Math.round((gross * 3) / 90); // avg of preceding 3 months
  const matWeeks = childNo >= 3 ? 12 : 26;
  const matDays  = matWeeks * 7;
  const matBenefit = Math.round(avgDailyWage * matDays);
  const patBenefit = paternity ? Math.round(avgDailyWage * patDays) : 0;
  // ESI maternity benefit applies if gross <= 21000 (paid by ESIC, not employer)
  const esiCovered = gross <= 21000;

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Baby size={14} /> Maternity / Paternity Benefit</h3>
        <p className="text-xs text-[var(--color-muted)]">Maternity Benefit Act (2017 amendment): 26 weeks paid leave (12 weeks for the third child onward), at the average daily wage of the preceding 3 months. Paternity leave is policy-driven (no central statute).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Child number</label><input type="number" min="1" value={childNo} onChange={e => setChildNo(Math.max(1, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input type="checkbox" checked={paternity} onChange={e => setPaternity(e.target.checked)} className="accent-[var(--color-primary)]" />
              <span>Add paternity leave</span>
            </label>
          </div>
          {paternity && <div><label className={lbl}>Paternity days</label><input type="number" min="0" value={patDays} onChange={e => setPatDays(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Avg daily wage", value: fc(avgDailyWage), color: "text-[var(--color-text)]" },
          { label: "Maternity entitlement", value: `${matWeeks} wks (${matDays}d)`, color: "text-blue-400" },
          { label: "Maternity benefit payable", value: fc(matBenefit), color: "text-[var(--color-primary)]" },
          { label: "Paternity benefit", value: paternity ? fc(patBenefit) : "—", color: "text-purple-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg px-4 py-3 text-xs border ${esiCovered ? "bg-blue-950/20 border-blue-800/30 text-blue-300" : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-muted)]"}`}>
        {esiCovered
          ? `${emp.name} earns ≤ ₹21,000 — maternity benefit is paid by ESIC, not the employer, provided contributions for the qualifying period are paid. Employer cash cost may be nil.`
          : `${emp.name} is above the ESI ceiling — the employer bears the full ${fc(matBenefit)} maternity benefit as paid leave. Provision it against the run.`}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Eligibility requires ≥80 days worked in the 12 months preceding the expected delivery. A crèche facility is mandatory for establishments with 50+ employees.</p>
    </div>
  );
}

// ── 46. People-Cost-to-Revenue Ratio (Workforce ROI) ──────────────────────────
// Fully-loaded people cost (gross + employer PF/ESI + gratuity provision) vs
// monthly revenue. Healthy SMB people-cost ratio is typically 15–40%.
function PeopleRoiTab({ employees }: { employees: EmpLite[] }) {
  const [revenue, setRevenue] = useFeatureState<number>("payroll-monthly-revenue", 0);
  const fc = formatCurrency;

  const active = employees.filter(e => (e.status ?? "active") === "active");

  const loaded = active.reduce((acc, e) => {
    const gross = Number(e.gross_salary);
    const pfWages = Math.min(gross, 15000);
    const erPf = Math.round(pfWages * 0.12);
    const erEsi = gross <= 21000 ? Math.round(gross * 0.0325) : 0;
    const gratuity = Math.round((15 / 26) * Math.round(gross * 0.50) / 12); // monthly accrual on basic
    return {
      gross: acc.gross + gross,
      statutory: acc.statutory + erPf + erEsi,
      gratuity: acc.gratuity + gratuity,
    };
  }, { gross: 0, statutory: 0, gratuity: 0 });

  const totalLoaded = loaded.gross + loaded.statutory + loaded.gratuity;
  const ratio = revenue > 0 ? (totalLoaded / revenue) * 100 : 0;
  const perHead = active.length > 0 ? Math.round(totalLoaded / active.length) : 0;
  const revPerHead = active.length > 0 && revenue > 0 ? Math.round(revenue / active.length) : 0;
  const band = ratio === 0 ? "—" : ratio <= 25 ? "Lean" : ratio <= 40 ? "Healthy" : ratio <= 60 ? "Elevated" : "High risk";
  const bandColor = ratio === 0 ? "text-[var(--color-muted)]" : ratio <= 40 ? "text-green-400" : ratio <= 60 ? "text-orange-400" : "text-red-400";

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Target size={14} /> People-Cost-to-Revenue Ratio</h3>
        <p className="text-xs text-[var(--color-muted)]">Fully-loaded people cost (gross + employer PF/ESI + gratuity accrual) as a share of monthly revenue. For most Indian SMBs a 15–40% ratio is healthy; above 60% squeezes margins.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly revenue (₹)</label>
          <input type="number" min="0" value={revenue || ""} onChange={e => setRevenue(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} placeholder="e.g. 1500000" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Fully-loaded people cost", value: fc(totalLoaded), color: "text-[var(--color-primary)]" },
          { label: "Cost-to-revenue ratio", value: ratio > 0 ? `${ratio.toFixed(1)}%` : "—", color: bandColor },
          { label: "Cost per head", value: fc(perHead), color: "text-orange-400" },
          { label: "Revenue per head", value: revPerHead > 0 ? fc(revPerHead) : "—", color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Gross salaries ({active.length} active)</span><span className="tabular-nums font-semibold">{fc(loaded.gross)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Employer PF + ESI</span><span className="tabular-nums text-blue-400 font-semibold">{fc(loaded.statutory)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Gratuity accrual</span><span className="tabular-nums text-purple-400 font-semibold">{fc(loaded.gratuity)}</span></div>
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Total monthly people cost</span><span className="tabular-nums font-bold text-[var(--color-primary)]">{fc(totalLoaded)}</span></div>
        {ratio > 0 && <div className="flex justify-between"><span className="font-semibold">Assessment</span><span className={`font-bold ${bandColor}`}>{band}</span></div>}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Revenue persists &amp; syncs across devices. Loaded cost excludes variable pay, bonuses, and benefits — add those for a true CTC ratio. Benchmark against your sector's norm.</p>
    </div>
  );
}

// ── 47. CTC → Take-Home Breakup ────────────────────────────────────────────────
// Annual CTC decomposed into monthly gross, statutory deductions (PF/PT/TDS) and
// net in-hand. Employer PF + gratuity are carved out of CTC, not from gross.
function TakeHomeBreakupTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]   = useState(employees[0]?.id ?? "");
  const [ctcInput, setCtc]  = useState("");
  const [basicPct, setBasic] = useState(40);
  const [regime, setRegime] = useState<"new" | "old">("new");
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Calculator} msg={EMPTY_HINT} />;

  const emp = employees.find(e => e.id === empId) ?? employees[0];
  const annualCtc = ctcInput ? Math.max(0, Number(ctcInput)) : Math.round(Number(emp.gross_salary) * 12 * 1.12);

  // Carve employer PF (12% of basic, capped at 15k wage) + gratuity (4.81% of basic) out of CTC.
  const monthlyBasicGuess = Math.round((annualCtc / 12) * (basicPct / 100));
  const pfWageBasic = Math.min(monthlyBasicGuess, 15000);
  const erPfAnnual  = Math.round(pfWageBasic * 0.12 * 12);
  const gratuityAnnual = Math.round(monthlyBasicGuess * 12 * 0.0481);
  const annualGross = Math.max(0, annualCtc - erPfAnnual - gratuityAnnual);
  const monthlyGross = Math.round(annualGross / 12);
  const monthlyBasic = Math.round(monthlyGross * (basicPct / 100));

  // Monthly statutory: employee PF, PT (₹200), TDS averaged over 12.
  const eePf = Math.round(Math.min(monthlyBasic, 15000) * 0.12);
  const pt   = monthlyGross > 0 ? 200 : 0;
  const stdDed = regime === "new" ? 75000 : 50000;
  const taxable = Math.max(0, annualGross - stdDed - eePf * 12);
  const slabTax = computeSlabTax(taxable, regime === "new" ? NEW_SLAB_BANDS : OLD_SLAB_BANDS);
  const rebateLimit = regime === "new" ? 700000 : 500000;
  const afterRebate = taxable <= rebateLimit ? 0 : slabTax;
  const annualTax = Math.round(afterRebate * 1.04); // + 4% cess
  const tds = Math.round(annualTax / 12);
  const netMonthly = Math.max(0, monthlyGross - eePf - pt - tds);

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  const rows: { label: string; value: number; sign: "+" | "−"; color: string }[] = [
    { label: "Monthly gross", value: monthlyGross, sign: "+", color: "text-[var(--color-text)]" },
    { label: "Employee PF (12% of basic)", value: eePf, sign: "−", color: "text-red-400" },
    { label: "Professional tax", value: pt, sign: "−", color: "text-red-400" },
    { label: "TDS (averaged)", value: tds, sign: "−", color: "text-red-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} /> CTC → Take-Home Breakup</h3>
        <p className="text-xs text-[var(--color-muted)]">Employer PF and gratuity sit inside CTC but never reach the payslip. We carve them out to reveal monthly gross, then net employee PF, PT and averaged TDS to show real in-hand pay.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Annual CTC (₹)</label><input type="number" min="0" value={ctcInput} onChange={e => setCtc(e.target.value)} className={`${inp} w-full`} placeholder={String(annualCtc)} /></div>
          <div><label className={lbl}>Basic % of gross</label><input type="number" min="20" max="60" value={basicPct} onChange={e => setBasic(Math.min(60, Math.max(20, Number(e.target.value))))} className={`${inp} w-full`} /></div>
          <div>
            <label className={lbl}>Tax regime</label>
            <select value={regime} onChange={e => setRegime(e.target.value as "new" | "old")} className={`${inp} w-full`}>
              <option value="new">New regime</option>
              <option value="old">Old regime</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual CTC", value: fc(annualCtc), color: "text-[var(--color-text)]" },
          { label: "Monthly gross", value: fc(monthlyGross), color: "text-blue-400" },
          { label: "Net in-hand / month", value: fc(netMonthly), color: "text-[var(--color-primary)]" },
          { label: "Take-home % of CTC", value: annualCtc > 0 ? `${((netMonthly * 12 / annualCtc) * 100).toFixed(0)}%` : "—", color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between">
            <span className="text-[var(--color-muted)]">{r.sign} {r.label}</span>
            <span className={`tabular-nums font-semibold ${r.color}`}>{r.sign === "−" ? "−" : ""}{fc(r.value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Net in-hand (monthly)</span><span className="tabular-nums font-bold text-[var(--color-primary)]">{fc(netMonthly)}</span></div>
        <div className="flex justify-between text-[var(--color-muted)]"><span>Employer PF + gratuity (in CTC, not paid out)</span><span className="tabular-nums">{fc(Math.round((erPfAnnual + gratuityAnnual) / 12))}/mo</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Estimate only. Ignores ESI (gross ≤ ₹21k), HRA exemption, 80C/80D investments and FBP — those raise take-home further under the old regime. Lock the regime via the optimizer before finalising the offer.</p>
    </div>
  );
}

// ── 48. Attrition / Replacement Cost Calculator ────────────────────────────────
// Quantifies the cost of an exit: separation payout + recruiting + ramp-up
// productivity loss. Persists per-role assumptions.
function AttritionCostTab({ employees }: { employees: EmpLite[] }) {
  type Assump = { recruitPct: number; rampMonths: number; rampLossPct: number; backfillDays: number };
  const [a, setA] = useFeatureState<Assump>("payroll-attrition-assumptions", { recruitPct: 8.33, rampMonths: 3, rampLossPct: 50, backfillDays: 45 });
  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={UserMinus} msg={EMPTY_HINT} />;

  const emp = employees.find(e => e.id === empId) ?? employees[0];
  const monthlyGross = Number(emp.gross_salary);
  const annualCtc = Math.round(monthlyGross * 12 * 1.12);

  const recruiting = Math.round(annualCtc * (a.recruitPct / 100)); // agency/referral/job-board
  const rampLoss   = Math.round(monthlyGross * a.rampMonths * (a.rampLossPct / 100)); // sub-par output during ramp
  const vacancyLoss = Math.round(monthlyGross * (a.backfillDays / 30)); // backfill gap with no output
  const onboarding = Math.round(monthlyGross * 0.5); // IT setup + training time
  const totalCost  = recruiting + rampLoss + vacancyLoss + onboarding;
  const pctOfCtc   = annualCtc > 0 ? (totalCost / annualCtc) * 100 : 0;

  // Org-wide projection: assume same role mix, attrition rate slider via state assumption reused as %.
  const orgGross = employees.reduce((s, e) => s + Number(e.gross_salary), 0);
  const orgAnnualCtc = Math.round(orgGross * 12 * 1.12);
  const blendedPct = annualCtc > 0 ? totalCost / annualCtc : 0;

  const numInp = "w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums";
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const set = (patch: Partial<Assump>) => setA(prev => ({ ...prev, ...patch }));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserMinus size={14} /> Attrition / Replacement Cost</h3>
        <p className="text-xs text-[var(--color-muted)]">Every exit costs far more than the salary saved — recruiting fees, a vacant seat, and months of sub-par ramp-up output. SHRM pegs total replacement cost at 50–200% of annual salary. Tune the assumptions to your business.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Role / employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2"><div><label className="text-xs text-[var(--color-muted)] block mb-1">Recruiting (% of CTC)</label><input type="number" min="0" value={a.recruitPct} onChange={e => set({ recruitPct: Math.max(0, Number(e.target.value)) })} className={numInp} /></div></div>
          <div className="flex items-end gap-2"><div><label className="text-xs text-[var(--color-muted)] block mb-1">Backfill gap (days)</label><input type="number" min="0" value={a.backfillDays} onChange={e => set({ backfillDays: Math.max(0, Number(e.target.value)) })} className={numInp} /></div></div>
          <div className="flex items-end gap-2"><div><label className="text-xs text-[var(--color-muted)] block mb-1">Ramp-up (months)</label><input type="number" min="0" value={a.rampMonths} onChange={e => set({ rampMonths: Math.max(0, Number(e.target.value)) })} className={numInp} /></div></div>
          <div className="flex items-end gap-2"><div><label className="text-xs text-[var(--color-muted)] block mb-1">Ramp productivity loss (%)</label><input type="number" min="0" max="100" value={a.rampLossPct} onChange={e => set({ rampLossPct: Math.min(100, Math.max(0, Number(e.target.value))) })} className={numInp} /></div></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cost per this exit", value: fc(totalCost), color: "text-red-400" },
          { label: "% of annual CTC", value: `${pctOfCtc.toFixed(0)}%`, color: pctOfCtc > 100 ? "text-red-400" : "text-orange-400" },
          { label: "Annual CTC of role", value: fc(annualCtc), color: "text-[var(--color-text)]" },
          { label: "If 1 in 5 of team exits / yr", value: fc(Math.round(orgAnnualCtc * 0.20 * blendedPct)), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Recruiting &amp; hiring</span><span className="tabular-nums font-semibold">{fc(recruiting)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Vacant-seat output loss ({a.backfillDays}d)</span><span className="tabular-nums font-semibold text-orange-400">{fc(vacancyLoss)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Ramp-up productivity loss</span><span className="tabular-nums font-semibold text-orange-400">{fc(rampLoss)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Onboarding &amp; training</span><span className="tabular-nums font-semibold">{fc(onboarding)}</span></div>
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Total replacement cost</span><span className="tabular-nums font-bold text-red-400">{fc(totalCost)}</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Assumptions persist &amp; sync across devices. Excludes knowledge-loss, client-relationship and morale costs which can dwarf the direct spend. A strong counter-offer or retention bonus is often far cheaper than replacing.</p>
    </div>
  );
}

// ── 49. Variable Pay / Incentive Engine ────────────────────────────────────────
// Configure commission/KPI bonuses, see payout per employee, accrue to next run.
function IncentiveEngineTab({ employees }: { employees: EmpLite[] }) {
  type Plan = { ratePct: number; capPct: number };
  const [plan, setPlan] = useFeatureState<Plan>("payroll-incentive-plan", { ratePct: 5, capPct: 30 });
  const [achieved, setAchieved] = useFeatureState<Record<string, { target: number; actual: number }>>("payroll-incentive-achievement", {});
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Coins} msg={EMPTY_HINT} />;

  const get = (id: string) => achieved[id] ?? { target: 1000000, actual: 0 };
  const setA = (id: string, patch: Partial<{ target: number; actual: number }>) =>
    setAchieved(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));

  const computed = employees.map(e => {
    const r = get(e.id);
    const monthlyGross = Number(e.gross_salary);
    const attainment = r.target > 0 ? r.actual / r.target : 0;
    // Commission on achieved revenue; payout capped at capPct of monthly gross.
    const raw = Math.round(r.actual * (plan.ratePct / 100));
    const cap = Math.round(monthlyGross * (plan.capPct / 100));
    const payout = Math.min(raw, cap);
    const capped = raw > cap;
    return { e, attainment, raw, payout, capped };
  });
  const totalPayout = computed.reduce((s, c) => s + c.payout, 0);
  const totalRevenue = computed.reduce((s, c) => s + get(c.e.id).actual, 0);

  const numInp = "w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums";
  const sInp = "w-16 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Coins size={14} /> Variable Pay / Incentive Engine</h3>
        <p className="text-xs text-[var(--color-muted)]">Set a commission rate on achieved revenue with a guardrail cap as a percentage of monthly salary. Capped payouts protect margins on outsized deals. Incentives accrue into the next payroll run.</p>
        <div className="flex flex-wrap gap-4">
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Commission rate (% of revenue)</label><input type="number" min="0" step="0.5" value={plan.ratePct} onChange={e => setPlan(p => ({ ...p, ratePct: Math.max(0, Number(e.target.value)) }))} className={sInp} /></div>
          <div><label className="text-xs text-[var(--color-muted)] block mb-1">Payout cap (% of monthly gross)</label><input type="number" min="0" value={plan.capPct} onChange={e => setPlan(p => ({ ...p, capPct: Math.max(0, Number(e.target.value)) }))} className={sInp} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Revenue achieved", value: fc(totalRevenue), color: "text-[var(--color-text)]" },
          { label: "Total incentive payout", value: fc(totalPayout), color: "text-[var(--color-primary)]" },
          { label: "Effective payout rate", value: totalRevenue > 0 ? `${((totalPayout / totalRevenue) * 100).toFixed(2)}%` : "—", color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[680px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            {["Employee", "Target", "Actual", "Attainment", "Raw commission", "Payout"].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {computed.map(({ e, attainment, raw, payout, capped }) => {
              const r = get(e.id);
              return (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-3 py-2.5 font-medium">{e.name}</td>
                  <td className="px-3 py-2.5"><input type="number" min="0" value={r.target} onChange={ev => setA(e.id, { target: Math.max(0, Number(ev.target.value)) })} className={numInp} /></td>
                  <td className="px-3 py-2.5"><input type="number" min="0" value={r.actual} onChange={ev => setA(e.id, { actual: Math.max(0, Number(ev.target.value)) })} className={numInp} /></td>
                  <td className={`px-3 py-2.5 tabular-nums font-semibold ${attainment >= 1 ? "text-green-400" : attainment >= 0.7 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{(attainment * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(raw)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{fc(payout)}{capped && <span className="ml-1 text-[10px] text-orange-400">capped</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-3 py-2.5 font-bold" colSpan={5}>Total incentive payout</td>
              <td className="px-3 py-2.5 tabular-nums font-bold text-[var(--color-primary)]">{fc(totalPayout)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Plan &amp; achievement persist &amp; sync across devices. Incentive payouts are fully taxable salary — TDS applies in the month paid. Add clawback clauses for reversed/cancelled deals before disbursing.</p>
    </div>
  );
}

// ── 50. Superannuation Fund Calculator ─────────────────────────────────────────
// Employer superannuation contribution (up to 15% of salary, ₹7.5L combined
// annual cap with PF/NPS u/s 17(2)(vii)) and retirement corpus projection.
function SuperannuationTab({ employees }: { employees: EmpLite[] }) {
  const [empId, setEmpId]   = useState(employees[0]?.id ?? "");
  const [ratePct, setRate]  = useState(10);
  const [years, setYears]   = useState(20);
  const [rate, setReturn]   = useState(8);
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Sun} msg={EMPTY_HINT} />;

  const emp = employees.find(e => e.id === empId) ?? employees[0];
  const monthlyGross = Number(emp.gross_salary);
  const basicDa = Math.round(monthlyGross * 0.50);
  const annualContrib = Math.round(basicDa * 12 * (ratePct / 100));
  const exemptCap = 150000; // pre-Budget exemption on superannuation contribution
  const combinedCap = 750000; // PF + NPS + superannuation aggregate cap u/s 17(2)
  const perquisite = Math.max(0, annualContrib - exemptCap);

  // Future-value of a growing annuity (contributions rise with assumed appraisals already netted as flat here).
  const r = rate / 100;
  const corpus = r > 0
    ? Math.round(annualContrib * ((Math.pow(1 + r, years) - 1) / r))
    : annualContrib * years;
  // Monthly pension at 6% annuity rate on corpus.
  const monthlyPension = Math.round((corpus * 0.06) / 12);

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Sun size={14} /> Superannuation Fund</h3>
        <p className="text-xs text-[var(--color-muted)]">Employers may run an approved superannuation fund contributing up to 15% of salary. Contribution is tax-free in the employee's hands up to ₹1.5 lakh; the PF + NPS + superannuation combined annual cap is ₹7.5 lakh u/s 17(2)(vii).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Contribution (% of basic+DA)</label><input type="number" min="0" max="15" value={ratePct} onChange={e => setRate(Math.min(15, Math.max(0, Number(e.target.value))))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Years to retirement</label><input type="number" min="1" max="45" value={years} onChange={e => setYears(Math.min(45, Math.max(1, Number(e.target.value))))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Assumed return (% p.a.)</label><input type="number" min="0" max="20" value={rate} onChange={e => setReturn(Math.min(20, Math.max(0, Number(e.target.value))))} className={`${inp} w-full`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual employer contribution", value: fc(annualContrib), color: "text-[var(--color-text)]" },
          { label: "Taxable perquisite", value: perquisite > 0 ? fc(perquisite) : "Nil", color: perquisite > 0 ? "text-orange-400" : "text-green-400" },
          { label: `Corpus at ${years} yrs`, value: fc(corpus), color: "text-[var(--color-primary)]" },
          { label: "Est. monthly pension", value: fc(monthlyPension), color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Monthly basic + DA (50% of gross)</span><span className="tabular-nums font-semibold">{fc(basicDa)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Annual contribution @ {ratePct}%</span><span className="tabular-nums font-semibold">{fc(annualContrib)}</span></div>
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Tax-free up to</span><span className="tabular-nums text-green-400">{fc(exemptCap)}</span></div>
        {annualContrib > combinedCap && <div className="flex justify-between"><span className="text-orange-400">Exceeds ₹7.5L combined PF+NPS+SAF cap</span><span className="tabular-nums text-orange-400">{fc(annualContrib - combinedCap)}</span></div>}
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Projected retirement corpus</span><span className="tabular-nums font-bold text-[var(--color-primary)]">{fc(corpus)}</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Projection assumes a flat annual contribution and compounding return — real corpus grows with appraisals. Annuity income is taxable; commutation is partly exempt. Set up an approved fund with a recognised insurer (LIC/insurer group SAF).</p>
    </div>
  );
}

// ── 51. Group Insurance (GMC/GTL/GPA) Premium & Benefits ───────────────────────
// Group health (GMC), term life (GTL) and personal-accident (GPA) cover sizing
// and premium estimate, with optional payroll deduction of the employee share.
function GroupInsuranceTab({ employees }: { employees: EmpLite[] }) {
  const [sumGmc, setSumGmc]   = useState(500000);
  const [sumGtlX, setGtlX]    = useState(3); // GTL = multiple of annual CTC
  const [employeeSharePct, setShare] = useState(0);
  const fc = formatCurrency;

  if (employees.length === 0) return <EmptyState icon={Umbrella} msg={EMPTY_HINT} />;

  const active = employees.filter(e => (e.status ?? "active") === "active");
  const headcount = active.length;

  // Indicative annual premium rates per lakh / per cover (typical SMB group rates).
  const gmcRatePerLakh = 4500;  // family floater health, per ₹1L SI per life / yr
  const gtlRatePerLakh = 120;   // term life, per ₹1L SI / yr
  const gpaRatePerLakh = 80;    // personal accident, per ₹1L SI / yr

  const rows = active.map(e => {
    const annualCtc = Math.round(Number(e.gross_salary) * 12 * 1.12);
    const gtlSi = annualCtc * sumGtlX;
    const gpaSi = annualCtc * sumGtlX; // GPA usually mirrors GTL multiple
    const gmcPrem = Math.round((sumGmc / 100000) * gmcRatePerLakh);
    const gtlPrem = Math.round((gtlSi / 100000) * gtlRatePerLakh);
    const gpaPrem = Math.round((gpaSi / 100000) * gpaRatePerLakh);
    const total = gmcPrem + gtlPrem + gpaPrem;
    return { e, gtlSi, total };
  });
  const totalPremium = rows.reduce((s, r) => s + r.total, 0);
  const gstPremium   = Math.round(totalPremium * 0.18);
  const grossPremium = totalPremium + gstPremium;
  const employeeShare = Math.round((totalPremium * (employeeSharePct / 100)));
  const employerCost  = grossPremium - employeeShare;
  const perHeadDeduction = headcount > 0 ? Math.round(employeeShare / headcount / 12) : 0;

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Umbrella size={14} /> Group Insurance — GMC · GTL · GPA</h3>
        <p className="text-xs text-[var(--color-muted)]">Size group health (GMC), term life (GTL) and personal-accident (GPA) cover for the team and estimate the annual premium. Optionally deduct a share of the GMC premium from payroll. Rates are indicative SMB group rates — your insurer's quote will vary.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={lbl}>GMC sum insured / life (₹)</label>
            <select value={sumGmc} onChange={e => setSumGmc(Number(e.target.value))} className={`${inp} w-full`}>
              {[300000, 500000, 750000, 1000000].map(s => <option key={s} value={s}>{fc(s)}</option>)}
            </select>
          </div>
          <div><label className={lbl}>GTL / GPA cover (× annual CTC)</label><input type="number" min="1" max="10" value={sumGtlX} onChange={e => setGtlX(Math.min(10, Math.max(1, Number(e.target.value))))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Employee share of GMC (%)</label><input type="number" min="0" max="100" value={employeeSharePct} onChange={e => setShare(Math.min(100, Math.max(0, Number(e.target.value))))} className={`${inp} w-full`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annual premium (net)", value: fc(totalPremium), color: "text-[var(--color-text)]" },
          { label: "Premium + 18% GST", value: fc(grossPremium), color: "text-[var(--color-primary)]" },
          { label: "Employer cost", value: fc(employerCost), color: "text-blue-400" },
          { label: "Employee deduction / mo", value: perHeadDeduction > 0 ? fc(perHeadDeduction) : "Nil", color: perHeadDeduction > 0 ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[560px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            {["Employee", "GMC SI", "GTL / GPA SI", "Annual premium"].map(h => <th key={h} className="text-left font-semibold px-3 py-2.5">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(({ e, gtlSi, total }) => (
              <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-3 py-2.5 font-medium">{e.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(sumGmc)}</td>
                <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{fc(gtlSi)}</td>
                <td className="px-3 py-2.5 tabular-nums font-semibold text-[var(--color-primary)]">{fc(total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-3 py-2.5 font-bold" colSpan={3}>Total annual premium (net of GST)</td>
              <td className="px-3 py-2.5 tabular-nums font-bold text-[var(--color-primary)]">{fc(totalPremium)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative estimate for {headcount} active lives. Actual premium depends on age mix, claim history, family-floater size and waiting-period waivers. Employer-paid group health premium is a deductible business expense; the employee share deducted via payroll is post-tax.</p>
    </div>
  );
}

// ── 52. PF / ESI Challan Summary ───────────────────────────────────────────────
// Consolidated EPFO challan (EPF A/C 1, EPS A/C 10, EDLI A/C 21, admin A/C 2)
// plus the ESIC challan (0.75% / 3.25%) for the month — ready-reckoner before
// deposit. Mirrors the ECR PF math (₹15k wage ceiling) and ESI ₹21k threshold.
function PfEsiChallanTab({ employees }: { employees: EmpLite[] }) {
  const fc = formatCurrency;
  if (employees.length === 0) return <EmptyState icon={ClipboardList} msg={EMPTY_HINT} />;

  const active = employees.filter(e => (e.status ?? "active") === "active");
  const PF_CEIL = 15000, ESI_LIMIT = 21000, EPS_CAP = 1250;

  let pfWages = 0, eeEpf = 0, eps = 0, erEpf = 0, edli = 0, adminEpf = 0;
  let esiWages = 0, eeEsi = 0, erEsi = 0, esiLives = 0;
  for (const e of active) {
    const gross = Number(e.gross_salary);
    const wages = Math.min(gross, PF_CEIL);
    const ee = Math.round(wages * 0.12);
    const epsAmt = Math.min(Math.round(wages * 0.0833), EPS_CAP);
    pfWages += wages;
    eeEpf += ee;
    eps += epsAmt;
    erEpf += ee - epsAmt;                 // employer EPF (A/C 1) = 12% less EPS
    edli += Math.round(wages * 0.005);    // EDLI A/C 21 @ 0.50%
    adminEpf += Math.round(wages * 0.005);// admin A/C 2 @ 0.50% (min ₹500 handled below)
    if (gross <= ESI_LIMIT) {
      esiWages += gross;
      eeEsi += Math.round(gross * 0.0075);
      erEsi += Math.round(gross * 0.0325);
      esiLives += 1;
    }
  }
  adminEpf = Math.max(adminEpf, active.length > 0 ? 500 : 0); // EPFO minimum admin charge ₹500
  const ac1 = eeEpf + erEpf;            // A/C 1 = EE EPF + ER EPF difference
  const pfChallan = ac1 + eps + edli + adminEpf;
  const esiChallan = eeEsi + erEsi;
  const due = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15), "dd MMM yyyy");

  const acRow = (ac: string, label: string, amt: number) => (
    <tr key={ac} className="border-b border-[var(--color-border)] last:border-0">
      <td className="px-3 py-2.5 font-mono text-[var(--color-muted)]">{ac}</td>
      <td className="px-3 py-2.5">{label}</td>
      <td className="px-3 py-2.5 tabular-nums text-right font-semibold">{fc(amt)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ClipboardList size={14} /> PF / ESI Challan Summary — {format(new Date(), "MMMM yyyy")}</h3>
        <p className="text-xs text-[var(--color-muted)]">Consolidated EPFO and ESIC challan totals for {active.length} active employees, ready to cross-check before depositing. PF on the ₹15,000 wage ceiling; ESI on gross up to ₹21,000. Both due by the 15th of the following month.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "EPFO challan total", value: fc(pfChallan), color: "text-[var(--color-primary)]" },
          { label: "ESIC challan total", value: fc(esiChallan), color: "text-blue-400" },
          { label: "Combined remittance", value: fc(pfChallan + esiChallan), color: "text-orange-400" },
          { label: "Due date", value: due, color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
              {["A/C", "EPFO head", "Amount"].map(h => <th key={h} className={`font-semibold px-3 py-2.5 ${h === "Amount" ? "text-right" : "text-left"}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {acRow("A/C 1", "EPF contribution (EE + ER)", ac1)}
              {acRow("A/C 10", "EPS contribution (8.33%, ≤ ₹1,250)", eps)}
              {acRow("A/C 21", "EDLI contribution (0.50%)", edli)}
              {acRow("A/C 2", "EPF administration (0.50%, min ₹500)", adminEpf)}
            </tbody>
            <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
              <tr><td className="px-3 py-2.5 font-bold" colSpan={2}>EPFO challan total</td><td className="px-3 py-2.5 tabular-nums text-right font-bold text-[var(--color-primary)]">{fc(pfChallan)}</td></tr>
            </tfoot>
          </table>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
          <h4 className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide">ESIC challan ({esiLives} insured)</h4>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">ESI wages</span><span className="tabular-nums">{fc(esiWages)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Employee share (0.75%)</span><span className="tabular-nums">{fc(eeEsi)}</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">Employer share (3.25%)</span><span className="tabular-nums">{fc(erEsi)}</span></div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">ESIC challan total</span><span className="tabular-nums font-bold text-blue-400">{fc(esiChallan)}</span></div>
          <p className="text-[10px] text-[var(--color-muted)] pt-1">PF wages base {fc(pfWages)}. Employees above ₹21,000 are out of ESI; those above the ceiling at the start of a contribution period stay covered until it ends.</p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Indicative totals — generate the actual ECR on the EPFO portal and the ESI return on the ESIC portal, then pay the system-generated challan. Late deposit attracts interest u/s 7Q and damages u/s 14B (PF) and 12% interest (ESI).</p>
    </div>
  );
}

// ── 53. Payroll Register Summary ───────────────────────────────────────────────
// One-page month register: earnings, statutory deductions and net pay per head
// with a grand-total footer — the classic MIS "salary register" finance signs off.
function PayrollRegisterTab({ employees }: { employees: EmpLite[] }) {
  const fc = formatCurrency;
  if (employees.length === 0) return <EmptyState icon={FileSpreadsheet} msg={EMPTY_HINT} />;

  const active = employees.filter(e => (e.status ?? "active") === "active");
  const PF_CEIL = 15000, ESI_LIMIT = 21000;

  const rows = active.map(e => {
    const gross = Number(e.gross_salary);
    const pfWages = Math.min(gross, PF_CEIL);
    const pf = Math.round(pfWages * 0.12);
    const esi = gross <= ESI_LIMIT ? Math.round(gross * 0.0075) : 0;
    const tds = Number(e.tds_monthly ?? 0);
    const ded = pf + esi + tds;
    const net = gross - ded;
    return { e, gross, pf, esi, tds, ded, net };
  });
  const t = rows.reduce((a, r) => ({
    gross: a.gross + r.gross, pf: a.pf + r.pf, esi: a.esi + r.esi,
    tds: a.tds + r.tds, ded: a.ded + r.ded, net: a.net + r.net,
  }), { gross: 0, pf: 0, esi: 0, tds: 0, ded: 0, net: 0 });

  const downloadCsv = () => {
    const header = "Employee,Gross,EPF,ESI,TDS,Total Deductions,Net Pay";
    const body = rows.map(r => `${r.e.name},${Math.round(r.gross)},${r.pf},${r.esi},${Math.round(r.tds)},${Math.round(r.ded)},${Math.round(r.net)}`);
    const footer = `Total,${Math.round(t.gross)},${t.pf},${t.esi},${Math.round(t.tds)},${Math.round(t.ded)},${Math.round(t.net)}`;
    const csv = [header, ...body, footer].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payroll_Register_${format(new Date(), "MMM_yyyy")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Salary register exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><FileSpreadsheet size={14} /> Payroll Register — {format(new Date(), "MMMM yyyy")}</h3>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Per-employee earnings, statutory deductions and net pay for {active.length} active employees, with a signed-off grand total.</p>
        </div>
        <button onClick={downloadCsv} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Download size={12} /> Export register (.csv)
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total gross", value: fc(t.gross), color: "text-[var(--color-text)]" },
          { label: "Total deductions", value: fc(t.ded), color: "text-orange-400" },
          { label: "Net disbursement", value: fc(t.net), color: "text-[var(--color-primary)]" },
          { label: "Statutory (PF+ESI+TDS)", value: fc(t.pf + t.esi + t.tds), color: "text-blue-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[680px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
            {["Employee", "Gross", "EPF", "ESI", "TDS", "Deductions", "Net pay"].map(h => <th key={h} className={`font-semibold px-3 py-2.5 ${h === "Employee" ? "text-left" : "text-right"}`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.e.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-3 py-2.5 font-medium">{r.e.name}</td>
                <td className="px-3 py-2.5 tabular-nums text-right">{fc(r.gross)}</td>
                <td className="px-3 py-2.5 tabular-nums text-right text-orange-400">{fc(r.pf)}</td>
                <td className="px-3 py-2.5 tabular-nums text-right text-blue-400">{r.esi > 0 ? fc(r.esi) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums text-right text-purple-400">{r.tds > 0 ? fc(r.tds) : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums text-right">{fc(r.ded)}</td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-[var(--color-primary)]">{fc(r.net)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)]">
            <tr>
              <td className="px-3 py-2.5 font-bold">Total ({active.length})</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-bold">{fc(t.gross)}</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-orange-400">{fc(t.pf)}</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-blue-400">{fc(t.esi)}</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-purple-400">{fc(t.tds)}</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-bold">{fc(t.ded)}</td>
              <td className="px-3 py-2.5 tabular-nums text-right font-bold text-[var(--color-primary)]">{fc(t.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">EPF shown is the employee 12% share; ESI is the employee 0.75% share. Employer contributions and PT/LWF (handled in their own tabs) are not netted here. TDS is the configured monthly figure per employee.</p>
    </div>
  );
}

// ── 54. Penalty & Interest Predictor ───────────────────────────────────────────
// Estimate the cost of a late PF / ESI / TDS deposit: PF interest u/s 7Q (12% p.a.)
// + damages u/s 14B (slab by delay), ESI 12% p.a., and TDS 1.5%/month u/s 201(1A).
function PenaltyPredictorTab({ employees }: { employees: EmpLite[] }) {
  const fc = formatCurrency;
  const [head, setHead]   = useState<"pf" | "esi" | "tds">("pf");
  const [amount, setAmt]  = useState(100000);
  const [days, setDays]   = useState(30);
  if (employees.length === 0) return <EmptyState icon={Gauge} msg={EMPTY_HINT} />;

  // PF: interest 7Q @12% p.a. simple; damages 14B by delay band (annualised %).
  const damages14bRate = days <= 60 ? 0.05 : days <= 120 ? 0.10 : days <= 180 ? 0.15 : 0.25;
  const pfInterest = Math.round(amount * 0.12 * (days / 365));
  const pfDamages  = Math.round(amount * damages14bRate * (days / 365));
  // ESI: 12% p.a. simple interest for delayed payment.
  const esiInterest = Math.round(amount * 0.12 * (days / 365));
  // TDS: 1.5% per month (or part) from deduction to deposit, u/s 201(1A).
  const tdsMonths = Math.ceil(days / 30);
  const tdsInterest = Math.round(amount * 0.015 * tdsMonths);

  const result = head === "pf"
    ? { lines: [["Interest u/s 7Q (12% p.a.)", pfInterest], ["Damages u/s 14B", pfDamages]] as const, total: pfInterest + pfDamages }
    : head === "esi"
    ? { lines: [["Interest @ 12% p.a.", esiInterest]] as const, total: esiInterest }
    : { lines: [[`Interest 1.5%/mo × ${tdsMonths} mo`, tdsInterest]] as const, total: tdsInterest };

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Gauge size={14} /> Penalty &amp; Interest Predictor</h3>
        <p className="text-xs text-[var(--color-muted)]">Estimate the extra cost of depositing PF, ESI or salary TDS late, before the delay actually happens — so you can decide whether to borrow short-term and stay compliant.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Statutory head</label>
            <select value={head} onChange={e => setHead(e.target.value as "pf" | "esi" | "tds")} className={`${inp} w-full`}>
              <option value="pf">Provident Fund (EPF)</option>
              <option value="esi">ESI</option>
              <option value="tds">Salary TDS (192)</option>
            </select>
          </div>
          <div><label className={lbl}>Challan amount (₹)</label><input type="number" min="0" value={amount} onChange={e => setAmt(Math.max(0, Number(e.target.value)))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Delay (days past due)</label><input type="number" min="0" max="730" value={days} onChange={e => setDays(Math.min(730, Math.max(0, Number(e.target.value))))} className={`${inp} w-full`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Principal due", value: fc(amount), color: "text-[var(--color-text)]" },
          { label: "Penalty + interest", value: fc(result.total), color: "text-red-400" },
          { label: "Effective cost of delay", value: amount > 0 ? `${((result.total / amount) * 100).toFixed(2)}%` : "—", color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        {result.lines.map(([label, amt]) => (
          <div key={label} className="flex justify-between"><span className="text-[var(--color-muted)]">{label}</span><span className="tabular-nums font-semibold text-red-400">{fc(amt)}</span></div>
        ))}
        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Total payable if deposited late</span><span className="tabular-nums font-bold">{fc(amount + result.total)}</span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Estimates only. PF damages u/s 14B are charged at slab rates (5%–25% p.a. by delay length) plus 12% interest u/s 7Q; ESI levies 12% p.a.; TDS attracts 1.5% per month (or part) u/s 201(1A) from the date deducted to the date deposited. The EPFO/ESIC/TRACES portal computes the exact figure.</p>
    </div>
  );
}

// ── 55. Loss-of-Pay (LWP) Impact ───────────────────────────────────────────────
// Model how unpaid-leave days for one employee shrink net pay and statutory bases
// for the month (per-calendar-day proration on gross), before processing the run.
function LwpImpactTab({ employees }: { employees: EmpLite[] }) {
  const fc = formatCurrency;
  const [empId, setEmpId] = useState(employees[0]?.id ?? "");
  const [lwpDays, setLwp] = useState(2);
  if (employees.length === 0) return <EmptyState icon={CalendarClock} msg={EMPTY_HINT} />;

  const emp = employees.find(e => e.id === empId) ?? employees[0];
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const clampedLwp = Math.min(Math.max(0, lwpDays), daysInMonth);
  const paidDays = daysInMonth - clampedLwp;

  const fullGross = Number(emp.gross_salary);
  const perDay = fullGross / daysInMonth;
  const lopAmount = Math.round(perDay * clampedLwp);
  const proratedGross = fullGross - lopAmount;

  const PF_CEIL = 15000, ESI_LIMIT = 21000;
  const pfFull = Math.round(Math.min(fullGross, PF_CEIL) * 0.12);
  const pfPro  = Math.round(Math.min(proratedGross, PF_CEIL) * 0.12);
  const esiFull = fullGross <= ESI_LIMIT ? Math.round(fullGross * 0.0075) : 0;
  const esiPro  = proratedGross <= ESI_LIMIT ? Math.round(proratedGross * 0.0075) : 0;
  const tds = Number(emp.tds_monthly ?? 0);
  const netFull = fullGross - pfFull - esiFull - tds;
  const netPro  = proratedGross - pfPro - esiPro - tds;

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs text-[var(--color-muted)] block mb-1";
  const cmp = (label: string, full: number, pro: number) => (
    <div key={label} className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">{label}</span><span className="tabular-nums"><span className="text-[var(--color-muted)] line-through mr-2">{fc(full)}</span><span className="font-semibold">{fc(pro)}</span></span></div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} /> Loss-of-Pay (LWP) Impact</h3>
        <p className="text-xs text-[var(--color-muted)]">See how unpaid / unapproved-absence days for {format(now, "MMMM yyyy")} ({daysInMonth} calendar days) reduce gross, statutory deductions and net pay — before you lock the run.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className={lbl}>Employee</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={`${inp} w-full`}>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div><label className={lbl}>LWP / LOP days</label><input type="number" min="0" max={daysInMonth} value={lwpDays} onChange={e => setLwp(Math.min(daysInMonth, Math.max(0, Number(e.target.value))))} className={`${inp} w-full`} /></div>
          <div><label className={lbl}>Paid days</label><input type="number" value={paidDays} readOnly className={`${inp} w-full opacity-60`} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "LOP deduction", value: fc(lopAmount), color: "text-red-400" },
          { label: "Prorated gross", value: fc(proratedGross), color: "text-[var(--color-text)]" },
          { label: "Net pay (after LOP)", value: fc(netPro), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-1.5">
        <div className="flex justify-between text-[10px] text-[var(--color-muted)] uppercase tracking-wide pb-1"><span>Component</span><span>Full → after {clampedLwp} LWP day(s)</span></div>
        {cmp("Gross salary", fullGross, proratedGross)}
        {cmp("EPF (12%)", pfFull, pfPro)}
        {cmp("ESI (0.75%)", esiFull, esiPro)}
        <div className="flex justify-between gap-3"><span className="text-[var(--color-muted)]">TDS (unchanged)</span><span className="tabular-nums font-semibold">{fc(tds)}</span></div>
        <div className="flex justify-between gap-3 border-t border-[var(--color-border)] pt-1.5 mt-1.5"><span className="font-semibold">Net pay</span><span className="tabular-nums"><span className="text-[var(--color-muted)] line-through mr-2">{fc(netFull)}</span><span className="font-bold text-[var(--color-primary)]">{fc(netPro)}</span></span></div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Proration is on calendar days (gross ÷ {daysInMonth} × LWP). Some employers prorate on working days or a fixed 30-day base — align with your offer letter. PF/ESI fall as the prorated wage drops; TDS is shown unchanged here and should be re-averaged across the year when finalising the run.</p>
    </div>
  );
}
