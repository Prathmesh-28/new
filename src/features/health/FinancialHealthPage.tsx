import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot } from "@/lib/finance";
import { formatAmount } from "@/lib/utils";
import {
  HeartPulse, ArrowRight, TrendingUp, Droplets, Receipt, Scale,
  Users, ShieldCheck, PiggyBank, Landmark,
} from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from "recharts";

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

  // ── Altman Z' Score (private firms) ──────────────────────────────────────────
  const estimatedFA     = snap.monthlyRevenue * 6;
  const totalAssets     = snap.cash + snap.accountsReceivable + snap.inventoryValue + estimatedFA;
  const totalLiab       = snap.debtOutstanding + snap.accountsPayable + snap.obligationsDue90;
  const retainedEarnings = Math.max(0, snap.monthlyNet * 12);
  const ebitAnnual      = (snap.monthlyNet + snap.monthlyInterest) * 12;
  const bookEquity      = Math.max(0, totalAssets - totalLiab);
  const zx1 = totalAssets > 0 ? snap.netWorkingCapital / totalAssets : 0;
  const zx2 = totalAssets > 0 ? retainedEarnings / totalAssets : 0;
  const zx3 = totalAssets > 0 ? ebitAnnual / totalAssets : 0;
  const zx4 = totalLiab  > 0 ? bookEquity / totalLiab : 3;
  const zx5 = totalAssets > 0 ? snap.monthlyRevenue * 12 / totalAssets : 0;
  const altmanZ = parseFloat((0.717 * zx1 + 0.847 * zx2 + 3.107 * zx3 + 0.420 * zx4 + 0.998 * zx5).toFixed(2));
  const altmanZone = altmanZ > 2.9
    ? { label: "Safe Zone · Low Distress Risk",  color: "text-green-400",  border: "border-green-800/40",  bg: "bg-green-900/20"  }
    : altmanZ > 1.23
    ? { label: "Grey Zone · Monitor Closely",    color: "text-yellow-400", border: "border-yellow-800/40", bg: "bg-yellow-900/20" }
    : { label: "Distress Zone · Act Now",        color: "text-red-400",    border: "border-red-800/40",    bg: "bg-red-900/20"    };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><HeartPulse size={18} className="text-[var(--color-primary)]" /> Financial Health</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          One composite score from cash, receivables, debt, growth and compliance — recomputed live from every module.
        </p>
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

      {/* Altman Z' Score */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-1">Altman Z' Score — Bankruptcy Risk Predictor</p>
        <p className="text-xs text-[var(--color-muted)] mb-5">
          Used by lenders worldwide to assess insolvency risk. Z' &gt; 2.9 = safe, 1.23–2.9 = grey zone, &lt; 1.23 = distress. Values derived from transaction proxies — connect all accounts for best accuracy.
        </p>
        <div className="flex items-start gap-6 flex-wrap">
          <div className={`rounded-xl px-7 py-5 border ${altmanZone.border} ${altmanZone.bg} shrink-0 text-center`}>
            <p className="text-[10px] text-[var(--color-muted)] mb-1.5">Your Z' Score</p>
            <p className={`text-5xl font-bold tabular-nums ${altmanZone.color}`}>{altmanZ}</p>
            <p className={`text-xs font-semibold mt-2 ${altmanZone.color}`}>{altmanZone.label}</p>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {([
              { label: "X1 · Working Capital / Total Assets",    value: zx1, coef: 0.717, note: "Short-term liquidity buffer"          },
              { label: "X2 · Retained Earnings / Total Assets",  value: zx2, coef: 0.847, note: "Accumulated profitability & age"      },
              { label: "X3 · EBIT / Total Assets",               value: zx3, coef: 3.107, note: "Operating efficiency (highest weight)" },
              { label: "X4 · Equity / Total Liabilities",        value: zx4, coef: 0.420, note: "Leverage buffer (∞ if no debt)"       },
              { label: "X5 · Revenue / Total Assets",            value: zx5, coef: 0.998, note: "Asset utilisation rate"               },
            ] as { label: string; value: number; coef: number; note: string }[]).map(row => (
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
              <span className={`text-sm font-bold tabular-nums ${altmanZone.color}`}>{altmanZ}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
