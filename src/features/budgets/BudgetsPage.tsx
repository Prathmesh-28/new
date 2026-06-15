import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { Plus, X, AlertTriangle, TrendingUp, TrendingDown, RotateCcw, Building2, HardHat, CheckCircle2, Clock, CalendarRange, GitCompareArrows, SlidersHorizontal, Wallet, Users, FolderKanban, Gauge, Repeat } from "lucide-react";
import { toast } from "sonner";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import type { Budget } from "@/data/types";

function AddBudgetModal({ existing, onSave, onClose }: {
  existing?: Budget;
  onSave: (b: Budget) => void;
  onClose: () => void;
}) {
  const [label,  setLabel]  = useState(existing?.label  ?? "");
  const [cat,    setCat]    = useState(existing?.category ?? "expense");
  const [limit,  setLimit]  = useState(existing?.monthlyLimit.toString() ?? "");
  const [color,  setColor]  = useState(existing?.color ?? "#3b82f6");

  const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f97316", "#a855f7", "#eab308", "#06b6d4", "#ec4899"];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(limit);
    if (!label || isNaN(amt) || amt <= 0) { toast.error("Fill all fields"); return; }
    onSave({ id: existing?.id ?? crypto.randomUUID(), category: cat, label, monthlyLimit: amt, color });
    onClose();
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{existing ? "Edit Budget" : "New Budget"}</h2>
          <button onClick={onClose}><X size={15} className="text-[var(--color-muted)]" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Budget name *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Marketing" required className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Category *</label>
            <select value={cat} onChange={e => setCat(e.target.value)} className={inp}>
              {["expense","payroll","tax","loan","transfer","other"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly limit (₹) *</label>
            <input type="number" min="1" value={limit} onChange={e => setLimit(e.target.value)} required className={inp} placeholder="e.g. 200000" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
              {existing ? "Save Changes" : "Create Budget"}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const { store, addBudget, updateBudget, deleteBudget } = useApp();
  const { transactions, budgets } = store;
  const [adding,  setAdding]  = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  const now    = new Date();
  const m1s    = startOfMonth(now).toISOString().split("T")[0];
  const m1e    = endOfMonth(now).toISOString().split("T")[0];
  const m2s    = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
  const m2e    = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
  const monthLabel = format(now, "MMMM yyyy");

  const actuals = useMemo(() => {
    const map: Record<string, { thisMonth: number; lastMonth: number }> = {};
    transactions.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category ?? "expense";
      if (!map[cat]) map[cat] = { thisMonth: 0, lastMonth: 0 };
      const amt = Math.abs(t.amount);
      if (t.date >= m1s && t.date <= m1e) map[cat].thisMonth += amt;
      if (t.date >= m2s && t.date <= m2e) map[cat].lastMonth += amt;
    });
    return map;
  }, [transactions, m1s, m1e, m2s, m2e]);

  const rows = useMemo(() => budgets.map(b => {
    const spent    = actuals[b.category]?.thisMonth ?? 0;
    const lastM    = actuals[b.category]?.lastMonth ?? 0;
    const pct      = Math.min((spent / b.monthlyLimit) * 100, 100);
    const overspend = spent > b.monthlyLimit;
    const warn      = pct >= 80 && !overspend;
    return { ...b, spent, lastM, pct, overspend, warn, remaining: Math.max(b.monthlyLimit - spent, 0) };
  }), [budgets, actuals]);

  const totalBudget  = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalSpent   = rows.reduce((s, r) => s + r.spent, 0);
  const overCount    = rows.filter(r => r.overspend).length;
  const warnCount    = rows.filter(r => r.warn).length;

  const saveBudget = (b: Budget) => {
    if (budgets.some(x => x.id === b.id)) updateBudget(b);
    else addBudget(b);
    toast.success(editing ? "Budget updated" : "Budget created");
  };

  const removeBudget = (id: string) => {
    deleteBudget(id);
    toast.success("Budget removed");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Budgets</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{monthLabel} · spend vs limits</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={12} /> New Budget
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Budget",   value: formatCurrency(totalBudget),    color: "text-[var(--color-primary)]" },
          { label: "Spent This Month", value: formatCurrency(totalSpent),   color: totalSpent > totalBudget ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Budget Alerts",  value: `${overCount} over, ${warnCount} near`, color: overCount > 0 ? "text-red-400" : warnCount > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Overall progress bar */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-semibold">Total spend vs budget</span>
          <span className={`font-bold tabular-nums ${totalSpent > totalBudget ? "text-red-400" : "text-[var(--color-text)]"}`}>
            {totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(0) : 0}%
          </span>
        </div>
        <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${totalSpent > totalBudget ? "bg-red-500" : "bg-[var(--color-primary)]"}`}
            style={{ width: `${Math.min((totalSpent / Math.max(totalBudget, 1)) * 100, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[var(--color-muted)] mt-1">
          <span>{formatCurrency(totalSpent)} spent</span>
          <span>{formatCurrency(totalBudget)} limit</span>
        </div>
      </div>

      {/* Budget cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map(r => (
          <div key={r.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${r.overspend ? "border-red-700/50" : r.warn ? "border-yellow-700/40" : "border-[var(--color-border)]"}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                  <p className="text-sm font-semibold">{r.label}</p>
                  {r.overspend && (
                    <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/40 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle size={8} /> OVER
                    </span>
                  )}
                  {r.warn && !r.overspend && (
                    <span className="text-[10px] font-bold text-yellow-400 bg-yellow-950/40 border border-yellow-800/40 px-1.5 py-0.5 rounded-full">
                      80%+
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-0.5 capitalize">{r.category}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditing(r)}
                  className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] px-2 py-1 rounded">
                  Edit
                </button>
                <button onClick={() => removeBudget(r.id)}
                  className="text-[10px] text-[var(--color-muted)] hover:text-red-400 border border-[var(--color-border)] px-2 py-1 rounded">
                  <X size={10} />
                </button>
              </div>
            </div>

            <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${r.pct}%`, background: r.overspend ? "#ef4444" : r.warn ? "#eab308" : r.color }}
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className={`font-semibold ${r.overspend ? "text-red-400" : "text-[var(--color-text)]"}`}>
                {formatCurrency(r.spent)} spent
              </span>
              <span className="text-[var(--color-muted)]">of {formatCurrency(r.monthlyLimit)}</span>
              {r.overspend
                ? <span className="text-red-400 font-semibold">{formatCurrency(r.spent - r.monthlyLimit)} over</span>
                : <span className="text-green-400">{formatCurrency(r.remaining)} left</span>
              }
            </div>

            {r.lastM > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--color-border)] flex items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
                {r.spent > r.lastM
                  ? <TrendingUp size={10} className="text-red-400" />
                  : <TrendingDown size={10} className="text-green-400" />}
                <span>
                  {r.spent > r.lastM ? "+" : ""}{r.lastM > 0 ? ((r.spent - r.lastM) / r.lastM * 100).toFixed(0) : 0}% vs last month ({formatCurrency(r.lastM)})
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Add new card */}
        <button onClick={() => setAdding(true)}
          className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 transition-all group">
          <Plus size={20} className="text-[var(--color-muted)] group-hover:text-[var(--color-primary)]" />
          <p className="text-sm text-[var(--color-muted)] group-hover:text-[var(--color-text)]">Add budget category</p>
        </button>
      </div>

      {/* Advanced budgeting tools (#198–#200) */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([
          ["zero-based", "Zero-Based Builder", RotateCcw],
          ["dept-alloc", "Dept Allocation", Building2],
          ["capex", "Capex Tracker", HardHat],
          ["annual-builder", "Annual Builder", CalendarRange],
          ["variance-report", "Variance Report", GitCompareArrows],
          ["flexible-budget", "Flexible Budget", SlidersHorizontal],
          ["cash-budget", "Cash Budget", Wallet],
          ["headcount-budget", "Headcount Budget", Users],
          ["project-budget", "Project Budget", FolderKanban],
          ["utilization-gauge", "Utilization", Gauge],
          ["reforecast", "Reforecast", Repeat],
        ] as const).map(([id, label, Icon]) => (
          <a key={id} href={`#${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]">
            <Icon size={11} />{label}
          </a>
        ))}
      </div>

      <section id="zero-based"><ZeroBasedBudgetBuilder /></section>
      <section id="dept-alloc"><DepartmentBudgetAllocation /></section>
      <section id="capex"><CapexBudgetTracker /></section>
      <section id="annual-builder"><AnnualBudgetBuilder /></section>
      <section id="variance-report"><BudgetVarianceReport /></section>
      <section id="flexible-budget"><FlexibleBudgetRecalc /></section>
      <section id="cash-budget"><CashBudgetPlanner /></section>
      <section id="headcount-budget"><HeadcountBudgetPlanner /></section>
      <section id="project-budget"><ProjectBudgetTracker /></section>
      <section id="utilization-gauge"><BudgetUtilizationGauges /></section>
      <section id="reforecast"><ForecastVsBudgetReforecast /></section>

      {(adding || editing) && (
        <AddBudgetModal
          existing={editing ?? undefined}
          onSave={saveBudget}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// Shared input class (matches the existing `inp` pattern in this file)
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CATS = ["revenue", "expense", "payroll", "loan", "tax", "transfer"] as const;

// Build the current-period key + window (YYYY-MM) for matching live actuals.
function periodWindow(period: string) {
  return { start: `${period}-01`, end: `${period}-31` };
}

// ── #198 Rolling / Zero-Based Budget Builder ────────────────────────────────────
type ZbbLine = { id: string; category: string; label: string; justified: number };
type ZbbPeriod = { period: string; lines: ZbbLine[] };

function ZeroBasedBudgetBuilder() {
  const { store } = useApp();
  const transactions = store.transactions ?? [];
  const [periods, setPeriods] = useFeatureState<ZbbPeriod[]>("zbb-periods", []);
  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));
  const [category, setCategory] = useState<string>("expense");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const fc = formatCurrency;

  const current = useMemo(() => periods.find(p => p.period === period), [periods, period]);
  const lines = current?.lines ?? [];

  // Live actuals for the selected period, by category (outflows only).
  const actuals = useMemo(() => {
    const { start, end } = periodWindow(period);
    const map: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= start && t.date <= end).forEach(t => {
      const c = t.category ?? "expense";
      map[c] = (map[c] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions, period]);

  const upsertLines = (next: ZbbLine[]) => {
    setPeriods(prev => {
      const exists = prev.some(p => p.period === period);
      if (exists) return prev.map(p => p.period === period ? { ...p, lines: next } : p);
      return [...prev, { period, lines: next }];
    });
  };

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!label.trim() || amt <= 0) { toast.error("Enter a line item and a justified amount"); return; }
    upsertLines([...lines, { id: crypto.randomUUID(), category, label: label.trim(), justified: amt }]);
    setLabel(""); setAmount("");
    toast.success("Line added — every rupee re-justified");
  };
  const remove = (id: string) => upsertLines(lines.filter(l => l.id !== id));
  const copyPrior = () => {
    const prior = format(subMonths(new Date(`${period}-01`), 1), "yyyy-MM");
    const src = periods.find(p => p.period === prior);
    if (!src || src.lines.length === 0) { toast.error(`No budget found for ${prior}`); return; }
    upsertLines(src.lines.map(l => ({ ...l, id: crypto.randomUUID() })));
    toast.success(`Rolled ${src.lines.length} lines forward from ${prior}`);
  };

  const totalBudget = lines.reduce((s, l) => s + l.justified, 0);
  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    lines.forEach(l => { map[l.category] = (map[l.category] ?? 0) + l.justified; });
    return map;
  }, [lines]);
  const totalActual = Object.entries(byCat).reduce((s, [c]) => s + (actuals[c] ?? 0), 0);
  const variance = totalBudget - totalActual;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><RotateCcw size={14} className="text-[var(--color-primary)]" /> Rolling / Zero-Based Budget Builder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Build each period from a clean slate — justify every line item, then compare against live actuals from your transactions. Roll a prior month forward as a starting point if you prefer a rolling budget.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className={INP} />
          <select value={category} onChange={e => setCategory(e.target.value)} className={INP}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Line item *" className={INP} />
          <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Justified ₹ *" className={INP} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add line</button>
        </div>
        <button onClick={copyPrior} className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] px-2.5 py-1 rounded">Roll forward prior month</button>
      </div>

      {lines.length > 0 && <>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Period Budget", value: fc(totalBudget), color: "text-[var(--color-primary)]" },
            { label: "Actual (live)", value: fc(totalActual), color: totalActual > totalBudget ? "text-red-400" : "text-[var(--color-text)]" },
            { label: "Variance", value: `${variance < 0 ? "-" : ""}${fc(Math.abs(variance))}`, color: variance < 0 ? "text-red-400" : "text-green-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Line item", "Category", "Budgeted", "Cat. Actual", "Variance", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lines.map(l => {
                const catActual = actuals[l.category] ?? 0;
                const v = l.justified - catActual;
                return (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{l.label}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] capitalize">{l.category}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(l.justified)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(catActual)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${v < 0 ? "text-red-400" : "text-green-400"}`}>{v < 0 ? "-" : ""}{fc(Math.abs(v))}</td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

// ── #199 Department Budget Allocation & Approval ────────────────────────────────
type DeptAlloc = { id: string; name: string; allocated: number; category: string; status: "draft" | "submitted" | "approved" | "rejected"; note: string };

function DepartmentBudgetAllocation() {
  const { store } = useApp();
  const transactions = store.transactions ?? [];
  const [pool, setPool] = useFeatureState<string>("dept-budget-pool", "");
  const [depts, setDepts] = useFeatureState<DeptAlloc[]>("dept-allocations", []);
  const [name, setName] = useState("");
  const [allocated, setAllocated] = useState("");
  const [category, setCategory] = useState<string>("expense");
  const fc = formatCurrency;

  // Live spend this month, by category — a proxy for what each department is consuming.
  const spendByCat = useMemo(() => {
    const start = startOfMonth(new Date()).toISOString().split("T")[0];
    const end = endOfMonth(new Date()).toISOString().split("T")[0];
    const map: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= start && t.date <= end).forEach(t => {
      const c = t.category ?? "expense";
      map[c] = (map[c] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions]);

  const poolNum = parseFloat(pool) || 0;
  const totalAllocated = depts.reduce((s, d) => s + d.allocated, 0);
  const unallocated = poolNum - totalAllocated;
  const overAllocated = unallocated < 0;

  const add = () => {
    const amt = parseFloat(allocated) || 0;
    if (!name.trim() || amt <= 0) { toast.error("Enter a department and allocation"); return; }
    setDepts(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), allocated: amt, category, status: "draft", note: "" }]);
    setName(""); setAllocated("");
    toast.success("Department allocation drafted");
  };
  const setStatus = (id: string, status: DeptAlloc["status"]) => {
    setDepts(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    toast.success(`Allocation ${status}`);
  };
  const remove = (id: string) => setDepts(prev => prev.filter(d => d.id !== id));

  const STATUS_STYLE: Record<DeptAlloc["status"], string> = {
    draft: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]",
    submitted: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    approved: "bg-green-900/30 text-green-400 border-green-800/40",
    rejected: "bg-red-900/30 text-red-400 border-red-800/40",
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Department Budget Allocation & Approval</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Set a top-down budget pool, allocate it across departments, and route each allocation through submit → approve sign-off. Live month spend per category is shown against each line.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Total budget pool (₹)</label>
            <input type="number" min="0" value={pool} onChange={e => setPool(e.target.value)} placeholder="e.g. 5000000" className={INP} />
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Department *" className={`${INP} self-end`} />
          <select value={category} onChange={e => setCategory(e.target.value)} className={`${INP} self-end`}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 self-end">+ Allocate</button>
        </div>
        <div className="md:max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Allocation amount (₹)</label>
          <input type="number" min="1" value={allocated} onChange={e => setAllocated(e.target.value)} placeholder="e.g. 1200000" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Budget Pool", value: fc(poolNum), color: "text-[var(--color-primary)]" },
          { label: "Allocated", value: fc(totalAllocated), color: "text-blue-400" },
          { label: overAllocated ? "Over-Allocated" : "Unallocated", value: `${overAllocated ? "-" : ""}${fc(Math.abs(unallocated))}`, color: overAllocated ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {depts.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Department", "Category", "Allocated", "Live month spend", "Status", "Sign-off", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {depts.map(d => {
                const spent = spendByCat[d.category] ?? 0;
                const over = spent > d.allocated;
                return (
                  <tr key={d.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{d.name}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] capitalize">{d.category}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(d.allocated)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${over ? "text-red-400" : "text-[var(--color-muted)]"}`}>{fc(spent)}{over ? " ⚠" : ""}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[d.status]}`}>{d.status}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {d.status === "draft" && <button onClick={() => setStatus(d.id, "submitted")} className="text-[9px] text-yellow-400 border border-yellow-800/40 px-1.5 py-0.5 rounded flex items-center gap-1"><Clock size={8} />Submit</button>}
                        {d.status === "submitted" && <>
                          <button onClick={() => setStatus(d.id, "approved")} className="text-[9px] text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={8} />Approve</button>
                          <button onClick={() => setStatus(d.id, "rejected")} className="text-[9px] text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded">Reject</button>
                        </>}
                        {(d.status === "approved" || d.status === "rejected") && <button onClick={() => setStatus(d.id, "draft")} className="text-[9px] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">Reopen</button>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #200 Capex Budget & Approval Tracker ────────────────────────────────────────
type CapexItem = { id: string; asset: string; planned: number; spent: number; date: string; status: "planned" | "approved" | "completed" };

function CapexBudgetTracker() {
  const [items, setItems] = useFeatureState<CapexItem[]>("capex-items", []);
  const [asset, setAsset] = useState("");
  const [planned, setPlanned] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(planned) || 0;
    if (!asset.trim() || amt <= 0) { toast.error("Enter an asset and planned spend"); return; }
    setItems(prev => [...prev, { id: crypto.randomUUID(), asset: asset.trim(), planned: amt, spent: 0, date, status: "planned" }]);
    setAsset(""); setPlanned("");
    toast.success("Capex item added to plan");
  };
  const setSpent = (id: string, value: number) => setItems(prev => prev.map(i => i.id === id ? { ...i, spent: value } : i));
  const setStatus = (id: string, status: CapexItem["status"]) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    toast.success(`Capex ${status}`);
  };
  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const totalPlanned = items.reduce((s, i) => s + i.planned, 0);
  const totalSpent = items.reduce((s, i) => s + i.spent, 0);
  const approvedPlanned = items.filter(i => i.status !== "planned").reduce((s, i) => s + i.planned, 0);
  const overruns = items.filter(i => i.spent > i.planned).length;

  const STATUS_STYLE: Record<CapexItem["status"], string> = {
    planned: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]",
    approved: "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    completed: "bg-green-900/30 text-green-400 border-green-800/40",
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><HardHat size={14} className="text-[var(--color-primary)]" /> Capex Budget & Approval Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Plan capital purchases, route each through approval, and log actual spend against the plan to surface overruns. Capex is tracked separately from operating budgets above.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={asset} onChange={e => setAsset(e.target.value)} placeholder="Asset / project *" className={INP} />
          <input type="number" min="1" value={planned} onChange={e => setPlanned(e.target.value)} placeholder="Planned ₹ *" className={INP} />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add capex</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Planned Capex", value: fc(totalPlanned), color: "text-[var(--color-primary)]" },
          { label: "Approved", value: fc(approvedPlanned), color: "text-blue-400" },
          { label: "Actual Spent", value: fc(totalSpent), color: totalSpent > totalPlanned ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Overruns", value: String(overruns), color: overruns > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Asset / project", "Planned", "Actual (editable)", "Variance", "Target date", "Status", "Sign-off", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map(i => {
                const v = i.planned - i.spent;
                const over = v < 0;
                return (
                  <tr key={i.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{i.asset}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(i.planned)}</td>
                    <td className="px-3 py-2.5">
                      <input type="number" min="0" value={i.spent || ""} onChange={e => setSpent(i.id, parseFloat(e.target.value) || 0)} placeholder="0"
                        className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none tabular-nums" />
                    </td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${over ? "text-red-400" : "text-green-400"}`}>{over ? "-" : ""}{fc(Math.abs(v))}{over ? " over" : ""}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{i.date}</td>
                    <td className="px-3 py-2.5"><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium capitalize ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {i.status === "planned" && <button onClick={() => setStatus(i.id, "approved")} className="text-[9px] text-yellow-400 border border-yellow-800/40 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle2 size={8} />Approve</button>}
                        {i.status === "approved" && <button onClick={() => setStatus(i.id, "completed")} className="text-[9px] text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded">Mark done</button>}
                        {i.status === "completed" && <button onClick={() => setStatus(i.id, "planned")} className="text-[9px] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">Reopen</button>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(i.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shared helpers for the new tools below
const MONTH_KEYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// Section shell matching the existing header + intro pattern
function ToolShell({ icon: Icon, title, intro, children }: { icon: typeof RotateCcw; title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Icon size={14} className="text-[var(--color-primary)]" /> {title}</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">{intro}</p>
        {children}
      </div>
    </div>
  );
}

function StatCards({ cards }: { cards: { label: string; value: string; color?: string }[] }) {
  return (
    <div className={`grid grid-cols-2 ${cards.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4"} gap-3`}>
      {cards.map(c => (
        <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
          <p className={`text-xl font-bold tabular-nums ${c.color ?? "text-[var(--color-text)]"}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Annual Budget Builder — spread a yearly figure across 12 months ──────────────
type AnnualLine = { id: string; label: string; category: string; annual: number; mode: "even" | "seasonal" };
// A simple India-aware seasonal weighting (festival/quarter-end skew), normalised to 12.
const SEASONAL = [0.85, 0.8, 1.05, 0.95, 0.95, 1.0, 1.0, 1.0, 1.05, 1.2, 1.25, 0.9];

function AnnualBudgetBuilder() {
  const [lines, setLines] = useFeatureState<AnnualLine[]>("bud-annual-lines", []);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("expense");
  const [annual, setAnnual] = useState("");
  const [mode, setMode] = useState<AnnualLine["mode"]>("even");
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(annual) || 0;
    if (!label.trim() || amt <= 0) { toast.error("Enter a line and an annual amount"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), label: label.trim(), category, annual: amt, mode }]);
    setLabel(""); setAnnual("");
    toast.success("Annual line spread across 12 months");
  };
  const remove = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const spread = (l: AnnualLine) => {
    if (l.mode === "even") return MONTH_KEYS.map(() => l.annual / 12);
    const sum = SEASONAL.reduce((s, w) => s + w, 0);
    return SEASONAL.map(w => (l.annual * w) / sum);
  };
  const monthlyTotals = MONTH_KEYS.map((_, mi) => lines.reduce((s, l) => s + spread(l)[mi], 0));
  const grandTotal = lines.reduce((s, l) => s + l.annual, 0);
  const peakMonth = monthlyTotals.length ? MONTH_KEYS[monthlyTotals.indexOf(Math.max(...monthlyTotals))] : "—";

  return (
    <ToolShell icon={CalendarRange} title="Annual Budget Builder" intro="Enter one annual figure per line and spread it across 12 months — evenly, or with a festival-weighted seasonal curve (Oct–Nov skew). Build the full-year plan in minutes.">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Line item *" className={INP} />
        <select value={category} onChange={e => setCategory(e.target.value)} className={INP}>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" min="1" value={annual} onChange={e => setAnnual(e.target.value)} placeholder="Annual ₹ *" className={INP} />
        <select value={mode} onChange={e => setMode(e.target.value as AnnualLine["mode"])} className={INP}>
          <option value="even">Even spread</option>
          <option value="seasonal">Seasonal curve</option>
        </select>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add line</button>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Annual Budget", value: fc(grandTotal), color: "text-[var(--color-primary)]" },
            { label: "Monthly Average", value: fc(grandTotal / 12) },
            { label: "Lines", value: String(lines.length), color: "text-blue-400" },
            { label: "Peak Month", value: peakMonth, color: "text-yellow-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Line item", ...MONTH_KEYS, "Annual", ""].map(h => <th key={h} className="px-2 py-2.5 text-right text-[11px] font-semibold text-[var(--color-muted)] first:text-left">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {lines.map(l => {
                  const cells = spread(l);
                  return (
                    <tr key={l.id} className="hover:bg-white/2">
                      <td className="px-2 py-2 text-xs font-medium">{l.label}</td>
                      {cells.map((c, ci) => <td key={ci} className="px-2 py-2 text-[11px] tabular-nums text-right text-[var(--color-muted)]">{fc(c)}</td>)}
                      <td className="px-2 py-2 text-xs tabular-nums text-right font-semibold">{fc(l.annual)}</td>
                      <td className="px-2 py-2 text-right"><button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  );
                })}
                <tr className="bg-[var(--color-bg)]/40 font-semibold">
                  <td className="px-2 py-2 text-xs">Total</td>
                  {monthlyTotals.map((t, ti) => <td key={ti} className="px-2 py-2 text-[11px] tabular-nums text-right">{fc(t)}</td>)}
                  <td className="px-2 py-2 text-xs tabular-nums text-right text-[var(--color-primary)]">{fc(grandTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ── Budget-vs-Actual Variance Report — live from budgets + transactions ──────────
function BudgetVarianceReport() {
  const { store } = useApp();
  const budgets = store.budgets ?? [];
  const transactions = store.transactions ?? [];
  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));
  const fc = formatCurrency;

  const actuals = useMemo(() => {
    const { start, end } = periodWindow(period);
    const map: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= start && t.date <= end).forEach(t => {
      const c = t.category ?? "expense";
      map[c] = (map[c] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions, period]);

  const rows = budgets.map(b => {
    const actual = actuals[b.category] ?? 0;
    const variance = b.monthlyLimit - actual;
    const pct = b.monthlyLimit > 0 ? (variance / b.monthlyLimit) * 100 : 0;
    return { ...b, actual, variance, pct, over: variance < 0 };
  }).sort((a, b) => a.variance - b.variance);

  const totalBudget = rows.reduce((s, r) => s + r.monthlyLimit, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVar = totalBudget - totalActual;
  const overLines = rows.filter(r => r.over).length;

  return (
    <ToolShell icon={GitCompareArrows} title="Budget-vs-Actual Variance Report" intro="A live variance report for any month: each budget line compared against actual category spend from your transactions, sorted worst-variance first. Favourable variance is green, overspend is red.">
      <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className={`${INP} md:max-w-[200px]`} />
      {rows.length > 0 ? (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Budgeted", value: fc(totalBudget), color: "text-[var(--color-primary)]" },
            { label: "Actual", value: fc(totalActual), color: totalActual > totalBudget ? "text-red-400" : "text-[var(--color-text)]" },
            { label: "Net Variance", value: `${totalVar < 0 ? "-" : ""}${fc(Math.abs(totalVar))}`, color: totalVar < 0 ? "text-red-400" : "text-green-400" },
            { label: "Lines Over", value: String(overLines), color: overLines > 0 ? "text-red-400" : "text-green-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Budget", "Category", "Budgeted", "Actual", "Variance", "Var %"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.color }} />{r.label}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] capitalize">{r.category}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.monthlyLimit)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(r.actual)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${r.over ? "text-red-400" : "text-green-400"}`}>{r.over ? "-" : ""}{fc(Math.abs(r.variance))}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${r.over ? "text-red-400" : "text-green-400"}`}>{r.pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p className="mt-4 text-xs text-[var(--color-muted)]">Create budget categories above to populate this report.</p>}
    </ToolShell>
  );
}

// ── Flexible Budget Recalc — volume-adjust variable costs for fair variance ──────
type FlexLine = { id: string; label: string; fixed: number; variablePerUnit: number };

function FlexibleBudgetRecalc() {
  const [lines, setLines] = useFeatureState<FlexLine[]>("bud-flex-lines", []);
  const [plannedVol, setPlannedVol] = useFeatureState<string>("bud-flex-planned-vol", "100");
  const [actualVol, setActualVol] = useState("100");
  const [label, setLabel] = useState("");
  const [fixed, setFixed] = useState("");
  const [variable, setVariable] = useState("");
  const fc = formatCurrency;

  const add = () => {
    if (!label.trim()) { toast.error("Enter a cost line"); return; }
    setLines(prev => [...prev, { id: crypto.randomUUID(), label: label.trim(), fixed: parseFloat(fixed) || 0, variablePerUnit: parseFloat(variable) || 0 }]);
    setLabel(""); setFixed(""); setVariable("");
    toast.success("Cost line added");
  };
  const remove = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const pv = parseFloat(plannedVol) || 0;
  const av = parseFloat(actualVol) || 0;
  const staticBudget = lines.reduce((s, l) => s + l.fixed + l.variablePerUnit * pv, 0);
  const flexBudget = lines.reduce((s, l) => s + l.fixed + l.variablePerUnit * av, 0);
  const volumeEffect = flexBudget - staticBudget;

  return (
    <ToolShell icon={SlidersHorizontal} title="Flexible Budget Recalc" intro="Split each cost into fixed + variable-per-unit, then flex the budget to actual volume. Comparing actuals to the flexed budget — not the static one — isolates true cost performance from volume-driven swings.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Planned volume (units)</label>
          <input type="number" min="0" value={plannedVol} onChange={e => setPlannedVol(e.target.value)} className={INP} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Actual volume (units)</label>
          <input type="number" min="0" value={actualVol} onChange={e => setActualVol(e.target.value)} className={INP} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Cost line *" className={INP} />
        <input type="number" min="0" value={fixed} onChange={e => setFixed(e.target.value)} placeholder="Fixed ₹" className={INP} />
        <input type="number" min="0" value={variable} onChange={e => setVariable(e.target.value)} placeholder="Variable ₹/unit" className={INP} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add cost</button>
      </div>

      {lines.length > 0 && (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: `Static Budget (@${pv}u)`, value: fc(staticBudget), color: "text-[var(--color-primary)]" },
            { label: `Flexed Budget (@${av}u)`, value: fc(flexBudget), color: "text-blue-400" },
            { label: "Volume Effect", value: `${volumeEffect < 0 ? "-" : "+"}${fc(Math.abs(volumeEffect))}`, color: volumeEffect > 0 ? "text-yellow-400" : "text-green-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Cost line", "Fixed", "Variable/unit", "Static", "Flexed", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {lines.map(l => (
                  <tr key={l.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{l.label}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(l.fixed)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(l.variablePerUnit)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(l.fixed + l.variablePerUnit * pv)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{fc(l.fixed + l.variablePerUnit * av)}</td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ── Cash Budget Planner — opening cash, planned inflows/outflows, closing ─────────
type CashRow = { id: string; month: string; inflow: number; outflow: number };

function CashBudgetPlanner() {
  const [opening, setOpening] = useFeatureState<string>("bud-cash-opening", "");
  const [rows, setRows] = useFeatureState<CashRow[]>("bud-cash-rows", []);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [inflow, setInflow] = useState("");
  const [outflow, setOutflow] = useState("");
  const fc = formatCurrency;

  const add = () => {
    if (rows.some(r => r.month === month)) { toast.error("That month is already planned"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), month, inflow: parseFloat(inflow) || 0, outflow: parseFloat(outflow) || 0 }].sort((a, b) => a.month.localeCompare(b.month)));
    setInflow(""); setOutflow("");
    toast.success("Cash month added");
  };
  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const open0 = parseFloat(opening) || 0;
  let running = open0;
  const computed = rows.map(r => {
    const net = r.inflow - r.outflow;
    running += net;
    return { ...r, net, closing: running };
  });
  const lowest = computed.length ? Math.min(...computed.map(c => c.closing)) : open0;
  const closingFinal = computed.length ? computed[computed.length - 1].closing : open0;

  return (
    <ToolShell icon={Wallet} title="Cash Budget Planner" intro="Project month-by-month cash: opening balance plus planned inflows minus outflows rolls into each closing balance. The lowest projected balance flags when you risk running short.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Opening cash (₹)</label>
          <input type="number" value={opening} onChange={e => setOpening(e.target.value)} placeholder="e.g. 1500000" className={INP} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={INP} />
        <input type="number" min="0" value={inflow} onChange={e => setInflow(e.target.value)} placeholder="Inflow ₹" className={INP} />
        <input type="number" min="0" value={outflow} onChange={e => setOutflow(e.target.value)} placeholder="Outflow ₹" className={INP} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add month</button>
      </div>

      {computed.length > 0 && (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Opening Cash", value: fc(open0), color: "text-[var(--color-primary)]" },
            { label: "Projected Closing", value: fc(closingFinal), color: closingFinal < 0 ? "text-red-400" : "text-[var(--color-text)]" },
            { label: "Lowest Balance", value: fc(lowest), color: lowest < 0 ? "text-red-400" : lowest < open0 * 0.2 ? "text-yellow-400" : "text-green-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Month", "Inflow", "Outflow", "Net", "Closing", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {computed.map(c => (
                  <tr key={c.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{c.month}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-green-400">{fc(c.inflow)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-red-400">{fc(c.outflow)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums ${c.net < 0 ? "text-red-400" : "text-[var(--color-text)]"}`}>{c.net < 0 ? "-" : ""}{fc(Math.abs(c.net))}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${c.closing < 0 ? "text-red-400" : "text-[var(--color-text)]"}`}>{c.closing < 0 ? "-" : ""}{fc(Math.abs(c.closing))}</td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(c.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ── Headcount / Manpower Budget — roles with statutory loaded cost ────────────────
type Hire = { id: string; role: string; dept: string; headcount: number; monthlyCtc: number; startMonth: string };
const PF_ESI_LOAD = 0.13; // employer PF (12%) + ESI (~1%) approximation on CTC

function HeadcountBudgetPlanner() {
  const [hires, setHires] = useFeatureState<Hire[]>("bud-headcount", []);
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [ctc, setCtc] = useState("");
  const [startMonth, setStartMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const fc = formatCurrency;

  const add = () => {
    const hc = parseInt(headcount) || 0;
    const cost = parseFloat(ctc) || 0;
    if (!role.trim() || hc <= 0 || cost <= 0) { toast.error("Enter role, headcount and CTC"); return; }
    setHires(prev => [...prev, { id: crypto.randomUUID(), role: role.trim(), dept: dept.trim() || "General", headcount: hc, monthlyCtc: cost, startMonth }]);
    setRole(""); setDept(""); setHeadcount("1"); setCtc("");
    toast.success("Role added to manpower plan");
  };
  const remove = (id: string) => setHires(prev => prev.filter(h => h.id !== id));

  const totalHeads = hires.reduce((s, h) => s + h.headcount, 0);
  const monthlyBase = hires.reduce((s, h) => s + h.headcount * h.monthlyCtc, 0);
  const monthlyLoaded = monthlyBase * (1 + PF_ESI_LOAD);
  const annualLoaded = monthlyLoaded * 12;

  return (
    <ToolShell icon={Users} title="Headcount / Manpower Budget" intro="Plan hires by role and department with a fully-loaded cost: monthly CTC plus ~13% employer PF/ESI statutory load. See total monthly and annual people cost before you commit to the plan.">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role *" className={INP} />
        <input value={dept} onChange={e => setDept(e.target.value)} placeholder="Department" className={INP} />
        <input type="number" min="1" value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder="Heads *" className={INP} />
        <input type="number" min="1" value={ctc} onChange={e => setCtc(e.target.value)} placeholder="Monthly CTC ₹ *" className={INP} />
        <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} className={INP} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add role</button>
      </div>

      {hires.length > 0 && (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Total Headcount", value: String(totalHeads), color: "text-[var(--color-primary)]" },
            { label: "Monthly (base)", value: fc(monthlyBase) },
            { label: "Monthly (loaded)", value: fc(monthlyLoaded), color: "text-yellow-400" },
            { label: "Annual (loaded)", value: fc(annualLoaded), color: "text-blue-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Role", "Dept", "Heads", "CTC/mo", "Loaded/mo", "Starts", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {hires.map(h => (
                  <tr key={h.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium">{h.role}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{h.dept}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{h.headcount}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(h.monthlyCtc)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{fc(h.headcount * h.monthlyCtc * (1 + PF_ESI_LOAD))}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{h.startMonth}</td>
                    <td className="px-3 py-2.5"><button onClick={() => remove(h.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ── Project Budget Tracker — budget + actual + % per project ──────────────────────
type Project = { id: string; name: string; client: string; budget: number; spent: number };

function ProjectBudgetTracker() {
  const [projects, setProjects] = useFeatureState<Project[]>("bud-projects", []);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [budget, setBudget] = useState("");
  const fc = formatCurrency;

  const add = () => {
    const amt = parseFloat(budget) || 0;
    if (!name.trim() || amt <= 0) { toast.error("Enter a project and budget"); return; }
    setProjects(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), client: client.trim() || "Internal", budget: amt, spent: 0 }]);
    setName(""); setClient(""); setBudget("");
    toast.success("Project budget created");
  };
  const setSpent = (id: string, value: number) => setProjects(prev => prev.map(p => p.id === id ? { ...p, spent: value } : p));
  const remove = (id: string) => setProjects(prev => prev.filter(p => p.id !== id));

  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);
  const overruns = projects.filter(p => p.spent > p.budget).length;

  return (
    <ToolShell icon={FolderKanban} title="Project Budget Tracker" intro="Budget and track spend per project or job. Log actuals against each project's budget to see consumption percent and surface jobs that are bleeding cash before they finish.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Project *" className={INP} />
        <input value={client} onChange={e => setClient(e.target.value)} placeholder="Client" className={INP} />
        <input type="number" min="1" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Budget ₹ *" className={INP} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add project</button>
      </div>

      {projects.length > 0 && (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Total Budget", value: fc(totalBudget), color: "text-[var(--color-primary)]" },
            { label: "Total Spent", value: fc(totalSpent), color: totalSpent > totalBudget ? "text-red-400" : "text-[var(--color-text)]" },
            { label: "Overruns", value: String(overruns), color: overruns > 0 ? "text-red-400" : "text-green-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Project", "Client", "Budget", "Spent (editable)", "Used", "Remaining", ""].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {projects.map(p => {
                  const pct = p.budget > 0 ? (p.spent / p.budget) * 100 : 0;
                  const over = p.spent > p.budget;
                  return (
                    <tr key={p.id} className="hover:bg-white/2">
                      <td className="px-3 py-2.5 text-xs font-medium">{p.name}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{p.client}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums">{fc(p.budget)}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" min="0" value={p.spent || ""} onChange={e => setSpent(p.id, parseFloat(e.target.value) || 0)} placeholder="0"
                          className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none tabular-nums" />
                      </td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums ${over ? "text-red-400" : pct >= 80 ? "text-yellow-400" : "text-green-400"}`}>{pct.toFixed(0)}%</td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums ${over ? "text-red-400" : "text-[var(--color-text)]"}`}>{over ? "-" : ""}{fc(Math.abs(p.budget - p.spent))}</td>
                      <td className="px-3 py-2.5"><button onClick={() => remove(p.id)} className="text-[var(--color-muted)] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

// ── Budget Utilization Gauges — live consumption % per budget this month ──────────
function BudgetUtilizationGauges() {
  const { store } = useApp();
  const budgets = store.budgets ?? [];
  const transactions = store.transactions ?? [];
  const fc = formatCurrency;

  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = endOfMonth(today).getDate();
  const expectedPace = (dayOfMonth / daysInMonth) * 100;

  const actuals = useMemo(() => {
    const start = startOfMonth(today).toISOString().split("T")[0];
    const end = endOfMonth(today).toISOString().split("T")[0];
    const map: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= start && t.date <= end).forEach(t => {
      const c = t.category ?? "expense";
      map[c] = (map[c] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions, today]);

  const gauges = budgets.map(b => {
    const spent = actuals[b.category] ?? 0;
    const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
    const ahead = pct > expectedPace + 10;
    return { ...b, spent, pct, ahead };
  });

  return (
    <ToolShell icon={Gauge} title="Budget Utilization Gauges" intro={`Live consumption against each budget this month. We're ${expectedPace.toFixed(0)}% through ${format(today, "MMMM")} — any gauge well above that line is pacing too fast and likely to overspend.`}>
      {gauges.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gauges.map(g => {
            const ring = Math.min(g.pct, 100);
            const ringColor = g.pct > 100 ? "#ef4444" : g.ahead ? "#eab308" : g.color;
            return (
              <div key={g.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0 rounded-full grid place-items-center"
                  style={{ background: `conic-gradient(${ringColor} ${ring * 3.6}deg, var(--color-bg) 0deg)` }}>
                  <div className="w-12 h-12 rounded-full bg-[var(--color-surface)] grid place-items-center">
                    <span className="text-[11px] font-bold tabular-nums">{g.pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-2 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.color }} />{g.label}</p>
                  <p className="text-xs text-[var(--color-muted)] tabular-nums mt-0.5">{fc(g.spent)} of {fc(g.monthlyLimit)}</p>
                  {g.pct > 100 ? <p className="text-[11px] text-red-400 mt-0.5">Over budget</p>
                    : g.ahead ? <p className="text-[11px] text-yellow-400 mt-0.5">Pacing ahead of {expectedPace.toFixed(0)}%</p>
                    : <p className="text-[11px] text-green-400 mt-0.5">On pace</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="text-xs text-[var(--color-muted)]">Create budget categories above to see utilization gauges.</p>}
    </ToolShell>
  );
}

// ── Forecast-vs-Budget Reforecast — restate the rest of the year from actuals ─────
function ForecastVsBudgetReforecast() {
  const { store } = useApp();
  const budgets = store.budgets ?? [];
  const transactions = store.transactions ?? [];
  const [adjust, setAdjust] = useFeatureState<string>("bud-reforecast-adjust", "0");
  const fc = formatCurrency;

  const today = new Date();
  const monthIdx = today.getMonth(); // 0-based
  const monthsElapsed = monthIdx + 1;
  const monthsRemaining = 12 - monthsElapsed;
  const adjPct = parseFloat(adjust) || 0;

  // YTD actual outflow (this calendar year), by category.
  const ytdByCat = useMemo(() => {
    const yStart = `${today.getFullYear()}-01-01`;
    const yEnd = `${today.getFullYear()}-12-31`;
    const map: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= yStart && t.date <= yEnd).forEach(t => {
      const c = t.category ?? "expense";
      map[c] = (map[c] ?? 0) + Math.abs(t.amount);
    });
    return map;
  }, [transactions, today]);

  const rows = budgets.map(b => {
    const annualBudget = b.monthlyLimit * 12;
    const ytdActual = ytdByCat[b.category] ?? 0;
    const runRate = monthsElapsed > 0 ? ytdActual / monthsElapsed : 0;
    const projectedRest = runRate * monthsRemaining * (1 + adjPct / 100);
    const reforecast = ytdActual + projectedRest;
    const variance = annualBudget - reforecast;
    return { ...b, annualBudget, ytdActual, reforecast, variance, over: variance < 0 };
  });

  const totalBudget = rows.reduce((s, r) => s + r.annualBudget, 0);
  const totalReforecast = rows.reduce((s, r) => s + r.reforecast, 0);
  const totalVar = totalBudget - totalReforecast;

  return (
    <ToolShell icon={Repeat} title="Forecast-vs-Budget Reforecast" intro={`Restate the full year: actuals to date plus a run-rate projection for the remaining ${monthsRemaining} month${monthsRemaining === 1 ? "" : "s"}. Apply a trend adjustment to model spend speeding up or slowing down, then compare against the annualised budget.`}>
      <div className="md:max-w-xs">
        <label className="text-xs text-[var(--color-muted)] block mb-1">Rest-of-year adjustment (%)</label>
        <input type="number" value={adjust} onChange={e => setAdjust(e.target.value)} placeholder="e.g. 10 for +10%" className={INP} />
      </div>
      {rows.length > 0 ? (
        <div className="mt-4 space-y-3">
          <StatCards cards={[
            { label: "Annual Budget", value: fc(totalBudget), color: "text-[var(--color-primary)]" },
            { label: "Reforecast (FY)", value: fc(totalReforecast), color: totalReforecast > totalBudget ? "text-red-400" : "text-blue-400" },
            { label: "Projected Variance", value: `${totalVar < 0 ? "-" : ""}${fc(Math.abs(totalVar))}`, color: totalVar < 0 ? "text-red-400" : "text-green-400" },
          ]} />
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Budget", "Annual Budget", "YTD Actual", "FY Reforecast", "Variance"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2.5 text-xs font-medium flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.color }} />{r.label}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums">{fc(r.annualBudget)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{fc(r.ytdActual)}</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums font-semibold">{fc(r.reforecast)}</td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums font-semibold ${r.over ? "text-red-400" : "text-green-400"}`}>{r.over ? "-" : ""}{fc(Math.abs(r.variance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <p className="mt-4 text-xs text-[var(--color-muted)]">Create budget categories above to run a reforecast.</p>}
    </ToolShell>
  );
}
