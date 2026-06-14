import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot, type FinancialSnapshot } from "@/lib/finance";
import { formatAmount } from "@/lib/utils";
import {
  HeartPulse, ArrowRight, TrendingUp, TrendingDown, Minus, Droplets, Receipt, Scale,
  Users, ShieldCheck, PiggyBank, Landmark, Activity, Waves, AlertTriangle, CheckCircle2, Gauge,
} from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { format } from "date-fns";

const COMPONENT_ICON: Record<string, React.ElementType> = {
  liquidity: Droplets, profitability: PiggyBank, collections: Receipt,
  leverage: Scale, growth: TrendingUp, concentration: Users, compliance: ShieldCheck,
};

function scoreColor(s: number): string {
  return s >= 70 ? "text-green-400" : s >= 45 ? "text-yellow-400" : "text-red-400";
}
function barColor(s: number): string {
  return s >= 70 ? "bg-green-500" : s >= 45 ? "bg-yellow-500" : "bg-red-500";
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 64, c = 2 * Math.PI * r;
  const stroke = score >= 70 ? "#22c55e" : score >= 45 ? "#eab308" : "#ef4444";
  return (
    <div className="relative w-44 h-44 shrink-0">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
        <span className="text-xs text-[var(--color-muted)]">Grade {grade}</span>
      </div>
    </div>
  );
}

export default function FinancialHealthPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const { health } = snap;

  const radarData = health.components.map(c => ({ subject: c.label.split(" ")[0], score: Math.round(c.score) }));

  const lenderReady = health.score >= 65 && (snap.dscr === null || snap.dscr >= 1.25);

  // ── EBITDA & Free Cash Flow ───────────────────────────────────────────────────
  const monthlyEbitda = snap.monthlyNet + snap.monthlyInterest + snap.monthlyRevenue * 0.015;
  const ebitdaMgnPct  = snap.monthlyRevenue > 0 ? Math.round((monthlyEbitda / snap.monthlyRevenue) * 100) : null;
  const opCashFlow    = snap.monthlyNet + snap.monthlyDebtService;
  const fcfRatioPct   = snap.monthlyRevenue > 0 ? Math.round((opCashFlow / snap.monthlyRevenue) * 100) : null;

  const ratios: { label: string; value: string; target: string; ok: boolean; path: string }[] = [
    { label: "Current Ratio", value: snap.currentRatio !== null ? `${snap.currentRatio.toFixed(2)}x` : "—", target: "≥ 1.5x", ok: (snap.currentRatio ?? 2) >= 1.5, path: "/working-capital" },
    { label: "Quick Ratio", value: snap.quickRatio !== null ? `${snap.quickRatio.toFixed(2)}x` : "—", target: "≥ 1.0x", ok: (snap.quickRatio ?? 1.5) >= 1, path: "/working-capital" },
    { label: "DSCR", value: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", target: "≥ 1.25x", ok: snap.dscr === null || snap.dscr >= 1.25, path: "/debt" },
    { label: "Interest Coverage", value: snap.interestCoverage !== null ? `${snap.interestCoverage.toFixed(1)}x` : "No debt", target: "≥ 3x", ok: snap.interestCoverage === null || snap.interestCoverage >= 3, path: "/debt" },
    { label: "Cash Conversion Cycle", value: `${snap.cccDays} days`, target: "≤ 45 days", ok: snap.cccDays <= 45, path: "/working-capital" },
    { label: "Net Margin (6 mo)", value: snap.grossMarginPct !== null ? `${snap.grossMarginPct.toFixed(0)}%` : "—", target: "≥ 10%", ok: (snap.grossMarginPct ?? 0) >= 10, path: "/analytics" },
    { label: "Runway", value: snap.runwayDays >= 999 ? "CF positive" : `${snap.runwayDays} days`, target: "≥ 90 days", ok: snap.runwayDays >= 90, path: "/forecast" },
    { label: "Net Working Capital", value: formatAmount(snap.netWorkingCapital), target: "> ₹0", ok: snap.netWorkingCapital > 0, path: "/working-capital" },
    { label: "Top-Customer Share",    value: `${snap.topCustomerPct.toFixed(0)}%`,                                target: "≤ 30%",   ok: snap.topCustomerPct <= 30,                                   path: "/invoices"   },
    { label: "EBITDA Margin",         value: ebitdaMgnPct !== null ? `${ebitdaMgnPct}%` : "—",                     target: "≥ 15%",   ok: (ebitdaMgnPct ?? 0) >= 15,                                  path: "/analytics"  },
    { label: "Free Cash Flow Ratio",  value: fcfRatioPct  !== null ? `${fcfRatioPct}%` : "—",                      target: "≥ 10%",   ok: (fcfRatioPct ?? 0) >= 10,                                   path: "/debt"       },
    { label: "Revenue Growth (CMGR)", value: snap.revenueGrowthPct !== null ? `${snap.revenueGrowthPct.toFixed(1)}%/mo` : "—", target: "≥ 3%/mo", ok: (snap.revenueGrowthPct ?? 0) >= 3,            path: "/analytics"  },
  ];

  const weakest = [...health.components].sort((a, b) => a.score - b.score).slice(0, 3);

  // Section index — single-scroll equivalent of a tab selector. Each entry jumps
  // to the matching <section> anchor below. Add new tools here as [id, label, Icon].
  const sections = ([
    ["health-altman-z",      "Distress (Z')", Gauge],
    ["health-stress-test",   "Stress Test",   Waves],
    ["health-fitness-trend", "Fitness Trend", Activity],
  ] as const);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><HeartPulse size={18} className="text-[var(--color-primary)]" /> Financial Health</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          One composite score from cash, receivables, debt, growth and compliance — recomputed live from every module.
        </p>
        <div className="flex flex-wrap gap-1 mt-3">
          {sections.map(([id, label, Icon]) => (
            <a key={id} href={`#${id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40 transition-colors">
              <Icon size={11} />{label}
            </a>
          ))}
        </div>
      </div>

      {/* Score + radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex flex-col items-center justify-center gap-3">
          <ScoreRing score={health.score} grade={health.grade} />
          <div className={`text-xs px-3 py-1.5 rounded-full border font-medium ${lenderReady ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
            <Landmark size={11} className="inline mr-1.5 -mt-px" />
            {lenderReady ? "Lender-ready: meets typical underwriting bar" : "Below typical lender bar — fix weakest areas first"}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-2">Score Profile</p>
          <ResponsiveContainer width="100%" height={210}>
            <RadarChart data={radarData} outerRadius={80}>
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
              <Radar dataKey="score" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-3">What's dragging the score</p>
          <div className="space-y-3">
            {weakest.map(c => {
              const Icon = COMPONENT_ICON[c.key] ?? HeartPulse;
              return (
                <button key={c.key} onClick={() => navigate(c.fixPath)}
                  className="w-full text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={13} className={scoreColor(c.score)} />
                    <span className="text-xs font-semibold flex-1">{c.label}</span>
                    <span className={`text-xs font-bold tabular-nums ${scoreColor(c.score)}`}>{Math.round(c.score)}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)]">{c.detail}</p>
                  <p className="text-[10px] text-[var(--color-primary)] mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.fixLabel} <ArrowRight size={9} />
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Component breakdown */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-4">Component Breakdown</p>
        <div className="space-y-4">
          {health.components.map(c => {
            const Icon = COMPONENT_ICON[c.key] ?? HeartPulse;
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={13} className="text-[var(--color-muted)] shrink-0" />
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">· {c.weight}% weight</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-[var(--color-muted)] hidden md:inline">{c.detail}</span>
                    <span className={`text-sm font-bold tabular-nums ${scoreColor(c.score)}`}>{Math.round(c.score)}</span>
                    <button onClick={() => navigate(c.fixPath)} className="text-[10px] text-[var(--color-primary)] hover:underline whitespace-nowrap">
                      {c.fixLabel} →
                    </button>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ratio grid */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-1">Key Ratios vs Lender Benchmarks</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">Click any ratio to open the module that drives it.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ratios.map(r => (
            <button key={r.label} onClick={() => navigate(r.path)}
              className="text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{r.label}</p>
              <p className={`text-lg font-bold tabular-nums ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Target {r.target} · {r.ok ? "on track" : "needs attention"}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Snapshot strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash on Hand", value: formatAmount(snap.cash), path: "/transactions" },
          { label: "Open Receivables", value: formatAmount(snap.accountsReceivable), path: "/receivables" },
          { label: "Debt Outstanding", value: formatAmount(snap.debtOutstanding), path: "/debt" },
          { label: "Working-Capital Gap", value: formatAmount(snap.workingCapitalGap), path: "/working-capital" },
        ].map(s => (
          <button key={s.label} onClick={() => navigate(s.path)}
            className="text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 hover:border-[var(--color-primary)]/40 transition-colors">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
          </button>
        ))}
      </div>

      {/* #154 Altman Z' Score — Distress Indicator */}
      <AltmanZScore snap={snap} />

      {/* #155 Liquidity Stress Test */}
      <LiquidityStressTest snap={snap} />

      {/* #156 Financial Fitness Trend */}
      <FinancialFitnessTrend snap={snap} />
    </div>
  );
}

// ── #155 LIQUIDITY STRESS TEST — survive-a-shock simulation ──────────────────────
// Models a combined demand/collections/cost shock against live cash & burn, then
// reports the runway you'd be left with and whether you breach a safety buffer.
function LiquidityStressTest({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const [revDrop, setRevDrop]   = useState(30);   // % fall in monthly revenue
  const [arDelay, setArDelay]   = useState(50);   // % of receivables that go uncollectable / stuck this quarter
  const [costRise, setCostRise] = useState(10);   // % rise in monthly expense (input cost / rate shock)
  const [bufferMonths, setBufferMonths] = useState(3); // minimum cash buffer to defend

  const base = useMemo(() => {
    // Stressed monthly P&L
    const stressedRevenue = snap.monthlyRevenue * (1 - revDrop / 100);
    const stressedExpense = snap.monthlyExpense * (1 + costRise / 100);
    const stressedNet     = stressedRevenue - stressedExpense;

    // Cash impact: a slug of AR that won't arrive this quarter never lands as cash.
    const arShortfall = snap.accountsReceivable * (arDelay / 100);
    // Working capital cushion that survives the shock = current cash, less the AR we can't realise.
    const effectiveCash = Math.max(0, snap.cash - 0); // cash on hand is unaffected day-one
    const stressedDailyBurn = stressedNet < 0 ? -stressedNet / 30 : 0;

    // Runway under stress: cash, minus the AR we expected but won't get within the quarter,
    // divided by the new daily burn.
    const cushion = effectiveCash; // AR was never counted as cash, so we model its absence via lost inflow below
    const monthlyInflowGap = arShortfall / 3; // spread the stuck AR over the 3-month shock window
    const adjDailyBurn = stressedNet < 0 ? (-stressedNet + monthlyInflowGap) / 30 : monthlyInflowGap / 30;
    const stressedRunway = adjDailyBurn > 0 ? Math.floor(cushion / adjDailyBurn) : 999;

    const safetyFloor = stressedExpense * bufferMonths;
    const breaches = effectiveCash < safetyFloor || stressedRunway < bufferMonths * 30;
    const baseRunway = snap.runwayDays;

    return {
      stressedRevenue, stressedExpense, stressedNet, arShortfall,
      stressedRunway, stressedDailyBurn, adjDailyBurn, safetyFloor,
      breaches, baseRunway,
    };
  }, [snap, revDrop, arDelay, costRise, bufferMonths]);

  const verdict = base.breaches
    ? { label: "Fails the stress test — would breach safety buffer", color: "text-red-400", border: "border-red-800/40", bg: "bg-red-900/20", Icon: AlertTriangle }
    : { label: "Survives the shock with buffer intact", color: "text-green-400", border: "border-green-800/40", bg: "bg-green-900/20", Icon: CheckCircle2 };

  const sliders: { label: string; value: number; set: (n: number) => void; min: number; max: number; suffix: string }[] = [
    { label: "Revenue drop", value: revDrop, set: setRevDrop, min: 0, max: 80, suffix: "%" },
    { label: "Receivables stuck (this quarter)", value: arDelay, set: setArDelay, min: 0, max: 100, suffix: "%" },
    { label: "Operating-cost rise", value: costRise, set: setCostRise, min: 0, max: 50, suffix: "%" },
    { label: "Minimum cash buffer", value: bufferMonths, set: setBufferMonths, min: 1, max: 12, suffix: " mo" },
  ];

  const runwayLabel = (d: number) => d >= 999 ? "CF positive" : `${d} days`;

  return (
    <section id="health-stress-test" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Waves size={15} className="text-[var(--color-primary)]" /> Liquidity Stress Test</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Survive-a-shock simulation. Drag the levers to model a downturn — falling sales, customers who stop paying, rising input costs — and see how many days of runway you would have left and whether you breach your cash safety buffer.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          {sliders.map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium">{s.label}</span>
                <span className="text-xs font-bold tabular-nums text-[var(--color-primary)]">{s.value}{s.suffix}</span>
              </div>
              <input
                type="range" min={s.min} max={s.max} value={s.value}
                onChange={e => s.set(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]"
              />
            </div>
          ))}
          <div className={`rounded-lg p-3 border ${verdict.border} ${verdict.bg} flex items-start gap-2`}>
            <verdict.Icon size={15} className={`${verdict.color} mt-0.5 shrink-0`} />
            <p className={`text-xs font-semibold ${verdict.color}`}>{verdict.label}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">Runway today</p>
              <p className="text-xl font-bold tabular-nums">{runwayLabel(base.baseRunway)}</p>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">Runway under shock</p>
              <p className={`text-xl font-bold tabular-nums ${base.breaches ? "text-red-400" : "text-green-400"}`}>{runwayLabel(base.stressedRunway)}</p>
            </div>
          </div>

          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
            {([
              { label: "Stressed monthly revenue", value: formatAmount(base.stressedRevenue) },
              { label: "Stressed monthly expense", value: formatAmount(base.stressedExpense) },
              { label: "Stressed monthly net", value: formatAmount(base.stressedNet), neg: base.stressedNet < 0 },
              { label: "Receivables you can't realise", value: formatAmount(base.arShortfall), neg: base.arShortfall > 0 },
              { label: `Cash safety floor (${bufferMonths} mo)`, value: formatAmount(base.safetyFloor) },
              { label: "Cash on hand", value: formatAmount(snap.cash) },
            ] as { label: string; value: string; neg?: boolean }[]).map(r => (
              <div key={r.label} className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                <span className={`text-xs font-bold tabular-nums ${r.neg ? "text-red-400" : ""}`}>{r.value}</span>
              </div>
            ))}
          </div>

          <button onClick={() => navigate("/forecast")}
            className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1">
            Build a full 13-week forecast <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── #156 FINANCIAL FITNESS TREND — health score over time + drivers ──────────────
// Records a durable monthly fingerprint of the live composite score and its top
// drivers, then charts the fitness trajectory so owners can see momentum, not
// just today's number.
interface FitnessPoint {
  month: string;          // YYYY-MM
  score: number;
  topDriver: string;      // best component label
  topDrag: string;        // worst component label
}

function FinancialFitnessTrend({ snap }: { snap: FinancialSnapshot }) {
  const [history, setHistory] = useFeatureState<FitnessPoint[]>("health-fitness-trend", []);
  const monthKey = format(new Date(), "yyyy-MM");

  const sorted = [...snap.health.components].sort((a, b) => b.score - a.score);
  const topDriver = sorted[0]?.label ?? "—";
  const topDrag   = sorted[sorted.length - 1]?.label ?? "—";

  // Snapshot today's score into durable history once per calendar month.
  useEffect(() => {
    if (snap.health.score <= 0) return;
    setHistory(prev => {
      const existing = prev.find(p => p.month === monthKey);
      const point: FitnessPoint = { month: monthKey, score: snap.health.score, topDriver, topDrag };
      if (existing) {
        if (existing.score === point.score && existing.topDrag === point.topDrag && existing.topDriver === point.topDriver) return prev;
        return prev.map(p => p.month === monthKey ? point : p);
      }
      return [...prev, point].slice(-24);
    });
  }, [monthKey, snap.health.score, topDriver, topDrag, setHistory]);

  // Synthesise an estimated back-trend from revenue history so the chart isn't
  // empty on day one: scale today's score by each month's revenue vs the latest.
  const chartData = useMemo(() => {
    const recorded = new Map(history.map(p => [p.month, p.score]));
    const latestRev = snap.months.length ? snap.months[snap.months.length - 1].revenue : 0;
    return snap.months.map(m => {
      const live = recorded.get(m.key);
      const est = latestRev > 0
        ? Math.round(snap.health.score * Math.max(0.4, Math.min(1.2, m.revenue / latestRev)))
        : snap.health.score;
      return {
        month: m.label,
        recorded: live ?? null,
        estimate: live ?? est,
      };
    });
  }, [history, snap.months, snap.health.score]);

  const first = chartData[0]?.estimate ?? snap.health.score;
  const last  = chartData[chartData.length - 1]?.estimate ?? snap.health.score;
  const delta = last - first;
  const TrendIcon = delta > 1 ? TrendingUp : delta < -1 ? TrendingDown : Minus;
  const trendColor = delta > 1 ? "text-green-400" : delta < -1 ? "text-red-400" : "text-[var(--color-muted)]";

  return (
    <section id="health-fitness-trend" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold flex items-center gap-2"><Activity size={15} className="text-[var(--color-primary)]" /> Financial Fitness Trend</p>
        <span className={`text-xs font-semibold flex items-center gap-1 ${trendColor}`}>
          <TrendIcon size={13} /> {delta >= 0 ? "+" : ""}{delta} pts over {chartData.length} mo
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Your composite health score plotted over time with the drivers moving it. Solid points are recorded each month; the line is estimated from revenue history until enough months are logged.
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fitnessFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-muted)" }}
          />
          <Area type="monotone" dataKey="estimate" name="Health score" stroke="var(--color-primary)" strokeWidth={2} fill="url(#fitnessFill)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-1">Current score</p>
          <p className={`text-lg font-bold tabular-nums ${scoreColor(snap.health.score)}`}>{snap.health.score} <span className="text-xs text-[var(--color-muted)]">· {snap.health.grade}</span></p>
        </div>
        <div className="bg-[var(--color-bg)] border border-green-800/30 rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-1 flex items-center gap-1"><TrendingUp size={10} className="text-green-400" /> Strongest driver</p>
          <p className="text-sm font-semibold text-green-400">{topDriver}</p>
        </div>
        <div className="bg-[var(--color-bg)] border border-red-800/30 rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-1 flex items-center gap-1"><TrendingDown size={10} className="text-red-400" /> Biggest drag</p>
          <p className="text-sm font-semibold text-red-400">{topDrag}</p>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Month", "Score", "Strongest", "Biggest drag"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(p => (
                <tr key={p.month} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2 tabular-nums">{p.month}</td>
                  <td className={`px-3 py-2 font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</td>
                  <td className="px-3 py-2 text-green-400">{p.topDriver}</td>
                  <td className="px-3 py-2 text-red-400">{p.topDrag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── #154 ALTMAN Z' SCORE — distress / bankruptcy-risk indicator ──────────────────
// Altman Z' for private manufacturers/SMBs:
//   Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5
// X1 working-capital/assets, X2 retained-earnings/assets, X3 EBIT/assets,
// X4 equity/liabilities, X5 sales/assets. Bands: >2.9 safe · 1.23–2.9 grey · <1.23 distress.
// All inputs are derived live from the financial snapshot (transaction proxies).
function AltmanZScore({ snap }: { snap: FinancialSnapshot }) {
  const z = useMemo(() => {
    const estimatedFA      = snap.monthlyRevenue * 6;                       // fixed-asset proxy
    const totalAssets      = snap.cash + snap.accountsReceivable + snap.inventoryValue + estimatedFA;
    const totalLiab        = snap.debtOutstanding + snap.accountsPayable + snap.obligationsDue90;
    const retainedEarnings = Math.max(0, snap.monthlyNet * 12);            // accumulated profit proxy
    const ebitAnnual       = (snap.monthlyNet + snap.monthlyInterest) * 12; // EBIT proxy
    const bookEquity       = Math.max(0, totalAssets - totalLiab);
    const x1 = totalAssets > 0 ? snap.netWorkingCapital / totalAssets : 0;
    const x2 = totalAssets > 0 ? retainedEarnings / totalAssets : 0;
    const x3 = totalAssets > 0 ? ebitAnnual / totalAssets : 0;
    const x4 = totalLiab   > 0 ? bookEquity / totalLiab : 3;                // no debt → strong buffer
    const x5 = totalAssets > 0 ? (snap.monthlyRevenue * 12) / totalAssets : 0;
    const score = parseFloat((0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5).toFixed(2));
    return { score, x1, x2, x3, x4, x5, totalAssets, totalLiab, bookEquity };
  }, [snap]);

  const zone = z.score > 2.9
    ? { label: "Safe Zone · Low Distress Risk",  color: "text-green-400",  border: "border-green-800/40",  bg: "bg-green-900/20"  }
    : z.score > 1.23
    ? { label: "Grey Zone · Monitor Closely",    color: "text-yellow-400", border: "border-yellow-800/40", bg: "bg-yellow-900/20" }
    : { label: "Distress Zone · Act Now",        color: "text-red-400",    border: "border-red-800/40",    bg: "bg-red-900/20"    };

  const factors = ([
    { label: "X1 · Working Capital / Total Assets",   value: z.x1, coef: 0.717, note: "Short-term liquidity buffer"          },
    { label: "X2 · Retained Earnings / Total Assets", value: z.x2, coef: 0.847, note: "Accumulated profitability & age"      },
    { label: "X3 · EBIT / Total Assets",              value: z.x3, coef: 3.107, note: "Operating efficiency (highest weight)" },
    { label: "X4 · Equity / Total Liabilities",       value: z.x4, coef: 0.420, note: "Leverage buffer (∞ if no debt)"       },
    { label: "X5 · Revenue / Total Assets",           value: z.x5, coef: 0.998, note: "Asset utilisation rate"               },
  ] as { label: string; value: number; coef: number; note: string }[]);

  return (
    <section id="health-altman-z" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={15} className="text-[var(--color-primary)]" /> Altman Z' Score — Distress Indicator</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Used by lenders worldwide to predict insolvency risk. Z' &gt; 2.9 = safe, 1.23–2.9 = grey zone, &lt; 1.23 = distress. Values derived from transaction proxies — connect all accounts for best accuracy.
      </p>
      <div className="flex items-start gap-6 flex-wrap">
        <div className={`rounded-xl px-7 py-5 border ${zone.border} ${zone.bg} shrink-0 text-center`}>
          <p className="text-[10px] text-[var(--color-muted)] mb-1.5">Your Z' Score</p>
          <p className={`text-5xl font-bold tabular-nums ${zone.color}`}>{z.score}</p>
          <p className={`text-xs font-semibold mt-2 ${zone.color}`}>{zone.label}</p>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1 text-left">
            {([
              { label: "Total assets (est.)",      value: formatAmount(z.totalAssets) },
              { label: "Total liabilities (est.)", value: formatAmount(z.totalLiab) },
              { label: "Book equity (est.)",       value: formatAmount(z.bookEquity) },
            ] as { label: string; value: string }[]).map(r => (
              <div key={r.label} className="flex items-center justify-between gap-4">
                <span className="text-[10px] text-[var(--color-muted)]">{r.label}</span>
                <span className="text-[10px] font-semibold tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {factors.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[11px] font-medium truncate">{row.label}</p>
                  <span className="text-[10px] text-[var(--color-muted)] shrink-0">× {row.coef}</span>
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">{row.note}</p>
              </div>
              <span className="text-sm font-bold tabular-nums text-[var(--color-primary)] shrink-0 w-14 text-right">{row.value.toFixed(3)}</span>
              <span className="text-xs tabular-nums text-[var(--color-muted)] shrink-0 w-14 text-right">{(row.value * row.coef).toFixed(3)}</span>
            </div>
          ))}
          <div className="border-t border-[var(--color-border)] pt-2 flex items-center justify-between">
            <p className="text-[10px] text-[var(--color-muted)]">Weighted sum (Z' = Σ coef × factor)</p>
            <span className={`text-sm font-bold tabular-nums ${zone.color}`}>{z.score}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
