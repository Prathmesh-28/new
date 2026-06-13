import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { computeFinancialSnapshot, agingBuckets, financingOptions, earlyPayAnnualizedReturn } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { RefreshCcw, ArrowRight, Receipt, Package, Building2, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BUCKET_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#b91c1c"];

export default function WorkingCapitalPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const aging = useMemo(() => agingBuckets(store.invoices), [store.invoices]);
  const options = useMemo(
    () => financingOptions(snap.workingCapitalGap, snap.accountsReceivable),
    [snap.workingCapitalGap, snap.accountsReceivable],
  );

  const cycleSegments = [
    { label: "DSO — money stuck with customers", days: snap.dsoDays, color: "bg-yellow-500", path: "/receivables", icon: Receipt, hint: "Collect faster: auto-reminders, early-pay discounts" },
    { label: "DIO — money stuck in inventory", days: snap.dioDays, color: "bg-orange-500", path: "/operations", icon: Package, hint: "Clear slow stock, order tighter against demand" },
    { label: "DPO — free credit from suppliers", days: snap.dpoDays, color: "bg-green-500", path: "/vendors", icon: Building2, hint: "Longer DPO shortens your cycle (negotiate terms)" },
  ];
  const maxDays = Math.max(snap.dsoDays, snap.dioDays, snap.dpoDays, 1);

  const overduePct = snap.accountsReceivable > 0 ? Math.round((snap.overdueReceivable / snap.accountsReceivable) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><RefreshCcw size={18} className="text-[var(--color-primary)]" /> Working Capital</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Cash Conversion Cycle = DSO + DIO − DPO. Every day in the cycle is cash you must fund yourself.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Cash Conversion Cycle", value: `${snap.cccDays} days`, color: snap.cccDays <= 45 ? "text-green-400" : snap.cccDays <= 75 ? "text-yellow-400" : "text-red-400", sub: "Target ≤ 45 days" },
          { label: "Receivables (DSO)", value: `${snap.dsoDays} days`, color: snap.dsoDays <= 45 ? "text-green-400" : "text-yellow-400", sub: formatAmount(snap.accountsReceivable) + " outstanding" },
          { label: "Inventory (DIO)", value: `${snap.dioDays} days`, color: snap.dioDays <= 60 ? "text-green-400" : "text-yellow-400", sub: formatAmount(snap.inventoryValue) + " on shelf" },
          { label: "Payables (DPO)", value: `${snap.dpoDays} days`, color: "text-[var(--color-primary)]", sub: formatAmount(snap.accountsPayable) + " owed to suppliers" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Funding gap callout */}
      {snap.workingCapitalGap > 0 && (
        <div className="bg-orange-950/30 border border-orange-800/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-orange-400 shrink-0" />
            <p className="text-sm">
              Your {snap.cccDays}-day cycle ties up <strong className="text-orange-400">{formatAmount(snap.workingCapitalGap)}</strong> of
              cash ({(snap.cccDays / 30).toFixed(1)} months of operating spend). The options below are ranked by true annual cost.
            </p>
          </div>
        </div>
      )}

      {/* Cycle visual */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-4">Where the days go</p>
        <div className="space-y-4">
          {cycleSegments.map(seg => (
            <div key={seg.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <seg.icon size={13} className="text-[var(--color-muted)]" />
                  <span className="text-sm font-medium">{seg.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums">{seg.days}d</span>
                  <button onClick={() => navigate(seg.path)} className="text-[10px] text-[var(--color-primary)] hover:underline">Open →</button>
                </div>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${seg.color}`} style={{ width: `${(seg.days / maxDays) * 100}%` }} />
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">{seg.hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
          <span className="font-medium">Net cycle: {snap.dsoDays} + {snap.dioDays} − {snap.dpoDays}</span>
          <span className={`font-bold ${snap.cccDays <= 45 ? "text-green-400" : "text-red-400"}`}>{snap.cccDays} days</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AR aging */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">Receivables Ageing</p>
            <button onClick={() => navigate("/receivables")} className="text-[10px] text-[var(--color-primary)] hover:underline">Kanban view →</button>
          </div>
          {snap.accountsReceivable === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-8 text-center">No open invoices — create them under Invoices.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={aging}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Outstanding"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {aging.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-[var(--color-muted)] mt-2">
                {overduePct}% of receivables are past due ({formatAmount(snap.overdueReceivable)}). Cash collected here closes the gap at zero cost.
              </p>
            </>
          )}
        </div>

        {/* Early-pay economics */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-1">Early-Payment Discount Economics</p>
          <p className="text-xs text-[var(--color-muted)] mb-4">Annualised return of common discount terms — offer these to customers (or grab them from suppliers).</p>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Terms", "Days Early", "Annualised %", "Verdict"].map(h => <th key={h} className="py-2 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {[
                { terms: "1/10 net 30", disc: 1, days: 20 },
                { terms: "2/10 net 30", disc: 2, days: 20 },
                { terms: "2/10 net 45", disc: 2, days: 35 },
                { terms: "3/15 net 60", disc: 3, days: 45 },
              ].map(r => {
                const apr = earlyPayAnnualizedReturn(r.disc, r.days);
                const worth = apr > 18; // vs ~18% borrowing cost
                return (
                  <tr key={r.terms}>
                    <td className="py-2.5 font-mono text-xs">{r.terms}</td>
                    <td className="py-2.5 tabular-nums text-xs">{r.days}d</td>
                    <td className={`py-2.5 tabular-nums font-semibold ${worth ? "text-green-400" : "text-yellow-400"}`}>{apr.toFixed(0)}%</td>
                    <td className="py-2.5 text-[10px] text-[var(--color-muted)]">{worth ? "Take it — beats borrowing at 18%" : "Marginal vs credit line"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={() => navigate("/suppliers")} className="mt-3 text-[10px] text-[var(--color-primary)] hover:underline flex items-center gap-1">
            Open early-pay marketplace <ArrowRight size={9} />
          </button>
        </div>
      </div>

      {/* Financing options */}
      {options.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Funding the {formatAmount(snap.workingCapitalGap)} gap — ranked by effective annual cost</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Option", "How it works", "Eff. annual cost", "Monthly cost", "Speed", ""].map(h =>
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {options.map((o, i) => (
                  <tr key={o.key} className="hover:bg-white/2">
                    <td className="px-5 py-3 font-medium whitespace-nowrap">
                      {i === 0 && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full mr-2">CHEAPEST</span>}
                      {o.name}
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--color-muted)] max-w-[260px]">{o.description}</td>
                    <td className="px-5 py-3 tabular-nums font-semibold">{o.effectiveAnnualCostPct.toFixed(1)}%</td>
                    <td className="px-5 py-3 tabular-nums">{formatAmount(o.monthlyCost)}</td>
                    <td className="px-5 py-3 text-xs">{o.speed}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => navigate(o.path)}
                        className="text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25 whitespace-nowrap">
                        {o.cta} →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Capital Efficiency Simulator */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-1">Cash Release Simulator</p>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          How much cash you unlock by improving each cycle leg. Based on your {formatAmount(snap.monthlyExpense)}/month run rate.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Reduce DSO by 15 days",
              current: `${snap.dsoDays} days`,
              release: Math.round((15 / 30) * snap.monthlyExpense),
              how: "Send reminders at day 7, 14, 21 from invoice date. Offer 2% early-pay discount.",
              color: "text-yellow-400",
              barColor: "bg-yellow-500",
              pct: Math.min(100, (snap.dsoDays / 90) * 100),
            },
            {
              label: "Reduce DIO by 10 days",
              current: `${snap.dioDays} days`,
              release: Math.round((10 / 30) * snap.monthlyExpense),
              how: "Reduce reorder quantities, switch slow SKUs to just-in-time procurement.",
              color: "text-orange-400",
              barColor: "bg-orange-500",
              pct: Math.min(100, (snap.dioDays / 90) * 100),
            },
            {
              label: "Extend DPO by 10 days",
              current: `${snap.dpoDays} days`,
              release: Math.round((10 / 30) * snap.monthlyExpense),
              how: "Negotiate 45-day terms with top 3 suppliers (offer volume commitment).",
              color: "text-green-400",
              barColor: "bg-green-500",
              pct: Math.min(100, (snap.dpoDays / 60) * 100),
            },
          ].map(row => (
            <div key={row.label} className="bg-[var(--color-bg)] rounded-lg p-4 border border-[var(--color-border)]">
              <p className="text-[10px] text-[var(--color-muted)] mb-2">{row.label}</p>
              <p className={`text-xl font-bold tabular-nums ${row.color}`}>{formatAmount(row.release)} freed</p>
              <div className="mt-2 mb-1 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                <div className={`h-full ${row.barColor} rounded-full`} style={{ width: `${row.pct}%` }} />
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">Current: {row.current}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-2 leading-relaxed">{row.how}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">Combined impact of all three improvements</p>
          <p className="text-sm font-bold text-green-400">
            {formatAmount(Math.round(((15 + 10 + 10) / 30) * snap.monthlyExpense))} unlocked
          </p>
        </div>
      </div>

      {/* Working Capital Ratios */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <p className="text-sm font-semibold mb-4">Working Capital Ratios</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Current Ratio",
              value: snap.currentRatio !== null ? `${snap.currentRatio.toFixed(2)}x` : "—",
              target: "≥ 1.5x",
              ok: (snap.currentRatio ?? 2) >= 1.5,
              note: "Current assets ÷ current liabilities",
            },
            {
              label: "Quick Ratio",
              value: snap.quickRatio !== null ? `${snap.quickRatio.toFixed(2)}x` : "—",
              target: "≥ 1.0x",
              ok: (snap.quickRatio ?? 1.5) >= 1.0,
              note: "(Cash + AR) ÷ current liabilities",
            },
            {
              label: "Net Working Capital",
              value: formatAmount(snap.netWorkingCapital),
              target: "> ₹0",
              ok: snap.netWorkingCapital > 0,
              note: "Current assets minus current liabilities",
            },
            {
              label: "Cycle Funding Needed",
              value: formatAmount(snap.workingCapitalGap),
              target: "< 1 month opex",
              ok: snap.workingCapitalGap < snap.monthlyExpense,
              note: `${(snap.cccDays / 30).toFixed(1)} months × ${formatAmount(snap.monthlyExpense)} opex`,
            },
          ].map(r => (
            <div key={r.label} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
              <p className="text-[10px] text-[var(--color-muted)] mb-1">{r.label}</p>
              <p className={`text-base font-bold tabular-nums ${r.ok ? "text-green-400" : "text-red-400"}`}>{r.value}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Target {r.target}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">{r.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
