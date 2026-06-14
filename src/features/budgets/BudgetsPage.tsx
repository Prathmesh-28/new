import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { Plus, X, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
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
