import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount } from "@/lib/utils";
import { TrendingUp, TrendingDown, BarChart3, ArrowUpRight, ArrowDownRight, Minus, Layers, Activity, FileDown, Sheet as SheetIcon, Scale, Percent, BookOpen, Users, Plus, Trash2, Package, MapPin, Filter, GitBranch, AlertTriangle, Target, Gauge, Wallet, CalendarDays, Receipt, Briefcase, Tag } from "lucide-react";
import { totalNetBookValue, totalGrossCost, totalAccumulatedDepreciation } from "@/lib/depreciation";
import { toast } from "sonner";
import { exportExcel, exportPdf } from "@/lib/exporters";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  AreaChart, Area, ComposedChart,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getDay, subYears } from "date-fns";
import { SegmentedToggle, SeriesLegend, useSeriesToggle } from "@/components/charts/ChartKit";
import AiInsight from "@/components/ai/AiInsight";
import { useT } from "@/i18n";
import DataFreshnessBadge from "@/components/DataFreshnessBadge";

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
  const tr = useT();
  const { store, canExport } = useApp();
  const { transactions, firm } = store;
  const [tab, setTab] = useState<"overview" | "revenue" | "expenses" | "benchmarks" | "pl" | "cashflow" | "concentration" | "targets" | "forecast" | "balancesheet" | "ratios" | "trialbalance" | "commission" | "sku-profit" | "customer-cohorts" | "branch-pl" | "unit-economics" | "sales-funnel" | "expense-variance" | "revenue-pareto" | "margin-bridge" | "churn-flags" | "margin-trends" | "expense-ratios" | "ar-ageing" | "break-even" | "working-capital" | "seasonality" | "refund-impact" | "per-employee" | "yoy-growth" | "new-vs-repeat" | "weekday-pattern" | "aov-trend" | "channel-split">("overview");
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
    const revenue = mTxns.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(mTxns.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
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
    transactions.filter(t => t.amount < 0 && t.category !== "transfer").forEach(t => {
      acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount);
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const categoryPieData = categoryTotals
    .filter(([cat]) => cat !== "transfer")
    .map(([cat, val], i) => ({ name: CATEGORY_LABEL[cat] ?? cat, value: val, color: PIE_PALETTE[i % PIE_PALETTE.length] }));

  const topCustomers = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.counterparty).forEach(t => {
      acc[t.counterparty] = (acc[t.counterparty] || 0) + t.amount;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount, pct: Math.round((amount / Math.max(1, totalRevenue)) * 100) }));
  }, [transactions, totalRevenue]);

  const topVendors = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.category !== "transfer" && t.counterparty).forEach(t => {
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
  const recRevenue    = transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.isRecurring).reduce((s, t) => s + t.amount, 0);
  const recPct        = totalRevenue > 0 ? Math.round((recRevenue / totalRevenue) * 100) : 0;
  const uniqueCustCount = new Set(transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.counterparty).map(t => t.counterparty)).size;

  const revenueByMonth = useMemo(() => months.map(m => {
    const mTxns = transactions.filter(t => t.date >= m.start && t.date <= m.end && t.amount > 0 && t.category !== "transfer");
    const rev   = mTxns.reduce((s, t) => s + t.amount, 0);
    return { month: m.label, revenue: rev };
  }), [transactions, months]);

  const expByCategory = useMemo(() => {
    const cutoff = subMonths(now, 1).toISOString().split("T")[0];
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount < 0 && t.category !== "transfer" && t.date >= cutoff).forEach(t => {
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
    { id: "forecast",       label: "Cash Forecast" },
    { id: "balancesheet",   label: "Balance Sheet" },
    { id: "ratios",         label: "Ratio Analysis" },
    { id: "trialbalance",   label: "Trial Balance" },
    { id: "commission",     label: "Sales Commission" },
    { id: "sku-profit",       label: "SKU Profitability" },
    { id: "customer-cohorts", label: "Customer Cohorts" },
    { id: "branch-pl",        label: "Region P&L" },
    { id: "unit-economics",   label: "Unit Economics" },
    { id: "sales-funnel",     label: "Sales Funnel" },
    { id: "expense-variance", label: "Expense Variance" },
    { id: "revenue-pareto",   label: "Pareto 80/20" },
    { id: "margin-bridge",    label: "Margin Bridge" },
    { id: "churn-flags",      label: "Churn Flags" },
    { id: "margin-trends",    label: "Margin Trends" },
    { id: "expense-ratios",   label: "Expense Ratios" },
    { id: "ar-ageing",        label: "AR Ageing" },
    { id: "break-even",       label: "Break-Even" },
    { id: "working-capital",  label: "Working Capital" },
    { id: "seasonality",      label: "Seasonality" },
    { id: "refund-impact",    label: "Refund Impact" },
    { id: "per-employee",     label: "Per-Employee" },
    { id: "yoy-growth",       label: "YoY Growth" },
    { id: "new-vs-repeat",    label: "New vs Repeat" },
    { id: "weekday-pattern",  label: "Weekday Pattern" },
    { id: "aov-trend",        label: "AOV Trend" },
    { id: "channel-split",    label: "Channel Split" },
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
      exportPdf(`analytics-${firm.name.replace(/\s+/g, "-").toLowerCase()}.pdf`, `${firm.name} - Analytics`, `Last ${rangeN} months · generated by Headroom`, [
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
          <h1 className="text-xl font-bold">{tr("anlt.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{firm.name} · Last {rangeN} months · {transactions.length} transactions analysed</p>
        </div>
        {canExport() && (
          <div className="flex items-center gap-2">
            <button onClick={() => exportAnalytics("pdf")}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <FileDown size={13} /> {tr("anlt.exportPdf")}
            </button>
            <button onClick={() => exportAnalytics("excel")}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <SheetIcon size={13} /> {tr("anlt.exportExcel")}
            </button>
          </div>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `${rangeN}-Month Revenue`,  value: totalRevenue,  color: "text-green-400",                delta: delta(currMonth.revenue, prevMonth.revenue) },
          { label: `${rangeN}-Month Expenses`, value: totalExpense,  color: "text-red-400",                  delta: delta(currMonth.expense, prevMonth.expense), inverse: true },
          { label: tr("anlt.netPl"),          value: totalNet,      color: totalNet >= 0 ? "text-green-400" : "text-red-400", delta: null },
          { label: tr("anlt.avgNetMargin"),   value: null,          color: avgMargin >= 10 ? "text-green-400" : avgMargin >= 0 ? "text-yellow-400" : "text-red-400", delta: null, pct: avgMargin },
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

      <AiInsight
        collapsed
        question="What do these revenue, expense and margin trends tell me, and where should I act?"
        context={{
          periodMonths: rangeN,
          totalRevenue,
          totalExpense,
          netPnL: totalNet,
          avgNetMarginPct: Math.round(avgMargin),
          currentMonth: { month: currMonth.month, revenue: currMonth.revenue, expense: currMonth.expense, net: currMonth.net, margin: currMonth.margin },
          previousMonth: { month: prevMonth.month, revenue: prevMonth.revenue, expense: prevMonth.expense, net: prevMonth.net, margin: prevMonth.margin },
          monthlyTrend: monthlyData,
          topCustomers,
          topVendors,
        }}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
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
          {/* Revenue vs Expense - interactive */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-sm font-semibold">{tr("anlt.revVsExp")}</p>
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
              <p className="text-sm font-semibold mb-4">{tr("anlt.netProfitMargin")}</p>
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
              <p className="text-sm font-semibold mb-4">{tr("anlt.expenseBreakdown")}</p>
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
              <p className="text-sm font-semibold mb-3">{tr("anlt.top5Revenue")}</p>
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
              <p className="text-sm font-semibold mb-3">{tr("anlt.top5Vendors")}</p>
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
            <table className="w-full text-sm rcard">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Customer", "Total Revenue", "Share", "Trend"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {topCustomers.map((c, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td data-label="Customer" className="px-5 py-3 font-medium">{c.name}</td>
                    <td data-label="Total Revenue" className="px-5 py-3 tabular-nums text-green-400 font-semibold">{formatAmount(c.amount)}</td>
                    <td data-label="Share" className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden max-w-[80px]">
                          <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${c.pct}%` }} />
                        </div>
                        <span className="text-xs text-[var(--color-muted)]">{c.pct}%</span>
                      </div>
                    </td>
                    <td data-label="Trend" className="px-5 py-3"><TrendingUp size={13} className="text-green-400" /></td>
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
            <table className="w-full text-sm rcard">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Vendor", "Total Spent", "% of Expenses", "Category"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {topVendors.map((v, i) => {
                  const cat = transactions.find(t => t.counterparty === v.name && t.amount < 0)?.category ?? "expense";
                  return (
                    <tr key={i} className="hover:bg-white/2">
                      <td data-label="Vendor" className="px-5 py-3 font-medium">{v.name}</td>
                      <td data-label="Total Spent" className="px-5 py-3 tabular-nums text-red-400 font-semibold">{formatAmount(v.amount)}</td>
                      <td data-label="% of Expenses" className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${v.pct}%` }} />
                          </div>
                          <span className="text-xs text-[var(--color-muted)]">{v.pct}%</span>
                        </div>
                      </td>
                      <td data-label="Category" className="px-5 py-3">
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
              <p className="text-sm text-[var(--color-muted)]">No revenue data - connect a bank account or add transactions.</p>
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
                { label: "Avg Revenue / Transaction", value: avgTicket > 0 ? formatAmount(avgTicket) : "-",                                                                                 note: `${revTxnCount} revenue transactions`,  color: "text-green-400"                                         },
                { label: "EBITDA Margin",             value: totalRevenue > 0 ? `${ebitdaMgnPct}%` : "-",                                                                                   note: "Target ≥ 15% for healthy SMBs",        color: ebitdaMgnPct >= 15 ? "text-green-400" : "text-yellow-400" },
                { label: "Gross Margin",              value: totalRevenue > 0 ? `${grossMgnPct}%` : "-",                                                                                    note: "Revenue minus direct opex",            color: grossMgnPct >= 40 ? "text-green-400" : "text-yellow-400" },
                { label: "Revenue / ₹ of Expense",   value: totalExpense > 0 ? `${(totalRevenue / totalExpense).toFixed(2)}x` : "-",                                                        note: "> 1x means cash-generative",           color: totalRevenue >= totalExpense ? "text-green-400" : "text-red-400" },
                { label: "Avg Net Margin",            value: `${Math.round(avgMargin)}%`,                                                                                                   note: "6-month average",                      color: avgMargin >= 10 ? "text-green-400" : avgMargin >= 0 ? "text-yellow-400" : "text-red-400" },
                { label: "Burn Multiple",             value: totalNet > 0 ? "Profitable ✓" : totalExpense > 0 ? `${(totalExpense / Math.max(1, Math.abs(totalNet))).toFixed(1)}x` : "-",    note: "< 2x for sustainable growth",          color: totalNet > 0 ? "text-green-400" : "text-yellow-400"     },
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
              <table className="w-full rcard">
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
                        <td data-label="Month" className="px-4 py-2.5 font-medium">{m.month}{isCurrent ? " ·" : ""}</td>
                        <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(m.revenue)}</td>
                        <td data-label="Total Expenses" className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(m.expense)})</td>
                        <td data-label="Gross Profit" className="px-4 py-2.5 text-right tabular-nums">{formatAmount(grossP)}</td>
                        <td data-label="Net Income" className={`px-4 py-2.5 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(m.net)}</td>
                        <td data-label="Margin %" className={`px-4 py-2.5 text-right tabular-nums ${m.margin >= 10 ? "text-green-400" : m.margin >= 0 ? "text-yellow-400" : "text-red-400"}`}>{m.margin}%</td>
                        <td data-label="MoM Δ" className="px-4 py-2.5 text-right">{mom !== null ? <DeltaBadge pct={mom} /> : <span className="text-[var(--color-muted)] text-xs">-</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                  <tr className="text-xs font-bold">
                    <td data-label="" className="px-4 py-2.5 text-[var(--color-primary)]">6-Month Total</td>
                    <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(totalRevenue)}</td>
                    <td data-label="Total Expenses" className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(totalExpense)})</td>
                    <td data-label="Gross Profit" className="px-4 py-2.5 text-right tabular-nums">{formatAmount(totalRevenue - totalExpense * 0.5)}</td>
                    <td data-label="Net Income" className={`px-4 py-2.5 text-right tabular-nums ${totalNet >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(totalNet)}</td>
                    <td data-label="Margin %" className={`px-4 py-2.5 text-right tabular-nums ${avgMargin >= 10 ? "text-green-400" : "text-yellow-400"}`}>{Math.round(avgMargin)}%</td>
                    <td data-label="" className="px-4 py-2.5" />
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
                      {diff === 0 ? "At par with reference" : good ? `${Math.abs(diff)}${b.unit} better than reference` : `${Math.abs(diff)}${b.unit} above reference - review needed`}
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
                { label: "Revenue / Employee",    value: "-", note: "Connect payroll to compute" },
                { label: "Gross Margin",          value: totalRevenue > 0 ? `${Math.round(((totalRevenue - (categoryTotals.find(c=>c[0]==="expense")?.[1]??0)) / totalRevenue) * 100)}%` : "-", note: "Revenue minus operating costs" },
                { label: "Burn Multiple",         value: totalRevenue > 0 ? `${(totalExpense / Math.max(1, totalRevenue - totalExpense)).toFixed(1)}x` : "-", note: "< 1x is healthy" },
                { label: "Operating Leverage",    value: currMonth.revenue > prevMonth.revenue ? `${delta(currMonth.net, prevMonth.net) ?? 0}% net vs ${delta(currMonth.revenue, prevMonth.revenue) ?? 0}% rev` : "-", note: "Net growth vs revenue growth" },
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

            {/* Bar chart - net cash flow per month with color per sign + cumulative line */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Monthly Net Cash Flow · 12 Months</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">Green = net positive month · Red = net negative · Line = cumulative cash position</p>
                </div>
                {canExport() && (
                  <button
                    onClick={exportCfCsv}
                    className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors"
                  >
                    <FileDown size={13} /> Export CSV
                  </button>
                )}
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
                <table className="w-full rcard">
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
                          <td data-label="Month" className="px-4 py-2.5 font-medium">{m.month}{isCurrent ? " · current" : ""}</td>
                          <td data-label="Inflows" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(m.inflow)}</td>
                          <td data-label="Outflows" className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(m.outflow)})</td>
                          <td data-label="Net Cash Flow" className={`px-4 py-2.5 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(m.net)}</td>
                          <td data-label="Cumulative Position" className={`px-4 py-2.5 text-right tabular-nums ${m.cumulative >= 0 ? "text-[var(--color-primary)]" : "text-red-400"}`}>{formatAmount(m.cumulative)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                    <tr className="text-xs font-bold">
                      <td data-label="" className="px-4 py-2.5 text-[var(--color-primary)]">12-Month Total</td>
                      <td data-label="Inflows" className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(cfMonths.reduce((s, m) => s + m.inflow, 0))}</td>
                      <td data-label="Outflows" className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(cfMonths.reduce((s, m) => s + m.outflow, 0))})</td>
                      <td data-label="Net Cash Flow" className={`px-4 py-2.5 text-right tabular-nums ${cfMonths.reduce((s, m) => s + m.net, 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(cfMonths.reduce((s, m) => s + m.net, 0))}</td>
                      <td data-label="Cumulative Position" className={`px-4 py-2.5 text-right tabular-nums ${cfMonths[cfMonths.length - 1].cumulative >= 0 ? "text-[var(--color-primary)]" : "text-red-400"}`}>{formatAmount(cfMonths[cfMonths.length - 1].cumulative)}</td>
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
        transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.counterparty).forEach(t => {
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
        transactions.filter(t => t.amount < 0 && t.category !== "transfer" && t.counterparty).forEach(t => {
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
                    ? `Top customer = ${top1Pct.toFixed(1)}% of revenue${top1Pct > ALERT_PCT ? " - above 20% threshold, lender scrutiny likely" : ""}`
                    : "No counterparty data - tag transactions to unlock"}
                </p>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Unique customers",  value: custRows.length.toString(),          color: "text-[var(--color-text)]" },
                { label: "Top customer share",value: `${top1Pct.toFixed(1)}%`,            color: top1Pct > 40 ? "text-red-400" : top1Pct > 20 ? "text-orange-400" : "text-green-400" },
                { label: "Top 3 share",       value: `${top3Pct.toFixed(1)}%`,            color: top3Pct > 60 ? "text-red-400" : "text-[var(--color-text)]" },
                { label: "HHI Index",         value: hhi > 0 ? Math.round(hhi).toString() : "-", color: hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-orange-400" : "text-green-400" },
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
      {tab === "forecast" && <CashFlowForecast monthlyData={monthlyData} />}
      {tab === "balancesheet" && <BalanceSheetTab />}
      {tab === "ratios" && <RatiosTab />}
      {tab === "trialbalance" && <TrialBalanceTab />}
      {tab === "commission" && <CommissionTab />}
      {tab === "sku-profit" && <SkuProfitabilityTab />}
      {tab === "customer-cohorts" && <CustomerCohortsTab />}
      {tab === "branch-pl" && <BranchPLTab />}
      {tab === "unit-economics" && <UnitEconomicsTab />}
      {tab === "sales-funnel" && <SalesFunnelTab />}
      {tab === "expense-variance" && <ExpenseVarianceTab />}
      {tab === "revenue-pareto" && <RevenueParetoTab />}
      {tab === "margin-bridge" && <MarginBridgeTab />}
      {tab === "churn-flags" && <ChurnFlagsTab />}
      {tab === "margin-trends" && <MarginTrendsTab />}
      {tab === "expense-ratios" && <ExpenseRatiosTab />}
      {tab === "ar-ageing" && <ArAgeingTab />}
      {tab === "break-even" && <BreakEvenTab />}
      {tab === "working-capital" && <WorkingCapitalTab />}
      {tab === "seasonality" && <SeasonalityTab />}
      {tab === "refund-impact" && <RefundImpactTab />}
      {tab === "per-employee" && <PerEmployeeTab />}
      {tab === "yoy-growth" && <YoYGrowthTab />}
      {tab === "new-vs-repeat" && <NewVsRepeatTab />}
      {tab === "weekday-pattern" && <WeekdayPatternTab />}
      {tab === "aov-trend" && <AovTrendTab />}
      {tab === "channel-split" && <ChannelSplitTab />}
    </div>
  );
}

function SalesVsTarget({ monthlyData }: { monthlyData: { month: string; revenue: number; expense: number; net: number; margin: number }[] }) {
  type TargetRow = { month: string; target: number };
  const [targets, setTargets] = useFeatureState<TargetRow[]>(
    "sales-targets",
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
          { label: "Total Target",    value: totalTgt > 0 ? fc(totalTgt) : "-", color: "text-[var(--color-muted)]" },
          { label: "Variance",        value: totalTgt > 0 ? `${totalGap >= 0 ? "+" : ""}${fc(totalGap)}` : "-", color: totalGap >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Avg Achievement", value: avgAch !== null ? `${avgAch}%` : "-", color: avgAch !== null && avgAch >= 100 ? "text-green-400" : avgAch !== null && avgAch >= 80 ? "text-yellow-400" : "text-red-400" },
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
            <table className="w-full text-sm rcard">
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
                    <td data-label="Month" className="px-4 py-3 font-medium whitespace-nowrap">{r.month}</td>
                    <td data-label="Target (₹)" className="px-4 py-3">
                      <input type="number" value={r.target || ""} onChange={e => setRowTarget(r.month, e.target.value)}
                        placeholder="Set target"
                        className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
                    </td>
                    <td data-label="Actual Revenue" className="px-4 py-3 tabular-nums text-green-400 font-semibold">{fc(r.revenue)}</td>
                    <td data-label="Variance" className={`px-4 py-3 tabular-nums font-semibold ${r.target > 0 ? (r.gap >= 0 ? "text-green-400" : "text-red-400") : "text-[var(--color-muted)]"}`}>
                      {r.target > 0 ? `${r.gap >= 0 ? "+" : ""}${fc(r.gap)}` : "-"}
                    </td>
                    <td data-label="Achievement" className="px-4 py-3">
                      {r.pct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(r.pct, 100)}%`, background: r.pct >= 100 ? "#22c55e" : r.pct >= 80 ? "#f97316" : "#ef4444" }} />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${r.pct >= 100 ? "text-green-400" : r.pct >= 80 ? "text-orange-400" : "text-red-400"}`}>{r.pct}%</span>
                        </div>
                      ) : <span className="text-xs text-[var(--color-muted)]">No target</span>}
                    </td>
                    <td data-label="" className="px-4 py-3">
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

function CashFlowForecast({ monthlyData }: { monthlyData: { month: string; revenue: number; expense: number; net: number; margin: number }[] }) {
  const [forecastMonths, setForecastMonths] = useState(3);
  const [growthRate, setGrowthRate]         = useState(5);   // % monthly revenue growth
  const [costRate, setCostRate]             = useState(0);   // % monthly cost change
  const [openingCash, setOpeningCash]       = useState("");

  const history = monthlyData.slice(-6);
  const avgRevenue = history.length > 0 ? history.reduce((s, m) => s + m.revenue, 0) / history.length : 0;
  const avgExpense = history.length > 0 ? history.reduce((s, m) => s + m.expense, 0) / history.length : 0;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();

  const forecast = Array.from({ length: forecastMonths }, (_, i) => {
    const monthIdx = (now.getMonth() + 1 + i) % 12;
    const label = `${MONTHS[monthIdx]} ${now.getMonth() + 1 + i >= 12 ? now.getFullYear() + 1 : now.getFullYear()}`;
    const rev  = avgRevenue  * Math.pow(1 + growthRate / 100, i + 1);
    const exp  = avgExpense  * Math.pow(1 + costRate  / 100, i + 1);
    const net  = rev - exp;
    return { label, rev, exp, net };
  });

  const opening = parseFloat(openingCash) || 0;
  let running = opening;
  const withCumulative = forecast.map(f => { running += f.net; return { ...f, cumulative: running }; });

  const fc = formatCurrency;
  const minNet = Math.min(...forecast.map(f => f.net), 0);
  const maxNet = Math.max(...forecast.map(f => Math.abs(f.net)), 1);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Cash Flow Forecast Settings</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Forecast Months</label>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={12} value={forecastMonths} onChange={e => setForecastMonths(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-4">{forecastMonths}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly Revenue Growth %</label>
            <div className="flex items-center gap-2">
              <input type="range" min={-20} max={30} value={growthRate} onChange={e => setGrowthRate(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className={`text-sm font-bold w-8 ${growthRate < 0 ? "text-red-400" : "text-green-400"}`}>{growthRate}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly Cost Change %</label>
            <div className="flex items-center gap-2">
              <input type="range" min={-10} max={20} value={costRate} onChange={e => setCostRate(Number(e.target.value))} className="flex-1 accent-[var(--color-primary)]" />
              <span className={`text-sm font-bold w-8 ${costRate > 5 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{costRate}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Opening Cash Balance (₹)</label>
            <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)] mt-2">Based on last {history.length} months avg - Revenue: {fc(avgRevenue)}/mo · Expenses: {fc(avgExpense)}/mo</p>
      </div>

      {history.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Activity size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No transaction history found. Add transactions to generate a cash flow forecast.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Forecast Period",      value: `${forecastMonths} months`,             color: "text-[var(--color-primary)]" },
              { label: "Total Projected Net",  value: fc(forecast.reduce((s,f)=>s+f.net,0)), color: forecast.reduce((s,f)=>s+f.net,0)>=0?"text-green-400":"text-red-400" },
              { label: "Ending Cash Balance",  value: fc(withCumulative[withCumulative.length-1]?.cumulative??opening), color: (withCumulative[withCumulative.length-1]?.cumulative??opening)>=0?"text-green-400":"text-red-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-sm font-semibold">Monthly Forecast</span>
            </div>
            <table className="w-full text-sm min-w-[560px] rcard">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Month","Projected Revenue","Projected Expenses","Net Cash Flow","Cumulative Cash"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {withCumulative.map(f => (
                  <tr key={f.label} className={`border-b border-[var(--color-border)] last:border-0 ${f.net < 0 ? "bg-red-950/10" : "hover:bg-[var(--color-accent)]"}`}>
                    <td data-label="Month" className="px-4 py-3 font-semibold">{f.label}</td>
                    <td data-label="Projected Revenue" className="px-4 py-3 tabular-nums text-green-400">{fc(f.rev)}</td>
                    <td data-label="Projected Expenses" className="px-4 py-3 tabular-nums text-orange-400">{fc(f.exp)}</td>
                    <td data-label="Net Cash Flow" className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${f.net >= 0 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, (Math.abs(f.net) / maxNet) * 100)}%` }} />
                        </div>
                        <span className={`tabular-nums text-xs font-semibold ${f.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(f.net)}</span>
                      </div>
                    </td>
                    <td data-label="Cumulative Cash" className={`px-4 py-3 tabular-nums font-bold ${f.cumulative >= 0 ? "text-green-400" : "text-red-400"}`}>{fc(f.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {minNet < 0 && (
            <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-4 py-3 text-xs text-red-400">
              ⚠ Cash shortfall projected in {forecast.filter(f=>f.net<0).length} month(s). Consider negotiating longer payment terms, accelerating collections, or drawing on working capital credit.
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Forecast uses trailing 6-month average as baseline. Adjust growth and cost sliders for scenario planning. This is a projection, not a guarantee - review weekly against actuals.</p>
    </div>
  );
}

// ── BALANCE SHEET ──────────────────────────────────────────────────────────────
function BalanceSheetTab() {
  const { store } = useApp();
  const asOf = new Date().toISOString().split("T")[0];

  // Auto-derived figures from the store (all guarded).
  const cashBank = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
  const receivables = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const inventoryVal = (store.inventory ?? []).reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0);
  const grossBlock = totalGrossCost(store.fixedAssets ?? [], asOf);
  const accumDep = totalAccumulatedDepreciation(store.fixedAssets ?? [], asOf);
  const fixedNetAuto = totalNetBookValue(store.fixedAssets ?? [], asOf);
  const loanOutstanding = (store.activeLoans ?? []).reduce((s, l) => s + (l.outstanding || 0), 0);

  // Manual / override inputs (sensible defaults of 0).
  const [otherCurrent, setOtherCurrent]   = useState(0);
  const [fixedOverride, setFixedOverride] = useState(0); // extra fixed assets not in register
  const [accountsPayable, setAccountsPayable] = useState(0);
  const [shortBorrow, setShortBorrow]     = useState(0);
  const [taxesPayable, setTaxesPayable]   = useState(0);
  const [otherLongTerm, setOtherLongTerm] = useState(0);
  const [shareCapital, setShareCapital]   = useState(0);

  const currentAssets = cashBank + receivables + inventoryVal + otherCurrent;
  const fixedAssetsNet = fixedNetAuto + fixedOverride;
  const totalAssets = currentAssets + fixedAssetsNet;

  const currentLiabilities = accountsPayable + shortBorrow + taxesPayable;
  const longTermLiabilities = loanOutstanding + otherLongTerm;
  const totalLiabilities = currentLiabilities + longTermLiabilities;

  // Retained earnings is the balancing figure.
  const retainedEarnings = totalAssets - totalLiabilities - shareCapital;
  const totalEquity = shareCapital + retainedEarnings;
  const netWorth = totalEquity;
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;

  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  // Plain render helpers (called inline - NOT nested components - so inputs keep focus across re-renders).
  const numInput = (value: number, onChange: (n: number) => void): ReactNode => (
    <input type="number" value={value || ""} onChange={e => onChange(parseFloat(e.target.value) || 0)}
      placeholder="0"
      className="w-32 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-right outline-none focus:border-[var(--color-primary)] tabular-nums" />
  );

  const row = (label: string, value: number, opts: { input?: ReactNode; bold?: boolean; indent?: boolean } = {}): ReactNode => (
    <div key={label} className={`flex items-center justify-between py-1.5 ${opts.bold ? "border-t border-[var(--color-border)] mt-1 pt-2 font-semibold" : ""}`} style={{ paddingLeft: opts.indent ? 16 : 0 }}>
      <span className={`text-xs ${opts.bold ? "" : "text-[var(--color-muted)]"}`}>{label}</span>
      {opts.input ?? <span className="text-xs tabular-nums font-semibold">{formatCurrency(value)}</span>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Balanced banner */}
      <div className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${balanced ? "border-green-700/40 bg-green-950/15 text-green-300" : "border-orange-700/40 bg-orange-950/15 text-orange-300"}`}>
        <Scale size={15} className="shrink-0" />
        <div>
          <p className="text-sm font-semibold">{balanced ? "Balanced ✓" : "Out of balance"}</p>
          <p className="text-xs opacity-80 mt-0.5">
            Total Assets {formatCurrency(totalAssets)} {balanced ? "=" : "≠"} Liabilities + Equity {formatCurrency(totalLiabilities + totalEquity)}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Assets",      value: formatCurrency(totalAssets),                          color: "text-[var(--color-primary)]" },
          { label: "Total Liabilities", value: formatCurrency(totalLiabilities),                     color: "text-red-400" },
          { label: "Net Worth (Equity)", value: formatCurrency(netWorth),                            color: netWorth >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Current Ratio",     value: currentRatio !== null ? `${currentRatio.toFixed(2)}x` : "-", color: currentRatio !== null && currentRatio >= 1.5 ? "text-green-400" : currentRatio !== null && currentRatio >= 1 ? "text-yellow-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ASSETS */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-1">Assets</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">As at {asOf}</p>

          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-2 mb-1">Current Assets</p>
          {row("Cash & Bank (from accounts)", cashBank, { indent: true })}
          {row("Accounts Receivable (unpaid invoices)", receivables, { indent: true })}
          {row("Inventory (qty × unit cost)", inventoryVal, { indent: true })}
          {row("Other Current Assets", otherCurrent, { indent: true, input: numInput(otherCurrent, setOtherCurrent) })}
          {row("Total Current Assets", currentAssets, { bold: true })}

          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-4 mb-1">Fixed Assets</p>
          {row("Gross Block (cost)", grossBlock, { indent: true })}
          {row("Less: Accumulated Depreciation", -accumDep, { indent: true })}
          {row("Net Block (from register)", fixedNetAuto, { indent: true })}
          {row("Manual Fixed Asset Override", fixedOverride, { indent: true, input: numInput(fixedOverride, setFixedOverride) })}
          {row("Total Fixed Assets (net)", fixedAssetsNet, { bold: true })}

          {row("TOTAL ASSETS", totalAssets, { bold: true })}
        </div>

        {/* LIABILITIES & EQUITY */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <p className="text-sm font-semibold mb-1">Liabilities & Equity</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">As at {asOf}</p>

          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-2 mb-1">Current Liabilities</p>
          {row("Accounts Payable", accountsPayable, { indent: true, input: numInput(accountsPayable, setAccountsPayable) })}
          {row("Short-term Borrowings", shortBorrow, { indent: true, input: numInput(shortBorrow, setShortBorrow) })}
          {row("Taxes Payable", taxesPayable, { indent: true, input: numInput(taxesPayable, setTaxesPayable) })}
          {row("Total Current Liabilities", currentLiabilities, { bold: true })}

          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-4 mb-1">Long-term Liabilities</p>
          {row("Loans Outstanding (active loans)", loanOutstanding, { indent: true })}
          {row("Other Long-term Liabilities", otherLongTerm, { indent: true, input: numInput(otherLongTerm, setOtherLongTerm) })}
          {row("Total Long-term Liabilities", longTermLiabilities, { bold: true })}

          {row("TOTAL LIABILITIES", totalLiabilities, { bold: true })}

          <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-4 mb-1">Equity</p>
          {row("Share Capital", shareCapital, { indent: true, input: numInput(shareCapital, setShareCapital) })}
          <div className="flex items-center justify-between py-1.5" style={{ paddingLeft: 16 }}>
            <span className="text-xs text-[var(--color-muted)]">Retained Earnings (balancing figure)</span>
            <span className={`text-xs tabular-nums font-semibold ${retainedEarnings >= 0 ? "text-[var(--color-text)]" : "text-red-400"}`}>{formatCurrency(retainedEarnings)}</span>
          </div>
          {row("Total Equity", totalEquity, { bold: true })}

          {row("TOTAL LIABILITIES + EQUITY", totalLiabilities + totalEquity, { bold: true })}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        <DataFreshnessBadge kind="indicative" className="mr-1.5" />Indicative balance sheet for management use. Fixed assets are net of Straight-Line / WDV depreciation per Schedule II of the Companies Act 2013; retained earnings is shown as the balancing figure. The statutory presentation format is prescribed by Schedule III of the Companies Act 2013 and should be prepared by your CA.
      </p>
    </div>
  );
}

// ── RATIO ANALYSIS ─────────────────────────────────────────────────────────────
function RatiosTab() {
  const { store } = useApp();
  const { transactions } = store;

  // Auto-derived revenue & net profit from transactions (annualised over trailing window).
  const now = new Date();
  const winStart = startOfMonth(subMonths(now, 11)).toISOString().split("T")[0];
  const win = (transactions ?? []).filter(t => t.date >= winStart);
  const monthsSpan = 12;
  const revenuePeriod = win.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const operatingPeriod = win.filter(t => t.category === "expense" || t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const expenseOnlyPeriod = win.filter(t => t.category === "expense").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const taxPeriod = win.filter(t => t.category === "tax").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const costsPeriod = operatingPeriod + taxPeriod;
  const revenue = (revenuePeriod / monthsSpan) * 12;       // annualised
  const netProfit = ((revenuePeriod - costsPeriod) / monthsSpan) * 12;   // after tax & operating costs
  const taxAnnual = (taxPeriod / monthsSpan) * 12;
  const cogsFallback = (expenseOnlyPeriod / monthsSpan) * 12;            // annualised expense-only COGS proxy

  // Manual balance-sheet figures, pre-filled with sensible store-derived defaults.
  const cashBankDefault = (store.bankAccounts ?? []).reduce((s, a) => s + (a.balance || 0), 0);
  const recvDefault = (store.invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const invDefault = (store.inventory ?? []).reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0);
  const debtDefault = (store.activeLoans ?? []).reduce((s, l) => s + (l.outstanding || 0), 0);

  const [currentAssets, setCurrentAssets] = useState(Math.round(cashBankDefault + recvDefault + invDefault));
  const [currentLiabilities, setCurrentLiabilities] = useState(0);
  const [inventory, setInventory] = useState(Math.round(invDefault));
  const [totalDebt, setTotalDebt] = useState(Math.round(debtDefault));
  const [equity, setEquity] = useState(0);
  const [totalAssets, setTotalAssets] = useState(Math.round(cashBankDefault + recvDefault + invDefault + totalNetBookValue(store.fixedAssets ?? [], now.toISOString().split("T")[0])));
  const [cogs, setCogs] = useState(0);
  const [interestExpense, setInterestExpense] = useState(Math.round((store.activeLoans ?? []).reduce((s, l) => s + (l.outstanding || 0) * ((l.rate || 0) / 100), 0)));

  const ebit = netProfit + interestExpense + taxAnnual; // EBIT = net profit + interest + tax (earnings before interest & taxes)
  const grossProfit = cogs > 0 ? revenue - cogs : revenue;

  type Status = "good" | "watch" | "poor" | null;
  type Ratio = { label: string; formula: string; value: number | null; display: string; benchmark: string; status: Status; lowerBetter?: boolean };
  const pct = (n: number) => `${n.toFixed(1)}%`;
  // grade: higher-is-better unless lowerBetter - good/watch thresholds bracket the three tiers.
  const grade = (v: number | null, goodT: number, watchT: number, lowerBetter = false): Status => {
    if (v === null) return null;
    if (lowerBetter) return v <= goodT ? "good" : v <= watchT ? "watch" : "poor";
    return v >= goodT ? "good" : v >= watchT ? "watch" : "poor";
  };

  const liquidity: Ratio[] = [
    (() => { const v = currentLiabilities > 0 ? currentAssets / currentLiabilities : null; return { label: "Current Ratio", formula: "Current Assets ÷ Current Liabilities", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≥ 1.5x", value: v, status: grade(v, 1.5, 1.0) }; })(),
    (() => { const v = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : null; return { label: "Quick Ratio", formula: "(Current Assets − Inventory) ÷ Current Liabilities", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≥ 1.0x", value: v, status: grade(v, 1.0, 0.7) }; })(),
  ];
  const profitability: Ratio[] = [
    (() => { const v = revenue > 0 ? (netProfit / revenue) * 100 : null; return { label: "Net Profit Margin", formula: "Net Profit ÷ Revenue", display: v !== null ? pct(v) : "-", benchmark: "Good ≥ 8%", value: v, status: grade(v, 8, 3) }; })(),
    (() => { const v = revenue > 0 ? (grossProfit / revenue) * 100 : null; return { label: "Gross Margin", formula: "(Revenue − COGS) ÷ Revenue", display: v !== null ? pct(v) : "-", benchmark: "Good ≥ 30%", value: v, status: grade(v, 30, 15) }; })(),
    (() => { const v = equity > 0 ? (netProfit / equity) * 100 : null; return { label: "Return on Equity", formula: "Net Profit ÷ Equity", display: v !== null ? pct(v) : "-", benchmark: "Good ≥ 15%", value: v, status: grade(v, 15, 8) }; })(),
    (() => { const v = totalAssets > 0 ? (netProfit / totalAssets) * 100 : null; return { label: "Return on Assets", formula: "Net Profit ÷ Total Assets", display: v !== null ? pct(v) : "-", benchmark: "Good ≥ 5%", value: v, status: grade(v, 5, 2) }; })(),
  ];
  const leverage: Ratio[] = [
    (() => { const v = equity > 0 ? totalDebt / equity : null; return { label: "Debt-to-Equity", formula: "Total Debt ÷ Equity", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≤ 2.0x", lowerBetter: true, value: v, status: grade(v, 2.0, 3.0, true) }; })(),
    (() => { const v = interestExpense > 0 ? ebit / interestExpense : null; return { label: "Interest Coverage", formula: "EBIT ÷ Interest Expense", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≥ 3.0x", value: v, status: grade(v, 3.0, 1.5) }; })(),
  ];
  const efficiency: Ratio[] = [
    (() => { const v = totalAssets > 0 ? revenue / totalAssets : null; return { label: "Asset Turnover", formula: "Revenue ÷ Total Assets", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≥ 1.0x", value: v, status: grade(v, 1.0, 0.5) }; })(),
    (() => { const cogsForTurnover = cogs > 0 ? cogs : cogsFallback; const v = inventory > 0 && cogsForTurnover > 0 ? cogsForTurnover / inventory : null; return { label: "Inventory Turnover", formula: "COGS ÷ Avg Inventory", display: v !== null ? `${v.toFixed(2)}x` : "-", benchmark: "Good ≥ 4.0x", value: v, status: grade(v, 4.0, 2.0) }; })(),
  ];

  const groups: { title: string; ratios: Ratio[] }[] = [
    { title: "Liquidity", ratios: liquidity },
    { title: "Profitability", ratios: profitability },
    { title: "Leverage", ratios: leverage },
    { title: "Efficiency", ratios: efficiency },
  ];

  const Badge = ({ status }: { status: Status }) => {
    if (status === null) return <span className="text-[10px] bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">No data</span>;
    if (status === "good") return <span className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full">Good</span>;
    if (status === "watch") return <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/40 px-1.5 py-0.5 rounded-full">Watch</span>;
    return <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full">Poor</span>;
  };

  const inputs: { label: string; value: number; set: (n: number) => void }[] = [
    { label: "Current Assets", value: currentAssets, set: setCurrentAssets },
    { label: "Current Liabilities", value: currentLiabilities, set: setCurrentLiabilities },
    { label: "Inventory", value: inventory, set: setInventory },
    { label: "Total Debt", value: totalDebt, set: setTotalDebt },
    { label: "Equity", value: equity, set: setEquity },
    { label: "Total Assets", value: totalAssets, set: setTotalAssets },
    { label: "COGS (annual)", value: cogs, set: setCogs },
    { label: "Interest Expense (annual)", value: interestExpense, set: setInterestExpense },
  ];

  return (
    <div className="space-y-5">
      {/* Auto-derived KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Annualised Revenue", value: formatCurrency(revenue), color: "text-green-400" },
          { label: "Annualised Net Profit", value: formatCurrency(netProfit), color: netProfit >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Approx EBIT", value: formatCurrency(ebit), color: "text-[var(--color-primary)]" },
          { label: "Ratios Computed", value: groups.reduce((s, g) => s + g.ratios.filter(r => r.value !== null).length, 0).toString(), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Manual inputs */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <Percent size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Balance-Sheet Inputs</p>
        </div>
        <p className="text-xs text-[var(--color-muted)] mb-4">Revenue & net profit are auto-derived from your transactions (annualised). Adjust the figures below - defaults are pre-filled from your bank, invoice, inventory and loan data.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {inputs.map(f => (
            <div key={f.label}>
              <label className="text-[10px] text-[var(--color-muted)] block mb-1">{f.label} (₹)</label>
              <input type="number" value={f.value || ""} onChange={e => f.set(parseFloat(e.target.value) || 0)} placeholder="0"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] tabular-nums" />
            </div>
          ))}
        </div>
      </div>

      {/* Ratio groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map(g => (
          <div key={g.title} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-3">{g.title}</p>
            <div className="space-y-3">
              {g.ratios.map(r => (
                <div key={r.label} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">{r.label}</span>
                    <Badge status={r.status} />
                  </div>
                  <div className="flex items-end justify-between">
                    <span className={`text-lg font-bold tabular-nums ${r.status === null ? "text-[var(--color-muted)]" : r.status === "good" ? "text-green-400" : r.status === "watch" ? "text-amber-400" : "text-red-400"}`}>{r.display}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">{r.benchmark}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1">{r.formula}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        <DataFreshnessBadge kind="indicative" className="mr-1.5" />Benchmarks are indicative Indian SME averages and vary materially by sector, age and capital structure - treat them as a starting point, not a verdict. Lower is better for Debt-to-Equity. Revenue and net profit are annualised from the trailing 12 months of tagged transactions.
      </p>
    </div>
  );
}

// ── TRIAL BALANCE ──────────────────────────────────────────────────────────────
function TrialBalanceTab() {
  const { store, canExport } = useApp();
  const { transactions, firm } = store;

  type Line = { account: string; debit: number; credit: number };

  const lines = useMemo<Line[]>(() => {
    const txns = transactions ?? [];
    // Category → ledger account, with double-entry side conventions (cash-basis).
    const sales      = txns.filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const opex       = txns.filter(t => t.category === "expense").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const salaries   = txns.filter(t => t.category === "payroll").reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    const taxes      = txns.filter(t => t.category === "tax").reduce((s, t) => s + Math.abs(t.amount || 0), 0);

    // Loans: inflow (amount > 0) is a credit (liability raised); repayment (amount < 0) is a debit.
    const loanCredit = txns.filter(t => t.category === "loan" && (t.amount || 0) > 0).reduce((s, t) => s + (t.amount || 0), 0);
    const loanDebit  = txns.filter(t => t.category === "loan" && (t.amount || 0) < 0).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

    // Transfers net to zero in a single entity but we surface the gross movement.
    const transferIn  = txns.filter(t => t.category === "transfer" && (t.amount || 0) > 0).reduce((s, t) => s + (t.amount || 0), 0);
    const transferOut = txns.filter(t => t.category === "transfer" && (t.amount || 0) < 0).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

    const rows: Line[] = [
      { account: "Sales", debit: 0, credit: sales },
      { account: "Operating Expenses", debit: opex, credit: 0 },
      { account: "Salaries & Wages", debit: salaries, credit: 0 },
      { account: "Taxes", debit: taxes, credit: 0 },
      { account: "Loan Account", debit: loanDebit, credit: loanCredit },
      { account: "Inter-account Transfer", debit: transferOut, credit: transferIn },
    ];

    // Cash & Bank is the contra/balancing account, derived from the category rows so
    // the two columns always tie out regardless of per-transaction sign conventions:
    //   Cash debit  = sum of all category credits (cash received)
    //   Cash credit = sum of all category debits  (cash paid)
    const categoryDebits  = rows.reduce((s, r) => s + r.debit, 0);
    const categoryCredits = rows.reduce((s, r) => s + r.credit, 0);
    rows.unshift({ account: "Cash & Bank", debit: categoryCredits, credit: categoryDebits });

    return rows.filter(r => r.debit !== 0 || r.credit !== 0);
  }, [transactions]);

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const diff = totalDebit - totalCredit;
  const balanced = Math.abs(diff) < 1;

  const exportTbCsv = () => {
    const header = "Ledger Account,Debit,Credit\n";
    const rows = lines.map(l => `${l.account.replace(/,/g, "")},${l.debit.toFixed(2)},${l.credit.toFixed(2)}`).join("\n");
    const footer = `\nTOTAL,${totalDebit.toFixed(2)},${totalCredit.toFixed(2)}`;
    const blob = new Blob([header + rows + footer], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trial_balance_${(firm?.name ?? "firm").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Trial balance CSV downloaded");
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Debits",  value: formatCurrency(totalDebit),  color: "text-[var(--color-text)]" },
          { label: "Total Credits", value: formatCurrency(totalCredit), color: "text-[var(--color-text)]" },
          { label: "Ledger Accounts", value: lines.length.toString(),   color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">Trial Balance · Cash Basis</p>
          </div>
          {canExport() && (
            <button onClick={exportTbCsv}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <FileDown size={13} /> Export CSV
            </button>
          )}
        </div>
        {lines.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-muted)] text-center">No transactions to aggregate. Add or import transactions to build the trial balance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {(["Ledger Account", "Debit (₹)", "Credit (₹)"] as string[]).map(h => (
                    <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${h === "Ledger Account" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {lines.map(l => (
                  <tr key={l.account} className="hover:bg-white/2 text-xs">
                    <td data-label="Ledger Account" className="px-5 py-2.5 font-medium">{l.account}</td>
                    <td data-label="Debit (₹)" className="px-5 py-2.5 text-right tabular-nums">{l.debit > 0 ? formatCurrency(l.debit) : "-"}</td>
                    <td data-label="Credit (₹)" className="px-5 py-2.5 text-right tabular-nums">{l.credit > 0 ? formatCurrency(l.credit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr className="text-xs font-bold">
                  <td data-label="" className="px-5 py-2.5 text-[var(--color-primary)]">Total</td>
                  <td data-label="Debit (₹)" className="px-5 py-2.5 text-right tabular-nums">{formatCurrency(totalDebit)}</td>
                  <td data-label="Credit (₹)" className="px-5 py-2.5 text-right tabular-nums">{formatCurrency(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Balance indicator */}
      <div className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${balanced ? "border-green-700/40 bg-green-950/15 text-green-300" : "border-red-700/40 bg-red-950/15 text-red-300"}`}>
        <BookOpen size={15} className="shrink-0" />
        <p className="text-sm font-semibold">{balanced ? "Balanced ✓" : `Difference ${formatCurrency(Math.abs(diff))}`}</p>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Simplified cash-basis trial balance built from tagged transactions, with Cash &amp; Bank as the contra account so debits equal credits. A statutory trial balance requires full double-entry ledgers (accruals, opening balances, asset/liability accounts) maintained in your books of account.
      </p>
    </div>
  );
}

// ── SALES COMMISSION CALCULATOR ─────────────────────────────────────────────────
function CommissionTab() {
  type Tier = { id: string; upTo: number; rate: number };
  type Person = { id: string; name: string; sales: number };
  const [mode, setMode] = useFeatureState<"tiered" | "flat">("commission-mode", "tiered");
  const [flatRate, setFlatRate] = useFeatureState("commission-flat-rate", 3);
  const [tiers, setTiers] = useFeatureState<Tier[]>("commission-tiers", [
    { id: "t1", upTo: 500000, rate: 2 },
    { id: "t2", upTo: 1000000, rate: 3 },
    { id: "t3", upTo: Infinity, rate: 5 },
  ]);
  const [people, setPeople] = useFeatureState<Person[]>("commission-people", []);
  const [pName, setPName] = useState("");
  const [pSales, setPSales] = useState("");

  const sortedTiers = [...tiers].sort((a, b) => a.upTo - b.upTo);
  const marginalCommission = (sales: number) => {
    let commission = 0, prev = 0;
    for (const t of sortedTiers) {
      if (sales <= prev) break;
      const portion = Math.min(sales, t.upTo) - prev;
      if (portion > 0) commission += portion * (t.rate / 100);
      prev = t.upTo;
    }
    return commission;
  };
  const commissionFor = (sales: number) => mode === "flat" ? sales * (flatRate / 100) : marginalCommission(sales);

  const addPerson = () => {
    if (!pName) return;
    setPeople(prev => [...prev, { id: Math.random().toString(36).slice(2), name: pName, sales: parseFloat(pSales) || 0 }]);
    setPName(""); setPSales("");
  };

  const totalSales = people.reduce((s, p) => s + p.sales, 0);
  const totalPayout = people.reduce((s, p) => s + commissionFor(p.sales), 0);
  const avgRate = totalSales > 0 ? (totalPayout / totalSales) * 100 : 0;
  const fc = formatCurrency;
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]";

  const updateTier = (id: string, field: "upTo" | "rate", val: string) =>
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: field === "upTo" ? (val === "" ? Infinity : parseFloat(val) || 0) : parseFloat(val) || 0 } : t));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sales", value: fc(totalSales), color: "text-[var(--color-primary)]" },
          { label: "Total Commission", value: fc(totalPayout), color: "text-orange-400" },
          { label: "Avg Commission Rate", value: `${avgRate.toFixed(2)}%`, color: "text-yellow-400" },
          { label: "Salespeople", value: people.length.toString(), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Percent size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Commission Structure</p>
          <div className="ml-auto flex gap-1">
            {(["tiered", "flat"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${mode === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                {m === "tiered" ? "Tiered (marginal)" : "Flat %"}
              </button>
            ))}
          </div>
        </div>
        {mode === "flat" ? (
          <div className="max-w-xs">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Flat Commission Rate (%)</label>
            <input type="number" value={flatRate} onChange={e => setFlatRate(parseFloat(e.target.value) || 0)} className={`${inp} w-full`} />
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTiers.map((t, i) => {
              const prev = i === 0 ? 0 : sortedTiers[i - 1].upTo;
              return (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--color-muted)] w-40">{fc(prev)} → {t.upTo === Infinity ? "and above" : fc(t.upTo)}</span>
                  <input type="number" value={t.upTo === Infinity ? "" : t.upTo} onChange={e => updateTier(t.id, "upTo", e.target.value)} placeholder="upper limit (blank = ∞)" className={`${inp} w-40`} />
                  <input type="number" value={t.rate} onChange={e => updateTier(t.id, "rate", e.target.value)} className={`${inp} w-20`} />
                  <span className="text-[var(--color-muted)]">%</span>
                  <button aria-label="Remove tier" onClick={() => setTiers(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              );
            })}
            <button onClick={() => setTiers(prev => [...prev, { id: Math.random().toString(36).slice(2), upTo: Infinity, rate: 5 }])}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"><Plus size={11} /> Add tier</button>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Users size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Salespeople</span>
          </div>
          <div className="flex gap-2">
            <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Name" className={inp} />
            <input type="number" value={pSales} onChange={e => setPSales(e.target.value)} placeholder="Sales (₹)" className={inp} />
            <button onClick={addPerson} className="flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90"><Plus size={11} /> Add</button>
          </div>
        </div>
        {people.length === 0 ? (
          <p className="p-8 text-sm text-[var(--color-muted)] text-center">Add salespeople and their sales to compute commission payouts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px] rcard">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Salesperson", "Sales", "Commission", "Effective %", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const comm = commissionFor(p.sales);
                  const eff = p.sales > 0 ? (comm / p.sales) * 100 : 0;
                  return (
                    <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                      <td data-label="Salesperson" className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td data-label="Sales" className="px-4 py-2.5 tabular-nums">{fc(p.sales)}</td>
                      <td data-label="Commission" className="px-4 py-2.5 tabular-nums text-orange-400">{fc(Math.round(comm))}</td>
                      <td data-label="Effective %" className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{eff.toFixed(2)}%</td>
                      <td data-label="" className="px-4 py-2.5">
                        <button aria-label={`Remove ${p.name}`} onClick={() => setPeople(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Tiered mode applies each tier's rate only to the sales within that band (marginal, like income-tax slabs). Commission to non-employee agents may attract TDS u/s 194H (5%) and GST (18%). Indicative only.</p>
    </div>
  );
}

// ── Shared helpers for the new analytics tools ──────────────────────────────────
const ANALYTICS_INPUT = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]";
const ANALYTICS_CARD   = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";
const PARETO_PALETTE   = ["#22c55e", "#3b82f6", "#f97316", "#8b5cf6", "#eab308", "#14b8a6", "#ec4899", "#6b7280"];

// Tiny stable hash so the same name always lands in the same derived bucket (region/SKU).
function bucketIndex(key: string, n: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % Math.max(1, n);
}

// Pull a coarse "item / SKU" label from a transaction description.
function deriveItem(t: { description?: string; counterparty?: string; category: string }): string {
  const src = (t.description || t.counterparty || "").trim();
  if (!src) return CATEGORY_LABEL[t.category] ?? t.category;
  // First 2 significant words, title-cased - a usable proxy when no SKU field exists.
  const words = src.replace(/[#*₹0-9]+/g, " ").split(/\s+/).filter(w => w.length > 1).slice(0, 2);
  const label = words.join(" ").trim();
  return label ? label.replace(/\b\w/g, c => c.toUpperCase()) : (CATEGORY_LABEL[t.category] ?? t.category);
}

function MetricCard({ label, value, note, color = "text-[var(--color-text)]" }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div className={`${ANALYTICS_CARD} p-4`}>
      <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {note && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{note}</p>}
    </div>
  );
}

// ── #134 PRODUCT / SKU PROFITABILITY ────────────────────────────────────────────
function SkuProfitabilityTab() {
  const { store } = useApp();
  const { transactions } = store;
  // Durable: assumed direct-cost % of revenue per item (COGS proxy). Default 60%.
  const [defaultCogs, setDefaultCogs] = useFeatureState("sku-default-cogs", 60);
  const [overrides, setOverrides] = useFeatureState<Record<string, number>>("sku-cogs-overrides", {});

  const rows = useMemo(() => {
    const acc: Record<string, { name: string; revenue: number; units: number }> = {};
    transactions.filter(t => t.amount > 0 && t.category !== "transfer").forEach(t => {
      const name = deriveItem(t);
      const k = name.toLowerCase();
      if (!acc[k]) acc[k] = { name, revenue: 0, units: 0 };
      acc[k].revenue += t.amount;
      acc[k].units += 1;
    });
    return Object.entries(acc).map(([k, v]) => {
      const cogsPct = overrides[k] ?? defaultCogs;
      const cogs = v.revenue * (cogsPct / 100);
      const margin = v.revenue - cogs;
      const marginPct = v.revenue > 0 ? Math.round((margin / v.revenue) * 100) : 0;
      return { key: k, ...v, cogsPct, cogs, margin, marginPct, avgTicket: v.units > 0 ? v.revenue / v.units : 0 };
    }).sort((a, b) => b.margin - a.margin);
  }, [transactions, overrides, defaultCogs]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalMargin  = rows.reduce((s, r) => s + r.margin, 0);
  const winners = rows.filter(r => r.marginPct >= 40 && r.margin > 0).slice(0, 5);
  const losers  = rows.filter(r => r.marginPct < 20).slice(0, 5);
  const chartData = rows.slice(0, 8).map(r => ({ name: r.name.length > 14 ? r.name.slice(0, 13) + "…" : r.name, margin: Math.round(r.margin), revenue: Math.round(r.revenue) }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Items / SKUs" value={rows.length.toString()} color="text-[var(--color-primary)]" note="Derived from descriptions" />
        <MetricCard label="Total Revenue" value={formatCurrency(totalRevenue)} color="text-green-400" />
        <MetricCard label="Gross Margin" value={formatCurrency(totalMargin)} color="text-[var(--color-text)]" note={`${totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0}% blended`} />
        <MetricCard label="Loss-makers" value={losers.length.toString()} color={losers.length ? "text-red-400" : "text-green-400"} note="Margin < 20%" />
      </div>

      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Package size={14} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Direct-cost assumption</p>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="text-[var(--color-muted)]">Default COGS % of revenue</label>
            <input type="number" min={0} max={100} value={defaultCogs} onChange={e => setDefaultCogs(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={`${ANALYTICS_INPUT} w-20`} />
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)]">No SKU master exists, so items are inferred from transaction descriptions and costed at a flat assumed COGS %. Override per item in the table for accuracy.</p>
      </div>

      {chartData.length > 0 && (
        <div className={`${ANALYTICS_CARD} p-5`}>
          <p className="text-sm font-semibold mb-4">Gross Margin by Item · Top 8</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="margin" name="Gross margin" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.margin >= 0 ? "var(--color-primary)" : "#ef4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Item profitability · winners vs losers</p></div>
        {rows.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No revenue transactions to analyse.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Item", "Txns", "Revenue", "COGS %", "Margin", "Margin %"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.key} className="hover:bg-white/2 text-xs">
                    <td data-label="Item" className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td data-label="Txns" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{r.units}</td>
                    <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(r.revenue)}</td>
                    <td data-label="COGS %" className="px-4 py-2.5 text-right">
                      <input type="number" min={0} max={100} value={r.cogsPct} onChange={e => setOverrides(prev => ({ ...prev, [r.key]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) }))} className={`${ANALYTICS_INPUT} w-16 text-right`} />
                    </td>
                    <td data-label="Margin" className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.margin >= 0 ? "text-[var(--color-text)]" : "text-red-400"}`}>{formatAmount(r.margin)}</td>
                    <td data-label="Margin %" className={`px-4 py-2.5 text-right tabular-nums ${r.marginPct >= 40 ? "text-green-400" : r.marginPct >= 20 ? "text-yellow-400" : "text-red-400"}`}>{r.marginPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(winners.length > 0 || losers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`${ANALYTICS_CARD} p-5`}>
            <p className="text-sm font-semibold mb-3 text-green-400">Winners - protect &amp; push</p>
            {winners.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No clear winners yet.</p> : winners.map(r => (
              <div key={r.key} className="flex items-center justify-between text-xs py-1"><span className="truncate pr-2">{r.name}</span><span className="tabular-nums text-green-400 font-semibold">{formatAmount(r.margin)} · {r.marginPct}%</span></div>
            ))}
          </div>
          <div className={`${ANALYTICS_CARD} p-5`}>
            <p className="text-sm font-semibold mb-3 text-red-400">Losers - re-price or drop</p>
            {losers.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No loss-makers - healthy mix.</p> : losers.map(r => (
              <div key={r.key} className="flex items-center justify-between text-xs py-1"><span className="truncate pr-2">{r.name}</span><span className="tabular-nums text-red-400 font-semibold">{formatAmount(r.margin)} · {r.marginPct}%</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── #135 CUSTOMER PROFITABILITY & COHORTS ───────────────────────────────────────
function CustomerCohortsTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();

  const customers = useMemo(() => {
    const acc: Record<string, { name: string; revenue: number; txns: number; first: string; last: string }> = {};
    transactions.filter(t => t.amount > 0 && t.counterparty && t.category !== "transfer").forEach(t => {
      const k = t.counterparty;
      if (!acc[k]) acc[k] = { name: k, revenue: 0, txns: 0, first: t.date, last: t.date };
      acc[k].revenue += t.amount;
      acc[k].txns += 1;
      if (t.date < acc[k].first) acc[k].first = t.date;
      if (t.date > acc[k].last) acc[k].last = t.date;
    });
    return Object.values(acc).map(c => {
      const monthsActive = Math.max(1, Math.round((parseISO(c.last).getTime() - parseISO(c.first).getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1);
      const monthlyRev = c.revenue / monthsActive;
      const daysSinceLast = Math.round((now.getTime() - parseISO(c.last).getTime()) / (1000 * 60 * 60 * 24));
      // Simple LTV proxy: avg monthly revenue × expected 24-month lifetime, contribution at 50%.
      const ltv = monthlyRev * 24 * 0.5;
      return { ...c, monthsActive, monthlyRev, daysSinceLast, ltv, active: daysSinceLast <= 90 };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [transactions]);

  // Acquisition cohorts by first-seen month.
  const cohorts = useMemo(() => {
    const acc: Record<string, { label: string; key: string; customers: number; revenue: number; retained: number }> = {};
    customers.forEach(c => {
      const d = parseISO(c.first);
      const key = format(d, "yyyy-MM");
      if (!acc[key]) acc[key] = { label: format(d, "MMM yy"), key, customers: 0, revenue: 0, retained: 0 };
      acc[key].customers += 1;
      acc[key].revenue += c.revenue;
      if (c.active) acc[key].retained += 1;
    });
    return Object.values(acc).sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
  }, [customers]);

  const totalRev = customers.reduce((s, c) => s + c.revenue, 0);
  const activeCount = customers.filter(c => c.active).length;
  const churnedCount = customers.length - activeCount;
  const avgLtv = customers.length ? customers.reduce((s, c) => s + c.ltv, 0) / customers.length : 0;
  const retentionRate = customers.length ? Math.round((activeCount / customers.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Customers" value={customers.length.toString()} color="text-[var(--color-primary)]" />
        <MetricCard label="Active (≤90d)" value={`${activeCount}`} color="text-green-400" note={`${retentionRate}% retention`} />
        <MetricCard label="Churned (>90d)" value={`${churnedCount}`} color={churnedCount ? "text-red-400" : "text-green-400"} />
        <MetricCard label="Avg LTV" value={formatCurrency(avgLtv)} color="text-[var(--color-text)]" note="24m × 50% contribution" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4"><Users size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Acquisition cohorts · retention</p></div>
        {cohorts.length === 0 ? <p className="text-sm text-[var(--color-muted)]">No customer history.</p> : (
          <div className="space-y-2">
            {cohorts.map(co => {
              const ret = co.customers > 0 ? Math.round((co.retained / co.customers) * 100) : 0;
              return (
                <div key={co.key} className="flex items-center gap-3 text-xs">
                  <span className="w-16 text-[var(--color-muted)]">{co.label}</span>
                  <span className="w-24 tabular-nums">{co.customers} cust · {co.retained} live</span>
                  <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ret >= 60 ? "bg-green-500" : ret >= 30 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${ret}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-[var(--color-muted)]">{ret}%</span>
                  <span className="w-20 text-right tabular-nums text-green-400">{formatAmount(co.revenue)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Customer profitability</p></div>
        {customers.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No customer revenue yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Customer", "Revenue", "Share", "Months", "LTV", "Last seen", "Status"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {customers.slice(0, 25).map(c => (
                  <tr key={c.name} className="hover:bg-white/2 text-xs">
                    <td data-label="Customer" className="px-4 py-2.5 font-medium truncate max-w-[160px]">{c.name}</td>
                    <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(c.revenue)}</td>
                    <td data-label="Share" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{totalRev > 0 ? Math.round((c.revenue / totalRev) * 100) : 0}%</td>
                    <td data-label="Months" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.monthsActive}</td>
                    <td data-label="LTV" className="px-4 py-2.5 text-right tabular-nums">{formatAmount(c.ltv)}</td>
                    <td data-label="Last seen" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.daysSinceLast}d ago</td>
                    <td data-label="Status" className="px-4 py-2.5 text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>{c.active ? "Active" : "Churned"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />LTV and retention are computed from observed transaction recency/frequency; with no contract data, "churned" means no revenue in 90+ days. Indicative.</p>
    </div>
  );
}

// ── #136 REGION / BRANCH P&L ────────────────────────────────────────────────────
function BranchPLTab() {
  const { store } = useApp();
  const { transactions, bankAccounts } = store;
  // Durable: how to segment. Bank account is a real field; "region" is a derived proxy.
  const [segmentBy, setSegmentBy] = useFeatureState<"bank" | "region">("branch-segment-by", "bank");
  const regions = ["North", "South", "East", "West", "Central"];

  const segments = useMemo(() => {
    const acc: Record<string, { name: string; revenue: number; expense: number }> = {};
    const labelFor = (t: { bankAccountId: string; counterparty?: string }) => {
      if (segmentBy === "bank") {
        const ba = bankAccounts.find(b => b.id === t.bankAccountId);
        return ba ? ba.name : "Unassigned";
      }
      const key = t.counterparty || t.bankAccountId || "-";
      return regions[bucketIndex(key, regions.length)];
    };
    transactions.filter(t => t.category !== "transfer").forEach(t => {
      const name = labelFor(t);
      if (!acc[name]) acc[name] = { name, revenue: 0, expense: 0 };
      if (t.amount > 0) acc[name].revenue += t.amount;
      else acc[name].expense += Math.abs(t.amount);
    });
    return Object.values(acc).map(s => {
      const net = s.revenue - s.expense;
      return { ...s, net, margin: s.revenue > 0 ? Math.round((net / s.revenue) * 100) : 0 };
    }).sort((a, b) => b.net - a.net);
  }, [transactions, bankAccounts, segmentBy]);

  const chartData = segments.map(s => ({ name: s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name, revenue: Math.round(s.revenue), expense: Math.round(s.expense), net: Math.round(s.net) }));
  const totalNet = segments.reduce((s, x) => s + x.net, 0);

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <MapPin size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Segment by</p>
        <div className="ml-auto flex gap-1">
          {(["bank", "region"] as const).map(m => (
            <button key={m} onClick={() => setSegmentBy(m)} className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${segmentBy === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"}`}>{m === "bank" ? "Bank account" : "Region (derived)"}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Segments" value={segments.length.toString()} color="text-[var(--color-primary)]" />
        <MetricCard label="Total Net P&L" value={formatCurrency(totalNet)} color={totalNet >= 0 ? "text-green-400" : "text-red-400"} />
        <MetricCard label="Best segment" value={segments[0]?.name ?? "-"} color="text-green-400" note={segments[0] ? formatCurrency(segments[0].net) : ""} />
        <MetricCard label="Weakest" value={segments[segments.length - 1]?.name ?? "-"} color="text-red-400" note={segments.length ? formatCurrency(segments[segments.length - 1].net) : ""} />
      </div>

      {chartData.length > 0 && (
        <div className={`${ANALYTICS_CARD} p-5`}>
          <p className="text-sm font-semibold mb-4">Revenue vs Expense vs Net by segment</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barCategoryGap="24%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Segment P&L</p></div>
        {segments.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No data to segment.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Segment", "Revenue", "Expense", "Net P&L", "Margin %"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {segments.map(s => (
                  <tr key={s.name} className="hover:bg-white/2 text-xs">
                    <td data-label="Segment" className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(s.revenue)}</td>
                    <td data-label="Expense" className="px-4 py-2.5 text-right tabular-nums text-red-400">({formatAmount(s.expense)})</td>
                    <td data-label="Net P&L" className={`px-4 py-2.5 text-right tabular-nums font-semibold ${s.net >= 0 ? "text-green-400" : "text-red-400"}`}>{formatAmount(s.net)}</td>
                    <td data-label="Margin %" className={`px-4 py-2.5 text-right tabular-nums ${s.margin >= 10 ? "text-green-400" : s.margin >= 0 ? "text-yellow-400" : "text-red-400"}`}>{s.margin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">"Bank account" segmentation uses the real account each transaction posts to. "Region" is a deterministic proxy from counterparty (no geo field exists) - useful for shape, not exact geography.</p>
    </div>
  );
}

// ── #137 UNIT ECONOMICS (CAC / LTV / PAYBACK) ───────────────────────────────────
function UnitEconomicsTab() {
  const { store } = useApp();
  const { transactions } = store;
  // Durable assumptions the owner controls.
  const [salesMarketingPct, setSalesMarketingPct] = useFeatureState("ue-sm-pct", 15); // % of expense treated as S&M
  const [grossMarginPct, setGrossMarginPct] = useFeatureState("ue-gm-pct", 50);
  const [lifetimeMonths, setLifetimeMonths] = useFeatureState("ue-lifetime", 24);

  const m = useMemo(() => {
    const rev = transactions.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const exp = Math.abs(transactions.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
    // New customers = unique counterparties whose first revenue is in the dataset window.
    const firstSeen: Record<string, string> = {};
    transactions.filter(t => t.amount > 0 && t.counterparty && t.category !== "transfer").forEach(t => {
      if (!firstSeen[t.counterparty] || t.date < firstSeen[t.counterparty]) firstSeen[t.counterparty] = t.date;
    });
    const customers = Object.keys(firstSeen);
    const newCustomers = Math.max(1, customers.length);
    const smSpend = exp * (salesMarketingPct / 100);
    const cac = smSpend / newCustomers;
    const arpa = rev / Math.max(1, customers.length); // avg revenue per account (period)
    const monthlyArpa = arpa / 6; // dataset window ≈ 6 months of activity
    const ltv = monthlyArpa * lifetimeMonths * (grossMarginPct / 100);
    const ratio = cac > 0 ? ltv / cac : 0;
    const grossPerMonth = monthlyArpa * (grossMarginPct / 100);
    const paybackMonths = grossPerMonth > 0 ? cac / grossPerMonth : 0;
    return { rev, exp, customers: customers.length, smSpend, cac, arpa, ltv, ratio, paybackMonths };
  }, [transactions, salesMarketingPct, grossMarginPct, lifetimeMonths]);

  const ratioColor = m.ratio >= 3 ? "text-green-400" : m.ratio >= 1 ? "text-yellow-400" : "text-red-400";
  const paybackColor = m.paybackMonths > 0 && m.paybackMonths <= 12 ? "text-green-400" : m.paybackMonths <= 18 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3"><Gauge size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Assumptions</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {([
            { label: "Sales & Marketing (% of total expense)", val: salesMarketingPct, set: setSalesMarketingPct, max: 100 },
            { label: "Gross margin %", val: grossMarginPct, set: setGrossMarginPct, max: 100 },
            { label: "Expected lifetime (months)", val: lifetimeMonths, set: setLifetimeMonths, max: 120 },
          ] as { label: string; val: number; set: (n: number) => void; max: number }[]).map(f => (
            <label key={f.label} className="block">
              <span className="text-[var(--color-muted)] block mb-1">{f.label}</span>
              <input type="number" min={0} max={f.max} value={f.val} onChange={e => f.set(Math.max(0, Math.min(f.max, parseFloat(e.target.value) || 0)))} className={`${ANALYTICS_INPUT} w-full`} />
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="CAC" value={formatCurrency(m.cac)} color="text-orange-400" note={`${formatAmount(m.smSpend)} S&M ÷ ${m.customers} cust`} />
        <MetricCard label="LTV" value={formatCurrency(m.ltv)} color="text-green-400" note={`${lifetimeMonths}m × ${grossMarginPct}% GM`} />
        <MetricCard label="LTV : CAC" value={`${m.ratio.toFixed(1)}x`} color={ratioColor} note="Target ≥ 3x" />
        <MetricCard label="CAC Payback" value={m.paybackMonths > 0 ? `${m.paybackMonths.toFixed(1)} mo` : "-"} color={paybackColor} note="Target ≤ 12 mo" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">LTV : CAC payback bridge</p>
        <div className="space-y-3">
          {([
            { label: "Customer LTV (contribution)", value: m.ltv, cls: "bg-green-500" },
            { label: "Acquisition cost (CAC)", value: m.cac, cls: "bg-orange-400" },
            { label: "Net lifetime value", value: m.ltv - m.cac, cls: (m.ltv - m.cac) >= 0 ? "bg-[var(--color-primary)]" : "bg-red-500" },
          ]).map(b => {
            const max = Math.max(m.ltv, m.cac, 1);
            return (
              <div key={b.label}>
                <div className="flex items-center justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">{b.label}</span><span className="tabular-nums font-semibold">{formatCurrency(b.value)}</span></div>
                <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full rounded-full ${b.cls}`} style={{ width: `${Math.min(100, Math.abs(b.value) / max * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />CAC uses an assumed S&M share of total expense; LTV uses average revenue per account × assumed lifetime × gross margin. Tune the assumptions above for your model. Indicative.</p>
    </div>
  );
}

// ── #138 SALES FUNNEL & CONVERSION ──────────────────────────────────────────────
function SalesFunnelTab() {
  const { store } = useApp();
  const { invoices, transactions } = store;
  // Durable top-of-funnel counts the owner enters (leads/qualified have no source data).
  const [leads, setLeads] = useFeatureState("funnel-leads", 0);
  const [qualified, setQualified] = useFeatureState("funnel-qualified", 0);

  const stages = useMemo(() => {
    const proposals = invoices.length; // proforma/issued invoices ≈ proposals sent
    const won = invoices.filter(i => i.status === "paid").length;
    const wonValue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    // Fall back to transaction-derived deals if no invoices exist.
    const revenueDeals = transactions.filter(t => t.amount > 0 && t.category !== "transfer").length;
    const proposalCount = proposals || revenueDeals;
    const wonCount = won || revenueDeals;
    return [
      { name: "Leads", count: leads, color: "#6b7280" },
      { name: "Qualified", count: qualified, color: "#3b82f6" },
      { name: "Proposals / Invoiced", count: proposalCount, color: "#f97316" },
      { name: "Won / Paid", count: wonCount, color: "#22c55e" },
    ].map((s, i, arr) => {
      const prev = i > 0 ? arr[i - 1].count : s.count;
      const conv = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
      return { ...s, conv: i === 0 ? 100 : conv, wonValue };
    });
  }, [invoices, transactions, leads, qualified]);

  const top = stages[0].count || 1;
  const winRate = stages[0].count > 0 ? Math.round((stages[stages.length - 1].count / top) * 100) : 0;
  const wonValue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3"><Filter size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Top-of-funnel inputs</p></div>
        <div className="grid grid-cols-2 gap-3 text-xs max-w-md">
          <label className="block"><span className="text-[var(--color-muted)] block mb-1">Leads</span><input type="number" min={0} value={leads} onChange={e => setLeads(Math.max(0, parseInt(e.target.value) || 0))} className={`${ANALYTICS_INPUT} w-full`} /></label>
          <label className="block"><span className="text-[var(--color-muted)] block mb-1">Qualified</span><input type="number" min={0} value={qualified} onChange={e => setQualified(Math.max(0, parseInt(e.target.value) || 0))} className={`${ANALYTICS_INPUT} w-full`} /></label>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Proposals and Won are read live from your invoices (issued → paid). Enter lead/qualified counts to complete the funnel.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Overall win rate" value={`${winRate}%`} color={winRate >= 25 ? "text-green-400" : "text-yellow-400"} note="Won ÷ leads" />
        <MetricCard label="Won deals" value={stages[stages.length - 1].count.toString()} color="text-green-400" />
        <MetricCard label="Won value" value={formatCurrency(wonValue)} color="text-green-400" />
        <MetricCard label="Open invoices" value={invoices.filter(i => i.status !== "paid").length.toString()} color="text-yellow-400" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4"><Target size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Conversion funnel</p></div>
        <div className="space-y-3">
          {stages.map((s, i) => {
            const width = Math.max(6, Math.round((s.count / top) * 100));
            return (
              <div key={s.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--color-muted)]">{s.name}</span>
                  <span className="tabular-nums font-semibold">{s.count} {i > 0 && <span className="text-[10px] text-[var(--color-muted)] ml-1">({s.conv}% of prev)</span>}</span>
                </div>
                <div className="h-6 bg-[var(--color-bg)] rounded-md overflow-hidden">
                  <div className="h-full rounded-md flex items-center justify-end pr-2 text-[10px] font-semibold text-[var(--color-bg)]" style={{ width: `${width}%`, background: s.color }}>{width >= 18 ? `${Math.round((s.count / top) * 100)}%` : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">No CRM pipeline exists, so proposals/wins are proxied from invoices; leads &amp; qualified are your inputs. Win rate = won ÷ leads.</p>
    </div>
  );
}

// ── #139 EXPENSE TREND & VARIANCE (MoM / YoY) ───────────────────────────────────
function ExpenseVarianceTab() {
  const { store } = useApp();
  const { transactions } = store;
  const [mode, setMode] = useFeatureState<"mom" | "yoy">("variance-mode", "mom");
  const now = new Date();

  const data = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i);
      const start = startOfMonth(d).toISOString().split("T")[0];
      const end = endOfMonth(d).toISOString().split("T")[0];
      const expense = Math.abs(transactions.filter(t => t.amount < 0 && t.category !== "transfer" && t.date >= start && t.date <= end).reduce((s, t) => s + t.amount, 0));
      return { month: format(d, "MMM yy"), expense: Math.round(expense) };
    });
    return months;
  }, [transactions]);

  const curr = data[data.length - 1];
  const prevMonthVal = data[data.length - 2]?.expense ?? 0;
  const prevYearVal = data[0]?.expense ?? 0; // 11 months back ≈ prior year proxy within window
  const baseVal = mode === "mom" ? prevMonthVal : prevYearVal;
  const varianceAbs = (curr?.expense ?? 0) - baseVal;
  const variancePct = baseVal > 0 ? Math.round((varianceAbs / baseVal) * 100) : 0;

  // Per-category MoM variance (current vs previous month).
  const catVariance = useMemo(() => {
    const ms = data.length;
    if (ms < 2) return [];
    const dCurr = subMonths(now, 0), dPrev = subMonths(now, mode === "mom" ? 1 : 11);
    const sumCat = (d: Date) => {
      const start = startOfMonth(d).toISOString().split("T")[0];
      const end = endOfMonth(d).toISOString().split("T")[0];
      const acc: Record<string, number> = {};
      transactions.filter(t => t.amount < 0 && t.category !== "transfer" && t.date >= start && t.date <= end).forEach(t => { acc[t.category] = (acc[t.category] || 0) + Math.abs(t.amount); });
      return acc;
    };
    const a = sumCat(dCurr), b = sumCat(dPrev);
    const cats = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...cats].map(c => {
      const cur = a[c] || 0, pre = b[c] || 0;
      return { cat: CATEGORY_LABEL[c] ?? c, color: CATEGORY_COLORS[c] ?? "#6b7280", cur, pre, diff: cur - pre, pct: pre > 0 ? Math.round(((cur - pre) / pre) * 100) : (cur > 0 ? 100 : 0) };
    }).filter(r => r.cur > 0 || r.pre > 0).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  }, [transactions, mode, data.length]);

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <Activity size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Expense variance</p>
        <div className="ml-auto flex gap-1">
          {(["mom", "yoy"] as const).map(mm => (
            <button key={mm} onClick={() => setMode(mm)} className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${mode === mm ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"}`}>{mm === "mom" ? "Month-on-Month" : "Year-on-Year*"}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="This month expense" value={formatCurrency(curr?.expense ?? 0)} color="text-red-400" />
        <MetricCard label={mode === "mom" ? "Prev month" : "~12m ago"} value={formatCurrency(baseVal)} color="text-[var(--color-muted)]" />
        <MetricCard label="Variance" value={`${varianceAbs >= 0 ? "+" : "−"}${formatAmount(Math.abs(varianceAbs))}`} color={varianceAbs <= 0 ? "text-green-400" : "text-red-400"} />
        <MetricCard label="Variance %" value={`${variancePct >= 0 ? "+" : ""}${variancePct}%`} color={variancePct <= 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Monthly expense trend · 12 months</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="expense" name="Expense" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Cost-driver variance by category</p></div>
        {catVariance.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">Not enough history to compute variance.</p> : (
          <table className="w-full text-sm rcard">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>{["Category", "Current", "Base", "Δ", "Δ%"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {catVariance.map(r => (
                <tr key={r.cat} className="hover:bg-white/2 text-xs">
                  <td data-label="Category" className="px-4 py-2.5 font-medium flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.color }} />{r.cat}</td>
                  <td data-label="Current" className="px-4 py-2.5 text-right tabular-nums">{formatAmount(r.cur)}</td>
                  <td data-label="Base" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(r.pre)}</td>
                  <td data-label="Δ" className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.diff <= 0 ? "text-green-400" : "text-red-400"}`}>{r.diff >= 0 ? "+" : "−"}{formatAmount(Math.abs(r.diff))}</td>
                  <td data-label="Δ%" className={`px-4 py-2.5 text-right tabular-nums ${r.pct <= 0 ? "text-green-400" : "text-red-400"}`}>{r.pct >= 0 ? "+" : ""}{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">*True YoY needs 12+ months of history; within a shorter window this compares against the earliest month available as a proxy.</p>
    </div>
  );
}

// ── #140 REVENUE CONCENTRATION & PARETO (80/20) ─────────────────────────────────
function RevenueParetoTab() {
  const { store } = useApp();
  const { transactions } = store;
  const [dim, setDim] = useFeatureState<"customer" | "item">("pareto-dim", "customer");

  const { rows, total, count8020, hhi } = useMemo(() => {
    const acc: Record<string, number> = {};
    transactions.filter(t => t.amount > 0 && t.category !== "transfer").forEach(t => {
      const key = dim === "customer" ? (t.counterparty || "Unattributed") : deriveItem(t);
      acc[key] = (acc[key] || 0) + t.amount;
    });
    const sorted = Object.entries(acc).sort((a, b) => b[1] - a[1]);
    const tot = sorted.reduce((s, [, v]) => s + v, 0);
    let cum = 0;
    const out = sorted.map(([name, value]) => {
      cum += value;
      const share = tot > 0 ? (value / tot) * 100 : 0;
      return { name, value, share, cumPct: tot > 0 ? Math.round((cum / tot) * 100) : 0 };
    });
    const eighty = out.findIndex(r => r.cumPct >= 80);
    const hhiVal = Math.round(out.reduce((s, r) => s + r.share * r.share, 0));
    return { rows: out, total: tot, count8020: eighty < 0 ? out.length : eighty + 1, hhi: hhiVal };
  }, [transactions, dim]);

  const pct8020 = rows.length ? Math.round((count8020 / rows.length) * 100) : 0;
  const chartData = rows.slice(0, 12).map((r, i) => ({ name: r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name, value: Math.round(r.value), cum: r.cumPct, fill: PARETO_PALETTE[i % PARETO_PALETTE.length] }));

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <BarChart3 size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Pareto dimension</p>
        <div className="ml-auto flex gap-1">
          {(["customer", "item"] as const).map(d => (
            <button key={d} onClick={() => setDim(d)} className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${dim === d ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]"}`}>{d === "customer" ? "By customer" : "By item"}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label={`${dim === "customer" ? "Customers" : "Items"}`} value={rows.length.toString()} color="text-[var(--color-primary)]" />
        <MetricCard label="Drive 80% of revenue" value={`${count8020}`} color="text-yellow-400" note={`${pct8020}% of the base`} />
        <MetricCard label="Top entity share" value={`${Math.round(rows[0]?.share ?? 0)}%`} color={(rows[0]?.share ?? 0) > 40 ? "text-red-400" : "text-green-400"} note={rows[0]?.name ?? "-"} />
        <MetricCard label="HHI" value={hhi.toString()} color={hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-yellow-400" : "text-green-400"} note="< 1500 = diversified" />
      </div>

      {chartData.length > 0 && (
        <div className={`${ANALYTICS_CARD} p-5`}>
          <p className="text-sm font-semibold mb-4">Pareto · revenue bars + cumulative %</p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={38} />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="l" dataKey="value" name="Revenue" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
              <Line yAxisId="r" type="monotone" dataKey="cum" name="Cumulative %" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Ranked contribution</p></div>
        {rows.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No revenue to rank.</p> : (
          <table className="w-full text-sm rcard">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>{["#", dim === "customer" ? "Customer" : "Item", "Revenue", "Share", "Cumulative"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i <= 1 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.slice(0, 20).map((r, i) => (
                <tr key={r.name} className={`hover:bg-white/2 text-xs ${i + 1 === count8020 ? "border-b-2 border-yellow-500/40" : ""}`}>
                  <td data-label="#" className="px-4 py-2.5 text-[var(--color-muted)]">{i + 1}</td>
                  <td data-label={dim === "customer" ? "Customer" : "Item"} className="px-4 py-2.5 font-medium truncate max-w-[200px]">{r.name}</td>
                  <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(r.value)}</td>
                  <td data-label="Share" className="px-4 py-2.5 text-right tabular-nums">{Math.round(r.share)}%</td>
                  <td data-label="Cumulative" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{r.cumPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Total revenue analysed: {formatCurrency(total)}. The highlighted row marks the 80%-of-revenue cut-off (your vital few). HHI &gt; 2500 indicates risky concentration.</p>
    </div>
  );
}

// ── #141 WHAT-IF MARGIN BRIDGE ──────────────────────────────────────────────────
function MarginBridgeTab() {
  const { store } = useApp();
  const { transactions } = store;
  // Durable what-if levers (% changes).
  const [priceChg, setPriceChg] = useFeatureState("bridge-price", 0);
  const [volumeChg, setVolumeChg] = useFeatureState("bridge-volume", 0);
  const [costChg, setCostChg] = useFeatureState("bridge-cost", 0);
  const [cogsPct, setCogsPct] = useFeatureState("bridge-cogs-pct", 60);

  const base = useMemo(() => {
    const revenue = transactions.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const cogs = revenue * (cogsPct / 100);
    return { revenue, cogs, profit: revenue - cogs };
  }, [transactions, cogsPct]);

  const bridge = useMemo(() => {
    // Start from base profit, apply each lever as an incremental contribution.
    const p = priceChg / 100, v = volumeChg / 100, c = costChg / 100;
    const baseRev = base.revenue, baseCogs = base.cogs;
    // Price affects revenue only; volume affects both revenue and COGS; cost affects COGS only.
    const priceEffect = baseRev * p;                          // extra revenue, no extra cost
    const volumeEffect = (baseRev - baseCogs) * v;            // extra contribution at current margin
    const costEffect = -baseCogs * c;                          // higher unit cost reduces profit
    const newProfit = base.profit + priceEffect + volumeEffect + costEffect;
    const newRevenue = baseRev * (1 + p) * (1 + v);
    const newMargin = newRevenue > 0 ? Math.round((newProfit / newRevenue) * 100) : 0;
    return { priceEffect, volumeEffect, costEffect, newProfit, newRevenue, newMargin };
  }, [base, priceChg, volumeChg, costChg]);

  const baseMargin = base.revenue > 0 ? Math.round((base.profit / base.revenue) * 100) : 0;
  const waterfall = [
    { label: "Base gross profit", value: base.profit, kind: "base" as const },
    { label: `Price ${priceChg >= 0 ? "+" : ""}${priceChg}%`, value: bridge.priceEffect, kind: "step" as const },
    { label: `Volume ${volumeChg >= 0 ? "+" : ""}${volumeChg}%`, value: bridge.volumeEffect, kind: "step" as const },
    { label: `Unit cost ${costChg >= 0 ? "+" : ""}${costChg}%`, value: bridge.costEffect, kind: "step" as const },
    { label: "New gross profit", value: bridge.newProfit, kind: "result" as const },
  ];
  const maxAbs = Math.max(...waterfall.map(w => Math.abs(w.value)), 1);

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3"><GitBranch size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">What-if levers</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {([
            { label: "Price change %", val: priceChg, set: setPriceChg },
            { label: "Volume change %", val: volumeChg, set: setVolumeChg },
            { label: "Unit cost change %", val: costChg, set: setCostChg },
            { label: "Base COGS % of rev", val: cogsPct, set: setCogsPct },
          ] as { label: string; val: number; set: (n: number) => void }[]).map(f => (
            <label key={f.label} className="block">
              <span className="text-[var(--color-muted)] block mb-1">{f.label}</span>
              <input type="number" value={f.val} onChange={e => f.set(parseFloat(e.target.value) || 0)} className={`${ANALYTICS_INPUT} w-full`} />
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Base revenue" value={formatCurrency(base.revenue)} color="text-green-400" />
        <MetricCard label="Base gross profit" value={formatCurrency(base.profit)} color="text-[var(--color-text)]" note={`${baseMargin}% margin`} />
        <MetricCard label="New gross profit" value={formatCurrency(bridge.newProfit)} color={bridge.newProfit >= base.profit ? "text-green-400" : "text-red-400"} note={`${bridge.newMargin}% margin`} />
        <MetricCard label="Profit impact" value={`${bridge.newProfit - base.profit >= 0 ? "+" : "−"}${formatAmount(Math.abs(bridge.newProfit - base.profit))}`} color={bridge.newProfit - base.profit >= 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Profit bridge waterfall</p>
        <div className="space-y-3">
          {waterfall.map(w => {
            const isStep = w.kind === "step";
            const cls = w.kind === "base" ? "bg-[var(--color-muted)]" : w.kind === "result" ? (w.value >= 0 ? "bg-[var(--color-primary)]" : "bg-red-500") : (w.value >= 0 ? "bg-green-500" : "bg-red-400");
            return (
              <div key={w.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={w.kind === "step" ? "text-[var(--color-muted)]" : "font-semibold"}>{w.label}</span>
                  <span className={`tabular-nums font-semibold ${isStep ? (w.value >= 0 ? "text-green-400" : "text-red-400") : ""}`}>{isStep && w.value >= 0 ? "+" : isStep ? "−" : ""}{formatCurrency(isStep ? Math.abs(w.value) : w.value)}</span>
                </div>
                <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, Math.abs(w.value) / maxAbs * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Price flows straight to profit; volume scales contribution at current margin; cost change hits COGS. Base COGS is an assumption - adjust above. Indicative model.</p>
    </div>
  );
}

// ── #142 PREDICTIVE CHURN / LATE-PAYMENT FLAGS ──────────────────────────────────
function ChurnFlagsTab() {
  const { store } = useApp();
  const { transactions, invoices } = store;
  const now = new Date();

  // Customer churn risk from revenue recency/frequency.
  const churnRisk = useMemo(() => {
    const acc: Record<string, { name: string; txns: number; last: string; first: string; revenue: number }> = {};
    transactions.filter(t => t.amount > 0 && t.counterparty && t.category !== "transfer").forEach(t => {
      const k = t.counterparty;
      if (!acc[k]) acc[k] = { name: k, txns: 0, last: t.date, first: t.date, revenue: 0 };
      acc[k].txns += 1; acc[k].revenue += t.amount;
      if (t.date > acc[k].last) acc[k].last = t.date;
      if (t.date < acc[k].first) acc[k].first = t.date;
    });
    return Object.values(acc).map(c => {
      const daysSince = Math.round((now.getTime() - parseISO(c.last).getTime()) / (1000 * 60 * 60 * 24));
      const spanDays = Math.max(1, Math.round((parseISO(c.last).getTime() - parseISO(c.first).getTime()) / (1000 * 60 * 60 * 24)));
      const cadence = spanDays / Math.max(1, c.txns); // avg days between purchases
      // Risk: overdue relative to own cadence, low frequency, long absence.
      let score = 0;
      if (daysSince > 90) score += 40; else if (daysSince > 60) score += 25; else if (daysSince > cadence * 2) score += 20;
      if (c.txns <= 1) score += 25;
      if (daysSince > cadence * 1.5) score += 15;
      score = Math.min(100, score);
      const level = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
      return { ...c, daysSince, cadence: Math.round(cadence), score, level };
    }).filter(c => c.score >= 30).sort((a, b) => b.score - a.score);
  }, [transactions]);

  // Late-payment flags from invoices.
  const lateRisk = useMemo(() => {
    return invoices.map(inv => {
      const due = parseISO(inv.dueDate);
      const daysToDue = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const overdueDays = inv.status === "paid" ? 0 : Math.max(0, -daysToDue);
      let score = 0;
      if (inv.status === "overdue") score += 45;
      if (overdueDays > 30) score += 30; else if (overdueDays > 0) score += 15;
      else if (daysToDue <= 5 && inv.status !== "paid") score += 15; // due very soon, still open
      // Prior bad behaviour: any other overdue invoice from same customer.
      const priorOverdue = invoices.some(o => o.customer === inv.customer && o.id !== inv.id && o.status === "overdue");
      if (priorOverdue) score += 20;
      score = Math.min(100, score);
      return { ...inv, daysToDue, overdueDays, score, level: score >= 60 ? "High" : score >= 30 ? "Medium" : "Low" };
    }).filter(i => i.status !== "paid" && i.score >= 30).sort((a, b) => b.score - a.score);
  }, [invoices]);

  const exposureAtRisk = lateRisk.reduce((s, i) => s + i.amount, 0);
  const revenueAtRisk = churnRisk.filter(c => c.level === "High").reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Churn-risk accounts" value={churnRisk.length.toString()} color={churnRisk.length ? "text-yellow-400" : "text-green-400"} />
        <MetricCard label="High-churn revenue" value={formatCurrency(revenueAtRisk)} color="text-red-400" note="From High-risk customers" />
        <MetricCard label="Late-payment flags" value={lateRisk.length.toString()} color={lateRisk.length ? "text-yellow-400" : "text-green-400"} />
        <MetricCard label="Exposure at risk" value={formatCurrency(exposureAtRisk)} color="text-red-400" note="Open invoice value flagged" />
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2"><AlertTriangle size={14} className="text-yellow-400" /><p className="text-sm font-semibold">Customers likely to churn</p></div>
        {churnRisk.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No churn signals - customers are buying on cadence.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Customer", "Revenue", "Orders", "Cadence", "Last seen", "Risk"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {churnRisk.slice(0, 20).map(c => (
                  <tr key={c.name} className="hover:bg-white/2 text-xs">
                    <td data-label="Customer" className="px-4 py-2.5 font-medium truncate max-w-[180px]">{c.name}</td>
                    <td data-label="Revenue" className="px-4 py-2.5 text-right tabular-nums text-green-400">{formatAmount(c.revenue)}</td>
                    <td data-label="Orders" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.txns}</td>
                    <td data-label="Cadence" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">~{c.cadence}d</td>
                    <td data-label="Last seen" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{c.daysSince}d ago</td>
                    <td data-label="Risk" className="px-4 py-2.5 text-right"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.level === "High" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>{c.level} · {c.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2"><AlertTriangle size={14} className="text-red-400" /><p className="text-sm font-semibold">Invoices likely to pay late</p></div>
        {lateRisk.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No late-payment risk on open invoices.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Customer", "Invoice", "Amount", "Due", "Status", "Risk"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {lateRisk.slice(0, 20).map(inv => (
                  <tr key={inv.id} className="hover:bg-white/2 text-xs">
                    <td data-label="Customer" className="px-4 py-2.5 font-medium truncate max-w-[160px]">{inv.customer}</td>
                    <td data-label="Invoice" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{inv.invoiceNumber ?? inv.id.slice(0, 6)}</td>
                    <td data-label="Amount" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(inv.amount)}</td>
                    <td data-label="Due" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{inv.overdueDays > 0 ? `${inv.overdueDays}d overdue` : `in ${inv.daysToDue}d`}</td>
                    <td data-label="Status" className="px-4 py-2.5 text-right"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${inv.status === "overdue" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>{inv.status}</span></td>
                    <td data-label="Risk" className="px-4 py-2.5 text-right"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${inv.level === "High" ? "bg-red-900/30 text-red-400" : "bg-yellow-900/30 text-yellow-400"}`}>{inv.level} · {inv.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Heuristic scores from observed recency/frequency and invoice aging - not an ML model. Use as a prioritised follow-up list, not a guarantee.</p>
    </div>
  );
}

// Shared: build a trailing N-month window from a base date.
function trailingMonths(n: number, base: Date) {
  return Array.from({ length: n }, (_, i) => {
    const d = subMonths(base, n - 1 - i);
    return {
      label: format(d, "MMM"),
      full: format(d, "MMM yy"),
      start: startOfMonth(d).toISOString().split("T")[0],
      end: endOfMonth(d).toISOString().split("T")[0],
    };
  });
}

// ── #11 GROSS & NET MARGIN TRENDS ───────────────────────────────────────────────
function MarginTrendsTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: assumed direct-cost (COGS) share of revenue used to derive gross margin.
  const [cogsPct, setCogsPct] = useFeatureState("anl-mt-cogs-pct", 60);

  const data = useMemo(() => {
    return trailingMonths(12, now).map(m => {
      const mTxns = transactions.filter(t => t.date >= m.start && t.date <= m.end && t.category !== "transfer");
      const revenue = mTxns.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
      const expense = Math.abs(mTxns.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
      const cogs = revenue * (cogsPct / 100);
      const grossPct = revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 100) : 0;
      const netPct = revenue > 0 ? Math.round(((revenue - expense) / revenue) * 100) : 0;
      return { month: m.label, revenue, gross: grossPct, net: netPct };
    });
  }, [transactions, cogsPct]);

  const live = data.filter(d => d.revenue > 0);
  const avgGross = live.length ? Math.round(live.reduce((s, d) => s + d.gross, 0) / live.length) : 0;
  const avgNet = live.length ? Math.round(live.reduce((s, d) => s + d.net, 0) / live.length) : 0;
  const curr = data[data.length - 1];
  const prev = data[data.length - 2];
  const netTrend = curr && prev ? curr.net - prev.net : 0;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <Percent size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Margin trends</p>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="text-[var(--color-muted)]">Assumed COGS % of revenue</label>
          <input type="number" min={0} max={100} value={cogsPct} onChange={e => setCogsPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={`${ANALYTICS_INPUT} w-20`} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Avg gross margin" value={`${avgGross}%`} color={avgGross >= 40 ? "text-green-400" : "text-yellow-400"} note="12-month average" />
        <MetricCard label="Avg net margin" value={`${avgNet}%`} color={avgNet >= 10 ? "text-green-400" : avgNet >= 0 ? "text-yellow-400" : "text-red-400"} note="After all expenses" />
        <MetricCard label="This month net" value={`${curr?.net ?? 0}%`} color={(curr?.net ?? 0) >= 0 ? "text-green-400" : "text-red-400"} />
        <MetricCard label="Net margin trend" value={`${netTrend >= 0 ? "+" : ""}${netTrend} pts`} color={netTrend >= 0 ? "text-green-400" : "text-red-400"} note="vs previous month" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Gross vs net margin % · 12 months</p>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={42} />
            <Tooltip formatter={(v: number, n: string) => [`${v}%`, n]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="gross" name="Gross margin" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="net" name="Net margin" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5 bg-green-500" /> Gross margin</div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5" style={{ background: "var(--color-primary)" }} /> Net margin</div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Gross margin uses an assumed direct-cost (COGS) share; net margin is revenue minus all recorded expenses. A widening gross-net gap signals rising overheads. Indicative.</p>
    </div>
  );
}

// ── #12 EXPENSE-RATIO TRENDS (% of revenue) ─────────────────────────────────────
function ExpenseRatiosTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  const CATS: { key: string; label: string; color: string }[] = [
    { key: "expense", label: "Operating", color: CATEGORY_COLORS.expense },
    { key: "payroll", label: "Payroll", color: CATEGORY_COLORS.payroll },
    { key: "tax", label: "Taxes", color: CATEGORY_COLORS.tax },
    { key: "loan", label: "Loan", color: CATEGORY_COLORS.loan },
  ];

  const data = useMemo(() => {
    return trailingMonths(12, now).map(m => {
      const mTxns = transactions.filter(t => t.date >= m.start && t.date <= m.end);
      const revenue = mTxns.filter(t => t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
      const row: Record<string, number | string> = { month: m.label };
      CATS.forEach(c => {
        const spend = Math.abs(mTxns.filter(t => t.amount < 0 && t.category === c.key).reduce((s, t) => s + t.amount, 0));
        row[c.key] = revenue > 0 ? Math.round((spend / revenue) * 100) : 0;
      });
      return row;
    });
  }, [transactions]);

  const live = data.filter(d => CATS.some(c => (d[c.key] as number) > 0));
  const avgFor = (k: string) => live.length ? Math.round(live.reduce((s, d) => s + (d[k] as number), 0) / live.length) : 0;
  const totalRatio = CATS.reduce((s, c) => s + avgFor(c.key), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CATS.map(c => (
          <MetricCard key={c.key} label={`${c.label} / Revenue`} value={`${avgFor(c.key)}%`} color={avgFor(c.key) <= 40 ? "text-green-400" : avgFor(c.key) <= 60 ? "text-yellow-400" : "text-red-400"} note="12-month average" />
        ))}
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4"><Activity size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Expense ratios · % of revenue, stacked</p></div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={42} />
            <Tooltip formatter={(v: number, n: string) => [`${v}%`, n]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
            {CATS.map(c => (
              <Area key={c.key} type="monotone" dataKey={c.key} name={c.label} stackId="1" stroke={c.color} fill={c.color} fillOpacity={0.35} strokeWidth={1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          {CATS.map(c => <div key={c.key} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} /> {c.label}</div>)}
        </div>
      </div>

      <div className={`${ANALYTICS_CARD} px-4 py-2.5 text-[11px] text-[var(--color-muted)]`}>
        Total tracked cost ≈ <span className="font-semibold text-[var(--color-text)]">{totalRatio}%</span> of revenue on average. Rising ratios mean costs growing faster than sales. Compare against the Benchmarks tab for sector reference figures.
      </div>
    </div>
  );
}

// ── #13 ACCOUNTS-RECEIVABLE AGEING ──────────────────────────────────────────────
function ArAgeingTab() {
  const { store } = useApp();
  const { invoices, transactions } = store;
  const now = new Date();

  const { buckets, rows, totalOpen, dso } = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const defs = [
      { key: "0-30", label: "0-30 days", min: 0, max: 30, color: "#22c55e" },
      { key: "31-60", label: "31-60 days", min: 31, max: 60, color: "#eab308" },
      { key: "61-90", label: "61-90 days", min: 61, max: 90, color: "#f97316" },
      { key: "90+", label: "90+ days", min: 91, max: Infinity, color: "#ef4444" },
    ];
    const b = defs.map(d => ({ ...d, amount: 0, count: 0 }));
    const detail = open.map(inv => {
      const due = parseISO(inv.dueDate);
      const overdue = Math.max(0, Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
      const idx = b.findIndex(x => overdue >= x.min && overdue <= x.max);
      const slot = idx >= 0 ? idx : 0;
      b[slot].amount += inv.amount;
      b[slot].count += 1;
      return { ...inv, overdue, bucket: b[slot].label, color: b[slot].color };
    }).sort((x, y) => y.overdue - x.overdue);

    const open0 = b.reduce((s, x) => s + x.amount, 0);
    // DSO = receivables ÷ avg daily revenue (trailing ~6 months of revenue txns).
    const winStart = startOfMonth(subMonths(now, 5)).toISOString().split("T")[0];
    const rev = transactions.filter(t => t.amount > 0 && t.category === "revenue" && t.date >= winStart).reduce((s, t) => s + t.amount, 0);
    const dailyRev = rev / 180;
    return { buckets: b, rows: detail, totalOpen: open0, dso: dailyRev > 0 ? Math.round(open0 / dailyRev) : null };
  }, [invoices, transactions]);

  const overdueAmt = buckets.filter(b => b.key !== "0-30").reduce((s, b) => s + b.amount, 0);
  const pie = buckets.filter(b => b.amount > 0).map(b => ({ name: b.label, value: Math.round(b.amount), color: b.color }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total receivables" value={formatCurrency(totalOpen)} color="text-[var(--color-primary)]" note={`${rows.length} open invoices`} />
        <MetricCard label="Overdue (>30d)" value={formatCurrency(overdueAmt)} color={overdueAmt > 0 ? "text-red-400" : "text-green-400"} note={totalOpen > 0 ? `${Math.round((overdueAmt / totalOpen) * 100)}% of AR` : ""} />
        <MetricCard label="90+ days" value={formatCurrency(buckets[3].amount)} color={buckets[3].amount > 0 ? "text-red-400" : "text-green-400"} note="Provisioning candidate" />
        <MetricCard label="DSO" value={dso !== null ? `${dso} days` : "-"} color={dso !== null && dso <= 45 ? "text-green-400" : dso !== null && dso <= 60 ? "text-yellow-400" : "text-red-400"} note="Target ≤ 45 days" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${ANALYTICS_CARD} p-5`}>
          <div className="flex items-center gap-2 mb-4"><Receipt size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Ageing buckets</p></div>
          {totalOpen === 0 ? <p className="text-sm text-[var(--color-muted)]">No open invoices - all receivables collected.</p> : (
            <div className="space-y-3">
              {buckets.map(b => {
                const pct = totalOpen > 0 ? Math.round((b.amount / totalOpen) * 100) : 0;
                return (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--color-muted)]">{b.label} <span className="ml-1 opacity-70">({b.count})</span></span>
                      <span className="tabular-nums font-semibold">{formatAmount(b.amount)} · {pct}%</span>
                    </div>
                    <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${ANALYTICS_CARD} p-5`}>
          <p className="text-sm font-semibold mb-4">Receivables split</p>
          {pie.length === 0 ? <div className="flex items-center justify-center h-[180px] text-sm text-[var(--color-muted)]">No receivables</div> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {pie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatAmount(v), ""]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Open invoices by age</p></div>
        {rows.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No open invoices to age.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Customer", "Invoice", "Amount", "Due in / overdue", "Bucket"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.slice(0, 25).map(inv => (
                  <tr key={inv.id} className="hover:bg-white/2 text-xs">
                    <td data-label="Customer" className="px-4 py-2.5 font-medium truncate max-w-[160px]">{inv.customer}</td>
                    <td data-label="Invoice" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{inv.invoiceNumber ?? inv.id.slice(0, 6)}</td>
                    <td data-label="Amount" className="px-4 py-2.5 text-right tabular-nums text-green-400 font-semibold">{formatAmount(inv.amount)}</td>
                    <td data-label="Due in / overdue" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{inv.overdue > 0 ? `${inv.overdue}d overdue` : "not due"}</td>
                    <td data-label="Bucket" className="px-4 py-2.5 text-right"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${inv.color}22`, color: inv.color }}>{inv.bucket}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Ageing is measured from each invoice's due date to today. DSO ≈ open receivables ÷ average daily revenue (trailing 6 months). Invoices 90+ days overdue are typical provisioning candidates.</p>
    </div>
  );
}

// ── #14 BREAK-EVEN & CONTRIBUTION MARGIN ────────────────────────────────────────
function BreakEvenTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: what share of operating expense is treated as fixed (rest is variable).
  const [fixedSharePct, setFixedSharePct] = useFeatureState("anl-be-fixed-pct", 55);

  const m = useMemo(() => {
    const winStart = startOfMonth(subMonths(now, 5)).toISOString().split("T")[0];
    const win = transactions.filter(t => t.date >= winStart && t.category !== "transfer");
    const revenue = win.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const totalCost = Math.abs(win.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
    const months = 6;
    const monthlyRev = revenue / months;
    const monthlyCost = totalCost / months;
    // Payroll + a share of opex are treated as fixed; the rest variable.
    const payroll = Math.abs(win.filter(t => t.amount < 0 && t.category === "payroll").reduce((s, t) => s + t.amount, 0)) / months;
    const nonPayroll = monthlyCost - payroll;
    const fixed = payroll + nonPayroll * (fixedSharePct / 100);
    const variable = nonPayroll * (1 - fixedSharePct / 100);
    const cmRatio = monthlyRev > 0 ? (monthlyRev - variable) / monthlyRev : 0; // contribution margin ratio
    const breakEven = cmRatio > 0 ? fixed / cmRatio : null;
    const marginOfSafety = breakEven !== null && monthlyRev > 0 ? Math.round(((monthlyRev - breakEven) / monthlyRev) * 100) : null;
    return { monthlyRev, monthlyCost, fixed, variable, cmRatio, breakEven, marginOfSafety, contribution: monthlyRev - variable };
  }, [transactions, fixedSharePct]);

  const chartData = trailingMonths(6, now).map(mo => {
    const mTxns = transactions.filter(t => t.date >= mo.start && t.date <= mo.end && t.category !== "transfer");
    const revenue = mTxns.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    return { month: mo.label, revenue: Math.round(revenue), breakEven: m.breakEven !== null ? Math.round(m.breakEven) : 0 };
  });

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <Scale size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Cost-structure assumption</p>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="text-[var(--color-muted)]">Fixed share of non-payroll cost</label>
          <input type="number" min={0} max={100} value={fixedSharePct} onChange={e => setFixedSharePct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} className={`${ANALYTICS_INPUT} w-20`} />
          <span className="text-[var(--color-muted)]">%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Monthly fixed cost" value={formatCurrency(m.fixed)} color="text-orange-400" note="Payroll + fixed opex" />
        <MetricCard label="Contribution margin" value={`${Math.round(m.cmRatio * 100)}%`} color={m.cmRatio >= 0.4 ? "text-green-400" : "text-yellow-400"} note={`${formatAmount(m.contribution)}/mo`} />
        <MetricCard label="Break-even revenue" value={m.breakEven !== null ? formatCurrency(m.breakEven) : "-"} color="text-[var(--color-primary)]" note="Per month" />
        <MetricCard label="Margin of safety" value={m.marginOfSafety !== null ? `${m.marginOfSafety}%` : "-"} color={m.marginOfSafety !== null && m.marginOfSafety >= 20 ? "text-green-400" : m.marginOfSafety !== null && m.marginOfSafety >= 0 ? "text-yellow-400" : "text-red-400"} note="Above break-even" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Actual revenue vs break-even line · 6 months</p>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.revenue >= d.breakEven ? "#22c55e" : "#ef4444"} />)}
            </Bar>
            <Line type="monotone" dataKey="breakEven" name="Break-even" stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Green months clear break-even; red months fall short. The dashed line is the monthly break-even revenue at current cost structure.</p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Break-even = fixed cost ÷ contribution-margin ratio. Payroll is treated as fixed; the remaining opex is split fixed/variable by your assumption above. Figures are monthly averages over the trailing 6 months. Indicative.</p>
    </div>
  );
}

// ── #15 WORKING-CAPITAL CYCLE (DSO / DPO / CCC) ─────────────────────────────────
function WorkingCapitalTab() {
  const { store } = useApp();
  const { transactions, invoices } = store;
  const now = new Date();
  // Durable: assumed inventory days when no inventory turnover data exists.
  const [invDays, setInvDays] = useFeatureState("anl-wc-inv-days", 30);

  const series = useMemo(() => {
    return trailingMonths(12, now).map(mo => {
      const endD = parseISO(mo.end);
      // Open receivables as at month end.
      const recv = invoices.filter(i => i.status !== "paid" && parseISO(i.invoiceDate) <= endD).reduce((s, i) => s + i.amount, 0);
      // Trailing 6-month revenue & expense up to month end → daily run rates.
      const winStart = startOfMonth(subMonths(endD, 5)).toISOString().split("T")[0];
      const rev = transactions.filter(t => t.amount > 0 && t.category === "revenue" && t.date >= winStart && t.date <= mo.end).reduce((s, t) => s + t.amount, 0);
      const purch = Math.abs(transactions.filter(t => t.amount < 0 && t.category === "expense" && t.date >= winStart && t.date <= mo.end).reduce((s, t) => s + t.amount, 0));
      const dailyRev = rev / 180;
      const dailyPurch = purch / 180;
      const payables = dailyPurch * 30; // proxy: ~30 days of purchases outstanding
      const dso = dailyRev > 0 ? Math.round(recv / dailyRev) : 0;
      const dpo = dailyPurch > 0 ? Math.round(payables / dailyPurch) : 0;
      const ccc = dso + invDays - dpo;
      return { month: mo.label, dso, dio: invDays, dpo, ccc };
    });
  }, [transactions, invoices, invDays]);

  const curr = series[series.length - 1] ?? { dso: 0, dio: invDays, dpo: 0, ccc: 0 };

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4 flex items-center gap-2 flex-wrap`}>
        <Wallet size={14} className="text-[var(--color-primary)]" />
        <p className="text-sm font-semibold">Working-capital cycle</p>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="text-[var(--color-muted)]">Assumed inventory days (DIO)</label>
          <input type="number" min={0} max={365} value={invDays} onChange={e => setInvDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))} className={`${ANALYTICS_INPUT} w-20`} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="DSO" value={`${curr.dso} days`} color={curr.dso <= 45 ? "text-green-400" : "text-yellow-400"} note="Days sales outstanding" />
        <MetricCard label="DIO" value={`${curr.dio} days`} color="text-[var(--color-muted)]" note="Days inventory (assumed)" />
        <MetricCard label="DPO" value={`${curr.dpo} days`} color="text-[var(--color-text)]" note="Days payable outstanding" />
        <MetricCard label="Cash conversion cycle" value={`${curr.ccc} days`} color={curr.ccc <= 30 ? "text-green-400" : curr.ccc <= 60 ? "text-yellow-400" : "text-red-400"} note="DSO + DIO − DPO" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Cash conversion cycle trend · 12 months</p>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} width={42} />
            <Tooltip formatter={(v: number, n: string) => [`${v} days`, n]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="dso" name="DSO" stroke="#22c55e" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="dpo" name="DPO" stroke="#f97316" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="ccc" name="CCC" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5 bg-green-500" /> DSO</div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5 bg-orange-500" /> DPO</div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"><div className="w-4 h-0.5" style={{ background: "var(--color-primary)" }} /> Cash conversion cycle</div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />A shorter cash conversion cycle frees up working capital. DSO from open invoices vs revenue run-rate; DPO proxied from purchase run-rate; DIO is your assumption. A negative CCC means suppliers fund your sales cycle. Indicative.</p>
    </div>
  );
}

// ── #16 SEASONALITY & DAY-OF-WEEK SALES ─────────────────────────────────────────
function SeasonalityTab() {
  const { store } = useApp();
  const { transactions } = store;

  const { dow, monthIdx, peakDay, peakMonth } = useMemo(() => {
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dowSum = new Array(7).fill(0) as number[];
    const dowCnt = new Array(7).fill(0) as number[];
    const monSum = new Array(12).fill(0) as number[];
    const monCnt = new Array(12).fill(0) as number[];
    transactions.filter(t => t.amount > 0 && t.category === "revenue").forEach(t => {
      const d = parseISO(t.date);
      dowSum[d.getDay()] += t.amount; dowCnt[d.getDay()] += 1;
      monSum[d.getMonth()] += t.amount; monCnt[d.getMonth()] += 1;
    });
    const dowMax = Math.max(...dowSum, 1);
    const dowRows = DOW.map((label, i) => ({ label, total: dowSum[i], count: dowCnt[i], intensity: Math.round((dowSum[i] / dowMax) * 100) }));
    const monAvgAll = monSum.reduce((s, v) => s + v, 0) / Math.max(1, monSum.filter(v => v > 0).length);
    const monRows = MON.map((label, i) => ({ label, total: monSum[i], count: monCnt[i], index: monAvgAll > 0 && monSum[i] > 0 ? Math.round((monSum[i] / monAvgAll) * 100) : 0 }));
    const pDay = dowRows.reduce((a, b) => b.total > a.total ? b : a, dowRows[0]);
    const activeMon = monRows.filter(m => m.total > 0);
    const pMon = activeMon.length ? activeMon.reduce((a, b) => b.total > a.total ? b : a, activeMon[0]) : null;
    return { dow: dowRows, monthIdx: monRows, peakDay: pDay, peakMonth: pMon };
  }, [transactions]);

  const heatColor = (v: number) => v >= 75 ? "#22c55e" : v >= 50 ? "#84cc16" : v >= 25 ? "#eab308" : v > 0 ? "#f97316" : "var(--color-bg)";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Peak day" value={peakDay?.label ?? "-"} color="text-green-400" note={peakDay ? formatAmount(peakDay.total) : ""} />
        <MetricCard label="Peak month" value={peakMonth?.label ?? "-"} color="text-green-400" note={peakMonth ? `index ${peakMonth.index}` : ""} />
        <MetricCard label="Weekend share" value={`${(() => { const wk = dow[0].total + dow[6].total; const tot = dow.reduce((s, d) => s + d.total, 0); return tot > 0 ? Math.round((wk / tot) * 100) : 0; })()}%`} color="text-[var(--color-text)]" note="Sat + Sun revenue" />
        <MetricCard label="Revenue days" value={dow.reduce((s, d) => s + d.count, 0).toString()} color="text-[var(--color-primary)]" note="Transactions analysed" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4"><CalendarDays size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Revenue by day of week · heat intensity</p></div>
        <div className="grid grid-cols-7 gap-2">
          {dow.map(d => (
            <div key={d.label} className="text-center">
              <div className="h-16 rounded-lg flex items-center justify-center text-[10px] font-semibold text-[var(--color-bg)]" style={{ background: heatColor(d.intensity) }}>{d.intensity > 0 ? `${d.intensity}%` : ""}</div>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">{d.label}</p>
              <p className="text-[10px] tabular-nums">{formatAmount(d.total)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Monthly seasonality index (100 = average month)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthIdx} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip formatter={(v: number) => [`index ${v}`, "Seasonality"]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="index" name="Index" radius={[3, 3, 0, 0]}>
              {monthIdx.map((m, i) => <Cell key={i} fill={m.index >= 100 ? "#22c55e" : m.index > 0 ? "#f97316" : "var(--color-border)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Day-of-week heat normalises against your busiest day; the monthly index compares each calendar month to your average active month (100 = average). Use peaks to plan staffing, stock and promotions.</p>
    </div>
  );
}

// ── #17 REFUND & DISCOUNT IMPACT ────────────────────────────────────────────────
function RefundImpactTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  const RX = /refund|return|credit note|chargeback|reversal|discount|rebate|cashback|waiver|adjustment/i;

  const data = useMemo(() => {
    return trailingMonths(12, now).map(mo => {
      const mTxns = transactions.filter(t => t.date >= mo.start && t.date <= mo.end);
      const grossRev = mTxns.filter(t => t.amount > 0 && t.category === "revenue").reduce((s, t) => s + t.amount, 0);
      // Refunds = negative revenue txns OR any txn whose text matches refund/discount terms.
      const refunds = Math.abs(mTxns.filter(t => (t.category === "revenue" && t.amount < 0) || (t.amount < 0 && RX.test(`${t.description} ${t.counterparty}`))).reduce((s, t) => s + t.amount, 0));
      const net = grossRev - refunds;
      return { month: mo.label, gross: Math.round(grossRev), refunds: Math.round(refunds), net: Math.round(net), rate: grossRev > 0 ? Math.round((refunds / grossRev) * 100) : 0 };
    });
  }, [transactions]);

  const flagged = useMemo(() => transactions.filter(t => (t.category === "revenue" && t.amount < 0) || (t.amount < 0 && RX.test(`${t.description} ${t.counterparty}`)))
    .map(t => ({ ...t, abs: Math.abs(t.amount) })).sort((a, b) => b.abs - a.abs).slice(0, 15), [transactions]);

  const totalGross = data.reduce((s, d) => s + d.gross, 0);
  const totalRefund = data.reduce((s, d) => s + d.refunds, 0);
  const rate = totalGross > 0 ? Math.round((totalRefund / totalGross) * 100) : 0;
  const avgMonthly = totalRefund / 12;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Gross revenue (12m)" value={formatCurrency(totalGross)} color="text-green-400" />
        <MetricCard label="Refunds & discounts" value={formatCurrency(totalRefund)} color={totalRefund > 0 ? "text-red-400" : "text-green-400"} note={`${flagged.length} items`} />
        <MetricCard label="Leakage rate" value={`${rate}%`} color={rate <= 3 ? "text-green-400" : rate <= 8 ? "text-yellow-400" : "text-red-400"} note="Of gross revenue" />
        <MetricCard label="Avg / month" value={formatCurrency(avgMonthly)} color="text-orange-400" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <div className="flex items-center gap-2 mb-4"><Tag size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Gross vs net revenue · refund impact</p></div>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={data} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <YAxis yAxisId="r" orientation="right" domain={[0, "auto"]} tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={38} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="l" dataKey="net" name="Net revenue" stackId="r" fill="#22c55e" radius={[0, 0, 0, 0]} />
            <Bar yAxisId="l" dataKey="refunds" name="Refunds & discounts" stackId="r" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="rate" name="Leakage %" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className={`${ANALYTICS_CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Largest refunds & discounts</p></div>
        {flagged.length === 0 ? <p className="p-6 text-sm text-[var(--color-muted)] text-center">No refunds or discounts detected in your transactions.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px] rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Date", "Description", "Counterparty", "Amount"].map((h, i) => <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {flagged.map(t => (
                  <tr key={t.id} className="hover:bg-white/2 text-xs">
                    <td data-label="Date" className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{t.date}</td>
                    <td data-label="Description" className="px-4 py-2.5 font-medium truncate max-w-[200px]">{t.description}</td>
                    <td data-label="Counterparty" className="px-4 py-2.5 text-[var(--color-muted)] truncate max-w-[140px]">{t.counterparty || "-"}</td>
                    <td data-label="Amount" className="px-4 py-2.5 text-right tabular-nums text-red-400 font-semibold">({formatAmount(t.abs)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Detects negative revenue entries and outflows whose text mentions refund, return, credit note, discount, rebate or similar. A leakage rate above ~5% of gross revenue usually warrants a pricing or returns-policy review. Indicative.</p>
    </div>
  );
}

// ── #18 PROFIT & REVENUE PER EMPLOYEE ───────────────────────────────────────────
function PerEmployeeTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: headcount (no HR module) and benchmark revenue/employee.
  const [headcount, setHeadcount] = useFeatureState("anl-pe-headcount", 0);
  const [benchmark, setBenchmark] = useFeatureState("anl-pe-benchmark", 1500000);

  const annual = useMemo(() => {
    const winStart = startOfMonth(subMonths(now, 11)).toISOString().split("T")[0];
    const win = transactions.filter(t => t.date >= winStart && t.category !== "transfer");
    const months = 12;
    const revenue = win.filter(t => t.amount > 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0);
    const expense = Math.abs(win.filter(t => t.amount < 0 && t.category !== "transfer").reduce((s, t) => s + t.amount, 0));
    const payroll = Math.abs(win.filter(t => t.amount < 0 && t.category === "payroll").reduce((s, t) => s + t.amount, 0));
    const profit = revenue - expense;
    const scale = 12 / months;
    return { revenue: revenue * scale, profit: profit * scale, payroll: payroll * scale };
  }, [transactions]);

  const hc = Math.max(0, headcount);
  const revPer = hc > 0 ? annual.revenue / hc : null;
  const profitPer = hc > 0 ? annual.profit / hc : null;
  const payrollPer = hc > 0 ? annual.payroll / hc : null;
  const ratioVsBench = revPer !== null && benchmark > 0 ? Math.round((revPer / benchmark) * 100) : null;
  // Payroll efficiency: revenue generated per ₹1 of payroll.
  const payrollMultiple = annual.payroll > 0 ? annual.revenue / annual.payroll : null;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2 mb-3"><Briefcase size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Headcount &amp; benchmark</p></div>
        <div className="grid grid-cols-2 gap-3 text-xs max-w-md">
          <label className="block"><span className="text-[var(--color-muted)] block mb-1">Total employees</span><input type="number" min={0} value={headcount} onChange={e => setHeadcount(Math.max(0, parseInt(e.target.value) || 0))} className={`${ANALYTICS_INPUT} w-full`} /></label>
          <label className="block"><span className="text-[var(--color-muted)] block mb-1">Benchmark revenue / employee (₹)</span><input type="number" min={0} value={benchmark} onChange={e => setBenchmark(Math.max(0, parseInt(e.target.value) || 0))} className={`${ANALYTICS_INPUT} w-full`} /></label>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">No HR module exists, so enter your headcount to compute per-employee productivity. Revenue and profit are annualised from the trailing 12 months.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Revenue / employee" value={revPer !== null ? formatCurrency(revPer) : "-"} color="text-green-400" note="Annualised" />
        <MetricCard label="Profit / employee" value={profitPer !== null ? formatCurrency(profitPer) : "-"} color={profitPer !== null && profitPer >= 0 ? "text-green-400" : "text-red-400"} note="Annualised" />
        <MetricCard label="Payroll / employee" value={payrollPer !== null ? formatCurrency(payrollPer) : "-"} color="text-orange-400" note="Avg cost" />
        <MetricCard label="Revenue per ₹ payroll" value={payrollMultiple !== null ? `${payrollMultiple.toFixed(2)}x` : "-"} color={payrollMultiple !== null && payrollMultiple >= 3 ? "text-green-400" : "text-yellow-400"} note="≥ 3x is healthy" />
      </div>

      {revPer !== null && ratioVsBench !== null && (
        <div className={`${ANALYTICS_CARD} p-5`}>
          <p className="text-sm font-semibold mb-3">Revenue per employee vs benchmark</p>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Your firm</span><span className="tabular-nums font-semibold text-green-400">{formatCurrency(revPer)}</span></div>
              <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className={`h-full rounded-full ${ratioVsBench >= 100 ? "bg-green-500" : "bg-yellow-500"}`} style={{ width: `${Math.min(100, ratioVsBench)}%` }} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1"><span className="text-[var(--color-muted)]">Benchmark</span><span className="tabular-nums font-semibold">{formatCurrency(benchmark)}</span></div>
              <div className="h-3 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[var(--color-border)]" style={{ width: "100%" }} /></div>
            </div>
          </div>
          <p className={`text-xs mt-3 font-semibold ${ratioVsBench >= 100 ? "text-green-400" : "text-yellow-400"}`}>
            You are at {ratioVsBench}% of the benchmark{ratioVsBench >= 100 ? " - above peer productivity." : " - room to improve output per head."}
          </p>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Per-employee metrics annualise the trailing 12 months and divide by your entered headcount. The benchmark is a reference figure you set, not live peer data. Useful for tracking productivity as you hire. Indicative.</p>
    </div>
  );
}

// ── #100 YEAR-OVER-YEAR GROWTH DECOMPOSITION ────────────────────────────────────
function YoYGrowthTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: how many trailing months to decompose (3 / 6 / 12).
  const [yWin, setYWin] = useFeatureState<"3" | "6" | "12">("anl-yoy-window", "6");
  const winN = Number(yWin);

  const rows = useMemo(() => {
    return Array.from({ length: winN }, (_, i) => {
      const d = subMonths(now, winN - 1 - i);
      const py = subYears(d, 1);
      const curStart = startOfMonth(d).toISOString().split("T")[0];
      const curEnd = endOfMonth(d).toISOString().split("T")[0];
      const pyStart = startOfMonth(py).toISOString().split("T")[0];
      const pyEnd = endOfMonth(py).toISOString().split("T")[0];
      const rev = (s: string, e: string) => transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.date >= s && t.date <= e).reduce((a, t) => a + t.amount, 0);
      const cur = rev(curStart, curEnd);
      const prior = rev(pyStart, pyEnd);
      const growthPct = prior > 0 ? Math.round(((cur - prior) / prior) * 100) : null;
      return { month: format(d, "MMM yy"), cur, prior, abs: cur - prior, growthPct };
    });
  }, [transactions, winN]);

  const totCur = rows.reduce((s, r) => s + r.cur, 0);
  const totPrior = rows.reduce((s, r) => s + r.prior, 0);
  const totGrowthAbs = totCur - totPrior;
  const totGrowthPct = totPrior > 0 ? Math.round((totGrowthAbs / totPrior) * 100) : null;
  const hasPrior = totPrior > 0;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Year-over-year revenue growth</p></div>
          <div className="flex gap-1">
            {(["3", "6", "12"] as const).map(w => (
              <button key={w} onClick={() => setYWin(w)} className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${yWin === w ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{w}M</button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Each month compared to the same calendar month one year earlier. Needs at least 13 months of transaction history to be meaningful.</p>
      </div>

      {!hasPrior ? (
        <div className={`${ANALYTICS_CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No prior-year revenue in this window. Once you have transactions spanning more than a year, YoY growth appears here.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="This period revenue" value={formatCurrency(totCur)} color="text-green-400" note={`Trailing ${winN} months`} />
            <MetricCard label="Same period last year" value={formatCurrency(totPrior)} color="text-[var(--color-muted)]" note="Prior-year baseline" />
            <MetricCard label="Absolute growth" value={`${totGrowthAbs >= 0 ? "+" : "−"}${formatCurrency(Math.abs(totGrowthAbs))}`} color={totGrowthAbs >= 0 ? "text-green-400" : "text-red-400"} note="YoY rupee change" />
            <MetricCard label="Growth rate" value={totGrowthPct !== null ? `${totGrowthPct >= 0 ? "+" : ""}${totGrowthPct}%` : "-"} color={totGrowthPct !== null && totGrowthPct >= 0 ? "text-green-400" : "text-red-400"} note="YoY %" />
          </div>

          <div className={`${ANALYTICS_CARD} p-5`}>
            <p className="text-sm font-semibold mb-4">This year vs last year · by month</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                <Bar dataKey="prior" name="Last year" fill="#6b7280" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cur" name="This year" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={`${ANALYTICS_CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Monthly growth decomposition</p></div>
            <table className="w-full text-sm rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Month", "This year", "Last year", "Δ Amount", "Growth"].map((h, i) => <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.month} className="hover:bg-white/2 text-xs">
                    <td data-label="Month" className="px-5 py-2.5 font-medium">{r.month}</td>
                    <td data-label="This year" className="px-5 py-2.5 text-right tabular-nums text-green-400">{formatAmount(r.cur)}</td>
                    <td data-label="Last year" className="px-5 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(r.prior)}</td>
                    <td data-label="Δ Amount" className={`px-5 py-2.5 text-right tabular-nums font-semibold ${r.abs >= 0 ? "text-green-400" : "text-red-400"}`}>{r.abs >= 0 ? "+" : "−"}{formatAmount(Math.abs(r.abs))}</td>
                    <td data-label="Growth" className="px-5 py-2.5 text-right">{r.growthPct !== null ? <DeltaBadge pct={r.growthPct} /> : <span className="text-[var(--color-muted)]">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />YoY isolates true growth from seasonal swings by comparing like months. Months with no prior-year data show "-". Computed live from revenue transactions. Indicative.</p>
    </div>
  );
}

// ── #66 NEW vs REPEAT CUSTOMER REVENUE ──────────────────────────────────────────
function NewVsRepeatTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: lookback window in months for the new/repeat split.
  const [months, setMonths] = useFeatureState("anl-nvr-months", 6);

  const data = useMemo(() => {
    const winStart = startOfMonth(subMonths(now, Math.max(1, months) - 1)).toISOString().split("T")[0];
    // First-ever revenue date per customer across the FULL history defines "new".
    const firstSeen: Record<string, string> = {};
    transactions.filter(t => t.amount > 0 && t.counterparty && t.category !== "transfer").forEach(t => {
      if (!firstSeen[t.counterparty] || t.date < firstSeen[t.counterparty]) firstSeen[t.counterparty] = t.date;
    });
    let newRev = 0, repeatRev = 0;
    const newSet = new Set<string>(), repeatSet = new Set<string>();
    transactions.filter(t => t.amount > 0 && t.counterparty && t.category !== "transfer" && t.date >= winStart).forEach(t => {
      const isNew = firstSeen[t.counterparty] >= winStart;
      if (isNew) { newRev += t.amount; newSet.add(t.counterparty); }
      else { repeatRev += t.amount; repeatSet.add(t.counterparty); }
    });
    const total = newRev + repeatRev;
    return {
      newRev, repeatRev, total,
      newCount: newSet.size, repeatCount: repeatSet.size,
      newPct: total > 0 ? Math.round((newRev / total) * 100) : 0,
      repeatPct: total > 0 ? Math.round((repeatRev / total) * 100) : 0,
    };
  }, [transactions, months]);

  const pie = [
    { name: "New customers", value: data.newRev, color: "#3b82f6" },
    { name: "Repeat customers", value: data.repeatRev, color: "#22c55e" },
  ].filter(s => s.value > 0);

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">New vs repeat customer revenue</p></div>
          <label className="text-xs flex items-center gap-2"><span className="text-[var(--color-muted)]">Window (months)</span>
            <input type="number" min={1} max={36} value={months} onChange={e => setMonths(Math.min(36, Math.max(1, parseInt(e.target.value) || 1)))} className={`${ANALYTICS_INPUT} w-16`} />
          </label>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">A customer is "new" if their first-ever revenue transaction falls inside the window; otherwise they are "repeat". Uses counterparty names across full history.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Repeat revenue" value={formatCurrency(data.repeatRev)} color="text-green-400" note={`${data.repeatPct}% of total · ${data.repeatCount} customers`} />
        <MetricCard label="New revenue" value={formatCurrency(data.newRev)} color="text-blue-400" note={`${data.newPct}% of total · ${data.newCount} customers`} />
        <MetricCard label="Retention mix" value={`${data.repeatPct}%`} color={data.repeatPct >= 50 ? "text-green-400" : "text-yellow-400"} note="Revenue from existing base" />
        <MetricCard label="Acquisition mix" value={`${data.newPct}%`} color="text-blue-400" note="Revenue from new logos" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">Revenue split</p>
        {pie.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-sm text-[var(--color-muted)]">No revenue in this window</div>
        ) : (
          <div className="flex items-start gap-6 flex-wrap">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pie} cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={3} dataKey="value">
                  {pie.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [formatAmount(v), ""]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 min-w-[180px] space-y-3 pt-2">
              {pie.map(s => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(s.value)}</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${data.total > 0 ? Math.round((s.value / data.total) * 100) : 0}%`, background: s.color }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />A healthy SMB usually earns the majority of revenue from repeat customers. A heavy "new" tilt means growth depends on constant acquisition. Indicative.</p>
    </div>
  );
}

// ── #67-adjacent WEEKDAY / DAY-OF-WEEK SALES PATTERN ────────────────────────────
function WeekdayPatternTab() {
  const { store } = useApp();
  const { transactions } = store;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const data = useMemo(() => {
    const acc = DAYS.map(d => ({ day: d, revenue: 0, count: 0 }));
    transactions.filter(t => t.amount > 0 && t.category !== "transfer").forEach(t => {
      const idx = getDay(parseISO(t.date));
      if (idx >= 0 && idx < 7) { acc[idx].revenue += t.amount; acc[idx].count += 1; }
    });
    return acc.map(d => ({ ...d, avg: d.count > 0 ? d.revenue / d.count : 0 }));
  }, [transactions]);

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const sorted = [...data].filter(d => d.count > 0).sort((a, b) => b.revenue - a.revenue);
  const best = sorted[0];
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const weekendRev = data[0].revenue + data[6].revenue;
  const weekendPct = totalRev > 0 ? Math.round((weekendRev / totalRev) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2"><CalendarDays size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Weekday sales pattern</p></div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Revenue grouped by the day of week each transaction landed. Helps plan staffing, promos and cash-collection timing.</p>
      </div>

      {totalRev === 0 ? (
        <div className={`${ANALYTICS_CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No revenue transactions to analyse yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Strongest day" value={best ? best.day : "-"} color="text-green-400" note={best ? `${formatCurrency(best.revenue)} total` : ""} />
            <MetricCard label="Weakest day" value={worst ? worst.day : "-"} color="text-yellow-400" note={worst ? `${formatCurrency(worst.revenue)} total` : "Need more data"} />
            <MetricCard label="Weekend share" value={`${weekendPct}%`} color={weekendPct >= 40 ? "text-blue-400" : "text-[var(--color-text)]"} note="Sat + Sun of revenue" />
          </div>

          <div className={`${ANALYTICS_CARD} p-5`}>
            <p className="text-sm font-semibold mb-4">Revenue by day of week</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
                  {data.map((d, i) => <Cell key={i} fill={best && d.day === best.day ? "#22c55e" : "var(--color-primary)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className={`${ANALYTICS_CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Day breakdown</p></div>
            <table className="w-full text-sm rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Day", "Revenue", "Transactions", "Avg ticket", "Share"].map((h, i) => <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.map(d => (
                  <tr key={d.day} className="hover:bg-white/2 text-xs">
                    <td data-label="Day" className="px-5 py-2.5 font-medium">{d.day}</td>
                    <td data-label="Revenue" className="px-5 py-2.5 text-right tabular-nums text-green-400">{formatAmount(d.revenue)}</td>
                    <td data-label="Transactions" className="px-5 py-2.5 text-right tabular-nums">{d.count}</td>
                    <td data-label="Avg ticket" className="px-5 py-2.5 text-right tabular-nums">{d.avg > 0 ? formatAmount(d.avg) : "-"}</td>
                    <td data-label="Share" className="px-5 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{totalRev > 0 ? Math.round((d.revenue / totalRev) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Patterns reflect the booking date of bank/UPI transactions, which may lag the actual sale for credit terms. Indicative.</p>
    </div>
  );
}

// ── #67 AVERAGE ORDER VALUE TREND ───────────────────────────────────────────────
function AovTrendTab() {
  const { store } = useApp();
  const { transactions } = store;
  const now = new Date();
  // Durable: trailing months to chart AOV over.
  const [range, setRange] = useFeatureState<"6" | "12">("anl-aov-range", "6");
  const rangeN = Number(range);

  const rows = useMemo(() => {
    return Array.from({ length: rangeN }, (_, i) => {
      const d = subMonths(now, rangeN - 1 - i);
      const start = startOfMonth(d).toISOString().split("T")[0];
      const end = endOfMonth(d).toISOString().split("T")[0];
      const mTxns = transactions.filter(t => t.amount > 0 && t.category !== "transfer" && t.date >= start && t.date <= end);
      const revenue = mTxns.reduce((s, t) => s + t.amount, 0);
      const count = mTxns.length;
      return { month: format(d, "MMM"), aov: count > 0 ? Math.round(revenue / count) : 0, count, revenue };
    });
  }, [transactions, rangeN]);

  const withData = rows.filter(r => r.count > 0);
  const overallAov = withData.length > 0 ? Math.round(rows.reduce((s, r) => s + r.revenue, 0) / Math.max(1, rows.reduce((s, r) => s + r.count, 0))) : 0;
  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const aovDelta = latest && prev ? delta(latest.aov, prev.aov) : null;
  const peak = withData.length > 0 ? withData.reduce((m, r) => (r.aov > m.aov ? r : m), withData[0]) : null;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Average order value trend</p></div>
          <div className="flex gap-1">
            {(["6", "12"] as const).map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${range === r ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{r}M</button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">AOV = revenue ÷ number of revenue transactions in the month. Rising AOV means bigger deals or upsell; falling AOV may signal discounting or smaller baskets.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Overall AOV" value={overallAov > 0 ? formatCurrency(overallAov) : "-"} color="text-[var(--color-primary)]" note={`Trailing ${rangeN} months`} />
        <MetricCard label="Latest month AOV" value={latest && latest.aov > 0 ? formatCurrency(latest.aov) : "-"} color="text-green-400" note={latest ? latest.month : ""} />
        <MetricCard label="Peak month" value={peak ? peak.month : "-"} color="text-blue-400" note={peak ? formatCurrency(peak.aov) : ""} />
        <MetricCard label="MoM change" value={aovDelta !== null ? `${aovDelta >= 0 ? "+" : ""}${aovDelta}%` : "-"} color={aovDelta !== null && aovDelta >= 0 ? "text-green-400" : "text-red-400"} note="vs previous month" />
      </div>

      <div className={`${ANALYTICS_CARD} p-5`}>
        <p className="text-sm font-semibold mb-4">AOV over time</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} tickFormatter={v => formatAmount(v)} width={55} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--color-muted)" }} axisLine={false} tickLine={false} width={32} />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="right" dataKey="count" name="Transactions" fill="var(--color-border)" radius={[3, 3, 0, 0]} />
            <Line yAxisId="left" type="monotone" dataKey="aov" name="Avg order value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-primary)" }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Bars show transaction count (right axis); line shows AOV (left axis). A rising line on flat bars means each sale is getting larger.</p>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Each inbound revenue transaction is treated as one "order". Where one invoice is paid in multiple instalments this slightly understates AOV. Indicative.</p>
    </div>
  );
}

// ── #20 REVENUE BY CHANNEL (ORDER SOURCE) ───────────────────────────────────────
function ChannelSplitTab() {
  const { store } = useApp();
  const { orders } = store;
  const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", excel: "Excel upload", manual: "Manual entry", phone: "Phone" };
  const CHANNEL_COLOR: Record<string, string> = { whatsapp: "#22c55e", email: "#3b82f6", excel: "#14b8a6", manual: "#8b5cf6", phone: "#f97316" };

  const rows = useMemo(() => {
    const acc: Record<string, { value: number; count: number }> = {};
    orders.filter(o => o.status !== "cancelled").forEach(o => {
      const k = o.source;
      if (!acc[k]) acc[k] = { value: 0, count: 0 };
      acc[k].value += o.totalValue;
      acc[k].count += 1;
    });
    return Object.entries(acc)
      .map(([source, v]) => ({ source, label: CHANNEL_LABEL[source] ?? source, value: v.value, count: v.count, color: CHANNEL_COLOR[source] ?? "#6b7280" }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows.length > 0 ? rows[0] : null;
  const topPct = top && total > 0 ? Math.round((top.value / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className={`${ANALYTICS_CARD} p-4`}>
        <div className="flex items-center gap-2"><GitBranch size={14} className="text-[var(--color-primary)]" /><p className="text-sm font-semibold">Revenue by sales channel</p></div>
        <p className="text-[10px] text-[var(--color-muted)] mt-2">Order value grouped by the channel each order came in through (WhatsApp, email, phone, etc.). Cancelled orders excluded.</p>
      </div>

      {rows.length === 0 ? (
        <div className={`${ANALYTICS_CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No orders recorded yet. Capture orders to see the channel mix.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <MetricCard label="Total order value" value={formatCurrency(total)} color="text-green-400" note={`${rows.reduce((s, r) => s + r.count, 0)} orders · ${rows.length} channels`} />
            <MetricCard label="Top channel" value={top ? top.label : "-"} color="text-[var(--color-primary)]" note={top ? `${formatCurrency(top.value)} · ${topPct}%` : ""} />
            <MetricCard label="Channel concentration" value={`${topPct}%`} color={topPct > 70 ? "text-yellow-400" : "text-green-400"} note={topPct > 70 ? "Heavily channel-dependent" : "Reasonably spread"} />
          </div>

          <div className={`${ANALYTICS_CARD} p-5`}>
            <p className="text-sm font-semibold mb-4">Channel mix</p>
            <div className="flex items-start gap-6 flex-wrap">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={rows} cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={3} dataKey="value">
                    {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatAmount(v), ""]} contentStyle={{ background: "var(--color-surface)", border: "0.5px solid var(--color-border)", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 min-w-[200px] space-y-3 pt-1">
                {rows.map(r => {
                  const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
                  return (
                    <div key={r.source}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(r.value)} <span className="text-[var(--color-muted)] font-normal">· {pct}%</span></span>
                      </div>
                      <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={`${ANALYTICS_CARD} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">Channel detail</p></div>
            <table className="w-full text-sm rcard">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>{["Channel", "Order value", "Orders", "Avg order", "Share"].map((h, i) => <th key={h} className={`px-5 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map(r => (
                  <tr key={r.source} className="hover:bg-white/2 text-xs">
                    <td data-label="Channel" className="px-5 py-2.5 font-medium"><span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.color }} />{r.label}</span></td>
                    <td data-label="Order value" className="px-5 py-2.5 text-right tabular-nums text-green-400">{formatAmount(r.value)}</td>
                    <td data-label="Orders" className="px-5 py-2.5 text-right tabular-nums">{r.count}</td>
                    <td data-label="Avg order" className="px-5 py-2.5 text-right tabular-nums">{r.count > 0 ? formatAmount(r.value / r.count) : "-"}</td>
                    <td data-label="Share" className="px-5 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{total > 0 ? Math.round((r.value / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]"><DataFreshnessBadge kind="indicative" className="mr-1.5" />Based on captured orders, not bank transactions, so totals may differ from booked revenue. Useful for deciding where to invest sales effort. Indicative.</p>
    </div>
  );
}
