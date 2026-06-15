import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Boxes, Sparkles, SlidersHorizontal, Dices, GitCompareArrows, AlertTriangle,
  TrendingUp, Users, Target, Activity, Gauge, ShieldAlert, CheckCircle2, Info,
  Rocket, Flame, Heart, Clock, LayoutGrid, Wallet, Waypoints, CalendarRange,
  PieChart, Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, differenceInCalendarDays, startOfMonth, subMonths } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

// ── shared styles (reuse TaxPage input class) ───────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";
const TOOLTIP_STYLE = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 } as const;

type TabId =
  | "overview" | "twin" | "whatif" | "montecarlo" | "scenarios" | "earlywarning"
  | "trend" | "churn" | "breakeven" | "sensitivity" | "goal"
  | "runrate" | "expensecreep" | "ltv" | "paydelay" | "cohort" | "workcap"
  | "confband" | "seasonality" | "concentration" | "recurring";

const TABS = [
  ["overview", "Overview", Sparkles],
  ["twin", "Digital Twin", Boxes],
  ["whatif", "What-If Sliders", SlidersHorizontal],
  ["montecarlo", "Monte-Carlo Cash", Dices],
  ["scenarios", "Scenario Compare", GitCompareArrows],
  ["earlywarning", "Early Warning", AlertTriangle],
  ["trend", "Trend Projection", TrendingUp],
  ["churn", "Churn Risk", Users],
  ["breakeven", "Break-Even", Target],
  ["sensitivity", "Sensitivity", Activity],
  ["goal", "Goal Probability", Gauge],
  ["runrate", "Run-Rate", Rocket],
  ["expensecreep", "Expense Creep", Flame],
  ["ltv", "Customer LTV", Heart],
  ["paydelay", "Pay-Delay", Clock],
  ["cohort", "Cohort Retention", LayoutGrid],
  ["workcap", "Working Capital", Wallet],
  ["confband", "Revenue Band", Waypoints],
  ["seasonality", "Seasonality", CalendarRange],
  ["concentration", "Concentration", PieChart],
  ["recurring", "Recurring Spend", Repeat],
] as const;

// ── derived metrics from live store ──────────────────────────────────────────────
interface TwinMetrics {
  monthlyRevenue: number;
  monthlyExpense: number;
  monthlyNet: number;
  totalRevenue: number;
  totalExpense: number;
  cash: number;
  runwayMonths: number | null;
  revSeries: { month: string; revenue: number; expense: number; net: number }[];
  revVolatility: number; // std-dev of monthly revenue as % of mean
  outstandingAr: number;
  months: number;
}

function useTwinMetrics(): TwinMetrics {
  const { store } = useApp();
  return useMemo(() => {
    const txns = store.transactions ?? [];
    const invoices = store.invoices ?? [];

    // Group transactions by calendar month.
    const byMonth = new Map<string, { revenue: number; expense: number }>();
    for (const t of txns) {
      if (!t.date) continue;
      const key = t.date.slice(0, 7); // YYYY-MM
      const slot = byMonth.get(key) ?? { revenue: 0, expense: 0 };
      if (t.amount >= 0) slot.revenue += t.amount;
      else slot.expense += Math.abs(t.amount);
      byMonth.set(key, slot);
    }

    // Build a contiguous 12-month series ending this month so charts read left→right.
    const now = new Date();
    const revSeries: TwinMetrics["revSeries"] = [];
    for (let i = 11; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      const key = format(d, "yyyy-MM");
      const slot = byMonth.get(key) ?? { revenue: 0, expense: 0 };
      revSeries.push({
        month: format(d, "MMM"),
        revenue: Math.round(slot.revenue),
        expense: Math.round(slot.expense),
        net: Math.round(slot.revenue - slot.expense),
      });
    }

    const totalRevenue = txns.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0);
    const totalExpense = txns.reduce((s, t) => s + (t.amount < 0 ? Math.abs(t.amount) : 0), 0);

    // Use months that actually carry activity for the per-month average.
    const activeMonths = revSeries.filter(m => m.revenue > 0 || m.expense > 0);
    const denom = Math.max(1, activeMonths.length);
    const monthlyRevenue = activeMonths.reduce((s, m) => s + m.revenue, 0) / denom;
    const monthlyExpense = activeMonths.reduce((s, m) => s + m.expense, 0) / denom;
    const monthlyNet = monthlyRevenue - monthlyExpense;

    const cash = totalRevenue - totalExpense; // net cash generated, used as a runway proxy
    const burn = monthlyExpense - monthlyRevenue;
    const runwayMonths = burn > 0 && cash > 0 ? cash / burn : null;

    // Revenue volatility (coefficient of variation) drives Monte-Carlo spread.
    const revVals = activeMonths.map(m => m.revenue);
    const mean = revVals.length ? revVals.reduce((s, v) => s + v, 0) / revVals.length : 0;
    const variance = revVals.length ? revVals.reduce((s, v) => s + (v - mean) ** 2, 0) / revVals.length : 0;
    const revVolatility = mean > 0 ? Math.sqrt(variance) / mean : 0;

    const outstandingAr = invoices
      .filter(i => i.status !== "paid")
      .reduce((s, i) => s + i.amount, 0);

    return {
      monthlyRevenue, monthlyExpense, monthlyNet, totalRevenue, totalExpense,
      cash, runwayMonths, revSeries, revVolatility, outstandingAr, months: denom,
    };
  }, [store]);
}

// Small deterministic-free helpers (no module-level Math.random).
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

// ── disclaimer banner ─────────────────────────────────────────────────────────
function ModelNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-accent)]/30 px-3 py-2 text-[11px] text-[var(--color-muted)]">
      <Info size={12} className="shrink-0 mt-px" />
      <span>{text}</span>
    </div>
  );
}

export default function PredictPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--color-primary)]" /> Predict &amp; Simulate
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            A model-based digital twin of your business — war-game decisions, stress-test cash and surface risk before it bites. All figures are estimates from your own data, not guarantees.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewTab onJump={setTab} />}
      {tab === "twin" && <DigitalTwin />}
      {tab === "whatif" && <WhatIfSliders />}
      {tab === "montecarlo" && <MonteCarloCash />}
      {tab === "scenarios" && <ScenarioCompare />}
      {tab === "earlywarning" && <EarlyWarningBoard />}
      {tab === "trend" && <TrendProjection />}
      {tab === "churn" && <ChurnRisk />}
      {tab === "breakeven" && <BreakEvenSimulator />}
      {tab === "sensitivity" && <SensitivityTornado />}
      {tab === "goal" && <GoalProbability />}
      {tab === "runrate" && <RunRateProjector />}
      {tab === "expensecreep" && <ExpenseCreepDetector />}
      {tab === "ltv" && <CustomerLtv />}
      {tab === "paydelay" && <PaymentDelayPredictor />}
      {tab === "cohort" && <CohortRetention />}
      {tab === "workcap" && <WorkingCapitalForecast />}
      {tab === "confband" && <RevenueConfidenceBand />}
      {tab === "seasonality" && <SeasonalityForecast />}
      {tab === "concentration" && <ConcentrationRisk />}
      {tab === "recurring" && <RecurringSpendForecast />}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────────
function OverviewTab({ onJump }: { onJump: (t: TabId) => void }) {
  const m = useTwinMetrics();

  const cards = [
    { label: "Avg Monthly Revenue", value: formatCurrency(Math.round(m.monthlyRevenue)), color: "text-green-400", sub: `over ${m.months} active month(s)` },
    { label: "Avg Monthly Net", value: formatCurrency(Math.round(m.monthlyNet)), color: m.monthlyNet >= 0 ? "text-green-400" : "text-red-400", sub: m.monthlyNet >= 0 ? "cash-generative" : "burning cash" },
    { label: "Cash Runway (est.)", value: m.runwayMonths === null ? "Profitable" : `${m.runwayMonths.toFixed(1)} mo`, color: m.runwayMonths === null ? "text-green-400" : m.runwayMonths < 6 ? "text-red-400" : "text-yellow-400", sub: m.runwayMonths === null ? "net cash positive" : "at current burn" },
    { label: "Revenue Volatility", value: `${Math.round(m.revVolatility * 100)}%`, color: m.revVolatility > 0.4 ? "text-red-400" : m.revVolatility > 0.2 ? "text-yellow-400" : "text-green-400", sub: "month-to-month swing" },
  ];

  return (
    <div className="space-y-5">
      <ModelNote text="These are forward-looking estimates produced by simple statistical models on your historical ledger and invoices. Treat them as a planning aid, not financial advice or a forecast guarantee." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {m.revSeries.some(d => d.revenue > 0 || d.expense > 0) ? (
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-1">Last 12 months — the twin's training window</p>
          <p className="text-xs text-[var(--color-muted)] mb-4">Every simulation below is fitted on this history. The cleaner your transaction data, the sharper the estimate.</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={m.revSeries}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" fill="#22c55e30" />
              <Area type="monotone" dataKey="expense" name="Expense" stroke="#ef4444" fill="#ef444430" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className={`${CARD} border-dashed p-10 text-center`}>
          <Boxes size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">Not enough history yet</p>
          <p className="text-xs text-[var(--color-muted)]">Import or add transactions and invoices — the simulations populate automatically as data arrives.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {TABS.filter(([id]) => id !== "overview").map(([id, label, Icon]) => (
          <button key={id} onClick={() => onJump(id as TabId)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/50 transition-colors`}>
            <p className="text-sm font-semibold flex items-center gap-2"><Icon size={14} className="text-[var(--color-primary)]" /> {label}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1">{TOOL_BLURB[id as keyof typeof TOOL_BLURB]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

const TOOL_BLURB: Record<Exclude<TabId, "overview">, string> = {
  twin: "One-view snapshot of every key metric the model tracks.",
  whatif: "Slide revenue, cost and DSO; watch projected profit re-compute live.",
  montecarlo: "Randomised runs over your assumptions, summarised as P10/P50/P90 cash.",
  scenarios: "Optimistic / base / recession side by side on one table.",
  earlywarning: "Traffic-light board of predicted risks with severity.",
  trend: "Linear + seasonal projection of revenue from your history.",
  churn: "Customers drifting on payment recency, flagged before they leave.",
  breakeven: "Units and revenue needed to cover fixed costs.",
  sensitivity: "Tornado view of which driver moves profit the most.",
  goal: "Probability you hit a cash target by a chosen date.",
  runrate: "Annualise your recent run-rate into projected ARR with a growth dial.",
  expensecreep: "Per-category spend growth — catch costs quietly drifting up.",
  ltv: "Estimated lifetime value per customer from spend and tenure.",
  paydelay: "How many days late each customer typically pays, from history.",
  cohort: "Retention of each month's new customers, projected forward.",
  workcap: "Working-capital tied up in receivables and the cash it frees.",
  confband: "Revenue forecast as a P10/P50/P90 band, not a single line.",
  seasonality: "Strip the trend and reveal which months over/under-perform.",
  concentration: "Cash hit if your largest customers walk away.",
  recurring: "Projected annual cost of recurring vendor charges.",
};

// ── 1. Digital Twin snapshot ──────────────────────────────────────────────────────
function DigitalTwin() {
  const m = useTwinMetrics();
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const overdue = invoices.filter(i => i.status === "overdue").length;

  const tiles = [
    { label: "Avg Monthly Revenue", value: formatCurrency(Math.round(m.monthlyRevenue)) },
    { label: "Avg Monthly Expense", value: formatCurrency(Math.round(m.monthlyExpense)) },
    { label: "Avg Monthly Net", value: formatCurrency(Math.round(m.monthlyNet)) },
    { label: "Net Cash Generated", value: formatCurrency(Math.round(m.cash)) },
    { label: "Runway (est.)", value: m.runwayMonths === null ? "Profitable" : `${m.runwayMonths.toFixed(1)} mo` },
    { label: "Outstanding A/R", value: formatCurrency(Math.round(m.outstandingAr)) },
    { label: "Revenue Volatility", value: `${Math.round(m.revVolatility * 100)}%` },
    { label: "Overdue Invoices", value: `${overdue}` },
  ];

  return (
    <div className="space-y-4">
      <ModelNote text="A consolidated 'digital twin' read-out of your business, derived live from transactions and invoices. It mirrors the present; the other tabs project it forward." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(t => (
          <div key={t.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{t.label}</p>
            <p className="text-lg font-bold tabular-nums text-[var(--color-text)]">{t.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Monthly net cash flow</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={m.revSeries}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Bar dataKey="net" name="Net">
              {m.revSeries.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#22c55e" : "#ef4444"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 2. What-If sliders ─────────────────────────────────────────────────────────────
function WhatIfSliders() {
  const m = useTwinMetrics();
  const [revDelta, setRevDelta] = useState(0);   // % change in revenue
  const [costDelta, setCostDelta] = useState(0); // % change in cost
  const [horizon, setHorizon] = useState(12);    // months

  const result = useMemo(() => {
    const newRev = m.monthlyRevenue * (1 + revDelta / 100);
    const newCost = m.monthlyExpense * (1 + costDelta / 100);
    const newNet = newRev - newCost;
    const baseNet = m.monthlyNet;
    const series = Array.from({ length: horizon }, (_, i) => ({
      month: `M${i + 1}`,
      Base: Math.round(baseNet * (i + 1)),
      Scenario: Math.round(newNet * (i + 1)),
    }));
    return { newRev, newCost, newNet, baseNet, series, lift: (newNet - baseNet) * horizon };
  }, [m, revDelta, costDelta, horizon]);

  return (
    <div className="space-y-4">
      <ModelNote text="Drag the sliders to apply a flat % shift to revenue and cost, then see cumulative projected profit over your chosen horizon. Linear projection of the current monthly run-rate." />
      <div className={`${CARD} p-5 space-y-5`}>
        <Slider label="Revenue change" value={revDelta} min={-50} max={50} step={1} suffix="%" onChange={setRevDelta} />
        <Slider label="Cost change" value={costDelta} min={-50} max={50} step={1} suffix="%" onChange={setCostDelta} />
        <Slider label="Horizon" value={horizon} min={3} max={36} step={1} suffix=" mo" onChange={setHorizon} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New Monthly Revenue", value: formatCurrency(Math.round(result.newRev)), color: "text-green-400" },
          { label: "New Monthly Cost", value: formatCurrency(Math.round(result.newCost)), color: "text-red-400" },
          { label: "New Monthly Net", value: formatCurrency(Math.round(result.newNet)), color: result.newNet >= 0 ? "text-green-400" : "text-red-400" },
          { label: `Cumulative lift (${horizon} mo)`, value: formatCurrency(Math.round(result.lift)), color: result.lift >= 0 ? "text-green-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Projected cumulative profit — base vs scenario</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={result.series}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Line type="monotone" dataKey="Base" stroke="var(--color-muted)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Scenario" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 3. Monte-Carlo-lite cash simulation ──────────────────────────────────────────
function MonteCarloCash() {
  const m = useTwinMetrics();
  const [runs, setRuns] = useState(2000);
  const [horizon, setHorizon] = useState(6);
  const [openingCash, setOpeningCash] = useState(String(Math.max(0, Math.round(m.cash))));
  const [output, setOutput] = useState<{
    p10: number; p50: number; p90: number; ruinPct: number;
    fan: { month: string; p10: number; p50: number; p90: number }[];
  } | null>(null);

  const simulate = () => {
    const opening = parseFloat(openingCash) || 0;
    const meanNet = m.monthlyNet;
    // Std-dev of the monthly net, anchored to observed revenue volatility.
    const sd = Math.max(Math.abs(meanNet) * 0.15, m.monthlyRevenue * m.revVolatility || Math.abs(meanNet) * 0.3 || 1);
    const endings: number[] = [];
    const monthLevels: number[][] = Array.from({ length: horizon }, () => []);
    let ruin = 0;

    for (let r = 0; r < runs; r++) {
      let cash = opening;
      let bust = false;
      for (let mth = 0; mth < horizon; mth++) {
        // Box-Muller normal draw (Math.random only inside this handler — allowed).
        const u1 = Math.random() || 1e-9;
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        cash += meanNet + z * sd;
        if (cash < 0) bust = true;
        monthLevels[mth].push(cash);
      }
      if (bust) ruin++;
      endings.push(cash);
    }

    endings.sort((a, b) => a - b);
    const fan = monthLevels.map((lvls, i) => {
      lvls.sort((a, b) => a - b);
      return {
        month: `M${i + 1}`,
        p10: Math.round(percentile(lvls, 10)),
        p50: Math.round(percentile(lvls, 50)),
        p90: Math.round(percentile(lvls, 90)),
      };
    });

    setOutput({
      p10: Math.round(percentile(endings, 10)),
      p50: Math.round(percentile(endings, 50)),
      p90: Math.round(percentile(endings, 90)),
      ruinPct: (ruin / runs) * 100,
      fan,
    });
    toast.success(`Ran ${runs.toLocaleString()} simulated futures`);
  };

  return (
    <div className="space-y-4">
      <ModelNote text="Each run perturbs your monthly net cash with a random normal shock scaled to historical volatility, then compounds it over the horizon. Percentiles bound the range of plausible outcomes — they are not predictions of a single future." />
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Opening cash (₹)</label>
            <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} className={INP} />
          </div>
          <Slider label="Simulation runs" value={runs} min={500} max={10000} step={500} onChange={setRuns} />
          <Slider label="Horizon" value={horizon} min={3} max={18} step={1} suffix=" mo" onChange={setHorizon} />
        </div>
        <button onClick={simulate} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
          <Dices size={14} /> Run simulation
        </button>
      </div>

      {!output ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Press “Run simulation” to generate randomized cash paths and their percentile bands.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Pessimistic (P10)", value: formatCurrency(output.p10), color: "text-red-400" },
              { label: "Median (P50)", value: formatCurrency(output.p50), color: "text-[var(--color-text)]" },
              { label: "Optimistic (P90)", value: formatCurrency(output.p90), color: "text-green-400" },
              { label: "Cash-out risk", value: `${output.ruinPct.toFixed(1)}%`, color: output.ruinPct > 25 ? "text-red-400" : output.ruinPct > 5 ? "text-yellow-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Cash fan chart — P10 / P50 / P90</p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={output.fan}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                <Area type="monotone" dataKey="p90" name="P90" stroke="#22c55e" fill="#22c55e20" />
                <Area type="monotone" dataKey="p50" name="P50" stroke="var(--color-primary)" fill="transparent" />
                <Area type="monotone" dataKey="p10" name="P10" stroke="#ef4444" fill="#ef444420" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ── 4. Scenario comparison ─────────────────────────────────────────────────────────
type ScenarioRow = { id: string; name: string; revDelta: number; costDelta: number };
function ScenarioCompare() {
  const m = useTwinMetrics();
  const [scenarios, setScenarios] = useFeatureState<ScenarioRow[]>("pred-scenarios", [
    { id: "optimistic", name: "Optimistic", revDelta: 20, costDelta: 5 },
    { id: "base", name: "Base", revDelta: 0, costDelta: 0 },
    { id: "recession", name: "Recession", revDelta: -30, costDelta: -10 },
  ]);
  const [name, setName] = useState("");
  const [rev, setRev] = useState("0");
  const [cost, setCost] = useState("0");

  const evaluated = useMemo(() => scenarios.map(s => {
    const monthlyRev = m.monthlyRevenue * (1 + s.revDelta / 100);
    const monthlyCost = m.monthlyExpense * (1 + s.costDelta / 100);
    const monthlyNet = monthlyRev - monthlyCost;
    return { ...s, monthlyRev, monthlyCost, monthlyNet, annualNet: monthlyNet * 12 };
  }), [scenarios, m]);

  const add = () => {
    if (!name.trim()) { toast.error("Name the scenario"); return; }
    setScenarios([...scenarios, { id: crypto.randomUUID(), name: name.trim(), revDelta: parseFloat(rev) || 0, costDelta: parseFloat(cost) || 0 }]);
    setName(""); setRev("0"); setCost("0");
    toast.success("Scenario added");
  };

  return (
    <div className="space-y-4">
      <ModelNote text="Each scenario applies a revenue and cost % shift to your current run-rate. Compare projected monthly and annual net side by side. Estimates, not commitments." />
      <div className={`${CARD} p-4 space-y-3`}>
        <p className="text-sm font-semibold">Add a scenario</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New product line" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Revenue Δ %</label>
            <input type="number" value={rev} onChange={e => setRev(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cost Δ %</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2.5 text-sm font-medium">Add</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Scenario", "Revenue Δ", "Cost Δ", "Monthly Net", "Annual Net", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {evaluated.map(s => (
                <tr key={s.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.revDelta > 0 ? "+" : ""}{s.revDelta}%</td>
                  <td className="px-4 py-2.5 tabular-nums">{s.costDelta > 0 ? "+" : ""}{s.costDelta}%</td>
                  <td className={`px-4 py-2.5 tabular-nums font-semibold ${s.monthlyNet >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(s.monthlyNet))}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${s.annualNet >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(s.annualNet))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setScenarios(scenarios.filter(x => x.id !== s.id))} className="text-[10px] text-[var(--color-muted)] hover:text-red-400">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 5. Early-warning board ──────────────────────────────────────────────────────────
function EarlyWarningBoard() {
  const m = useTwinMetrics();
  const { store } = useApp();

  const signals = useMemo(() => {
    const invoices = store.invoices ?? [];
    const today = new Date();
    const overdueAmt = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
    const concentration = (() => {
      const byCust = new Map<string, number>();
      for (const i of invoices) byCust.set(i.customer, (byCust.get(i.customer) ?? 0) + i.amount);
      const total = [...byCust.values()].reduce((s, v) => s + v, 0);
      const top = Math.max(0, ...byCust.values());
      return total > 0 ? (top / total) * 100 : 0;
    })();
    const lastTxn = (store.transactions ?? []).reduce<string | null>((latest, t) => (!latest || t.date > latest ? t.date : latest), null);
    const staleDays = lastTxn ? differenceInCalendarDays(today, parseISO(lastTxn)) : 999;

    type Sev = "critical" | "high" | "medium" | "ok";
    const out: { title: string; detail: string; sev: Sev }[] = [];

    out.push(m.runwayMonths === null
      ? { title: "Cash runway", detail: "Net cash positive — no near-term liquidity threat from current burn.", sev: "ok" }
      : { title: "Cash runway", detail: `Estimated ${m.runwayMonths.toFixed(1)} months of runway at the current burn rate.`, sev: m.runwayMonths < 3 ? "critical" : m.runwayMonths < 6 ? "high" : "medium" });

    out.push({ title: "Monthly profitability", detail: m.monthlyNet >= 0 ? `Generating ${formatCurrency(Math.round(m.monthlyNet))}/mo on average.` : `Losing ${formatCurrency(Math.round(-m.monthlyNet))}/mo on average.`, sev: m.monthlyNet >= 0 ? "ok" : "high" });

    out.push({ title: "Revenue volatility", detail: `Month-to-month revenue swings ~${Math.round(m.revVolatility * 100)}%.`, sev: m.revVolatility > 0.5 ? "high" : m.revVolatility > 0.3 ? "medium" : "ok" });

    out.push({ title: "Overdue receivables", detail: overdueAmt > 0 ? `${formatCurrency(Math.round(overdueAmt))} past due — collection risk to cash.` : "No overdue invoices.", sev: overdueAmt > m.monthlyRevenue ? "high" : overdueAmt > 0 ? "medium" : "ok" });

    out.push({ title: "Customer concentration", detail: `Top customer is ${Math.round(concentration)}% of invoiced value.`, sev: concentration > 60 ? "high" : concentration > 40 ? "medium" : "ok" });

    out.push({ title: "Data freshness", detail: staleDays < 900 ? `Last transaction ${staleDays} day(s) ago.` : "No transactions recorded — predictions are limited.", sev: staleDays > 30 ? "medium" : "ok" });

    return out;
  }, [m, store]);

  const SEV: Record<string, { dot: string; chip: string; label: string }> = {
    critical: { dot: "bg-red-500", chip: "text-red-400 bg-red-950/30 border-red-800/40", label: "Critical" },
    high: { dot: "bg-orange-500", chip: "text-orange-400 bg-orange-950/30 border-orange-800/40", label: "High" },
    medium: { dot: "bg-yellow-500", chip: "text-yellow-400 bg-yellow-950/30 border-yellow-800/40", label: "Watch" },
    ok: { dot: "bg-green-500", chip: "text-green-400 bg-green-950/30 border-green-800/40", label: "OK" },
  };

  return (
    <div className="space-y-4">
      <ModelNote text="A rules-based traffic-light board over your live data. It flags conditions that historically precede cash trouble — directional signals, not certainties." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {signals.map(s => {
          const cfg = SEV[s.sev];
          return (
            <div key={s.title} className={`${CARD} p-4 flex items-start gap-3`}>
              <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${cfg.chip}`}>{cfg.label}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-1">{s.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6. Trend projection (linear + seasonal) ──────────────────────────────────────
function TrendProjection() {
  const m = useTwinMetrics();
  const [months, setMonths] = useState(6);
  const [seasonal, setSeasonal] = useState(true);

  const data = useMemo(() => {
    const hist = m.revSeries.map(d => d.revenue);
    const n = hist.length;
    // Ordinary least squares on revenue vs month index.
    const xs = hist.map((_, i) => i);
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanY = hist.reduce((s, v) => s + v, 0) / n;
    const cov = xs.reduce((s, x, i) => s + (x - meanX) * (hist[i] - meanY), 0);
    const varX = xs.reduce((s, x) => s + (x - meanX) ** 2, 0) || 1;
    const slope = cov / varX;
    const intercept = meanY - slope * meanX;

    // Crude seasonal index: each month vs the overall mean.
    const seasonalIdx = meanY > 0 ? hist.map(v => v / meanY) : hist.map(() => 1);

    type Row = { month: string; Actual: number | null; Projected: number | null };
    const rows: Row[] = m.revSeries.map(d => ({ month: d.month, Actual: d.revenue, Projected: null }));
    for (let k = 0; k < months; k++) {
      const idx = n + k;
      let val = intercept + slope * idx;
      if (seasonal) val *= seasonalIdx[idx % n] || 1;
      rows.push({ month: `+${k + 1}`, Actual: null, Projected: Math.max(0, Math.round(val)) });
    }
    const next3 = rows.filter(r => r.Projected != null).slice(0, 3).reduce((s, r) => s + (r.Projected ?? 0), 0);
    return { rows, slope, next3 };
  }, [m, months, seasonal]);

  return (
    <div className="space-y-4">
      <ModelNote text="Least-squares linear trend on your last 12 months of revenue, optionally scaled by a simple per-month seasonal index. Short horizons are more reliable than long ones." />
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <Slider label="Project ahead" value={months} min={1} max={12} step={1} suffix=" mo" onChange={setMonths} />
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input type="checkbox" checked={seasonal} onChange={e => setSeasonal(e.target.checked)} className="accent-[var(--color-primary)]" />
            Apply seasonal adjustment
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Trend direction</p>
            <p className={`text-lg font-bold tabular-nums ${data.slope >= 0 ? "text-green-400" : "text-red-400"}`}>{data.slope >= 0 ? "Rising" : "Falling"} {formatCurrency(Math.round(Math.abs(data.slope)))}/mo</p>
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Projected next 3 months</p>
            <p className="text-lg font-bold tabular-nums text-[var(--color-text)]">{formatCurrency(data.next3)}</p>
          </div>
        </div>
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Revenue: actual vs projected</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.rows}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="Actual" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="Projected" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 7. Churn-risk flags (from payment recency) ────────────────────────────────────
function ChurnRisk() {
  const { store } = useApp();
  const rows = useMemo(() => {
    const invoices = store.invoices ?? [];
    const today = new Date();
    const byCust = new Map<string, { last: string; total: number; overdue: number; count: number }>();
    for (const i of invoices) {
      const slot = byCust.get(i.customer) ?? { last: i.invoiceDate, total: 0, overdue: 0, count: 0 };
      if (i.invoiceDate > slot.last) slot.last = i.invoiceDate;
      slot.total += i.amount;
      slot.count += 1;
      if (i.status === "overdue") slot.overdue += i.amount;
      byCust.set(i.customer, slot);
    }
    return [...byCust.entries()].map(([customer, v]) => {
      const days = v.last ? differenceInCalendarDays(today, parseISO(v.last)) : 999;
      const overdueRatio = v.total > 0 ? v.overdue / v.total : 0;
      // Risk blends inactivity (90-day window) and overdue exposure.
      const score = clamp(Math.round((clamp(days / 90, 0, 1) * 0.6 + overdueRatio * 0.4) * 100), 0, 100);
      const level = score >= 66 ? "High" : score >= 33 ? "Medium" : "Low";
      return { customer, days, total: v.total, overdue: v.overdue, count: v.count, score, level };
    }).sort((a, b) => b.score - a.score);
  }, [store]);

  const LEVEL: Record<string, string> = {
    High: "text-red-400 bg-red-950/30 border-red-800/40",
    Medium: "text-yellow-400 bg-yellow-950/30 border-yellow-800/40",
    Low: "text-green-400 bg-green-950/30 border-green-800/40",
  };

  return (
    <div className="space-y-4">
      <ModelNote text="A heuristic churn score per customer from days since their last invoice and their overdue ratio. It surfaces accounts worth a check-in, not a verdict on the relationship." />
      {rows.length === 0 ? (
        <div className={`${CARD} border-dashed p-10 text-center`}>
          <Users size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">No customer invoices yet</p>
          <p className="text-xs text-[var(--color-muted)]">Add invoices and churn signals will appear here.</p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Last invoice", "Invoices", "Billed", "Overdue", "Risk score", "Flag"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.customer} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.days >= 999 ? "—" : `${r.days}d ago`}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.total))}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{r.overdue > 0 ? formatCurrency(Math.round(r.overdue)) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.score >= 66 ? "#ef4444" : r.score >= 33 ? "#eab308" : "#22c55e" }} />
                        </div>
                        <span className="text-xs tabular-nums">{r.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${LEVEL[r.level]}`}>{r.level}</span></td>
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

// ── 8. Break-even simulator ─────────────────────────────────────────────────────────
function BreakEvenSimulator() {
  const m = useTwinMetrics();
  const [fixed, setFixed] = useState(String(Math.max(0, Math.round(m.monthlyExpense * 0.6))));
  const [price, setPrice] = useState("1000");
  const [varCost, setVarCost] = useState("600");

  const result = useMemo(() => {
    const F = parseFloat(fixed) || 0;
    const P = parseFloat(price) || 0;
    const V = parseFloat(varCost) || 0;
    const contribution = P - V;
    if (contribution <= 0) return null;
    const units = F / contribution;
    const revenue = units * P;
    const marginPct = (contribution / P) * 100;
    const curUnits = P > 0 ? m.monthlyRevenue / P : 0;
    return { contribution, units, revenue, marginPct, curUnits, covered: curUnits >= units };
  }, [fixed, price, varCost, m]);

  return (
    <div className="space-y-4">
      <ModelNote text="Classic break-even: fixed costs ÷ per-unit contribution margin. Fixed cost is pre-filled from ~60% of your average monthly expense — override with your real numbers." />
      <div className={`${CARD} p-5`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly fixed cost (₹)</label>
            <input type="number" value={fixed} onChange={e => setFixed(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Price per unit (₹)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Variable cost per unit (₹)</label>
            <input type="number" value={varCost} onChange={e => setVarCost(e.target.value)} className={INP} />
          </div>
        </div>
      </div>

      {!result ? (
        <p className="text-xs text-[var(--color-muted)] px-1">Price must exceed variable cost per unit for a break-even to exist.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Contribution / unit", value: formatCurrency(Math.round(result.contribution)), color: "text-[var(--color-text)]" },
              { label: "Contribution margin", value: `${result.marginPct.toFixed(0)}%`, color: "text-[var(--color-text)]" },
              { label: "Break-even units / mo", value: Math.ceil(result.units).toLocaleString(), color: "text-yellow-400" },
              { label: "Break-even revenue / mo", value: formatCurrency(Math.round(result.revenue)), color: "text-yellow-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border ${result.covered ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
            <p className={`text-sm font-bold flex items-center gap-2 ${result.covered ? "text-green-400" : "text-orange-400"}`}>
              {result.covered ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              At your current run-rate you're selling ~{Math.round(result.curUnits).toLocaleString()} units/mo vs a break-even of {Math.ceil(result.units).toLocaleString()} — {result.covered ? "you clear break-even." : "you're below break-even at these inputs."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── 9. Sensitivity / tornado ──────────────────────────────────────────────────────
function SensitivityTornado() {
  const m = useTwinMetrics();
  const [swing, setSwing] = useState(10); // ± % swing applied to each driver

  const data = useMemo(() => {
    const baseNet = m.monthlyNet;
    const drivers = [
      { name: "Revenue", base: m.monthlyRevenue, sign: 1 },
      { name: "Expense", base: m.monthlyExpense, sign: -1 },
    ];
    const rows = drivers.map(d => {
      const delta = d.base * (swing / 100) * d.sign;
      const high = baseNet + delta;
      const low = baseNet - delta;
      return { name: d.name, low: Math.round(low), high: Math.round(high), impact: Math.round(Math.abs(high - low)) };
    }).sort((a, b) => b.impact - a.impact);
    return { baseNet, rows };
  }, [m, swing]);

  return (
    <div className="space-y-4">
      <ModelNote text="Flexes each driver by ±X% around your current run-rate and measures the swing in monthly net. The longest bar is the variable to watch most closely." />
      <div className={`${CARD} p-5`}>
        <Slider label="Driver swing" value={swing} min={5} max={50} step={5} suffix="%" onChange={setSwing} />
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">Impact on monthly net (base {formatCurrency(Math.round(data.baseNet))})</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">Each bar spans the net at −{swing}% to +{swing}% on that driver.</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data.rows} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={70} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine x={data.baseNet} stroke="var(--color-muted)" strokeDasharray="3 3" />
            <Bar dataKey="low" name="Downside" fill="#ef4444" />
            <Bar dataKey="high" name="Upside" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 space-y-1">
          {data.rows.map(r => (
            <div key={r.name} className="flex justify-between text-xs">
              <span className="text-[var(--color-muted)]">{r.name} sensitivity</span>
              <span className="tabular-nums font-semibold">±{formatCurrency(r.impact / 2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 10. Stress test + goal probability ────────────────────────────────────────────
function GoalProbability() {
  const m = useTwinMetrics();
  const [target, setTarget] = useState("1000000");
  const [months, setMonths] = useState(6);
  const [stressDrop, setStressDrop] = useState(0); // % revenue drop applied as stress
  const [result, setResult] = useState<{ prob: number; medianEnd: number; stressedNet: number } | null>(null);

  const run = () => {
    const goal = parseFloat(target) || 0;
    const stressedRev = m.monthlyRevenue * (1 - stressDrop / 100);
    const stressedNet = stressedRev - m.monthlyExpense;
    const sd = Math.max(Math.abs(stressedNet) * 0.2, m.monthlyRevenue * m.revVolatility || 1);
    const runs = 3000;
    let hits = 0;
    const ends: number[] = [];
    for (let r = 0; r < runs; r++) {
      let cumulative = Math.max(0, m.cash);
      for (let k = 0; k < months; k++) {
        const u1 = Math.random() || 1e-9;
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        cumulative += stressedNet + z * sd;
      }
      if (cumulative >= goal) hits++;
      ends.push(cumulative);
    }
    ends.sort((a, b) => a - b);
    setResult({ prob: (hits / runs) * 100, medianEnd: Math.round(percentile(ends, 50)), stressedNet: Math.round(stressedNet) });
    toast.success("Goal probability estimated");
  };

  return (
    <div className="space-y-4">
      <ModelNote text="Combines a revenue stress-test with a goal-probability estimate: applies your chosen revenue drop, then runs 3,000 randomized cash paths to gauge the chance of reaching the target by the deadline." />
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cash target (₹)</label>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} className={INP} />
          </div>
          <Slider label="Deadline" value={months} min={1} max={24} step={1} suffix=" mo" onChange={setMonths} />
          <Slider label="Revenue stress (drop)" value={stressDrop} min={0} max={60} step={5} suffix="%" onChange={setStressDrop} />
        </div>
        <button onClick={run} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-4 py-2 text-sm font-medium">
          <Gauge size={14} /> Estimate probability
        </button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: "Probability of hitting goal", value: `${result.prob.toFixed(0)}%`, color: result.prob >= 66 ? "text-green-400" : result.prob >= 33 ? "text-yellow-400" : "text-red-400" },
              { label: "Median projected cash", value: formatCurrency(result.medianEnd), color: "text-[var(--color-text)]" },
              { label: "Stressed monthly net", value: formatCurrency(result.stressedNet), color: result.stressedNet >= 0 ? "text-green-400" : "text-red-400" },
            ].map(k => (
              <div key={k.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 border flex items-start gap-2 ${result.prob >= 50 ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
            <ShieldAlert size={14} className={`shrink-0 mt-0.5 ${result.prob >= 50 ? "text-green-400" : "text-orange-400"}`} />
            <p className={`text-sm font-bold ${result.prob >= 50 ? "text-green-400" : "text-orange-400"}`}>
              Under a {stressDrop}% revenue drop, the model puts a {result.prob.toFixed(0)}% chance on reaching {formatCurrency(parseFloat(target) || 0)} within {months} months.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── small shared KPI grid ─────────────────────────────────────────────────────────
function KpiGrid({ items }: { items: { label: string; value: string; color?: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(k => (
        <div key={k.label} className={`${CARD} p-4`}>
          <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
          <p className={`text-lg font-bold tabular-nums ${k.color ?? "text-[var(--color-text)]"}`}>{k.value}</p>
          {k.sub && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ Icon, title, body }: { Icon: typeof Boxes; title: string; body: string }) {
  return (
    <div className={`${CARD} border-dashed p-10 text-center`}>
      <Icon size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-xs text-[var(--color-muted)]">{body}</p>
    </div>
  );
}

// ── 11. Revenue run-rate projector ──────────────────────────────────────────────
function RunRateProjector() {
  const m = useTwinMetrics();
  const [windowMonths, setWindowMonths] = useState(3); // months of recent history to base the run-rate on
  const [growth, setGrowth] = useState(0);             // assumed monthly growth %

  const out = useMemo(() => {
    const recent = m.revSeries.slice(-windowMonths);
    const active = recent.filter(r => r.revenue > 0);
    const denom = Math.max(1, active.length);
    const baseMonthly = active.reduce((s, r) => s + r.revenue, 0) / denom;
    // Compound the assumed monthly growth across 12 months.
    let cumulative = 0;
    const series: { month: string; Projected: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const v = baseMonthly * (1 + growth / 100) ** i;
      cumulative += v;
      series.push({ month: `M${i + 1}`, Projected: Math.round(v) });
    }
    const arr = baseMonthly * 12;             // flat annualised run-rate
    return { baseMonthly, arr, projectedYear: cumulative, series };
  }, [m, windowMonths, growth]);

  return (
    <div className="space-y-4">
      <ModelNote text="Annualises your recent monthly revenue into a run-rate (ARR), then compounds an assumed monthly growth across the next 12 months. A planning estimate — actual revenue rarely grows on a smooth curve." />
      <div className={`${CARD} p-5 grid grid-cols-1 md:grid-cols-2 gap-5`}>
        <Slider label="Base on last" value={windowMonths} min={1} max={12} step={1} suffix=" mo" onChange={setWindowMonths} />
        <Slider label="Assumed monthly growth" value={growth} min={-10} max={20} step={1} suffix="%" onChange={setGrowth} />
      </div>
      <KpiGrid items={[
        { label: "Current monthly run-rate", value: formatCurrency(Math.round(out.baseMonthly)), color: "text-[var(--color-text)]" },
        { label: "Flat annual run-rate (ARR)", value: formatCurrency(Math.round(out.arr)), color: "text-green-400" },
        { label: "Projected next 12 mo", value: formatCurrency(Math.round(out.projectedYear)), color: out.projectedYear >= out.arr ? "text-green-400" : "text-yellow-400" },
        { label: "Implied annual growth", value: `${(((out.projectedYear / (out.arr || 1)) - 1) * 100).toFixed(0)}%`, color: "text-[var(--color-text)]" },
      ]} />
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Projected monthly revenue (12 mo)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={out.series}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="Projected" name="Projected" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 12. Expense-creep detector ──────────────────────────────────────────────────
function ExpenseCreepDetector() {
  const { store } = useApp();
  const rows = useMemo(() => {
    const txns = store.transactions ?? [];
    const now = new Date();
    const recentKeys = Array.from({ length: 3 }, (_, i) => format(startOfMonth(subMonths(now, i)), "yyyy-MM"));
    const priorKeys = Array.from({ length: 3 }, (_, i) => format(startOfMonth(subMonths(now, i + 3)), "yyyy-MM"));
    const byCat = new Map<string, { recent: number; prior: number }>();
    for (const t of txns) {
      if (t.amount >= 0 || !t.date) continue;
      const key = t.date.slice(0, 7);
      const cat = t.category || "other";
      const slot = byCat.get(cat) ?? { recent: 0, prior: 0 };
      if (recentKeys.includes(key)) slot.recent += Math.abs(t.amount);
      else if (priorKeys.includes(key)) slot.prior += Math.abs(t.amount);
      byCat.set(cat, slot);
    }
    return [...byCat.entries()].map(([cat, v]) => {
      const recentAvg = v.recent / 3;
      const priorAvg = v.prior / 3;
      const changePct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : (recentAvg > 0 ? 100 : 0);
      return { cat, recentAvg, priorAvg, changePct };
    }).filter(r => r.recentAvg > 0 || r.priorAvg > 0).sort((a, b) => b.changePct - a.changePct);
  }, [store]);

  const creeping = rows.filter(r => r.changePct > 15);

  return (
    <div className="space-y-4">
      <ModelNote text="Compares each spend category's average over the last 3 months against the 3 months before. A persistent rise (>15%) is flagged as 'creep' worth a look — seasonal swings can trip it, so read the trend not the single number." />
      {rows.length === 0 ? (
        <EmptyState Icon={Flame} title="No expense history yet" body="Record some expense transactions and category-level creep will appear here." />
      ) : (
        <>
          <KpiGrid items={[
            { label: "Categories tracked", value: `${rows.length}`, color: "text-[var(--color-text)]" },
            { label: "Creeping (>15%)", value: `${creeping.length}`, color: creeping.length > 0 ? "text-orange-400" : "text-green-400" },
            { label: "Recent monthly spend", value: formatCurrency(Math.round(rows.reduce((s, r) => s + r.recentAvg, 0))), color: "text-red-400" },
            { label: "Prior monthly spend", value: formatCurrency(Math.round(rows.reduce((s, r) => s + r.priorAvg, 0))), color: "text-[var(--color-muted)]" },
          ]} />
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Category", "Prior avg / mo", "Recent avg / mo", "Change", "Status"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.cat} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium capitalize">{r.cat}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.priorAvg))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.recentAvg))}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.changePct > 0 ? "text-red-400" : "text-green-400"}`}>{r.changePct > 0 ? "+" : ""}{r.changePct.toFixed(0)}%</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${r.changePct > 15 ? "text-orange-400 bg-orange-950/30 border-orange-800/40" : r.changePct < -15 ? "text-green-400 bg-green-950/30 border-green-800/40" : "text-[var(--color-muted)] bg-[var(--color-bg)] border-[var(--color-border)]"}`}>
                          {r.changePct > 15 ? "Creeping" : r.changePct < -15 ? "Falling" : "Stable"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 13. Customer-LTV predictor ──────────────────────────────────────────────────
function CustomerLtv() {
  const { store } = useApp();
  const [lifespan, setLifespan] = useState(36); // expected relationship length, months
  const [margin, setMargin] = useState(30);     // gross margin %

  const rows = useMemo(() => {
    const invoices = store.invoices ?? [];
    const byCust = new Map<string, { total: number; first: string; last: string; count: number }>();
    for (const i of invoices) {
      const slot = byCust.get(i.customer) ?? { total: 0, first: i.invoiceDate, last: i.invoiceDate, count: 0 };
      slot.total += i.amount;
      slot.count += 1;
      if (i.invoiceDate < slot.first) slot.first = i.invoiceDate;
      if (i.invoiceDate > slot.last) slot.last = i.invoiceDate;
      byCust.set(i.customer, slot);
    }
    return [...byCust.entries()].map(([customer, v]) => {
      const tenureMonths = Math.max(1, differenceInCalendarDays(parseISO(v.last), parseISO(v.first)) / 30);
      const monthlyRev = v.total / tenureMonths;
      const predictedLtv = monthlyRev * lifespan * (margin / 100);
      return { customer, total: v.total, count: v.count, monthlyRev, predictedLtv };
    }).sort((a, b) => b.predictedLtv - a.predictedLtv);
  }, [store, lifespan, margin]);

  const totalLtv = rows.reduce((s, r) => s + r.predictedLtv, 0);

  return (
    <div className="space-y-4">
      <ModelNote text="Estimates each customer's lifetime value: average monthly billing × expected relationship length × gross margin. Customers with little history get noisy estimates — treat the ranking, not the rupee figure, as the signal." />
      <div className={`${CARD} p-5 grid grid-cols-1 md:grid-cols-2 gap-5`}>
        <Slider label="Expected relationship" value={lifespan} min={6} max={120} step={6} suffix=" mo" onChange={setLifespan} />
        <Slider label="Gross margin" value={margin} min={5} max={80} step={5} suffix="%" onChange={setMargin} />
      </div>
      {rows.length === 0 ? (
        <EmptyState Icon={Heart} title="No customer invoices yet" body="Add invoices and predicted lifetime value will rank your customers here." />
      ) : (
        <>
          <KpiGrid items={[
            { label: "Customers", value: `${rows.length}`, color: "text-[var(--color-text)]" },
            { label: "Total predicted LTV", value: formatCurrency(Math.round(totalLtv)), color: "text-green-400" },
            { label: "Avg LTV / customer", value: formatCurrency(Math.round(totalLtv / rows.length)), color: "text-[var(--color-text)]" },
            { label: "Top customer LTV", value: formatCurrency(Math.round(rows[0].predictedLtv)), color: "text-green-400" },
          ]} />
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Customer", "Invoices", "Billed to date", "Avg / mo", "Predicted LTV"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {rows.map(r => (
                    <tr key={r.customer} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.total))}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.monthlyRev))}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(r.predictedLtv))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 14. Payment-delay predictor (per customer) ──────────────────────────────────
function PaymentDelayPredictor() {
  const { store } = useApp();
  const rows = useMemo(() => {
    const invoices = store.invoices ?? [];
    const today = new Date();
    const byCust = new Map<string, { delays: number[]; openOverdue: number; openAmt: number }>();
    for (const i of invoices) {
      const slot = byCust.get(i.customer) ?? { delays: [], openOverdue: 0, openAmt: 0 };
      if (i.status === "paid") {
        // Proxy: paid invoices "settled" by their due date plus typical drift; we
        // approximate observed lateness as days from due date to today's snapshot
        // is unknowable, so use invoice→due span as the expected term and assume
        // overdue history drives the estimate. Use due-vs-invoice as the term.
        const term = differenceInCalendarDays(parseISO(i.dueDate), parseISO(i.invoiceDate));
        slot.delays.push(Math.max(0, term)); // expected days-to-pay
      } else if (i.status === "overdue") {
        const lateBy = differenceInCalendarDays(today, parseISO(i.dueDate));
        if (lateBy > 0) slot.delays.push(differenceInCalendarDays(parseISO(i.dueDate), parseISO(i.invoiceDate)) + lateBy);
        slot.openOverdue += 1;
        slot.openAmt += i.amount;
      } else {
        slot.openAmt += i.amount;
      }
      byCust.set(i.customer, slot);
    }
    return [...byCust.entries()].map(([customer, v]) => {
      const avgDays = v.delays.length ? v.delays.reduce((s, d) => s + d, 0) / v.delays.length : 0;
      const level = avgDays >= 60 ? "Slow" : avgDays >= 30 ? "Moderate" : "Prompt";
      return { customer, avgDays, samples: v.delays.length, openOverdue: v.openOverdue, openAmt: v.openAmt, level };
    }).filter(r => r.samples > 0 || r.openAmt > 0).sort((a, b) => b.avgDays - a.avgDays);
  }, [store]);

  const LEVEL: Record<string, string> = {
    Slow: "text-red-400 bg-red-950/30 border-red-800/40",
    Moderate: "text-yellow-400 bg-yellow-950/30 border-yellow-800/40",
    Prompt: "text-green-400 bg-green-950/30 border-green-800/40",
  };

  return (
    <div className="space-y-4">
      <ModelNote text="Estimates each customer's typical days-to-pay from their invoice terms and overdue history. With few paid invoices this leans on the credit term you set, so it sharpens as more invoices settle." />
      {rows.length === 0 ? (
        <EmptyState Icon={Clock} title="No invoices to learn from" body="As invoices are raised and settle, per-customer payment behaviour appears here." />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Predicted days-to-pay", "Sample size", "Open overdue", "Open amount", "Habit"].map(h =>
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.customer} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{r.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{r.avgDays.toFixed(0)} days</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.samples}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.openOverdue || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{r.openAmt > 0 ? formatCurrency(Math.round(r.openAmt)) : "—"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${LEVEL[r.level]}`}>{r.level}</span></td>
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

// ── 15. Cohort-retention projection ──────────────────────────────────────────────
function CohortRetention() {
  const { store } = useApp();
  const data = useMemo(() => {
    const invoices = store.invoices ?? [];
    // First-invoice month = acquisition cohort. Active in a month if any invoice that month.
    const firstSeen = new Map<string, string>();
    const activity = new Map<string, Set<string>>(); // customer -> set of active YYYY-MM
    for (const i of invoices) {
      if (!i.invoiceDate) continue;
      const month = i.invoiceDate.slice(0, 7);
      const prev = firstSeen.get(i.customer);
      if (!prev || month < prev) firstSeen.set(i.customer, month);
      const set = activity.get(i.customer) ?? new Set<string>();
      set.add(month);
      activity.set(i.customer, set);
    }
    // Build cohorts over last 6 cohort months, 6 retention offsets.
    const now = new Date();
    const cohortMonths = Array.from({ length: 6 }, (_, i) => format(startOfMonth(subMonths(now, 5 - i)), "yyyy-MM"));
    const cohorts = cohortMonths.map(cm => {
      const members = [...firstSeen.entries()].filter(([, fm]) => fm === cm).map(([c]) => c);
      const offsets = Array.from({ length: 6 }, (_, k) => {
        const target = format(startOfMonth(subMonths(parseISO(cm + "-01"), -k)), "yyyy-MM");
        const retained = members.filter(c => activity.get(c)?.has(target)).length;
        return members.length ? Math.round((retained / members.length) * 100) : null;
      });
      return { cm: format(parseISO(cm + "-01"), "MMM yy"), size: members.length, offsets };
    }).filter(c => c.size > 0);
    return { cohorts };
  }, [store]);

  const cellColor = (v: number | null) => {
    if (v === null) return "transparent";
    if (v >= 80) return "#22c55e";
    if (v >= 50) return "#84cc16";
    if (v >= 25) return "#eab308";
    return "#ef4444";
  };

  return (
    <div className="space-y-4">
      <ModelNote text="Groups customers by the month of their first invoice, then tracks the % still billing in each following month. A heuristic retention curve — sparse invoicing makes early cohorts look lumpy." />
      {data.cohorts.length === 0 ? (
        <EmptyState Icon={LayoutGrid} title="Not enough cohort history" body="Once customers have a few months of invoices, their retention curves appear here." />
      ) : (
        <div className={`${CARD} p-5 overflow-x-auto`}>
          <table className="text-xs border-separate border-spacing-1 min-w-[520px]">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase px-2">Cohort</th>
                <th className="text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase px-2">New</th>
                {["M0", "M1", "M2", "M3", "M4", "M5"].map(h => <th key={h} className="text-[10px] font-semibold text-[var(--color-muted)] px-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map(c => (
                <tr key={c.cm}>
                  <td className="font-medium px-2 whitespace-nowrap">{c.cm}</td>
                  <td className="tabular-nums px-2">{c.size}</td>
                  {c.offsets.map((v, i) => (
                    <td key={i} className="px-2">
                      <div className="h-8 w-12 rounded flex items-center justify-center font-semibold tabular-nums"
                        style={{ background: v === null ? "transparent" : `${cellColor(v)}30`, color: v === null ? "var(--color-muted)" : cellColor(v) }}>
                        {v === null ? "—" : `${v}%`}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 16. Working-capital-need forecast ────────────────────────────────────────────
function WorkingCapitalForecast() {
  const m = useTwinMetrics();
  const { store } = useApp();
  const [dso, setDso] = useState(45);  // days sales outstanding target
  const [dpo, setDpo] = useState(30);  // days payable outstanding

  const out = useMemo(() => {
    const invoices = store.invoices ?? [];
    const openAr = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const dailyRev = m.monthlyRevenue / 30;
    const dailyExp = m.monthlyExpense / 30;
    // Working capital tied in receivables vs released by payables float.
    const arNeed = dailyRev * dso;
    const apFloat = dailyExp * dpo;
    const netWorkingCapital = arNeed - apFloat;
    // Cash that could be freed by collecting current AR faster than the target DSO.
    const freeable = Math.max(0, openAr - arNeed);
    return { openAr, arNeed, apFloat, netWorkingCapital, freeable };
  }, [store, m, dso, dpo]);

  return (
    <div className="space-y-4">
      <ModelNote text="Models working-capital need from your revenue and expense run-rate against the collection (DSO) and payment (DPO) days you set. Tightening DSO or extending DPO frees trapped cash — these are directional estimates." />
      <div className={`${CARD} p-5 grid grid-cols-1 md:grid-cols-2 gap-5`}>
        <Slider label="Days sales outstanding (DSO)" value={dso} min={0} max={120} step={5} suffix=" d" onChange={setDso} />
        <Slider label="Days payable outstanding (DPO)" value={dpo} min={0} max={120} step={5} suffix=" d" onChange={setDpo} />
      </div>
      <KpiGrid items={[
        { label: "Receivables tied up", value: formatCurrency(Math.round(out.arNeed)), color: "text-yellow-400", sub: `at ${dso}d DSO` },
        { label: "Payables float", value: formatCurrency(Math.round(out.apFloat)), color: "text-green-400", sub: `at ${dpo}d DPO` },
        { label: "Net working capital", value: formatCurrency(Math.round(out.netWorkingCapital)), color: out.netWorkingCapital > 0 ? "text-red-400" : "text-green-400", sub: out.netWorkingCapital > 0 ? "cash absorbed" : "cash released" },
        { label: "Cash freeable from AR", value: formatCurrency(Math.round(out.freeable)), color: "text-green-400", sub: "if collected to target" },
      ]} />
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">Open receivables vs target</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">You currently hold {formatCurrency(Math.round(out.openAr))} in open invoices; at a {dso}-day DSO you'd only need {formatCurrency(Math.round(out.arNeed))} on the books.</p>
        <div className="h-3 w-full rounded-full overflow-hidden bg-[var(--color-bg)]">
          <div className="h-full bg-[var(--color-primary)]" style={{ width: `${clamp(out.openAr > 0 ? (out.arNeed / out.openAr) * 100 : 100, 0, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── 17. Revenue confidence band (P10/P50/P90) ────────────────────────────────────
function RevenueConfidenceBand() {
  const m = useTwinMetrics();
  const [months, setMonths] = useState(6);

  const data = useMemo(() => {
    const hist = m.revSeries.map(d => d.revenue);
    const n = hist.length;
    const xs = hist.map((_, i) => i);
    const meanX = xs.reduce((s, v) => s + v, 0) / n;
    const meanY = hist.reduce((s, v) => s + v, 0) / n;
    const cov = xs.reduce((s, x, i) => s + (x - meanX) * (hist[i] - meanY), 0);
    const varX = xs.reduce((s, x) => s + (x - meanX) ** 2, 0) || 1;
    const slope = cov / varX;
    const intercept = meanY - slope * meanX;
    // Band widens with horizon, anchored to revenue volatility (z≈1.28 ⇒ ~P10/P90).
    const sd = (m.revVolatility || 0.2) * (meanY || 1);
    type Row = { month: string; Actual: number | null; p50: number | null; p10: number | null; p90: number | null };
    const rows: Row[] = m.revSeries.map(d => ({ month: d.month, Actual: d.revenue, p50: null, p10: null, p90: null }));
    for (let k = 0; k < months; k++) {
      const idx = n + k;
      const mid = Math.max(0, intercept + slope * idx);
      const widen = sd * Math.sqrt(k + 1) * 1.28;
      rows.push({ month: `+${k + 1}`, Actual: null, p50: Math.round(mid), p10: Math.round(Math.max(0, mid - widen)), p90: Math.round(mid + widen) });
    }
    return { rows };
  }, [m, months]);

  const future = data.rows.filter(r => r.p50 != null);

  return (
    <div className="space-y-4">
      <ModelNote text="Projects revenue as a P10/P50/P90 band rather than a single line: the trend gives the midpoint, your historical volatility sets the spread, and the band widens the further out you look. A range, not a promise." />
      <div className={`${CARD} p-5`}>
        <Slider label="Project ahead" value={months} min={1} max={12} step={1} suffix=" mo" onChange={setMonths} />
      </div>
      {future.length > 0 && (
        <KpiGrid items={[
          { label: "Next month P10", value: formatCurrency(future[0].p10 ?? 0), color: "text-red-400" },
          { label: "Next month P50", value: formatCurrency(future[0].p50 ?? 0), color: "text-[var(--color-text)]" },
          { label: "Next month P90", value: formatCurrency(future[0].p90 ?? 0), color: "text-green-400" },
          { label: "Band width", value: `±${Math.round(((future[0].p90 ?? 0) - (future[0].p10 ?? 0)) / 2 / 1000)}k`, color: "text-yellow-400" },
        ]} />
      )}
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Revenue forecast band</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.rows}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="p90" name="P90" stroke="#22c55e" fill="#22c55e20" connectNulls />
            <Area type="monotone" dataKey="p10" name="P10" stroke="#ef4444" fill="#ef444420" connectNulls />
            <Line type="monotone" dataKey="p50" name="P50" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Actual" stroke="var(--color-text)" strokeWidth={2} dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 18. Seasonality-adjusted forecast ────────────────────────────────────────────
function SeasonalityForecast() {
  const m = useTwinMetrics();
  const data = useMemo(() => {
    const hist = m.revSeries;
    const mean = hist.reduce((s, d) => s + d.revenue, 0) / Math.max(1, hist.length);
    const rows = hist.map(d => ({
      month: d.month,
      revenue: d.revenue,
      index: mean > 0 ? Math.round((d.revenue / mean) * 100) : 100,
    }));
    const peak = rows.reduce((a, b) => (b.index > a.index ? b : a), rows[0] ?? { month: "—", index: 0, revenue: 0 });
    const trough = rows.reduce((a, b) => (b.index < a.index ? b : a), rows[0] ?? { month: "—", index: 0, revenue: 0 });
    return { rows, mean, peak, trough };
  }, [m]);

  return (
    <div className="space-y-4">
      <ModelNote text="Divides each month's revenue by your 12-month average to expose a seasonal index (100 = an average month). Useful to plan stock and staffing around peaks and troughs — only as reliable as a single year of history allows." />
      {data.rows.every(r => r.revenue === 0) ? (
        <EmptyState Icon={CalendarRange} title="No revenue history yet" body="Add transactions and the seasonal pattern across months will surface here." />
      ) : (
        <>
          <KpiGrid items={[
            { label: "Average month", value: formatCurrency(Math.round(data.mean)), color: "text-[var(--color-text)]" },
            { label: "Peak month", value: `${data.peak.month} (${data.peak.index})`, color: "text-green-400" },
            { label: "Trough month", value: `${data.trough.month} (${data.trough.index})`, color: "text-red-400" },
            { label: "Seasonal spread", value: `${data.peak.index - data.trough.index} pts`, color: "text-yellow-400" },
          ]} />
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-1">Seasonal index by month</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">Bars above the 100 line are stronger-than-average months; below are weaker.</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.rows}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip formatter={(v: number) => [`${v}`, "Index"]} contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine y={100} stroke="var(--color-muted)" strokeDasharray="3 3" />
                <Bar dataKey="index" name="Index">
                  {data.rows.map((d, i) => <Cell key={i} fill={d.index >= 100 ? "#22c55e" : "#ef4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ── 19. Revenue concentration risk ───────────────────────────────────────────────
function ConcentrationRisk() {
  const { store } = useApp();
  const data = useMemo(() => {
    const invoices = store.invoices ?? [];
    const byCust = new Map<string, number>();
    for (const i of invoices) byCust.set(i.customer, (byCust.get(i.customer) ?? 0) + i.amount);
    const total = [...byCust.values()].reduce((s, v) => s + v, 0);
    const sorted = [...byCust.entries()].map(([customer, amount]) => ({ customer, amount, pct: total > 0 ? (amount / total) * 100 : 0 })).sort((a, b) => b.amount - a.amount);
    // Herfindahl-Hirschman Index of revenue concentration (0–10000).
    const hhi = sorted.reduce((s, r) => s + r.pct ** 2, 0);
    const top1 = sorted[0]?.pct ?? 0;
    const top3 = sorted.slice(0, 3).reduce((s, r) => s + r.pct, 0);
    return { sorted, total, hhi, top1, top3 };
  }, [store]);

  const riskLevel = data.top1 > 50 ? "High" : data.top1 > 30 ? "Moderate" : "Diversified";
  const riskColor = data.top1 > 50 ? "text-red-400" : data.top1 > 30 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <ModelNote text="Measures how dependent your revenue is on a few customers, using each one's share and the Herfindahl index. A high top-customer share is a hidden risk: losing them dents cash hard. Concentration shown on invoiced value." />
      {data.sorted.length === 0 ? (
        <EmptyState Icon={PieChart} title="No customers invoiced yet" body="Add invoices and your revenue-concentration risk will be computed here." />
      ) : (
        <>
          <KpiGrid items={[
            { label: "Top customer share", value: `${data.top1.toFixed(0)}%`, color: riskColor, sub: formatCurrency(Math.round(data.sorted[0].amount)) },
            { label: "Top 3 share", value: `${data.top3.toFixed(0)}%`, color: data.top3 > 75 ? "text-red-400" : "text-[var(--color-text)]" },
            { label: "Concentration (HHI)", value: `${Math.round(data.hhi)}`, color: data.hhi > 2500 ? "text-red-400" : data.hhi > 1500 ? "text-yellow-400" : "text-green-400" },
            { label: "Risk verdict", value: riskLevel, color: riskColor },
          ]} />
          <div className={`${CARD} p-5`}>
            <p className="text-sm font-semibold mb-3">Revenue share — top 8 customers</p>
            <ResponsiveContainer width="100%" height={Math.max(140, Math.min(8, data.sorted.length) * 34)}>
              <BarChart data={data.sorted.slice(0, 8)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(Number(v))}%`} domain={[0, 100]} />
                <YAxis type="category" dataKey="customer" tick={{ fontSize: 10, fill: "var(--color-text)" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip formatter={(v: number) => [`${Number(v).toFixed(1)}%`, "Share"]} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="pct" name="Share">
                  {data.sorted.slice(0, 8).map((d, i) => <Cell key={i} fill={d.pct > 40 ? "#ef4444" : d.pct > 20 ? "#eab308" : "var(--color-primary)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ── 20. Recurring-spend (subscription sprawl) forecast ───────────────────────────
function RecurringSpendForecast() {
  const { store } = useApp();
  const data = useMemo(() => {
    const txns = store.transactions ?? [];
    // Recurring expenses: flagged isRecurring, or repeated counterparties with regular spend.
    const byCp = new Map<string, { amounts: number[]; recurringFlag: boolean }>();
    for (const t of txns) {
      if (t.amount >= 0) continue;
      const cp = t.counterparty || t.description || "Unknown";
      const slot = byCp.get(cp) ?? { amounts: [], recurringFlag: false };
      slot.amounts.push(Math.abs(t.amount));
      if (t.isRecurring) slot.recurringFlag = true;
      byCp.set(cp, slot);
    }
    const rows = [...byCp.entries()]
      .map(([cp, v]) => ({ cp, count: v.amounts.length, avg: v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length, recurringFlag: v.recurringFlag }))
      .filter(r => r.recurringFlag || r.count >= 3) // recurring if flagged or seen 3+ times
      .map(r => ({ ...r, annual: r.avg * 12 }))
      .sort((a, b) => b.annual - a.annual);
    const annualTotal = rows.reduce((s, r) => s + r.annual, 0);
    return { rows, annualTotal };
  }, [store]);

  return (
    <div className="space-y-4">
      <ModelNote text="Treats expenses that are flagged recurring or repeat to the same counterparty 3+ times as subscriptions, then annualises their average. A rough projection of recurring outflow — review before cancelling anything." />
      {data.rows.length === 0 ? (
        <EmptyState Icon={Repeat} title="No recurring spend detected" body="Mark transactions as recurring, or let repeat vendor charges accumulate, and they will be projected here." />
      ) : (
        <>
          <KpiGrid items={[
            { label: "Recurring vendors", value: `${data.rows.length}`, color: "text-[var(--color-text)]" },
            { label: "Projected annual cost", value: formatCurrency(Math.round(data.annualTotal)), color: "text-red-400" },
            { label: "Projected monthly cost", value: formatCurrency(Math.round(data.annualTotal / 12)), color: "text-yellow-400" },
            { label: "Largest recurring", value: formatCurrency(Math.round(data.rows[0].annual)), color: "text-red-400", sub: data.rows[0].cp },
          ]} />
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="border-b border-[var(--color-border)]">
                  <tr>{["Vendor / charge", "Occurrences", "Avg charge", "Projected annual", "Source"].map(h =>
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.rows.map(r => (
                    <tr key={r.cp} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{r.cp}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(r.avg))}</td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(r.annual))}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${r.recurringFlag ? "text-[var(--color-primary)] bg-[var(--color-accent)]/30 border-[var(--color-border)]" : "text-[var(--color-muted)] bg-[var(--color-bg)] border-[var(--color-border)]"}`}>
                          {r.recurringFlag ? "Flagged" : "Inferred"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── reusable slider ─────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, suffix = "", onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-[var(--color-muted)] block mb-1">
        {label}: <strong className="text-[var(--color-text)]">{value.toLocaleString()}{suffix}</strong>
      </label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]" />
    </div>
  );
}
