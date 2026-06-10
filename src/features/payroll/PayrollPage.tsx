import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Users, Plus, Play, X, CheckCircle2, Clock, ChevronDown, ChevronUp, Banknote } from "lucide-react";
import { toast } from "sonner";

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns]           = useState<PayrollRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [expandRun, setExpandRun] = useState<string | null>(null);
  const [running, setRunning]     = useState(false);
  const [tab, setTab]             = useState<"employees" | "runs" | "ewa">("employees");
  const [ewaData, setEwaData]     = useState<{ day_of_month: number; employees: { id: string; name: string; gross_salary: number; earned_to_date: number; max_advance: number; advances_taken: number }[] } | null>(null);
  const [ewaLoading, setEwaLoading] = useState(false);
  const [requesting, setRequesting] = useState<Record<string, boolean>>({});

  const now = new Date();
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
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([["employees", `Employees (${employees.length})`, Users], ["runs", `Payroll runs (${runs.length})`, Play], ["ewa", "EWA", Banknote]] as const).map(([id, label, Icon]) => (
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
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
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
              <p className="text-sm font-semibold text-blue-300 mb-0.5">Earned Wage Access · Day {ewaData.day_of_month} of month</p>
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

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  );
}
