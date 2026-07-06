import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { formatCurrency, monthlyBurn, runwayDays, generateId } from "@/lib/utils";
import { runForecast } from "@/lib/forecastEngine";
import { updateWidgetData } from "@/lib/widgetBridge";
import { AlertTriangle, TrendingDown, Landmark, Bell, ArrowUpRight, ArrowDownRight, Plus, Building2, Upload, CheckCircle2, Circle, X, ChevronRight, Calendar, BarChart3, Sparkles, PiggyBank, ShieldCheck, Package, Receipt, HeartPulse, RefreshCcw, TrendingUp, Zap, Target, LayoutGrid, Flag, Sunrise, Wallet, Trash2, FileWarning, Clock, Activity, PieChart as PieIcon, Scale } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from "recharts";
import { format, addMonths, setDate, isBefore, addDays, isToday } from "date-fns";
import { useFeatureState } from "@/hooks/useFeatureState";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import PendingApprovals from "@/components/PendingApprovals";
import { SegmentedToggle, SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";
import { useCountUp } from "@/hooks/useCountUp";
import { toast } from "sonner";
import TransactionImportModal from "@/components/TransactionImportModal";
import PreviewBadge from "@/components/PreviewBadge";
import AiInsight from "@/components/ai/AiInsight";
import SimpleHome from "@/components/SimpleHome";
import FinancingNudgeCard from "@/features/dashboard/FinancingNudgeCard";
import { api } from "@/lib/api";
import type { BankAccount } from "@/data/types";
import DatePicker from "@/components/DatePicker";

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
    actions.push({ urgency: 10, label: "Cash crunch in " + runway + " days", detail: "Explore working capital options now - don't wait.", path: "/credit", color: "text-red-400" });
  }
  if (overdueAmt > 0) {
    actions.push({ urgency: 9, label: `Chase ${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`, detail: `${formatCurrency(overdueAmt)} outstanding - ${overdue[0]?.customer} is highest priority.`, path: "/receivables", color: "text-orange-400" });
  }
  const unread = alerts.filter(a => !a.isRead);
  if (unread.length > 0) {
    actions.push({ urgency: 7, label: `${unread.length} unread alert${unread.length > 1 ? "s" : ""}`, detail: unread[0]?.message ?? "Review your alerts.", path: "/alerts", color: "text-yellow-400" });
  }
  if (balance > 0 && burn > balance * 0.3 && runway < 90) {
    actions.push({ urgency: 6, label: "High burn relative to balance", detail: `Monthly burn ₹${Math.round(burn / 1000)}K is ${balance > 0 ? Math.round((burn / balance) * 100) + "%" : "-"} of balance. Review spend.`, path: "/spend", color: "text-orange-400" });
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
          <p className="text-sm font-semibold flex items-center gap-2">₹{idleL}L idle in current account · Auto-sweep could earn {yieldAmt}/yr at 6.5% <PreviewBadge capability="treasurySweep" /></p>
          <p className="text-xs text-[var(--color-muted)]">Put excess cash to work in liquid mutual funds - withdraw anytime, same-day.</p>
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
  const { transactions, bankAccounts, alerts, activeLoans } = store;
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

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_TYPES: { id: NonNullable<BankAccount["accountType"]>; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "savings", label: "Savings" },
  { id: "cc",      label: "Cash Credit (CC)" },
  { id: "od",      label: "Overdraft (OD)" },
  { id: "wallet",  label: "Wallet / Payment gateway" },
];

type AddAccountPayload = {
  name: string; balance: number; provider: string;
  ifsc?: string; bankName?: string; branch?: string; city?: string;
  accountLast4?: string; accountType: NonNullable<BankAccount["accountType"]>; asOf: string;
};

function AddAccountModal({ onClose, onAdd }: { onClose: () => void; onAdd: (a: AddAccountPayload) => void }) {
  const [name, setName]               = useState("");
  const [ifsc, setIfsc]               = useState("");
  const [resolved, setResolved]       = useState<{ bank: string; branch: string; city: string } | null>(null);
  const [fetching, setFetching]       = useState(false);
  const [fetchErr, setFetchErr]       = useState("");
  const [manual, setManual]           = useState(false);
  const [manualBank, setManualBank]   = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState<NonNullable<BankAccount["accountType"]>>("current");
  const [balance, setBalance]         = useState("");
  const [asOf, setAsOf]               = useState(new Date().toISOString().split("T")[0]);

  // Auto-resolve bank + branch from the IFSC (Razorpay's free public IFSC API).
  // Falls back to manual entry if offline or the code isn't found.
  useEffect(() => {
    const code = ifsc.trim().toUpperCase();
    if (!IFSC_RE.test(code)) { setResolved(null); setFetchErr(""); return; }
    let cancelled = false;
    setFetching(true); setFetchErr("");
    fetch(`https://ifsc.razorpay.com/${code}`)
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d: { BANK?: string; BRANCH?: string; CITY?: string; CENTRE?: string }) => {
        if (cancelled) return;
        setResolved({ bank: d.BANK ?? "", branch: d.BRANCH ?? "", city: d.CITY || d.CENTRE || "" });
        setManual(false);
        if (!name.trim() && d.BANK) setName(`${d.BANK.split(" ")[0]} ${ACCOUNT_TYPES.find(t => t.id === accountType)?.label ?? ""}`.trim());
      })
      .catch(() => { if (!cancelled) { setResolved(null); setFetchErr("Couldn't auto-fetch - check the IFSC, or enter your bank manually."); setManual(true); } })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [ifsc]); // eslint-disable-line react-hooks/exhaustive-deps

  const code = ifsc.trim().toUpperCase();
  const validIfsc = IFSC_RE.test(code);
  const bank = resolved?.bank || (manual ? manualBank.trim() : "");
  const digits = accountNumber.replace(/\D/g, "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank) { toast.error("Enter your IFSC to auto-fetch the bank, or type the bank name"); return; }
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) { toast.error("Enter a valid current balance"); return; }
    if (accountNumber && (digits.length < 9 || digits.length > 18)) { toast.error("Account number looks off - it should be 9-18 digits"); return; }
    onAdd({
      name: name.trim() || `${bank} ${ACCOUNT_TYPES.find(t => t.id === accountType)?.label ?? ""}`.trim(),
      balance: bal,
      provider: bank,
      ifsc: validIfsc ? code : undefined,
      bankName: bank,
      branch: resolved?.branch,
      city: resolved?.city,
      accountLast4: digits ? digits.slice(-4) : undefined,
      accountType,
      asOf,
    });
    toast.success(`${bank} account added`);
    onClose();
  };

  const field = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "text-xs font-medium text-[var(--color-muted)] block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold">Add a bank account</h2>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Enter your IFSC and we'll pull the bank &amp; branch for you - no hand-typing.</p>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* IFSC + auto-resolve */}
          <div>
            <label className={lbl}>IFSC code</label>
            <div className="relative">
              <input
                value={ifsc}
                onChange={e => setIfsc(e.target.value.toUpperCase())}
                placeholder="e.g. HDFC0000123"
                maxLength={11}
                autoCapitalize="characters"
                className={`${field} font-mono tracking-wider pr-24`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]">
                {fetching ? <span className="flex items-center gap-1 text-[var(--color-muted)]"><span className="w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /> looking up…</span>
                  : resolved ? <span className="flex items-center gap-1 text-green-500"><CheckCircle2 size={12} /> found</span>
                  : ifsc && !validIfsc ? <span className="text-[var(--color-muted)]">{ifsc.length}/11</span>
                  : null}
              </span>
            </div>
            {/* Resolved bank confirmation (review-before-add) */}
            {resolved && (
              <div className="mt-2 flex items-start gap-2 p-3 bg-green-950/20 border border-green-800/30 rounded-lg">
                <Landmark size={15} className="text-green-400 shrink-0 mt-0.5" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-green-300">{resolved.bank}</p>
                  <p className="text-[var(--color-muted)] mt-0.5">{resolved.branch}{resolved.city ? ` · ${resolved.city}` : ""}</p>
                </div>
              </div>
            )}
            {fetchErr && <p className="mt-1.5 text-[11px] text-amber-400 flex items-center gap-1"><AlertTriangle size={11} /> {fetchErr}</p>}
          </div>

          {/* Manual bank fallback */}
          {(manual || (!resolved && !fetching && ifsc.length === 0)) && (
            <div>
              <label className={lbl}>Bank name {resolved ? "" : "(if you don't have the IFSC handy)"}</label>
              <input value={manualBank} onChange={e => { setManualBank(e.target.value); setManual(true); }} placeholder="e.g. HDFC Bank"
                className={field} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Account number</label>
              <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="optional" inputMode="numeric"
                className={`${field} font-mono`} />
              {digits.length >= 4 && <p className="text-[10px] text-[var(--color-muted)] mt-1">Stored as ••••{digits.slice(-4)}</p>}
            </div>
            <div>
              <label className={lbl}>Account type</label>
              <select value={accountType} onChange={e => setAccountType(e.target.value as NonNullable<BankAccount["accountType"]>)} className={field}>
                {ACCOUNT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Current balance (₹)</label>
              <input required type="number" min="0" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00"
                className={field} />
            </div>
            <div>
              <label className={lbl}>Balance as of</label>
              <DatePicker value={asOf} onChange={setAsOf} max={new Date().toISOString().split("T")[0]} />
            </div>
          </div>

          <div>
            <label className={lbl}>Nickname (shown across Headroom)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HDFC Current - main" className={field} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={fetching} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">Add account</button>
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
      <p className="text-[10px] text-[var(--color-muted)] mt-2">Tap a band to toggle it · change the horizon above. P10-P90 is the likely range; P50 is most probable.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD TOOLS #147-#150 (FEATURES_200 · "Dashboard" section)
// Additive, self-contained widgets. Each computes from the live store; durable
// picks/goals persist via useFeatureState. Do not disturb existing widgets.
// ════════════════════════════════════════════════════════════════════════════

// ── #147 Custom KPI Widget Builder ───────────────────────────────────────────
// Owner picks which metrics show on a personal board; selection persists.
type KpiKey = "balance" | "burn" | "runway" | "revenueMtd" | "netMtd" | "alerts" | "topBank" | "accounts";

const KPI_CATALOG: { key: KpiKey; label: string }[] = [
  { key: "balance",    label: "Total Balance" },
  { key: "burn",       label: "Monthly Burn" },
  { key: "runway",     label: "Cash Runway" },
  { key: "revenueMtd", label: "Revenue (MTD)" },
  { key: "netMtd",     label: "Net Cash (MTD)" },
  { key: "alerts",     label: "Unread Alerts" },
  { key: "topBank",    label: "Largest Account" },
  { key: "accounts",   label: "Account Count" },
];

function KpiWidgetBuilder() {
  const { store } = useApp();
  const { transactions, bankAccounts, alerts } = store;
  const [picked, setPicked] = useFeatureState<KpiKey[]>("dashboard-kpi-board", ["balance", "runway", "revenueMtd", "alerts"]);
  const [editing, setEditing] = useState(false);

  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const balance  = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const burn     = monthlyBurn(transactions);
  const runway   = runwayDays(bankAccounts.map(b => b.balance), burn);
  const revMtd   = transactions.filter(t => t.date.startsWith(monthStr) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outMtd   = transactions.filter(t => t.date.startsWith(monthStr) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const topBank  = bankAccounts.reduce<typeof bankAccounts[number] | null>((best, a) => (!best || a.balance > best.balance ? a : best), null);

  const valueFor = (k: KpiKey): { value: string; color: string } => {
    switch (k) {
      case "balance":    return { value: formatCurrency(balance), color: "text-[var(--color-primary)]" };
      case "burn":       return { value: formatCurrency(burn), color: "text-red-400" };
      case "runway":     return { value: `${runway} days`, color: runway < 30 ? "text-red-400" : runway < 90 ? "text-yellow-400" : "text-green-400" };
      case "revenueMtd": return { value: formatCurrency(revMtd), color: "text-green-400" };
      case "netMtd":     return { value: formatCurrency(revMtd - outMtd), color: revMtd - outMtd >= 0 ? "text-green-400" : "text-red-400" };
      case "alerts":     return { value: String(alerts.filter(a => !a.isRead).length), color: "text-orange-400" };
      case "topBank":    return { value: topBank ? `${topBank.name} · ${formatCurrency(topBank.balance)}` : "-", color: "text-[var(--color-text)]" };
      case "accounts":   return { value: String(bankAccounts.length), color: "text-blue-400" };
    }
  };

  const toggle = (k: KpiKey) => setPicked(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const board = KPI_CATALOG.filter(c => picked.includes(c.key));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <LayoutGrid size={13} className="text-[var(--color-primary)]" />
          My KPI Board
        </h2>
        <button onClick={() => setEditing(e => !e)} className="text-xs text-[var(--color-primary)] hover:underline">
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {editing && (
        <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-[var(--color-border)]">
          {KPI_CATALOG.map(c => {
            const on = picked.includes(c.key);
            return (
              <button key={c.key} onClick={() => toggle(c.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${on ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent font-semibold" : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/40"}`}>
                {on ? "✓ " : "+ "}{c.label}
              </button>
            );
          })}
        </div>
      )}

      {board.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-6 text-center">No metrics pinned. Tap <span className="text-[var(--color-primary)]">Customize</span> to build your board.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {board.map(c => {
            const v = valueFor(c.key);
            return (
              <div key={c.key} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] font-medium mb-1 truncate">{c.label}</p>
                <p className={`text-base font-bold tabular-nums truncate ${v.color}`}>{v.value}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── #148 Daily Cash Position Snapshot ────────────────────────────────────────
// All-bank balances + today's movements from the store, per account.
function DailyCashSnapshot() {
  const navigate = useNavigate();
  const { store } = useApp();
  const { transactions, bankAccounts } = store;
  const todayStr = new Date().toISOString().split("T")[0];

  // No bank accounts yet - show a small inline hint instead of all-zero cards.
  if (bankAccounts.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Wallet size={13} className="text-[var(--color-primary)]" />
            Daily Cash Position
          </h2>
          <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(), "EEE, d MMM yyyy")}</span>
        </div>
        <button onClick={() => navigate("/banking")}
          className="w-full flex items-center justify-between gap-3 text-left px-3 py-4 rounded-lg border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)]/40 transition-colors">
          <span className="text-sm text-[var(--color-muted)]">Add a bank account to see today's cash movements.</span>
          <ChevronRight size={14} className="text-[var(--color-primary)] shrink-0" />
        </button>
      </div>
    );
  }

  const todays = transactions.filter(t => t.date === todayStr);
  const totalBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const inflow  = todays.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = todays.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = inflow - outflow;

  const perAccount = bankAccounts.map(a => {
    const moves = todays.filter(t => t.bankAccountId === a.id);
    const accIn  = moves.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const accOut = moves.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { ...a, accIn, accOut, count: moves.length };
  });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Wallet size={13} className="text-[var(--color-primary)]" />
          Daily Cash Position
        </h2>
        <span className="text-[10px] text-[var(--color-muted)]">{format(new Date(), "EEE, d MMM yyyy")}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Opening / Current", value: formatCurrency(totalBalance), color: "text-[var(--color-primary)]" },
          { label: "Money In Today",    value: formatCurrency(inflow),       color: "text-green-400" },
          { label: "Money Out Today",   value: formatCurrency(outflow),      color: "text-red-400" },
          { label: "Net Today",         value: `${net >= 0 ? "+" : "−"}${formatCurrency(Math.abs(net))}`, color: net >= 0 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--color-muted)] font-medium mb-1">{c.label}</p>
            <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {perAccount.length === 0 && <p className="text-sm text-[var(--color-muted)] py-3 text-center">No accounts connected.</p>}
        {perAccount.map(a => (
          <div key={a.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{a.name}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{a.count > 0 ? `${a.count} movement${a.count > 1 ? "s" : ""} today` : "No movement today"}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                {(a.accIn > 0 || a.accOut > 0) && (
                  <p className="text-[10px] tabular-nums">
                    {a.accIn > 0 && <span className="text-green-400">+{formatCurrency(a.accIn)}</span>}
                    {a.accIn > 0 && a.accOut > 0 && <span className="text-[var(--color-muted)]"> · </span>}
                    {a.accOut > 0 && <span className="text-red-400">−{formatCurrency(a.accOut)}</span>}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(a.balance)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #149 Goal / Target Tracker ───────────────────────────────────────────────
// Revenue/profit goals with live progress; goals persist.
type Goal = { id: string; metric: "revenue" | "profit" | "balance"; label: string; target: number; period: string };

function GoalTracker() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;
  const [goals, setGoals] = useFeatureState<Goal[]>("dashboard-goals", []);
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<Goal["metric"]>("revenue");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");

  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const revMtd = transactions.filter(t => t.date.startsWith(monthStr) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outMtd = transactions.filter(t => t.date.startsWith(monthStr) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);

  const actualFor = (m: Goal["metric"]) => m === "revenue" ? revMtd : m === "profit" ? revMtd - outMtd : balance;

  const add = () => {
    const t = parseFloat(target);
    if (!label.trim() || isNaN(t) || t <= 0) { toast.error("Enter a label and a positive target"); return; }
    setGoals(prev => [...prev, { id: generateId(), metric, label: label.trim(), target: t, period: format(new Date(), "MMM yyyy") }]);
    setLabel(""); setTarget(""); setAdding(false);
    toast.success("Goal added");
  };
  const remove = (id: string) => setGoals(prev => prev.filter(g => g.id !== id));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Flag size={13} className="text-[var(--color-primary)]" />
          Goal &amp; Target Tracker
        </h2>
        <button onClick={() => setAdding(a => !a)} className="text-xs text-[var(--color-primary)] hover:underline">
          {adding ? "Cancel" : "+ Add goal"}
        </button>
      </div>

      {adding && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3 pb-3 border-b border-[var(--color-border)]">
          <select value={metric} onChange={e => setMetric(e.target.value as Goal["metric"])} className={inp}>
            <option value="revenue">Revenue (MTD)</option>
            <option value="profit">Net Profit (MTD)</option>
            <option value="balance">Cash Balance</option>
          </select>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Goal name" className={inp} />
          <input type="number" min="1" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target (₹)" className={inp} />
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2 rounded-lg text-sm hover:opacity-90">Save</button>
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)] py-6 text-center">No goals yet. Set a revenue, profit or balance target to track progress.</p>
      ) : (
        <div className="space-y-3">
          {goals.map(g => {
            const actual = actualFor(g.metric);
            const pct = g.target > 0 ? Math.min(100, (actual / g.target) * 100) : 0;
            const hit = actual >= g.target;
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{g.label}</span>
                    <span className="text-[var(--color-muted)] shrink-0">· {g.period}</span>
                    {hit && <CheckCircle2 size={11} className="text-green-400 shrink-0" />}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[var(--color-muted)] tabular-nums">{formatCurrency(actual)} / {formatCurrency(g.target)}</span>
                    <button onClick={() => remove(g.id)} className="text-[var(--color-muted)] hover:text-red-400" title="Remove goal"><Trash2 size={11} /></button>
                  </span>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${hit ? "bg-green-500" : pct >= 60 ? "bg-[var(--color-primary)]" : "bg-yellow-500"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{pct.toFixed(0)}% of target{hit ? " - achieved 🎉" : ""}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── #150 Morning Brief Card ──────────────────────────────────────────────────
// Overnight changes + due-today + alerts digest, condensed into one card.
function MorningBriefCard() {
  const { store } = useApp();
  const { transactions, bankAccounts, alerts } = store;
  const navigate = useNavigate();
  const tr = useT();   // `t` is used as the transaction param in filters below

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const yStr = addDays(now, -1).toISOString().split("T")[0];

  const todayTx = transactions.filter(t => t.date === todayStr);
  const yTx     = transactions.filter(t => t.date === yStr);
  const todayNet = todayTx.reduce((s, t) => s + t.amount, 0);
  const yNet     = yTx.reduce((s, t) => s + t.amount, 0);

  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const burn    = monthlyBurn(transactions);
  const runway  = runwayDays(bankAccounts.map(b => b.balance), burn);

  const unread = alerts.filter(a => !a.isRead);
  const critical = unread.filter(a => a.severity === "critical" || a.severity === "high");

  // Tax/statutory items due today
  const dueToday = getUpcomingTaxDates().filter(d => isToday(d.date));

  // Recurring outflows landing today (overnight commitments)
  const recurringToday = todayTx.filter(t => t.isRecurring && t.amount < 0);

  const items: { icon: React.ElementType; tone: string; text: string }[] = [];
  items.push({
    icon: yNet >= 0 ? ArrowUpRight : ArrowDownRight,
    tone: yNet >= 0 ? "text-green-400" : "text-red-400",
    text: yTx.length ? `Yesterday closed ${yNet >= 0 ? "up" : "down"} ${formatCurrency(Math.abs(yNet))} across ${yTx.length} transaction${yTx.length > 1 ? "s" : ""}.` : "No transactions recorded yesterday.",
  });
  items.push({
    icon: TrendingUp, tone: "text-[var(--color-primary)]",
    text: `Cash on hand ${formatCurrency(balance)} · ${runway < 999 ? `${runway}-day runway` : "healthy runway"} at current burn.`,
  });
  if (todayTx.length) items.push({ icon: Wallet, tone: todayNet >= 0 ? "text-green-400" : "text-red-400", text: `${todayTx.length} movement${todayTx.length > 1 ? "s" : ""} already today, net ${todayNet >= 0 ? "+" : "−"}${formatCurrency(Math.abs(todayNet))}.` });
  if (recurringToday.length) items.push({ icon: RefreshCcw, tone: "text-orange-400", text: `${recurringToday.length} recurring payment${recurringToday.length > 1 ? "s" : ""} scheduled today (${formatCurrency(recurringToday.reduce((s, t) => s + Math.abs(t.amount), 0))}).` });
  if (dueToday.length) items.push({ icon: Calendar, tone: "text-red-400", text: `Due today: ${dueToday.map(d => d.label).join(", ")}.` });
  if (critical.length) items.push({ icon: AlertTriangle, tone: "text-red-400", text: `${critical.length} high-priority alert${critical.length > 1 ? "s" : ""} need attention: ${critical[0].message}` });
  else if (unread.length) items.push({ icon: Bell, tone: "text-yellow-400", text: `${unread.length} unread alert${unread.length > 1 ? "s" : ""} in your inbox.` });

  const greeting = tr(now.getHours() < 12 ? "dash.greetMorning" : now.getHours() < 17 ? "dash.greetAfternoon" : "dash.greetEvening");
  const allClear = !critical.length && !dueToday.length && unread.length === 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Sunrise size={14} className="text-[var(--color-primary)]" />
          {greeting} - {tr("dash.yourBrief")}
        </h2>
        <span className="text-[10px] text-[var(--color-muted)]">{format(now, "EEE, d MMM · HH:mm")}</span>
      </div>

      {allClear && (
        <div className="flex items-center gap-2 mb-2 text-xs text-green-400">
          <CheckCircle2 size={12} /> All clear - no alerts or deadlines pending.
        </div>
      )}

      <ul className="space-y-2">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <Icon size={13} className={`${it.tone} shrink-0 mt-0.5`} />
              <span className="text-[var(--color-text)] leading-snug">{it.text}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
        <button onClick={() => navigate("/alerts")} className="text-xs text-[var(--color-primary)] hover:underline">Open alerts →</button>
        <span className="text-[var(--color-muted)]">·</span>
        <button onClick={() => navigate("/compliance")} className="text-xs text-[var(--color-primary)] hover:underline">View calendar →</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD WIDGETS - additional practical cards (additive, self-contained).
// Each computes from the live store; transient UI uses useState; durable picks
// persist via useFeatureState with "dash-" keys. Do not disturb existing widgets.
// ════════════════════════════════════════════════════════════════════════════

// ── Overdue Invoices ──────────────────────────────────────────────────────────
// Receivables already past their due date, ranked by amount. Deep-links to AR.
function OverdueInvoicesWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const invoices = store.invoices ?? [];
  const todayStr = new Date().toISOString().split("T")[0];

  const overdue = invoices
    .filter(i => i.status !== "paid" && i.dueDate < todayStr)
    .map(i => ({ ...i, daysLate: Math.max(0, Math.round((Date.now() - new Date(i.dueDate).getTime()) / 86400000)) }))
    .sort((a, b) => b.amount - a.amount);

  if (overdue.length === 0) return null;
  const total = overdue.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <FileWarning size={13} className="text-red-400" />
          Overdue Invoices
        </h2>
        <button onClick={() => navigate("/receivables")} className="text-xs text-[var(--color-primary)] hover:underline">Chase all →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">{overdue.length} invoice{overdue.length > 1 ? "s" : ""} past due · <span className="text-red-400 font-semibold">{formatCurrency(total)}</span> outstanding</p>
      <div className="space-y-1">
        {overdue.slice(0, 5).map(i => (
          <button key={i.id} onClick={() => navigate("/receivables")}
            className="w-full flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 text-left hover:bg-white/3 rounded px-1 transition-colors">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{i.customer}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{i.invoiceNumber ? `${i.invoiceNumber} · ` : ""}{i.daysLate}d late</p>
            </div>
            <span className="text-sm font-semibold tabular-nums text-red-400 shrink-0 ml-3">{formatCurrency(i.amount)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Upcoming Dues (next 7 days) ───────────────────────────────────────────────
// Invoices coming due + recurring outflows landing this week, on a timeline.
function UpcomingDuesWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;
  const invoices = store.invoices ?? [];

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const horizon = addDays(now, 7).toISOString().split("T")[0];

  type Due = { id: string; label: string; sub: string; date: string; amount: number; kind: "in" | "out"; path: string };
  const items: Due[] = [];

  invoices
    .filter(i => i.status !== "paid" && i.dueDate >= todayStr && i.dueDate <= horizon)
    .forEach(i => items.push({ id: "inv-" + i.id, label: i.customer, sub: "Invoice due", date: i.dueDate, amount: i.amount, kind: "in", path: "/receivables" }));

  // Recurring outflows: project this month's recurring debits onto the 7-day window.
  transactions
    .filter(t => t.isRecurring && t.amount < 0)
    .forEach(t => {
      const dom = new Date(t.date).getDate();
      const proj = new Date(now.getFullYear(), now.getMonth(), dom);
      const projStr = proj.toISOString().split("T")[0];
      if (projStr >= todayStr && projStr <= horizon) {
        items.push({ id: "rec-" + t.id, label: t.description || t.counterparty || "Recurring payment", sub: "Recurring · " + t.category, date: projStr, amount: Math.abs(t.amount), kind: "out", path: "/transactions" });
      }
    });

  if (items.length === 0) return null;
  items.sort((a, b) => a.date.localeCompare(b.date));
  const inflow = items.filter(i => i.kind === "in").reduce((s, i) => s + i.amount, 0);
  const outflow = items.filter(i => i.kind === "out").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Clock size={13} className="text-[var(--color-primary)]" />
          Due in the next 7 days
        </h2>
        <span className="text-[10px] text-[var(--color-muted)]">
          <span className="text-green-400">+{formatCurrency(inflow)}</span> · <span className="text-red-400">−{formatCurrency(outflow)}</span>
        </span>
      </div>
      <div className="space-y-1">
        {items.slice(0, 6).map(i => {
          const d = new Date(i.date);
          const when = isToday(d) ? "Today" : format(d, "EEE d MMM");
          return (
            <button key={i.id} onClick={() => navigate(i.path)}
              className="w-full flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 text-left hover:bg-white/3 rounded px-1 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i.kind === "in" ? "bg-green-400" : "bg-red-400"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{i.label}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{i.sub} · {when}</p>
                </div>
              </div>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ml-3 ${i.kind === "in" ? "text-green-400" : "text-red-400"}`}>
                {i.kind === "in" ? "+" : "−"}{formatCurrency(i.amount)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Recent Activity Feed ──────────────────────────────────────────────────────
// Latest transactions across all accounts, newest first.
function RecentActivityFeed() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  if (recent.length === 0) return null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Activity size={13} className="text-[var(--color-primary)]" />
          Recent Activity
        </h2>
        <button onClick={() => navigate("/transactions")} className="text-xs text-[var(--color-primary)] hover:underline">View all →</button>
      </div>
      <div className="space-y-1">
        {recent.map(t => {
          const isIn = t.amount > 0;
          return (
            <div key={t.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isIn ? "bg-green-950/40 text-green-400" : "bg-red-950/40 text-red-400"}`}>
                  {isIn ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.description || t.counterparty || "Transaction"}</p>
                  <p className="text-[10px] text-[var(--color-muted)] capitalize">{t.category} · {format(new Date(t.date), "d MMM")}</p>
                </div>
              </div>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ml-3 ${isIn ? "text-green-400" : "text-red-400"}`}>
                {isIn ? "+" : "−"}{formatCurrency(Math.abs(t.amount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cash Trend Sparkline ──────────────────────────────────────────────────────
// Reconstructs the daily closing balance over the last 30 days from current
// balance minus subsequent net flows (back-cast).
function CashTrendSparkline() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);

  const data = useMemo(() => {
    const days = 30;
    const now = new Date();
    // Net flow per day for the last `days` days.
    const flowByDay: Record<string, number> = {};
    transactions.forEach(t => { flowByDay[t.date] = (flowByDay[t.date] ?? 0) + t.amount; });

    // Walk backwards from today's balance.
    const series: { date: string; bal: number }[] = [];
    let running = balance;
    for (let i = 0; i < days; i++) {
      const d = addDays(now, -i);
      const key = d.toISOString().split("T")[0];
      series.push({ date: format(d, "d MMM"), bal: Math.round(running / 1000) });
      running -= flowByDay[key] ?? 0; // subtract that day's flow to get the prior close
    }
    return series.reverse();
  }, [transactions, balance]);

  const start = data[0]?.bal ?? 0;
  const end = data[data.length - 1]?.bal ?? 0;
  const changePct = start !== 0 ? ((end - start) / Math.abs(start)) * 100 : 0;
  const up = end >= start;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp size={13} className="text-[var(--color-primary)]" />
          Cash Trend · 30 days
        </h2>
        <span className={`text-xs font-semibold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
          {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(0)}%
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">Estimated daily closing balance · ₹ thousands</p>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cashTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={up ? "#2EA882" : "#ef4444"} stopOpacity={0.25} />
              <stop offset="95%" stopColor={up ? "#2EA882" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} interval={6} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`₹${v}K`, "Balance"]} />
          <Area type="monotone" dataKey="bal" stroke={up ? "#2EA882" : "#ef4444"} strokeWidth={2} fill="url(#cashTrendGrad)" animationDuration={400} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── This-month mini P&L ───────────────────────────────────────────────────────
// Compact income statement for the current calendar month from the store.
function MiniPnLWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const mtd = transactions.filter(t => t.date.startsWith(monthStr));

  const revenue = mtd.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const cat = (c: string) => Math.abs(mtd.filter(t => t.category === c && t.amount < 0).reduce((s, t) => s + t.amount, 0));
  const payroll = cat("payroll");
  const opex = cat("expense");
  const tax = cat("tax");
  const loan = cat("loan");
  const otherOut = Math.abs(mtd.filter(t => t.amount < 0 && !["payroll", "expense", "tax", "loan"].includes(t.category)).reduce((s, t) => s + t.amount, 0));
  const totalCost = payroll + opex + tax + loan + otherOut;
  const net = revenue - totalCost;
  const margin = revenue > 0 ? (net / revenue) * 100 : 0;

  const rows = [
    { label: "Revenue", value: revenue, tone: "text-green-400", strong: true },
    { label: "Payroll", value: -payroll, tone: "text-[var(--color-text)]" },
    { label: "Operating expense", value: -opex, tone: "text-[var(--color-text)]" },
    { label: "Tax", value: -tax, tone: "text-[var(--color-text)]" },
    { label: "Loan / EMI", value: -loan, tone: "text-[var(--color-text)]" },
    { label: "Other", value: -otherOut, tone: "text-[var(--color-text)]" },
  ].filter(r => r.value !== 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Scale size={13} className="text-[var(--color-primary)]" />
          This Month · Mini P&amp;L
        </h2>
        <button onClick={() => navigate("/analytics")} className="text-xs text-[var(--color-primary)] hover:underline">Details →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">{format(new Date(), "MMMM yyyy")} · cash basis</p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className={`${r.strong ? "font-semibold" : "text-[var(--color-muted)] text-xs"}`}>{r.label}</span>
            <span className={`tabular-nums ${r.value >= 0 ? r.tone : "text-red-400"}`}>
              {r.value >= 0 ? "" : "−"}{formatCurrency(Math.abs(r.value))}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
        <span className="text-sm font-semibold">Net {net >= 0 ? "profit" : "loss"}</span>
        <span className={`text-base font-bold tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
          {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
        </span>
      </div>
      {revenue > 0 && (
        <p className="text-[10px] text-[var(--color-muted)] mt-1 text-right">{margin >= 0 ? "" : "−"}{Math.abs(margin).toFixed(0)}% net margin</p>
      )}
    </div>
  );
}

// ── Spend by Payee (donut) ────────────────────────────────────────────────────
// Where the money goes - top outflow counterparties as a donut (distinct from
// the category bar breakdown).
const PAYEE_COLORS = ["#2EA882", "#3b82f6", "#a855f7", "#eab308", "#ef4444", "#64748b"] as const;

function SpendByPayeeDonut() {
  const { store } = useApp();
  const { transactions } = store;

  const data = useMemo(() => {
    const byPayee: Record<string, number> = {};
    transactions.filter(t => t.amount < 0).forEach(t => {
      const key = t.counterparty || t.category || "Other";
      byPayee[key] = (byPayee[key] ?? 0) + Math.abs(t.amount);
    });
    const sorted = Object.entries(byPayee).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, x) => s + x.value, 0);
    if (rest > 0) top.push({ name: "Other", value: rest });
    return top;
  }, [transactions]);

  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <PieIcon size={13} className="text-[var(--color-primary)]" />
        Where the Money Goes
      </h2>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={2} stroke="none">
                {data.map((_, i) => <Cell key={i} fill={PAYEE_COLORS[i % PAYEE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] text-[var(--color-muted)]">Total out</span>
            <span className="text-xs font-bold tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          {data.map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PAYEE_COLORS[i % PAYEE_COLORS.length] }} />
                  <span className="truncate font-medium">{d.name}</span>
                </span>
                <span className="text-[var(--color-muted)] tabular-nums shrink-0 ml-2">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD WIDGETS - 2nd pass additions (additive, self-contained).
// Net-flow trend, expense biggest-movers, customer payment status, burn gauge,
// weekday inflow pattern. Each computes from the live store. Do not disturb
// existing widgets. Durable picks (none needed here) would use "dash-" keys.
// ════════════════════════════════════════════════════════════════════════════

// ── Net Cash Flow · last 6 months ─────────────────────────────────────────────
// Monthly net (inflow − outflow) as a signed bar chart - distinct from the
// 30-day balance sparkline and the current-month mini P&L.
function NetCashFlowTrend() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const data = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMo = transactions.filter(t => t.date.startsWith(key) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const outMo = transactions.filter(t => t.date.startsWith(key) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      const net = inMo - outMo;
      return { label: format(d, "MMM"), net: Math.round(net / 1000), raw: net };
    });
    return months;
  }, [transactions]);

  const hasData = data.some(d => d.raw !== 0);
  if (!hasData) return null;

  const positives = data.filter(d => d.net >= 0).length;
  const avg = Math.round(data.reduce((s, d) => s + d.raw, 0) / data.length);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 size={13} className="text-[var(--color-primary)]" />
          Net Cash Flow · 6 months
        </h2>
        <button onClick={() => navigate("/analytics")} className="text-xs text-[var(--color-primary)] hover:underline">Details →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">Inflow minus outflow per month · ₹ thousands · {positives}/6 cash-positive · avg {avg >= 0 ? "+" : "−"}{formatCurrency(Math.abs(avg))}</p>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`₹${v}K`, "Net"]} />
          <Bar dataKey="net" radius={[3, 3, 0, 0]} animationDuration={400}>
            {data.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#2EA882" : "#ef4444"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Expense biggest movers (this month vs last) ───────────────────────────────
// Per-category outflow change MoM - surfaces what is growing/shrinking, distinct
// from the static burn-by-category bar.
function ExpenseMoversWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const movers = useMemo(() => {
    const now = new Date();
    const thisM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastM = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, "0")}`;

    const sumByCat = (month: string) => {
      const map: Record<string, number> = {};
      transactions.filter(t => t.amount < 0 && t.date.startsWith(month)).forEach(t => {
        const c = t.category || "other";
        map[c] = (map[c] ?? 0) + Math.abs(t.amount);
      });
      return map;
    };
    const cur = sumByCat(thisM);
    const prev = sumByCat(lastM);
    const cats = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    return cats
      .map(c => {
        const now2 = cur[c] ?? 0;
        const was = prev[c] ?? 0;
        const delta = now2 - was;
        const pct = was > 0 ? (delta / was) * 100 : now2 > 0 ? 100 : 0;
        return { cat: c, now: now2, was, delta, pct };
      })
      .filter(m => Math.abs(m.delta) > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);
  }, [transactions]);

  if (movers.length === 0) return null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp size={13} className="text-[var(--color-primary)]" />
          Biggest Movers · spend
        </h2>
        <button onClick={() => navigate("/spend")} className="text-xs text-[var(--color-primary)] hover:underline">Review →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">Category spend change vs last month</p>
      <div className="space-y-2">
        {movers.map(m => {
          const up = m.delta > 0;
          return (
            <div key={m.cat} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${up ? "bg-red-950/40 text-red-400" : "bg-green-950/40 text-green-400"}`}>
                  {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize truncate">{m.cat}</p>
                  <p className="text-[10px] text-[var(--color-muted)] tabular-nums">{formatCurrency(m.was)} → {formatCurrency(m.now)}</p>
                </div>
              </div>
              <span className={`text-xs font-semibold tabular-nums shrink-0 ml-3 ${up ? "text-red-400" : "text-green-400"}`}>
                {up ? "▲" : "▼"} {m.was > 0 ? `${Math.abs(m.pct).toFixed(0)}%` : "new"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Customer payment status ───────────────────────────────────────────────────
// Receivables split into paid / due-soon / overdue - a status summary (donut +
// counts), distinct from the overdue-only list and the dues timeline.
const PAY_STATUS_COLORS = ["#2EA882", "#eab308", "#ef4444"] as const;

function CustomerPaymentStatus() {
  const { store } = useApp();
  const navigate = useNavigate();
  const invoices = store.invoices ?? [];
  const todayStr = new Date().toISOString().split("T")[0];

  const buckets = useMemo(() => {
    let paid = 0, pending = 0, overdue = 0;
    let paidAmt = 0, pendingAmt = 0, overdueAmt = 0;
    invoices.forEach(i => {
      if (i.status === "paid") { paid++; paidAmt += i.amount; }
      else if (i.dueDate < todayStr) { overdue++; overdueAmt += i.amount; }
      else { pending++; pendingAmt += i.amount; }
    });
    return { paid, pending, overdue, paidAmt, pendingAmt, overdueAmt };
  }, [invoices, todayStr]);

  if (invoices.length === 0) return null;

  const data = [
    { name: "Paid", value: buckets.paid, amt: buckets.paidAmt },
    { name: "Pending", value: buckets.pending, amt: buckets.pendingAmt },
    { name: "Overdue", value: buckets.overdue, amt: buckets.overdueAmt },
  ].filter(d => d.value > 0);

  const totalCount = buckets.paid + buckets.pending + buckets.overdue;
  const colorFor = (name: string) => name === "Paid" ? PAY_STATUS_COLORS[0] : name === "Pending" ? PAY_STATUS_COLORS[1] : PAY_STATUS_COLORS[2];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Receipt size={13} className="text-[var(--color-primary)]" />
          Customer Payment Status
        </h2>
        <button onClick={() => navigate("/receivables")} className="text-xs text-[var(--color-primary)] hover:underline">Receivables →</button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={2} stroke="none">
                {data.map(d => <Cell key={d.name} fill={colorFor(d.name)} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number, n: string) => [`${v} invoice${v > 1 ? "s" : ""}`, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] text-[var(--color-muted)]">Invoices</span>
            <span className="text-sm font-bold tabular-nums">{totalCount}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {data.map(d => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(d.name) }} />
                <span className="font-medium">{d.name}</span>
                <span className="text-[var(--color-muted)]">· {d.value}</span>
              </span>
              <span className="text-[var(--color-muted)] tabular-nums shrink-0 ml-2">{formatCurrency(d.amt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Days-of-cash gauge + savings rate ─────────────────────────────────────────
// A half-circle gauge of days of cash on hand plus the share of inflow retained
// this month (savings rate) - a distinct framing from the runway stat card.
function CashGaugeWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions, bankAccounts } = store;

  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const burn = monthlyBurn(transactions);
  const daysCash = burn > 0 ? Math.round((balance / burn) * 30) : 999;

  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const inMo = transactions.filter(t => t.date.startsWith(monthStr) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outMo = transactions.filter(t => t.date.startsWith(monthStr) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const savingsRate = inMo > 0 ? ((inMo - outMo) / inMo) * 100 : 0;

  // Cap the gauge at 180 days for the visual sweep.
  const capped = Math.min(daysCash, 180);
  const pct = capped / 180; // 0..1
  const color = daysCash < 30 ? "#ef4444" : daysCash < 90 ? "#eab308" : "#22c55e";
  const label = daysCash < 30 ? "Critical" : daysCash < 90 ? "Watch" : "Comfortable";

  // Half-circle arc maths: dasharray over a semicircle (radius 40, length ≈ 125.6).
  const arcLen = Math.PI * 40;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Target size={13} className="text-[var(--color-primary)]" />
          Days of Cash
        </h2>
        <button onClick={() => navigate("/forecast")} className="text-xs text-[var(--color-primary)] hover:underline">Forecast →</button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 120, height: 70 }}>
          <svg viewBox="0 0 100 54" className="w-full h-full">
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--color-border)" strokeWidth="8" strokeLinecap="round" />
            <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${pct * arcLen} ${arcLen}`} />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="text-lg font-bold tabular-nums" style={{ color }}>{daysCash >= 999 ? "∞" : daysCash}</span>
            <span className="text-[9px] text-[var(--color-muted)]">days</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-[10px] text-[var(--color-muted)]">Cash position</p>
            <p className="text-sm font-semibold" style={{ color }}>{label}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)] mb-0.5">
              <span>Savings rate (MTD)</span>
              <span className={`font-semibold tabular-nums ${savingsRate >= 0 ? "text-green-400" : "text-red-400"}`}>{savingsRate >= 0 ? "" : "−"}{Math.abs(savingsRate).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, savingsRate))}%`, background: savingsRate >= 0 ? "#2EA882" : "#ef4444" }} />
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{inMo > 0 ? `${formatCurrency(inMo - outMo)} kept of ${formatCurrency(inMo)} earned` : "No inflow this month yet"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inflow by weekday ─────────────────────────────────────────────────────────
// Which weekday brings the most money in - a 7-bar pattern over all history,
// distinct from the forward-looking 7-day Cash This Week view.
function WeekdayInflowWidget() {
  const { store } = useApp();
  const { transactions } = store;

  const data = useMemo(() => {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const totals = new Array<number>(7).fill(0);
    const counts = new Array<number>(7).fill(0);
    transactions.filter(t => t.amount > 0).forEach(t => {
      const dow = new Date(t.date).getDay(); // 0=Sun..6=Sat
      const idx = dow === 0 ? 6 : dow - 1; // Mon-first
      totals[idx] += t.amount;
      counts[idx] += 1;
    });
    return names.map((label, i) => ({ label, total: totals[i], count: counts[i] }));
  }, [transactions]);

  const hasData = data.some(d => d.total > 0);
  if (!hasData) return null;

  const max = Math.max(...data.map(d => d.total), 1);
  const best = data.reduce((b, d) => (d.total > b.total ? d : b), data[0]);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Calendar size={13} className="text-[var(--color-primary)]" />
        Inflow by Weekday
      </h2>
      <p className="text-xs text-[var(--color-muted)] mb-3">When customers tend to pay · <span className="text-[var(--color-primary)] font-semibold">{best.label}</span> is your strongest day</p>
      <div className="grid grid-cols-7 gap-1.5">
        {data.map(d => {
          const h = (d.total / max) * 100;
          const isBest = d.label === best.label && d.total > 0;
          return (
            <div key={d.label} className="flex flex-col items-center gap-1">
              <div className="relative w-full h-20 flex items-end">
                <div className="w-full rounded-t transition-all duration-500" title={`${formatCurrency(d.total)} · ${d.count} payment${d.count === 1 ? "" : "s"}`}
                  style={{ height: `${Math.max(4, h)}%`, background: isBest ? "#2EA882" : "var(--color-primary)", opacity: d.total > 0 ? (isBest ? 1 : 0.45) : 0.12 }} />
              </div>
              <span className={`text-[9px] ${isBest ? "text-[var(--color-primary)] font-semibold" : "text-[var(--color-muted)]"}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD WIDGETS - 3rd pass (additive, self-contained, non-duplicate).
// Top vendors MTD, invoice-status breakdown, 6-month burn trend, AR-vs-AP
// balance. Each computes from the live store. Do not disturb existing widgets.
// ════════════════════════════════════════════════════════════════════════════

// ── Top Vendors · this month ──────────────────────────────────────────────────
// Largest outflow counterparties for the current month, ranked - distinct from
// the all-time payee donut.
function TopVendorsWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const vendors = useMemo(() => {
    const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const byVendor: Record<string, number> = {};
    transactions
      .filter(t => t.amount < 0 && t.date.startsWith(monthStr))
      .forEach(t => {
        const key = t.counterparty || t.description || t.category || "Other";
        byVendor[key] = (byVendor[key] ?? 0) + Math.abs(t.amount);
      });
    return Object.entries(byVendor)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  if (vendors.length === 0) return null;
  const max = Math.max(...vendors.map(v => v.value), 1);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Building2 size={13} className="text-[var(--color-primary)]" />
          Top Vendors · this month
        </h2>
        <button onClick={() => navigate("/transactions")} className="text-xs text-[var(--color-primary)] hover:underline">All →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">{format(new Date(), "MMMM yyyy")} · largest payees by spend</p>
      <div className="space-y-2.5">
        {vendors.map(v => {
          const pct = (v.value / max) * 100;
          return (
            <div key={v.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium truncate min-w-0">{v.name}</span>
                <span className="tabular-nums text-[var(--color-muted)] shrink-0 ml-2">{formatCurrency(v.value)}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500" style={{ width: `${Math.max(3, pct)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Invoice Status Breakdown ──────────────────────────────────────────────────
// Receivables split by paid / due / overdue, with counts, amounts and a stacked
// bar - distinct from the overdue-only list.
function InvoiceStatusWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const invoices = store.invoices ?? [];

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const buckets = {
      paid:    { label: "Paid",    count: 0, amount: 0, color: "#2EA882" },
      due:     { label: "Due",     count: 0, amount: 0, color: "#eab308" },
      overdue: { label: "Overdue", count: 0, amount: 0, color: "#ef4444" },
    };
    invoices.forEach(i => {
      if (i.status === "paid") { buckets.paid.count++; buckets.paid.amount += i.amount; }
      else if (i.dueDate < todayStr) { buckets.overdue.count++; buckets.overdue.amount += i.amount; }
      else { buckets.due.count++; buckets.due.amount += i.amount; }
    });
    return Object.values(buckets);
  }, [invoices]);

  if (invoices.length === 0) return null;
  const total = stats.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Receipt size={13} className="text-[var(--color-primary)]" />
          Invoice Status
        </h2>
        <button onClick={() => navigate("/receivables")} className="text-xs text-[var(--color-primary)] hover:underline">Open →</button>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden mb-3 bg-[var(--color-bg)]">
        {stats.map(b => total > 0 && b.amount > 0 && (
          <div key={b.label} style={{ width: `${(b.amount / total) * 100}%`, background: b.color }} title={`${b.label}: ${formatCurrency(b.amount)}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(b => (
          <div key={b.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: b.color }} />
              <p className="text-[10px] text-[var(--color-muted)] font-medium">{b.label}</p>
            </div>
            <p className="text-base font-bold tabular-nums">{b.count}</p>
            <p className="text-[10px] text-[var(--color-muted)] tabular-nums truncate">{formatCurrency(b.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Monthly Burn Trend · 6 months ─────────────────────────────────────────────
// Total outflow per month as an area trend - distinct from signed net-flow bars.
function BurnTrendWidget() {
  const { store } = useApp();
  const navigate = useNavigate();
  const { transactions } = store;

  const data = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const out = transactions.filter(t => t.date.startsWith(key) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      return { label: format(d, "MMM"), burn: Math.round(out / 1000), raw: out };
    });
  }, [transactions]);

  const hasData = data.some(d => d.raw > 0);
  if (!hasData) return null;

  const latest = data[data.length - 1].raw;
  const prev = data[data.length - 2]?.raw ?? 0;
  const delta = prev > 0 ? ((latest - prev) / prev) * 100 : 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingDown size={13} className="text-red-400" />
          Burn Trend · 6 months
        </h2>
        <button onClick={() => navigate("/spend")} className="text-xs text-[var(--color-primary)] hover:underline">Review →</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-3">Total outflow per month · ₹ thousands{prev > 0 ? ` · ${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)}% vs prior month` : ""}</p>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`₹${v}K`, "Burn"]} />
          <Area type="monotone" dataKey="burn" stroke="#ef4444" strokeWidth={2} fill="url(#burnGrad)" animationDuration={400} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Receivables vs Payables ───────────────────────────────────────────────────
// Money owed to you (open invoices) vs money you owe (recurring/scheduled
// outflows due this month) - a working-capital balance snapshot.
function ReceivablesVsPayablesWidget() {
  const { store } = useApp();
  const { transactions } = store;
  const invoices = store.invoices ?? [];

  const { receivable, payable } = useMemo(() => {
    const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const rec = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const pay = transactions
      .filter(t => t.amount < 0 && (t.isRecurring || t.date.startsWith(monthStr)) && ["payroll", "loan", "tax", "expense"].includes(t.category))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return { receivable: rec, payable: pay };
  }, [invoices, transactions]);

  if (receivable === 0 && payable === 0) return null;
  const net = receivable - payable;
  const max = Math.max(receivable, payable, 1);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Scale size={13} className="text-[var(--color-primary)]" />
        Receivables vs Payables
      </h2>
      <p className="text-xs text-[var(--color-muted)] mb-3">Working-capital balance · what's owed to you vs your near-term commitments</p>
      <div className="space-y-3">
        {[
          { label: "Receivable (open invoices)", value: receivable, color: "#2EA882" },
          { label: "Payable (this month / recurring)", value: payable, color: "#ef4444" },
        ].map(r => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{r.label}</span>
              <span className="tabular-nums" style={{ color: r.color }}>{formatCurrency(r.value)}</span>
            </div>
            <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
        <span className="text-sm font-semibold">Net position</span>
        <span className={`text-base font-bold tabular-nums ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
          {net >= 0 ? "+" : "−"}{formatCurrency(Math.abs(net))}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { store, markAlertRead, addBankAccount, addTransaction, isReadOnly } = useApp();
  const { bankAccounts, transactions, alerts, forecast, creditApplications, firm } = store;
  const navigate = useNavigate();
  const tr = useT();   // `t` is used as the transaction param in filters below
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAddTx, setShowAddTx]           = useState(false);
  const [showImport,    setShowImport]      = useState(false);
  const [dashView, setDashView]             = useState<"today" | "insights">("today");
  const [simpleMode, setSimpleMode]         = useState(() => localStorage.getItem("hr_simple_mode") === "true");
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem("hr_onboarding_dismissed") === "true"
  );

  const totalBalance = bankAccounts.reduce((a, b) => a + b.balance, 0);
  const burn         = monthlyBurn(transactions);
  const runway       = runwayDays(bankAccounts.map(b => b.balance), burn);
  const unread       = alerts.filter(a => !a.isRead).length;

  const isEmpty = bankAccounts.length === 0 && transactions.length === 0;

  // Probabilistic early-warning from the Monte-Carlo engine (memoised on the store).
  const fcRisk = useMemo(() => (transactions.length ? runForecast(store).risk : null), [store, transactions.length]);
  const showBreachWarning = !!fcRisk && fcRisk.probBreachByDay[Math.min(44, fcRisk.probBreachByDay.length - 1)] >= 0.5;

  // Keep the home-screen widget's snapshot fresh (native only; no-op on web).
  useEffect(() => {
    const low = store.forecast?.length ? store.forecast.reduce((m, p) => Math.min(m, p.p50), store.forecast[0].p50) : totalBalance;
    const lowPt = store.forecast?.length ? store.forecast.reduce((a, p) => (p.p50 < a.p50 ? p : a), store.forecast[0]) : null;
    updateWidgetData({
      balance: totalBalance,
      runwayDays: fcRisk?.runwayDist.p50 ?? runway,
      lowPoint: Math.round(low),
      lowPointDate: lowPt?.date ?? null,
      updatedAt: new Date().toISOString(),
    });
  }, [totalBalance, runway, fcRisk, store.forecast]);

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

  // Overdue receivables (from store invoices) - for the AI cash-position summary
  const todayStr = today.toISOString().split("T")[0];
  const invoices = (store as { invoices?: { dueDate: string; amount: number; status: string }[] }).invoices ?? [];
  const overdueInvoices = invoices.filter(i => i.dueDate < todayStr && i.status !== "paid");
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amount, 0);

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

  if (simpleMode) return <SimpleHome onExit={() => { localStorage.removeItem("hr_simple_mode"); setSimpleMode(false); }} />;

  return (
    <div className="space-y-6">
      <OnboardingChecklist />
      <PendingApprovals />
      {showBreachWarning && fcRisk && (
        <button onClick={() => navigate("/forecast")}
          className="w-full text-left bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4 hover:bg-red-950/30 transition-colors">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <p className="text-sm">
              <strong className="text-red-400">{Math.round(fcRisk.probBreach * 100)}% chance</strong> of dipping below your safety buffer
              {fcRisk.expectedTimeToBreachDays != null ? <> in ~<strong className="text-red-400">{fcRisk.expectedTimeToBreachDays} days</strong></> : ""} ·
              worst-case runway <strong>{fcRisk.runwayDist.p10 >= 90 ? "90+" : fcRisk.runwayDist.p10}d</strong>
            </p>
          </div>
          <span className="text-xs text-red-300 shrink-0 whitespace-nowrap">View forecast →</span>
        </button>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{tr("Dashboard")}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { localStorage.setItem("hr_simple_mode", "true"); setSimpleMode(true); }}
            title={tr("dash.simpleViewHint")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors">
            <LayoutGrid size={12} /> {tr("dash.simpleView")}
          </button>
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
              <button onClick={() => navigate("/invoices?compose=1")} disabled={isReadOnly} title={isReadOnly ? "Read-only in client view" : undefined}
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg font-semibold hover:bg-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={12} /> New Invoice
              </button>
              <button onClick={() => navigate("/payments")} disabled={isReadOnly} title={isReadOnly ? "Read-only in client view" : undefined}
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-1.5 rounded-lg font-semibold hover:bg-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={12} /> Record Payment
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

      {/* Quick actions - derived from real store data; only shows rows that apply */}
      {(() => {
        const quickActions: { icon: React.ElementType; label: string; path: string; color: string }[] = [];
        if (overdueInvoices.length > 0)
          quickActions.push({ icon: FileWarning, label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? "s" : ""} · ${formatCurrency(overdueTotal)}`, path: "/collections", color: "text-red-400" });
        if (unread > 0)
          quickActions.push({ icon: Bell, label: `${unread} unread alert${unread > 1 ? "s" : ""}`, path: "/alerts", color: "text-orange-400" });
        quickActions.push({ icon: Receipt, label: "GST filing", path: "/gst", color: "text-yellow-400" });
        if (bankAccounts.length === 0)
          quickActions.push({ icon: Landmark, label: "Add a bank account", path: "/banking", color: "text-[var(--color-primary)]" });
        quickActions.push({ icon: Plus, label: "Record a transaction", path: "/transactions", color: "text-green-400" });

        return (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap size={13} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">Quick actions</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ icon: Icon, label, path, color }) => (
                <button key={path} onClick={() => navigate(path)}
                  className="flex items-center gap-2 text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full pl-3 pr-2.5 py-1.5 hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-accent)] transition-colors">
                  <Icon size={13} className={color} />
                  <span className="text-[var(--color-text)]">{label}</span>
                  <ChevronRight size={12} className="text-[var(--color-muted)]" />
                </button>
              ))}
            </div>
          </div>
        );
      })()}

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
          {/* Stat cards - compute deltas vs last month */}
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

          {/* AI cash-position summary - full-width, collapsed (no auto-call) */}
          <AiInsight
            collapsed
            question="Summarise my cash position, runway and what I should do this week."
            context={{
              totalBalance,
              monthlyBurn: burn,
              runwayDays: runway,
              overdueTotal,
              overdueInvoiceCount: overdueInvoices.length,
              upcomingObligations: taxDates.map(d => ({ item: d.label, due: d.desc })),
              estimatedMonthlyGst: gstEstimate,
              unreadAlerts: unread,
            }}
          />

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

          {/* Dashboard views: Today (act now) vs Insights (analyse) - the home
              screen leads with what needs attention, not twenty charts at once. */}
          <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
            {([["today", "dash.today"], ["insights", "dash.insights"]] as const).map(([v, labelKey]) => (
              <button key={v} onClick={() => setDashView(v)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${dashView === v ? "border-[var(--color-primary)] text-[var(--color-text)]" : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                {tr(labelKey)}
              </button>
            ))}
          </div>

          {/* Today: what needs attention right now */}
          {dashView === "today" && (
            <>
              <CashThisWeekWidget />
              <SmartActionsPanel />
              <TreasuryBanner />
              <FinancingNudgeCard />
              <MorningBriefCard />
              <DailyCashSnapshot />
              <OverdueInvoicesWidget />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <UpcomingDuesWidget />
                <RecentActivityFeed />
              </div>
            </>
          )}

          {/* Insights: understand the business (health, trends, breakdowns, forecast) */}
          {dashView === "insights" && (
            <>
          <HealthScoreWidget />
          <KpiWidgetBuilder />
          <GoalTracker />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MiniPnLWidget />
            <SpendByPayeeDonut />
          </div>
          <CashTrendSparkline />

          {/* ── 2nd-pass widgets: net flow, movers, payment status, gauge, weekday ── */}
          <NetCashFlowTrend />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ExpenseMoversWidget />
            <CustomerPaymentStatus />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CashGaugeWidget />
            <WeekdayInflowWidget />
          </div>

          {/* ── 3rd-pass widgets: vendors, invoice status, burn trend, AR vs AP ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopVendorsWidget />
            <InvoiceStatusWidget />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BurnTrendWidget />
            <ReceivablesVsPayablesWidget />
          </div>

          {/* Credit rescue CTA */}
          {runway > 0 && runway < 45 && (
            <div className="bg-red-900/40 border border-red-700/60 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-sm">Your cash runway is <strong className="text-red-400">{runway} days</strong> - balance pressure detected. Act now before it becomes critical.</p>
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
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          <p className="text-xs text-[var(--color-muted)] truncate">
                            {[
                              a.branch || a.provider,
                              a.accountType ? (ACCOUNT_TYPES.find(t => t.id === a.accountType)?.label ?? a.accountType) : null,
                              a.accountLast4 ? `••${a.accountLast4}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-[var(--color-text)] shrink-0 ml-2">{formatCurrency(a.balance)}</span>
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
        </>
      )}

      {/* Modals */}
      {showAddAccount && (
        <AddAccountModal
          onClose={() => setShowAddAccount(false)}
          onAdd={(a) => {
            addBankAccount({
              id: generateId(), name: a.name, provider: a.provider, balance: a.balance,
              lastSync: new Date().toISOString(), status: "connected",
              ifsc: a.ifsc, bankName: a.bankName, branch: a.branch, city: a.city,
              accountLast4: a.accountLast4, accountType: a.accountType, asOf: a.asOf,
            });
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
