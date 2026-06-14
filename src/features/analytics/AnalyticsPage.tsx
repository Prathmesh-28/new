import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Minus, Layers, Activity, FileDown, Sheet as SheetIcon } from "lucide-react";
import { toast } from "sonner";
import { exportExcel, exportPdf } from "@/lib/exporters";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { SegmentedToggle, SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";

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
  const [tab, setTab] = useState<"overview" | "revenue" | "expenses" | "benchmarks" | "pl" | "cashflow" | "concentration" | "targets">("overview");
  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const [chartType, setChartType] = useState<"bar" | "area">("bar");
  const { hidden, toggle } = useSeriesToggle();

  const now = new Date();
  const rangeN = Number(range);

  const months = useMemo(() => Array.from({ length: rangeN }, (_, i) => {
    const d = subMonths(now, rangeN - 1 - i);
    return {
      label:  format(d, "MMM"),
      full:   format(d, "MMM yyyy"),
      start:  startOfMonth(d).toISOString().split("T")[0],
      end:    endOfMonth(d).toISOString().split("T")[0],
    };
  }), [rangeN]);

  const monthlyData = useMemo(() => months.map(m => {
    const mTxns   = transactions.filter(t => t.date >= m.start && t.date <= m.end);
    const revenue = mTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(mTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const net     = revenue - expense;
    const margin  = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
    return { month: m.label, revenue, expense, net, margin };
  }), [transactions, months]);

  const currMonth = monthlyData[monthlyData.length - 1] ?? { month: "", revenue: 0, expense: 0, net: 0, margin: 0 };
  const prevMonth = monthlyData[monthlyData.length - 2] ?? { month: "", revenue: 0, expense: 0, net: 0, margin: 0 };

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

  // ── P&L Deep Dive computed vars ───────────────────────────────────────────────
  const opex        = categoryTotals.find(c => c[0] === "expense")?.[1] ?? 0;
  const payrollAmt  = categoryTotals.find(c => c[0] === "payroll")?.[1] ?? 0;
  const taxesAmt    = categoryTotals.find(c => c[0] === "tax")?.[1] ?? 0;
  const loanPmtAmt  = categoryTotals.find(c => c[0] === "loan")?.[1] ?? 0;
  const grossProfit = totalRevenue - opex;
  const ebit        = grossProfit - payrollAmt - taxesAmt;
  const interestEst = loanPmtAmt * 0.35;
  const deprecEst   = totalRevenue * 0.015;
  const ebitda      = ebit + deprecEst;
  const netPlIncome = ebit - interestEst;
  const revTxnCount = transactions.filter(t => t.amount > 0 && t.category !== "transfer").length;
  const avgTicket   = revTxnCount > 0 ? totalRevenue / revTxnCount : 0;
  const annualRunRate = (totalRevenue / rangeN) * 12;
  const ebitdaMgnPct  = totalRevenue > 0 ? Math.round((ebitda / totalRevenue) * 100) : 0;
  const grossMgnPct   = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
  const recRevenue    = transactions.filter(t => t.amount > 0 && t.isRecurring).reduce((s, t) => s + t.amount, 0);
  const recPct        = totalRevenue > 0 ? Math.round((recRevenue / totalRevenue) * 100) : 0;
  const uniqueCustCount = new Set(transactions.filter(t => t.amount > 0 && t.counterparty).map(t => t.counterparty)).size;

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
    { id: "overview",       label: "Overview" },
    { id: "revenue",        label: "Revenue" },
    { id: "expenses",       label: "Expenses" },
    { id: "benchmarks",     label: "Benchmarks" },
    { id: "pl",             label: "P&L Deep Dive" },
    { id: "cashflow",       label: "Cash Flow" },
    { id: "concentration",  label: "Concentration" },
    { id: "targets",        label: "Sales vs Target" },
  ] as const;

  const benchmarks = [
    { label: "Payroll / Revenue",   yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="payroll")?.[1]??0) / totalRevenue * 100) : 0, industry: 35, unit: "%" },
    { label: "OpEx / Revenue",      yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="expense")?.[1]??0) / totalRevenue * 100) : 0, industry: 40, unit: "%" },
    { label: "Net Profit Margin",   yours: Math.round(avgMargin), industry: 15, unit: "%" },
    { label: "Tax / Revenue",       yours: totalRevenue > 0 ? Math.round((categoryTotals.find(c=>c[0]==="tax")?.[1]??0) / totalRevenue * 100) : 0, industry: 8, unit: "%" },
  ];

  const exportAnalytics = (fmt: "excel" | "pdf") => {
    const plHead = ["Month", "Revenue", "Expenses", "Net P&L", "Margin %"];
    const plBody = monthlyData.map(m => [m.month, m.revenue, m.expense, m.net, `${m.margin}%`]) as (string | number)[][];
    const custBody = topCustomers.map(c => [c.name, c.amount, `${c.pct}%`]) as (string | number)[][];
    const vendBody = topVendors.map(v => [v.name, v.amount, `${v.pct}%`]) as (string | number)[][];
    if (fmt === "excel") {
      exportExcel(`analytics-${firm.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`, [
        { name: "Monthly P&L", rows: [plHead, ...plBody] },
        { name: "Top customers", rows: [["Customer", "Revenue", "Share"], ...custBody] },
        { name: "Top vendors", rows: [["Vendor", "Spend", "Share"], ...vendBody] },
      ]);
    } else {
      exportPdf(`analytics-${firm.name.replace(/\s+/g, "-").toLowerCase()}.pdf`, `${firm.name} — Analytics`, `Last ${rangeN} months · generated by Headroom`, [
        { title: "Monthly P&L", head: plHead, body: plBody },
        { title: "Top revenue sources", head: ["Customer", "Revenue", "Share"], body: custBody },
        { title: "Top expense vendors", head: ["Vendor", "Spend", "Share"], body: vendBody },
      ]);
    }
    toast.success(`${fmt === "excel" ? "Excel" : "PDF"} downloaded`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{firm.name} · Last {rangeN} months · {transactions.length} transactions analysed</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportAnalytics("pdf")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
            <FileDown size={13} /> PDF
          </button>
          <button onClick={() => exportAnalytics("excel")}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
            <SheetIcon size={13} /> Excel
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `${rangeN}-Month Revenue`,  value: totalRevenue,  color: "text-green-400",                delta: delta(currMonth.revenue, prevMonth.revenue) },
          { label: `${rangeN}-Month Expenses`, value: totalExpense,  color: "text-red-400",                  delta: delta(currMonth.expense, prevMonth.expense), inverse: true },
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
          {/* Revenue vs Expense — interactive */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-sm font-semibold">Revenue vs Expenses · Monthly</p>
              <div className="flex items-center gap-2">
                <SegmentedToggle
                  ariaLabel="Time range"
                  value={range}
                  onChange={setRange}
                  options={[{ value: "3", label: "3M" }, { value: "6", label: "6M" }, { value: "12", label: "12M" }]}
                />
                <SegmentedToggle
                  ariaLabel="Chart type"
                  value={chartType}
                  onChange={setChartType}
                  options={[{ value: "bar", label: "Bars" }, { value: "area", label: "Trend" }]}
                />
              </div>
            </div>
            <div className="mb-3">
              <SeriesLegend
                series={[
                  { key: "revenue", label: "Revenue",  color: "var(--color-primary)" },
                  { key: "expense", label: "Expenses", color: "#ef4444" },
                  { key: "net",     label: "Net P&L",  color: "#3b82f6" },
                ]}
                hidden={hidden}
                onToggle={toggle}
              />
            </div>
            <ResponsiveContainer width="100%" height={250}>
              {chartType === "bar" ? (
                <BarChart data={monthlyData} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                  {!hidden.has("revenue") && <Bar dataKey="revenue" name="Revenue"  fill="var(--color-primary)" radius={[3,3,0,0]} animationDuration={400} />}
                  {!hidden.has("expense") && <Bar dataKey="expense" name="Expenses" fill="#ef4444"             radius={[3,3,0,0]} animationDuration={400} />}
                  {!hidden.has("net")     && <Bar dataKey="net"     name="Net P&L"  fill="#3b82f6"             radius={[3,3,0,0]} animationDuration={400} />}
                </BarChart>
              ) : (
                <AreaChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="aRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="aExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="aNet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <Tooltip content={<CustomTooltip />} />
                  {!hidden.has("revenue") && <Area type="monotone" dataKey="revenue" name="Revenue"  stroke="var(--color-primary)" strokeWidth={2} fill="url(#aRev)" animationDuration={400} />}
                  {!hidden.has("expense") && <Area type="monotone" dataKey="expense" name="Expenses" stroke="#ef4444"             strokeWidth={2} fill="url(#aExp)" animationDuration={400} />}
                  {!hidden.has("net")     && <Area type="monotone" dataKey="net"     name="Net P&L"  stroke="#3b82f6"             strokeWidth={2} fill="url(#aNet)" animationDuration={400} />}
                </AreaChart>
              )}
            </ResponsiveContainer>
            <p className="text-[10px] text-[var(--color-muted)] mt-2">Tap a series in the legend to show or hide it · switch range and chart type above.</p>
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

      {/* ── P&L DEEP DIVE ── */}
      {tab === "pl" && (
        <div className="space-y-5">
          {/* Income Statement Bridge */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-1">
              <Layers size={15} className="text-[var(--color-primary)]" />
              <p className="text-sm font-semibold">Income Statement Bridge · 6-Month Cumulative</p>
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-5">How ₹1 of revenue flows down to net income. Bar width = % of total revenue.</p>
            {totalRevenue === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No revenue data — connect a bank account or add transactions.</p>
            ) : (
              <div className="space-y-2">
                {([
                  { label: "Revenue",                   value: totalRevenue,   pct: 100,                                                       sign: "",  bold: true,  barCls: "bg-green-500"              },
                  { label: "Direct Operating Expenses", value: opex,           pct: totalRevenue > 0 ? opex / totalRevenue * 100 : 0,          sign: "−", bold: false, barCls: "bg-red-400"                },
                  { label: "Gross Profit",              value: grossProfit,    pct: totalRevenue > 0 ? grossProfit / totalRevenue * 100 : 0,   sign: "=", bold: true,  barCls: "bg-emerald-500"            },
                  { label: "Payroll & Benefits",        value: payrollAmt,     pct: totalRevenue > 0 ? payrollAmt / totalRevenue * 100 : 0,    sign: "−", bold: false, barCls: "bg-blue-400"               },
                  { label: "Taxes & Levies",            value: taxesAmt,       pct: totalRevenue > 0 ? taxesAmt / totalRevenue * 100 : 0,      sign: "−", bold: false, barCls: "bg-orange-400"             },
                  { label: "EBIT",                      value: ebit,           pct: totalRevenue > 0 ? ebit / totalRevenue * 100 : 0,          sign: "=", bold: true,  barCls: "bg-[var(--color-primary)]" },
                  { label: "Add: Depreciation (est.)",  value: deprecEst,      pct: totalRevenue > 0 ? deprecEst / totalRevenue * 100 : 0,     sign: "+", bold: false, barCls: "bg-sky-400"                },
                  { label: "EBITDA",                    value: ebitda,         pct: totalRevenue > 0 ? ebitda / totalRevenue * 100 : 0,        sign: "=", bold: true,  barCls: "bg-[var(--color-primary)]" },
                  { label: "Less: Interest (est.)",     value: interestEst,    pct: totalRevenue > 0 ? interestEst / totalRevenue * 100 : 0,   sign: "−", bold: false, barCls: "bg-purple-400"             },
                  { label: "Net Income",                value: netPlIncome,    pct: totalRevenue > 0 ? netPlIncome / totalRevenue * 100 : 0,   sign: "=", bold: true,  barCls: netPlIncome >= 0 ? "bg-green-500" : "bg-red-500" },
                ] as { label: string; value: number; pct: number; sign: string; bold: boolean; barCls: string }[]).map(row => {
                  const isDeduct = row.sign === "−";
                  const isAdd    = row.sign === "+";
                  const isEq     = row.sign === "=";
                  const valColor = isDeduct ? "text-red-400" : isAdd ? "text-sky-400"
                    : isEq ? (row.value >= 0 ? "text-[var(--color-primary)]" : "text-red-400")
                    : (row.value >= 0 ? "text-green-400" : "text-red-400");
                  const pctAbs = Math.min(100, Math.abs(row.pct));
                  return (
                    <div key={row.label} className={isEq ? "border-t border-[var(--color-border)] pt-2 mt-1" : ""} style={{ paddingLeft: !row.bold ? 16 : 0 }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${row.bold ? "font-semibold" : "text-[var(--color-muted)]"}`}>
                          <span className="text-[var(--color-muted)] font-normal mr-2 w-3 inline-block">{row.sign}</span>{row.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs tabular-nums font-semibold ${valColor}`}>
                            {isDeduct ? `(${formatAmount(Math.abs(row.value))})` : formatAmount(row.value)}
                          </span>
                          <span className="text-[10px] text-[var(--color-muted)] w-10 text-right">{Math.round(pctAbs)}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        <div className={`h-full ${row.barCls} rounded-full`} style={{ width: `${pctAbs}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unit Economics */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={15} className="text-[var(--color-primary)]" />
              <p className="text-sm font-semibold">Unit Economics · Derived Metrics</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: "Annual Run Rate",           value: formatAmount(annualRunRate),                                                                                                    note: "Extrapolated from 6 months",           color: "text-[var(--color-primary)]"                            },
                { label: "Avg Revenue / Transaction", value: avgTicket > 0 ? formatAmount(avgTicket) : "—",                                                                                 note: `${revTxnCount} revenue transactions`,  color: "text-green-400"                                         },
                { label: "EBITDA Margin",             value: totalRevenue > 0 ? `${ebitdaMgnPct}%` : "—",                                                                                   note: "Target ≥ 15% for healthy SMBs",        color: ebitdaMgnPct >= 15 ? "text-green-400" : "text-yellow-400" },
                { label: "Gross Margin",              value: totalRevenue > 0 ? `${grossMgnPct}%` : "—",                                                                                    note: "Revenue minus direct opex",            color: grossMgnPct >= 40 ? "text-green-400" : "text-yellow-400" },
                { label: "Revenue / ₹ of Expense",   value: totalExpense > 0 ? `${(totalRevenue / totalExpense).toFixed(2)}x` : "—",                                                        note: "> 1x means cash-generative",           color: totalRevenue >= totalExpense ? "text-green-400" : "text-red-400" },
                { label: "Avg Net Margin",            value: `${Math.round(avgMargin)}%`,                                                                                                   note: "6-month average",                      color: avgMargin >= 10 ? "text-green-400" : avgMargin >= 0 ? "text-yellow-400" : "text-red-400" },
                { label: "Burn Multiple",             value: totalNet > 0 ? "Profitable ✓" : totalExpense > 0 ? `${(totalExpense / Math.max(1, Math.abs(totalNet))).toFixed(1)}x` : "—",    note: "< 2x for sustainable growth",          color: totalNet > 0 ? "text-green-400" : "text-yellow-400"     },
                { label: "Revenue Transactions",      value: revTxnCount.toString(),                                                                                                        note: "Last 6 months",                        color: "text-[var(--color-text)]"                               },
              ] as { label: string; value: string; note: string; color: string }[]).map(({ label, value, note, color }) => (
                <div key={label} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">{label}</p>
                  <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{note}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Income Statement Table */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Monthly Income Statement</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Last 6 months · Direct costs estimated at 50% of total expense</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <tr>
                    {(["Month", "Revenue", "Total Expenses", "Gross Profit", "Net Income", "Margin %", "MoM Δ"] as string[]).map(h => (
                      <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${h === "Month" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {monthlyData.map((m, i) => {
                    const grossP = m.revenue - m.expense * 0.5;
                    const mom = i > 0 ? delta(m.net, monthlyData[i - 1].net) : null;
                    const isCurrent = i === monthlyData.length - 1;
                    return (
                      <tr key={m.month} className={`hover:bg-white/2 text-xs ${isCurrent ? "bg-[var(--color-accent)]/30" : ""}`}>
                        <td className="px-4 py-2.5 font-medium">{m.month}{isCurrent ? " ·" : ""}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(m.revenue)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(m.expense)})</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(grossP)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(m.net)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${m.margin >= 10 ? "text-green-400" : m.margin >= 0 ? "text-yellow-400" : "text-red-400"}`}>{m.margin}%</td>
                        <td className="px-4 py-2.5 text-right">{mom !== null ? <DeltaBadge pct={mom} /> : <span className="text-[var(--color-muted)] text-xs">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                  <tr className="text-xs font-bold">
                    <td className="px-4 py-2.5 text-[var(--color-primary)]">6-Month Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(totalExpense)})</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatAmount(totalRevenue - totalExpense * 0.5)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${totalNet >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(totalNet)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${avgMargin >= 10 ? "text-green-400" : "text-yellow-400"}`}>{Math.round(avgMargin)}%</td>
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Revenue Quality */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-4">Revenue Quality Analysis</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[var(--color-bg)] rounded-lg p-4 border border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-muted)] mb-1.5">Recurring Revenue</p>
                <p className={`text-lg font-bold ${recPct >= 60 ? "text-green-400" : recPct >= 30 ? "text-yellow-400" : "text-red-400"}`}>{formatAmount(recRevenue)}</p>
                <div className="mt-2 mb-1 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${recPct >= 60 ? "bg-green-500" : recPct >= 30 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${recPct}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">{recPct}% of revenue · target ≥ 60% for predictability</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-lg p-4 border border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-muted)] mb-1.5">Customer Concentration</p>
                <p className={`text-lg font-bold ${(topCustomers[0]?.pct ?? 0) > 40 ? "text-red-400" : (topCustomers[0]?.pct ?? 0) > 20 ? "text-yellow-400" : "text-green-400"}`}>
                  {(topCustomers[0]?.pct ?? 0) > 40 ? "High Risk" : (topCustomers[0]?.pct ?? 0) > 20 ? "Moderate" : "Diversified"}
                </p>
                <div className="mt-2 mb-1 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${(topCustomers[0]?.pct ?? 0) > 40 ? "bg-red-500" : "bg-yellow-500"}`} style={{ width: `${Math.min(100, topCustomers[0]?.pct ?? 0)}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">Top: {topCustomers[0]?.name ?? "N/A"} at {topCustomers[0]?.pct ?? 0}% · target ≤ 30%</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-lg p-4 border border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-muted)] mb-1.5">Unique Revenue Sources</p>
                <p className={`text-lg font-bold ${uniqueCustCount >= 5 ? "text-green-400" : "text-yellow-400"}`}>{uniqueCustCount} customers</p>
                <div className="mt-2 mb-1 h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${Math.min(100, uniqueCustCount * 10)}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)]">HHI {Math.round(topCustomers.reduce((s, c) => s + c.pct * c.pct, 0))} · below 2500 is diversified</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BENCHMARKS ── */}
      {tab === "benchmarks" && (
        <div className="space-y-5">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-sm font-semibold mb-1">Reference Benchmarks</p>
            <p className="text-xs text-[var(--color-muted)] mb-4">Your ratios vs typical SMB reference figures. These are static reference points, <span className="text-[var(--color-text)]">not live peer data</span> for {firm.industry || "your sector"}.</p>
            <div className="space-y-4">
              {benchmarks.map(b => {
                const diff = b.yours - b.industry;
                const good = b.label.includes("Margin") ? diff > 0 : diff <= 0;
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium">{b.label}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[var(--color-muted)]">Reference: <strong className="text-[var(--color-text)]">{b.industry}{b.unit}</strong></span>
                        <span className={`font-bold ${good ? "text-green-400" : "text-red-400"}`}>You: {b.yours}{b.unit}</span>
                      </div>
                    </div>
                    <div className="relative h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="absolute h-full bg-[var(--color-border)] rounded-full" style={{ width: `${Math.min(100, b.industry)}%` }} />
                      <div className={`absolute h-full rounded-full transition-all ${good ? "bg-[var(--color-primary)]" : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.abs(b.yours))}%` }} />
                    </div>
                    <p className="text-[10px] text-[var(--color-muted)] mt-1">
                      {diff === 0 ? "At par with reference" : good ? `${Math.abs(diff)}${b.unit} better than reference` : `${Math.abs(diff)}${b.unit} above reference — review needed`}
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

      {/* ── CASH FLOW ── */}
      {tab === "cashflow" && (() => {
        // Build 12-month data from all transactions (independent of range selector)
        const cfMonths = Array.from({ length: 12 }, (_, i) => {
          const d = subMonths(now, 11 - i);
          return {
            month: format(d, "MMM yy"),
            start: startOfMonth(d),
            end:   endOfMonth(d),
            inflow:  0,
            outflow: 0,
            net:     0,
            cumulative: 0,
          };
        });
        transactions.forEach(tx => {
          const txDate = parseISO(tx.date);
          const idx = cfMonths.findIndex(m => txDate >= m.start && txDate <= m.end);
          if (idx === -1) return;
          const amt = Math.abs(tx.amount ?? 0);
          if ((tx.amount ?? 0) >= 0) {
            cfMonths[idx].inflow += amt;
          } else {
            cfMonths[idx].outflow += amt;
          }
        });
        let running = 0;
        cfMonths.forEach(m => {
          m.net = m.inflow - m.outflow;
          running += m.net;
          m.cumulative = running;
        });

        const exportCfCsv = () => {
          const header = "Month,Inflows,Outflows,Net Cash Flow,Cumulative Position\n";
          const rows = cfMonths.map(m =>
            `${m.month},${m.inflow.toFixed(2)},${(-m.outflow).toFixed(2)},${m.net.toFixed(2)},${m.cumulative.toFixed(2)}`
          ).join("\n");
          const blob = new Blob([header + rows], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "cash_flow_12m.csv";
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Cash flow CSV downloaded");
        };

        return (
          <div className="space-y-5">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Inflows (12M)",    value: cfMonths.reduce((s, m) => s + m.inflow,  0), color: "text-green-400" },
                { label: "Total Outflows (12M)",   value: cfMonths.reduce((s, m) => s + m.outflow, 0), color: "text-red-400"   },
                { label: "Net Cash Flow (12M)",    value: cfMonths.reduce((s, m) => s + m.net,     0), color: cfMonths.reduce((s, m) => s + m.net, 0) >= 0 ? "text-green-400" : "text-red-400" },
                { label: "Current Cash Position",  value: cfMonths[cfMonths.length - 1].cumulative, color: cfMonths[cfMonths.length - 1].cumulative >= 0 ? "text-green-400" : "text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] mb-2">{label}</p>
                  <p className={`text-xl font-bold tabular-nums ${color}`}>{formatAmount(Math.abs(value))}</p>
                </div>
              ))}
            </div>

            {/* Bar chart — net cash flow per month with color per sign + cumulative line */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Monthly Net Cash Flow · 12 Months</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">Green = net positive month · Red = net negative · Line = cumulative cash position</p>
                </div>
                <button
                  onClick={exportCfCsv}
                  className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors"
                >
                  <FileDown size={13} /> Export CSV
                </button>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cfMonths} barCategoryGap="28%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                  <Bar yAxisId="left" dataKey="net" name="Net Cash Flow" radius={[3,3,0,0]} animationDuration={400}>
                    {cfMonths.map((m, i) => (
                      <Cell key={i} fill={m.net >= 0 ? "#22c55e" : "#ef4444"} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} animationDuration={400} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-3 h-3 rounded-sm bg-green-500" /> Positive month</div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-3 h-3 rounded-sm bg-red-500" /> Negative month</div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5 bg-blue-500" /> Cumulative position</div>
              </div>
            </div>

            {/* Inflows vs Outflows stacked */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <p className="text-sm font-semibold mb-1">Inflows vs Outflows · Monthly</p>
              <p className="text-xs text-[var(--color-muted)] mb-4">Total cash received vs total cash paid each month over the last 12 months.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cfMonths} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                  <Bar dataKey="inflow"  name="Inflows"  fill="#22c55e" radius={[3,3,0,0]} animationDuration={400} />
                  <Bar dataKey="outflow" name="Outflows" fill="#ef4444" radius={[3,3,0,0]} animationDuration={400} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly table */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Monthly Cash Flow Table</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">Last 12 months · all amounts in ₹</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <tr>
                      {(["Month", "Inflows", "Outflows", "Net Cash Flow", "Cumulative Position"] as string[]).map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${h === "Month" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {cfMonths.map((m, i) => {
                      const isCurrent = i === cfMonths.length - 1;
                      return (
                        <tr key={m.month} className={`hover:bg-white/2 text-xs ${isCurrent ? "bg-[var(--color-accent)]/30" : ""}`}>
                          <td className="px-4 py-2.5 font-medium">{m.month}{isCurrent ? " · current" : ""}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(m.inflow)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(m.outflow)})</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(m.net)}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${m.cumulative >= 0 ? "text-[var(--color-primary)]" : "text-red-400"}`}>{formatAmount(m.cumulative)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                    <tr className="text-xs font-bold">
                      <td className="px-4 py-2.5 text-[var(--color-primary)]">12-Month Total</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(cfMonths.reduce((s, m) => s + m.inflow, 0))}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(cfMonths.reduce((s, m) => s + m.outflow, 0))})</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${cfMonths.reduce((s, m) => s + m.net, 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(cfMonths.reduce((s, m) => s + m.net, 0))}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${cfMonths[cfMonths.length - 1].cumulative >= 0 ? "text-[var(--color-primary)]" : "text-red-400"}`}>{formatAmount(cfMonths[cfMonths.length - 1].cumulative)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── CONCENTRATION ── */}
      {tab === "concentration" && (() => {
        const ALERT_PCT = 20; // single customer > 20% = concentration risk

        // Revenue by customer (counterparty on positive txns)
        const custRev: Record<string, number> = {};
        transactions.filter(t => t.amount > 0 && t.counterparty).forEach(t => {
          custRev[t.counterparty] = (custRev[t.counterparty] ?? 0) + t.amount;
        });
        const custRows = Object.entries(custRev)
          .map(([name, rev]) => ({ name, rev, pct: totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0 }))
          .sort((a, b) => b.rev - a.rev);

        const top1Pct  = custRows[0]?.pct ?? 0;
        const top3Rev  = custRows.slice(0, 3).reduce((s, c) => s + c.rev, 0);
        const top3Pct  = totalRevenue > 0 ? (top3Rev / totalRevenue) * 100 : 0;
        const hhi      = custRows.reduce((s, c) => s + (c.pct / 100) ** 2, 0) * 10000; // Herfindahl-Hirschman Index

        // Expense by vendor
        const vendExp: Record<string, number> = {};
        transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
          vendExp[t.counterparty] = (vendExp[t.counterparty] ?? 0) + Math.abs(t.amount);
        });
        const totalExp = Object.values(vendExp).reduce((s, v) => s + v, 0);
        const vendRows = Object.entries(vendExp)
          .map(([name, exp]) => ({ name, exp, pct: totalExp > 0 ? (exp / totalExp) * 100 : 0 }))
          .sort((a, b) => b.exp - a.exp)
          .slice(0, 8);

        const riskLevel = top1Pct > 40 ? "high" : top1Pct > 20 ? "medium" : "low";
        const RISK_STYLE = { high: "border-red-700/40 bg-red-950/15 text-red-300", medium: "border-orange-700/40 bg-orange-950/15 text-orange-300", low: "border-green-700/40 bg-green-950/15 text-green-300" };

        return (
          <div className="space-y-5">
            {/* Risk banner */}
            <div className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${RISK_STYLE[riskLevel]}`}>
              <TrendingUp size={15} className="shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  Revenue concentration risk: <span className="uppercase">{riskLevel}</span>
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {top1Pct > 0
                    ? `Top customer = ${top1Pct.toFixed(1)}% of revenue${top1Pct > ALERT_PCT ? " — above 20% threshold, lender scrutiny likely" : ""}`
                    : "No counterparty data — tag transactions to unlock"}
                </p>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Unique customers",  value: custRows.length.toString(),          color: "text-[var(--color-text)]" },
                { label: "Top customer share",value: `${top1Pct.toFixed(1)}%`,            color: top1Pct > 40 ? "text-red-400" : top1Pct > 20 ? "text-orange-400" : "text-green-400" },
                { label: "Top 3 share",       value: `${top3Pct.toFixed(1)}%`,            color: top3Pct > 60 ? "text-red-400" : "text-[var(--color-text)]" },
                { label: "HHI Index",         value: hhi > 0 ? Math.round(hhi).toString() : "—", color: hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-orange-400" : "text-green-400" },
              ].map(c => (
                <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Customer concentration */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <TrendingUp size={12} className="text-green-400" />
                  <span className="text-sm font-semibold">Revenue by Customer</span>
                </div>
                {custRows.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--color-muted)]">Tag counterparty on transactions to see concentration.</p>
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {custRows.slice(0, 8).map((c, i) => (
                      <div key={c.name} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-[10px] text-[var(--color-muted)] w-4">{i + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                        <div className="w-24 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(c.pct, 100)}%`, background: c.pct > 40 ? "#ef4444" : c.pct > 20 ? "#f97316" : "#22c55e" }} />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums w-10 text-right ${c.pct > 40 ? "text-red-400" : c.pct > 20 ? "text-orange-400" : "text-[var(--color-text)]"}`}>{c.pct.toFixed(1)}%</span>
                        <span className="text-xs text-[var(--color-muted)] tabular-nums w-20 text-right">{formatAmount(c.rev)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vendor concentration */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                  <TrendingDown size={12} className="text-red-400" />
                  <span className="text-sm font-semibold">Spend by Vendor</span>
                </div>
                {vendRows.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--color-muted)]">Tag counterparty on expense transactions to see vendor concentration.</p>
                ) : (
                  <div className="divide-y divide-[var(--color-border)]">
                    {vendRows.map((v, i) => (
                      <div key={v.name} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-[10px] text-[var(--color-muted)] w-4">{i + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate">{v.name}</span>
                        <div className="w-24 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.min(v.pct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-10 text-right text-red-400">{v.pct.toFixed(1)}%</span>
                        <span className="text-xs text-[var(--color-muted)] tabular-nums w-20 text-right">{formatAmount(v.exp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
              HHI &gt;2,500 = highly concentrated · &gt;1,500 = moderate · &lt;1,500 = healthy. Lenders typically flag single-customer concentration &gt;20% as underwriting risk.
            </div>
          </div>
        );
      })()}

      {tab === "targets" && <SalesVsTarget monthlyData={monthlyData} />}
    </div>
  );
}

function SalesVsTarget({ monthlyData }: { monthlyData: { month: string; revenue: number; expense: number; net: number; margin: number }[] }) {
  type TargetRow = { month: string; target: number };
  const [targets, setTargets] = useState<TargetRow[]>(() =>
    monthlyData.map(m => ({ month: m.month, target: 0 }))
  );
  const [globalTarget, setGlobalTarget] = useState("");

  const applyGlobal = () => {
    const t = parseFloat(globalTarget);
    if (!t) return;
    setTargets(prev => prev.map(r => ({ ...r, target: t })));
  };

  const setRowTarget = (month: string, val: string) =>
    setTargets(prev => prev.map(r => r.month === month ? { ...r, target: parseFloat(val) || 0 } : r));

  const rows = monthlyData.map(m => {
    const tgt = targets.find(t => t.month === m.month)?.target ?? 0;
    const gap = m.revenue - tgt;
    const pct = tgt > 0 ? Math.round((m.revenue / tgt) * 100) : null;
    return { ...m, target: tgt, gap, pct };
  });

  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTgt = rows.reduce((s, r) => s + r.target, 0);
  const totalGap = totalRev - totalTgt;
  const avgAch   = totalTgt > 0 ? Math.round((totalRev / totalTgt) * 100) : null;

  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1">Sales vs Target</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Set monthly revenue targets and track actuals. Revenue data is pulled from your tagged transactions.</p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Apply one target to all months (₹)</label>
            <input type="number" value={globalTarget} onChange={e => setGlobalTarget(e.target.value)} placeholder="e.g. 500000"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
          <button onClick={applyGlobal} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 whitespace-nowrap">
            Apply to all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue",   value: fc(totalRev), color: "text-green-400" },
          { label: "Total Target",    value: totalTgt > 0 ? fc(totalTgt) : "—", color: "text-[var(--color-muted)]" },
          { label: "Variance",        value: totalTgt > 0 ? `${totalGap >= 0 ? "+" : ""}${fc(totalGap)}` : "—", color: totalGap >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Avg Achievement", value: avgAch !== null ? `${avgAch}%` : "—", color: avgAch !== null && avgAch >= 100 ? "text-green-400" : avgAch !== null && avgAch >= 80 ? "text-yellow-400" : "text-red-400" },
        ].map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Monthly Breakdown</p>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)] text-center">No transaction data yet. Import or add transactions to see revenue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Month", "Target (₹)", "Actual Revenue", "Variance", "Achievement", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.month} className="hover:bg-white/2">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{r.month}</td>
                    <td className="px-4 py-3">
                      <input type="number" value={r.target || ""} onChange={e => setRowTarget(r.month, e.target.value)}
                        placeholder="Set target"
                        className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{fc(r.revenue)}</td>
                    <td className={`px-4 py-3 tabular-nums font-semibold ${r.target > 0 ? (r.gap >= 0 ? "text-green-400" : "text-red-400") : "text-[var(--color-muted)]"}`}>
                      {r.target > 0 ? `${r.gap >= 0 ? "+" : ""}${fc(r.gap)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.pct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: r.pct >= 100 ? "#22c55e" : r.pct >= 80 ? "#f97316" : "#ef4444" }} />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${r.pct >= 100 ? "text-green-400" : r.pct >= 80 ? "text-orange-400" : "text-red-400"}`}>{r.pct}%</span>
                        </div>
                      ) : <span className="text-xs text-[var(--color-muted)]">No target</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.pct !== null && r.pct >= 100 && <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">On track</span>}
                      {r.pct !== null && r.pct < 100 && r.pct >= 80 && <span className="text-[10px] bg-orange-900/30 text-orange-400 border border-orange-800/40 px-1.5 py-0.5 rounded-full">Near miss</span>}
                      {r.pct !== null && r.pct < 80 && <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full">Below target</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
