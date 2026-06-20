import { useState } from "react";
import type { Transaction } from "@/data/types";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, monthlyBurn } from "@/lib/utils";
import { percentiles, cmgr, dso, dio, dpo, gstSummary } from "@/lib/finance";
import { BarChart3, TrendingUp, TrendingDown, Minus, Award, AlertTriangle, ChevronDown, Info, Scale, PieChart, Gauge, Recycle, Percent, Receipt, UsersRound, Activity, Building2, Boxes, Coins, Layers, Waves, Wallet, Landmark, SlidersHorizontal, Banknote, Timer, HeartHandshake } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

const SECTORS = [
  "Manufacturing (SMB)",
  "Retail & Distribution",
  "IT Services",
  "Construction",
  "Food & Beverage",
  "Healthcare Clinic",
  "Professional Services",
  "Textiles & Apparel",
  "Logistics & Transport",
  "E-commerce",
];

type BenchmarkMetric = {
  key: string;
  label: string;
  unit: string;
  description: string;
  yours: number | null;
  p25: number;
  p50: number;
  p75: number;
  higherIsBetter: boolean;
  source?: "self" | "sector";
};

const SECTOR_DATA: Record<string, BenchmarkMetric[]> = {
  default: [
    { key: "gross_margin",   label: "Gross Margin",        unit: "%",   description: "Revenue minus direct costs, as % of revenue",       yours: null, p25: 22, p50: 31, p75: 42, higherIsBetter: true  },
    { key: "runway",         label: "Cash Runway",          unit: "days",description: "Months of operating expenses in cash",              yours: null, p25: 45, p50: 78, p75: 120,higherIsBetter: true  },
    { key: "ar_days",        label: "AR Days",              unit: "days",description: "Average days to collect from customers",            yours: null, p25: 62, p50: 42, p75: 28, higherIsBetter: false },
    { key: "payroll_ratio",  label: "Payroll / Revenue",    unit: "%",   description: "Monthly payroll as % of revenue",                   yours: null, p25: 45, p50: 32, p75: 22, higherIsBetter: false },
    { key: "revenue_growth", label: "Revenue Growth (MoM)", unit: "%",   description: "Month-over-month revenue growth rate",              yours: null, p25: 2,  p50: 5,  p75: 10, higherIsBetter: true  },
    { key: "burn_multiple",  label: "Burn Multiple",        unit: "x",   description: "Burn / Net New Revenue — efficiency of spending",   yours: null, p25: 2.8, p50: 1.8, p75: 1.1, higherIsBetter: false },
  ],
  "Manufacturing (SMB)": [
    { key: "gross_margin",   label: "Gross Margin",        unit: "%",   description: "Revenue minus COGS",                                yours: null, p25: 18, p50: 26, p75: 36, higherIsBetter: true  },
    { key: "runway",         label: "Cash Runway",          unit: "days",description: "Operating cash buffer",                             yours: null, p25: 30, p50: 60, p75: 110,higherIsBetter: true  },
    { key: "ar_days",        label: "AR Days",              unit: "days",description: "Customer collection speed",                        yours: null, p25: 75, p50: 52, p75: 32, higherIsBetter: false },
    { key: "payroll_ratio",  label: "Payroll / Revenue",    unit: "%",   description: "Wages as % of revenue",                             yours: null, p25: 38, p50: 28, p75: 18, higherIsBetter: false },
    { key: "revenue_growth", label: "Revenue Growth (MoM)", unit: "%",   description: "Month-over-month growth",                           yours: null, p25: 1,  p50: 3,  p75: 7,  higherIsBetter: true  },
    { key: "burn_multiple",  label: "Burn Multiple",        unit: "x",   description: "Efficiency of spend vs new revenue",                yours: null, p25: 3.2, p50: 2.0, p75: 1.2, higherIsBetter: false },
  ],
  "IT Services": [
    { key: "gross_margin",   label: "Gross Margin",        unit: "%",   description: "Revenue minus delivery costs",                      yours: null, p25: 38, p50: 52, p75: 68, higherIsBetter: true  },
    { key: "runway",         label: "Cash Runway",          unit: "days",description: "Operating cash buffer",                             yours: null, p25: 60, p50: 95, p75: 150,higherIsBetter: true  },
    { key: "ar_days",        label: "AR Days",              unit: "days",description: "Invoice to payment",                                yours: null, p25: 55, p50: 38, p75: 22, higherIsBetter: false },
    { key: "payroll_ratio",  label: "Payroll / Revenue",    unit: "%",   description: "Team cost as % of revenue",                         yours: null, p25: 55, p50: 42, p75: 32, higherIsBetter: false },
    { key: "revenue_growth", label: "Revenue Growth (MoM)", unit: "%",   description: "Month-over-month growth",                           yours: null, p25: 3,  p50: 6,  p75: 14, higherIsBetter: true  },
    { key: "burn_multiple",  label: "Burn Multiple",        unit: "x",   description: "Efficiency of spend vs new revenue",                yours: null, p25: 2.2, p50: 1.4, p75: 0.9, higherIsBetter: false },
  ],
};

function getPercentile(value: number, p25: number, p50: number, p75: number, higherIsBetter: boolean): number {
  if (higherIsBetter) {
    if (value >= p75) return 90;
    if (value >= p50) return 65;
    if (value >= p25) return 40;
    return 20;
  } else {
    if (value <= p75) return 90;
    if (value <= p50) return 65;
    if (value <= p25) return 40;
    return 20;
  }
}

function getLabel(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: "Top quartile",   color: "text-green-400" };
  if (pct >= 50) return { label: "Above median",   color: "text-[var(--color-primary)]" };
  if (pct >= 30) return { label: "Below median",   color: "text-yellow-400" };
  return                { label: "Bottom quartile",color: "text-red-400" };
}

type BmTab = "overview" | "ratios" | "cost-structure" | "growth-percentile" | "working-capital"
  | "profitability-percentile" | "expense-ratio" | "productivity" | "digital-maturity"
  | "valuation-multiple" | "stock-turn" | "tax-burden"
  | "ebitda-margin" | "revenue-volatility" | "liquidity-buffer" | "debt-leverage" | "opex-efficiency"
  | "net-margin" | "cash-runway" | "customer-retention";

export default function BenchmarksPage() {
  const { store }    = useApp();
  const { transactions, bankAccounts } = store;

  const [bmTab, setBmTab] = useState<BmTab>("overview");
  const [sector, setSector] = useState("Manufacturing (SMB)");
  const [showSector, setShowSector] = useState(false);

  const burn    = monthlyBurn(transactions);
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const runway  = burn > 0 ? Math.round(balance / (burn / 30)) : 0;

  const now  = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const lastMDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastM = `${lastMDate.getFullYear()}-${String(lastMDate.getMonth()+1).padStart(2,"0")}`;
  const thisRev = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
  const lastRev = transactions.filter(t => t.date.startsWith(lastM) && t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
  const thisCost = Math.abs(transactions.filter(t => t.date.startsWith(thisM) && t.amount < 0 && t.category !== "payroll").reduce((s, t) => s + t.amount, 0));
  const payroll  = Math.abs(transactions.filter(t => t.date.startsWith(thisM) && t.category === "payroll").reduce((s, t) => s + t.amount, 0));

  const grossMargin = thisRev > 0 ? Math.round(((thisRev - thisCost) / thisRev) * 100) : null;
  const revGrowth   = lastRev > 0 ? parseFloat(((thisRev - lastRev) / lastRev * 100).toFixed(1)) : null;
  const payrollRatio= thisRev > 0 ? Math.round((payroll / thisRev) * 100) : null;
  const burnMultiple= thisRev > lastRev ? parseFloat((burn / Math.max(1, thisRev - lastRev)).toFixed(1)) : null;

  // ── Real self-benchmarks: the tenant's OWN trailing-12-month quartiles ────────
  // For metrics with a monthly series we compute genuine P25/P50/P75 from history,
  // so "your position" is measured against your own typical months — not invented
  // peer data. Metrics without a clean monthly series keep the sector reference.
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const selfRanges = (() => {
    const gm: number[] = [], pr: number[] = [], rg: number[] = [];
    let prevRev = 0;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mt = transactions.filter(t => t.date.startsWith(k));
      const rev = mt.filter(t => t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
      const cost = Math.abs(mt.filter(t => t.amount < 0 && t.category !== "payroll").reduce((s, t) => s + t.amount, 0));
      const pay = Math.abs(mt.filter(t => t.category === "payroll").reduce((s, t) => s + t.amount, 0));
      if (rev > 0) {
        gm.push(((rev - cost) / rev) * 100);
        pr.push((pay / rev) * 100);
        if (prevRev > 0) rg.push(((rev - prevRev) / prevRev) * 100);
        prevRev = rev;
      }
    }
    return {
      gross_margin:   percentiles(gm),
      payroll_ratio:  percentiles(pr),
      revenue_growth: percentiles(rg),
    } as Record<string, { p25: number; p50: number; p75: number } | null>;
  })();

  const baseBenchmarks = SECTOR_DATA[sector] ?? SECTOR_DATA["default"];
  const metrics: BenchmarkMetric[] = baseBenchmarks.map(m => {
    const yours = m.key === "gross_margin"   ? grossMargin
         : m.key === "runway"          ? (runway || null)
         : m.key === "revenue_growth"  ? revGrowth
         : m.key === "payroll_ratio"   ? payrollRatio
         : m.key === "burn_multiple"   ? burnMultiple
         : null;
    const sr = selfRanges[m.key];
    if (sr) {
      // For "higher is better" the p75 column is the best (high); for "lower is
      // better" the page's convention puts the best (low) value in the p75 column.
      const [p25, p50, p75] = m.higherIsBetter
        ? [r1(sr.p25), r1(sr.p50), r1(sr.p75)]
        : [r1(sr.p75), r1(sr.p50), r1(sr.p25)];
      return { ...m, yours, p25, p50, p75, source: "self" as const };
    }
    return { ...m, yours, source: "sector" as const };
  });

  const usingSelf = metrics.some(m => m.source === "self");
  const hasData = balance > 0 || transactions.length > 0;

  const radarData = metrics.map(m => ({
    subject: m.label.replace(" (MoM)", ""),
    yours: m.yours !== null
      ? getPercentile(m.yours, m.p25, m.p50, m.p75, m.higherIsBetter)
      : 50,
    median: 50,
  }));

  const scored = metrics.filter(m => m.yours !== null);
  const overallPct = scored.length > 0
    ? Math.round(scored.reduce((s, m) => s + getPercentile(m.yours!, m.p25, m.p50, m.p75, m.higherIsBetter), 0) / scored.length)
    : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Award size={20} className="text-[var(--color-primary)]" />
            Benchmarks
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {usingSelf
              ? "Gross margin, payroll and growth are measured against your own trailing-12-month quartiles; the rest use typical sector reference ranges."
              : "Typical reference ranges for your sector. Add 3+ months of data to benchmark against your own history."}
          </p>
        </div>

        {/* Sector selector */}
        <div className="relative">
          <button
            onClick={() => setShowSector(v => !v)}
            className="flex items-center gap-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-2 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors whitespace-nowrap"
          >
            {sector}
            <ChevronDown size={13} className="text-[var(--color-muted)]" />
          </button>
          {showSector && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl z-20 w-56">
              {SECTORS.map(s => (
                <button
                  key={s}
                  onClick={() => { setSector(s); setShowSector(false); }}
                  className={`w-full text-left text-sm px-3 py-2 hover:bg-white/4 transition-colors first:rounded-t-lg last:rounded-b-lg ${s === sector ? "text-[var(--color-primary)]" : ""}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tool selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([["overview", "Overview", Award], ["ratios", "Industry Ratios", Scale], ["cost-structure", "Cost Structure", PieChart], ["growth-percentile", "Growth Percentile", Gauge], ["working-capital", "Working-Capital", Recycle], ["profitability-percentile", "Profitability", Percent], ["expense-ratio", "Expense Ratios", Receipt], ["productivity", "Per-Employee", UsersRound], ["digital-maturity", "Digital Score", Activity], ["valuation-multiple", "Valuation Multiple", Building2], ["stock-turn", "Stock Turn", Boxes], ["tax-burden", "Tax Burden", Coins], ["ebitda-margin", "EBITDA Margin", Layers], ["revenue-volatility", "Revenue Stability", Waves], ["liquidity-buffer", "Liquidity Buffer", Wallet], ["debt-leverage", "Debt Leverage", Landmark], ["opex-efficiency", "Opex Efficiency", SlidersHorizontal], ["net-margin", "Net Margin Band", Banknote], ["cash-runway", "Cash Runway Band", Timer], ["customer-retention", "Customer Retention", HeartHandshake]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setBmTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${bmTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {bmTab === "ratios"            && <IndustryRatioBenchmark sector={sector} />}
      {bmTab === "cost-structure"   && <CostStructureBenchmark sector={sector} />}
      {bmTab === "growth-percentile" && <GrowthRatePercentile sector={sector} />}
      {bmTab === "working-capital"  && <WorkingCapitalBenchmark sector={sector} />}
      {bmTab === "profitability-percentile" && <ProfitabilityPercentile sector={sector} />}
      {bmTab === "expense-ratio"    && <ExpenseRatioBenchmark sector={sector} />}
      {bmTab === "productivity"     && <ProductivityBenchmark sector={sector} />}
      {bmTab === "digital-maturity" && <DigitalMaturityScorecard sector={sector} />}
      {bmTab === "valuation-multiple" && <ValuationMultipleBenchmark sector={sector} />}
      {bmTab === "stock-turn"       && <StockTurnBenchmark sector={sector} />}
      {bmTab === "tax-burden"       && <TaxBurdenBenchmark sector={sector} />}
      {bmTab === "ebitda-margin"    && <EbitdaMarginBenchmark sector={sector} />}
      {bmTab === "revenue-volatility" && <RevenueVolatilityBenchmark sector={sector} />}
      {bmTab === "liquidity-buffer" && <LiquidityBufferBenchmark sector={sector} />}
      {bmTab === "debt-leverage"    && <DebtLeverageBenchmark sector={sector} />}
      {bmTab === "opex-efficiency"  && <OpexEfficiencyBenchmark sector={sector} />}
      {bmTab === "net-margin"       && <NetMarginBandBenchmark sector={sector} />}
      {bmTab === "cash-runway"      && <CashRunwayBandBenchmark sector={sector} />}
      {bmTab === "customer-retention" && <CustomerRetentionBandBenchmark sector={sector} />}

      {bmTab === "overview" && <>
      {!hasData && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center">
          <BarChart3 size={28} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Add transactions to see your metrics vs peers</p>
          <p className="text-xs text-[var(--color-muted)] mt-1">Industry benchmarks are shown below based on your sector selection</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Radar */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold">Overall position</h2>
            {overallPct !== null && (
              <span className={`text-sm font-bold ${getLabel(overallPct).color}`}>
                {getLabel(overallPct).label}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-muted)] mb-4">{usingSelf ? "This month vs your 12-month norm + sector reference" : `Your business vs ${sector} reference`}</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "#7D8590" }} />
              <Radar name="Median" dataKey="median" stroke="#7D8590" strokeWidth={1} fill="#7D8590" fillOpacity={0.05} strokeDasharray="3 3" />
              <Radar name="You" dataKey="yours" stroke="#1A6B55" strokeWidth={2} fill="#1A6B55" fillOpacity={0.15} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><span className="w-3 h-0.5 bg-[var(--color-primary)] inline-block rounded" /> Your business</div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><span className="w-3 h-0.5 bg-[#7D8590] inline-block rounded" style={{ borderTop: "2px dashed #7D8590" }} /> Median (50th pct)</div>
          </div>
        </div>

        {/* Score card */}
        {overallPct !== null && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold mb-4">Peer score</h2>
            <div className="flex items-center gap-4 mb-5">
              <div className="relative w-20 h-20 shrink-0">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={overallPct >= 70 ? "#22c55e" : overallPct >= 50 ? "#1A6B55" : overallPct >= 35 ? "#eab308" : "#ef4444"}
                    strokeWidth="3" strokeDasharray={`${overallPct} ${100 - overallPct}`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold"
                  style={{ color: overallPct >= 70 ? "#22c55e" : overallPct >= 50 ? "#1A6B55" : overallPct >= 35 ? "#eab308" : "#ef4444" }}>
                  {overallPct}
                </span>
              </div>
              <div>
                <p className={`text-base font-bold ${getLabel(overallPct).color}`}>{getLabel(overallPct).label}</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">vs {sector}</p>
                <p className="text-xs text-[var(--color-muted)]">Based on {scored.length} of {metrics.length} metrics</p>
              </div>
            </div>
            <div className="space-y-2">
              {metrics.filter(m => m.yours !== null).map(m => {
                const pct = getPercentile(m.yours!, m.p25, m.p50, m.p75, m.higherIsBetter);
                const { color } = getLabel(pct);
                return (
                  <div key={m.key} className="flex items-center gap-2">
                    {pct >= 65 ? <TrendingUp size={11} className="text-green-400 shrink-0" />
                    : pct >= 40 ? <Minus size={11} className="text-yellow-400 shrink-0" />
                    : <TrendingDown size={11} className="text-red-400 shrink-0" />}
                    <span className="text-xs text-[var(--color-muted)] flex-1">{m.label}</span>
                    <span className={`text-xs font-semibold ${color}`}>{getLabel(pct).label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Metric breakdown */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Metric breakdown</h2>
        {metrics.map(m => {
          const pct    = m.yours !== null ? getPercentile(m.yours, m.p25, m.p50, m.p75, m.higherIsBetter) : null;
          const status = pct !== null ? getLabel(pct) : null;
          const chartData = [
            { bucket: "Bottom 25%", value: m.p25 - (m.higherIsBetter ? 10 : 0), fill: "#ef444440" },
            { bucket: "Median",     value: m.p50,                                 fill: "#7D8590" },
            { bucket: "Top 25%",    value: m.p75,                                 fill: "#22c55e40" },
            ...(m.yours !== null ? [{ bucket: "You", value: m.yours, fill: "#1A6B55" }] : []),
          ];

          const gap = m.yours !== null
            ? m.higherIsBetter
              ? (m.p50 - m.yours).toFixed(1)
              : (m.yours - m.p50).toFixed(1)
            : null;

          return (
            <div key={m.key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-start gap-2">
                  <Info size={12} className="text-[var(--color-muted)] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-xs text-[var(--color-muted)]">{m.description}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold tabular-nums">
                    {m.yours !== null ? `${m.yours}${m.unit}` : <span className="text-[var(--color-muted)] text-sm">—</span>}
                  </p>
                  {status && <p className={`text-xs font-medium ${status.color}`}>{status.label}</p>}
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <div className="h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 4, fontSize: 10 }}
                          formatter={(v: number) => [`${v}${m.unit}`, ""]}
                        />
                        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between text-[9px] text-[var(--color-muted)] mt-1">
                    <span>P25: {m.p25}{m.unit}</span>
                    <span>{m.source === "self" ? "Your median" : "Median"}: {m.p50}{m.unit} · {m.source === "self" ? "your 12-mo" : "sector ref"}</span>
                    <span>P75: {m.p75}{m.unit}</span>
                  </div>
                </div>
              </div>

              {gap !== null && parseFloat(gap) > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <AlertTriangle size={11} className="text-yellow-400 shrink-0" />
                  <p className="text-[var(--color-muted)]">
                    <span className="text-yellow-400 font-semibold">{gap}{m.unit}</span>
                    {" "}behind median — {m.key === "ar_days" ? "chase overdue invoices faster"
                     : m.key === "gross_margin" ? "review pricing or reduce direct costs"
                     : m.key === "payroll_ratio" ? "consider revenue growth before next hire"
                     : m.key === "runway" ? "reduce burn or extend credit line"
                     : "focus here to improve your peer rank"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-[var(--color-muted)] text-center">
        {usingSelf
          ? "“Your norm” bands are computed from your own last 12 months of data. Sector reference ranges are directional guides for typical Indian SMBs, not live peer data."
          : "Sector reference ranges are directional guides for typical Indian SMBs. Add more history to benchmark against your own months."}
      </p>
      </>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the four benchmark tools below
// ─────────────────────────────────────────────────────────────────────────────

/** Where `value` sits given a sector low/median/high band. Returns 0–100 percentile. */
function bandPercentile(value: number, low: number, _mid: number, high: number, higherIsBetter: boolean): number {
  // Treat the band as a monotone scale and linearly interpolate the rank.
  const lo = Math.min(low, high), hi = Math.max(low, high);
  let raw = hi === lo ? 0.5 : (value - lo) / (hi - lo);
  raw = Math.max(0, Math.min(1, raw));
  const pct = Math.round(raw * 100);
  return higherIsBetter ? pct : 100 - pct;
}

function bandLabel(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: "Top quartile",    color: "text-green-400" };
  if (pct >= 50) return { label: "Above median",    color: "text-[var(--color-primary)]" };
  if (pct >= 30) return { label: "Below median",    color: "text-yellow-400" };
  return                { label: "Bottom quartile", color: "text-red-400" };
}

/** Trailing-12-month monthly revenue series (positive months only kept in order). */
function useMonthlyRevenue() {
  const { store } = useApp();
  const txns = store.transactions ?? [];
  const now = new Date();
  const series: { month: string; revenue: number; cost: number; payroll: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const mt = txns.filter(t => t.date.startsWith(k));
    const revenue = mt.filter(t => t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
    const cost = Math.abs(mt.filter(t => t.amount < 0 && t.category !== "payroll").reduce((s, t) => s + t.amount, 0));
    const payroll = Math.abs(mt.filter(t => t.category === "payroll").reduce((s, t) => s + t.amount, 0));
    series.push({ month: k.slice(2), revenue, cost, payroll });
  }
  return series;
}

// ─────────────────────────────────────────────────────────────────────────────
// #143 Industry Ratio Benchmarking — your financial ratios vs sector medians
// ─────────────────────────────────────────────────────────────────────────────
type RatioRef = { key: string; label: string; unit: string; low: number; mid: number; high: number; higherIsBetter: boolean; desc: string };

const RATIO_REFS: Record<string, RatioRef[]> = {
  default: [
    { key: "current",   label: "Current Ratio",         unit: "x", low: 0.9, mid: 1.5, high: 2.5, higherIsBetter: true,  desc: "Cash + receivables ÷ short-term obligations (EMIs proxy)." },
    { key: "netmargin", label: "Net Margin",            unit: "%", low: 2,   mid: 8,   high: 18,  higherIsBetter: true,  desc: "Net profit as % of revenue (trailing 12 months)." },
    { key: "opex",      label: "Opex / Revenue",        unit: "%", low: 75,  mid: 60,  high: 42,  higherIsBetter: false, desc: "Operating spend (ex-payroll) as % of revenue." },
    { key: "interest",  label: "Interest Coverage",     unit: "x", low: 1.2, mid: 3,   high: 6,   higherIsBetter: true,  desc: "Operating profit ÷ interest/EMI outgo." },
    { key: "assetturn", label: "Revenue / Cash Assets", unit: "x", low: 1.5, mid: 4,   high: 8,   higherIsBetter: true,  desc: "Annualised revenue ÷ current cash balance." },
  ],
  "Manufacturing (SMB)": [
    { key: "current",   label: "Current Ratio",         unit: "x", low: 1.0, mid: 1.6, high: 2.6, higherIsBetter: true,  desc: "Liquidity buffer for working-capital intensive ops." },
    { key: "netmargin", label: "Net Margin",            unit: "%", low: 1,   mid: 6,   high: 14,  higherIsBetter: true,  desc: "Net profit % — thin in manufacturing." },
    { key: "opex",      label: "Opex / Revenue",        unit: "%", low: 80,  mid: 66,  high: 50,  higherIsBetter: false, desc: "Non-payroll operating spend % of revenue." },
    { key: "interest",  label: "Interest Coverage",     unit: "x", low: 1.1, mid: 2.5, high: 5,   higherIsBetter: true,  desc: "EBIT ÷ interest; lenders watch this." },
    { key: "assetturn", label: "Revenue / Cash Assets", unit: "x", low: 1.2, mid: 3,   high: 6,   higherIsBetter: true,  desc: "Capital efficiency of cash deployed." },
  ],
  "IT Services": [
    { key: "current",   label: "Current Ratio",         unit: "x", low: 1.2, mid: 2.0, high: 3.2, higherIsBetter: true,  desc: "Asset-light, typically higher liquidity." },
    { key: "netmargin", label: "Net Margin",            unit: "%", low: 6,   mid: 16,  high: 28,  higherIsBetter: true,  desc: "Net profit % — high for services." },
    { key: "opex",      label: "Opex / Revenue",        unit: "%", low: 55,  mid: 40,  high: 28,  higherIsBetter: false, desc: "Non-payroll spend; bulk of cost is payroll." },
    { key: "interest",  label: "Interest Coverage",     unit: "x", low: 2,   mid: 6,   high: 12,  higherIsBetter: true,  desc: "Usually low debt → high coverage." },
    { key: "assetturn", label: "Revenue / Cash Assets", unit: "x", low: 2,   mid: 5,   high: 10,  higherIsBetter: true,  desc: "Revenue turned per rupee of cash." },
  ],
};

function IndustryRatioBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const fc = formatCurrency;
  const refs = RATIO_REFS[sector] ?? RATIO_REFS["default"];
  const series = useMonthlyRevenue();

  const months = series.filter(m => m.revenue > 0);
  const ttmRev     = months.reduce((s, m) => s + m.revenue, 0);
  const ttmCost    = months.reduce((s, m) => s + m.cost, 0);
  const ttmPayroll = months.reduce((s, m) => s + m.payroll, 0);
  const balance    = store.bankAccounts.reduce((s, a) => s + a.balance, 0);
  const openAR     = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const emiMonthly = (store.activeLoans ?? []).reduce((s, l) => s + l.monthlyEmi, 0);
  const interestY  = emiMonthly * 12 * 0.4; // rough: ~40% of EMI is interest early in tenure

  const netProfit  = ttmRev - ttmCost - ttmPayroll - interestY;
  const ebit       = ttmRev - ttmCost - ttmPayroll;

  const yoursOf = (key: string): number | null => {
    if (ttmRev <= 0 && key !== "current") return null;
    switch (key) {
      case "current":   return emiMonthly > 0 ? +((balance + openAR) / (emiMonthly * 3)).toFixed(2) : (balance + openAR > 0 ? 3 : null);
      case "netmargin": return +((netProfit / ttmRev) * 100).toFixed(1);
      case "opex":      return +((ttmCost / ttmRev) * 100).toFixed(1);
      case "interest":  return interestY > 0 ? +(ebit / interestY).toFixed(2) : (ebit > 0 ? 12 : null);
      case "assetturn": return balance > 0 ? +(ttmRev / balance).toFixed(2) : null;
      default:          return null;
    }
  };

  const rows = refs.map(r => {
    const yours = yoursOf(r.key);
    const pct = yours !== null ? bandPercentile(yours, r.low, r.mid, r.high, r.higherIsBetter) : null;
    return { ...r, yours, pct };
  });
  const scored = rows.filter(r => r.pct !== null);
  const overall = scored.length ? Math.round(scored.reduce((s, r) => s + (r.pct ?? 0), 0) / scored.length) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Industry Ratio Benchmarking</h2>
        <p className="text-xs text-[var(--color-muted)]">Your key financial ratios — computed live from the last 12 months of transactions, bank balances, open invoices and loans — placed against typical <span className="text-[var(--color-text)]">{sector}</span> reference bands.</p>
        {ttmRev <= 0 && <p className="text-xs text-yellow-400 mt-2">No revenue transactions found in the last 12 months — add data to compute your ratios.</p>}
      </div>

      {overall !== null && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Composite percentile</p>
            <p className={`text-xl font-bold tabular-nums ${bandLabel(overall).color}`}>{overall}<span className="text-sm">th</span></p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">TTM revenue</p>
            <p className="text-xl font-bold tabular-nums">{fc(ttmRev)}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">TTM net profit</p>
            <p className={`text-xl font-bold tabular-nums ${netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(netProfit)}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Ratios benchmarked</p>
            <p className="text-xl font-bold tabular-nums">{scored.length}/{rows.length}</p>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Ratio", "You", "Sector low", "Median", "Sector high", "Position"].map(h => <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)]">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => {
              const lbl = r.pct !== null ? bandLabel(r.pct) : null;
              return (
                <tr key={r.key} className="hover:bg-white/2 align-top">
                  <td className="px-3 py-2.5">
                    <p className="text-xs font-medium">{r.label}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{r.desc}</p>
                  </td>
                  <td className="px-3 py-2.5 text-sm font-bold tabular-nums">{r.yours !== null ? `${r.yours}${r.unit}` : <span className="text-[var(--color-muted)]">—</span>}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.low}{r.unit}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.mid}{r.unit}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--color-muted)]">{r.high}{r.unit}</td>
                  <td className="px-3 py-2.5">
                    {lbl ? (
                      <div className="min-w-[120px]">
                        <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: (r.pct ?? 0) >= 50 ? "#1A6B55" : (r.pct ?? 0) >= 30 ? "#eab308" : "#ef4444" }} />
                        </div>
                        <p className={`text-[10px] mt-0.5 font-medium ${lbl.color}`}>{lbl.label} · {r.pct}th</p>
                      </div>
                    ) : <span className="text-xs text-[var(--color-muted)]">No data</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Ratios are derived approximations: interest is estimated at ~40% of EMI, current liabilities proxied by 3× monthly EMI. Reference bands are directional guides for typical Indian SMBs, not live peer data. Confirm with your CA before acting.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #144 Peer Salary / Cost Benchmark — your opex structure vs comparable firms
// ─────────────────────────────────────────────────────────────────────────────
// Each value is the typical % of revenue a comparable firm in the sector spends.
type CostMix = { key: string; label: string; pct: number };
const COST_REFS: Record<string, CostMix[]> = {
  default:             [{ key: "payroll", label: "Payroll", pct: 32 }, { key: "cogs", label: "Direct / COGS", pct: 38 }, { key: "rent", label: "Rent & utilities", pct: 8 }, { key: "marketing", label: "Sales & marketing", pct: 7 }, { key: "admin", label: "Admin & other", pct: 9 }],
  "Manufacturing (SMB)": [{ key: "payroll", label: "Payroll", pct: 22 }, { key: "cogs", label: "Direct / COGS", pct: 55 }, { key: "rent", label: "Rent & utilities", pct: 6 }, { key: "marketing", label: "Sales & marketing", pct: 4 }, { key: "admin", label: "Admin & other", pct: 7 }],
  "IT Services":         [{ key: "payroll", label: "Payroll", pct: 48 }, { key: "cogs", label: "Direct / COGS", pct: 14 }, { key: "rent", label: "Rent & utilities", pct: 7 }, { key: "marketing", label: "Sales & marketing", pct: 10 }, { key: "admin", label: "Admin & other", pct: 9 }],
};

function CostStructureBenchmark({ sector }: { sector: string }) {
  const refs = COST_REFS[sector] ?? COST_REFS["default"];
  const series = useMonthlyRevenue();
  const months = series.filter(m => m.revenue > 0);
  const ttmRev     = months.reduce((s, m) => s + m.revenue, 0);
  const ttmCost    = months.reduce((s, m) => s + m.cost, 0);
  const ttmPayroll = months.reduce((s, m) => s + m.payroll, 0);

  // Your live structure: payroll and "other opex" are real; the rest of opex is
  // shown as one "operating spend" line since transactions aren't sub-categorised.
  const yoursPct: Record<string, number | null> = ttmRev > 0 ? {
    payroll: +((ttmPayroll / ttmRev) * 100).toFixed(1),
    opex:    +((ttmCost / ttmRev) * 100).toFixed(1),
  } : { payroll: null, opex: null };

  const peerPayroll = refs.find(r => r.key === "payroll")?.pct ?? 0;
  const peerOpex    = refs.filter(r => r.key !== "payroll").reduce((s, r) => s + r.pct, 0);

  const compare = [
    { label: "Payroll", yours: yoursPct.payroll, peer: peerPayroll },
    { label: "Operating spend (ex-payroll)", yours: yoursPct.opex, peer: peerOpex },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Peer Cost-Structure Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">How your cost base — as a % of revenue — compares to a typical <span className="text-[var(--color-text)]">{sector}</span> firm. Your payroll and operating-spend ratios are computed live from the last 12 months; the peer breakdown is a sector reference mix.</p>
      </div>

      {/* Your vs peer headline bars */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Your structure vs peers</h3>
        {ttmRev <= 0 && <p className="text-xs text-yellow-400">Add 12 months of transactions to compute your cost ratios.</p>}
        {compare.map(c => {
          const yours = c.yours ?? 0;
          const max = Math.max(yours, c.peer, 1);
          const over = c.yours !== null && c.yours > c.peer;
          return (
            <div key={c.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{c.label}</span>
                <span className="tabular-nums">
                  {c.yours !== null ? <span className={over ? "text-yellow-400 font-semibold" : "text-green-400 font-semibold"}>{c.yours}%</span> : <span className="text-[var(--color-muted)]">—</span>}
                  <span className="text-[var(--color-muted)]"> vs peer {c.peer}%</span>
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-[var(--color-border)] overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(yours / max) * 100}%`, background: over ? "#eab308" : "#1A6B55" }} />
                <div className="absolute inset-y-0 w-0.5 bg-[var(--color-text)]" style={{ left: `${(c.peer / max) * 100}%` }} title={`Peer ${c.peer}%`} />
              </div>
              {over && <p className="text-[10px] text-yellow-400 mt-0.5">{(yours - c.peer).toFixed(1)}pp above the peer benchmark — a cost-efficiency opportunity.</p>}
            </div>
          );
        })}
      </div>

      {/* Peer reference mix */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Typical {sector} cost mix (% of revenue)</h3>
        <div className="flex h-4 w-full rounded-full overflow-hidden mb-3">
          {refs.map((r, i) => (
            <div key={r.key} style={{ width: `${r.pct}%`, background: ["#1A6B55", "#2d8a6f", "#7D8590", "#eab308", "#475569"][i % 5] }} title={`${r.label} ${r.pct}%`} />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {refs.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ["#1A6B55", "#2d8a6f", "#7D8590", "#eab308", "#475569"][i % 5] }} />
              <span className="text-[var(--color-muted)] flex-1">{r.label}</span>
              <span className="tabular-nums font-medium">{r.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Transactions aren't sub-categorised into rent/marketing/admin, so your live figures collapse non-payroll spend into a single operating-spend line. The peer mix is a directional sector reference, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #145 Growth-Rate Percentile — where you rank on growth in your segment
// ─────────────────────────────────────────────────────────────────────────────
// Distribution of monthly revenue growth (MoM %) across firms in the segment.
const GROWTH_DIST: Record<string, { p10: number; p25: number; p50: number; p75: number; p90: number }> = {
  default:               { p10: -3, p25: 1,  p50: 4,  p75: 9,  p90: 16 },
  "Manufacturing (SMB)": { p10: -4, p25: 0,  p50: 3,  p75: 7,  p90: 12 },
  "IT Services":         { p10: -2, p25: 2,  p50: 6,  p75: 13, p90: 22 },
};

function GrowthRatePercentile({ sector }: { sector: string }) {
  const dist = GROWTH_DIST[sector] ?? GROWTH_DIST["default"];
  const series = useMonthlyRevenue();
  const revSeries = series.map(m => m.revenue);

  // Live compound monthly growth from the trailing series.
  const cmgrVal = cmgr(revSeries);
  // Latest MoM growth (last two non-zero months).
  const nz = series.filter(m => m.revenue > 0);
  const momLatest = nz.length >= 2 && nz[nz.length - 2].revenue > 0
    ? +(((nz[nz.length - 1].revenue - nz[nz.length - 2].revenue) / nz[nz.length - 2].revenue) * 100).toFixed(1)
    : null;

  // Percentile of CMGR within the segment distribution (piecewise-linear).
  const rankOf = (g: number): number => {
    const pts: [number, number][] = [[dist.p10, 10], [dist.p25, 25], [dist.p50, 50], [dist.p75, 75], [dist.p90, 90]];
    if (g <= pts[0][0]) return 8;
    if (g >= pts[pts.length - 1][0]) return 95;
    for (let i = 1; i < pts.length; i++) {
      const [v0, r0] = pts[i - 1], [v1, r1] = pts[i];
      if (g <= v1) return Math.round(r0 + (r1 - r0) * (v1 === v0 ? 0 : (g - v0) / (v1 - v0)));
    }
    return 50;
  };
  const pct = cmgrVal !== null ? rankOf(cmgrVal) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;

  const distBars = [
    { bucket: "P10", value: dist.p10 }, { bucket: "P25", value: dist.p25 },
    { bucket: "P50", value: dist.p50 }, { bucket: "P75", value: dist.p75 }, { bucket: "P90", value: dist.p90 },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Growth-Rate Percentile</h2>
        <p className="text-xs text-[var(--color-muted)]">Your compound monthly revenue growth (CMGR) over the trailing 12 months, ranked against the growth distribution of typical <span className="text-[var(--color-text)]">{sector}</span> firms.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Your CMGR (12-mo)</p>
          <p className={`text-2xl font-bold tabular-nums ${cmgrVal === null ? "text-[var(--color-muted)]" : cmgrVal >= 0 ? "text-green-400" : "text-red-400"}`}>{cmgrVal !== null ? `${cmgrVal.toFixed(1)}%` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Latest MoM</p>
          <p className={`text-2xl font-bold tabular-nums ${momLatest === null ? "text-[var(--color-muted)]" : momLatest >= 0 ? "text-green-400" : "text-red-400"}`}>{momLatest !== null ? `${momLatest}%` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Segment percentile</p>
          <p className={`text-2xl font-bold tabular-nums ${lbl ? lbl.color : "text-[var(--color-muted)]"}`}>{pct !== null ? `${pct}th` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-1">Where you sit in the {sector} growth curve</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Bars show segment growth percentiles (MoM %). The line marks your CMGR.</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distBars} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 4, fontSize: 10 }} formatter={(v: number) => [`${v}%`, "Growth"]} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {distBars.map((d, i) => <Cell key={i} fill={cmgrVal !== null && cmgrVal >= d.value ? "#1A6B55" : "#7D859055"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {cmgrVal !== null && (
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Your {cmgrVal.toFixed(1)}% CMGR is{" "}
            <span className={lbl?.color}>{cmgrVal >= dist.p50 ? "ahead of" : "behind"} the segment median of {dist.p50}%</span>
            {cmgrVal >= dist.p90 ? " — top-decile growth." : cmgrVal < dist.p25 ? " — lagging the bottom quartile." : "."}
          </p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">CMGR needs ≥2 positive months. Segment distributions are directional reference curves for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// #146 Working-Capital Benchmark — your CCC vs industry norms
// ─────────────────────────────────────────────────────────────────────────────
// Sector norms for the cash-conversion cycle components (days). CCC = DIO+DSO−DPO.
const CCC_NORMS: Record<string, { dio: number; dso: number; dpo: number }> = {
  default:               { dio: 45, dso: 42, dpo: 35 },
  "Manufacturing (SMB)": { dio: 70, dso: 52, dpo: 45 },
  "IT Services":         { dio: 5,  dso: 38, dpo: 30 },
};

function WorkingCapitalBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const norm = CCC_NORMS[sector] ?? CCC_NORMS["default"];

  const yDso = dso(store.invoices ?? []);
  const yDio = dio(store.inventory ?? [], store.procurement ?? []);
  const yDpo = dpo(store.procurement ?? []);
  const yCcc = yDio + yDso - yDpo;
  const normCcc = norm.dio + norm.dso - norm.dpo;
  const gap = yCcc - normCcc;

  const comps = [
    { key: "dio", label: "Days Inventory (DIO)", yours: yDio, norm: norm.dio, higherIsBetter: false, hint: "release cash by trimming slow-moving stock" },
    { key: "dso", label: "Days Sales (DSO)",     yours: yDso, norm: norm.dso, higherIsBetter: false, hint: "tighten credit terms and chase overdue invoices" },
    { key: "dpo", label: "Days Payables (DPO)",  yours: yDpo, norm: norm.dpo, higherIsBetter: true,  hint: "negotiate longer terms without souring vendors" },
  ];

  // Rough cash impact of closing the CCC gap: gap-days × daily spend run rate.
  const txns = store.transactions ?? [];
  const annualSpend = Math.abs(txns.filter(t => t.amount < 0 && t.category !== "loan").reduce((s, t) => s + t.amount, 0));
  const months = Math.max(new Set(txns.map(t => t.date.slice(0, 7))).size, 1);
  const dailyRunRate = (annualSpend / months) / 30;
  const cashLockedVsNorm = Math.round(gap * dailyRunRate);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Recycle size={14} className="text-[var(--color-primary)]" /> Working-Capital Benchmark (CCC)</h2>
        <p className="text-xs text-[var(--color-muted)]">Your cash-conversion cycle — DIO + DSO − DPO — computed live from invoices, inventory and procurement, against typical <span className="text-[var(--color-text)]">{sector}</span> norms. A shorter CCC frees up cash.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Your CCC</p>
          <p className={`text-2xl font-bold tabular-nums ${yCcc <= normCcc ? "text-green-400" : "text-yellow-400"}`}>{yCcc}<span className="text-sm"> days</span></p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector norm CCC</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{normCcc}<span className="text-sm"> days</span></p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Gap vs norm</p>
          <p className={`text-2xl font-bold tabular-nums ${gap <= 0 ? "text-green-400" : "text-red-400"}`}>{gap > 0 ? "+" : ""}{gap}<span className="text-sm"> days</span></p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">{gap > 0 ? "Cash locked vs norm" : "Cash freed vs norm"}</p>
          <p className={`text-2xl font-bold tabular-nums ${gap > 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(Math.abs(cashLockedVsNorm))}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Component breakdown</h3>
        {comps.map(c => {
          const max = Math.max(c.yours, c.norm, 1);
          const worse = c.higherIsBetter ? c.yours < c.norm : c.yours > c.norm;
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{c.label}</span>
                <span className="tabular-nums">
                  <span className={worse ? "text-yellow-400 font-semibold" : "text-green-400 font-semibold"}>{c.yours}d</span>
                  <span className="text-[var(--color-muted)]"> vs norm {c.norm}d</span>
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-[var(--color-border)] overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.yours / max) * 100}%`, background: worse ? "#eab308" : "#1A6B55" }} />
                <div className="absolute inset-y-0 w-0.5 bg-[var(--color-text)]" style={{ left: `${(c.norm / max) * 100}%` }} title={`Norm ${c.norm}d`} />
              </div>
              {worse && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-yellow-400">
                  <AlertTriangle size={9} className="shrink-0" /> {c.higherIsBetter ? `${c.norm - c.yours}d shorter than norm` : `${c.yours - c.norm}d longer than norm`} — {c.hint}.
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">DIO/DSO/DPO are computed from a 90-day proxy of recent activity; with thin data the engine applies conservative defaults. Cash-impact uses your average daily spend run-rate. Sector norms are directional guides, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared TTM helper for the benchmark tools below
// ─────────────────────────────────────────────────────────────────────────────
/** Trailing-12-month totals from the monthly revenue/cost/payroll series. */
function useTtm() {
  const series = useMonthlyRevenue();
  const months = series.filter(m => m.revenue > 0);
  const revenue = months.reduce((s, m) => s + m.revenue, 0);
  const cost = months.reduce((s, m) => s + m.cost, 0);
  const payroll = months.reduce((s, m) => s + m.payroll, 0);
  return { series, months, revenue, cost, payroll, hasRev: revenue > 0 };
}

/** Small reusable card showing your value vs a low/median/high sector band. */
function BandRow({ label, desc, yours, unit, low, mid, high, higherIsBetter }: {
  label: string; desc: string; yours: number | null; unit: string;
  low: number; mid: number; high: number; higherIsBetter: boolean;
}) {
  const pct = yours !== null ? bandPercentile(yours, low, mid, high, higherIsBetter) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  const max = Math.max(low, mid, high, yours ?? 0, 1);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          {yours !== null ? <span className={lbl?.color ?? ""}>{yours}{unit}</span> : <span className="text-[var(--color-muted)]">—</span>}
          <span className="text-[var(--color-muted)]"> · median {mid}{unit}</span>
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-[var(--color-border)] overflow-hidden">
        {yours !== null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((yours) / max) * 100}%`, background: (pct ?? 0) >= 50 ? "#1A6B55" : (pct ?? 0) >= 30 ? "#eab308" : "#ef4444" }} />}
        <div className="absolute inset-y-0 w-0.5 bg-[var(--color-text)]" style={{ left: `${(mid / max) * 100}%` }} title={`Median ${mid}${unit}`} />
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{desc}{lbl && <span className={`ml-1 font-medium ${lbl.color}`}>· {lbl.label} ({pct}th)</span>}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profitability Percentile — gross-margin distribution vs sector (feature #18/#26)
// ─────────────────────────────────────────────────────────────────────────────
const GM_DIST: Record<string, { p10: number; p25: number; p50: number; p75: number; p90: number }> = {
  default:               { p10: 12, p25: 22, p50: 31, p75: 42, p90: 55 },
  "Manufacturing (SMB)": { p10: 9,  p25: 18, p50: 26, p75: 36, p90: 47 },
  "IT Services":         { p10: 28, p25: 38, p50: 52, p75: 68, p90: 80 },
};

function ProfitabilityPercentile({ sector }: { sector: string }) {
  const dist = GM_DIST[sector] ?? GM_DIST["default"];
  const { revenue, cost, hasRev } = useTtm();
  const gm = hasRev ? +(((revenue - cost) / revenue) * 100).toFixed(1) : null;

  const rankOf = (g: number): number => {
    const pts: [number, number][] = [[dist.p10, 10], [dist.p25, 25], [dist.p50, 50], [dist.p75, 75], [dist.p90, 90]];
    if (g <= pts[0][0]) return 8;
    if (g >= pts[pts.length - 1][0]) return 95;
    for (let i = 1; i < pts.length; i++) {
      const [v0, r0] = pts[i - 1], [v1, r1] = pts[i];
      if (g <= v1) return Math.round(r0 + (r1 - r0) * (v1 === v0 ? 0 : (g - v0) / (v1 - v0)));
    }
    return 50;
  };
  const pct = gm !== null ? rankOf(gm) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  const bars = [
    { bucket: "P10", value: dist.p10 }, { bucket: "P25", value: dist.p25 },
    { bucket: "P50", value: dist.p50 }, { bucket: "P75", value: dist.p75 }, { bucket: "P90", value: dist.p90 },
  ];
  // Rupee upside of reaching the sector median margin.
  const upside = gm !== null && gm < dist.p50 ? Math.round(((dist.p50 - gm) / 100) * revenue) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Profitability Percentile</h2>
        <p className="text-xs text-[var(--color-muted)]">Your trailing-12-month gross margin ranked against the gross-margin distribution of typical <span className="text-[var(--color-text)]">{sector}</span> firms. Computed live from revenue and direct costs.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">No revenue in the last 12 months — add transactions to rank your margin.</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Your gross margin</p>
          <p className={`text-2xl font-bold tabular-nums ${gm === null ? "text-[var(--color-muted)]" : gm >= dist.p50 ? "text-green-400" : "text-yellow-400"}`}>{gm !== null ? `${gm}%` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector percentile</p>
          <p className={`text-2xl font-bold tabular-nums ${lbl ? lbl.color : "text-[var(--color-muted)]"}`}>{pct !== null ? `${pct}th` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Upside to median margin</p>
          <p className={`text-2xl font-bold tabular-nums ${upside > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{upside > 0 ? `+${formatCurrency(upside)}` : "At/above"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-1">Where you sit in the {sector} margin curve</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Bars are sector gross-margin percentiles. Filled bars are at or below your margin.</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} unit="%" />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 4, fontSize: 10 }} formatter={(v: number) => [`${v}%`, "Gross margin"]} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {bars.map((d, i) => <Cell key={i} fill={gm !== null && gm >= d.value ? "#1A6B55" : "#7D859055"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Direct costs exclude payroll (counted separately). Upside multiplies the margin gap by your TTM revenue. Sector distributions are indicative reference curves for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expense-Ratio Benchmark — each major cost line as % of revenue (feature #54/#75)
// ─────────────────────────────────────────────────────────────────────────────
type ExpRef = { key: Transaction["category"] | "interest"; label: string; low: number; mid: number; high: number; desc: string };
const EXP_REFS: Record<string, ExpRef[]> = {
  default: [
    { key: "expense", label: "Operating spend / Rev", low: 78, mid: 60, high: 42, desc: "Non-payroll operating costs." },
    { key: "payroll", label: "Payroll / Rev",         low: 45, mid: 32, high: 22, desc: "Wages & salaries." },
    { key: "tax",     label: "Tax paid / Rev",        low: 14, mid: 9,  high: 5,  desc: "GST/TDS/income-tax cash outflow." },
    { key: "interest",label: "Interest / Rev",        low: 7,  mid: 3,  high: 1,  desc: "Finance cost on borrowings." },
  ],
  "Manufacturing (SMB)": [
    { key: "expense", label: "Operating spend / Rev", low: 84, mid: 68, high: 52, desc: "Materials, power, freight." },
    { key: "payroll", label: "Payroll / Rev",         low: 38, mid: 28, high: 18, desc: "Shop-floor + staff wages." },
    { key: "tax",     label: "Tax paid / Rev",        low: 13, mid: 8,  high: 4,  desc: "GST/TDS cash outflow." },
    { key: "interest",label: "Interest / Rev",        low: 9,  mid: 4,  high: 1.5,desc: "Working-capital interest." },
  ],
  "IT Services": [
    { key: "expense", label: "Operating spend / Rev", low: 58, mid: 40, high: 26, desc: "Tools, cloud, travel." },
    { key: "payroll", label: "Payroll / Rev",         low: 58, mid: 44, high: 32, desc: "Engineer payroll dominates." },
    { key: "tax",     label: "Tax paid / Rev",        low: 16, mid: 11, high: 6,  desc: "GST/TDS cash outflow." },
    { key: "interest",label: "Interest / Rev",        low: 4,  mid: 1.5,high: 0.3,desc: "Usually low debt." },
  ],
};

function ExpenseRatioBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const refs = EXP_REFS[sector] ?? EXP_REFS["default"];
  const { series, months, revenue, hasRev } = useTtm();
  const keys = months.map(m => m.month);
  const txns = (store.transactions ?? []).filter(t => keys.some(k => t.date.slice(2, 7) === k));

  const sumCat = (cat: Transaction["category"]) => Math.abs(txns.filter(t => t.amount < 0 && t.category === cat).reduce((s, t) => s + t.amount, 0));
  const interestTtm = (store.activeLoans ?? []).reduce((s, l) => s + (l.outstanding * (l.rate / 100)), 0); // ~annual interest
  const ratioFor = (key: ExpRef["key"]): number | null => {
    if (!hasRev) return null;
    const num = key === "interest" ? interestTtm : sumCat(key);
    return +((num / revenue) * 100).toFixed(1);
  };

  const rows = refs.map(r => ({ ...r, yours: ratioFor(r.key) }));
  const overspend = rows.reduce((s, r) => {
    if (r.yours === null || r.yours <= r.mid) return s;
    return s + Math.round(((r.yours - r.mid) / 100) * revenue);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Expense-Ratio Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Each major expense line as a % of TTM revenue, against typical <span className="text-[var(--color-text)]">{sector}</span> reference bands. Lower is better for every line. Computed live from your categorised transactions and loans.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue transactions to compute your expense ratios.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">TTM revenue</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(revenue)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Lines above median</p>
          <p className="text-xl font-bold tabular-nums">{rows.filter(r => r.yours !== null && r.yours > r.mid).length}/{rows.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Spend above median lines</p>
          <p className={`text-xl font-bold tabular-nums ${overspend > 0 ? "text-yellow-400" : "text-green-400"}`}>{overspend > 0 ? formatCurrency(overspend) : "—"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Expense lines vs sector</h3>
        {rows.map(r => (
          <BandRow key={String(r.key)} label={r.label} desc={r.desc} yours={r.yours} unit="%" low={r.low} mid={r.mid} high={r.high} higherIsBetter={false} />
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Interest is the annual run-rate (outstanding × rate). Tax reflects cash actually paid in the window. Reference bands are indicative guides for typical Indian SMBs, not live peer data. Series length: {series.filter(m => m.revenue > 0).length} months.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Productivity Benchmark — revenue & profit per employee (feature #76)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference bands for annual revenue-per-employee (₹ lakh).
const RPE_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 8,  mid: 16, high: 30 },
  "Manufacturing (SMB)": { low: 10, mid: 20, high: 40 },
  "IT Services":         { low: 12, mid: 22, high: 38 },
};

function ProductivityBenchmark({ sector }: { sector: string }) {
  const band = RPE_BANDS[sector] ?? RPE_BANDS["default"];
  const { revenue, cost, payroll, hasRev } = useTtm();
  const [headcount, setHeadcount] = useFeatureState<number>("bmk-headcount", 0);

  const profit = revenue - cost - payroll;
  const hc = headcount > 0 ? headcount : null;
  const rpeLakh = hc && hasRev ? +((revenue / hc) / 1e5).toFixed(1) : null;       // ₹ lakh / head
  const ppe = hc && hasRev ? Math.round(profit / hc) : null;                       // ₹ / head
  const payrollPerHead = hc && payroll > 0 ? Math.round(payroll / hc) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><UsersRound size={14} className="text-[var(--color-primary)]" /> Productivity (Revenue / Employee)</h2>
        <p className="text-xs text-[var(--color-muted)]">Annual revenue and profit per head against typical <span className="text-[var(--color-text)]">{sector}</span> bands. Revenue and profit are live (TTM); enter your headcount to compute the ratios.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <label className="text-xs font-medium text-[var(--color-muted)]">Team headcount</label>
        <input
          type="number" min={0} value={headcount || ""}
          onChange={e => setHeadcount(() => Math.max(0, Math.round(Number(e.target.value) || 0)))}
          placeholder="e.g. 12"
          className="w-28 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 tabular-nums focus:border-[var(--color-primary)]/60 outline-none"
        />
        <span className="text-[10px] text-[var(--color-muted)]">Saved to your workspace; used only for these ratios.</span>
      </div>

      {hc === null ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center">
          <UsersRound size={26} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Enter your headcount to benchmark per-employee output.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Revenue / employee</p>
              <p className="text-2xl font-bold tabular-nums">{rpeLakh !== null ? `₹${rpeLakh}L` : "—"}</p>
              <p className="text-[10px] text-[var(--color-muted)]">per year</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Profit / employee</p>
              <p className={`text-2xl font-bold tabular-nums ${ppe !== null && ppe >= 0 ? "text-green-400" : "text-red-400"}`}>{ppe !== null ? formatCurrency(ppe) : "—"}</p>
              <p className="text-[10px] text-[var(--color-muted)]">per year</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Avg payroll / head</p>
              <p className="text-2xl font-bold tabular-nums">{payrollPerHead !== null ? formatCurrency(payrollPerHead) : "—"}</p>
              <p className="text-[10px] text-[var(--color-muted)]">per year</p>
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold">Output per head vs sector</h3>
            {!hasRev && <p className="text-xs text-yellow-400">Add revenue transactions to compute output per head.</p>}
            <BandRow label="Revenue / employee (₹ lakh p.a.)" desc="Higher means each hire generates more revenue." yours={rpeLakh} unit="L" low={band.low} mid={band.mid} high={band.high} higherIsBetter />
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Profit per head = (TTM revenue − direct costs − payroll) ÷ headcount. Sector bands are indicative annual revenue-per-employee ranges for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Digital-Maturity Scorecard — how digitised your finance stack is (feature #99)
// ─────────────────────────────────────────────────────────────────────────────
function DigitalMaturityScorecard({ sector }: { sector: string }) {
  const { store } = useApp();
  const txns = store.transactions ?? [];

  const checks: { key: string; label: string; pass: boolean; detail: string; weight: number }[] = [
    { key: "bank", label: "Bank/UPI accounts linked", pass: (store.bankAccounts?.length ?? 0) > 0, detail: `${store.bankAccounts?.length ?? 0} account(s) connected`, weight: 18 },
    { key: "txn", label: "Transactions digitised", pass: txns.length >= 30, detail: `${txns.length} transactions on record`, weight: 16 },
    { key: "einvoice", label: "Invoicing on the platform", pass: (store.invoices?.length ?? 0) > 0, detail: `${store.invoices?.length ?? 0} invoice(s) tracked`, weight: 16 },
    { key: "gst", label: "GST registered & rate set", pass: !!store.firm?.gstRegistered, detail: store.firm?.gstRegistered ? "GST registered" : "Not GST registered", weight: 14 },
    { key: "inventory", label: "Inventory tracked digitally", pass: (store.inventory?.length ?? 0) > 0, detail: `${store.inventory?.length ?? 0} SKU(s) tracked`, weight: 12 },
    { key: "procurement", label: "Procurement / POs digitised", pass: (store.procurement?.length ?? 0) > 0, detail: `${store.procurement?.length ?? 0} purchase order(s)`, weight: 10 },
    { key: "assets", label: "Fixed-asset register kept", pass: (store.fixedAssets?.length ?? 0) > 0, detail: `${store.fixedAssets?.length ?? 0} asset(s) registered`, weight: 8 },
    { key: "categorised", label: "Spend categorised", pass: txns.length > 0 && txns.filter(t => t.category && t.category !== "transfer").length / Math.max(1, txns.length) >= 0.6, detail: `${txns.length ? Math.round(txns.filter(t => t.category && t.category !== "transfer").length / txns.length * 100) : 0}% categorised`, weight: 6 },
  ];

  const score = Math.round(checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0));
  const passed = checks.filter(c => c.pass).length;
  const tier = score >= 80 ? { label: "Digital leader", color: "text-green-400" }
    : score >= 55 ? { label: "Digitising well", color: "text-[var(--color-primary)]" }
    : score >= 30 ? { label: "Early adopter", color: "text-yellow-400" }
    : { label: "Mostly manual", color: "text-red-400" };
  const next = checks.find(c => !c.pass);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Activity size={14} className="text-[var(--color-primary)]" /> Digital-Maturity Scorecard</h2>
        <p className="text-xs text-[var(--color-muted)]">How digitised your finance operations are — scored live from what you actually run on the platform. A higher score also strengthens your credit-readiness story with lenders in <span className="text-[var(--color-text)]">{sector}</span>.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none"
                stroke={score >= 70 ? "#22c55e" : score >= 50 ? "#1A6B55" : score >= 30 ? "#eab308" : "#ef4444"}
                strokeWidth="3" strokeDasharray={`${score} ${100 - score}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: score >= 70 ? "#22c55e" : score >= 50 ? "#1A6B55" : score >= 30 ? "#eab308" : "#ef4444" }}>{score}</span>
          </div>
          <div>
            <p className={`text-base font-bold ${tier.color}`}>{tier.label}</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">{passed} of {checks.length} signals live</p>
          </div>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 md:col-span-2">
          <p className="text-xs text-[var(--color-muted)] mb-1">Best next step</p>
          {next ? (
            <p className="text-sm font-semibold flex items-start gap-2"><AlertTriangle size={13} className="text-yellow-400 mt-0.5 shrink-0" /> Turn on: {next.label} <span className="text-[var(--color-muted)] font-normal">(+{next.weight} pts)</span></p>
          ) : (
            <p className="text-sm font-semibold text-green-400 flex items-center gap-2"><Award size={14} /> Fully digitised — every signal is live.</p>
          )}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-2.5">
        <h3 className="text-sm font-semibold mb-1">Capability checklist</h3>
        {checks.map(c => (
          <div key={c.key} className="flex items-center gap-2">
            {c.pass ? <TrendingUp size={12} className="text-green-400 shrink-0" /> : <Minus size={12} className="text-[var(--color-muted)] shrink-0" />}
            <span className={`text-xs flex-1 ${c.pass ? "" : "text-[var(--color-muted)]"}`}>{c.label}</span>
            <span className="text-[10px] text-[var(--color-muted)] tabular-nums">{c.detail}</span>
            <span className={`text-[10px] font-medium w-10 text-right ${c.pass ? "text-green-400" : "text-[var(--color-muted)]"}`}>{c.pass ? `+${c.weight}` : `0/${c.weight}`}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Scored entirely from your own usage signals — no peer data involved. Weights are indicative of how much each capability typically improves analytics quality and lender confidence.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Valuation-Multiple Benchmark — implied value from sector revenue multiples (#26)
// ─────────────────────────────────────────────────────────────────────────────
// Sector EV/Revenue multiple bands (x annual revenue) for small private firms.
const VAL_MULT: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 0.6, mid: 1.1, high: 2.0 },
  "Manufacturing (SMB)": { low: 0.5, mid: 0.9, high: 1.6 },
  "IT Services":         { low: 1.2, mid: 2.2, high: 4.0 },
};

function ValuationMultipleBenchmark({ sector }: { sector: string }) {
  const mult = VAL_MULT[sector] ?? VAL_MULT["default"];
  const { revenue, cost, payroll, hasRev } = useTtm();
  const ebitda = revenue - cost - payroll;
  const ebitdaMarginPct = hasRev ? +((ebitda / revenue) * 100).toFixed(1) : null;

  // Margin quality nudges where in the band the firm lands (0..1).
  const quality = ebitdaMarginPct === null ? 0.5 : Math.max(0, Math.min(1, (ebitdaMarginPct - 0) / 25));
  const appliedMult = +(mult.low + (mult.high - mult.low) * quality).toFixed(2);
  const valLow = Math.round(revenue * mult.low);
  const valMid = Math.round(revenue * mult.mid);
  const valHigh = Math.round(revenue * mult.high);
  const valApplied = Math.round(revenue * appliedMult);

  const bars = [
    { band: "Low", value: valLow }, { band: "Median", value: valMid }, { band: "High", value: valHigh },
    ...(hasRev ? [{ band: "Your est.", value: valApplied }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Valuation-Multiple Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Indicative enterprise value from typical <span className="text-[var(--color-text)]">{sector}</span> EV/Revenue multiples applied to your live TTM revenue. Your EBITDA margin nudges where in the band you land.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue to estimate a valuation range.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">TTM revenue</p>
          <p className="text-xl font-bold tabular-nums">{formatCurrency(revenue)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">EBITDA margin</p>
          <p className={`text-xl font-bold tabular-nums ${ebitdaMarginPct === null ? "text-[var(--color-muted)]" : ebitdaMarginPct >= 0 ? "text-green-400" : "text-red-400"}`}>{ebitdaMarginPct !== null ? `${ebitdaMarginPct}%` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Applied multiple</p>
          <p className="text-xl font-bold tabular-nums">{hasRev ? `${appliedMult}x` : "—"}</p>
          <p className="text-[10px] text-[var(--color-muted)]">range {mult.low}x–{mult.high}x</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Indicative EV</p>
          <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{hasRev ? formatCurrency(valApplied) : "—"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-1">Valuation range at sector multiples</h3>
        <p className="text-xs text-[var(--color-muted)] mb-3">Revenue × low / median / high multiple. Your estimate uses a margin-adjusted multiple.</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="band" tick={{ fontSize: 10, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : `${Math.round(v / 1e5)}L`} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 4, fontSize: 10 }} formatter={(v: number) => [formatCurrency(v), "EV"]} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {bars.map((d, i) => <Cell key={i} fill={d.band === "Your est." ? "#1A6B55" : "#7D859055"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A rough revenue-multiple estimate only — real valuations weigh growth, margins, customer concentration, defensibility and diligence. Multiple bands are indicative for typical Indian SMBs, not live transaction comps. Confirm with an advisor.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock-Turn Benchmark — inventory turns/year & dead stock vs sector (feature #69)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference annual inventory turns (higher = leaner inventory).
const TURN_NORMS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 3, mid: 6,  high: 10 },
  "Manufacturing (SMB)": { low: 2, mid: 4,  high: 7  },
  "IT Services":         { low: 8, mid: 14, high: 24 },
};

function StockTurnBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const norm = TURN_NORMS[sector] ?? TURN_NORMS["default"];
  const inventory = store.inventory ?? [];
  const procurement = store.procurement ?? [];

  const invValue = inventory.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  // Annualised COGS proxy from goods received in the last 90 days.
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const cogs90 = procurement.filter(p => p.status === "received" && p.createdAt.slice(0, 10) >= cutoff).reduce((s, p) => s + p.totalValue, 0);
  const annualCogs = cogs90 * 4;
  const turns = invValue > 0 && annualCogs > 0 ? +(annualCogs / invValue).toFixed(1) : null;

  // Slow / dead stock: items at or below reorder level holding value.
  const deadStock = inventory.filter(i => i.quantity > 0 && i.quantity <= i.reorderLevel);
  const deadValue = deadStock.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const pct = turns !== null ? bandPercentile(turns, norm.low, norm.mid, norm.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Boxes size={14} className="text-[var(--color-primary)]" /> Stock-Turn Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">How many times you sell through inventory a year, against typical <span className="text-[var(--color-text)]">{sector}</span> turns. Higher turns free up working capital. Computed live from inventory value and goods received.</p>
        {invValue <= 0 && <p className="text-xs text-yellow-400 mt-2">No inventory on record — this benchmark suits stock-holding businesses.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Your turns / yr</p>
          <p className={`text-2xl font-bold tabular-nums ${turns === null ? "text-[var(--color-muted)]" : turns >= norm.mid ? "text-green-400" : "text-yellow-400"}`}>{turns !== null ? `${turns}x` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{norm.mid}x</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Inventory value</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(invValue)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Slow / dead stock</p>
          <p className={`text-2xl font-bold tabular-nums ${deadValue > 0 ? "text-red-400" : "text-green-400"}`}>{deadValue > 0 ? formatCurrency(deadValue) : "—"}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{deadStock.length} SKU(s) at/below reorder</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Turns vs sector</h3>
        <BandRow label="Inventory turns / year" desc="Higher means stock converts to sales faster." yours={turns} unit="x" low={norm.low} mid={norm.mid} high={norm.high} higherIsBetter />
        {lbl && turns !== null && (
          <p className="text-xs text-[var(--color-muted)]">
            At {turns}x you are <span className={lbl.color}>{lbl.label.toLowerCase()}</span> for {sector}.
            {turns < norm.mid && deadValue > 0 && ` Clearing the ${formatCurrency(deadValue)} in slow stock would lift turns and release cash.`}
          </p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Turns use a 90-day annualised COGS proxy from received purchase orders. Slow/dead stock flags items at or below their reorder level. Sector turn norms are indicative guides for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax-Burden Benchmark — effective GST + direct-tax outgo vs sector (feature #62)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference total-tax-outgo bands as % of revenue (GST net + direct tax).
const TAX_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 16, mid: 11, high: 6 },
  "Manufacturing (SMB)": { low: 15, mid: 10, high: 6 },
  "IT Services":         { low: 18, mid: 13, high: 8 },
};

function TaxBurdenBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const band = TAX_BANDS[sector] ?? TAX_BANDS["default"];
  const { months, revenue, hasRev } = useTtm();
  const rate = store.firm?.gstRate ?? 18;

  // Net GST payable across the TTM window + actual direct-tax cash paid.
  let gstNet = 0;
  months.forEach(m => {
    const monthKey = `20${m.month}`; // m.month is "YY-MM"
    const g = gstSummary(store.transactions ?? [], rate, monthKey);
    gstNet += g.netPayable;
  });
  const keys = months.map(m => m.month);
  const directTax = Math.abs((store.transactions ?? []).filter(t => t.amount < 0 && t.category === "tax" && keys.some(k => t.date.slice(2, 7) === k)).reduce((s, t) => s + t.amount, 0));
  const totalTax = gstNet + directTax;
  const burden = hasRev ? +((totalTax / revenue) * 100).toFixed(1) : null;
  const gstPctOfRev = hasRev ? +((gstNet / revenue) * 100).toFixed(1) : null;
  const directPctOfRev = hasRev ? +((directTax / revenue) * 100).toFixed(1) : null;

  const pct = burden !== null ? bandPercentile(burden, band.low, band.mid, band.high, false) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Tax-Burden Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Your effective tax outgo — net GST plus direct tax paid — as a % of TTM revenue, against typical <span className="text-[var(--color-text)]">{sector}</span> bands. Net GST is computed at your {rate}% rate after input credit; direct tax is cash actually paid.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue and tax transactions to compute your burden.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Total tax burden</p>
          <p className={`text-2xl font-bold tabular-nums ${burden === null ? "text-[var(--color-muted)]" : (pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{burden !== null ? `${burden}%` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Net GST (TTM)</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(gstNet)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{gstPctOfRev !== null ? `${gstPctOfRev}% of revenue` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Direct tax paid</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(directTax)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{directPctOfRev !== null ? `${directPctOfRev}% of revenue` : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}%</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Tax burden vs sector</h3>
        <BandRow label="Total tax / revenue" desc="Lower can mean better input-credit capture or a leaner mix." yours={burden} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter={false} />
        {burden !== null && burden > band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Your burden is above the typical range — check input-tax-credit capture and vendor GST uploads for leakage.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Net GST uses your output rate after input credit on expense transactions; it is an estimate, not a filed return. Direct tax reflects cash tagged to the tax category. Sector bands are indicative guides for typical Indian SMBs, not live peer data. Confirm with your CA.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EBITDA-Margin Benchmark — operating profitability band vs sector (feature #18/#62)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference EBITDA-margin bands (% of revenue; higher is better).
const EBITDA_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 6,  mid: 14, high: 24 },
  "Manufacturing (SMB)": { low: 5,  mid: 11, high: 19 },
  "IT Services":         { low: 12, mid: 22, high: 34 },
};

function EbitdaMarginBenchmark({ sector }: { sector: string }) {
  const band = EBITDA_BANDS[sector] ?? EBITDA_BANDS["default"];
  const { revenue, cost, payroll, hasRev } = useTtm();
  const ebitda = revenue - cost - payroll;
  const margin = hasRev ? +((ebitda / revenue) * 100).toFixed(1) : null;
  const pct = margin !== null ? bandPercentile(margin, band.low, band.mid, band.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  // Rupee EBITDA upside of reaching the sector median margin.
  const upside = margin !== null && margin < band.mid ? Math.round(((band.mid - margin) / 100) * revenue) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> EBITDA-Margin Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Your operating profitability — revenue minus direct costs and payroll, as a % of revenue — over the trailing 12 months, against typical <span className="text-[var(--color-text)]">{sector}</span> reference bands.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue transactions to compute your EBITDA margin.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">EBITDA margin</p>
          <p className={`text-2xl font-bold tabular-nums ${margin === null ? "text-[var(--color-muted)]" : margin >= band.mid ? "text-green-400" : "text-yellow-400"}`}>{margin !== null ? `${margin}%` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">EBITDA (TTM)</p>
          <p className={`text-2xl font-bold tabular-nums ${ebitda >= 0 ? "text-green-400" : "text-red-400"}`}>{hasRev ? formatCurrency(ebitda) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}%</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Upside to median</p>
          <p className={`text-2xl font-bold tabular-nums ${upside > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{upside > 0 ? `+${formatCurrency(upside)}` : "At/above"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">EBITDA margin vs sector</h3>
        <BandRow label="EBITDA margin" desc="Revenue minus direct costs and payroll, ÷ revenue." yours={margin} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter />
        {margin !== null && margin < band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Operating margin is below the typical range — review pricing, direct-cost leakage and payroll efficiency.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A pre-interest, pre-tax, pre-depreciation operating-margin proxy: depreciation and one-offs aren't separated out. Upside multiplies the margin gap by TTM revenue. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenue-Volatility Benchmark — month-to-month stability vs sector (feature #44)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference coefficient-of-variation bands (% — lower means steadier revenue).
const VOLATILITY_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 45, mid: 26, high: 14 },
  "Manufacturing (SMB)": { low: 52, mid: 30, high: 16 },
  "IT Services":         { low: 34, mid: 18, high: 9  },
};

function RevenueVolatilityBenchmark({ sector }: { sector: string }) {
  const band = VOLATILITY_BANDS[sector] ?? VOLATILITY_BANDS["default"];
  const series = useMonthlyRevenue();
  const nz = series.filter(m => m.revenue > 0);
  const revs = nz.map(m => m.revenue);
  const mean = revs.length ? revs.reduce((s, v) => s + v, 0) / revs.length : 0;
  const variance = revs.length ? revs.reduce((s, v) => s + (v - mean) ** 2, 0) / revs.length : 0;
  const std = Math.sqrt(variance);
  // Coefficient of variation as a %; lower = steadier. Needs ≥3 positive months.
  const cv = revs.length >= 3 && mean > 0 ? +((std / mean) * 100).toFixed(1) : null;
  const pct = cv !== null ? bandPercentile(cv, band.low, band.mid, band.high, false) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;

  const bars = nz.map(m => ({ month: m.month, revenue: m.revenue }));

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Waves size={14} className="text-[var(--color-primary)]" /> Revenue-Stability Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">How steady your monthly revenue is — measured as the coefficient of variation over the trailing 12 months — against typical <span className="text-[var(--color-text)]">{sector}</span> bands. Steadier revenue is easier to plan and finance.</p>
        {cv === null && <p className="text-xs text-yellow-400 mt-2">Needs at least 3 months of revenue to measure stability.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Volatility (CV)</p>
          <p className={`text-2xl font-bold tabular-nums ${cv === null ? "text-[var(--color-muted)]" : (pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{cv !== null ? `${cv}%` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Avg monthly revenue</p>
          <p className="text-2xl font-bold tabular-nums">{mean > 0 ? formatCurrency(Math.round(mean)) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Std deviation</p>
          <p className="text-2xl font-bold tabular-nums">{cv !== null ? formatCurrency(Math.round(std)) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median CV</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}%</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold mb-1">Monthly revenue spread</h3>
        <p className="text-xs text-[var(--color-muted)]">The wider the swing around your average, the higher the volatility.</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#7D8590" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : `${Math.round(v / 1e5)}L`} />
            <Tooltip contentStyle={{ background: "#161B22", border: "1px solid #21262D", borderRadius: 4, fontSize: 10 }} formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
            <Bar dataKey="revenue" radius={[2, 2, 0, 0]}>
              {bars.map((d, i) => <Cell key={i} fill={d.revenue >= mean ? "#1A6B55" : "#7D859055"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <BandRow label="Coefficient of variation" desc="Std deviation ÷ average revenue. Lower is steadier." yours={cv} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter={false} />
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Coefficient of variation = std deviation ÷ mean of monthly revenue. Genuine seasonality can read as high volatility; pair this with the seasonality view before acting. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Liquidity-Buffer Benchmark — months of opex held in cash vs sector (feature #4)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference bands for cash runway in months (higher = safer buffer).
const BUFFER_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 1.5, mid: 3,   high: 6 },
  "Manufacturing (SMB)": { low: 1,   mid: 2.5, high: 5 },
  "IT Services":         { low: 2,   mid: 4,   high: 8 },
};

function LiquidityBufferBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const band = BUFFER_BANDS[sector] ?? BUFFER_BANDS["default"];
  const balance = (store.bankAccounts ?? []).reduce((s, a) => s + a.balance, 0);
  const burn = monthlyBurn(store.transactions ?? []);
  // Months of operating expenses currently sitting in cash.
  const monthsBuffer = burn > 0 ? +(balance / burn).toFixed(1) : null;
  const pct = monthsBuffer !== null ? bandPercentile(monthsBuffer, band.low, band.mid, band.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  // Cash needed to reach the sector-median buffer.
  const targetCash = burn > 0 ? Math.round(band.mid * burn) : 0;
  const shortfall = monthsBuffer !== null && monthsBuffer < band.mid ? Math.max(0, targetCash - balance) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Liquidity-Buffer Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">How many months of operating spend you hold in cash right now, against typical <span className="text-[var(--color-text)]">{sector}</span> buffer bands. Computed live from linked balances and your monthly burn.</p>
        {monthsBuffer === null && <p className="text-xs text-yellow-400 mt-2">Add expense transactions so we can compute your monthly burn and buffer.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Months of buffer</p>
          <p className={`text-2xl font-bold tabular-nums ${monthsBuffer === null ? "text-[var(--color-muted)]" : monthsBuffer >= band.mid ? "text-green-400" : "text-yellow-400"}`}>{monthsBuffer !== null ? `${monthsBuffer}` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Cash balance</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(balance)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Monthly burn</p>
          <p className="text-2xl font-bold tabular-nums">{burn > 0 ? formatCurrency(Math.round(burn)) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">{shortfall > 0 ? "To reach median" : "Sector median"}</p>
          <p className={`text-2xl font-bold tabular-nums ${shortfall > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{shortfall > 0 ? `+${formatCurrency(shortfall)}` : `${band.mid} mo`}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Cash buffer vs sector</h3>
        <BandRow label="Months of opex in cash" desc="Cash balance ÷ monthly burn. Higher is safer." yours={monthsBuffer} unit=" mo" low={band.low} mid={band.mid} high={band.high} higherIsBetter />
        {monthsBuffer !== null && monthsBuffer < band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Buffer is below the typical floor — consider a working-capital line, faster collections or trimming non-essential spend.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Buffer = total linked cash ÷ average monthly burn (net cash outflow). It ignores undrawn credit lines and committed receivables. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debt-Leverage Benchmark — outstanding debt as a multiple of revenue (feature #80)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference debt/revenue bands (x of annual revenue; lower is safer).
const LEVERAGE_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 0.7, mid: 0.4, high: 0.15 },
  "Manufacturing (SMB)": { low: 0.9, mid: 0.55, high: 0.25 },
  "IT Services":         { low: 0.4, mid: 0.2, high: 0.05 },
};

function DebtLeverageBenchmark({ sector }: { sector: string }) {
  const { store } = useApp();
  const band = LEVERAGE_BANDS[sector] ?? LEVERAGE_BANDS["default"];
  const { revenue, hasRev } = useTtm();
  const loans = store.activeLoans ?? [];
  const totalDebt = loans.reduce((s, l) => s + l.outstanding, 0);
  const annualEmi = loans.reduce((s, l) => s + l.monthlyEmi * 12, 0);
  // Debt as a multiple of TTM revenue; lower is safer.
  const ratio = hasRev ? +(totalDebt / revenue).toFixed(2) : null;
  const dsRatio = hasRev ? +((annualEmi / revenue) * 100).toFixed(1) : null; // debt-service % of revenue
  const pct = ratio !== null ? bandPercentile(ratio, band.low, band.mid, band.high, false) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Debt-Leverage Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Your outstanding borrowings as a multiple of trailing-12-month revenue, against typical <span className="text-[var(--color-text)]">{sector}</span> bands. Lower leverage means more borrowing headroom and lower default risk.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue to compute your leverage.</p>}
        {hasRev && totalDebt === 0 && <p className="text-xs text-green-400 mt-2">No active loans on record — you are unlevered.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Debt / revenue</p>
          <p className={`text-2xl font-bold tabular-nums ${ratio === null ? "text-[var(--color-muted)]" : (pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{ratio !== null ? `${ratio}x` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Outstanding debt</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalDebt)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">{loans.length} loan(s)</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Debt service / rev</p>
          <p className={`text-2xl font-bold tabular-nums ${dsRatio === null ? "text-[var(--color-muted)]" : dsRatio <= 20 ? "text-green-400" : "text-yellow-400"}`}>{dsRatio !== null ? `${dsRatio}%` : "—"}</p>
          <p className="text-[10px] text-[var(--color-muted)]">annual EMI ÷ revenue</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}x</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Leverage vs sector</h3>
        <BandRow label="Debt / annual revenue" desc="Total outstanding borrowings ÷ TTM revenue. Lower is safer." yours={ratio} unit="x" low={band.low} mid={band.mid} high={band.high} higherIsBetter={false} />
        {ratio !== null && ratio > band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Leverage is above the typical range — prioritise deleveraging or refinancing before taking on new debt.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Uses outstanding principal across active loans ÷ TTM revenue; it excludes trade payables and undrawn limits. Debt service is the annual EMI run-rate. Reference bands are indicative for typical Indian SMBs, not live peer data. Confirm with your lender or CA.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Opex-Efficiency Benchmark — operating spend (ex-payroll) as % of revenue (#54)
// ─────────────────────────────────────────────────────────────────────────────
// Sector reference opex/revenue bands (% — lower is leaner).
const OPEX_EFF_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 78, mid: 60, high: 42 },
  "Manufacturing (SMB)": { low: 84, mid: 68, high: 52 },
  "IT Services":         { low: 58, mid: 40, high: 26 },
};

function OpexEfficiencyBenchmark({ sector }: { sector: string }) {
  const band = OPEX_EFF_BANDS[sector] ?? OPEX_EFF_BANDS["default"];
  const { revenue, cost, hasRev } = useTtm();
  // Operating spend excludes payroll (counted separately elsewhere).
  const opexRatio = hasRev ? +((cost / revenue) * 100).toFixed(1) : null;
  const pct = opexRatio !== null ? bandPercentile(opexRatio, band.low, band.mid, band.high, false) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  // Rupee saving from trimming opex to the sector-median ratio.
  const saving = opexRatio !== null && opexRatio > band.mid ? Math.round(((opexRatio - band.mid) / 100) * revenue) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><SlidersHorizontal size={14} className="text-[var(--color-primary)]" /> Opex-Efficiency Benchmark</h2>
        <p className="text-xs text-[var(--color-muted)]">Your operating spend (excluding payroll) as a % of trailing-12-month revenue, against typical <span className="text-[var(--color-text)]">{sector}</span> bands. A lower ratio means each rupee of revenue costs less to run.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue and expense transactions to compute your opex ratio.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Opex / revenue</p>
          <p className={`text-2xl font-bold tabular-nums ${opexRatio === null ? "text-[var(--color-muted)]" : (pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{opexRatio !== null ? `${opexRatio}%` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Operating spend (TTM)</p>
          <p className="text-2xl font-bold tabular-nums">{hasRev ? formatCurrency(cost) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}%</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Saving to median</p>
          <p className={`text-2xl font-bold tabular-nums ${saving > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{saving > 0 ? formatCurrency(saving) : "At/below"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Opex ratio vs sector</h3>
        <BandRow label="Operating spend / revenue" desc="Non-payroll operating costs ÷ TTM revenue. Lower is leaner." yours={opexRatio} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter={false} />
        {opexRatio !== null && opexRatio > band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Opex is above the typical range — review vendor spend, subscriptions and discretionary costs for savings.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Operating spend excludes payroll (benchmarked separately) and is taken net of nothing — it includes all non-payroll cash outflows tagged as costs. Saving multiplies the ratio gap by TTM revenue. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Net-Margin Band — TTM net margin (after payroll + estimated interest) vs sector
// ─────────────────────────────────────────────────────────────────────────────
const NET_MARGIN_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 2, mid: 8,  high: 18 },
  "Manufacturing (SMB)": { low: 1, mid: 6,  high: 14 },
  "IT Services":         { low: 6, mid: 16, high: 28 },
};

function NetMarginBandBenchmark({ sector }: { sector: string }) {
  const band = NET_MARGIN_BANDS[sector] ?? NET_MARGIN_BANDS["default"];
  const { store } = useApp();
  const { revenue, cost, payroll, hasRev } = useTtm();
  const emiMonthly = (store.activeLoans ?? []).reduce((s, l) => s + l.monthlyEmi, 0);
  const interestY = emiMonthly * 12 * 0.4; // ~40% of EMI is interest early in tenure
  const netProfit = revenue - cost - payroll - interestY;
  const netMargin = hasRev ? +((netProfit / revenue) * 100).toFixed(1) : null;
  const pct = netMargin !== null ? bandPercentile(netMargin, band.low, band.mid, band.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  // Rupee upside of reaching the sector-median net margin.
  const upside = netMargin !== null && netMargin < band.mid ? Math.round(((band.mid - netMargin) / 100) * revenue) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> Net-Margin Band</h2>
        <p className="text-xs text-[var(--color-muted)]">Your trailing-12-month net margin — revenue less direct costs, payroll and estimated loan interest — placed against indicative <span className="text-[var(--color-text)]">{sector}</span> bands.</p>
        {!hasRev && <p className="text-xs text-yellow-400 mt-2">Add 12 months of revenue and expense transactions to compute your net margin.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Net margin</p>
          <p className={`text-2xl font-bold tabular-nums ${netMargin === null ? "text-[var(--color-muted)]" : netMargin >= band.mid ? "text-green-400" : "text-yellow-400"}`}>{netMargin !== null ? `${netMargin}%` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">TTM net profit</p>
          <p className={`text-2xl font-bold tabular-nums ${netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{hasRev ? formatCurrency(netProfit) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Sector median</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-muted)]">{band.mid}%</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Upside to median</p>
          <p className={`text-2xl font-bold tabular-nums ${upside > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{upside > 0 ? `+${formatCurrency(upside)}` : "At/above"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Net margin vs sector</h3>
        <BandRow label="Net margin (after payroll & interest)" desc="TTM net profit ÷ TTM revenue. Higher is healthier." yours={netMargin} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter={true} />
        {netMargin !== null && netMargin < band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Net margin is below the typical range — review pricing, direct costs and overhead to widen the gap.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Interest is estimated at ~40% of total EMI; tax is not deducted, so this is a pre-tax operating net margin. Upside multiplies the margin gap by TTM revenue. Reference bands are indicative for typical Indian SMBs, not live peer data. Confirm with your CA before acting.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash-Runway Band — months of burn covered by current cash vs sector
// ─────────────────────────────────────────────────────────────────────────────
const RUNWAY_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 1.5, mid: 2.6, high: 4.0 },
  "Manufacturing (SMB)": { low: 1.0, mid: 2.0, high: 3.7 },
  "IT Services":         { low: 2.0, mid: 3.2, high: 5.0 },
};

function CashRunwayBandBenchmark({ sector }: { sector: string }) {
  const band = RUNWAY_BANDS[sector] ?? RUNWAY_BANDS["default"];
  const { store } = useApp();
  const balance = store.bankAccounts.reduce((s, a) => s + a.balance, 0);
  const burn = monthlyBurn(store.transactions ?? []);
  const months = burn > 0 ? +(balance / burn).toFixed(1) : null;
  const pct = months !== null ? bandPercentile(months, band.low, band.mid, band.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  // Cash needed to reach the sector-median runway.
  const gapCash = months !== null && months < band.mid ? Math.round((band.mid - months) * burn) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> Cash-Runway Band</h2>
        <p className="text-xs text-[var(--color-muted)]">How many months of net burn your current cash balance covers, against indicative <span className="text-[var(--color-text)]">{sector}</span> runway bands. A longer runway is a stronger safety buffer.</p>
        {months === null && <p className="text-xs text-yellow-400 mt-2">No net monthly burn detected — add expense transactions to compute your runway.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Runway</p>
          <p className={`text-2xl font-bold tabular-nums ${months === null ? "text-[var(--color-muted)]" : (pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{months !== null ? `${months} mo` : "—"}</p>
          {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Cash balance</p>
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(balance)}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Monthly burn</p>
          <p className="text-2xl font-bold tabular-nums">{burn > 0 ? formatCurrency(burn) : "—"}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Cash to median runway</p>
          <p className={`text-2xl font-bold tabular-nums ${gapCash > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{gapCash > 0 ? `+${formatCurrency(gapCash)}` : "At/above"}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Runway vs sector</h3>
        <BandRow label="Months of burn covered" desc="Cash balance ÷ net monthly burn. Higher is safer." yours={months} unit=" mo" low={band.low} mid={band.mid} high={band.high} higherIsBetter={true} />
        {months !== null && months < band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Runway is below the typical range — accelerate collections, trim burn or secure a credit line before cash tightens.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Burn is net monthly outflow from recent transactions; a single lumpy month can distort it. Cash-to-median multiplies the runway gap by monthly burn. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-Retention Band — % of prior customers who reordered, vs sector
// ─────────────────────────────────────────────────────────────────────────────
const RETENTION_BANDS: Record<string, { low: number; mid: number; high: number }> = {
  default:               { low: 45, mid: 62, high: 80 },
  "Manufacturing (SMB)": { low: 55, mid: 72, high: 88 },
  "IT Services":         { low: 60, mid: 78, high: 92 },
};

function CustomerRetentionBandBenchmark({ sector }: { sector: string }) {
  const band = RETENTION_BANDS[sector] ?? RETENTION_BANDS["default"];
  const { store } = useApp();
  const invoices = store.invoices ?? [];

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const named = (s: string) => (s ?? "").trim().toLowerCase();

  // Prior window: customers invoiced before the last 6 months. Recent window: last 6 months.
  const priorSet = new Set<string>();
  const recentSet = new Set<string>();
  for (const inv of invoices) {
    const d = (inv.invoiceDate ?? "").slice(0, 7);
    const c = named(inv.customer);
    if (!c || !d) continue;
    if (d < cutoffKey) priorSet.add(c);
    else recentSet.add(c);
  }
  const priorCount = priorSet.size;
  let retained = 0;
  priorSet.forEach(c => { if (recentSet.has(c)) retained += 1; });
  const retention = priorCount > 0 ? +((retained / priorCount) * 100).toFixed(1) : null;
  const pct = retention !== null ? bandPercentile(retention, band.low, band.mid, band.high, true) : null;
  const lbl = pct !== null ? bandLabel(pct) : null;
  const lapsed = priorCount - retained;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><HeartHandshake size={14} className="text-[var(--color-primary)]" /> Customer-Retention Band</h2>
        <p className="text-xs text-[var(--color-muted)]">The share of customers invoiced before the last 6 months who were invoiced again in the last 6 months, against indicative <span className="text-[var(--color-text)]">{sector}</span> retention bands.</p>
        {retention === null && (
          <EmptyStateInline description="Add invoices spanning more than 6 months so prior customers can be matched against recent ones." />
        )}
      </div>

      {retention !== null && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Retention</p>
            <p className={`text-2xl font-bold tabular-nums ${(pct ?? 0) >= 50 ? "text-green-400" : "text-yellow-400"}`}>{retention}%</p>
            {lbl && <p className={`text-[11px] font-medium ${lbl.color}`}>{lbl.label}</p>}
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Prior customers</p>
            <p className="text-2xl font-bold tabular-nums">{priorCount}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Retained</p>
            <p className="text-2xl font-bold tabular-nums text-green-400">{retained}</p>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">Lapsed</p>
            <p className={`text-2xl font-bold tabular-nums ${lapsed > 0 ? "text-yellow-400" : "text-green-400"}`}>{lapsed}</p>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold">Retention vs sector</h3>
        <BandRow label="Repeat-customer rate" desc="Prior customers who reordered ÷ all prior customers. Higher is stickier." yours={retention} unit="%" low={band.low} mid={band.mid} high={band.high} higherIsBetter={true} />
        {retention !== null && retention < band.low && (
          <p className="flex items-start gap-1.5 text-xs text-yellow-400"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Retention is below the typical range — {lapsed} prior customer(s) haven't reordered; a win-back outreach could recover revenue.</p>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Customers are matched by name (case-insensitive); naming inconsistencies can understate retention. Windows are split at 6 months before today. Reference bands are indicative for typical Indian SMBs, not live peer data.</p>
    </div>
  );
}

/** Tiny inline empty-state used inside header cards above. */
function EmptyStateInline({ description }: { description: string }) {
  return <p className="text-xs text-yellow-400 mt-2">{description}</p>;
}
