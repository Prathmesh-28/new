import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { exportElementAsPdf as exportPdf } from "@/lib/exporters";
import { Users, Plus, Play, X, CheckCircle2, Clock, ChevronDown, ChevronUp, Banknote, FileText, Download, Building2, FileCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PreviewBadge from "@/components/PreviewBadge";

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
                {formatCurrency(Math.max(0, (() => {
                  const ann = parseFloat(form.gross_salary) * 12;
                  let tds = 0;
                  if (ann > 300000) tds = Math.min(ann - 300000, 300000) * 0.05;
                  if (ann > 600000) tds += Math.min(ann - 600000, 300000) * 0.10;
                  if (ann > 900000) tds += Math.min(ann - 900000, 300000) * 0.15;
                  if (ann > 1200000) tds += Math.min(ann - 1200000, 300000) * 0.20;
                  if (ann > 1500000) tds += (ann - 1500000) * 0.30;
                  return tds / 12;
                })()))}
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns]           = useState<PayrollRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [expandRun, setExpandRun] = useState<string | null>(null);
  const [running, setRunning]     = useState(false);
  const [tab, setTab]             = useState<"employees" | "runs" | "ewa" | "slips" | "form16" | "ecr" | "labor" | "fnf" | "variance">("employees");
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
    await api.post(`/api/payroll/runs/${runId}/disburse`, {}).catch(() => toast.error("Failed to disburse"));
    toast.success("Payroll marked as disbursed");
    load();
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
        {([["employees", `Employees (${employees.length})`, Users], ["runs", `Payroll runs (${runs.length})`, Play], ["ewa", "EWA", Banknote], ["slips", "Salary Slips", FileText], ["form16", "Form 16", FileCheck], ["ecr", "PF ECR", Download], ["labor", "ESI / Bonus", CheckCircle2], ["fnf", "F&F Settlement", FileText], ["variance", "Variance", Building2]] as const).map(([id, label, Icon]) => (
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
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
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
                  const net = parseFloat(String(e.gross_salary)) - parseFloat(String(e.tds_monthly));
                  return (
                    <tr key={e.id} className="hover:bg-white/2">
                      <td className="px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 inline-flex items-center justify-center text-xs font-bold text-[var(--color-primary)] mr-2">{e.name[0].toUpperCase()}</div>
                        {e.name}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{e.email ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{formatCurrency(parseFloat(String(e.gross_salary)))}</td>
                      <td className="px-4 py-3 tabular-nums text-orange-400">{formatCurrency(parseFloat(String(e.tds_monthly)))}</td>
                      <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{formatCurrency(net)}</td>
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
        )
      ) : (
        runs.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-10 text-center text-sm text-[var(--color-muted)]">
            No payroll runs yet. Click "Run Payroll" to process this month.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map(run => {
              const expanded = expandRun === run.id;
              return (
                <div key={run.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{MONTH_NAMES[run.run_month - 1]} {run.run_year}</p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">
                        {formatCurrency(run.total_gross)} gross · {formatCurrency(run.total_tds)} TDS ·{" "}
                        <span className="text-green-400 font-semibold">{formatCurrency(run.total_net)} net</span>
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
                      {run.breakdown && (
                        <button onClick={() => setExpandRun(expanded ? null : run.id)}
                          className="text-[var(--color-muted)] hover:text-[var(--color-text)]">
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && run.breakdown && (
                    <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[var(--color-muted)]">
                            <th className="text-left pb-1.5">Employee</th>
                            <th className="text-right pb-1.5">Gross</th>
                            <th className="text-right pb-1.5">TDS</th>
                            <th className="text-right pb-1.5">Net</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {run.breakdown.map(b => (
                            <tr key={b.employee_id}>
                              <td className="py-1">{b.name}</td>
                              <td className="py-1 text-right tabular-nums">{formatCurrency(b.gross)}</td>
                              <td className="py-1 text-right tabular-nums text-orange-400">{formatCurrency(b.tds)}</td>
                              <td className="py-1 text-right tabular-nums text-green-400 font-semibold">{formatCurrency(b.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

        const gross     = parseFloat(String(emp.gross_salary));
        const basic     = Math.round(gross * 0.50);
        const hra       = Math.round(gross * 0.20);
        const special   = Math.round(gross * 0.20);
        const transport = Math.round(gross * 0.10);
        const pf        = Math.round(basic * 0.12);
        const profTax   = gross > 15000 ? 200 : 0;
        const tds       = Math.round(parseFloat(String(emp.tds_monthly)));
        const totalDeductions = pf + profTax + tds;
        const net       = gross - totalDeductions;
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
                        ["Transport Allowance",   transport],
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
