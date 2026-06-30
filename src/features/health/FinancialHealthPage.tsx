import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot, type FinancialSnapshot } from "@/lib/finance";
import { totalDepreciation } from "@/lib/depreciation";
import { formatAmount } from "@/lib/utils";
import {
  HeartPulse, ArrowRight, TrendingUp, TrendingDown, Minus, Droplets, Receipt, Scale,
  Users, ShieldCheck, PiggyBank, Landmark, Activity, Waves, AlertTriangle, CheckCircle2, Gauge,
  Layers, Percent, RefreshCw, Timer, Siren, XCircle,
  HandCoins, Ratio, GitCompareArrows, Banknote, Anchor,
} from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { format, addMonths } from "date-fns";
import AiInsight from "@/components/ai/AiInsight";

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
  // Real monthly depreciation from the fixed-asset register (trailing 1-month window)
  // rather than a flat 1.5%-of-revenue proxy.
  const monthlyDepreciation = useMemo(() => {
    const now = new Date();
    const d = totalDepreciation(store.fixedAssets ?? [], addMonths(now, -1).toISOString(), now.toISOString());
    return Number.isFinite(d) && d > 0 ? d : 0;
  }, [store.fixedAssets]);
  const monthlyEbitda = snap.monthlyNet + snap.monthlyInterest + monthlyDepreciation;
  const ebitdaMgnPct  = snap.monthlyRevenue > 0 ? Math.round((monthlyEbitda / snap.monthlyRevenue) * 100) : null;
  // Operating cash flow = net profit + interest add-back (principal repayment is a real
  // cash outflow, so add back interest only - not full debt service).
  const opCashFlow    = snap.monthlyNet + snap.monthlyInterest;
  const fcfRatioPct   = snap.monthlyRevenue > 0 ? Math.round((opCashFlow / snap.monthlyRevenue) * 100) : null;

  const ratios: { label: string; value: string; target: string; ok: boolean; path: string }[] = [
    { label: "Current Ratio", value: snap.currentRatio !== null ? `${snap.currentRatio.toFixed(2)}x` : "-", target: "≥ 1.5x", ok: (snap.currentRatio ?? 2) >= 1.5, path: "/working-capital" },
    { label: "Quick Ratio", value: snap.quickRatio !== null ? `${snap.quickRatio.toFixed(2)}x` : "-", target: "≥ 1.0x", ok: (snap.quickRatio ?? 1.5) >= 1, path: "/working-capital" },
    { label: "DSCR", value: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", target: "≥ 1.25x", ok: snap.dscr === null || snap.dscr >= 1.25, path: "/debt" },
    { label: "Interest Coverage", value: snap.interestCoverage !== null ? `${snap.interestCoverage.toFixed(1)}x` : "No debt", target: "≥ 3x", ok: snap.interestCoverage === null || snap.interestCoverage >= 3, path: "/debt" },
    { label: "Cash Conversion Cycle", value: `${snap.cccDays} days`, target: "≤ 45 days", ok: snap.cccDays <= 45, path: "/working-capital" },
    { label: "Net Margin (6 mo)", value: snap.grossMarginPct !== null ? `${snap.grossMarginPct.toFixed(0)}%` : "-", target: "≥ 10%", ok: (snap.grossMarginPct ?? 0) >= 10, path: "/analytics" },
    { label: "Runway", value: snap.runwayDays >= 999 ? "CF positive" : `${snap.runwayDays} days`, target: "≥ 90 days", ok: snap.runwayDays >= 90, path: "/forecast" },
    { label: "Net Working Capital", value: formatAmount(snap.netWorkingCapital), target: "> ₹0", ok: snap.netWorkingCapital > 0, path: "/working-capital" },
    { label: "Top-Customer Share",    value: `${snap.topCustomerPct.toFixed(0)}%`,                                target: "≤ 30%",   ok: snap.topCustomerPct <= 30,                                   path: "/invoices"   },
    { label: "EBITDA Margin",         value: ebitdaMgnPct !== null ? `${ebitdaMgnPct}%` : "-",                     target: "≥ 15%",   ok: (ebitdaMgnPct ?? 0) >= 15,                                  path: "/analytics"  },
    { label: "Free Cash Flow Ratio",  value: fcfRatioPct  !== null ? `${fcfRatioPct}%` : "-",                      target: "≥ 10%",   ok: (fcfRatioPct ?? 0) >= 10,                                   path: "/debt"       },
    { label: "Revenue Growth (CMGR)", value: snap.revenueGrowthPct !== null ? `${snap.revenueGrowthPct.toFixed(1)}%/mo` : "-", target: "≥ 3%/mo", ok: (snap.revenueGrowthPct ?? 0) >= 3,            path: "/analytics"  },
  ];

  const weakest = [...health.components].sort((a, b) => a.score - b.score).slice(0, 3);

  // Section index - single-scroll equivalent of a tab selector. Each entry jumps
  // to the matching <section> anchor below. Add new tools here as [id, label, Icon].
  const sections = ([
    ["health-altman-z",        "Distress (Z')",  Gauge],
    ["health-stress-test",     "Stress Test",    Waves],
    ["health-fitness-trend",   "Fitness Trend",  Activity],
    ["health-liquidity-ladder","Liquidity",      Droplets],
    ["health-solvency",        "Solvency",       Scale],
    ["health-efficiency",      "Efficiency",     RefreshCw],
    ["health-dupont",          "DuPont ROE",     Layers],
    ["health-runway-gauge",    "Runway Gauge",   Timer],
    ["health-early-warning",   "Early Warning",  Siren],
    ["health-cf-coverage",     "CF Coverage",    HandCoins],
    ["health-margin-stability","Margin Stability", Ratio],
    ["health-growth-quality",  "Growth Quality", GitCompareArrows],
    ["health-expense-discipline","Expense Discipline", Banknote],
    ["health-resilience",      "Resilience",     Anchor],
    ["health-quick-ratio-gauge","Quick Ratio",   Gauge],
    ["health-debt-burden",     "Debt Burden",    Scale],
    ["health-cash-buffer",     "Cash Buffer",    PiggyBank],
    ["health-revenue-diversification","Revenue Mix", Users],
  ] as const);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><HeartPulse size={18} className="text-[var(--color-primary)]" /> Financial Health</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          One composite score from cash, receivables, debt, growth and compliance - recomputed live from every module.
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
            {lenderReady ? "Lender-ready: meets typical underwriting bar" : "Below typical lender bar - fix weakest areas first"}
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

      <AiInsight
        collapsed
        question="Explain my financial-health score in plain English and the top 2 things to improve it."
        context={{
          score: health.score,
          grade: health.grade,
          lenderReady,
          weakestComponents: weakest.map(c => ({ label: c.label, score: Math.round(c.score), weight: c.weight, detail: c.detail })),
          liquidity: {
            currentRatio: snap.currentRatio,
            quickRatio: snap.quickRatio,
            netWorkingCapital: snap.netWorkingCapital,
            runwayDays: snap.runwayDays,
            cccDays: snap.cccDays,
          },
          solvency: {
            dscr: snap.dscr,
            interestCoverage: snap.interestCoverage,
            debtOutstanding: snap.debtOutstanding,
          },
          trend: {
            revenueGrowthPct: snap.revenueGrowthPct,
            netMarginPct: snap.grossMarginPct,
            ebitdaMarginPct: ebitdaMgnPct,
          },
        }}
      />

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

      {/* #154 Altman Z' Score - Distress Indicator */}
      <AltmanZScore snap={snap} />

      {/* #155 Liquidity Stress Test */}
      <LiquidityStressTest snap={snap} />

      {/* #156 Financial Fitness Trend */}
      <FinancialFitnessTrend snap={snap} />

      {/* #157 Liquidity Ladder */}
      <LiquidityLadder snap={snap} />

      {/* #158 Solvency & Coverage */}
      <SolvencyCoverage snap={snap} />

      {/* #159 Efficiency / Turnover */}
      <EfficiencyTurnover snap={snap} />

      {/* #160 DuPont ROE Breakdown */}
      <DuPontRoe snap={snap} />

      {/* #161 Cash-Runway Gauge */}
      <RunwayGauge snap={snap} />

      {/* #162 Distress Early-Warning Checklist */}
      <EarlyWarning snap={snap} />

      {/* #163 Cash-Flow Coverage */}
      <CashFlowCoverage snap={snap} />

      {/* #164 Margin Stability Score */}
      <MarginStability snap={snap} />

      {/* #165 Growth Quality (cash vs accrual) */}
      <GrowthQuality snap={snap} />

      {/* #166 Expense Discipline Trend */}
      <ExpenseDiscipline snap={snap} />

      {/* #167 Overall Resilience Index */}
      <ResilienceIndex snap={snap} />

      {/* #168 Quick-Ratio Gauge */}
      <QuickRatioGauge snap={snap} />

      {/* #169 Debt-Burden Index */}
      <DebtBurdenIndex snap={snap} />

      {/* #170 Cash-Buffer Months */}
      <CashBufferMonths snap={snap} />

      {/* #171 Revenue-Diversification Index */}
      <RevenueDiversification snap={snap} />
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, target, ok, note }: { label: string; value: string; target?: string; ok?: boolean; note?: string }) {
  const tone = ok === undefined ? "" : ok ? "text-green-400" : "text-red-400";
  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
      <p className="text-[10px] text-[var(--color-muted)] mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      {(target || note) && (
        <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
          {target ? `Target ${target}` : ""}{target && note ? " · " : ""}{note ?? (ok === undefined ? "" : ok ? "on track" : "needs attention")}
        </p>
      )}
    </div>
  );
}

// ── #157 LIQUIDITY LADDER - current / quick / cash ratios with health bands ──────
// Three layered liquidity tests against the same current-liabilities base, from
// least to most conservative, so owners see how much survives if inventory and
// receivables are stripped out.
function LiquidityLadder({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    // Current liabilities proxy: payables + 90-day obligations + ~one year of debt service.
    const currentLiab = Math.max(1, snap.accountsPayable + snap.obligationsDue90 + snap.monthlyDebtService * 12);
    const currentAssets = snap.cash + snap.accountsReceivable + snap.inventoryValue;
    const current = currentAssets / currentLiab;
    const quick   = (snap.cash + snap.accountsReceivable) / currentLiab;
    const cash    = snap.cash / currentLiab;
    return { current, quick, cash, currentLiab, currentAssets };
  }, [snap]);

  const rungs: { label: string; value: number; target: number; desc: string }[] = [
    { label: "Current Ratio", value: m.current, target: 1.5, desc: "All current assets ÷ current liabilities" },
    { label: "Quick Ratio (acid test)", value: m.quick, target: 1.0, desc: "Excludes inventory - cash + receivables only" },
    { label: "Cash Ratio", value: m.cash, target: 0.5, desc: "Pure cash cover for near-term bills" },
  ];

  return (
    <section id="health-liquidity-ladder" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Droplets size={15} className="text-[var(--color-primary)]" /> Liquidity Ladder</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Three progressively stricter liquidity tests against the same liabilities base. Each rung strips out a less-liquid asset, showing what really covers your short-term bills.
      </p>
      <div className="space-y-4">
        {rungs.map(r => {
          const pct = Math.min(100, (r.value / (r.target * 1.5)) * 100);
          const ok = r.value >= r.target;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="text-[10px] text-[var(--color-muted)] ml-2">target ≥ {r.target.toFixed(1)}x</span>
                  <p className="text-[10px] text-[var(--color-muted)]">{r.desc}</p>
                </div>
                <span className={`text-lg font-bold tabular-nums shrink-0 ${ok ? "text-green-400" : "text-red-400"}`}>{r.value.toFixed(2)}x</span>
              </div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${ok ? "bg-green-500" : r.value >= r.target * 0.66 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <MetricCard label="Current assets" value={formatAmount(m.currentAssets)} />
        <MetricCard label="Current liabilities (est.)" value={formatAmount(m.currentLiab)} />
        <MetricCard label="Net working capital" value={formatAmount(snap.netWorkingCapital)} ok={snap.netWorkingCapital > 0} />
      </div>
      <button onClick={() => navigate("/working-capital")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Open working capital <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #158 SOLVENCY & COVERAGE - long-term leverage & ability to service debt ──────
// Debt-to-equity, debt-to-assets, equity ratio and interest/debt coverage against
// lender bands, with a single solvency verdict.
function SolvencyCoverage({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const estimatedFA = snap.monthlyRevenue * 6;
    const totalAssets = snap.cash + snap.accountsReceivable + snap.inventoryValue + estimatedFA;
    const totalLiab   = snap.debtOutstanding + snap.accountsPayable + snap.obligationsDue90;
    const equity      = Math.max(0, totalAssets - totalLiab);
    const debtEquity  = equity > 0 ? snap.debtOutstanding / equity : (snap.debtOutstanding > 0 ? null : 0);
    const debtAssets  = totalAssets > 0 ? snap.debtOutstanding / totalAssets : 0;
    const equityRatio = totalAssets > 0 ? equity / totalAssets : 0;
    const annualNet   = snap.monthlyNet * 12;
    const debtToEarnings = annualNet > 0 ? snap.debtOutstanding / annualNet : (snap.debtOutstanding > 0 ? null : 0);
    return { totalAssets, totalLiab, equity, debtEquity, debtAssets, equityRatio, debtToEarnings };
  }, [snap]);

  const rows: { label: string; value: string; target: string; ok: boolean }[] = [
    { label: "Debt-to-Equity", value: m.debtEquity === null ? "∞" : `${m.debtEquity.toFixed(2)}x`, target: "≤ 2.0x", ok: m.debtEquity !== null && m.debtEquity <= 2 },
    { label: "Debt-to-Assets", value: `${(m.debtAssets * 100).toFixed(0)}%`, target: "≤ 50%", ok: m.debtAssets <= 0.5 },
    { label: "Equity Ratio", value: `${(m.equityRatio * 100).toFixed(0)}%`, target: "≥ 40%", ok: m.equityRatio >= 0.4 },
    { label: "Interest Coverage", value: snap.interestCoverage !== null ? `${snap.interestCoverage.toFixed(1)}x` : "No debt", target: "≥ 3x", ok: snap.interestCoverage === null || snap.interestCoverage >= 3 },
    { label: "DSCR", value: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", target: "≥ 1.25x", ok: snap.dscr === null || snap.dscr >= 1.25 },
    { label: "Debt ÷ Annual Profit", value: m.debtToEarnings === null ? "-" : `${m.debtToEarnings.toFixed(1)}x`, target: "≤ 3x", ok: m.debtToEarnings !== null && m.debtToEarnings <= 3 },
  ];
  const passes = rows.filter(r => r.ok).length;
  const solvent = passes >= 4;

  return (
    <section id="health-solvency" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold flex items-center gap-2"><Scale size={15} className="text-[var(--color-primary)]" /> Solvency &amp; Coverage</p>
        <span className={`text-xs font-semibold flex items-center gap-1 ${solvent ? "text-green-400" : "text-red-400"}`}>
          {solvent ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {passes}/{rows.length} lender bands met
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Long-term leverage and your ability to service debt, measured against the bands banks use. Equity and assets are derived from transaction proxies.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(r => <MetricCard key={r.label} label={r.label} value={r.value} target={r.target} ok={r.ok} />)}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <MetricCard label="Total assets (est.)" value={formatAmount(m.totalAssets)} />
        <MetricCard label="Total liabilities (est.)" value={formatAmount(m.totalLiab)} />
        <MetricCard label="Book equity (est.)" value={formatAmount(m.equity)} />
      </div>
      <button onClick={() => navigate("/debt")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Open debt module <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #159 EFFICIENCY / TURNOVER - how hard assets work, in turns and days ─────────
function EfficiencyTurnover({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const annualRev = snap.monthlyRevenue * 12;
    const annualCogs = snap.monthlyExpense * 12;
    const estimatedFA = snap.monthlyRevenue * 6;
    const totalAssets = snap.cash + snap.accountsReceivable + snap.inventoryValue + estimatedFA;
    const assetTurns = totalAssets > 0 ? annualRev / totalAssets : 0;
    const arTurns    = snap.accountsReceivable > 0 ? annualRev / snap.accountsReceivable : null;
    const invTurns   = snap.inventoryValue > 0 ? annualCogs / snap.inventoryValue : null;
    const apTurns    = snap.accountsPayable > 0 ? annualCogs / snap.accountsPayable : null;
    return { assetTurns, arTurns, invTurns, apTurns, totalAssets };
  }, [snap]);

  const rows: { label: string; turns: number | null; days: number; target: string; ok: boolean }[] = [
    { label: "Asset Turnover", turns: m.assetTurns, days: snap.cccDays, target: "≥ 1.0x", ok: m.assetTurns >= 1 },
    { label: "Receivables Turnover", turns: m.arTurns, days: snap.dsoDays, target: "DSO ≤ 45d", ok: snap.dsoDays <= 45 },
    { label: "Inventory Turnover", turns: m.invTurns, days: snap.dioDays, target: "DIO ≤ 60d", ok: snap.dioDays <= 60 },
    { label: "Payables Turnover", turns: m.apTurns, days: snap.dpoDays, target: "DPO 30-60d", ok: snap.dpoDays >= 30 },
  ];

  return (
    <section id="health-efficiency" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><RefreshCw size={15} className="text-[var(--color-primary)]" /> Efficiency &amp; Turnover</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        How many times a year each asset class cycles into revenue, with the equivalent days. Faster turns free up cash; the cash-conversion cycle is {snap.cccDays} days today.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Metric", "Turns / yr", "Equivalent days", "Target", "Status"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-3 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 tabular-nums">{r.turns === null ? "-" : `${r.turns.toFixed(1)}x`}</td>
                <td className="px-3 py-2 tabular-nums">{r.days} days</td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{r.target}</td>
                <td className={`px-3 py-2 text-xs font-semibold ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.ok ? "Good" : "Slow"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => navigate("/working-capital")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Improve the cash cycle <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #160 DUPONT ROE - return on equity decomposed into its three drivers ─────────
// ROE = Net margin × Asset turnover × Equity multiplier. Shows which lever drives
// (or drags) the return shareholders earn.
function DuPontRoe({ snap }: { snap: FinancialSnapshot }) {
  const m = useMemo(() => {
    const annualRev = snap.monthlyRevenue * 12;
    const annualNet = snap.monthlyNet * 12;
    const estimatedFA = snap.monthlyRevenue * 6;
    const totalAssets = snap.cash + snap.accountsReceivable + snap.inventoryValue + estimatedFA;
    const totalLiab   = snap.debtOutstanding + snap.accountsPayable + snap.obligationsDue90;
    const equity      = Math.max(1, totalAssets - totalLiab);
    const netMargin   = annualRev > 0 ? annualNet / annualRev : 0;
    const assetTurn   = totalAssets > 0 ? annualRev / totalAssets : 0;
    const equityMult  = totalAssets > 0 ? totalAssets / equity : 1;
    const roe = netMargin * assetTurn * equityMult;
    return { netMargin, assetTurn, equityMult, roe, equity, totalAssets, annualNet };
  }, [snap]);

  const drivers: { label: string; value: string; note: string }[] = [
    { label: "Net Profit Margin", value: `${(m.netMargin * 100).toFixed(1)}%`, note: "Profit kept per ₹1 of sales" },
    { label: "Asset Turnover", value: `${m.assetTurn.toFixed(2)}x`, note: "Sales generated per ₹1 of assets" },
    { label: "Equity Multiplier", value: `${m.equityMult.toFixed(2)}x`, note: "Leverage - assets per ₹1 of equity" },
  ];
  const roePct = m.roe * 100;
  const ok = roePct >= 15;

  return (
    <section id="health-dupont" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={15} className="text-[var(--color-primary)]" /> DuPont ROE Breakdown</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Return on equity split into its three levers: profitability, efficiency and leverage. ROE = margin × turnover × multiplier. Target ≥ 15%.
      </p>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {drivers.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 min-w-[130px]">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{d.label}</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{d.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{d.note}</p>
            </div>
            {i < drivers.length - 1 && <Percent size={14} className="text-[var(--color-muted)] rotate-90 sm:rotate-0" />}
          </div>
        ))}
        <span className="text-[var(--color-muted)] font-bold px-1">=</span>
        <div className={`rounded-lg px-5 py-3 border text-center ${ok ? "border-green-800/40 bg-green-900/20" : "border-yellow-800/40 bg-yellow-900/20"}`}>
          <p className="text-[10px] text-[var(--color-muted)] mb-1">Return on Equity</p>
          <p className={`text-2xl font-bold tabular-nums ${ok ? "text-green-400" : "text-yellow-400"}`}>{roePct.toFixed(1)}%</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Annual net profit (est.)" value={formatAmount(m.annualNet)} />
        <MetricCard label="Book equity (est.)" value={formatAmount(m.equity)} />
        <MetricCard label="Total assets (est.)" value={formatAmount(m.totalAssets)} />
      </div>
    </section>
  );
}

// ── #161 CASH-RUNWAY GAUGE - months of survival against burn, with bands ─────────
function RunwayGauge({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const cfPositive = snap.runwayDays >= 999;
  const months = cfPositive ? 99 : snap.runwayDays / 30;
  const dailyBurn = snap.monthlyNet < 0 ? -snap.monthlyNet / 30 : 0;
  // Gauge: 0-12 months mapped to a half-ring.
  const capped = Math.min(12, months);
  const pct = capped / 12;
  const r = 70, c = Math.PI * r; // semicircle length
  const stroke = cfPositive || months >= 6 ? "#22c55e" : months >= 3 ? "#eab308" : "#ef4444";
  const band = cfPositive ? "Cash-flow positive - burning nothing"
    : months >= 6 ? "Comfortable - 6+ months of cover"
    : months >= 3 ? "Tight - rebuild buffer toward 6 months"
    : "Critical - under 3 months, act now";

  return (
    <section id="health-runway-gauge" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Timer size={15} className="text-[var(--color-primary)]" /> Cash-Runway Gauge</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Months of survival at your current burn rate. The healthy band is 6+ months of operating cover; below 3 months is the danger zone.
      </p>
      <div className="flex items-center gap-8 flex-wrap justify-center sm:justify-start">
        <div className="relative w-[180px] h-[100px] shrink-0">
          <svg viewBox="0 0 180 100" className="w-full h-full">
            <path d="M 20 95 A 70 70 0 0 1 160 95" fill="none" stroke="var(--color-border)" strokeWidth="12" strokeLinecap="round" />
            <path d="M 20 95 A 70 70 0 0 1 160 95" fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
            <span className="text-3xl font-bold tabular-nums" style={{ color: stroke }}>{cfPositive ? "∞" : months.toFixed(1)}</span>
            <span className="text-[10px] text-[var(--color-muted)]">months of runway</span>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] space-y-3">
          <p className="text-sm font-semibold" style={{ color: stroke }}>{band}</p>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Cash on hand" value={formatAmount(snap.cash)} />
            <MetricCard label="Daily burn" value={cfPositive ? "₹0" : formatAmount(dailyBurn)} />
            <MetricCard label="Monthly net" value={formatAmount(snap.monthlyNet)} ok={snap.monthlyNet >= 0} />
            <MetricCard label="Runway days" value={cfPositive ? "CF positive" : `${snap.runwayDays} days`} ok={cfPositive || snap.runwayDays >= 90} />
          </div>
          <button onClick={() => navigate("/forecast")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1">
            Extend runway in forecast <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── #162 DISTRESS EARLY-WARNING CHECKLIST - red flags lenders watch ──────────────
// Eight live red-flag tests; the count of triggered flags maps to a warning level.
function EarlyWarning({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const flags: { label: string; bad: boolean; detail: string; path: string }[] = useMemo(() => {
    const overduePct = snap.accountsReceivable > 0 ? (snap.overdueReceivable / snap.accountsReceivable) * 100 : 0;
    return [
      { label: "Negative operating cash flow", bad: snap.monthlyNet < 0, detail: `Monthly net ${formatAmount(snap.monthlyNet)}`, path: "/forecast" },
      { label: "Runway under 90 days", bad: snap.runwayDays < 90, detail: snap.runwayDays >= 999 ? "CF positive" : `${snap.runwayDays} days left`, path: "/forecast" },
      { label: "DSCR below 1.25x", bad: snap.dscr !== null && snap.dscr < 1.25, detail: snap.dscr !== null ? `${snap.dscr.toFixed(2)}x` : "No debt", path: "/debt" },
      { label: "Current ratio below 1.0x", bad: snap.currentRatio !== null && snap.currentRatio < 1, detail: snap.currentRatio !== null ? `${snap.currentRatio.toFixed(2)}x` : "-", path: "/working-capital" },
      { label: "Over 40% receivables overdue", bad: overduePct > 40, detail: `${overduePct.toFixed(0)}% overdue`, path: "/receivables" },
      { label: "Customer concentration over 40%", bad: snap.topCustomerPct > 40, detail: `Top customer ${snap.topCustomerPct.toFixed(0)}%`, path: "/invoices" },
      { label: "Cash-conversion cycle over 75 days", bad: snap.cccDays > 75, detail: `${snap.cccDays} days`, path: "/working-capital" },
      { label: "Negative net working capital", bad: snap.netWorkingCapital < 0, detail: formatAmount(snap.netWorkingCapital), path: "/working-capital" },
    ];
  }, [snap]);

  const triggered = flags.filter(f => f.bad).length;
  const level = triggered === 0
    ? { label: "All clear - no distress flags raised", color: "text-green-400", border: "border-green-800/40", bg: "bg-green-900/20", Icon: CheckCircle2 }
    : triggered <= 2
    ? { label: `${triggered} early warning${triggered > 1 ? "s" : ""} - monitor`, color: "text-yellow-400", border: "border-yellow-800/40", bg: "bg-yellow-900/20", Icon: AlertTriangle }
    : { label: `${triggered} red flags raised - intervene`, color: "text-red-400", border: "border-red-800/40", bg: "bg-red-900/20", Icon: Siren };

  return (
    <section id="health-early-warning" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Siren size={15} className="text-[var(--color-primary)]" /> Distress Early-Warning Checklist</p>
      <p className="text-xs text-[var(--color-muted)] mb-4">
        Eight red flags lenders and auditors watch for, evaluated live. The more that trip, the closer the business is to a liquidity or solvency event.
      </p>
      <div className={`rounded-lg p-3 border ${level.border} ${level.bg} flex items-center gap-2 mb-4`}>
        <level.Icon size={16} className={`${level.color} shrink-0`} />
        <p className={`text-sm font-semibold ${level.color}`}>{level.label}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {flags.map(f => (
          <button key={f.label} onClick={() => navigate(f.path)}
            className="text-left flex items-start gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-primary)]/40 transition-colors">
            {f.bad ? <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className={`text-xs font-medium ${f.bad ? "text-red-400" : ""}`}>{f.label}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{f.detail}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── #155 LIQUIDITY STRESS TEST - survive-a-shock simulation ──────────────────────
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
    ? { label: "Fails the stress test - would breach safety buffer", color: "text-red-400", border: "border-red-800/40", bg: "bg-red-900/20", Icon: AlertTriangle }
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
        Survive-a-shock simulation. Drag the levers to model a downturn - falling sales, customers who stop paying, rising input costs - and see how many days of runway you would have left and whether you breach your cash safety buffer.
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

// ── #156 FINANCIAL FITNESS TREND - health score over time + drivers ──────────────
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
  const topDriver = sorted[0]?.label ?? "-";
  const topDrag   = sorted[sorted.length - 1]?.label ?? "-";

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

// ── #154 ALTMAN Z' SCORE - distress / bankruptcy-risk indicator ──────────────────
// Altman Z' for private manufacturers/SMBs:
//   Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5
// X1 working-capital/assets, X2 retained-earnings/assets, X3 EBIT/assets,
// X4 equity/liabilities, X5 sales/assets. Bands: >2.9 safe · 1.23-2.9 grey · <1.23 distress.
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
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={15} className="text-[var(--color-primary)]" /> Altman Z' Score - Distress Indicator</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Used by lenders worldwide to predict insolvency risk. Z' &gt; 2.9 = safe, 1.23-2.9 = grey zone, &lt; 1.23 = distress. Values derived from transaction proxies - connect all accounts for best accuracy.
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

// ── #163 CASH-FLOW COVERAGE - can operating cash cover all fixed claims? ──────────
// Tests whether monthly operating cash flow covers each layer of fixed claims -
// interest, full debt service, then debt service plus a tax accrual. The tightest
// passing layer tells the owner how much fixed cost the cash engine can actually carry.
function CashFlowCoverage({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const opCash    = snap.monthlyNet + snap.monthlyDebtService;   // pre-debt operating cash
    const taxAccrual = Math.max(0, snap.estAnnualProfit) * 0.25 / 12; // ~25% effective rate, monthly
    const intCov  = snap.monthlyInterest > 0 ? opCash / snap.monthlyInterest : null;
    const dsCov   = snap.monthlyDebtService > 0 ? opCash / snap.monthlyDebtService : null;
    const fixed   = snap.monthlyDebtService + taxAccrual;
    const fullCov = fixed > 0 ? opCash / fixed : null;
    return { opCash, taxAccrual, intCov, dsCov, fullCov, fixed };
  }, [snap]);

  const layers: { label: string; value: number | null; target: number; desc: string }[] = [
    { label: "Interest coverage", value: m.intCov, target: 3, desc: "Operating cash ÷ monthly interest" },
    { label: "Debt-service coverage", value: m.dsCov, target: 1.25, desc: "Operating cash ÷ EMI (principal + interest)" },
    { label: "Debt + tax coverage", value: m.fullCov, target: 1, desc: "Operating cash ÷ (EMI + tax accrual)" },
  ];
  const passing = layers.filter(l => l.value === null || l.value >= l.target).length;
  const allClear = passing === layers.length;

  return (
    <section id="health-cf-coverage" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold flex items-center gap-2"><HandCoins size={15} className="text-[var(--color-primary)]" /> Cash-Flow Coverage</p>
        <span className={`text-xs font-semibold flex items-center gap-1 ${allClear ? "text-green-400" : "text-red-400"}`}>
          {allClear ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {passing}/{layers.length} layers covered
        </span>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        How comfortably your monthly operating cash covers each layer of fixed claims - interest, full EMI, then EMI plus a tax accrual. The tightest layer that still clears tells you the headroom in your cash engine.
      </p>
      <div className="space-y-4">
        {layers.map(l => {
          const noClaim = l.value === null;
          const ok = noClaim || l.value! >= l.target;
          const pct = noClaim ? 100 : Math.min(100, (l.value! / (l.target * 1.5)) * 100);
          return (
            <div key={l.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{l.label}</span>
                  <span className="text-[10px] text-[var(--color-muted)] ml-2">target ≥ {l.target.toFixed(2)}x</span>
                  <p className="text-[10px] text-[var(--color-muted)]">{l.desc}</p>
                </div>
                <span className={`text-lg font-bold tabular-nums shrink-0 ${ok ? "text-green-400" : "text-red-400"}`}>
                  {noClaim ? "n/a" : `${l.value!.toFixed(2)}x`}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${ok ? "bg-green-500" : l.value! >= l.target * 0.66 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
        <MetricCard label="Operating cash / mo" value={formatAmount(m.opCash)} ok={m.opCash >= 0} />
        <MetricCard label="Fixed claims / mo" value={formatAmount(m.fixed)} />
        <MetricCard label="Tax accrual / mo (est.)" value={formatAmount(m.taxAccrual)} />
      </div>
      <button onClick={() => navigate("/debt")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Review debt obligations <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #164 MARGIN STABILITY SCORE - how consistent monthly margins are ─────────────
// Volatile margins scare lenders even when the average is fine. This scores the
// month-to-month consistency of net margin using its coefficient of variation,
// then flags the best and worst month so the owner can chase the swing.
function MarginStability({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const pts = snap.months
      .filter(mo => mo.revenue > 0)
      .map(mo => ({ label: mo.label, margin: (mo.net / mo.revenue) * 100 }));
    if (pts.length < 2) return { score: null, mean: 0, cv: null, best: null, worst: null, range: 0, pts };
    const margins = pts.map(p => p.margin);
    const mean = margins.reduce((s, v) => s + v, 0) / margins.length;
    const variance = margins.reduce((s, v) => s + (v - mean) ** 2, 0) / margins.length;
    const sd = Math.sqrt(variance);
    const cv = Math.abs(mean) > 0.5 ? sd / Math.abs(mean) : sd / 0.5; // coefficient of variation
    const score = Math.round(Math.max(0, Math.min(100, 100 - cv * 100)));
    let best = pts[0], worst = pts[0];
    for (const p of pts) { if (p.margin > best.margin) best = p; if (p.margin < worst.margin) worst = p; }
    return { score, mean, cv, best, worst, range: best.margin - worst.margin, pts };
  }, [snap]);

  const ok = m.score !== null && m.score >= 60;

  return (
    <section id="health-margin-stability" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Ratio size={15} className="text-[var(--color-primary)]" /> Margin Stability Score</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Lenders trust steady margins more than high-but-erratic ones. This scores month-to-month consistency of your net margin (100 = rock-steady). Wide swings drag the score down even when the average looks healthy.
      </p>
      {m.score === null ? (
        <p className="text-xs text-[var(--color-muted)] py-6 text-center">Not enough revenue history yet - needs at least two months of sales.</p>
      ) : (
        <>
          <div className="flex items-center gap-6 flex-wrap mb-4">
            <div className={`rounded-xl px-6 py-4 border text-center shrink-0 ${ok ? "border-green-800/40 bg-green-900/20" : "border-yellow-800/40 bg-yellow-900/20"}`}>
              <p className="text-[10px] text-[var(--color-muted)] mb-1">Stability score</p>
              <p className={`text-4xl font-bold tabular-nums ${ok ? "text-green-400" : "text-yellow-400"}`}>{m.score}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">{ok ? "Steady margins" : "Volatile margins"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1 min-w-[220px]">
              <MetricCard label="Average net margin" value={`${m.mean.toFixed(1)}%`} ok={m.mean >= 10} />
              <MetricCard label="Variation (CV)" value={m.cv !== null ? `${(m.cv * 100).toFixed(0)}%` : "-"} note="lower is steadier" />
              <MetricCard label="Best month" value={m.best ? `${m.best.margin.toFixed(0)}%` : "-"} note={m.best ? m.best.label : ""} />
              <MetricCard label="Worst month" value={m.worst ? `${m.worst.margin.toFixed(0)}%` : "-"} note={m.worst ? m.worst.label : ""} />
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-20">
            {m.pts.map(p => {
              const h = Math.max(4, Math.min(100, (p.margin / Math.max(1, m.best!.margin)) * 100));
              const neg = p.margin < 0;
              return (
                <div key={p.label} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${p.label}: ${p.margin.toFixed(1)}%`}>
                  <div className={`w-full rounded-t ${neg ? "bg-red-500" : "bg-[var(--color-primary)]"}`} style={{ height: `${neg ? 6 : h}%` }} />
                  <span className="text-[9px] text-[var(--color-muted)]">{p.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <button onClick={() => navigate("/analytics")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Investigate margin swings <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #165 GROWTH QUALITY - is growth backed by cash, or just receivables? ─────────
// Revenue can rise while cash falls if sales pile up as uncollected receivables.
// This compares revenue growth against operating-cash growth and the share of
// revenue still locked in receivables, then grades whether growth is "cash-real".
function GrowthQuality({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const revGrowth = snap.revenueGrowthPct;                            // CMGR %
    const opCash    = snap.monthlyNet + snap.monthlyDebtService;
    // Accrual drag: how much of one month's revenue is still sitting in receivables.
    const arMonths  = snap.monthlyRevenue > 0 ? snap.accountsReceivable / snap.monthlyRevenue : 0;
    const cashConv  = snap.monthlyRevenue > 0 ? opCash / snap.monthlyRevenue : 0; // cash kept per ₹1 sales
    // Growth is "quality" when it's positive AND cash is converting AND AR isn't ballooning.
    const growthPos = (revGrowth ?? 0) > 0;
    const cashReal  = cashConv >= 0.05;
    const arHealthy = arMonths <= 1.5;
    const passes = [growthPos, cashReal, arHealthy].filter(Boolean).length;
    return { revGrowth, opCash, arMonths, cashConv, growthPos, cashReal, arHealthy, passes };
  }, [snap]);

  const verdict = m.passes === 3
    ? { label: "High-quality growth - backed by real cash", color: "text-green-400", border: "border-green-800/40", bg: "bg-green-900/20", Icon: CheckCircle2 }
    : m.passes === 2
    ? { label: "Mixed quality - watch the cash conversion", color: "text-yellow-400", border: "border-yellow-800/40", bg: "bg-yellow-900/20", Icon: AlertTriangle }
    : { label: "Low-quality growth - sales aren't turning into cash", color: "text-red-400", border: "border-red-800/40", bg: "bg-red-900/20", Icon: AlertTriangle };

  const tests: { label: string; ok: boolean; detail: string }[] = [
    { label: "Revenue is growing", ok: m.growthPos, detail: m.revGrowth !== null ? `${m.revGrowth.toFixed(1)}%/mo CMGR` : "Not enough history" },
    { label: "Sales convert to cash", ok: m.cashReal, detail: `${(m.cashConv * 100).toFixed(0)}% of revenue lands as operating cash` },
    { label: "Receivables under control", ok: m.arHealthy, detail: `${m.arMonths.toFixed(1)} months of revenue tied up in AR` },
  ];

  return (
    <section id="health-growth-quality" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><GitCompareArrows size={15} className="text-[var(--color-primary)]" /> Growth Quality - Cash vs Accrual</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Revenue can rise while cash falls if sales pile up as uncollected receivables. This checks whether growth is "cash-real": positive growth, sales converting to cash, and receivables that aren't ballooning.
      </p>
      <div className={`rounded-lg p-3 border ${verdict.border} ${verdict.bg} flex items-center gap-2 mb-4`}>
        <verdict.Icon size={16} className={`${verdict.color} shrink-0`} />
        <p className={`text-sm font-semibold ${verdict.color}`}>{verdict.label}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tests.map(t => (
          <div key={t.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 flex items-start gap-2">
            {t.ok ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" /> : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className={`text-xs font-medium ${t.ok ? "" : "text-red-400"}`}>{t.label}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{t.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
        <MetricCard label="Operating cash / mo" value={formatAmount(m.opCash)} ok={m.opCash >= 0} />
        <MetricCard label="Cash conversion" value={`${(m.cashConv * 100).toFixed(0)}%`} note="of revenue" />
        <MetricCard label="Revenue in receivables" value={`${m.arMonths.toFixed(1)} mo`} ok={m.arHealthy} />
      </div>
      <button onClick={() => navigate("/receivables")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Speed up collections <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #166 EXPENSE DISCIPLINE TREND - is the cost base growing faster than sales? ──
// Tracks the expense-to-revenue ratio month by month. Discipline slips when costs
// climb faster than revenue. Charts the ratio, flags the trend direction and
// estimates the rupee swing from the best month to the latest.
function ExpenseDiscipline({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const pts = snap.months
      .filter(mo => mo.revenue > 0)
      .map(mo => ({ label: mo.label, ratio: (mo.expense / mo.revenue) * 100, revenue: mo.revenue, expense: mo.expense }));
    if (pts.length < 2) return { pts, first: null, last: null, delta: 0, best: null, leakage: 0 };
    const first = pts[0], last = pts[pts.length - 1];
    let best = pts[0];
    for (const p of pts) { if (p.ratio < best.ratio) best = p; }
    const delta = last.ratio - first.ratio;
    // Rupee leakage: extra cost the latest month carries vs running at its best ratio.
    const leakage = Math.max(0, (last.ratio - best.ratio) / 100 * last.revenue);
    return { pts, first, last, delta, best, leakage };
  }, [snap]);

  const improving = m.delta < -1;
  const worsening = m.delta > 1;
  const TrendIcon = improving ? TrendingDown : worsening ? TrendingUp : Minus;
  const trendColor = improving ? "text-green-400" : worsening ? "text-red-400" : "text-[var(--color-muted)]";
  const maxRatio = m.pts.length ? Math.max(...m.pts.map(p => p.ratio), 100) : 100;

  return (
    <section id="health-expense-discipline" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold flex items-center gap-2"><Banknote size={15} className="text-[var(--color-primary)]" /> Expense Discipline Trend</p>
        {m.last && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${trendColor}`}>
            <TrendIcon size={13} /> {m.delta >= 0 ? "+" : ""}{m.delta.toFixed(0)} pts cost ratio
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        Your expense-to-revenue ratio over time. Discipline slips when costs climb faster than sales - a falling ratio is healthy. The gap to your best month shows recoverable cost leakage.
      </p>
      {m.first === null ? (
        <p className="text-xs text-[var(--color-muted)] py-6 text-center">Not enough revenue history yet - needs at least two months of sales.</p>
      ) : (
        <>
          <div className="flex items-end gap-1.5 h-24 mb-2">
            {m.pts.map(p => {
              const h = Math.max(4, Math.min(100, (p.ratio / maxRatio) * 100));
              const over = p.ratio >= 100;
              return (
                <div key={p.label} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${p.label}: ${p.ratio.toFixed(0)}% of revenue`}>
                  <span className="text-[9px] text-[var(--color-muted)] tabular-nums">{p.ratio.toFixed(0)}%</span>
                  <div className={`w-full rounded-t ${over ? "bg-red-500" : p.ratio >= 90 ? "bg-yellow-500" : "bg-green-500"}`} style={{ height: `${h}%` }} />
                  <span className="text-[9px] text-[var(--color-muted)]">{p.label}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <MetricCard label="Latest cost ratio" value={`${m.last!.ratio.toFixed(0)}%`} ok={m.last!.ratio < 90} />
            <MetricCard label="Best month" value={m.best ? `${m.best.ratio.toFixed(0)}%` : "-"} note={m.best ? m.best.label : ""} />
            <MetricCard label="Trend" value={improving ? "Improving" : worsening ? "Worsening" : "Flat"} note={`${m.delta >= 0 ? "+" : ""}${m.delta.toFixed(0)} pts`} />
            <MetricCard label="Cost leakage / mo" value={formatAmount(m.leakage)} note="vs best month" />
          </div>
        </>
      )}
      <button onClick={() => navigate("/analytics")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Break down the cost base <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #167 OVERALL RESILIENCE INDEX - one blended shock-absorption number ───────────
// Blends four survival pillars - cash buffer (runway), profitability cushion,
// leverage headroom and customer diversification - into a single 0-100 resilience
// index that answers "how well could this business absorb a shock?"
function ResilienceIndex({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const idx = useMemo(() => {
    const clampS = (v: number) => Math.max(0, Math.min(100, v));
    // Buffer: runway days → 6 months (180d) = full marks.
    const buffer = snap.runwayDays >= 999 ? 100 : clampS((snap.runwayDays / 180) * 100);
    // Profit cushion: net margin %, scaled so 20% margin = full marks.
    const margin = snap.grossMarginPct === null ? 50 : clampS(snap.grossMarginPct * 5);
    // Leverage headroom: DSCR vs 1.25x bar; no debt = strong.
    const leverage = snap.dscr === null ? 90 : clampS((snap.dscr / 1.25) * 60 + 25);
    // Diversification: penalise concentration above 15%.
    const diversify = clampS(100 - Math.max(0, (snap.topCustomerPct - 15) * 2));
    const score = Math.round(buffer * 0.35 + margin * 0.25 + leverage * 0.25 + diversify * 0.15);
    return { score, buffer, margin, leverage, diversify };
  }, [snap]);

  const band = idx.score >= 70
    ? { label: "Resilient - well-buffered against shocks", color: "text-green-400" }
    : idx.score >= 45
    ? { label: "Moderately resilient - thin in places", color: "text-yellow-400" }
    : { label: "Fragile - little cushion for a downturn", color: "text-red-400" };

  const pillars: { label: string; score: number; weight: number; path: string }[] = [
    { label: "Cash buffer (runway)", score: idx.buffer, weight: 35, path: "/forecast" },
    { label: "Profit cushion (margin)", score: idx.margin, weight: 25, path: "/analytics" },
    { label: "Leverage headroom (DSCR)", score: idx.leverage, weight: 25, path: "/debt" },
    { label: "Customer diversification", score: idx.diversify, weight: 15, path: "/invoices" },
  ];

  return (
    <section id="health-resilience" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Anchor size={15} className="text-[var(--color-primary)]" /> Overall Resilience Index</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        One blended number for shock-absorption, weighing cash buffer, profit cushion, leverage headroom and customer diversification. It answers a single question: how well could the business take a hit and keep going?
      </p>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="shrink-0 text-center">
          <ScoreRing score={idx.score} grade={idx.score >= 85 ? "A+" : idx.score >= 70 ? "A" : idx.score >= 55 ? "B" : idx.score >= 40 ? "C" : "D"} />
          <p className={`text-xs font-semibold mt-1 max-w-[176px] ${band.color}`}>{band.label}</p>
        </div>
        <div className="flex-1 min-w-[240px] space-y-3">
          {pillars.map(p => (
            <button key={p.label} onClick={() => navigate(p.path)} className="w-full text-left group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{p.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[var(--color-muted)]">{p.weight}% weight</span>
                  <span className={`text-xs font-bold tabular-nums ${scoreColor(p.score)}`}>{Math.round(p.score)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor(p.score)}`} style={{ width: `${p.score}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── #168 QUICK-RATIO GAUGE - acid-test liquidity on a banded dial ─────────────────
// The quick (acid-test) ratio strips inventory out of current assets to ask the
// harshest near-term question: can you cover short-term liabilities from cash and
// receivables alone? Plotted on a 0-2x dial with the standard 1.0x safety bar.
function QuickRatioGauge({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const [showWhy, setShowWhy] = useState(false);
  const q = snap.quickRatio;
  const pct = q === null ? 0 : Math.max(0, Math.min(100, (q / 2) * 100));
  const band = q === null
    ? { label: "No liability data yet", color: "text-[var(--color-muted)]", bar: "bg-[var(--color-border)]" }
    : q >= 1
    ? { label: "Healthy - can settle short-term dues without selling stock", color: "text-green-400", bar: "bg-green-500" }
    : q >= 0.7
    ? { label: "Tight - a slow collection month could squeeze you", color: "text-yellow-400", bar: "bg-yellow-500" }
    : { label: "Strained - liquid assets fall short of near-term claims", color: "text-red-400", bar: "bg-red-500" };

  return (
    <section id="health-quick-ratio-gauge" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <p className="text-sm font-semibold flex items-center gap-2"><Gauge size={15} className="text-[var(--color-primary)]" /> Quick-Ratio Gauge</p>
        <button onClick={() => setShowWhy(v => !v)} className="text-[10px] text-[var(--color-primary)] hover:underline">{showWhy ? "Hide" : "Why it matters"}</button>
      </div>
      <p className="text-xs text-[var(--color-muted)] mb-4">
        The acid test: cash plus receivables versus current liabilities, with inventory excluded. Lenders read it as your ability to pay this quarter's bills under stress.
      </p>
      {showWhy && (
        <p className="text-[11px] text-[var(--color-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2.5 mb-4">
          Inventory can take weeks to sell and may fetch less than its book value, so banks discount it entirely when judging short-term survival. A quick ratio below 1.0x means you would need to liquidate stock or borrow to clear immediate dues.
        </p>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[var(--color-muted)]">0x</span>
        <span className={`text-3xl font-bold tabular-nums ${band.color}`}>{q === null ? "-" : `${q.toFixed(2)}x`}</span>
        <span className="text-[10px] text-[var(--color-muted)]">2x+</span>
      </div>
      <div className="relative h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full transition-all ${band.bar}`} style={{ width: `${pct}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-[var(--color-text)]/60" style={{ left: "50%" }} title="1.0x safety bar" />
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mb-3">Marker = 1.0x safety bar</p>
      <p className={`text-xs font-medium mb-4 ${band.color}`}>{band.label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Quick ratio" value={q === null ? "-" : `${q.toFixed(2)}x`} target="≥ 1.0x" ok={q === null || q >= 1} />
        <MetricCard label="Current ratio" value={snap.currentRatio === null ? "-" : `${snap.currentRatio.toFixed(2)}x`} note="incl. inventory" />
        <MetricCard label="Cash on hand" value={formatAmount(snap.cash)} />
      </div>
      <button onClick={() => navigate("/working-capital")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Free up working capital <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #169 DEBT-BURDEN INDEX - how heavily debt weighs on monthly cash ──────────────
// Blends three leverage strains - debt service as a share of revenue, DSCR headroom
// and interest coverage - into one 0-100 burden index. High score = light burden.
function DebtBurdenIndex({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const clampS = (v: number) => Math.max(0, Math.min(100, v));
    const dsrPct = snap.monthlyRevenue > 0 ? (snap.monthlyDebtService / snap.monthlyRevenue) * 100 : 0;
    // Debt-service ratio: 0% = full marks, 25%+ of revenue = zero.
    const dsrScore = snap.monthlyDebtService === 0 ? 100 : clampS(100 - dsrPct * 4);
    // DSCR vs 1.25x bar.
    const dscrScore = snap.dscr === null ? 100 : clampS((snap.dscr / 1.25) * 60 + 25);
    // Interest coverage vs 3x bar.
    const icScore = snap.interestCoverage === null ? 100 : clampS((snap.interestCoverage / 3) * 70 + 15);
    const score = Math.round(dsrScore * 0.4 + dscrScore * 0.35 + icScore * 0.25);
    return { score, dsrPct, dsrScore, dscrScore, icScore };
  }, [snap]);

  const band = snap.monthlyDebtService === 0
    ? { label: "Debt-free - no servicing burden", color: "text-green-400" }
    : m.score >= 70
    ? { label: "Light - debt sits comfortably within cash flow", color: "text-green-400" }
    : m.score >= 45
    ? { label: "Moderate - manageable but watch new borrowing", color: "text-yellow-400" }
    : { label: "Heavy - debt is crowding out operating cash", color: "text-red-400" };

  const rows: { label: string; score: number; weight: number; note: string }[] = [
    { label: "Debt service vs revenue", score: m.dsrScore, weight: 40, note: `${m.dsrPct.toFixed(0)}% of revenue` },
    { label: "DSCR headroom", score: m.dscrScore, weight: 35, note: snap.dscr === null ? "no debt" : `${snap.dscr.toFixed(2)}x` },
    { label: "Interest coverage", score: m.icScore, weight: 25, note: snap.interestCoverage === null ? "no debt" : `${snap.interestCoverage.toFixed(1)}x` },
  ];

  return (
    <section id="health-debt-burden" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={15} className="text-[var(--color-primary)]" /> Debt-Burden Index</p>
      <p className="text-xs text-[var(--color-muted)] mb-5">
        One number for how heavily borrowing weighs on your month, blending debt service as a share of revenue with DSCR and interest-coverage headroom. A high index means debt is light relative to the cash you generate.
      </p>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="shrink-0 text-center">
          <ScoreRing score={m.score} grade={m.score >= 85 ? "A+" : m.score >= 70 ? "A" : m.score >= 55 ? "B" : m.score >= 40 ? "C" : "D"} />
          <p className={`text-xs font-semibold mt-1 max-w-[176px] ${band.color}`}>{band.label}</p>
        </div>
        <div className="flex-1 min-w-[240px] space-y-3">
          {rows.map(r => (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{r.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[var(--color-muted)]">{r.note} · {r.weight}%</span>
                  <span className={`text-xs font-bold tabular-nums ${scoreColor(r.score)}`}>{Math.round(r.score)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor(r.score)}`} style={{ width: `${r.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => navigate("/debt")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-4">
        Review the debt stack <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #170 CASH-BUFFER MONTHS - survival window at current burn ──────────────────────
// Translates runway into the metric owners and boards actually track: how many
// months of operating expenses sit in the bank. Banded against a 3-month resilience
// floor and a 6-month comfort target.
function CashBufferMonths({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    const monthlyExpense = snap.monthlyExpense;
    const cfPositive = snap.monthlyNet >= 0;
    const months = monthlyExpense > 0 ? snap.cash / monthlyExpense : null;
    // Burn-based months: only the net cash outflow matters; when CF positive there is no drain.
    const burnMonths = cfPositive ? null : snap.cash / (-snap.monthlyNet);
    return { months, burnMonths, cfPositive, monthlyExpense };
  }, [snap]);

  const score = m.months === null ? 0 : Math.max(0, Math.min(100, (m.months / 6) * 100));
  const band = m.months === null
    ? { label: "No expense history yet", color: "text-[var(--color-muted)]" }
    : m.months >= 6
    ? { label: "Comfortable - over six months of expenses covered", color: "text-green-400" }
    : m.months >= 3
    ? { label: "Adequate - past the three-month resilience floor", color: "text-yellow-400" }
    : { label: "Thin - under three months of cover is fragile", color: "text-red-400" };

  return (
    <section id="health-cash-buffer" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><PiggyBank size={15} className="text-[var(--color-primary)]" /> Cash-Buffer Months</p>
      <p className="text-xs text-[var(--color-muted)] mb-4">
        How many months of total operating expenses your current bank balance would cover. The board-room view of runway, banded against a three-month resilience floor and a six-month comfort target.
      </p>
      <div className="flex items-baseline gap-3 mb-2">
        <span className={`text-4xl font-bold tabular-nums ${band.color}`}>{m.months === null ? "-" : m.months.toFixed(1)}</span>
        <span className="text-xs text-[var(--color-muted)]">months of expenses in the bank</span>
      </div>
      <div className="relative h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full transition-all ${score >= 50 ? "bg-green-500" : score >= 25 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-[var(--color-text)]/40" style={{ left: "50%" }} title="3-month floor" />
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mb-3">Marker = 3-month floor · full bar = 6 months</p>
      <p className={`text-xs font-medium mb-4 ${band.color}`}>{band.label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Cash on hand" value={formatAmount(snap.cash)} />
        <MetricCard label="Monthly expenses" value={formatAmount(m.monthlyExpense)} />
        <MetricCard label="Months covered" value={m.months === null ? "-" : `${m.months.toFixed(1)}`} target="≥ 3" ok={m.months !== null && m.months >= 3} />
        <MetricCard label="At current burn" value={m.cfPositive ? "CF positive" : m.burnMonths !== null ? `${m.burnMonths.toFixed(1)} mo` : "-"} ok={m.cfPositive || (m.burnMonths !== null && m.burnMonths >= 3)} />
      </div>
      <button onClick={() => navigate("/forecast")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-3">
        Project the buffer forward <ArrowRight size={11} />
      </button>
    </section>
  );
}

// ── #171 REVENUE-DIVERSIFICATION INDEX - concentration risk on a 0-100 scale ───────
// Converts the customer-revenue HHI into an intuitive diversification score and
// flags the dependency on the single largest account. Low diversification means one
// lost customer could break the business.
function RevenueDiversification({ snap }: { snap: FinancialSnapshot }) {
  const navigate = useNavigate();
  const m = useMemo(() => {
    // HHI ranges ~1000 (well spread) to 10000 (single customer). Invert to a score.
    const hhi = snap.customerHhi;
    const score = hhi <= 0 ? null : Math.max(0, Math.min(100, Math.round(100 - ((hhi - 1000) / 9000) * 100)));
    // Effective number of customers ≈ 1 / sum(share^2) = 10000 / HHI.
    const effective = hhi > 0 ? 10000 / hhi : null;
    return { hhi, score, effective };
  }, [snap]);

  const band = m.score === null
    ? { label: "No customer revenue data yet", color: "text-[var(--color-muted)]" }
    : m.score >= 70
    ? { label: "Well spread - no single account dominates", color: "text-green-400" }
    : m.score >= 45
    ? { label: "Some concentration - a few accounts carry the load", color: "text-yellow-400" }
    : { label: "Concentrated - losing one customer would hurt badly", color: "text-red-400" };

  const topOk = snap.topCustomerPct <= 30;

  return (
    <section id="health-revenue-diversification" className="scroll-mt-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Users size={15} className="text-[var(--color-primary)]" /> Revenue-Diversification Index</p>
      <p className="text-xs text-[var(--color-muted)] mb-4">
        How evenly your revenue is spread across customers, derived from the Herfindahl concentration index. A high score means no single account can sink you; a low score is a hidden single-point-of-failure risk lenders probe for.
      </p>
      <div className="flex items-center gap-6 flex-wrap">
        <div className="shrink-0 text-center">
          <ScoreRing score={m.score ?? 0} grade={m.score === null ? "-" : m.score >= 85 ? "A+" : m.score >= 70 ? "A" : m.score >= 55 ? "B" : m.score >= 40 ? "C" : "D"} />
          <p className={`text-xs font-semibold mt-1 max-w-[176px] ${band.color}`}>{band.label}</p>
        </div>
        <div className="flex-1 min-w-[240px] grid grid-cols-2 gap-3">
          <MetricCard label="Top-customer share" value={`${snap.topCustomerPct.toFixed(0)}%`} target="≤ 30%" ok={topOk} />
          <MetricCard label="Concentration (HHI)" value={m.hhi > 0 ? `${Math.round(m.hhi)}` : "-"} note="lower is safer" />
          <MetricCard label="Effective customers" value={m.effective !== null ? m.effective.toFixed(1) : "-"} note="equal-weight equivalent" />
          <MetricCard label="Diversification" value={m.score === null ? "-" : `${m.score}/100`} ok={m.score !== null && m.score >= 60} />
        </div>
      </div>
      <button onClick={() => navigate("/invoices")} className="w-full text-xs text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1 py-1 mt-4">
        See customer revenue mix <ArrowRight size={11} />
      </button>
    </section>
  );
}
