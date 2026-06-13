import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { percentiles } from "@/lib/finance";
import { TrendingUp, TrendingDown, AlertTriangle, Repeat, Eye, ChevronRight } from "lucide-react";
import { format, startOfMonth, subMonths, isWithinInterval } from "date-fns";
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
