import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { Plus, X, AlertTriangle, TrendingUp, TrendingDown, RotateCcw, Building2, HardHat, CheckCircle2, Clock } from "lucide-react";
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
        {([["zero-based", "Zero-Based Builder", RotateCcw], ["dept-alloc", "Dept Allocation", Building2], ["capex", "Capex Tracker", HardHat]] as const).map(([id, label, Icon]) => (
          <a key={id} href={`#${id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent)]">
            <Icon size={11} />{label}
          </a>
        ))}
      </div>

      <section id="zero-based"><ZeroBasedBudgetBuilder /></section>
      <section id="dept-alloc"><DepartmentBudgetAllocation /></section>
      <section id="capex"><CapexBudgetTracker /></section>

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
