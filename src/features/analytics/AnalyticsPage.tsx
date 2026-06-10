import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";

const CATEGORY_COLORS: Record<string, string> = {
  expense:  "#ef4444",
  payroll:  "#f97316",
  tax:      "#eab308",
  loan:     "#8b5cf6",
  transfer: "#6b7280",
  revenue:  "#22c55e",
};

const CATEGORY_LABEL: Record<string, string> = {
  expense:  "Operating Expenses",
  payroll:  "Payroll",
  tax:      "Taxes",
  loan:     "Loan Repayments",
  transfer: "Transfers",
  revenue:  "Revenue",
};

const PIE_PALETTE = ["#22c55e", "#3b82f6", "#f97316", "#ef4444", "#8b5cf6", "#eab308", "#14b8a6"];

function delta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function DeltaBadge({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return null;
  const good = inverse ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${good ? "bg-green-900/30 text-green-400" : pct === 0 ? "bg-[var(--color-accent)] text-[var(--color-muted)]" : "bg-red-900/30 text-red-400"}`}>
      <Icon size={9} />{Math.abs(pct)}%
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-xs shadow-lg">
      <p className="font-semibold mb-2 text-[var(--color-text)]">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-muted)]">{p.name}:</span>
          <span className="font-semibold text-[var(--color-text)]">{formatAmount(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const { store } = useApp();
  const { transactions, bankAccounts, firm } = store;
  const [tab, setTab] = useState<"overview" | "revenue" | "expenses" | "benchmarks">("overview");

  const now = new Date();

  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    return {
      label:  format(d, "MMM"),
      full:   format(d, "MMM yyyy"),
      start:  startOfMonth(d).toISOString().split("T")[0],
      end:    endOfMonth(d).toISOString().split("T")[0],
    };
  }), []);

  const monthlyData = useMemo(() => months.map(m => {
    const mTxns   = transactions.filter(t => t.date >= m.start && t.date <= m.end);
    const revenue = mTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(mTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const net     = revenue - expense;
    const margin  = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
    return { month: m.label, revenue, expense, net, margin };
  }), [transactions, months]);

  const currMonth = monthlyData[5];
  const prevMonth = monthlyData[4];

  const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
  const totalExpense = monthlyData.reduce((s, m) => s + m.expense, 0);
  const totalNet     = totalRevenue - totalExpense;
  const avgMargin    = monthlyData.filter(m => m.revenue > 0).reduce((s, m) => s + m.margin, 0) / Math.max(1, monthlyData.filter(m => m.revenue > 0).length);

  const categoryTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount < 0).forEach(t => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const categoryPieData = categoryTotals
    .filter(([cat]) => cat !== "transfer")
    .map(([cat, val], i) => ({ name: CATEGORY_LABEL[cat] ?? cat, value: val, color: PIE_PALETTE[i % PIE_PALETTE.length] }));

  const topCustomers = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount > 0 && t.counterparty).forEach(t => {
      acc[t.counterparty] = (acc[t.counterparty] || 0) + t.amount;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount, pct: Math.round((amount / Math.max(1, totalRevenue)) * 100) }));
  }, [transactions, totalRevenue]);

  const topVendors = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      acc[t.counterparty] = (acc[t.counterparty] || 0) + Math.abs(t.amount);
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount, pct: Math.round((amount / Math.max(1, totalExpense)) * 100) }));
  }, [transactions, totalExpense]);

  const revenueByMonth = useMemo(() => months.map(m => {
    const mTxns = transactions.filter(t => t.date >= m.start && t.date <= m.end && t.amount > 0);
    const rev   = mTxns.reduce((s, t) => s + t.amount, 0);
    return { month: m.label, revenue: rev };
  }), [transactions, months]);

  const expByCategory = useMemo(() => {
    const cutoff = subMonths(now, 1).toISOString().split("T")[0];
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.date >= cutoff).forEach(t => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([cat, val]) => ({ name: CATEGORY_LABEL[cat] ?? cat, value: val, fill: CATEGORY_COLORS[cat] ?? "#6b7280" }));
  }, [transactions]);

  const TABS = [
    { id: "overview",   label: "Overview" },
    { id: "revenue",    label: "Revenue" },
    { id: "expenses",   label: "Expenses" },
    { id: "benchmarks", label: "Benchmarks" },
  ] as const;

  const benchmarks = [
    { label: "Payroll / Revenue",   yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="payroll")?.[1]??0) / totalRevenue * 100) : 0, industry: 35, unit: "%" },
    { label: "OpEx / Revenue",      yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="expense")?.[1]??0) / totalRevenue * 100) : 0, industry: 40, unit: "%" },
    { label: "Net Profit Margin",   yours: Math.round(avgMargin), industry: 15, unit: "%" },
    { label: "Tax / Revenue",       yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="tax")?.[1]??0) / totalRevenue * 100) : 0, industry: 8, unit: "%" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">{firm.name} · Last 6 months · {transactions.length} transactions analysed</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "6-Month Revenue",  value: totalRevenue,  color: "text-green-400",                delta: delta(currMonth.revenue, prevMonth.revenue) },
          { label: "6-Month Expenses", value: totalExpense,  color: "text-red-400",                  delta: delta(currMonth.expense, prevMonth.expense), inverse: true },
          { label: "Net P&L",          value: totalNet,      color: totalNet >= 0 ? "text-green-400" : "text-red-400", delta: null },
          { label: "Avg Net Margin",   value: null,          color: avgMargin >= 10 ? "text-green-400" : avgMargin >= 0 ? "text-yellow-400" : "text-red-400", delta: null, pct: avgMargin },
        ].map(({ label, value, color, delta: d, inverse, pct }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)]">{label}</p>
              {d !== undefined && <DeltaBadge pct={d} inverse={inverse} />}
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>
              {pct !== undefined ? `${pct}%` : formatAmount(value ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Revenue vs Expense Bar Chart */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Revenue vs Expenses · Monthly</p>
              <div className="flex items-center gap-3 text-[10px] text-[var(--color-muted)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-primary)] inline-block" />Revenue</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Expenses</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary)" radius={[3,3,0,0]} />
                <Bar dataKey="expense" name="Expenses" fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Net Profit Margin Trend + Category Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Net Profit Margin %</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={38} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Margin"]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="margin" name="Margin" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-primary)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <p className="text-sm font-semibold mb-4">Expense Breakdown</p>
              {categoryPieData.length === 0 ? (
                <div className="flex items-center justify-center h-[180px] text-sm text-[var(--color-muted)]">No expense data</div>
              ) : (
                <div className="flex items-start gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={3} dataKey="value">
                        {categoryPieData.map((_, i) => <Cell key={i} fill={categoryPieData[i].color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [formatAmount(v), ""]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 pt-1">
                    {categoryPieData.slice(0, 5).map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-[var(--color-muted)] truncate flex-1">{d.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{formatAmount(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Top Customers + Top Vendors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <p className="text-sm font-semibold mb-3">Top 5 Revenue Sources</p>
              {topCustomers.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No revenue transactions</p> : (
                <div className="space-y-2.5">
                  {topCustomers.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs truncate flex-1 pr-2">{c.name}</span>
                        <span className="text-xs font-semibold tabular-nums text-green-400">{formatAmount(c.amount)}</span>
                        <span className="text-[10px] text-[var(--color-muted)] ml-2 w-8 text-right">{c.pct}%</span>
                      </div>
                      <div className="h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <p className="text-sm font-semibold mb-3">Top 5 Expense Vendors</p>
              {topVendors.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No expense transactions</p> : (
                <div className="space-y-2.5">
                  {topVendors.map((v, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs truncate flex-1 pr-2">{v.name}</span>
                        <span className="text-xs font-semibold tabular-nums text-red-400">{formatAmount(v.amount)}</span>
                        <span className="text-[10px] text-[var(--color-muted)] ml-2 w-8 text-right">{v.pct}%</span>
                      </div>
                      <div className="h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${v.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REVENUE ── */}
      {tab === "revenue" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "This Month Revenue",   value: currMonth.revenue, vs: prevMonth.revenue, color: "text-green-400" },
              { label: "Avg Monthly Revenue",  value: totalRevenue / 6,  vs: null,              color: "text-[var(--color-primary)]" },
              { label: "Revenue Concentration", value: null, vs: null, pct: topCustomers[0]?.pct ?? 0, label2: topCustomers[0]?.pct ? `${topCustomers[0].pct}% from #1 customer` : "Diversified", color: topCustomers[0]?.pct > 50 ? "text-red-400" : "text-green-400" },
            ].map(({ label, value, vs, color, pct, label2 }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-[var(--color-muted)]">{label}</p>
                  {vs !== null && <DeltaBadge pct={delta(value ?? 0, vs)} />}
                </div>
                <p className={`text-xl font-bold ${color}`}>{pct !== undefined ? `${pct}%` : formatAmount(value ?? 0)}</p>
                {label2 && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{label2}</p>}
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">Revenue Trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Revenue by Customer</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Total Revenue", "Share", "Trend"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {topCustomers.map((c, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 tabular-nums text-green-400 font-semibold">{formatAmount(c.amount)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden max-w-[80px]">
                          <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${c.pct}%` }} />
                        </div>
                        <span className="text-xs text-[var(--color-muted)]">{c.pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><TrendingUp size={13} className="text-green-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EXPENSES ── */}
      {tab === "expenses" && (
        <div className="space-y-5">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">Expense by Category · Last 30 days</p>
            {expByCategory.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No expense data</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={expByCategory} layout="vertical" barCategoryGap="25%">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={115} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Amount" radius={[0,4,4,0]}>
                    {expByCategory.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Top Vendors by Spend</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Vendor", "Total Spent", "% of Expenses", "Category"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {topVendors.map((v, i) => {
                  const cat = transactions.find(t => t.counterparty === v.name && t.amount < 0)?.category ?? "expense";
                  return (
                    <tr key={i} className="hover:bg-white/2">
                      <td className="px-5 py-3 font-medium">{v.name}</td>
                      <td className="px-5 py-3 tabular-nums text-red-400 font-semibold">{formatAmount(v.amount)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${v.pct}%` }} />
                          </div>
                          <span className="text-xs text-[var(--color-muted)]">{v.pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{ background: `${CATEGORY_COLORS[cat]}20`, color: CATEGORY_COLORS[cat], borderColor: `${CATEGORY_COLORS[cat]}40` }}>
                          {CATEGORY_LABEL[cat] ?? cat}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {categoryTotals.filter(([c]) => c !== "transfer").slice(0, 3).map(([cat, val]) => (
              <div key={cat} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: `${CATEGORY_COLORS[cat]}20` }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                </div>
                <p className="text-xs text-[var(--color-muted)] mb-1">{CATEGORY_LABEL[cat] ?? cat}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: CATEGORY_COLORS[cat] }}>{formatAmount(val)}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{totalExpense > 0 ? Math.round((val / totalExpense) * 100) : 0}% of total expense</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BENCHMARKS ── */}
      {tab === "benchmarks" && (
        <div className="space-y-5">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Industry Benchmarks</p>
            <p className="text-xs text-[var(--color-muted)] mb-4">Compared to median for {firm.industry || "your industry"} businesses in India</p>
            <div className="space-y-4">
              {benchmarks.map(b => {
                const diff = b.yours - b.industry;
                const good = b.label.includes("Margin") ? diff > 0 : diff <= 0;
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{b.label}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[var(--color-muted)]">Industry: <strong className="text-[var(--color-text)]">{b.industry}{b.unit}</strong></span>
                        <span className={`font-bold ${good ? "text-green-400" : "text-red-400"}`}>You: {b.yours}{b.unit}</span>
                      </div>
                    </div>
                    <div className="relative h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="absolute h-full bg-[var(--color-border)] rounded-full" style={{ width: `${Math.min(100, b.industry)}%` }} />
                      <div className={`absolute h-full rounded-full transition-all ${good ? "bg-[var(--color-primary)]" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(b.yours))}%` }} />
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)] mt-1">
                      {diff === 0 ? "At par with industry" : good ? `${Math.abs(diff)}${b.unit} better than industry median` : `${Math.abs(diff)}${b.unit} above industry median — review needed`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-sm font-semibold mb-3">Efficiency Ratios</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Revenue / Employee",    value: "—", note: "Connect payroll to compute" },
                { label: "Gross Margin",          value: totalRevenue > 0 ? `${Math.round(((totalRevenue - (categoryTotals.find(c=>c[0]==="expense")?.[1]??0)) / totalRevenue) * 100)}%` : "—", note: "Revenue minus operating costs" },
                { label: "Burn Multiple",         value: totalRevenue > 0 ? `${(totalExpense / Math.max(1, totalRevenue - totalExpense)).toFixed(1)}x` : "—", note: "< 1x is healthy" },
                { label: "Operating Leverage",    value: currMonth.revenue > prevMonth.revenue ? `${delta(currMonth.net, prevMonth.net) ?? 0}% net vs ${delta(currMonth.revenue, prevMonth.revenue) ?? 0}% rev` : "—", note: "Net growth vs revenue growth" },
              ].map(({ label, value, note }) => (
                <div key={label} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">{label}</p>
                  <p className="text-base font-bold text-[var(--color-primary)]">{value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
