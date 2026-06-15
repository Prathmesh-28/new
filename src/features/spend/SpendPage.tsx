import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import { percentiles } from "@/lib/finance";
import {
  TrendingUp, TrendingDown, AlertTriangle, Repeat, Eye, ChevronRight,
  PieChart, CreditCard, CalendarClock, Wallet, Copy, Building2, Trash2,
  BarChart3, RefreshCw, ShieldCheck, Plane, CheckSquare, Lightbulb, LineChart, Gauge,
  Scale, Layers, ArrowUpRight, Receipt, Timer,
} from "lucide-react";
import { format, startOfMonth, subMonths, isWithinInterval, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthWindow(monthsAgo: number, from: Date): { start: Date; end: Date } {
  const start = startOfMonth(subMonths(from, monthsAgo));
  const end   = startOfMonth(subMonths(from, monthsAgo - 1));
  return { start, end };
}

// Static reference ranges (typical Indian SMB cost mix) used as a fallback only
// when the tenant doesn't yet have enough history to compute their own norm.
const REFERENCE: Record<string, { label: string; median_pct: number }> = {
  payroll:  { label: "Payroll",       median_pct: 42 },
  expense:  { label: "Operations",    median_pct: 30 },
  tax:      { label: "Tax & duties",  median_pct: 8  },
  loan:     { label: "Debt service",  median_pct: 12 },
  transfer: { label: "Transfers",     median_pct: 8  },
};
const CAT_LABEL: Record<string, string> = {
  payroll: "Payroll", expense: "Operations", tax: "Tax & duties", loan: "Debt service", transfer: "Transfers",
};

export default function SpendPage() {
  const { store } = useApp();
  const navigate  = useNavigate();
  const today     = new Date();

  const expenses = useMemo(() =>
    store.transactions.filter(t => t.amount < 0),
  [store.transactions]);

  // ── Current & previous month spend by category ────────────────────────────
  const { start: curStart, end: curEnd } = monthWindow(0, today);
  const { start: prv1Start, end: prv1End } = monthWindow(1, today);
  const { start: prv2Start, end: prv2End } = monthWindow(2, today);
  const { start: prv3Start, end: prv3End } = monthWindow(3, today);

  const inWindow = (date: string, start: Date, end: Date) =>
    isWithinInterval(new Date(date), { start, end });

  const groupByCategory = (txns: typeof expenses) => {
    const map: Record<string, number> = {};
    txns.forEach(t => { map[t.category] = (map[t.category] ?? 0) + Math.abs(t.amount); });
    return map;
  };

  const curSpend = groupByCategory(expenses.filter(t => inWindow(t.date, curStart, curEnd)));
  const prv1Spend = groupByCategory(expenses.filter(t => inWindow(t.date, prv1Start, prv1End)));
  const prv2Spend = groupByCategory(expenses.filter(t => inWindow(t.date, prv2Start, prv2End)));
  const prv3Spend = groupByCategory(expenses.filter(t => inWindow(t.date, prv3Start, prv3End)));

  const totalCur = Object.values(curSpend).reduce((s, v) => s + v, 0);

  // ── Duplicate vendor detection ────────────────────────────────────────────
  type DupGroup = { category: string; vendors: string[]; totalSpend: number; topVendor: string };
  const duplicates = useMemo<DupGroup[]>(() => {
    const vendorsByCategory: Record<string, Set<string>> = {};
    const spendByVendor: Record<string, number> = {};

    expenses.forEach(t => {
      const cat = t.category;
      if (!vendorsByCategory[cat]) vendorsByCategory[cat] = new Set();
      vendorsByCategory[cat].add(t.counterparty);
      spendByVendor[t.counterparty] = (spendByVendor[t.counterparty] ?? 0) + Math.abs(t.amount);
    });

    return Object.entries(vendorsByCategory)
      .filter(([, vendors]) => vendors.size > 1)
      .map(([category, vendors]) => {
        const arr = [...vendors];
        const total = arr.reduce((s, v) => s + (spendByVendor[v] ?? 0), 0);
        const topVendor = arr.sort((a, b) => (spendByVendor[b] ?? 0) - (spendByVendor[a] ?? 0))[0];
        return { category, vendors: arr, totalSpend: total, topVendor };
      })
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);
  }, [expenses]);

  // ── Subscription growth detection ────────────────────────────────────────
  type SubGrow = { vendor: string; m0: number; m3: number; growth_pct: number; category: string };
  const growingSubscriptions = useMemo<SubGrow[]>(() => {
    const recurrents = new Set(
      expenses.filter(t => {
        const vendor = t.counterparty;
        const hasCur  = expenses.some(x => x.counterparty === vendor && inWindow(x.date, curStart, curEnd));
        const hasOld  = expenses.some(x => x.counterparty === vendor && inWindow(x.date, prv3Start, prv3End));
        return hasCur && hasOld;
      }).map(t => t.counterparty)
    );

    return [...recurrents].map(vendor => {
      const m0 = expenses.filter(t => t.counterparty === vendor && inWindow(t.date, curStart, curEnd)).reduce((s, t) => s + Math.abs(t.amount), 0);
      const m3 = expenses.filter(t => t.counterparty === vendor && inWindow(t.date, prv3Start, prv3End)).reduce((s, t) => s + Math.abs(t.amount), 0);
      const growth_pct = m3 > 0 ? Math.round(((m0 - m3) / m3) * 100) : 0;
      const category = expenses.find(t => t.counterparty === vendor)?.category ?? "misc";
      return { vendor, m0, m3, growth_pct, category };
    })
    .filter(s => s.growth_pct > 15 && s.m0 > 0)
    .sort((a, b) => b.growth_pct - a.growth_pct)
    .slice(0, 6);
  }, [expenses, curStart, curEnd, prv3Start, prv3End]);

  // ── Category benchmark from the tenant's OWN trailing-12-month norm ─────────
  // For each category we collect its monthly % of total spend over the last 12
  // months and take the median — that's "your typical" mix. Categories without
  // enough history fall back to the static reference. This is real, not invented.
  const selfMedian = useMemo<Record<string, number>>(() => {
    const series: Record<string, number[]> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mx = expenses.filter(t => t.date.startsWith(key));
      const byCat: Record<string, number> = {};
      let total = 0;
      mx.forEach(t => { const a = Math.abs(t.amount); byCat[t.category] = (byCat[t.category] ?? 0) + a; total += a; });
      if (total <= 0) continue;
      for (const [cat, amt] of Object.entries(byCat)) (series[cat] ??= []).push((amt / total) * 100);
    }
    const out: Record<string, number> = {};
    for (const [cat, arr] of Object.entries(series)) {
      const p = percentiles(arr);
      if (p) out[cat] = Math.round(p.p50 * 10) / 10;
    }
    return out;
  }, [expenses, today]);

  const usingOwnNorm = Object.keys(selfMedian).length > 0;

  const categoryBenchmarks = useMemo(() =>
    Object.keys(curSpend).map(key => {
      const actual = curSpend[key] ?? 0;
      const actual_pct = totalCur > 0 ? (actual / totalCur) * 100 : 0;
      const self = selfMedian[key];
      const ref = REFERENCE[key]?.median_pct;
      const median_pct = self != null ? self : (ref ?? null);
      const source: "self" | "reference" = self != null ? "self" : "reference";
      const label = CAT_LABEL[key] ?? REFERENCE[key]?.label ?? key;
      return { key, label, actual, actual_pct, median_pct, source, delta: median_pct != null ? actual_pct - median_pct : 0 };
    }).filter(c => c.actual > 0 && c.median_pct != null).sort((a, b) => b.delta - a.delta),
  [curSpend, totalCur, selfMedian]);

  // ── 3-month spend trend ───────────────────────────────────────────────────
  const months = [
    { label: format(subMonths(today, 2), "MMM"), spend: Object.values(prv2Spend).reduce((s, v) => s + v, 0) },
    { label: format(subMonths(today, 1), "MMM"), spend: Object.values(prv1Spend).reduce((s, v) => s + v, 0) },
    { label: format(today, "MMM"),               spend: totalCur },
  ];
  const maxMonthSpend = Math.max(...months.map(m => m.spend), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Spend Intelligence</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Duplicate vendors · silently-growing subscriptions · category mix vs your own norm
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "This Month Spend",  value: formatCurrency(totalCur),                         color: "text-red-400" },
          { label: "Duplicate Vendors", value: duplicates.length.toString(),                      color: duplicates.length > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Subscriptions Growing", value: growingSubscriptions.length.toString(),        color: growingSubscriptions.length > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Categories Over Benchmark", value: categoryBenchmarks.filter(c => c.delta > 5).length.toString(), color: "text-[var(--color-primary)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 3-month trend bar */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">3-Month Spend Trend</h2>
        <div className="flex items-end gap-4 h-20">
          {months.map((m, i) => {
            const h = Math.max((m.spend / maxMonthSpend) * 80, 4);
            const isLast = i === months.length - 1;
            return (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <p className="text-[10px] font-semibold text-[var(--color-muted)]">{formatCurrency(m.spend)}</p>
                <div
                  className={`w-full rounded-t-lg transition-all ${isLast ? "bg-red-500/70" : "bg-[var(--color-primary)]/30"}`}
                  style={{ height: `${h}px` }}
                />
                <p className="text-[10px] text-[var(--color-muted)]">{m.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duplicate vendors */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Repeat size={13} className="text-yellow-400" />
          <h2 className="text-sm font-semibold">Duplicate Vendor Detection</h2>
          <span className="ml-auto text-xs text-[var(--color-muted)]">Consolidation opportunities</span>
        </div>

        {duplicates.length === 0 ? (
          <p className="text-xs text-green-400 py-2">No duplicate vendor categories detected — spend is well-consolidated.</p>
        ) : (
          <div className="space-y-2">
            {duplicates.map(d => (
              <div key={d.category} className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
                <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold capitalize">{d.category}</p>
                    <span className="text-[10px] bg-yellow-900/30 text-yellow-400 border border-yellow-800/30 px-1.5 py-0.5 rounded-full">
                      {d.vendors.length} vendors
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5 truncate">
                    {d.vendors.slice(0, 3).join(", ")}{d.vendors.length > 3 ? ` +${d.vendors.length - 3} more` : ""}
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                    Consolidating to <span className="text-[var(--color-text)] font-medium">{d.topVendor}</span> could save negotiation leverage
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-red-400">{formatCurrency(d.totalSpend)}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">total spend</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Silently growing subscriptions */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={13} className="text-orange-400" />
          <h2 className="text-sm font-semibold">Silently Growing Subscriptions</h2>
          <span className="ml-auto text-xs text-[var(--color-muted)]">vs 3 months ago</span>
        </div>

        {growingSubscriptions.length === 0 ? (
          <p className="text-xs text-green-400 py-2">No recurring vendors with &gt;15% spend growth detected.</p>
        ) : (
          <div className="space-y-2">
            {growingSubscriptions.map(s => (
              <div key={s.vendor} className="flex items-center gap-3 py-2.5 border-b border-[var(--color-border)] last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{s.vendor}</p>
                    <span className="text-[10px] text-[var(--color-muted)] capitalize">{s.category}</span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    Was {formatCurrency(s.m3)} 3 months ago → now {formatCurrency(s.m0)}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-orange-400">
                  <TrendingUp size={11} />
                  <span className="text-sm font-bold tabular-nums">+{s.growth_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category vs benchmark */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={13} className="text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold">{usingOwnNorm ? "Category vs Your 12-Month Norm" : "Category vs Reference"}</h2>
          <span className="ml-auto text-[10px] text-[var(--color-muted)] bg-[var(--color-accent)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">{usingOwnNorm ? "your typical mix" : "Indian SMB reference"}</span>
        </div>

        {categoryBenchmarks.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] py-2">No spending data for the current month yet.</p>
        ) : (
          <div className="space-y-3">
            {categoryBenchmarks.map(c => {
              const over = c.delta > 5;
              const under = c.delta < -5;
              const barW = Math.min(c.actual_pct, 100);
              const benchW = Math.min(c.median_pct ?? 0, 100);
              return (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium">{c.label}</p>
                      {over  && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><TrendingUp size={8} /> +{Math.round(c.delta)}% over</span>}
                      {under && <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><TrendingDown size={8} /> {Math.round(Math.abs(c.delta))}% under</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold tabular-nums">{c.actual_pct.toFixed(1)}%</span>
                      <span className="text-[10px] text-[var(--color-muted)] ml-1">of spend</span>
                      <span className="text-[10px] text-[var(--color-muted)] ml-1">({c.source === "self" ? "your median" : "ref"} {Math.round(c.median_pct ?? 0)}%)</span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-[var(--color-bg)] rounded-full overflow-visible">
                    {/* Actual */}
                    <div className={`absolute top-0 left-0 h-full rounded-full ${over ? "bg-red-500/70" : "bg-[var(--color-primary)]/60"}`} style={{ width: `${barW}%` }} />
                    {/* Benchmark marker */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-500/70" style={{ left: `${benchW}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                    {formatCurrency(c.actual)} spent · {c.source === "self" ? "your norm" : "reference"} at {Math.round(c.median_pct ?? 0)}%
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-[var(--color-primary)]/60 rounded inline-block" /> Your spend %</span>
          <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-yellow-500/70 inline-block" /> {usingOwnNorm ? "Your 12-month median" : "Reference median"}</span>
        </div>
      </div>

      {/* #94 Spend Categorisation & Top-Vendors */}
      <SpendCategorisation />

      {/* #95 Corporate Card / Petty-Cash Manager */}
      <CorporateCardManager />

      {/* #96 Subscription / SaaS Spend Tracker */}
      <SubscriptionSpendTracker />

      {/* #97 Budget vs Actual by Cost Center */}
      <BudgetVsActualByCostCenter />

      {/* #98 Duplicate / Anomaly Payment Detector */}
      <DuplicateAnomalyDetector />

      {/* New tools */}
      <CategoryTrend12mo />
      <RecurringSpendDetector />
      <BudgetGauge />
      <SpendForecast />
      <SavingsOpportunityFinder />
      <ExpensePolicyChecker />
      <TravelSpendTracker />
      <SpendApprovalQueue />

      {/* New tools (2nd pass) */}
      <SpendVarianceVsLastMonth />
      <DiscretionaryVsCommitted />
      <TopGrowingCategories />
      <GstItcEligibleSplit />
      <ApprovalTurnaroundTracker />

      {/* Ramp-style CTA */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/25 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Connect more accounts for deeper insights</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            AA-linked accounts give Spend Intelligence a complete picture — across all banks, credit lines, and expense cards.
          </p>
        </div>
        <button onClick={() => navigate("/connectors")}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90 whitespace-nowrap shrink-0">
          Connect accounts <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4";

const SPEND_CATS = ["expense", "payroll", "tax", "loan", "transfer"] as const;
const SPEND_CAT_LABEL: Record<string, string> = {
  expense: "Operations", payroll: "Payroll", tax: "Tax & duties", loan: "Debt service", transfer: "Transfers",
};

// ── #94 Spend Categorisation & Top-Vendors ──────────────────────────────────────
function SpendCategorisation() {
  const { store } = useApp();
  const fc = formatCurrency;
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  const { byCat, byVendor, total } = useMemo(() => {
    const cat: Record<string, number> = {};
    const ven: Record<string, { amount: number; category: string; count: number }> = {};
    let tot = 0;
    expenses.forEach(t => {
      const a = Math.abs(t.amount);
      cat[t.category] = (cat[t.category] ?? 0) + a;
      const v = ven[t.counterparty] ?? { amount: 0, category: t.category, count: 0 };
      v.amount += a; v.count += 1;
      ven[t.counterparty] = v;
      tot += a;
    });
    return { byCat: cat, byVendor: ven, total: tot };
  }, [expenses]);

  const catRows = Object.entries(byCat)
    .map(([key, amount]) => ({ key, label: SPEND_CAT_LABEL[key] ?? key, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const topVendors = Object.entries(byVendor)
    .map(([name, v]) => ({ name, ...v, pct: total > 0 ? (v.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // Vendor concentration — share held by the top 5 payees
  const top5Share = topVendors.slice(0, 5).reduce((s, v) => s + v.pct, 0);
  const concentrated = top5Share > 60;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <PieChart size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Spend Categorisation & Top Vendors</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">where the money goes · all history</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No spend transactions yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Category mix */}
          <div>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">By category</p>
            <div className="space-y-2.5">
              {catRows.map(c => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{fc(c.amount)} · {c.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-primary)]/60" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top vendors */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-[var(--color-muted)]">Top vendors</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${concentrated ? "bg-yellow-900/30 text-yellow-400 border-yellow-800/30" : "bg-green-900/30 text-green-400 border-green-800/30"}`}>
                Top 5 = {top5Share.toFixed(0)}% {concentrated ? "(concentrated)" : "(diversified)"}
              </span>
            </div>
            <div className="space-y-1.5">
              {topVendors.map(v => (
                <div key={v.name} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                  <span className="flex-1 min-w-0 truncate font-medium">{v.name}</span>
                  <span className="text-[10px] text-[var(--color-muted)] capitalize shrink-0">{SPEND_CAT_LABEL[v.category] ?? v.category}</span>
                  <span className="tabular-nums text-red-400 shrink-0 w-20 text-right">{fc(v.amount)}</span>
                  <span className="tabular-nums text-[var(--color-muted)] shrink-0 w-10 text-right">{v.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Computed live from negative-amount transactions in your linked accounts. High concentration in a few vendors is a negotiation lever and a continuity risk.</p>
    </div>
  );
}

// ── #95 Corporate Card / Petty-Cash Manager ─────────────────────────────────────
type CardEntry = { id: string; holder: string; kind: "card" | "petty"; limit: number; spent: number; note: string };
function CorporateCardManager() {
  const [rows, setRows] = useFeatureState<CardEntry[]>("spend-card-entries", []);
  const [holder, setHolder] = useState("");
  const [kind, setKind] = useState<CardEntry["kind"]>("card");
  const [limit, setLimit] = useState("");
  const [spent, setSpent] = useState("");
  const [note, setNote] = useState("");
  const fc = formatCurrency;

  const add = () => {
    if (!holder.trim()) { toast.error("Enter card holder / custodian name"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), holder: holder.trim(), kind, limit: parseFloat(limit) || 0, spent: parseFloat(spent) || 0, note: note.trim() }]);
    setHolder(""); setLimit(""); setSpent(""); setNote("");
    toast.success("Account added");
  };

  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const overLimit = rows.filter(r => r.limit > 0 && r.spent > r.limit).length;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Corporate Card / Petty-Cash Manager</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">limits & reconciliation</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <input value={holder} onChange={e => setHolder(e.target.value)} placeholder="Holder / custodian *" className={INP} />
        <select value={kind} onChange={e => setKind(e.target.value as CardEntry["kind"])} className={INP}>
          <option value="card">Corporate card</option>
          <option value="petty">Petty cash</option>
        </select>
        <input type="number" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Limit / float (₹)" className={INP} />
        <input type="number" value={spent} onChange={e => setSpent(e.target.value)} placeholder="Spent / used (₹)" className={INP} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
      </div>
      <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 mb-3">+ Add account</button>

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: "Total limit / float", value: fc(totalLimit), color: "text-[var(--color-text)]" },
              { label: "Total spent", value: fc(totalSpent), color: "text-red-400" },
              { label: "Accounts over limit", value: String(overLimit), color: overLimit > 0 ? "text-red-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {rows.map(r => {
              const util = r.limit > 0 ? (r.spent / r.limit) * 100 : 0;
              const over = r.limit > 0 && r.spent > r.limit;
              return (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                  <Wallet size={12} className="text-[var(--color-muted)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{r.holder}</p>
                      <span className="text-[10px] text-[var(--color-muted)]">{r.kind === "card" ? "Card" : "Petty cash"}</span>
                      {over && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/30 px-1.5 py-0.5 rounded-full">over limit</span>}
                    </div>
                    {r.limit > 0 && (
                      <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${over ? "bg-red-500/70" : "bg-[var(--color-primary)]/60"}`} style={{ width: `${Math.min(util, 100)}%` }} />
                      </div>
                    )}
                    {r.note && <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">{r.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{fc(r.spent)}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{r.limit > 0 ? `of ${fc(r.limit)} (${util.toFixed(0)}%)` : "no limit set"}</p>
                  </div>
                  <button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Track each card / petty-cash float against its limit, reconcile spent vs allotted, and surface any account running over its sanctioned limit.</p>
    </div>
  );
}

// ── #96 Subscription / SaaS Spend Tracker ───────────────────────────────────────
type Sub = { id: string; name: string; amount: number; cycle: "monthly" | "quarterly" | "annual"; renewal: string };
function SubscriptionSpendTracker() {
  const [subs, setSubs] = useFeatureState<Sub[]>("spend-subscriptions", []);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<Sub["cycle"]>("monthly");
  const [renewal, setRenewal] = useState("");
  const fc = formatCurrency;
  const today = new Date();

  const add = () => {
    if (!name.trim() || (parseFloat(amount) || 0) <= 0) { toast.error("Enter name and amount"); return; }
    setSubs(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), amount: parseFloat(amount) || 0, cycle, renewal }]);
    setName(""); setAmount(""); setRenewal("");
    toast.success("Subscription added");
  };

  const monthly = (s: Sub) => s.cycle === "monthly" ? s.amount : s.cycle === "quarterly" ? s.amount / 3 : s.amount / 12;
  const totalMonthly = subs.reduce((s, x) => s + monthly(x), 0);
  const totalAnnual = totalMonthly * 12;

  const renewals = subs
    .filter(s => s.renewal)
    .map(s => ({ ...s, days: differenceInCalendarDays(new Date(s.renewal), today) }))
    .filter(s => s.days >= 0 && s.days <= 30)
    .sort((a, b) => a.days - b.days);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Subscription / SaaS Spend Tracker</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">recurring software · renewal alerts</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Tool / vendor *" className={INP} />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹) *" className={INP} />
        <select value={cycle} onChange={e => setCycle(e.target.value as Sub["cycle"])} className={INP}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
        <input type="date" value={renewal} onChange={e => setRenewal(e.target.value)} className={INP} />
      </div>
      <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 mb-3">+ Add subscription</button>

      {subs.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            {[
              { label: "Monthly run-rate", value: fc(Math.round(totalMonthly)), color: "text-red-400" },
              { label: "Annualised", value: fc(Math.round(totalAnnual)), color: "text-orange-400" },
              { label: "Renewing ≤ 30 days", value: String(renewals.length), color: renewals.length > 0 ? "text-yellow-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {renewals.length > 0 && (
            <div className="rounded-lg p-3 border border-yellow-800/40 bg-yellow-950/20 mb-3">
              <p className="text-xs font-semibold text-yellow-400 mb-1">Upcoming renewals</p>
              {renewals.map(r => (
                <p key={r.id} className="text-[11px] text-[var(--color-muted)]">
                  <span className="text-[var(--color-text)] font-medium">{r.name}</span> renews in {r.days === 0 ? "today" : `${r.days}d`} · {fc(r.amount)} ({r.cycle})
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {subs.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-1.5 border-b border-[var(--color-border)] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{s.cycle} · {fc(Math.round(monthly(s)))}/mo equiv.{s.renewal ? ` · renews ${format(new Date(s.renewal), "dd MMM yyyy")}` : ""}</p>
                </div>
                <span className="text-sm font-bold tabular-nums text-red-400 shrink-0">{fc(s.amount)}</span>
                <button onClick={() => setSubs(prev => prev.filter(x => x.id !== s.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Normalises every plan to a monthly run-rate, projects annual SaaS spend, and alerts on renewals due within 30 days so you can cancel before auto-billing.</p>
    </div>
  );
}

// ── #97 Budget vs Actual by Cost Center ──────────────────────────────────────────
type CostCenter = { id: string; name: string; budget: number; matchCat: string };
function BudgetVsActualByCostCenter() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [centers, setCenters] = useFeatureState<CostCenter[]>("spend-cost-centers", []);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [matchCat, setMatchCat] = useState<string>("expense");

  // Actuals for the current calendar month, by category.
  const actualByCat = useMemo(() => {
    const key = format(new Date(), "yyyy-MM");
    const map: Record<string, number> = {};
    store.transactions
      .filter(t => t.amount < 0 && t.date.startsWith(key))
      .forEach(t => { map[t.category] = (map[t.category] ?? 0) + Math.abs(t.amount); });
    return map;
  }, [store.transactions]);

  const add = () => {
    if (!name.trim() || (parseFloat(budget) || 0) <= 0) { toast.error("Enter cost-center name and budget"); return; }
    setCenters(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), budget: parseFloat(budget) || 0, matchCat }]);
    setName(""); setBudget("");
    toast.success("Cost center added");
  };

  const rows = centers.map(c => {
    const actual = actualByCat[c.matchCat] ?? 0;
    const variance = actual - c.budget;
    const usedPct = c.budget > 0 ? (actual / c.budget) * 100 : 0;
    return { ...c, actual, variance, usedPct, over: variance > 0 };
  });
  const overspent = rows.filter(r => r.over).length;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Budget vs Actual by Cost Center</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{format(new Date(), "MMMM yyyy")} actuals</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Cost center / dept *" className={INP} />
        <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Monthly budget (₹) *" className={INP} />
        <select value={matchCat} onChange={e => setMatchCat(e.target.value)} className={INP}>
          {SPEND_CATS.map(k => <option key={k} value={k}>{SPEND_CAT_LABEL[k]}</option>)}
        </select>
      </div>
      <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 mb-3">+ Add cost center</button>

      {rows.length > 0 && (
        <>
          {overspent > 0 && (
            <div className="rounded-lg p-3 border border-red-800/40 bg-red-950/20 mb-3">
              <p className="text-xs font-semibold text-red-400">{overspent} cost {overspent === 1 ? "center is" : "centers are"} over budget this month.</p>
            </div>
          )}
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">{r.name}</p>
                    <span className="text-[10px] text-[var(--color-muted)] capitalize">({SPEND_CAT_LABEL[r.matchCat] ?? r.matchCat})</span>
                    {r.over && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><TrendingUp size={8} /> +{fc(r.variance)} over</span>}
                  </div>
                  <span className="text-xs tabular-nums text-[var(--color-muted)]">{fc(r.actual)} / {fc(r.budget)}</span>
                  <button onClick={() => setCenters(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400 ml-2"><Trash2 size={12} /></button>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${r.over ? "bg-red-500/70" : r.usedPct > 80 ? "bg-yellow-500/70" : "bg-green-500/60"}`} style={{ width: `${Math.min(r.usedPct, 100)}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{r.usedPct.toFixed(0)}% of budget used</p>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Map each cost center to a spend category; actuals pull live from this month's transactions. Overspend alerts fire the moment a department crosses its budget.</p>
    </div>
  );
}

// ── #98 Duplicate / Anomaly Payment Detector ─────────────────────────────────────
function DuplicateAnomalyDetector() {
  const { store } = useApp();
  const fc = formatCurrency;
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  // Duplicate suspects: same payee + same rounded amount within 5 days.
  type Dup = { key: string; counterparty: string; amount: number; dates: string[] };
  const duplicates = useMemo<Dup[]>(() => {
    const groups: Record<string, { counterparty: string; amount: number; dates: string[] }> = {};
    expenses.forEach(t => {
      const amt = Math.abs(t.amount);
      const k = `${t.counterparty}|${Math.round(amt)}`;
      const g = groups[k] ?? { counterparty: t.counterparty, amount: amt, dates: [] };
      g.dates.push(t.date);
      groups[k] = g;
    });
    return Object.entries(groups)
      .filter(([, g]) => g.dates.length > 1)
      .map(([key, g]) => {
        const sorted = [...g.dates].sort();
        return { key, ...g, dates: sorted };
      })
      .filter(g => {
        // at least one pair within 5 calendar days
        for (let i = 1; i < g.dates.length; i++) {
          if (Math.abs(differenceInCalendarDays(new Date(g.dates[i]), new Date(g.dates[i - 1]))) <= 5) return true;
        }
        return false;
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [expenses]);

  // Amount anomalies: payments > mean + 2.5σ of all spend.
  const anomalies = useMemo(() => {
    const amts = expenses.map(t => Math.abs(t.amount));
    if (amts.length < 4) return [] as { id: string; counterparty: string; amount: number; date: string; ratio: number }[];
    const mean = amts.reduce((s, v) => s + v, 0) / amts.length;
    const sd = Math.sqrt(amts.reduce((s, v) => s + (v - mean) ** 2, 0) / amts.length);
    const threshold = mean + 2.5 * sd;
    return expenses
      .filter(t => Math.abs(t.amount) > threshold && threshold > 0)
      .map(t => ({ id: t.id, counterparty: t.counterparty, amount: Math.abs(t.amount), date: t.date, ratio: mean > 0 ? Math.abs(t.amount) / mean : 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [expenses]);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Copy size={13} className="text-yellow-400" />
        <h2 className="text-sm font-semibold">Duplicate / Anomaly Payment Detector</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">double-pays & outliers</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Duplicate suspects</p>
          <p className={`text-base font-bold tabular-nums ${duplicates.length > 0 ? "text-yellow-400" : "text-green-400"}`}>{duplicates.length}</p>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Outlier payments</p>
          <p className={`text-base font-bold tabular-nums ${anomalies.length > 0 ? "text-orange-400" : "text-green-400"}`}>{anomalies.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Possible double-payments</p>
          {duplicates.length === 0 ? (
            <p className="text-xs text-green-400 py-1">No same-payee, same-amount payments within 5 days.</p>
          ) : (
            <div className="space-y-2">
              {duplicates.map(d => (
                <div key={d.key} className="flex items-start gap-2 py-2 border-b border-[var(--color-border)] last:border-0">
                  <AlertTriangle size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.counterparty}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{d.dates.length}× {fc(d.amount)} · {d.dates.map(dt => format(new Date(dt), "dd MMM")).join(", ")}</p>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-red-400 shrink-0">{fc(d.amount * d.dates.length)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Outlier payments (&gt; mean + 2.5σ)</p>
          {anomalies.length === 0 ? (
            <p className="text-xs text-green-400 py-1">No statistically unusual payment sizes detected.</p>
          ) : (
            <div className="space-y-2">
              {anomalies.map(a => (
                <div key={a.id} className="flex items-start gap-2 py-2 border-b border-[var(--color-border)] last:border-0">
                  <TrendingUp size={12} className="text-orange-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.counterparty}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{format(new Date(a.date), "dd MMM yyyy")} · {a.ratio.toFixed(1)}× the average payment</p>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-red-400 shrink-0">{fc(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Heuristic checks on live spend: repeated same-payee/same-amount payments inside a 5-day window flag likely double-pays; payments above mean + 2.5σ flag outliers for review. Confirm before acting.</p>
    </div>
  );
}

// ── Shared month helpers for the new tools ───────────────────────────────────────
function monthKeys(n: number, from: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ── Spend-by-Category Trend (12 months) ──────────────────────────────────────────
function CategoryTrend12mo() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  const { keys, series, totalsByCat, grand } = useMemo(() => {
    const ks = monthKeys(12, today);
    const cats = SPEND_CATS as readonly string[];
    const s: Record<string, number[]> = {};
    const tot: Record<string, number> = {};
    cats.forEach(c => { s[c] = ks.map(() => 0); tot[c] = 0; });
    expenses.forEach(t => {
      const idx = ks.indexOf(t.date.slice(0, 7));
      if (idx < 0 || !s[t.category]) return;
      const a = Math.abs(t.amount);
      s[t.category][idx] += a;
      tot[t.category] += a;
    });
    const g = Object.values(tot).reduce((x, v) => x + v, 0);
    return { keys: ks, series: s, totalsByCat: tot, grand: g };
  }, [expenses, today]);

  const ranked = (SPEND_CATS as readonly string[])
    .filter(c => totalsByCat[c] > 0)
    .sort((a, b) => totalsByCat[b] - totalsByCat[a]);
  const peak = Math.max(1, ...ranked.flatMap(c => series[c]));

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Spend-by-Category Trend (12 months)</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">how each head moves over time</span>
      </div>

      {grand === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No spend history yet.</p>
      ) : (
        <div className="space-y-4">
          {ranked.map(cat => {
            const arr = series[cat];
            const first6 = arr.slice(0, 6).reduce((s, v) => s + v, 0);
            const last6 = arr.slice(6).reduce((s, v) => s + v, 0);
            const dir = last6 - first6;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">{SPEND_CAT_LABEL[cat] ?? cat}</p>
                    {dir > 0 && <span className="text-[10px] text-orange-400 flex items-center gap-0.5"><TrendingUp size={8} /> rising</span>}
                    {dir < 0 && <span className="text-[10px] text-green-400 flex items-center gap-0.5"><TrendingDown size={8} /> easing</span>}
                  </div>
                  <span className="text-xs tabular-nums text-[var(--color-muted)]">{fc(totalsByCat[cat])} total</span>
                </div>
                <div className="flex items-end gap-0.5 h-10">
                  {arr.map((v, i) => (
                    <div key={keys[i]} className="flex-1 bg-[var(--color-bg)] rounded-sm flex items-end" title={`${keys[i]}: ${fc(v)}`}>
                      <div className="w-full rounded-sm bg-[var(--color-primary)]/55" style={{ height: `${Math.max((v / peak) * 40, v > 0 ? 2 : 0)}px` }} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex justify-between text-[9px] text-[var(--color-muted)]">
            <span>{keys[0]}</span><span>{keys[keys.length - 1]}</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">A 12-bar sparkline per category from live transactions. The rising/easing tag compares the last 6 months against the prior 6 so you can see which cost heads are trending up.</p>
    </div>
  );
}

// ── Recurring-Spend (Subscriptions) Detector — auto-found from transactions ───────
function RecurringSpendDetector() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  type Rec = { vendor: string; category: string; months: number; avg: number; annualised: number; lastSeen: string };
  const recurring = useMemo<Rec[]>(() => {
    const ks = monthKeys(6, today);
    const byVendor: Record<string, { months: Set<string>; total: number; category: string; last: string }> = {};
    expenses.forEach(t => {
      const mk = t.date.slice(0, 7);
      if (!ks.includes(mk)) return;
      const v = byVendor[t.counterparty] ?? { months: new Set<string>(), total: 0, category: t.category, last: t.date };
      v.months.add(mk);
      v.total += Math.abs(t.amount);
      if (t.date > v.last) v.last = t.date;
      byVendor[t.counterparty] = v;
    });
    return Object.entries(byVendor)
      .filter(([, v]) => v.months.size >= 3)
      .map(([vendor, v]) => {
        const avg = v.total / v.months.size;
        return { vendor, category: v.category, months: v.months.size, avg, annualised: avg * 12, lastSeen: v.last };
      })
      .sort((a, b) => b.annualised - a.annualised)
      .slice(0, 10);
  }, [expenses, today]);

  const totalAnnual = recurring.reduce((s, r) => s + r.annualised, 0);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Recurring-Spend Detector</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">auto-found from your transactions</span>
      </div>

      {recurring.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No vendor billed in ≥3 of the last 6 months yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Recurring vendors found</p>
              <p className="text-base font-bold tabular-nums text-[var(--color-primary)]">{recurring.length}</p>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Annualised commitment</p>
              <p className="text-base font-bold tabular-nums text-orange-400">{fc(Math.round(totalAnnual))}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {recurring.map(r => (
              <div key={r.vendor} className="flex items-center gap-3 py-1.5 border-b border-[var(--color-border)] last:border-0">
                <Repeat size={12} className="text-[var(--color-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.vendor}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">
                    {r.months}/6 months · {SPEND_CAT_LABEL[r.category] ?? r.category} · last {format(new Date(r.lastSeen), "dd MMM")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-red-400">{fc(Math.round(r.avg))}/mo</p>
                  <p className="text-[10px] text-[var(--color-muted)]">≈ {fc(Math.round(r.annualised))}/yr</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Detects implicit subscriptions: any payee that recurs in at least 3 of the last 6 months. Average monthly spend is annualised so you can see the true forward commitment without manually registering anything.</p>
    </div>
  );
}

// ── Budget-vs-Spend Gauge (single overall envelope) ──────────────────────────────
function BudgetGauge() {
  const { store } = useApp();
  const fc = formatCurrency;
  const [budgetStr, setBudgetStr] = useFeatureState<string>("spd-monthly-budget", "");
  const budget = parseFloat(budgetStr) || 0;

  const { spentMTD, dayOfMonth, daysInMonth } = useMemo(() => {
    const now = new Date();
    const key = format(now, "yyyy-MM");
    const spent = store.transactions
      .filter(t => t.amount < 0 && t.date.startsWith(key))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { spentMTD: spent, dayOfMonth: now.getDate(), daysInMonth: dim };
  }, [store.transactions]);

  const usedPct = budget > 0 ? (spentMTD / budget) * 100 : 0;
  const projected = dayOfMonth > 0 ? (spentMTD / dayOfMonth) * daysInMonth : spentMTD;
  const projOver = budget > 0 && projected > budget;
  const over = budget > 0 && spentMTD > budget;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Gauge size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Budget-vs-Spend Gauge</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{format(new Date(), "MMMM yyyy")} · whole-business envelope</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input type="number" value={budgetStr} onChange={e => setBudgetStr(e.target.value)} placeholder="Set total monthly spend budget (₹)" className={INP} />
      </div>

      {budget <= 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-1">Enter a monthly budget to track burn against it. Spend-to-date pulls live from this month's transactions.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1 text-xs">
            <span className="font-medium">{usedPct.toFixed(0)}% of budget used</span>
            <span className="tabular-nums text-[var(--color-muted)]">{fc(Math.round(spentMTD))} / {fc(budget)}</span>
          </div>
          <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${over ? "bg-red-500/70" : usedPct > 80 ? "bg-yellow-500/70" : "bg-green-500/60"}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { label: "Spent to date", value: fc(Math.round(spentMTD)), color: over ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "Run-rate projection", value: fc(Math.round(projected)), color: projOver ? "text-red-400" : "text-[var(--color-text)]" },
              { label: "Remaining", value: fc(Math.round(Math.max(budget - spentMTD, 0))), color: "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          {projOver && !over && (
            <p className="text-[11px] text-yellow-400 mt-2">At the current daily pace you're on track to exceed the budget by month-end.</p>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">A single business-wide budget envelope (distinct from per-cost-center budgets above). The run-rate projection extrapolates month-to-date spend across the full month so overruns are visible early.</p>
    </div>
  );
}

// ── Spend Forecast (next 3 months) ───────────────────────────────────────────────
function SpendForecast() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  const { history, forecast, avg, slope } = useMemo(() => {
    const ks = monthKeys(6, today);
    const totals = ks.map(k => expenses.filter(t => t.date.startsWith(k)).reduce((s, t) => s + Math.abs(t.amount), 0));
    const observed = totals.filter(v => v > 0);
    const n = observed.length;
    const a = n > 0 ? observed.reduce((s, v) => s + v, 0) / n : 0;
    // simple slope: avg of last 2 vs prior 2 (when available)
    let sl = 0;
    if (totals.length >= 4) {
      const recent = (totals[5] + totals[4]) / 2;
      const prior = (totals[3] + totals[2]) / 2;
      if (prior > 0) sl = (recent - prior) / 2;
    }
    const fkeys = monthKeys(3, new Date(today.getFullYear(), today.getMonth() + 3, 1)).slice(-3);
    const fc3 = fkeys.map((k, i) => ({ key: k, value: Math.max(a + sl * (i + 1), 0) }));
    return {
      history: ks.map((k, i) => ({ key: k, value: totals[i] })),
      forecast: fc3, avg: a, slope: sl,
    };
  }, [expenses, today]);

  const maxV = Math.max(1, ...history.map(h => h.value), ...forecast.map(f => f.value));
  const next3 = forecast.reduce((s, f) => s + f.value, 0);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <LineChart size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Spend Forecast (next 3 months)</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">trend-projected from 6-month history</span>
      </div>

      {avg === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">Not enough spend history to forecast yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Avg monthly spend</p>
              <p className="text-base font-bold tabular-nums">{fc(Math.round(avg))}</p>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Projected next 3 months</p>
              <p className={`text-base font-bold tabular-nums ${slope > 0 ? "text-orange-400" : "text-[var(--color-text)]"}`}>{fc(Math.round(next3))}</p>
            </div>
          </div>
          <div className="flex items-end gap-1 h-24">
            {[...history, ...forecast].map((m, i) => {
              const isFc = i >= history.length;
              const h = Math.max((m.value / maxV) * 90, m.value > 0 ? 3 : 0);
              return (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1" title={`${m.key}: ${fc(Math.round(m.value))}`}>
                  <div className={`w-full rounded-t ${isFc ? "bg-[var(--color-primary)]/30 border border-dashed border-[var(--color-primary)]/50" : "bg-[var(--color-primary)]/60"}`} style={{ height: `${h}px` }} />
                  <p className="text-[8px] text-[var(--color-muted)]">{m.key.slice(5)}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-[var(--color-muted)] mt-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-[var(--color-primary)]/60 rounded inline-block" /> Actual</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-[var(--color-primary)]/30 border border-dashed border-[var(--color-primary)]/50 rounded inline-block" /> Forecast</span>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Projects spend forward using the 6-month average plus a simple trend (last two months vs the prior two). A directional planning estimate, not a guarantee.</p>
    </div>
  );
}

// ── Savings-Opportunity Finder ───────────────────────────────────────────────────
function SavingsOpportunityFinder() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  type Opp = { id: string; title: string; detail: string; saving: number };
  const opps = useMemo<Opp[]>(() => {
    const out: Opp[] = [];
    const ks = monthKeys(6, today);

    // 1) Vendors with multiple peers in same category — consolidation leverage (~5%)
    const byCatVendors: Record<string, Record<string, number>> = {};
    expenses.forEach(t => {
      const c = (byCatVendors[t.category] ??= {});
      c[t.counterparty] = (c[t.counterparty] ?? 0) + Math.abs(t.amount);
    });
    Object.entries(byCatVendors).forEach(([cat, vendors]) => {
      const names = Object.keys(vendors);
      if (names.length >= 3) {
        const total = Object.values(vendors).reduce((s, v) => s + v, 0);
        out.push({
          id: `consolidate-${cat}`,
          title: `Consolidate ${names.length} ${SPEND_CAT_LABEL[cat] ?? cat} vendors`,
          detail: `Negotiating one preferred supplier could earn a volume discount.`,
          saving: total * 0.05,
        });
      }
    });

    // 2) Recurring vendors growing month-on-month — review for downgrade (~half of the increase)
    const byVendorMonth: Record<string, Record<string, number>> = {};
    expenses.forEach(t => {
      const mk = t.date.slice(0, 7);
      if (!ks.includes(mk)) return;
      const v = (byVendorMonth[t.counterparty] ??= {});
      v[mk] = (v[mk] ?? 0) + Math.abs(t.amount);
    });
    Object.entries(byVendorMonth).forEach(([vendor, m]) => {
      const present = ks.filter(k => m[k] > 0);
      if (present.length >= 4) {
        const firstHalf = ks.slice(0, 3).reduce((s, k) => s + (m[k] ?? 0), 0);
        const secondHalf = ks.slice(3).reduce((s, k) => s + (m[k] ?? 0), 0);
        if (secondHalf > firstHalf * 1.25 && firstHalf > 0) {
          out.push({
            id: `review-${vendor}`,
            title: `Review rising spend with ${vendor}`,
            detail: `Spend rose from ${fc(Math.round(firstHalf))} to ${fc(Math.round(secondHalf))} across two halves of the last 6 months.`,
            saving: (secondHalf - firstHalf) * 0.5,
          });
        }
      }
    });

    return out.sort((a, b) => b.saving - a.saving).slice(0, 8);
  }, [expenses, today, fc]);

  const totalSaving = opps.reduce((s, o) => s + o.saving, 0);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={13} className="text-yellow-400" />
        <h2 className="text-sm font-semibold">Savings-Opportunity Finder</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">estimated, indicative</span>
      </div>

      {opps.length === 0 ? (
        <p className="text-xs text-green-400 py-2">No obvious consolidation or rising-spend opportunities found — spend looks lean.</p>
      ) : (
        <>
          <div className="rounded-lg p-3 border border-green-800/40 bg-green-950/20 mb-3">
            <p className="text-xs text-[var(--color-muted)]">Estimated annual savings potential</p>
            <p className="text-lg font-bold tabular-nums text-green-400">{fc(Math.round(totalSaving))}</p>
          </div>
          <div className="space-y-2">
            {opps.map(o => (
              <div key={o.id} className="flex items-start gap-2 py-2 border-b border-[var(--color-border)] last:border-0">
                <Lightbulb size={12} className="text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{o.detail}</p>
                </div>
                <span className="text-xs font-bold tabular-nums text-green-400 shrink-0">~{fc(Math.round(o.saving))}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Surfaces consolidation leverage (≥3 vendors in one category) and vendors whose spend climbed materially across the last six months. Savings figures are rough heuristics to prioritise where to look, not committed numbers.</p>
    </div>
  );
}

// ── Expense-Policy Threshold Checker ─────────────────────────────────────────────
type PolicyRule = { id: string; category: string; cap: number };
function ExpensePolicyChecker() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const [rules, setRules] = useFeatureState<PolicyRule[]>("spd-policy-rules", []);
  const [cat, setCat] = useState<string>("expense");
  const [cap, setCap] = useState("");

  const recent = useMemo(() => store.transactions.filter(t => t.amount < 0 && t.date.startsWith(format(today, "yyyy-MM"))), [store.transactions, today]);

  const add = () => {
    if ((parseFloat(cap) || 0) <= 0) { toast.error("Enter a per-transaction cap"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), category: cat, cap: parseFloat(cap) || 0 }]);
    setCap("");
    toast.success("Policy rule added");
  };

  const breaches = useMemo(() => {
    const out: { id: string; counterparty: string; amount: number; date: string; cap: number; category: string }[] = [];
    rules.forEach(r => {
      recent.filter(t => t.category === r.category && Math.abs(t.amount) > r.cap).forEach(t => {
        out.push({ id: `${r.id}-${t.id}`, counterparty: t.counterparty, amount: Math.abs(t.amount), date: t.date, cap: r.cap, category: r.category });
      });
    });
    return out.sort((a, b) => b.amount - a.amount).slice(0, 12);
  }, [rules, recent]);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Expense-Policy Threshold Checker</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{format(today, "MMMM yyyy")} transactions</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        <select value={cat} onChange={e => setCat(e.target.value)} className={INP}>
          {SPEND_CATS.map(k => <option key={k} value={k}>{SPEND_CAT_LABEL[k]}</option>)}
        </select>
        <input type="number" value={cap} onChange={e => setCap(e.target.value)} placeholder="Per-transaction cap (₹)" className={INP} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add rule</button>
      </div>

      {rules.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {rules.map(r => (
            <span key={r.id} className="flex items-center gap-1.5 text-[10px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full px-2 py-1">
              {SPEND_CAT_LABEL[r.category] ?? r.category} ≤ {fc(r.cap)}
              <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={10} /></button>
            </span>
          ))}
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-1">Add a per-transaction cap per category; this month's transactions that exceed it are flagged below.</p>
      ) : breaches.length === 0 ? (
        <p className="text-xs text-green-400 py-1">No transactions this month breach the configured caps.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-400">{breaches.length} policy {breaches.length === 1 ? "breach" : "breaches"} this month</p>
          {breaches.map(b => (
            <div key={b.id} className="flex items-start gap-2 py-2 border-b border-[var(--color-border)] last:border-0">
              <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.counterparty}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{format(new Date(b.date), "dd MMM")} · {SPEND_CAT_LABEL[b.category] ?? b.category} · cap {fc(b.cap)}</p>
              </div>
              <span className="text-xs font-bold tabular-nums text-red-400 shrink-0">{fc(b.amount)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Define plain per-category spend caps and the checker scans this month's live transactions for any single payment that exceeds the threshold — a lightweight policy audit without programmable cards.</p>
    </div>
  );
}

// ── T&E (Travel) Spend Tracker ───────────────────────────────────────────────────
const TRAVEL_HINTS = ["travel", "flight", "air", "indigo", "vistara", "spicejet", "irctc", "rail", "train", "hotel", "oyo", "taxi", "cab", "uber", "ola", "fuel", "petrol", "makemytrip", "goibibo", "yatra"];
function TravelSpendTracker() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const expenses = useMemo(() => store.transactions.filter(t => t.amount < 0), [store.transactions]);

  const { monthly, total, byVendor, count } = useMemo(() => {
    const ks = monthKeys(6, today);
    const isTravel = (t: typeof expenses[number]) => {
      const blob = `${t.counterparty} ${t.description}`.toLowerCase();
      return TRAVEL_HINTS.some(h => blob.includes(h));
    };
    const matched = expenses.filter(isTravel);
    const m = ks.map(k => ({ key: k, value: matched.filter(t => t.date.startsWith(k)).reduce((s, t) => s + Math.abs(t.amount), 0) }));
    const ven: Record<string, number> = {};
    matched.forEach(t => { ven[t.counterparty] = (ven[t.counterparty] ?? 0) + Math.abs(t.amount); });
    const top = Object.entries(ven).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 6);
    return { monthly: m, total: matched.reduce((s, t) => s + Math.abs(t.amount), 0), byVendor: top, count: matched.length };
  }, [expenses, today]);

  const maxV = Math.max(1, ...monthly.map(m => m.value));

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Plane size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">T&amp;E (Travel) Spend Tracker</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">flights · hotels · cabs · fuel</span>
      </div>

      {count === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No travel-related spend detected in your transactions.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-[var(--color-muted)]">Monthly travel spend</p>
              <span className="text-[10px] text-[var(--color-muted)]">{fc(Math.round(total))} over 6 mo · {count} txns</span>
            </div>
            <div className="flex items-end gap-1.5 h-20">
              {monthly.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1" title={`${m.key}: ${fc(Math.round(m.value))}`}>
                  <div className="w-full rounded-t bg-[var(--color-primary)]/55" style={{ height: `${Math.max((m.value / maxV) * 70, m.value > 0 ? 3 : 0)}px` }} />
                  <p className="text-[8px] text-[var(--color-muted)]">{m.key.slice(5)}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Top travel vendors</p>
            <div className="space-y-1.5">
              {byVendor.map(v => (
                <div key={v.name} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                  <span className="flex-1 min-w-0 truncate font-medium">{v.name}</span>
                  <span className="tabular-nums text-red-400 shrink-0">{fc(Math.round(v.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Identifies travel &amp; entertainment spend by matching vendor and description against common airline, rail, hotel, cab and fuel keywords. A keyword heuristic — re-tag any miscategorised line in your books.</p>
    </div>
  );
}

// ── Spend Approval Queue ─────────────────────────────────────────────────────────
type ApprovalItem = { id: string; vendor: string; amount: number; requester: string; note: string; status: "pending" | "approved" | "rejected"; created: string };
function SpendApprovalQueue() {
  const fc = formatCurrency;
  const [items, setItems] = useFeatureState<ApprovalItem[]>("spd-approval-queue", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [requester, setRequester] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<ApprovalItem["status"] | "all">("pending");

  const add = () => {
    if (!vendor.trim() || (parseFloat(amount) || 0) <= 0) { toast.error("Enter vendor and amount"); return; }
    setItems(prev => [{ id: crypto.randomUUID(), vendor: vendor.trim(), amount: parseFloat(amount) || 0, requester: requester.trim(), note: note.trim(), status: "pending", created: new Date().toISOString() }, ...prev]);
    setVendor(""); setAmount(""); setRequester(""); setNote("");
    toast.success("Spend request queued");
  };
  const setStatus = (id: string, status: ApprovalItem["status"]) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, status } : x));
    toast.success(`Request ${status}`);
  };

  const pendingTotal = items.filter(i => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const filtered = items.filter(i => filter === "all" || i.status === filter);
  const FILTERS = ["pending", "approved", "rejected", "all"] as const;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <CheckSquare size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Spend Approval Queue</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">request → approve / reject</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor / purpose *" className={INP} />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹) *" className={INP} />
        <input value={requester} onChange={e => setRequester(e.target.value)} placeholder="Requested by" className={INP} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={INP} />
      </div>
      <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 mb-3">+ Queue request</button>

      {items.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2 px-3">
              <span className="text-[10px] text-[var(--color-muted)]">Pending value </span>
              <span className="text-sm font-bold tabular-nums text-yellow-400">{fc(pendingTotal)}</span>
            </div>
            <div className="ml-auto flex gap-1">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`text-[10px] px-2 py-1 rounded-full border capitalize ${filter === f ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)] py-1">No {filter} requests.</p>
            ) : filtered.map(i => (
              <div key={i.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{i.vendor}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${i.status === "approved" ? "bg-green-900/30 text-green-400 border-green-800/30" : i.status === "rejected" ? "bg-red-900/30 text-red-400 border-red-800/30" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/30"}`}>{i.status}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">
                    {i.requester ? `by ${i.requester} · ` : ""}{format(new Date(i.created), "dd MMM")}{i.note ? ` · ${i.note}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{fc(i.amount)}</span>
                {i.status === "pending" && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setStatus(i.id, "approved")} className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-2 py-1 rounded hover:opacity-80">Approve</button>
                    <button onClick={() => setStatus(i.id, "rejected")} className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/30 px-2 py-1 rounded hover:opacity-80">Reject</button>
                  </div>
                )}
                <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">A simple pre-spend approval workflow: queue a request, review pending value at a glance, then approve or reject with a full status trail — durable across devices.</p>
    </div>
  );
}

// ── Spend Variance vs Last Month ─────────────────────────────────────────────────
function SpendVarianceVsLastMonth() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();

  const { rows, curTotal, prvTotal } = useMemo(() => {
    const ks = monthKeys(2, today);
    const prvKey = ks[0];
    const curKey = ks[1];
    const cur: Record<string, number> = {};
    const prv: Record<string, number> = {};
    let ct = 0, pt = 0;
    store.transactions.filter(t => t.amount < 0).forEach(t => {
      const mk = t.date.slice(0, 7);
      const a = Math.abs(t.amount);
      if (mk === curKey) { cur[t.category] = (cur[t.category] ?? 0) + a; ct += a; }
      else if (mk === prvKey) { prv[t.category] = (prv[t.category] ?? 0) + a; pt += a; }
    });
    const cats = new Set([...Object.keys(cur), ...Object.keys(prv)]);
    const r = [...cats].map(cat => {
      const c = cur[cat] ?? 0;
      const p = prv[cat] ?? 0;
      const delta = c - p;
      const pct = p > 0 ? (delta / p) * 100 : (c > 0 ? 100 : 0);
      return { cat, c, p, delta, pct };
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { rows: r, curTotal: ct, prvTotal: pt };
  }, [store.transactions, today]);

  const totalDelta = curTotal - prvTotal;
  const totalPct = prvTotal > 0 ? (totalDelta / prvTotal) * 100 : 0;
  const ks = monthKeys(2, today);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Scale size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Spend Variance vs Last Month</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{ks[1]} vs {ks[0]}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No spend in the last two months to compare.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: "This month", value: fc(Math.round(curTotal)), color: "text-[var(--color-text)]" },
              { label: "Last month", value: fc(Math.round(prvTotal)), color: "text-[var(--color-muted)]" },
              { label: "Change", value: `${totalDelta >= 0 ? "+" : ""}${fc(Math.round(totalDelta))} (${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(0)}%)`, color: totalDelta > 0 ? "text-red-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {rows.map(r => {
              const up = r.delta > 0;
              return (
                <div key={r.cat} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{SPEND_CAT_LABEL[r.cat] ?? r.cat}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{fc(Math.round(r.p))} → {fc(Math.round(r.c))}</p>
                  </div>
                  <div className={`flex items-center gap-1 shrink-0 ${up ? "text-red-400" : "text-green-400"}`}>
                    {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    <span className="text-sm font-bold tabular-nums">{up ? "+" : ""}{fc(Math.round(r.delta))}</span>
                    <span className="text-[10px] tabular-nums">({r.pct >= 0 ? "+" : ""}{r.pct.toFixed(0)}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Month-over-month variance per category from live transactions, ranked by the largest rupee swing — so you instantly see what drove this month's spend up or down versus last month.</p>
    </div>
  );
}

// ── Discretionary vs Committed Spend ─────────────────────────────────────────────
const COMMITTED_CATS = ["payroll", "loan", "tax"] as const;
function DiscretionaryVsCommitted() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();

  const { committed, discretionary, total } = useMemo(() => {
    const key = format(today, "yyyy-MM");
    let com = 0, dis = 0;
    store.transactions
      .filter(t => t.amount < 0 && t.date.startsWith(key))
      .forEach(t => {
        const a = Math.abs(t.amount);
        if ((COMMITTED_CATS as readonly string[]).includes(t.category)) com += a;
        else dis += a;
      });
    return { committed: com, discretionary: dis, total: com + dis };
  }, [store.transactions, today]);

  const comPct = total > 0 ? (committed / total) * 100 : 0;
  const disPct = total > 0 ? (discretionary / total) * 100 : 0;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Layers size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Discretionary vs Committed Spend</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{format(today, "MMMM yyyy")}</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No spend this month yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Committed (payroll · debt · tax)</p>
              <p className="text-base font-bold tabular-nums text-[var(--color-text)]">{fc(Math.round(committed))}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{comPct.toFixed(0)}% of spend</p>
            </div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">Discretionary (ops · transfers)</p>
              <p className="text-base font-bold tabular-nums text-orange-400">{fc(Math.round(discretionary))}</p>
              <p className="text-[10px] text-[var(--color-muted)]">{disPct.toFixed(0)}% of spend</p>
            </div>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-[var(--color-bg)]">
            <div className="h-full bg-[var(--color-primary)]/60" style={{ width: `${comPct}%` }} title={`Committed ${comPct.toFixed(0)}%`} />
            <div className="h-full bg-orange-500/60" style={{ width: `${disPct}%` }} title={`Discretionary ${disPct.toFixed(0)}%`} />
          </div>
          <div className="flex items-center gap-4 text-[10px] text-[var(--color-muted)] mt-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-[var(--color-primary)]/60 rounded inline-block" /> Committed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-orange-500/60 rounded inline-block" /> Discretionary</span>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Splits this month's spend into committed obligations (payroll, debt service, tax — hard to cut quickly) versus discretionary spend (operations, transfers — your real lever in a cash crunch).</p>
    </div>
  );
}

// ── Top-Growing Expense Categories (last 3 vs prior 3 months) ────────────────────
function TopGrowingCategories() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();

  const rows = useMemo(() => {
    const ks = monthKeys(6, today);
    const recentKeys = ks.slice(3);
    const priorKeys = ks.slice(0, 3);
    const recent: Record<string, number> = {};
    const prior: Record<string, number> = {};
    store.transactions.filter(t => t.amount < 0).forEach(t => {
      const mk = t.date.slice(0, 7);
      const a = Math.abs(t.amount);
      if (recentKeys.includes(mk)) recent[t.category] = (recent[t.category] ?? 0) + a;
      else if (priorKeys.includes(mk)) prior[t.category] = (prior[t.category] ?? 0) + a;
    });
    const cats = new Set([...Object.keys(recent), ...Object.keys(prior)]);
    return [...cats].map(cat => {
      const r = recent[cat] ?? 0;
      const p = prior[cat] ?? 0;
      const delta = r - p;
      const pct = p > 0 ? (delta / p) * 100 : (r > 0 ? 100 : 0);
      return { cat, r, p, delta, pct };
    }).filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
  }, [store.transactions, today]);

  const maxDelta = Math.max(1, ...rows.map(r => r.delta));

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <ArrowUpRight size={13} className="text-orange-400" />
        <h2 className="text-sm font-semibold">Top-Growing Expense Categories</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">last 3 mo vs prior 3 mo</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-green-400 py-2">No category grew over the last three months versus the prior three.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.cat}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium">{SPEND_CAT_LABEL[r.cat] ?? r.cat}</p>
                <span className="text-xs tabular-nums text-orange-400 flex items-center gap-1">
                  <TrendingUp size={10} /> +{fc(Math.round(r.delta))} <span className="text-[10px]">(+{r.pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-orange-500/60" style={{ width: `${Math.min((r.delta / maxDelta) * 100, 100)}%` }} />
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{fc(Math.round(r.p))} → {fc(Math.round(r.r))} over the two windows</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Ranks categories by the rupee increase between the last three months and the prior three — the fastest-rising cost heads to investigate before they compound.</p>
    </div>
  );
}

// ── GST / ITC-Eligible Spend Split ───────────────────────────────────────────────
// Heuristic: operations spend typically carries claimable input GST; payroll, debt
// service, tax payments and internal transfers generally do not.
const ITC_ELIGIBLE_CATS = ["expense"] as const;
function GstItcEligibleSplit() {
  const { store } = useApp();
  const fc = formatCurrency;
  const today = new Date();
  const [ratePct, setRatePct] = useFeatureState<string>("spd-itc-rate", "18");

  const { eligible, ineligible, total } = useMemo(() => {
    const key = format(today, "yyyy-MM");
    let el = 0, inel = 0;
    store.transactions
      .filter(t => t.amount < 0 && t.date.startsWith(key))
      .forEach(t => {
        const a = Math.abs(t.amount);
        if ((ITC_ELIGIBLE_CATS as readonly string[]).includes(t.category)) el += a;
        else inel += a;
      });
    return { eligible: el, ineligible: inel, total: el + inel };
  }, [store.transactions, today]);

  const rate = Math.min(Math.max(parseFloat(ratePct) || 0, 0), 28);
  // GST embedded inside a tax-inclusive spend amount: amount * rate / (100 + rate)
  const estItc = rate > 0 ? eligible * (rate / (100 + rate)) : 0;
  const elPct = total > 0 ? (eligible / total) * 100 : 0;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Receipt size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">GST / ITC-Eligible Spend Split</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">{format(today, "MMMM yyyy")} · estimate</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-[var(--color-muted)] whitespace-nowrap">Assumed GST rate</label>
        <input type="number" value={ratePct} onChange={e => setRatePct(e.target.value)} placeholder="18" className={`${INP} max-w-[120px]`} />
        <span className="text-xs text-[var(--color-muted)]">%</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-1">No spend this month yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: "ITC-eligible spend (ops)", value: fc(Math.round(eligible)), color: "text-[var(--color-text)]" },
              { label: "Non-eligible spend", value: fc(Math.round(ineligible)), color: "text-[var(--color-muted)]" },
              { label: "Est. claimable input GST", value: fc(Math.round(estItc)), color: "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-green-500/60" style={{ width: `${elPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--color-muted)] mt-1">{elPct.toFixed(0)}% of this month's spend is operations spend assumed to carry claimable input GST.</p>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">A planning estimate, not a filing: treats operations spend as GST-inclusive and extracts the embedded input tax at your assumed rate. Payroll, debt, tax and transfers are excluded. Verify against actual tax invoices and GSTR-2B before claiming ITC.</p>
    </div>
  );
}

// ── Approval Turnaround Tracker ──────────────────────────────────────────────────
// Reads the durable approval queue (spd-approval-queue) written by SpendApprovalQueue
// and records the time each request was decided, persisted under its own key.
function ApprovalTurnaroundTracker() {
  const [queue] = useFeatureState<ApprovalItem[]>("spd-approval-queue", []);
  const [decidedAt, setDecidedAt] = useFeatureState<Record<string, string>>("spd-approval-decided", {});

  const decided = useMemo(() => queue.filter(i => i.status !== "pending"), [queue]);
  const pending = useMemo(() => queue.filter(i => i.status === "pending"), [queue]);

  // Stamp a decided-at time the first time we observe a decided request without one.
  const stampMissing = () => {
    const missing = decided.filter(i => !decidedAt[i.id]);
    if (missing.length === 0) { toast.info("All decided requests already timestamped"); return; }
    const now = new Date().toISOString();
    setDecidedAt(prev => {
      const next = { ...prev };
      missing.forEach(i => { next[i.id] = now; });
      return next;
    });
    toast.success(`Stamped ${missing.length} decided ${missing.length === 1 ? "request" : "requests"}`);
  };

  const turnarounds = decided
    .filter(i => decidedAt[i.id])
    .map(i => ({
      id: i.id,
      vendor: i.vendor,
      status: i.status,
      hours: Math.max(differenceInCalendarDays(new Date(decidedAt[i.id]), new Date(i.created)), 0),
      created: i.created,
    }));
  const avgDays = turnarounds.length > 0
    ? turnarounds.reduce((s, t) => s + t.hours, 0) / turnarounds.length
    : 0;
  const oldestPending = pending
    .map(i => differenceInCalendarDays(new Date(), new Date(i.created)))
    .reduce((m, d) => Math.max(m, d), 0);

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 mb-3">
        <Timer size={13} className="text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">Approval Turnaround Tracker</h2>
        <span className="ml-auto text-xs text-[var(--color-muted)]">SLA on the approval queue</span>
      </div>

      {queue.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-2">No spend requests queued yet. Add requests in the Spend Approval Queue above, then stamp decisions here to track turnaround.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: "Avg decision time", value: turnarounds.length > 0 ? `${avgDays.toFixed(1)}d` : "—", color: "text-[var(--color-text)]" },
              { label: "Pending now", value: String(pending.length), color: pending.length > 0 ? "text-yellow-400" : "text-green-400" },
              { label: "Oldest pending", value: pending.length > 0 ? `${oldestPending}d` : "—", color: oldestPending > 3 ? "text-red-400" : "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{c.label}</p>
                <p className={`text-base font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <button onClick={stampMissing} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 mb-3">Stamp decided requests now</button>

          {turnarounds.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)] py-1">Once requests are approved/rejected in the queue, press the button to record when — then per-request turnaround appears here.</p>
          ) : (
            <div className="space-y-2">
              {turnarounds.sort((a, b) => b.hours - a.hours).map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{t.vendor}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${t.status === "approved" ? "bg-green-900/30 text-green-400 border-green-800/30" : "bg-red-900/30 text-red-400 border-red-800/30"}`}>{t.status}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)]">requested {format(new Date(t.created), "dd MMM")}</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${t.hours > 3 ? "text-red-400" : "text-[var(--color-text)]"}`}>{t.hours}d</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)] mt-3">Measures how quickly spend requests move from queued to decided. It reads the same approval queue above; press the button to record decision times, then watch the average turnaround and flag any request sitting too long.</p>
    </div>
  );
}
