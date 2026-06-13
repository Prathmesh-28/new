import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, monthlyBurn } from "@/lib/utils";
import { BarChart3, TrendingUp, TrendingDown, Minus, Award, AlertTriangle, ChevronDown, Info } from "lucide-react";
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

export default function BenchmarksPage() {
  const { store }    = useApp();
  const { transactions, bankAccounts, firm } = store;

  const [sector, setSector] = useState("Manufacturing (SMB)");
  const [showSector, setShowSector] = useState(false);

  const burn    = monthlyBurn(transactions);
  const balance = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const runway  = burn > 0 ? Math.round(balance / (burn / 30)) : 0;

  const now  = new Date();
  const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const lastMDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastM = `${lastMDate.getFullYear()}-${String(lastMDate.getMonth()+1).padStart(2,"0")}`;
  const thisRev = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const lastRev = transactions.filter(t => t.date.startsWith(lastM) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const thisCost = Math.abs(transactions.filter(t => t.date.startsWith(thisM) && t.amount < 0 && t.category !== "payroll").reduce((s, t) => s + t.amount, 0));
  const payroll  = Math.abs(transactions.filter(t => t.date.startsWith(thisM) && t.category === "payroll").reduce((s, t) => s + t.amount, 0));

  const grossMargin = thisRev > 0 ? Math.round(((thisRev - thisCost) / thisRev) * 100) : null;
  const revGrowth   = lastRev > 0 ? parseFloat(((thisRev - lastRev) / lastRev * 100).toFixed(1)) : null;
  const payrollRatio= thisRev > 0 ? Math.round((payroll / thisRev) * 100) : null;
  const burnMultiple= thisRev > lastRev ? parseFloat((burn / Math.max(1, thisRev - lastRev)).toFixed(1)) : null;

  const baseBenchmarks = SECTOR_DATA[sector] ?? SECTOR_DATA["default"];
  const metrics: BenchmarkMetric[] = baseBenchmarks.map(m => ({
    ...m,
    yours: m.key === "gross_margin"   ? grossMargin
         : m.key === "runway"          ? (runway || null)
         : m.key === "revenue_growth"  ? revGrowth
         : m.key === "payroll_ratio"   ? payrollRatio
         : m.key === "burn_multiple"   ? burnMultiple
         : null,
  }));

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
            See how your business compares to peers in your sector — anonymized data from Headroom network.
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
          <p className="text-xs text-[var(--color-muted)] mb-4">Your business vs {sector} median</p>
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
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><span className="w-3 h-0.5 bg-[#7D8590] inline-block rounded" style={{ borderTop: "2px dashed #7D8590" }} /> Sector median</div>
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
                    <span>Median: {m.p50}{m.unit}</span>
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
        Benchmarks are anonymized aggregates from Headroom's SMB network segmented by sector and revenue band. Updated quarterly.
      </p>
    </div>
  );
}
