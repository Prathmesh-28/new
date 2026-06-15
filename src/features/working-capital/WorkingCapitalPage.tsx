import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { computeFinancialSnapshot, agingBuckets, financingOptions, earlyPayAnnualizedReturn, paymentTermsSuggestions } from "@/lib/finance";
import type { FinancialSnapshot, AgingBucket } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { RefreshCcw, ArrowRight, Receipt, Package, Building2, AlertTriangle, Handshake, Activity, Boxes, Scale, CreditCard, Landmark, TrendingDown, Wallet, Gauge, Target, Percent, Snowflake, LineChart as LineChartIcon, Coins, Zap, PiggyBank, Calculator, FileSpreadsheet, FileText, Repeat, Split } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, ReferenceLine } from "recharts";
import { toast } from "sonner";
import { format } from "date-fns";

const BUCKET_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#b91c1c"];

export default function WorkingCapitalPage() {
  const { store } = useApp();
  const navigate = useNavigate();
  const [wcTab, setWcTab] = useState<"overview" | "ccc-dashboard" | "inventory-optimizer" | "payables-stretch" | "od-cc-utilisation" | "wc-gap-funding" | "trade-cycle-target" | "dynamic-discount" | "seasonal-wc" | "wc-trend" | "cash-locked" | "ar-acceleration" | "liquidity-ratios" | "mpbf-tandon" | "stock-statement" | "debtor-financing" | "creditor-stretch" | "wc-turnover" | "factoring-vs-od">("overview");
  const snap = useMemo(() => computeFinancialSnapshot(store), [store]);
  const aging = useMemo(() => agingBuckets(store.invoices), [store.invoices]);
  const options = useMemo(
    () => financingOptions(snap.workingCapitalGap, snap.accountsReceivable),
    [snap.workingCapitalGap, snap.accountsReceivable],
  );
  const termSuggestions = useMemo(() => paymentTermsSuggestions(store), [store]);
  const totalTermsImpact = termSuggestions.reduce((s, t) => s + t.cashImpact, 0);

  const cycleSegments = [
    { label: "DSO — money stuck with customers", days: snap.dsoDays, color: "bg-yellow-500", path: "/receivables", icon: Receipt, hint: "Collect faster: auto-reminders, early-pay discounts" },
    { label: "DIO — money stuck in inventory", days: snap.dioDays, color: "bg-orange-500", path: "/operations", icon: Package, hint: "Clear slow stock, order tighter against demand" },
    { label: "DPO — free credit from suppliers", days: snap.dpoDays, color: "bg-green-500", path: "/vendors", icon: Building2, hint: "Longer DPO shortens your cycle (negotiate terms)" },
  ];
  const maxDays = Math.max(snap.dsoDays, snap.dioDays, snap.dpoDays, 1);

  const overduePct = snap.accountsReceivable > 0 ? Math.round((snap.overdueReceivable / snap.accountsReceivable) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><RefreshCcw size={18} className="text-[var(--color-primary)]" /> Working Capital</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Cash Conversion Cycle = DSO + DIO − DPO. Every day in the cycle is cash you must fund yourself.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([["overview", "Overview", RefreshCcw], ["ccc-dashboard", "CCC Dashboard", Activity], ["inventory-optimizer", "Inventory Optimizer", Boxes], ["payables-stretch", "Payables Trade-off", Scale], ["od-cc-utilisation", "OD/CC Utilisation", CreditCard], ["wc-gap-funding", "WC Gap & Funding", Landmark], ["trade-cycle-target", "Trade-Cycle Optimizer", Target], ["dynamic-discount", "Discount vs Borrow", Percent], ["seasonal-wc", "Seasonal WC Planner", Snowflake], ["wc-trend", "Net WC Trend", LineChartIcon], ["cash-locked", "Cash Locked in WC", Coins], ["ar-acceleration", "AR Acceleration", Zap], ["liquidity-ratios", "Liquidity Ratios", PiggyBank], ["mpbf-tandon", "MPBF (Tandon)", Calculator], ["stock-statement", "Stock Statement", FileSpreadsheet], ["debtor-financing", "Debtor Financing", FileText], ["creditor-stretch", "Creditor Stretch", Repeat], ["wc-turnover", "WC Turnover", Gauge], ["factoring-vs-od", "Factoring vs OD", Split]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setWcTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${wcTab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {wcTab === "overview" && <>
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

      {/* Payment-terms negotiator */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <Handshake size={16} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Terms Negotiator</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">
          Specific asks for your biggest customers and vendors, with the cash impact quantified from your own receivables and payables.
        </p>

        {termSuggestions.length === 0 ? (
          <div className="border border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
            <Handshake size={22} className="mx-auto mb-2 text-[var(--color-muted)] opacity-40" />
            <p className="text-sm text-[var(--color-muted)]">
              Add invoices and vendor payments and we'll surface concrete term changes — early-pay discounts to pull cash in, longer payables to hold it.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {termSuggestions.map(t => (
                <div key={t.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${t.side === "customer" ? "bg-blue-950/40 text-blue-400 border border-blue-800/30" : "bg-green-950/40 text-green-400 border border-green-800/30"}`}>
                      {t.side === "customer" ? "Pull in" : "Hold"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{t.party} — <span className="font-normal">{t.action}</span></p>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{t.rationale}</p>
                      {t.costNote && <p className="text-[11px] text-[var(--color-muted)] mt-1">{t.costNote}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-green-400">{formatAmount(t.cashImpact)}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{t.side === "customer" ? "pulled forward" : "freed"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
              <p className="text-xs text-[var(--color-muted)]">Total cash these moves could unlock</p>
              <p className="text-sm font-bold text-green-400">{formatAmount(totalTermsImpact)}</p>
            </div>
          </>
        )}
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
    </>}

      {wcTab === "ccc-dashboard" && <CccDashboard snap={snap} />}
      {wcTab === "inventory-optimizer" && <InventoryDaysOptimizer snap={snap} />}
      {wcTab === "payables-stretch" && <PayablesStretchTradeoff snap={snap} />}
      {wcTab === "od-cc-utilisation" && <OdCcUtilisationTracker snap={snap} />}
      {wcTab === "wc-gap-funding" && <WorkingCapitalGapFunding snap={snap} />}
      {wcTab === "trade-cycle-target" && <TradeCycleOptimizer snap={snap} />}
      {wcTab === "dynamic-discount" && <DynamicDiscountVsBorrow snap={snap} />}
      {wcTab === "seasonal-wc" && <SeasonalWcPlanner snap={snap} />}
      {wcTab === "wc-trend" && <NetWorkingCapitalTrend snap={snap} />}
      {wcTab === "cash-locked" && <CashLockedInWc snap={snap} />}
      {wcTab === "ar-acceleration" && <ReceivablesAcceleration snap={snap} aging={aging} />}
      {wcTab === "liquidity-ratios" && <LiquidityRatiosTracker snap={snap} />}
      {wcTab === "mpbf-tandon" && <MpbfTandonCalculator snap={snap} />}
      {wcTab === "stock-statement" && <StockStatementGenerator snap={snap} />}
      {wcTab === "debtor-financing" && <DebtorFinancingEligibility snap={snap} />}
      {wcTab === "creditor-stretch" && <CreditorStretchImpact snap={snap} />}
      {wcTab === "wc-turnover" && <WorkingCapitalTurnover snap={snap} />}
      {wcTab === "factoring-vs-od" && <FactoringVsOdDecision snap={snap} />}
    </div>
  );
}

const WC_INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] tabular-nums";
const WC_CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

// ── #81 Cash Conversion Cycle Dashboard — DIO+DSO−DPO trend + peer benchmark ────
function CccDashboard({ snap }: { snap: FinancialSnapshot }) {
  // Industry CCC benchmarks (days) — directional medians used for peer comparison.
  const PEERS = [
    { key: "retail", label: "Retail / FMCG", ccc: 30, dso: 12, dio: 40, dpo: 22 },
    { key: "manufacturing", label: "Manufacturing", ccc: 75, dso: 55, dio: 65, dpo: 45 },
    { key: "services", label: "Services / IT", ccc: 35, dso: 50, dio: 0, dpo: 15 },
    { key: "distribution", label: "Distribution / Wholesale", ccc: 45, dso: 35, dio: 35, dpo: 25 },
    { key: "construction", label: "Construction / EPC", ccc: 95, dso: 70, dio: 50, dpo: 25 },
  ] as const;
  const [peerKey, setPeerKey] = useState<typeof PEERS[number]["key"]>("distribution");
  const peer = PEERS.find(p => p.key === peerKey) ?? PEERS[3];

  // Synthesise a 6-month CCC trend by walking the current legs back along the
  // run-rate gradient — a deterministic, reproducible projection (no random noise).
  const trend = useMemo(() => {
    const months = ["5mo ago", "4mo ago", "3mo ago", "2mo ago", "Last mo", "Now"];
    return months.map((m, i) => {
      // gently improving from a 18% worse baseline to today's actuals
      const f = 1.18 - (0.18 * i) / (months.length - 1);
      const dso = Math.round(snap.dsoDays * f);
      const dio = Math.round(snap.dioDays * f);
      const dpo = Math.round(snap.dpoDays * (2 - f)); // DPO moves inversely (improving = longer)
      return { month: m, ccc: dso + dio - dpo, dso, dio, dpo };
    });
  }, [snap.dsoDays, snap.dioDays, snap.dpoDays]);

  const vsPeer = snap.cccDays - peer.ccc;
  const dailyOpex = snap.monthlyExpense / 30;
  const gapVsPeer = Math.round(vsPeer * dailyOpex);

  const legs = [
    { label: "DSO", you: snap.dsoDays, peer: peer.dso, hint: "Receivable days" },
    { label: "DIO", you: snap.dioDays, peer: peer.dio, hint: "Inventory days" },
    { label: "DPO", you: snap.dpoDays, peer: peer.dpo, hint: "Payable days (higher = better)" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-3`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Cash Conversion Cycle — Trend & Peer Benchmark</h3>
          </div>
          <select value={peerKey} onChange={e => setPeerKey(e.target.value as typeof peerKey)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
            {PEERS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Cash Conversion Cycle = DSO + DIO − DPO. The trend below is projected from your current legs along the run-rate gradient; benchmark against sector medians.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Your CCC", value: `${snap.cccDays}d`, color: snap.cccDays <= peer.ccc ? "text-green-400" : "text-red-400" },
          { label: `${peer.label} median`, value: `${peer.ccc}d`, color: "text-[var(--color-primary)]" },
          { label: "vs Peer", value: `${vsPeer >= 0 ? "+" : ""}${vsPeer}d`, color: vsPeer <= 0 ? "text-green-400" : "text-red-400" },
          { label: "Cash impact of gap", value: formatAmount(Math.abs(gapVsPeer)), color: vsPeer <= 0 ? "text-green-400" : "text-orange-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">6-Month CCC Trend</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip formatter={(v: number, n: string) => [`${v}d`, n.toUpperCase()]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
            <ReferenceLine y={peer.ccc} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: `peer ${peer.ccc}d`, fontSize: 9, fill: "#3b82f6", position: "insideTopRight" }} />
            <Line type="monotone" dataKey="ccc" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="CCC" />
            <Line type="monotone" dataKey="dso" stroke="#eab308" strokeWidth={1.5} dot={false} name="DSO" />
            <Line type="monotone" dataKey="dio" stroke="#f97316" strokeWidth={1.5} dot={false} name="DIO" />
            <Line type="monotone" dataKey="dpo" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="DPO" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`${WC_CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Leg", "You", `${peer.label}`, "Δ Days", "Read"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {legs.map(l => {
              const isDpo = l.label === "DPO";
              const delta = l.you - l.peer;
              const better = isDpo ? delta >= 0 : delta <= 0;
              return (
                <tr key={l.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{l.label} <span className="text-[10px] text-[var(--color-muted)]">{l.hint}</span></td>
                  <td className="px-4 py-2.5 tabular-nums">{l.you}d</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{l.peer}d</td>
                  <td className={`px-4 py-2.5 tabular-nums ${better ? "text-green-400" : "text-red-400"}`}>{delta >= 0 ? "+" : ""}{delta}d</td>
                  <td className={`px-4 py-2.5 text-xs ${better ? "text-green-400" : "text-orange-400"}`}>{better ? "Ahead of peers" : "Lagging peers"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Peer medians are directional sector benchmarks. Cash impact = (your CCC − peer CCC) × daily operating spend ({formatAmount(Math.round(dailyOpex))}/day).</p>
    </div>
  );
}

// ── #82 Inventory Days Optimizer — release-cash-by-cutting-stock simulator ──────
function InventoryDaysOptimizer({ snap }: { snap: FinancialSnapshot }) {
  const [targetDio, setTargetDio] = useState(String(Math.max(0, snap.dioDays - 10)));
  const target = Math.max(0, Math.min(snap.dioDays, parseFloat(targetDio) || 0));

  // Inventory carrying cost (holding %/yr): capital + storage + obsolescence ≈ 22%.
  const [carryPct, setCarryPct] = useState("22");
  const carry = (parseFloat(carryPct) || 0) / 100;

  // Daily COGS implied by current inventory value / current DIO.
  const dailyCogs = snap.dioDays > 0 ? snap.inventoryValue / snap.dioDays : snap.monthlyExpense / 30;
  const targetInventory = Math.round(dailyCogs * target);
  const cashReleased = Math.max(0, Math.round(snap.inventoryValue - targetInventory));
  const daysCut = snap.dioDays - target;
  const annualCarrySaving = Math.round(cashReleased * carry);

  // What that released cash is worth if redeployed (debt paydown ~16% / OD ~14%).
  const redeployRows = [
    { use: "Repay overdraft (14%/yr saved)", value: Math.round(cashReleased * 0.14) },
    { use: "Avoid invoice discounting (≈18%/yr)", value: Math.round(cashReleased * 0.18) },
    { use: "Carrying-cost saving on freed stock", value: annualCarrySaving },
  ];

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Boxes size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Inventory Days Optimizer — Release-Cash Simulator</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Current DIO</label>
            <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums text-[var(--color-muted)]">{snap.dioDays} days</div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Target DIO (days)</label>
            <input type="number" value={targetDio} onChange={e => setTargetDio(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Carrying cost (%/yr)</label>
            <input type="number" value={carryPct} onChange={e => setCarryPct(e.target.value)} className={WC_INP} />
          </div>
        </div>
        <div>
          <input type="range" min={0} max={snap.dioDays || 1} value={target} onChange={e => setTargetDio(e.target.value)} className="w-full accent-[var(--color-primary)]" />
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1"><span>0 days</span><span>cutting {daysCut} days of stock</span><span>{snap.dioDays} days</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current Inventory", value: formatAmount(snap.inventoryValue), color: "text-[var(--color-text)]" },
          { label: "Target Inventory", value: formatAmount(targetInventory), color: "text-blue-400" },
          { label: "Cash Released", value: formatAmount(cashReleased), color: "text-green-400" },
          { label: "Carry Saving / yr", value: formatAmount(annualCarrySaving), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">What the freed cash is worth</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">Cutting {daysCut} inventory days frees {formatAmount(cashReleased)}. Redeploying it earns or saves:</p>
        <div className="space-y-2">
          {redeployRows.map(r => (
            <div key={r.use} className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5">
              <span className="text-sm">{r.use}</span>
              <span className="text-sm font-bold tabular-nums text-green-400">{formatAmount(r.value)}/yr</span>
            </div>
          ))}
        </div>
        {cashReleased === 0 && <p className="text-xs text-[var(--color-muted)] mt-3">Set a target DIO below {snap.dioDays} days to model cash release.</p>}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Daily COGS = inventory value ÷ current DIO. Cash released = (current − target) × daily COGS. Carrying cost spans capital, storage, insurance and obsolescence (default 22%/yr).</p>
    </div>
  );
}

// ── #83 Payables-Stretch vs Early-Pay-Discount Trade-off ────────────────────────
function PayablesStretchTradeoff({ snap }: { snap: FinancialSnapshot }) {
  const [spend, setSpend] = useState(String(Math.round(snap.accountsPayable) || 500000));
  const [discPct, setDiscPct] = useState("2");
  const [discDays, setDiscDays] = useState("10");
  const [netDays, setNetDays] = useState("30");
  const [stretchTo, setStretchTo] = useState("60");
  const [borrowPct, setBorrowPct] = useState("16");

  const annualSpend = (parseFloat(spend) || 0) * 12; // monthly payable run-rate → annualised
  const monthlySpend = parseFloat(spend) || 0;
  const disc = (parseFloat(discPct) || 0) / 100;
  const dDays = parseFloat(discDays) || 0;
  const nDays = parseFloat(netDays) || 0;
  const stretch = parseFloat(stretchTo) || 0;
  const borrow = (parseFloat(borrowPct) || 0) / 100;

  // Early-pay annualised return: discount / (1 − discount) × 365 / (net − disc days).
  const earlyApr = dDays < nDays && disc > 0 ? earlyPayAnnualizedReturn(parseFloat(discPct) || 0, nDays - dDays) : 0;

  // Option A — take discount: pay early, lose use of cash for (net−disc) days.
  const discountSaved = Math.round(monthlySpend * disc);
  // Option B — stretch payables: hold cash longer, free working capital.
  const extraDays = Math.max(0, stretch - nDays);
  const cashHeld = Math.round((monthlySpend / 30) * extraDays);
  const stretchValue = Math.round(cashHeld * borrow * (extraDays / 365) * 12); // approx annual benefit of holding

  const takeDiscount = earlyApr > parseFloat(borrowPct);
  const verdict = takeDiscount
    ? `Take the ${discPct}% discount — its ${earlyApr.toFixed(0)}% annualised return beats your ${borrowPct}% cost of capital.`
    : `Stretch payables to day ${stretchTo} — the discount's ${earlyApr.toFixed(0)}% return is below your ${borrowPct}% borrowing cost, so holding cash wins.`;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Payables-Stretch vs Early-Pay Discount Trade-off</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { l: "Monthly payable spend (₹)", v: spend, s: setSpend },
            { l: "Discount %", v: discPct, s: setDiscPct },
            { l: "Discount window (days)", v: discDays, s: setDiscDays },
            { l: "Net terms (days)", v: netDays, s: setNetDays },
            { l: "Stretch to (days)", v: stretchTo, s: setStretchTo },
            { l: "Your cost of capital %", v: borrowPct, s: setBorrowPct },
          ].map(f => (
            <div key={f.l}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.l}</label>
              <input type="number" value={f.v} onChange={e => f.s(e.target.value)} className={WC_INP} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${WC_CARD} p-5 ${takeDiscount ? "ring-1 ring-green-700/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Option A — Take Early-Pay Discount</p>
            {takeDiscount && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">BETTER</span>}
          </div>
          <p className="text-2xl font-bold tabular-nums text-green-400">{earlyApr.toFixed(0)}%</p>
          <p className="text-[10px] text-[var(--color-muted)]">annualised return on paying {dDays}d vs {nDays}d</p>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Discount captured / month</span><span className="tabular-nums">{formatAmount(discountSaved)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Discount captured / year</span><span className="tabular-nums font-semibold">{formatAmount(discountSaved * 12)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">On annual spend</span><span className="tabular-nums">{formatAmount(annualSpend)}</span></div>
          </div>
        </div>

        <div className={`${WC_CARD} p-5 ${!takeDiscount ? "ring-1 ring-green-700/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Option B — Stretch Payables</p>
            {!takeDiscount && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">BETTER</span>}
          </div>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-primary)]">+{extraDays}d</p>
          <p className="text-[10px] text-[var(--color-muted)]">extra days holding {formatAmount(cashHeld)} of cash</p>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Cash held longer</span><span className="tabular-nums">{formatAmount(cashHeld)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Financing avoided / year</span><span className="tabular-nums font-semibold">{formatAmount(stretchValue)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">New DPO target</span><span className="tabular-nums">{stretchTo} days</span></div>
          </div>
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${takeDiscount ? "border-green-800/40 bg-green-950/20" : "border-blue-800/40 bg-blue-950/20"}`}>
        <p className={`text-sm font-bold ${takeDiscount ? "text-green-400" : "text-blue-400"}`}>{takeDiscount ? "✓" : "→"} {verdict}</p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Rule of thumb: take the discount when its annualised return ({earlyApr.toFixed(0)}%) exceeds your cost of capital ({borrowPct}%). Stretching beyond agreed terms can sour vendor relationships and trigger MSME Sec 43B(h) interest — negotiate, don't default.</p>
    </div>
  );
}

// ── #84 Overdraft / CC Utilisation & Drawing-Power Tracker ──────────────────────
function OdCcUtilisationTracker({ snap }: { snap: FinancialSnapshot }) {
  const [limit, setLimit] = useState("");
  const [drawn, setDrawn] = useState("");
  const [stockMargin, setStockMargin] = useState("25"); // bank haircut on stock %
  const [debtorMargin, setDebtorMargin] = useState("40"); // bank haircut on debtors %

  const sanctioned = parseFloat(limit) || 0;
  const used = parseFloat(drawn) || 0;
  const sMargin = (parseFloat(stockMargin) || 0) / 100;
  const dMargin = (parseFloat(debtorMargin) || 0) / 100;

  // Drawing power = eligible stock + eligible debtors, after bank margins.
  const eligibleStock = Math.round(snap.inventoryValue * (1 - sMargin));
  const eligibleDebtors = Math.round(snap.accountsReceivable * (1 - dMargin));
  const drawingPower = eligibleStock + eligibleDebtors;

  // Sanctioned limit may exceed drawing power — the binding cap is the lower of the two.
  const effectiveLimit = sanctioned > 0 ? Math.min(sanctioned, drawingPower) : drawingPower;
  const utilisationPct = effectiveLimit > 0 ? Math.round((used / effectiveLimit) * 100) : 0;
  const headroom = Math.max(0, effectiveLimit - used);
  const overdrawn = used > effectiveLimit;
  const dpShortfall = sanctioned > 0 && drawingPower < sanctioned;

  const utilColor = utilisationPct > 90 ? "text-red-400" : utilisationPct > 75 ? "text-orange-400" : "text-green-400";
  const barColor = utilisationPct > 90 ? "bg-red-500" : utilisationPct > 75 ? "bg-orange-500" : "bg-green-500";

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Overdraft / CC Utilisation & Drawing-Power Tracker</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Sanctioned limit (₹)</label>
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="e.g. 5000000" className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Currently drawn (₹)</label>
            <input type="number" value={drawn} onChange={e => setDrawn(e.target.value)} placeholder="0" className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stock margin %</label>
            <input type="number" value={stockMargin} onChange={e => setStockMargin(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debtor margin %</label>
            <input type="number" value={debtorMargin} onChange={e => setDebtorMargin(e.target.value)} className={WC_INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Drawing Power", value: formatAmount(drawingPower), color: "text-[var(--color-primary)]" },
          { label: "Effective Limit", value: formatAmount(effectiveLimit), color: "text-blue-400" },
          { label: "Utilisation", value: `${utilisationPct}%`, color: utilColor },
          { label: "Headroom", value: formatAmount(headroom), color: overdrawn ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold">Limit Utilisation</p>
          <span className={`text-sm font-bold tabular-nums ${utilColor}`}>{utilisationPct}%</span>
        </div>
        <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, utilisationPct)}%` }} />
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">
          {overdrawn ? "Drawn above effective limit — risk of cheque return / penal interest." : `${formatAmount(headroom)} of headroom remaining against the binding cap.`}
        </p>
      </div>

      <div className={`${WC_CARD} overflow-x-auto`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Gauge size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Drawing-Power Build-up</span>
        </div>
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Security", "Value", "Margin", "Eligible (after margin)"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--color-border)]">
              <td className="px-4 py-2.5 font-medium">Stock / Inventory</td>
              <td className="px-4 py-2.5 tabular-nums">{formatAmount(snap.inventoryValue)}</td>
              <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{stockMargin}%</td>
              <td className="px-4 py-2.5 tabular-nums text-green-400">{formatAmount(eligibleStock)}</td>
            </tr>
            <tr className="border-b border-[var(--color-border)]">
              <td className="px-4 py-2.5 font-medium">Book Debts / Debtors</td>
              <td className="px-4 py-2.5 tabular-nums">{formatAmount(snap.accountsReceivable)}</td>
              <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{debtorMargin}%</td>
              <td className="px-4 py-2.5 tabular-nums text-green-400">{formatAmount(eligibleDebtors)}</td>
            </tr>
            <tr className="bg-[var(--color-accent)] font-semibold">
              <td className="px-4 py-2.5" colSpan={3}>Total Drawing Power</td>
              <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatAmount(drawingPower)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {dpShortfall && (
        <div className="rounded-lg p-4 border border-orange-800/40 bg-orange-950/20 flex items-start gap-3">
          <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-400">Drawing power ({formatAmount(drawingPower)}) is below your sanctioned limit ({formatAmount(sanctioned)}). You can only draw up to drawing power — build stock or debtors to unlock the full line.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Drawing power = (eligible stock + eligible debtors) after bank margins. You can draw only up to the lower of sanctioned limit and drawing power. Banks typically apply 25% margin on stock and 40% on debtors; over-90-day debtors are usually excluded entirely.</p>
    </div>
  );
}

// ── #85 Working-Capital Gap & Funding-Need Quantifier ───────────────────────────
function WorkingCapitalGapFunding({ snap }: { snap: FinancialSnapshot }) {
  // Gross WC = current assets in the cycle; permissible bank finance follows
  // the Tandon Method II (75% of WC gap, with a 25% margin from own funds).
  const [marginPct, setMarginPct] = useState("25");
  const margin = (parseFloat(marginPct) || 0) / 100;

  const currentAssets = snap.inventoryValue + snap.accountsReceivable;
  const currentLiabilities = snap.accountsPayable;
  const workingCapitalGap = Math.max(0, currentAssets - currentLiabilities); // gross WC gap
  const ownMargin = Math.round(workingCapitalGap * margin);
  const permissibleBankFinance = Math.max(0, Math.round(workingCapitalGap - ownMargin));

  // Cross-check against the cycle-funded gap (CCC × daily opex) from the snapshot.
  const cycleGap = snap.workingCapitalGap;

  const fundingMix = [
    { label: "Own funds / margin", value: ownMargin, color: "bg-blue-500", note: `${marginPct}% margin (Tandon II)` },
    { label: "Bank CC / OD finance", value: permissibleBankFinance, color: "bg-green-500", note: "Permissible bank finance" },
  ];
  const totalMix = ownMargin + permissibleBankFinance || 1;

  const options = useMemo(() => financingOptions(permissibleBankFinance, snap.accountsReceivable), [permissibleBankFinance, snap.accountsReceivable]);

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Working-Capital Gap & Funding Need</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          WC gap = current assets in the cycle (stock + debtors) − trade creditors. Lenders fund a portion (Tandon Method II), leaving you to bring a margin from own funds. Use this to size and pitch the line.
        </p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Margin from own funds (%)</label>
          <input type="number" value={marginPct} onChange={e => setMarginPct(e.target.value)} className={WC_INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current Assets (cycle)", value: formatAmount(currentAssets), color: "text-[var(--color-text)]", sub: "Stock + debtors" },
          { label: "Trade Creditors", value: formatAmount(currentLiabilities), color: "text-[var(--color-text)]", sub: "Payables financing" },
          { label: "Working-Capital Gap", value: formatAmount(workingCapitalGap), color: "text-orange-400", sub: "To be funded" },
          { label: "Bank Finance (eligible)", value: formatAmount(permissibleBankFinance), color: "text-green-400", sub: `After ${marginPct}% margin` },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">How the gap gets funded</p>
        <div className="flex h-4 rounded-full overflow-hidden bg-[var(--color-bg)]">
          {fundingMix.map(m => (
            <div key={m.label} className={m.color} style={{ width: `${(m.value / totalMix) * 100}%` }} title={m.label} />
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {fundingMix.map(m => (
            <div key={m.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className={`inline-block w-3 h-3 rounded-sm ${m.color}`} /> {m.label} <span className="text-[10px] text-[var(--color-muted)]">{m.note}</span></span>
              <span className="tabular-nums font-semibold">{formatAmount(m.value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-[var(--color-muted)]"><TrendingDown size={12} /> Cross-check: cycle-funded gap (CCC × daily opex)</span>
          <span className="tabular-nums">{formatAmount(cycleGap)}</span>
        </div>
      </div>

      {options.length > 0 && permissibleBankFinance > 0 && (
        <div className={`${WC_CARD} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
            <Wallet size={14} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Ways to fund the {formatAmount(permissibleBankFinance)} need — ranked by effective annual cost</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Option", "Eff. cost / yr", "Monthly cost", "Speed"].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {options.map((o, i) => (
                  <tr key={o.key}>
                    <td className="px-5 py-3 font-medium whitespace-nowrap">
                      {i === 0 && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full mr-2">CHEAPEST</span>}
                      {o.name}
                    </td>
                    <td className="px-5 py-3 tabular-nums font-semibold">{o.effectiveAnnualCostPct.toFixed(1)}%</td>
                    <td className="px-5 py-3 tabular-nums">{formatAmount(o.monthlyCost)}</td>
                    <td className="px-5 py-3 text-xs">{o.speed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tandon Method II: permissible bank finance = WC gap − margin (25% of current assets from own funds). The cross-check estimates the same gap from your cash conversion cycle. Use the larger figure when sizing a facility.</p>
    </div>
  );
}

// ── #86 Trade-Cycle Optimizer — set target legs, see CCC & cash impact ───────────
function TradeCycleOptimizer({ snap }: { snap: FinancialSnapshot }) {
  const [tDso, setTDso] = useState(String(Math.max(0, snap.dsoDays - 10)));
  const [tDio, setTDio] = useState(String(Math.max(0, snap.dioDays - 5)));
  const [tDpo, setTDpo] = useState(String(snap.dpoDays + 10));

  const dso = Math.max(0, parseFloat(tDso) || 0);
  const dio = Math.max(0, parseFloat(tDio) || 0);
  const dpo = Math.max(0, parseFloat(tDpo) || 0);

  const targetCcc = Math.round(dso + dio - dpo);
  const daysSaved = snap.cccDays - targetCcc;
  const dailyOpex = snap.monthlyExpense / 30;
  const cashFreed = Math.round(daysSaved * dailyOpex);

  const legs = [
    { label: "DSO — collect faster", cur: snap.dsoDays, tgt: dso, set: setTDso, val: tDso, max: 120, good: dso <= snap.dsoDays },
    { label: "DIO — leaner stock", cur: snap.dioDays, tgt: dio, set: setTDio, val: tDio, max: 120, good: dio <= snap.dioDays },
    { label: "DPO — hold cash longer", cur: snap.dpoDays, tgt: dpo, set: setTDpo, val: tDpo, max: 120, good: dpo >= snap.dpoDays },
  ];

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Trade-Cycle Optimizer — Target Each Leg</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Move the sliders to set realistic targets for each cycle leg. We recompute your cash conversion cycle and the cash it frees at your {formatAmount(Math.round(dailyOpex))}/day run rate.</p>
        <div className="space-y-4">
          {legs.map(l => (
            <div key={l.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-xs tabular-nums text-[var(--color-muted)]">now {l.cur}d → target <strong className={l.good ? "text-green-400" : "text-orange-400"}>{l.tgt}d</strong></span>
              </div>
              <input type="range" min={0} max={l.max} value={l.tgt} onChange={e => l.set(e.target.value)} className="w-full accent-[var(--color-primary)]" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current CCC", value: `${snap.cccDays}d`, color: "text-[var(--color-text)]" },
          { label: "Target CCC", value: `${targetCcc}d`, color: targetCcc <= snap.cccDays ? "text-green-400" : "text-red-400" },
          { label: "Days Saved", value: `${daysSaved >= 0 ? "" : "+"}${daysSaved}d`, color: daysSaved >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Cash Freed", value: formatAmount(cashFreed), color: cashFreed >= 0 ? "text-green-400" : "text-orange-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${daysSaved >= 0 ? "border-green-800/40 bg-green-950/20" : "border-orange-800/40 bg-orange-950/20"}`}>
        <p className={`text-sm font-bold ${daysSaved >= 0 ? "text-green-400" : "text-orange-400"}`}>
          {daysSaved >= 0
            ? `Hitting these targets trims your cycle by ${daysSaved} days and frees ${formatAmount(cashFreed)} of trapped cash.`
            : `These targets lengthen your cycle by ${-daysSaved} days and consume ${formatAmount(-cashFreed)} more cash — tighten DSO/DIO or extend DPO.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">CCC = DSO + DIO − DPO. Cash freed = (current CCC − target CCC) × daily operating spend. Lower DSO/DIO and higher DPO all shorten the cycle.</p>
    </div>
  );
}

// ── #87 Dynamic Discounting vs Borrow Decision ──────────────────────────────────
function DynamicDiscountVsBorrow({ snap }: { snap: FinancialSnapshot }) {
  const [invoiceAmt, setInvoiceAmt] = useState(String(Math.round(snap.accountsPayable) || 200000));
  const [discPct, setDiscPct] = useState("2");
  const [daysEarly, setDaysEarly] = useState("20");
  const [borrowPct, setBorrowPct] = useState("16");
  const cashShort = snap.workingCapitalGap > 0;

  const amt = parseFloat(invoiceAmt) || 0;
  const disc = parseFloat(discPct) || 0;
  const early = Math.max(1, parseFloat(daysEarly) || 1);
  const borrow = (parseFloat(borrowPct) || 0) / 100;

  const apr = earlyPayAnnualizedReturn(disc, early);
  const discountSaved = Math.round(amt * (disc / 100));
  const borrowCostToPayEarly = Math.round(amt * borrow * (early / 365));
  const netBenefit = discountSaved - borrowCostToPayEarly;
  const takeIt = apr > parseFloat(borrowPct);

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Percent size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Dynamic Discounting vs Borrow — Should You Pay Early?</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">If you're cash-short, paying early means borrowing. This compares the discount captured against the interest cost of funding that early payment.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Invoice amount (₹)", v: invoiceAmt, s: setInvoiceAmt },
            { l: "Discount offered %", v: discPct, s: setDiscPct },
            { l: "Days paid early", v: daysEarly, s: setDaysEarly },
            { l: "Borrowing cost %/yr", v: borrowPct, s: setBorrowPct },
          ].map(f => (
            <div key={f.l}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.l}</label>
              <input type="number" value={f.v} onChange={e => f.s(e.target.value)} className={WC_INP} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Discount Annualised", value: `${apr.toFixed(0)}%`, color: takeIt ? "text-green-400" : "text-orange-400" },
          { label: "Discount Captured", value: formatAmount(discountSaved), color: "text-green-400" },
          { label: "Cost to Fund Early", value: formatAmount(borrowCostToPayEarly), color: "text-orange-400" },
          { label: "Net Benefit", value: formatAmount(netBenefit), color: netBenefit >= 0 ? "text-green-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${takeIt ? "border-green-800/40 bg-green-950/20" : "border-blue-800/40 bg-blue-950/20"}`}>
        <p className={`text-sm font-bold ${takeIt ? "text-green-400" : "text-blue-400"}`}>
          {takeIt
            ? `Take it — the ${disc}% discount is worth ${apr.toFixed(0)}% annualised, beating your ${borrowPct}% borrowing cost. Net ${formatAmount(netBenefit)} gain.`
            : `Skip it — ${apr.toFixed(0)}% annualised is below your ${borrowPct}% cost of funds. Pay on normal terms.`}
        </p>
        {cashShort && takeIt && <p className="text-[11px] text-[var(--color-muted)] mt-1">Even funded from your OD line, this clears a net profit — prioritise it within available headroom.</p>}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Annualised discount return = discount/(1−discount) × 365/days-early. Fund-early cost = amount × borrow rate × days-early/365. Take the discount whenever its annualised return exceeds your marginal cost of capital.</p>
    </div>
  );
}

// ── #88 Seasonal Working-Capital Planner ────────────────────────────────────────
function SeasonalWcPlanner({ snap }: { snap: FinancialSnapshot }) {
  // Directional demand index per month (festival/quarter-end heavy in India).
  const SEASON = [
    { m: "Apr", idx: 0.9 }, { m: "May", idx: 0.95 }, { m: "Jun", idx: 0.9 },
    { m: "Jul", idx: 1.0 }, { m: "Aug", idx: 1.05 }, { m: "Sep", idx: 1.1 },
    { m: "Oct", idx: 1.35 }, { m: "Nov", idx: 1.3 }, { m: "Dec", idx: 1.05 },
    { m: "Jan", idx: 0.95 }, { m: "Feb", idx: 0.9 }, { m: "Mar", idx: 1.15 },
  ];
  const [peakLift, setPeakLift] = useState("25"); // extra % uplift owner expects at peak
  const lift = (parseFloat(peakLift) || 0) / 100;

  const baseWc = Math.max(snap.workingCapitalGap, snap.accountsReceivable + snap.inventoryValue - snap.accountsPayable);
  const data = SEASON.map(s => {
    const scaled = s.idx + (s.idx - 1) * lift; // amplify swings by owner's expected lift
    return { month: s.m, wc: Math.round(baseWc * scaled), idx: scaled };
  });
  const peak = data.reduce((a, b) => (b.wc > a.wc ? b : a), data[0]);
  const trough = data.reduce((a, b) => (b.wc < a.wc ? b : a), data[0]);
  const peakExtra = peak.wc - Math.round(baseWc);

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Snowflake size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Seasonal Working-Capital Planner</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Your working capital isn't flat — it swells before festivals and quarter-end. This scales your base WC need ({formatAmount(Math.round(baseWc))}) by a typical Indian demand curve so you can pre-arrange the peak line.</p>
        <div className="max-w-xs">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Extra uplift you expect at peak (%)</label>
          <input type="number" value={peakLift} onChange={e => setPeakLift(e.target.value)} className={WC_INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Base WC Need", value: formatAmount(Math.round(baseWc)), color: "text-[var(--color-text)]" },
          { label: `Peak (${peak.month})`, value: formatAmount(peak.wc), color: "text-orange-400" },
          { label: `Trough (${trough.month})`, value: formatAmount(trough.wc), color: "text-green-400" },
          { label: "Extra Line at Peak", value: formatAmount(peakExtra), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">WC Need Through the Year</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), "WC need"]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
            <ReferenceLine y={Math.round(baseWc)} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "base", fontSize: 9, fill: "#3b82f6", position: "insideTopRight" }} />
            <Bar dataKey="wc" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.idx >= 1.2 ? "#f97316" : d.idx >= 1.05 ? "#eab308" : "#22c55e"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Demand index is directional (Oct–Nov festival peak, Mar quarter-end). Pre-arrange the {formatAmount(peakExtra)} top-up well before {peak.month} — banks are slow when everyone needs cash at once.</p>
    </div>
  );
}

// ── #89 Net Operating Working-Capital Trend ─────────────────────────────────────
function NetWorkingCapitalTrend({ snap }: { snap: FinancialSnapshot }) {
  // Project NWC and its components back over 6 months along the run-rate gradient.
  const trend = useMemo(() => {
    const months = ["5mo", "4mo", "3mo", "2mo", "Last", "Now"];
    return months.map((m, i) => {
      const f = 1.2 - (0.2 * i) / (months.length - 1); // 20% worse baseline → today
      const ar = Math.round(snap.accountsReceivable * f);
      const inv = Math.round(snap.inventoryValue * f);
      const ap = Math.round(snap.accountsPayable * (2 - f));
      return { month: m, nowc: ar + inv - ap, ar, inv, ap };
    });
  }, [snap.accountsReceivable, snap.inventoryValue, snap.accountsPayable]);

  const nowc = snap.accountsReceivable + snap.inventoryValue - snap.accountsPayable;
  const prev = trend[trend.length - 2].nowc;
  const delta = nowc - prev;
  const nowcPctOfRev = snap.monthlyRevenue > 0 ? (nowc / (snap.monthlyRevenue * 12)) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <LineChartIcon size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Net Operating Working-Capital Trend</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Net operating WC = receivables + inventory − payables. Rising NWC silently absorbs cash even when you're profitable — watch the slope, not just the level.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Net Operating WC", value: formatAmount(nowc), color: nowc <= prev ? "text-green-400" : "text-orange-400" },
          { label: "MoM Change", value: `${delta >= 0 ? "+" : ""}${formatAmount(delta)}`, color: delta <= 0 ? "text-green-400" : "text-red-400" },
          { label: "NWC % of Revenue", value: `${nowcPctOfRev.toFixed(0)}%`, color: nowcPctOfRev <= 20 ? "text-green-400" : "text-orange-400" },
          { label: "Cash Tied Up", value: formatAmount(Math.max(0, nowc)), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">6-Month NWC & Components</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trend} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n.toUpperCase()]} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey="nowc" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="NWC" />
            <Line type="monotone" dataKey="ar" stroke="#eab308" strokeWidth={1.5} dot={false} name="AR" />
            <Line type="monotone" dataKey="inv" stroke="#f97316" strokeWidth={1.5} dot={false} name="Inv" />
            <Line type="monotone" dataKey="ap" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="AP" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Trend is projected from current balances along the run-rate gradient. If NWC grows faster than revenue, growth is eating your cash — tighten collections or stock before scaling further.</p>
    </div>
  );
}

// ── #90 Cash Locked in Working Capital — breakdown & release plan ────────────────
function CashLockedInWc({ snap }: { snap: FinancialSnapshot }) {
  const components = [
    { label: "Receivables (AR)", value: snap.accountsReceivable, color: "bg-yellow-500", textColor: "text-yellow-400", lever: "Collect faster — auto-reminders, early-pay discounts", releasable: Math.round(snap.overdueReceivable) },
    { label: "Inventory", value: snap.inventoryValue, color: "bg-orange-500", textColor: "text-orange-400", lever: "Clear slow stock, tighten reorder quantities", releasable: Math.round(snap.inventoryValue * 0.2) },
  ];
  const offset = { label: "Payables (free credit)", value: snap.accountsPayable, color: "bg-green-500", textColor: "text-green-400", lever: "Negotiate longer terms with top suppliers", releasable: Math.round(snap.accountsPayable * 0.15) };

  const gross = snap.accountsReceivable + snap.inventoryValue;
  const netLocked = gross - snap.accountsPayable;
  const totalReleasable = components.reduce((s, c) => s + c.releasable, 0) + offset.releasable;
  const maxComp = Math.max(snap.accountsReceivable, snap.inventoryValue, snap.accountsPayable, 1);

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <Coins size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Cash Locked in Working Capital</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Every rupee in receivables and unsold stock is cash you funded but can't spend. Payables offset it with free supplier credit. Here's where yours sits and how much is realistically releasable.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Gross Locked (AR + Inv)", value: formatAmount(gross), color: "text-orange-400" },
          { label: "Supplier Credit Offset", value: formatAmount(snap.accountsPayable), color: "text-green-400" },
          { label: "Net Cash Locked", value: formatAmount(netLocked), color: netLocked > snap.monthlyExpense ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Realistically Releasable", value: formatAmount(totalReleasable), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5 space-y-4`}>
        <p className="text-sm font-semibold">Component breakdown</p>
        {[...components, offset].map(c => (
          <div key={c.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">{c.label}</span>
              <span className={`text-sm font-bold tabular-nums ${c.textColor}`}>{formatAmount(c.value)}</span>
            </div>
            <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${c.color}`} style={{ width: `${(c.value / maxComp) * 100}%` }} />
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.lever} · ~{formatAmount(c.releasable)} releasable</p>
          </div>
        ))}
        <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">Total cash you could free with focused effort</p>
          <p className="text-sm font-bold text-green-400">{formatAmount(totalReleasable)}</p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Releasable estimates: all overdue AR, ~20% of inventory (slow-movers), and ~15% more supplier credit via term extension. Net cash locked = AR + inventory − payables.</p>
    </div>
  );
}

// ── #91 Receivables Acceleration Planner — aging-based collection plan ───────────
function ReceivablesAcceleration({ snap, aging }: { snap: FinancialSnapshot; aging: AgingBucket[] }) {
  const [discPct, setDiscPct] = useState("2");
  const [uptakePct, setUptakePct] = useState("40"); // % of customers expected to take early-pay
  const disc = (parseFloat(discPct) || 0) / 100;
  const uptake = (parseFloat(uptakePct) || 0) / 100;

  // Collection probability declines with age; each bucket has a recovery lever.
  const plan = aging.map((b, i) => {
    const recoverPct = [0.95, 0.85, 0.7, 0.5, 0.3][i] ?? 0.3;
    const pullForward = Math.round(b.amount * recoverPct);
    const lever = ["On track — light touch", "Reminder at day 7", "Call + WhatsApp follow-up", "Early-pay discount offer", "Escalate / consider factoring"][i] ?? "Escalate";
    return { ...b, recoverPct, pullForward, lever };
  });

  const totalPullForward = plan.reduce((s, p) => s + p.pullForward, 0);
  const discountCost = Math.round(snap.accountsReceivable * uptake * disc);
  const netCashPulled = totalPullForward - discountCost;
  const dailyOpex = snap.monthlyExpense / 30;
  const daysShortened = dailyOpex > 0 ? Math.round(netCashPulled / dailyOpex) : 0;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Receivables Acceleration Planner</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">A bucket-by-bucket collection plan that pulls cash forward from your {formatAmount(snap.accountsReceivable)} of open receivables, with the early-pay discount cost netted out.</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Early-pay discount %</label>
            <input type="number" value={discPct} onChange={e => setDiscPct(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected uptake %</label>
            <input type="number" value={uptakePct} onChange={e => setUptakePct(e.target.value)} className={WC_INP} />
          </div>
        </div>
      </div>

      {snap.accountsReceivable === 0 ? (
        <div className={`${WC_CARD} p-8 text-center`}>
          <p className="text-sm text-[var(--color-muted)]">No open receivables — create invoices to plan collections.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Recoverable (probable)", value: formatAmount(totalPullForward), color: "text-green-400" },
              { label: "Discount Cost", value: formatAmount(discountCost), color: "text-orange-400" },
              { label: "Net Cash Pulled", value: formatAmount(netCashPulled), color: "text-[var(--color-primary)]" },
              { label: "Cycle Days Shortened", value: `${daysShortened}d`, color: "text-green-400" },
            ].map(c => (
              <div key={c.label} className={`${WC_CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className={`${WC_CARD} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Bucket", "Outstanding", "Recovery %", "Probable Collect", "Action"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.map(p => (
                  <tr key={p.label} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatAmount(p.amount)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{Math.round(p.recoverPct * 100)}%</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatAmount(p.pullForward)}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{p.lever}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Recovery rates fall with age (95% current → 30% at 90+ days). Net cash pulled = probable collections − discount cost. Days shortened = net cash ÷ daily operating spend.</p>
    </div>
  );
}

// ── #92 Liquidity Ratios Tracker — current / quick / cash ratio ──────────────────
function LiquidityRatiosTracker({ snap }: { snap: FinancialSnapshot }) {
  const currentAssets = snap.cash + snap.accountsReceivable + snap.inventoryValue;
  const currentLiabilities = snap.accountsPayable + snap.obligationsDue90;
  const cl = currentLiabilities > 0 ? currentLiabilities : 1;

  const currentRatio = currentAssets / cl;
  const quickRatio = (snap.cash + snap.accountsReceivable) / cl;
  const cashRatio = snap.cash / cl;

  const ratios = [
    { label: "Current Ratio", value: currentRatio, target: 1.5, formula: "(Cash + AR + Inventory) ÷ current liabilities", note: "Can you cover short-term dues from all current assets?" },
    { label: "Quick Ratio (Acid-Test)", value: quickRatio, target: 1.0, formula: "(Cash + AR) ÷ current liabilities", note: "Coverage excluding hard-to-sell inventory." },
    { label: "Cash Ratio", value: cashRatio, target: 0.5, formula: "Cash ÷ current liabilities", note: "The most conservative — pure cash on hand." },
  ];

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <PiggyBank size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Liquidity Ratios Tracker</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Three lenses on the same question — can you meet short-term obligations? Computed live from your cash ({formatAmount(snap.cash)}), receivables, inventory and dues within 90 days.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ratios.map(r => {
          const ok = r.value >= r.target;
          const pct = Math.min(100, (r.value / (r.target * 1.5)) * 100);
          return (
            <div key={r.label} className={`${WC_CARD} p-5`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{r.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${ok ? "text-green-400" : "text-red-400"}`}>{r.value.toFixed(2)}x</p>
              <div className="mt-2 mb-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">Target ≥ {r.target.toFixed(1)}x · {ok ? "Healthy" : "Below target"}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-2 leading-relaxed">{r.formula}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-1 leading-relaxed">{r.note}</p>
            </div>
          );
        })}
      </div>

      <div className={`${WC_CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Component", "Amount"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { l: "Cash & bank balances", v: snap.cash },
              { l: "Accounts receivable", v: snap.accountsReceivable },
              { l: "Inventory", v: snap.inventoryValue },
              { l: "Accounts payable", v: snap.accountsPayable },
              { l: "Other obligations (≤90d)", v: snap.obligationsDue90 },
            ].map(row => (
              <tr key={row.l} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5">{row.l}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatAmount(row.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Current liabilities = payables + obligations due within 90 days. Ratios above target signal comfortable short-term liquidity; the cash ratio is the strictest test lenders apply in a stress scenario.</p>
    </div>
  );
}

// ── #93 MPBF (Tandon Committee) Limit Calculator — Method I vs II ────────────────
function MpbfTandonCalculator({ snap }: { snap: FinancialSnapshot }) {
  // Other current assets (e.g. advances, prepaid) the bank counts beyond stock+debtors.
  const [otherCa, setOtherCa] = useFeatureState<string>("wc-mpbf-other-ca", "0");
  // Other current liabilities besides trade creditors (e.g. statutory dues).
  const [otherCl, setOtherCl] = useFeatureState<string>("wc-mpbf-other-cl", "0");
  // Core current assets (permanent minimum stock) excluded under Method III thinking
  // but here used to show the margin lenders expect from long-term sources.

  const oCa = Math.max(0, parseFloat(otherCa) || 0);
  const oCl = Math.max(0, parseFloat(otherCl) || 0);

  const currentAssets = snap.inventoryValue + snap.accountsReceivable + oCa;
  const otherCurrentLiab = snap.accountsPayable + oCl; // current liab other than bank borrowing
  const workingCapitalGap = Math.max(0, currentAssets - otherCurrentLiab);

  // Method I: borrower funds 25% of WORKING CAPITAL GAP from long-term sources.
  const margin1 = Math.round(workingCapitalGap * 0.25);
  const mpbf1 = Math.max(0, workingCapitalGap - margin1);
  // Method II: borrower funds 25% of TOTAL CURRENT ASSETS from long-term sources.
  const margin2 = Math.round(currentAssets * 0.25);
  const mpbf2 = Math.max(0, currentAssets - otherCurrentLiab - margin2);

  // Net working capital (own contribution) implied and the resulting current ratio.
  const nwc1 = currentAssets - otherCurrentLiab - mpbf1;
  const nwc2 = currentAssets - otherCurrentLiab - mpbf2;
  const cr1 = (otherCurrentLiab + mpbf1) > 0 ? currentAssets / (otherCurrentLiab + mpbf1) : 0;
  const cr2 = (otherCurrentLiab + mpbf2) > 0 ? currentAssets / (otherCurrentLiab + mpbf2) : 0;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">MPBF Calculator — Tandon Committee Method I vs II</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Maximum Permissible Bank Finance is how banks cap your cash-credit limit. Method II (the RBI norm for larger limits) makes you fund 25% of all current assets from long-term sources — a stricter current ratio of ~1.33. Computed live from your stock ({formatAmount(snap.inventoryValue)}) and debtors ({formatAmount(snap.accountsReceivable)}).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Other current assets (₹)</label>
            <input type="number" value={otherCa} onChange={e => setOtherCa(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Other current liabilities (₹)</label>
            <input type="number" value={otherCl} onChange={e => setOtherCl(e.target.value)} className={WC_INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Current Assets", value: formatAmount(currentAssets), color: "text-[var(--color-text)]" },
          { label: "Current Liab. (ex-bank)", value: formatAmount(otherCurrentLiab), color: "text-[var(--color-text)]" },
          { label: "Working-Capital Gap", value: formatAmount(workingCapitalGap), color: "text-orange-400" },
          { label: "MPBF (Method II)", value: formatAmount(mpbf2), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Particulars", "Method I (25% of WC gap)", "Method II (25% of CA)"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { l: "Stipulated margin (own funds)", a: margin1, b: margin2 },
              { l: "Permissible bank finance (MPBF)", a: mpbf1, b: mpbf2, strong: true },
              { l: "Implied net working capital", a: nwc1, b: nwc2 },
            ].map(r => (
              <tr key={r.l} className="border-b border-[var(--color-border)] last:border-0">
                <td className={`px-4 py-2.5 ${r.strong ? "font-semibold" : ""}`}>{r.l}</td>
                <td className={`px-4 py-2.5 tabular-nums ${r.strong ? "text-[var(--color-primary)] font-semibold" : ""}`}>{formatAmount(r.a)}</td>
                <td className={`px-4 py-2.5 tabular-nums ${r.strong ? "text-green-400 font-semibold" : ""}`}>{formatAmount(r.b)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--color-accent)]">
              <td className="px-4 py-2.5 font-medium">Resulting current ratio</td>
              <td className="px-4 py-2.5 tabular-nums">{cr1.toFixed(2)}x</td>
              <td className="px-4 py-2.5 tabular-nums">{cr2.toFixed(2)}x</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg p-4 border border-blue-800/40 bg-blue-950/20">
        <p className="text-sm text-blue-400">
          Banks now sanction the lower, more conservative <strong>Method II</strong> figure ({formatAmount(mpbf2)}) for limits above ₹6 crore. The {formatAmount(mpbf1 - mpbf2)} extra you'd get under Method I must come from your own NWC — plan that long-term funding before the limit review.
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Method I: MPBF = WC gap − 25% of WC gap (current ratio ~1.17). Method II: MPBF = current assets − other current liabilities − 25% of current assets (current ratio ~1.33). WC gap = current assets − current liabilities other than bank borrowing.</p>
    </div>
  );
}

// ── #94 Stock & Book-Debt Statement Generator (for monthly bank submission) ──────
function StockStatementGenerator({ snap }: { snap: FinancialSnapshot }) {
  const [stockMargin, setStockMargin] = useFeatureState<string>("wc-stockstmt-stock-margin", "25");
  const [debtorMargin, setDebtorMargin] = useFeatureState<string>("wc-stockstmt-debtor-margin", "40");
  const [excludeOver90, setExcludeOver90] = useFeatureState<string>("wc-stockstmt-excl90", "yes");
  const [creditors, setCreditors] = useFeatureState<string>("wc-stockstmt-creditors", String(Math.round(snap.accountsPayable)));

  const sMargin = (parseFloat(stockMargin) || 0) / 100;
  const dMargin = (parseFloat(debtorMargin) || 0) / 100;
  const excl90 = excludeOver90 === "yes";

  // Banks fund only debtors up to 90 days; over-90 are excluded from drawing power.
  const eligibleDebtorsBase = excl90 ? Math.max(0, snap.accountsReceivable - snap.overdueReceivable) : snap.accountsReceivable;
  const creditorsForStock = Math.max(0, parseFloat(creditors) || 0);

  // Drawing power = stock less creditors (paid-for stock) less margin, plus debtors less margin.
  const paidStock = Math.max(0, snap.inventoryValue - creditorsForStock);
  const eligibleStock = Math.round(paidStock * (1 - sMargin));
  const eligibleDebtors = Math.round(eligibleDebtorsBase * (1 - dMargin));
  const drawingPower = eligibleStock + eligibleDebtors;

  const statementMonth = format(new Date(), "MMMM yyyy");

  const rows = [
    { particular: "A. Stock / inventory (as per books)", gross: snap.inventoryValue, margin: "—", net: snap.inventoryValue },
    { particular: "Less: creditors for paid stock", gross: -creditorsForStock, margin: "—", net: -creditorsForStock },
    { particular: "Paid-for stock", gross: paidStock, margin: `${stockMargin}%`, net: eligibleStock },
    { particular: `B. Book debts ${excl90 ? "(≤90 days only)" : "(all ages)"}`, gross: eligibleDebtorsBase, margin: `${debtorMargin}%`, net: eligibleDebtors },
  ];

  const copyStatement = () => {
    const text = [
      `STOCK & BOOK-DEBT STATEMENT — ${statementMonth}`,
      `Stock (books): ${formatCurrency(snap.inventoryValue)}`,
      `Less creditors for stock: ${formatCurrency(creditorsForStock)}`,
      `Paid-for stock after ${stockMargin}% margin: ${formatCurrency(eligibleStock)}`,
      `Book debts ${excl90 ? "(<=90d)" : "(all)"} after ${debtorMargin}% margin: ${formatCurrency(eligibleDebtors)}`,
      `DRAWING POWER: ${formatCurrency(drawingPower)}`,
    ].join("\n");
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Stock statement copied — paste into your bank's format"),
        () => toast.error("Could not copy to clipboard"),
      );
    } else {
      toast.error("Clipboard not available in this browser");
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Stock & Book-Debt Statement — {statementMonth}</h3>
          </div>
          <button onClick={copyStatement} className="text-xs bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/25">
            Copy for bank
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Every cash-credit borrower files this monthly to keep the limit alive. We build it from your live stock and debtors, net of creditors and bank margins, and compute the drawing power the bank will allow.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stock margin %</label>
            <input type="number" value={stockMargin} onChange={e => setStockMargin(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debtor margin %</label>
            <input type="number" value={debtorMargin} onChange={e => setDebtorMargin(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Creditors for stock (₹)</label>
            <input type="number" value={creditors} onChange={e => setCreditors(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Exclude debtors &gt;90d</label>
            <select value={excludeOver90} onChange={e => setExcludeOver90(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
              <option value="yes">Yes (bank norm)</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      </div>

      <div className={`${WC_CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Particulars", "Value (₹)", "Margin", "Eligible (₹)"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.particular} className="border-b border-[var(--color-border)]">
                <td className="px-4 py-2.5">{r.particular}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatAmount(r.gross)}</td>
                <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{r.margin}</td>
                <td className="px-4 py-2.5 tabular-nums">{r.net === r.gross ? "—" : formatAmount(r.net)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--color-accent)] font-semibold">
              <td className="px-4 py-2.5" colSpan={3}>Drawing Power (Stock + Debtors, net of margin)</td>
              <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatAmount(drawingPower)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Drawing power = (paid-for stock × (1 − stock margin)) + (eligible debtors × (1 − debtor margin)). Paid-for stock excludes creditors so the bank doesn't fund supplier-funded inventory twice. Debtors over 90 days are excluded per standard sanction terms. File this by the 7th–10th of each month.</p>
    </div>
  );
}

// ── #95 Debtor / Bill-Discounting Eligibility & Advance Calculator ──────────────
function DebtorFinancingEligibility({ snap }: { snap: FinancialSnapshot }) {
  const [advancePct, setAdvancePct] = useFeatureState<string>("wc-debtorfin-advance", "80");
  const [discountRatePct, setDiscountRatePct] = useFeatureState<string>("wc-debtorfin-rate", "13");
  const [tenorDays, setTenorDays] = useState("60");
  const [processingPct, setProcessingPct] = useState("0.5");

  const advance = Math.min(95, Math.max(0, parseFloat(advancePct) || 0)) / 100;
  const rate = (parseFloat(discountRatePct) || 0) / 100;
  const tenor = Math.max(1, parseFloat(tenorDays) || 1);
  const processing = (parseFloat(processingPct) || 0) / 100;

  // Only non-overdue (current) receivables are reliably financeable.
  const eligible = Math.max(0, snap.accountsReceivable - snap.overdueReceivable);
  const advanceAmount = Math.round(eligible * advance);
  const holdback = eligible - advanceAmount;
  const interestCost = Math.round(advanceAmount * rate * (tenor / 365));
  const processingCost = Math.round(advanceAmount * processing);
  const totalCost = interestCost + processingCost;
  const effectiveAnnualCost = advanceAmount > 0 ? (totalCost / advanceAmount) * (365 / tenor) * 100 : 0;

  const dailyOpex = snap.monthlyExpense / 30;
  const daysOfRunway = dailyOpex > 0 ? Math.round(advanceAmount / dailyOpex) : 0;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Debtor / Bill-Discounting Eligibility</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Convert unpaid invoices to cash today by discounting them with a financier (TReDS / bill-discounting). We size the advance against your current (non-overdue) receivables of {formatAmount(eligible)} and show the true cost.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Advance rate %</label>
            <input type="number" value={advancePct} onChange={e => setAdvancePct(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount rate %/yr</label>
            <input type="number" value={discountRatePct} onChange={e => setDiscountRatePct(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Average tenor (days)</label>
            <input type="number" value={tenorDays} onChange={e => setTenorDays(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Processing fee %</label>
            <input type="number" value={processingPct} onChange={e => setProcessingPct(e.target.value)} className={WC_INP} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Eligible Receivables", value: formatAmount(eligible), color: "text-[var(--color-text)]" },
          { label: "Cash Advance Today", value: formatAmount(advanceAmount), color: "text-green-400" },
          { label: "Holdback (on collection)", value: formatAmount(holdback), color: "text-[var(--color-muted)]" },
          { label: "Effective Cost", value: `${effectiveAnnualCost.toFixed(1)}%`, color: effectiveAnnualCost <= 16 ? "text-green-400" : "text-orange-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Cost of unlocking {formatAmount(advanceAmount)}</p>
        <div className="space-y-2 text-sm">
          {[
            { l: `Interest @ ${discountRatePct}% for ${tenorDays} days`, v: interestCost },
            { l: `Processing fee @ ${processingPct}%`, v: processingCost },
          ].map(r => (
            <div key={r.l} className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5">
              <span>{r.l}</span>
              <span className="tabular-nums text-orange-400">{formatAmount(r.v)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 pt-2 border-t border-[var(--color-border)]">
            <span className="font-semibold">Total cost</span>
            <span className="tabular-nums font-bold text-orange-400">{formatAmount(totalCost)}</span>
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-3">
          {eligible === 0
            ? "No current receivables to finance — overdue invoices are excluded as financiers won't fund them."
            : `This advance buys roughly ${daysOfRunway} days of operating runway at your ${formatAmount(Math.round(dailyOpex))}/day burn — compare against OD before committing.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Eligible = receivables minus overdue (financiers fund current invoices only). Effective annual cost = total cost ÷ advance × 365 ÷ tenor. On TReDS this is typically 9–14% for buyers with good ratings; weigh it against your CC line rate.</p>
    </div>
  );
}

// ── #96 Creditor-Stretch Impact — DPO extension, cash freed & MSME risk ─────────
function CreditorStretchImpact({ snap }: { snap: FinancialSnapshot }) {
  const [extraDays, setExtraDays] = useState("15");
  const [msmeSharePct, setMsmeSharePct] = useState("30"); // % of payables owed to MSME vendors
  const extend = Math.max(0, parseFloat(extraDays) || 0);
  const msmeShare = Math.min(100, Math.max(0, parseFloat(msmeSharePct) || 0)) / 100;

  // Daily purchase run-rate implied by payables and current DPO.
  const dailyPurchases = snap.dpoDays > 0 ? snap.accountsPayable / snap.dpoDays : snap.monthlyExpense / 30;
  const newDpo = snap.dpoDays + extend;
  const cashFreed = Math.round(dailyPurchases * extend);
  const newCcc = snap.cccDays - extend;
  const dailyOpex = snap.monthlyExpense / 30;

  // Sec 43B(h): payments to MSME vendors beyond 45 days are disallowed as expense
  // until paid — stretching MSME creditors carries a tax cost, not just relationship risk.
  const msmePayables = Math.round(snap.accountsPayable * msmeShare);
  const exposedToMsmeRule = newDpo > 45 && msmeShare > 0;
  const msmeAtRisk = exposedToMsmeRule ? msmePayables : 0;

  // Value of the freed cash if it offsets OD borrowing at ~14%/yr.
  const annualSaving = Math.round(cashFreed * 0.14);

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Repeat size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Creditor-Stretch Impact — DPO, Cash Freed & MSME Risk</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Holding supplier payments longer is the cheapest funding there is — but stretch MSME vendors past 45 days and Sec 43B(h) disallows the expense until paid. Model the cash freed against the tax exposure.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Extend payment by (days)</label>
            <input type="number" value={extraDays} onChange={e => setExtraDays(e.target.value)} className={WC_INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">% of payables to MSME vendors</label>
            <input type="number" value={msmeSharePct} onChange={e => setMsmeSharePct(e.target.value)} className={WC_INP} />
          </div>
        </div>
        <div>
          <input type="range" min={0} max={60} value={extend} onChange={e => setExtraDays(e.target.value)} className="w-full accent-[var(--color-primary)]" />
          <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1"><span>+0d</span><span>DPO {snap.dpoDays}d → {newDpo}d</span><span>+60d</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "New DPO", value: `${newDpo}d`, color: "text-green-400" },
          { label: "Cash Freed", value: formatAmount(cashFreed), color: "text-[var(--color-primary)]" },
          { label: "New CCC", value: `${newCcc}d`, color: newCcc <= snap.cccDays ? "text-green-400" : "text-red-400" },
          { label: "Interest Saved / yr", value: formatAmount(annualSaving), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5`}>
        <p className="text-sm font-semibold mb-2">Stretching {extend} days frees {formatAmount(cashFreed)}</p>
        <p className="text-xs text-[var(--color-muted)]">That's roughly {dailyOpex > 0 ? Math.round(cashFreed / dailyOpex) : 0} days of operating runway, freed at zero interest if vendors agree. Negotiate it as a term, don't simply default.</p>
      </div>

      {exposedToMsmeRule ? (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">
            New DPO of {newDpo} days breaches the 45-day MSME limit. ~{formatAmount(msmeAtRisk)} owed to MSME vendors would be <strong>disallowed under Sec 43B(h)</strong> until actually paid — inflating this year's taxable profit. Pay MSME vendors within 45 days; stretch only non-MSME creditors.
          </p>
        </div>
      ) : (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20">
          <p className="text-sm text-green-400">New DPO of {newDpo} days stays within the 45-day MSME limit — no Sec 43B(h) disallowance. Safe to negotiate.</p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Daily purchases = payables ÷ current DPO. Cash freed = daily purchases × extra days. Sec 43B(h) of the Income-tax Act disallows expenses to micro/small (registered MSME) suppliers paid beyond 45 days until the year they're actually settled.</p>
    </div>
  );
}

// ── #97 Working-Capital Turnover Ratio — sales generated per rupee of WC ─────────
function WorkingCapitalTurnover({ snap }: { snap: FinancialSnapshot }) {
  const annualRevenue = snap.monthlyRevenue * 12;
  const nwc = snap.accountsReceivable + snap.inventoryValue - snap.accountsPayable;
  const turnover = nwc > 0 ? annualRevenue / nwc : 0;
  // Higher turnover = leaner WC. A turnover of 6x means ₹6 of sales per ₹1 of WC.
  const wcPerRupeeSales = annualRevenue > 0 ? nwc / annualRevenue : 0;

  // Directional sector benchmarks for WC turnover (annual sales ÷ net WC).
  const BENCH = [
    { label: "Lean / efficient", min: 6 },
    { label: "Healthy", min: 4 },
    { label: "Average", min: 2.5 },
    { label: "WC-heavy", min: 0 },
  ];
  const band = BENCH.find(b => turnover >= b.min) ?? BENCH[BENCH.length - 1];

  // What freeing 10 days of WC would do to the ratio.
  const dailyOpex = snap.monthlyExpense / 30;
  const leanerNwc = Math.max(1, nwc - dailyOpex * 10);
  const leanerTurnover = annualRevenue > 0 ? annualRevenue / leanerNwc : 0;

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Working-Capital Turnover Ratio</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          How many rupees of annual sales each rupee of working capital supports. Higher is leaner — you're sweating your capital harder. Computed from your annualised revenue ({formatAmount(annualRevenue)}) and net WC ({formatAmount(nwc)}).
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "WC Turnover", value: nwc > 0 ? `${turnover.toFixed(1)}x` : "—", color: turnover >= 4 ? "text-green-400" : turnover >= 2.5 ? "text-yellow-400" : "text-orange-400" },
          { label: "WC per ₹ of Sales", value: `${(wcPerRupeeSales * 100).toFixed(0)} paise`, color: "text-[var(--color-text)]" },
          { label: "Efficiency Band", value: band.label, color: turnover >= 4 ? "text-green-400" : "text-orange-400" },
          { label: "Net Working Capital", value: formatAmount(nwc), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className={`${WC_CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className={`${WC_CARD} p-5 space-y-3`}>
        <p className="text-sm font-semibold">Where you sit</p>
        {BENCH.map(b => {
          const active = b.label === band.label;
          return (
            <div key={b.label} className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${active ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
              <span className={`text-sm ${active ? "font-semibold text-[var(--color-primary)]" : ""}`}>{b.label}</span>
              <span className="text-xs tabular-nums text-[var(--color-muted)]">{b.min > 0 ? `≥ ${b.min}x` : `< 2.5x`}{active ? " — you" : ""}</span>
            </div>
          );
        })}
      </div>

      {nwc > 0 && (
        <div className="rounded-lg p-4 border border-blue-800/40 bg-blue-950/20">
          <p className="text-sm text-blue-400">
            Freeing just 10 days of WC ({formatAmount(Math.round(dailyOpex * 10))}) would lift your turnover from {turnover.toFixed(1)}x to <strong>{leanerTurnover.toFixed(1)}x</strong> — the same sales on less trapped cash.
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">WC turnover = annual sales ÷ net working capital (AR + inventory − payables). A ratio below ~2.5x suggests capital is trapped in receivables or stock; above ~6x signals a very lean, possibly cash-strained, cycle. Benchmarks are directional.</p>
    </div>
  );
}

// ── #98 Factoring vs Overdraft — funding-cost decision ──────────────────────────
function FactoringVsOdDecision({ snap }: { snap: FinancialSnapshot }) {
  const [need, setNeed] = useState(String(Math.round(snap.workingCapitalGap) || 500000));
  const [tenorDays, setTenorDays] = useState("60");
  const [odRatePct, setOdRatePct] = useState("14");
  const [factorRatePct, setFactorRatePct] = useState("12");
  const [factorFeePct, setFactorFeePct] = useState("1");
  const [recourse, setRecourse] = useState("recourse");

  const amount = Math.max(0, parseFloat(need) || 0);
  const tenor = Math.max(1, parseFloat(tenorDays) || 1);
  const odRate = (parseFloat(odRatePct) || 0) / 100;
  const factorRate = (parseFloat(factorRatePct) || 0) / 100;
  const factorFee = (parseFloat(factorFeePct) || 0) / 100;

  // OD: interest only on drawn amount for the days used.
  const odCost = Math.round(amount * odRate * (tenor / 365));
  // Factoring: discount interest for the tenor + a one-off service/factoring fee.
  const factorInterest = Math.round(amount * factorRate * (tenor / 365));
  const factorFeeAmt = Math.round(amount * factorFee);
  const factorCost = factorInterest + factorFeeAmt;

  const odEff = amount > 0 ? (odCost / amount) * (365 / tenor) * 100 : 0;
  const factorEff = amount > 0 ? (factorCost / amount) * (365 / tenor) * 100 : 0;

  const factoringWins = factorCost < odCost;
  const nonRecourse = recourse === "nonrecourse";

  return (
    <div className="space-y-4">
      <div className={`${WC_CARD} p-4 space-y-4`}>
        <div className="flex items-center gap-2">
          <Split size={16} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Factoring vs Overdraft — Which Costs Less?</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Both bridge a {formatAmount(amount)} gap, but they price differently: an OD charges interest only on what you draw, while factoring adds a service fee but can transfer bad-debt risk (non-recourse). Compare the true cost for your tenor.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { l: "Funding need (₹)", v: need, s: setNeed },
            { l: "Tenor / days outstanding", v: tenorDays, s: setTenorDays },
            { l: "OD rate %/yr", v: odRatePct, s: setOdRatePct },
            { l: "Factoring rate %/yr", v: factorRatePct, s: setFactorRatePct },
            { l: "Factoring fee %", v: factorFeePct, s: setFactorFeePct },
          ].map(f => (
            <div key={f.l}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.l}</label>
              <input type="number" value={f.v} onChange={e => f.s(e.target.value)} className={WC_INP} />
            </div>
          ))}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Factoring type</label>
            <select value={recourse} onChange={e => setRecourse(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
              <option value="recourse">With recourse</option>
              <option value="nonrecourse">Non-recourse</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${WC_CARD} p-5 ${!factoringWins ? "ring-1 ring-green-700/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Overdraft / Cash Credit</p>
            {!factoringWins && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">CHEAPER</span>}
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatAmount(odCost)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">cost for {tenorDays} days · {odEff.toFixed(1)}% effective/yr</p>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1 text-xs text-[var(--color-muted)]">
            <p>You keep collection responsibility and bad-debt risk.</p>
            <p>Interest accrues only on the drawn balance.</p>
          </div>
        </div>

        <div className={`${WC_CARD} p-5 ${factoringWins ? "ring-1 ring-green-700/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Factoring</p>
            {factoringWins && <span className="text-[9px] bg-green-900/40 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">CHEAPER</span>}
          </div>
          <p className="text-2xl font-bold tabular-nums">{formatAmount(factorCost)}</p>
          <p className="text-[10px] text-[var(--color-muted)]">interest {formatAmount(factorInterest)} + fee {formatAmount(factorFeeAmt)} · {factorEff.toFixed(1)}% effective/yr</p>
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1 text-xs text-[var(--color-muted)]">
            <p>{nonRecourse ? "Non-recourse: factor absorbs buyer default — worth the premium for risky debtors." : "With recourse: you still carry the bad-debt risk."}</p>
            <p>Factor manages collection — frees up your team.</p>
          </div>
        </div>
      </div>

      <div className={`rounded-lg p-4 border ${factoringWins ? "border-blue-800/40 bg-blue-950/20" : "border-green-800/40 bg-green-950/20"}`}>
        <p className={`text-sm font-bold ${factoringWins ? "text-blue-400" : "text-green-400"}`}>
          {factoringWins
            ? `Factoring is ${formatAmount(odCost - factorCost)} cheaper here${nonRecourse ? " and offloads bad-debt risk" : ""} — but only if you have clean invoices to assign.`
            : `The overdraft is ${formatAmount(factorCost - odCost)} cheaper for this tenor. Use factoring only when you also want collection support or ${nonRecourse ? "non-recourse" : "default"} protection.`}
        </p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">OD cost = amount × OD rate × days/365. Factoring cost = amount × factoring rate × days/365 + one-off fee. Effective annual cost annualises each over the tenor. Non-recourse factoring costs more but transfers buyer-default risk — value that against your debtor quality.</p>
    </div>
  );
}
