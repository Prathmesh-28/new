import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn, runwayDays, generateId } from "@/lib/utils";
import { AlertTriangle, TrendingDown, Landmark, Bell, ArrowUpRight, ArrowDownRight, Plus, Building2, Upload, CheckCircle2, Circle, X, ChevronRight, Calendar, BarChart3, Sparkles, PiggyBank, ShieldCheck, Package, Receipt, HeartPulse, RefreshCcw, TrendingUp, Zap, Target } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { format, addMonths, setDate, isBefore, addDays } from "date-fns";
import { SegmentedToggle, SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";
import { useCountUp } from "@/hooks/useCountUp";
import { toast } from "sonner";
import TransactionImportModal from "@/components/TransactionImportModal";
import { api } from "@/lib/api";

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-700/60 bg-red-900/40",
  high:     "text-orange-400 border-orange-700/50 bg-orange-900/30",
  medium:   "text-yellow-400 border-yellow-700/50 bg-yellow-900/30",
  low:      "text-green-400 border-green-700/50 bg-green-900/25",
};

// Indian tax calendar: compute next 4 upcoming statutory dates
function getUpcomingTaxDates() {
  const now = new Date();
  const dates: { label: string; desc: string; date: Date }[] = [];

  for (let offset = 0; offset < 4; offset++) {
    const base = addMonths(now, offset);
    const y    = base.getFullYear();
    const m    = base.getMonth();

    // GSTR-3B: 20th of each month
    const gstr = setDate(new Date(y, m, 1), 20);
    if (!isBefore(gstr, now)) dates.push({ label: "GSTR-3B", desc: format(gstr, "d MMM"), date: gstr });

    // TDS deposit: 7th of each month
    const tds = setDate(new Date(y, m, 1), 7);
    if (!isBefore(tds, now)) dates.push({ label: "TDS deposit", desc: format(tds, "d MMM"), date: tds });

    // Advance tax: quarterly on 15th of Jun (5), Sep (8), Dec (11), Mar (2)
    if ([2, 5, 8, 11].includes(m)) {
      const adv = setDate(new Date(y, m, 1), 15);
      if (!isBefore(adv, now)) dates.push({ label: "Advance Tax", desc: format(adv, "d MMM"), date: adv });
    }
  }

  return dates.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 4);
}

function StatCard({ label, raw, display, icon: Icon, color, trend, delta, onClick }: {
  label: string; raw: number; display: string; icon: React.ElementType;
  color: string; trend?: "up" | "down" | null; delta?: number | null; onClick?: () => void;
}) {
  const animated = useCountUp(raw, 900);
  const isFormatted = display.includes("₹") || display.includes("days");
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 transition-all ${onClick ? "cursor-pointer hover:border-[var(--color-primary)]/50 hover:bg-white/2 hover:shadow-lg" : "hover:border-[var(--color-primary)]/30"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--color-muted)] font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-current/5 ${color}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">
        {isFormatted ? display : animated.toLocaleString()}
      </p>
      <div className="flex items-center justify-between mt-1.5">
        {trend && (
          <div className={`flex items-center gap-1 text-xs ${trend === "up" ? "text-green-400" : "text-red-400"}`}>
            {trend === "up" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            <span>{trend === "up" ? "Healthy" : "Watch closely"}</span>
          </div>
        )}
        {delta != null && Math.abs(delta) > 0.5 && (
          <span className={`text-[10px] font-semibold tabular-nums ml-auto ${delta > 0 ? "text-green-400" : "text-red-400"}`}>
            {delta > 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}% vs last mo
          </span>
        )}
      </div>
    </div>
  );
}

function CashThisWeekWidget() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;

  const balance  = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const avgDaily = monthlyBurn(transactions) / 30;

  // Compute expected daily patterns from last 4 weeks
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date     = addDays(now, i);
    const dow      = date.getDay(); // 0=Sun, 1=Mon...
    const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : format(date, "EEE d");

    // Revenue pattern: avg inflow for same day-of-week over last 4 weeks
    const inflows = [1, 2, 3, 4].map(w => {
      const d = addDays(date, -w * 7);
      const key = d.toISOString().split("T")[0];
      return transactions.filter(t => t.date === key && t.amount > 0).reduce((s, t) => s + t.amount, 0);
    });
    const avgInflow = inflows.reduce((s, v) => s + v, 0) / 4;

    // Outflow: daily burn + weekend suppression
    const isWeekend   = dow === 0 || dow === 6;
    const dailyOutflow = isWeekend ? avgDaily * 0.3 : avgDaily;

    const net = avgInflow - dailyOutflow;
    return { label: dayLabel, inflow: Math.round(avgInflow / 1000), outflow: Math.round(dailyOutflow / 1000), net: Math.round(net / 1000), isWeekend };
  });

  const maxVal = Math.max(...days.map(d => Math.max(d.inflow, d.outflow)), 1);
  const hasPattern = days.some(d => d.inflow > 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Target size={13} className="text-[var(--color-primary)]" />
            Cash This Week
          </h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Expected daily inflows vs outflows · based on your transaction patterns</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--color-muted)]">Current balance</p>
          <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const inflowPct  = (d.inflow  / maxVal) * 100;
          const outflowPct = (d.outflow / maxVal) * 100;
          const isGood     = d.net >= 0;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              {/* Bars */}
              <div className="relative w-full flex gap-0.5 items-end h-14">
                <div className="flex-1 rounded-t transition-all" style={{ height: `${Math.max(4, inflowPct)}%`, background: "#1A6B55", opacity: d.inflow > 0 ? 1 : 0.15 }} title={`Inflow: ₹${d.inflow}K`} />
                <div className="flex-1 rounded-t transition-all" style={{ height: `${Math.max(4, outflowPct)}%`, background: "#ef4444", opacity: 0.7 }} title={`Outflow: ₹${d.outflow}K`} />
              </div>
              {/* Net indicator */}
              <div className={`text-[9px] font-bold tabular-nums ${isGood ? "text-green-400" : "text-red-400"}`}>
                {d.net >= 0 ? "+" : ""}{d.net}K
              </div>
              {/* Day label */}
              <p className={`text-[9px] text-center leading-tight ${d.isWeekend ? "text-[var(--color-muted)]/50" : "text-[var(--color-muted)]"}`}>{d.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted)]"><span className="w-2.5 h-2.5 rounded-sm bg-[#1A6B55] inline-block" /> Expected inflow</div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-muted)]"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 inline-block" /> Expected outflow</div>
        {!hasPattern && <span className="text-[10px] text-[var(--color-muted)] italic">Add transactions to see inflow patterns</span>}
      </div>
    </div>
  );
}

function SmartActionsPanel() {
  const { store } = useApp();
  const { transactions, bankAccounts, alerts } = store;
  const navigate = useNavigate();

  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const burn    = monthlyBurn(transactions);
  const runway  = runwayDays(bankAccounts.map(b => b.balance), burn);

  const today = new Date().toISOString().split("T")[0];
  const invs  = (store as { invoices?: { dueDate: string; amount: number; customer: string; status: string }[] }).invoices ?? [];
  const overdue = invs.filter(i => i.dueDate < today && i.status !== "paid");
  const overdueAmt = overdue.reduce((s, i) => s + i.amount, 0);

  const actions: { urgency: number; label: string; detail: string; path: string; color: string }[] = [];

  if (runway > 0 && runway < 30) {
    actions.push({ urgency: 10, label: "Cash crunch in " + runway + " days", detail: "Explore working capital options now — don't wait.", path: "/credit", color: "text-red-400" });
  }
  if (overdueAmt > 0) {
    actions.push({ urgency: 9, label: `Chase ${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`, detail: `${formatCurrency(overdueAmt)} outstanding — ${overdue[0]?.customer} is highest priority.`, path: "/receivables", color: "text-orange-400" });
  }
  const unread = alerts.filter(a => !a.isRead);
  if (unread.length > 0) {
    actions.push({ urgency: 7, label: `${unread.length} unread alert${unread.length > 1 ? "s" : ""}`, detail: unread[0]?.message ?? "Review your alerts.", path: "/alerts", color: "text-yellow-400" });
  }
  if (burn > balance * 0.3 && runway < 90) {
    actions.push({ urgency: 6, label: "High burn relative to balance", detail: `Monthly burn ₹${Math.round(burn / 1000)}K is ${Math.round((burn / balance) * 100)}% of balance. Review spend.`, path: "/spend", color: "text-orange-400" });
  }
  actions.push({ urgency: 3, label: "Review sector benchmarks", detail: "See how your margins compare to industry peers.", path: "/benchmarks", color: "text-[var(--color-primary)]" });

  const top3 = actions.sort((a, b) => b.urgency - a.urgency).slice(0, 3);

  if (top3.length === 0) return null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <Zap size={13} className="text-yellow-400" />
        Priority actions
      </h2>
      <div className="space-y-2">
        {top3.map((a, i) => (
          <button
            key={i}
            onClick={() => navigate(a.path)}
            className="w-full flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-white/3 transition-colors text-left group border border-transparent hover:border-[var(--color-primary)]/20"
          >
            <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${i === 0 ? "bg-red-950/50 text-red-400" : i === 1 ? "bg-orange-950/50 text-orange-400" : "bg-yellow-950/50 text-yellow-400"}`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${a.color}`}>{a.label}</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-snug">{a.detail}</p>
            </div>
            <ChevronRight size={13} className="text-[var(--color-muted)] shrink-0 mt-1 group-hover:text-[var(--color-primary)] transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TreasuryBanner() {
  const [data, setData] = useState<{ idle_cash: number; annual_yield_at_65: number } | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("hr_treasury_dismissed") === "true");
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    api.get<{ idle_cash: number; annual_yield_at_65: number }>("/api/treasury/analysis")
      .then(setData)
      .catch(() => {});
  }, [dismissed]);

  if (dismissed || !data || data.idle_cash < 50000) return null;

  const idleL = (data.idle_cash / 100000).toFixed(1);
  const yieldAmt = formatCurrency(Math.round(data.annual_yield_at_65));

  const handleEnable = async () => {
    setEnabling(true);
    try {
      await api.post("/api/treasury/sweep-enable", {});
      toast.success("Auto-sweep enrollment queued. Our team will contact you shortly.");
      setDismissed(true);
      localStorage.setItem("hr_treasury_dismissed", "true");
    } catch {
      toast.error("Could not enable auto-sweep");
    } finally { setEnabling(false); }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("hr_treasury_dismissed", "true");
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/15 flex items-center justify-center shrink-0">
          <Landmark size={14} className="text-[var(--color-primary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">₹{idleL}L idle in current account · Auto-sweep could earn {yieldAmt}/yr at 6.5%</p>
          <p className="text-xs text-[var(--color-muted)]">Put excess cash to work in liquid mutual funds — withdraw anytime, same-day.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={handleEnable} disabled={enabling}
          className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
          {enabling ? "Enrolling…" : "Enable Auto-Sweep →"}
        </button>
        <button onClick={handleDismiss} className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function HealthScoreWidget() {
  const { store } = useApp();
  const { transactions, bankAccounts, alerts, activeLoans, firm } = store;
  const burn    = monthlyBurn(transactions);
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const runway  = runwayDays(bankAccounts.map(b => b.balance), burn);
  const unread  = alerts.filter(a => !a.isRead).length;

  const now = new Date();
  const m1s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const m2s = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const m2e = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  const thisRev = transactions.filter(t => t.date >= m1s && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const lastRev = transactions.filter(t => t.date >= m2s && t.date <= m2e && t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const scores = [
    {
      label: "Cash Health",
      score: runway >= 180 ? 100 : runway >= 90 ? 80 : runway >= 60 ? 60 : runway >= 30 ? 35 : 10,
      detail: `${runway}d runway`,
      color: runway >= 90 ? "#22c55e" : runway >= 45 ? "#eab308" : "#ef4444",
    },
    {
      label: "Revenue Trend",
      score: lastRev === 0 ? 60 : thisRev >= lastRev * 1.1 ? 90 : thisRev >= lastRev ? 70 : thisRev >= lastRev * 0.85 ? 45 : 20,
      detail: lastRev > 0 ? `${thisRev >= lastRev ? "+" : ""}${Math.round(((thisRev - lastRev) / lastRev) * 100)}% MoM` : "First month",
      color: lastRev === 0 || thisRev >= lastRev ? "#22c55e" : thisRev >= lastRev * 0.85 ? "#eab308" : "#ef4444",
    },
    {
      label: "Debt Coverage",
      score: activeLoans.length === 0 ? 90 : burn > 0 ? Math.min(100, Math.round((balance / (activeLoans.reduce((s,l)=>s+l.monthlyEmi,0) * 6)) * 90)) : 70,
      detail: activeLoans.length === 0 ? "No active loans" : `${activeLoans.length} loan${activeLoans.length > 1 ? "s" : ""}`,
      color: activeLoans.length === 0 ? "#22c55e" : "#3b82f6",
    },
    {
      label: "Compliance",
      score: unread === 0 ? 95 : unread <= 2 ? 70 : unread <= 5 ? 45 : 20,
      detail: unread === 0 ? "All clear" : `${unread} alert${unread > 1 ? "s" : ""} pending`,
      color: unread === 0 ? "#22c55e" : unread <= 2 ? "#eab308" : "#ef4444",
    },
  ];

  const overall = Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length);
  const overallColor = overall >= 75 ? "#22c55e" : overall >= 50 ? "#eab308" : "#ef4444";
  const overallLabel = overall >= 75 ? "Healthy" : overall >= 50 ? "Needs Attention" : "At Risk";

  const [open, setOpen] = useState(false);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={overallColor} strokeWidth="3"
                strokeDasharray={`${overall} ${100 - overall}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: overallColor }}>{overall}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">Business Health Score</p>
            <p className="text-xs font-medium" style={{ color: overallColor }}>{overallLabel}</p>
          </div>
        </div>
        <ChevronRight size={14} className={`text-[var(--color-muted)] transition-transform ${open ? "rotate-90" : ""}`} />
      </div>
      {open && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {scores.map(s => (
            <div key={s.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-[var(--color-muted)] font-medium">{s.label}</p>
                <span className="text-xs font-bold" style={{ color: s.color }}>{s.score}</span>
              </div>
              <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-all" style={{ width: `${s.score}%`, background: s.color }} />
              </div>
              <p className="text-[10px] text-[var(--color-muted)]">{s.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddAccountModal({ onClose, onAdd }: { onClose: () => void; onAdd: (a: { name: string; balance: number; provider: string }) => void }) {
  const [name, setName]         = useState("");
  const [balance, setBalance]   = useState("");
  const [provider, setProvider] = useState("Manual");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !balance) return;
    const bal = parseFloat(balance);
    if (isNaN(bal)) { toast.error("Enter a valid balance"); return; }
    onAdd({ name, balance: bal, provider });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-bold mb-4">Add Bank Account</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="Account name (e.g. HDFC Current)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input required type="number" min="0" value={balance} onChange={e => setBalance(e.target.value)} placeholder="Current balance (₹)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={provider} onChange={e => setProvider(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none">
            {["Manual", "HDFC", "ICICI", "SBI", "Axis", "Kotak", "Yes Bank", "Razorpay", "Stripe"].map(p => <option key={p}>{p}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">Add Account</button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddTransactionModal({ accountId, onClose, onAdd }: { accountId: string; onClose: () => void; onAdd: (t: object) => void }) {
  const [desc, setDesc]         = useState("");
  const [amount, setAmount]     = useState("");
  const [type, setType]         = useState<"income" | "expense">("income");
  const [category, setCategory] = useState("revenue");
  const [date, setDate]         = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!desc || isNaN(amt) || amt <= 0) { toast.error("Fill all fields with valid values"); return; }
    onAdd({
      id: generateId(), date, description: desc,
      amount: type === "expense" ? -amt : amt,
      category, counterparty: "", isRecurring: false, bankAccountId: accountId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-bold mb-4">Add Transaction</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            {(["income", "expense"] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${type === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {t === "income" ? "Income +" : "Expense −"}
              </button>
            ))}
          </div>
          <input required value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none">
            {["revenue", "expense", "payroll", "tax", "loan", "other"].map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none" />
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">Add</button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CashForecastChart({ forecast }: { forecast: { date: string; p10: number; p50: number; p90: number }[] }) {
  const [days, setDays] = useState<"30" | "60" | "90">("60");
  const { hidden, toggle } = useSeriesToggle();
  const n = Number(days);
  const data = forecast.slice(0, n).map(f => ({
    date: format(new Date(f.date), "MMM d"),
    p50:  Math.round(f.p50 / 100000),
    p90:  Math.round(f.p90 / 100000),
    p10:  Math.round(f.p10 / 100000),
  }));
  const interval = n <= 30 ? 4 : n <= 60 ? 9 : 14;
  const lastP50 = data[data.length - 1]?.p50 ?? 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 md:p-6">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">{n}-Day Cash Forecast</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Projected balance · ₹ Lakhs · ends ≈ ₹{lastP50}L (expected)</p>
        </div>
        <SegmentedToggle
          ariaLabel="Forecast horizon"
          value={days}
          onChange={setDays}
          options={[{ value: "30", label: "30D" }, { value: "60", label: "60D" }, { value: "90", label: "90D" }]}
        />
      </div>
      <div className="mb-3">
        <SeriesLegend
          series={[
            { key: "p90", label: "Best case (P90)",  color: "#1A6B55" },
            { key: "p50", label: "Expected (P50)",   color: "#2EA882" },
            { key: "p10", label: "Worst case (P10)", color: "#d97706" },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </div>
      <ResponsiveContainer width="100%" height={210}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="grad50" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2EA882" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2EA882" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} interval={interval} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number, name: string) => [`₹${v}L`, name.toUpperCase()]} />
          {!hidden.has("p90") && <Area type="monotone" dataKey="p90" name="p90" stroke="#1A6B55" strokeWidth={1} strokeDasharray="3 3" fill="#1A6B5510" animationDuration={400} />}
          {!hidden.has("p50") && <Area type="monotone" dataKey="p50" name="p50" stroke="#2EA882" strokeWidth={2} fill="url(#grad50)" animationDuration={400} />}
          {!hidden.has("p10") && <Area type="monotone" dataKey="p10" name="p10" stroke="#d97706" strokeWidth={1} strokeDasharray="3 3" fill="transparent" animationDuration={400} />}
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-[var(--color-muted)] mt-2">Tap a band to toggle it · change the horizon above. P10–P90 is the likely range; P50 is most probable.</p>
    </div>
  );
}

export default function DashboardPage() {
  const { store, markAlertRead, addBankAccount, addTransaction, isReadOnly } = useApp();
  const { bankAccounts, transactions, alerts, forecast, creditApplications, firm } = store;
  const navigate = useNavigate();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx]           = useState(false);
  const [showImport,    setShowImport]      = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem("hr_onboarding_dismissed") === "true"
  );

  const totalBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
  const burn         = monthlyBurn(transactions);
  const runway       = runwayDays(bankAccounts.map(b => b.balance), burn);
  const unread       = alerts.filter(a => !a.isRead).length;

  const isEmpty = bankAccounts.length === 0 && transactions.length === 0;

  // Onboarding steps (computed from store)
  const onboardingSteps = [
    { label: "Add a bank account",          done: bankAccounts.length > 0,         action: () => setShowAddAccount(true) },
    { label: "Import 3+ transactions",      done: transactions.length >= 3,         action: () => setShowImport(true) },
    { label: "Generate your first forecast",done: forecast.length > 0,             action: () => navigate("/forecast") },
    { label: "Run credit pre-qualification",done: creditApplications.length > 0,   action: () => navigate("/credit") },
  ];
  const completedCount = onboardingSteps.filter(s => s.done).length;
  const allDone        = completedCount === onboardingSteps.length;
  const showWizard     = !wizardDismissed && !allDone && !isReadOnly;

  const dismissWizard = () => {
    localStorage.setItem("hr_onboarding_dismissed", "true");
    setWizardDismissed(true);
  };

  // Concentration intelligence (computed from transactions)
  const revenueByCounterparty = transactions
    .filter(t => t.amount > 0 && t.counterparty)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.counterparty] = (acc[t.counterparty] ?? 0) + t.amount;
      return acc;
    }, {});
  const topRevenueSources = Object.entries(revenueByCounterparty)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const totalRevenue = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const topConcentration = topRevenueSources[0] && totalRevenue > 0
    ? (topRevenueSources[0].total / totalRevenue) * 100
    : 0;
  const showConcentration = topRevenueSources.length >= 2;

  // GST / tax calendar
  const taxDates = getUpcomingTaxDates();
  const today    = new Date();

  // Estimated monthly GST liability from last month's revenue
  const lastMonthStr = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const lastMonthRevenue = transactions
    .filter(t => t.amount > 0 && t.date.startsWith(lastMonthStr))
    .reduce((s, t) => s + t.amount, 0);
  const gstEstimate = firm.gstRegistered && firm.gstRate && lastMonthRevenue > 0
    ? Math.round(lastMonthRevenue * (firm.gstRate / 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddAccount(true)}
            disabled={isReadOnly} title={isReadOnly ? "Read-only in client view" : undefined}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Building2 size={12} /> Add Account
          </button>
          {bankAccounts.length > 0 && (
            <>
              <button onClick={() => setShowImport(true)}
                disabled={isReadOnly} title={isReadOnly ? "Read-only in client view" : undefined}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Upload size={12} /> Import CSV
              </button>
              <button onClick={() => setShowAddTx(true)}
                disabled={isReadOnly} title={isReadOnly ? "Read-only in client view" : undefined}
                className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={12} /> Add Transaction
              </button>
            </>
          )}
        </div>
      </div>

      {/* Onboarding wizard */}
      {showWizard && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold">Get started with Headroom</h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">{completedCount} of {onboardingSteps.length} steps complete</p>
            </div>
            <button onClick={dismissWizard} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors" title="Dismiss">
              <X size={15} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-700"
              style={{ width: `${(completedCount / onboardingSteps.length) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {onboardingSteps.map((step, i) => (
              <button
                key={i}
                onClick={step.done ? undefined : step.action}
                disabled={step.done}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                  step.done
                    ? "border-green-800/30 bg-green-950/10 opacity-60 cursor-default"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-accent)] cursor-pointer"
                }`}
              >
                {step.done
                  ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                  : <Circle size={15} className="text-[var(--color-muted)] shrink-0" />
                }
                <span className={`text-sm font-medium flex-1 ${step.done ? "line-through text-[var(--color-muted)]" : ""}`}>
                  {step.label}
                </span>
                {!step.done && <ChevronRight size={13} className="text-[var(--color-muted)] shrink-0" />}
              </button>
            ))}
          </div>

          {completedCount === 3 && (
            <div className="mt-3 p-3 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-lg">
              <p className="text-xs text-[var(--color-primary)] font-medium">
                One more step — run your credit pre-qualification to unlock working capital options and see your "aha moment."
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Building2 size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">Add your first bank account</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Connect your accounts to start tracking cash flow, generate forecasts, and get alerts.
          </p>
          <button onClick={() => setShowAddAccount(true)}
            className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
            Add Bank Account
          </button>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Stat cards — compute deltas vs last month */}
          {(() => {
            const now = new Date();
            const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
            const lastMDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
            const lastM = `${lastMDate.getFullYear()}-${String(lastMDate.getMonth()+1).padStart(2,"0")}`;
            const thisBalance = bankAccounts.reduce((s,b) => s+b.balance, 0);
            const lastBal = thisBalance; // balance is point-in-time, use txn net instead
            const thisBurn  = Math.abs(transactions.filter(t => t.date.startsWith(thisM) && t.amount < 0).reduce((s,t)=>s+t.amount,0));
            const lastBurn  = Math.abs(transactions.filter(t => t.date.startsWith(lastM) && t.amount < 0).reduce((s,t)=>s+t.amount,0));
            const burnDelta = lastBurn > 0 ? ((thisBurn - lastBurn)/lastBurn)*100 : null;
            const thisRevenue = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0).reduce((s,t)=>s+t.amount,0);
            const lastRevenue = transactions.filter(t => t.date.startsWith(lastM) && t.amount > 0).reduce((s,t)=>s+t.amount,0);
            const revDelta = lastRevenue > 0 ? ((thisRevenue - lastRevenue)/lastRevenue)*100 : null;
            void lastBal; void thisBalance;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <StatCard label="Total Balance" raw={Math.round(totalBalance/100000)} display={formatCurrency(totalBalance)} icon={Landmark} color="text-[var(--color-primary)]" trend="up" delta={revDelta} onClick={() => navigate("/transactions")} />
                <StatCard label="Monthly Burn"  raw={Math.round(burn/100000)}         display={formatCurrency(burn)}         icon={TrendingDown} color="text-red-400" trend="down" delta={burnDelta !== null ? -burnDelta : null} onClick={() => navigate("/transactions")} />
                <StatCard label="Cash Runway"   raw={runway}                           display={`${runway} days`}            icon={AlertTriangle} color={runway<30?"text-red-400":runway<90?"text-yellow-400":"text-green-400"} trend={runway<30?"down":"up"} onClick={() => navigate("/forecast")} />
                <StatCard label="Unread Alerts" raw={unread}                           display={unread.toString()}           icon={Bell} color="text-orange-400" onClick={() => navigate("/alerts")} />
              </div>
            );
          })()}

          {/* Quick-actions row */}
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {[
              { label: "Fin Health",    icon: HeartPulse,   path: "/health",     color: "text-rose-400",   bg: "bg-rose-950/20"   },
              { label: "Working Capital", icon: RefreshCcw, path: "/working-capital", color: "text-teal-400", bg: "bg-teal-950/20" },
              { label: "Analytics",     icon: BarChart3,    path: "/analytics",  color: "text-blue-400",   bg: "bg-blue-950/20"   },
              { label: "CFO Brief",     icon: Sparkles,     path: "/cfo-brief",  color: "text-purple-400", bg: "bg-purple-950/20" },
              { label: "Budgets",       icon: PiggyBank,    path: "/budgets",    color: "text-green-400",  bg: "bg-green-950/20"  },
              { label: "Compliance",    icon: ShieldCheck,  path: "/compliance", color: "text-orange-400", bg: "bg-orange-950/20" },
              { label: "Receivables",   icon: Receipt,      path: "/receivables",color: "text-yellow-400", bg: "bg-yellow-950/20" },
              { label: "Operations",    icon: Package,      path: "/operations", color: "text-[var(--color-muted)]", bg: "bg-[var(--color-accent)]" },
            ].map(({ label, icon: Icon, path, color, bg }) => (
              <button key={path} onClick={() => navigate(path)}
                className={`${bg} border border-[var(--color-border)] rounded-lg p-3 flex flex-col items-center gap-1.5 hover:border-[var(--color-primary)]/40 hover:scale-[1.02] transition-all`}>
                <Icon size={16} className={color} />
                <span className="text-[10px] font-medium text-[var(--color-muted)] text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          <CashThisWeekWidget />
          <SmartActionsPanel />
          <TreasuryBanner />
          <HealthScoreWidget />

          {/* Credit rescue CTA */}
          {runway > 0 && runway < 45 && (
            <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">Your cash runway is <strong className="text-red-400">{runway} days</strong> — balance pressure detected. Act now before it becomes critical.</p>
              </div>
              <button onClick={() => navigate("/credit")}
                className="text-xs bg-red-900/40 text-red-300 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/60 shrink-0 whitespace-nowrap">
                See rescue options →
              </button>
            </div>
          )}

          {/* Chart */}
          {forecast.length > 0 ? (
            <CashForecastChart forecast={forecast} />
          ) : (
            <div className="bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-lg p-8 text-center text-sm text-[var(--color-muted)]">
              Go to <strong className="text-[var(--color-text)]">Forecast</strong> to generate your 90-day cash projection.
            </div>
          )}

          {/* Category burn breakdown + inflow vs outflow */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Burn by category */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-3">Monthly burn by category</h2>
              {(() => {
                const cats = ["payroll","expense","loan","tax","transfer"];
                const totals = cats.map(c => ({
                  cat: c,
                  val: Math.abs(transactions.filter(t => t.category === c && t.amount < 0).reduce((s, t) => s + t.amount, 0)),
                })).filter(x => x.val > 0).sort((a, b) => b.val - a.val);
                const max = totals[0]?.val ?? 1;
                const CAT_CLR: Record<string, string> = { payroll:"bg-blue-500", expense:"bg-red-500", loan:"bg-purple-500", tax:"bg-orange-500", transfer:"bg-[var(--color-muted)]" };
                return totals.length === 0
                  ? <p className="text-sm text-[var(--color-muted)] py-4 text-center">No expense transactions yet</p>
                  : <div className="space-y-2">{totals.map(({ cat, val }) => (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="capitalize font-medium">{cat}</span>
                          <span className="text-[var(--color-muted)]">{formatCurrency(val)}</span>
                        </div>
                        <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${CAT_CLR[cat] ?? "bg-[var(--color-primary)]"}`} style={{ width: `${(val / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}</div>;
              })()}
            </div>

            {/* Inflow vs Outflow this month vs last */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <h2 className="text-sm font-semibold mb-3">This month vs last month</h2>
              {(() => {
                const now = new Date();
                const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
                const lastM = new Date(now.getFullYear(), now.getMonth()-1, 1);
                const lastMStr = `${lastM.getFullYear()}-${String(lastM.getMonth()+1).padStart(2,"0")}`;
                const thisIn  = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
                const thisOut = transactions.filter(t => t.date.startsWith(thisM) && t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
                const lastIn  = transactions.filter(t => t.date.startsWith(lastMStr) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
                const lastOut = transactions.filter(t => t.date.startsWith(lastMStr) && t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
                const rows = [
                  { label: "Inflow",  this: thisIn,  last: lastIn,  color: "text-green-400" },
                  { label: "Outflow", this: thisOut, last: lastOut, color: "text-red-400" },
                  { label: "Net",     this: thisIn - thisOut, last: lastIn - lastOut, color: thisIn - thisOut >= 0 ? "text-green-400" : "text-red-400" },
                ];
                return (
                  <div className="space-y-3">
                    {rows.map(({ label, this: cur, last, color }) => {
                      const delta = last > 0 ? ((cur - last) / last) * 100 : 0;
                      return (
                        <div key={label} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--color-muted)] text-xs w-14">{label}</span>
                          <span className={`font-bold ${color}`}>{formatCurrency(cur)}</span>
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-[var(--color-muted)]">prev {formatCurrency(last)}</span>
                            {last > 0 && (
                              <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Business health: concentration + GST */}
          {(showConcentration || taxDates.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Customer concentration */}
              {showConcentration && (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <h2 className="text-sm font-semibold mb-1">Revenue concentration</h2>
                  {topConcentration > 40 && (
                    <div className="flex items-start gap-2 mb-3 p-2.5 bg-orange-900/40 border border-orange-700/50 rounded-md">
                      <AlertTriangle size={12} className="text-orange-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-orange-300">
                        <strong>{topRevenueSources[0].name}</strong> accounts for{" "}
                        <strong>{topConcentration.toFixed(0)}%</strong> of revenue. Losing this customer
                        could impact {Math.round((topRevenueSources[0].total / Math.max(burn, 1) / 12) * 30)} days of runway.
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    {topRevenueSources.map(({ name, total }) => {
                      const pct = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="truncate font-medium max-w-[55%]">{name}</span>
                            <span className="text-[var(--color-muted)]">{pct.toFixed(0)}% · {formatCurrency(total)}</span>
                          </div>
                          <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct > 40 ? "bg-orange-500" : pct > 25 ? "bg-yellow-500" : "bg-[var(--color-primary)]"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GST / tax calendar */}
              {taxDates.length > 0 && (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar size={13} className="text-[var(--color-primary)]" />
                    <h2 className="text-sm font-semibold">Tax calendar</h2>
                  </div>
                  <div className="space-y-2">
                    {taxDates.map((t, i) => {
                      const daysLeft   = Math.ceil((t.date.getTime() - today.getTime()) / 86400000);
                      const urgent     = daysLeft <= 10;
                      const soon       = daysLeft <= 30;
                      const isGSTR3B   = t.label === "GSTR-3B";
                      return (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                          <div>
                            <p className="text-sm font-medium">{t.label}</p>
                            <p className="text-xs text-[var(--color-muted)]">
                              {t.desc}
                              {isGSTR3B && gstEstimate > 0 && (
                                <span className="ml-1.5 text-orange-400 font-semibold">
                                  ~{formatCurrency(gstEstimate)} est.
                                </span>
                              )}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            urgent ? "bg-red-950/30 text-red-400" :
                            soon   ? "bg-yellow-950/30 text-yellow-400" :
                                     "bg-[var(--color-accent)] text-[var(--color-muted)]"
                          }`}>
                            {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] mt-3">
                    GSTR-3B · TDS · Advance Tax · Based on standard Indian statutory dates
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bank accounts */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Bank Accounts</h2>
                <button onClick={() => setShowAddAccount(true)} className="text-xs text-[var(--color-primary)] hover:underline">+ Add</button>
              </div>
              <div className="space-y-1">
                {bankAccounts.map(a => {
                  const pct = totalBalance > 0 ? (a.balance / totalBalance) * 100 : 0;
                  return (
                    <div key={a.id} className="py-2.5 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-[var(--color-muted)]">{a.provider}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-[var(--color-text)]">{formatCurrency(a.balance)}</span>
                      </div>
                      <div className="h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Recent Alerts</h2>
                {unread > 0 && <span className="text-xs bg-orange-950/40 text-orange-400 border border-orange-800/30 px-2 py-0.5 rounded-full">{unread} unread</span>}
              </div>
              <div className="space-y-2">
                {alerts.slice(0, 5).map(a => (
                  <div key={a.id} onClick={() => markAlertRead(a.id)}
                    className={`text-xs rounded-lg px-3 py-2.5 border cursor-pointer transition-opacity hover:opacity-100 ${SEV_COLOR[a.severity]} ${a.isRead ? "opacity-40" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="uppercase font-bold tracking-wider text-[10px]">{a.severity}</span>
                      {!a.isRead && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </div>
                    <p className="mt-0.5 leading-snug">{a.message}</p>
                  </div>
                ))}
                {alerts.length === 0 && (
                  <div className="py-8 text-center text-sm text-[var(--color-muted)]">
                    <Bell size={24} className="mx-auto mb-2 opacity-30" />
                    No alerts yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdd={({ name, balance, provider }) => {
            addBankAccount({ id: generateId(), name, provider, balance, lastSync: new Date().toISOString(), status: "connected" });
            toast.success("Account added");
          }}
        />
      )}
      {showAddTx && bankAccounts[0] && (
        <AddTransactionModal
          accountId={bankAccounts[0].id}
          onClose={() => setShowAddTx(false)}
          onAdd={tx => { addTransaction(tx as Parameters<typeof addTransaction>[0]); toast.success("Transaction recorded"); }}
        />
      )}
      {showImport && bankAccounts[0] && (
        <TransactionImportModal
          bankAccountId={bankAccounts[0].id}
          onClose={() => setShowImport(false)}
          onImport={txns => txns.forEach(t => addTransaction(t))}
        />
      )}
    </div>
  );
}
