import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { incomeStatement, balanceSheet, cashFlowStatement, monthlyCashFlow, monthlyAggregates } from "@/lib/finance";
import { totalGrossCost, totalAccumulatedDepreciation, totalNetBookValue, depreciationBetween, accumulatedDepreciation, bookValue } from "@/lib/depreciation";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { exportExcel, exportPdf } from "@/lib/exporters";
import {
  FileSpreadsheet, FileDown, Sheet as SheetIcon, Info, Scale, TrendingUp, Wallet, Building2,
  Repeat, FileStack, NotebookPen, Columns3, PieChart,
  Percent, ArrowLeftRight, Briefcase, Layers, CalendarClock, Coins, Receipt, LayoutDashboard,
  GitCompare, LineChart, Crosshair, Target, BarChart3,
  Rows3, Network, ShieldAlert, Gauge, HandCoins,
} from "lucide-react";
import { toast } from "sonner";
import FixedAssetRegister from "./FixedAssetRegister";

type Tab =
  | "income" | "balance" | "cashflow" | "assets"
  | "as3-cashflow" | "schedule3" | "notes" | "comparative" | "segment"
  | "ratios" | "fund-flow" | "working-capital" | "socie"
  | "dep-schedule" | "eps-networth" | "cost-sheet" | "mis-pack"
  | "indirect-cf" | "projection" | "breakeven" | "budget-variance" | "trend-pl"
  | "expense-schedule" | "related-party" | "contingent" | "cashflow-ratios" | "provisions";
type Preset = "month" | "quarter" | "fy" | "ttm";

function iso(d: Date) { return d.toISOString().split("T")[0]; }

function periodRange(preset: Preset, today: Date): { start: string; end: string; label: string } {
  const end = iso(today);
  if (preset === "month") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: iso(s), end, label: `${today.toLocaleString("en-IN", { month: "long", year: "numeric" })} (MTD)` };
  }
  if (preset === "quarter") {
    const q = Math.floor(today.getMonth() / 3);
    const s = new Date(today.getFullYear(), q * 3, 1);
    return { start: iso(s), end, label: `Q${q + 1} ${today.getFullYear()} (QTD)` };
  }
  if (preset === "fy") {
    // Indian financial year: 1 Apr → 31 Mar
    const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const s = new Date(fyStart, 3, 1);
    return { start: iso(s), end, label: `FY ${fyStart}–${String(fyStart + 1).slice(2)} (YTD)` };
  }
  const s = new Date(today.getTime() - 365 * 86400000);
  return { start: iso(s), end, label: "Trailing 12 months" };
}

/** One statement line. `level`: 0=section header, 1=line, 2=subtotal, 3=grand total. */
function Row({ label, value, level = 1, pct, note, accent }: {
  label: string; value?: number; level?: number; pct?: number; note?: string; accent?: "green" | "red" | "blue";
}) {
  const isHeader = level === 0, isSub = level === 2, isTotal = level === 3;
  const color =
    accent === "green" ? "text-green-400" :
    accent === "red"   ? "text-red-400"   :
    accent === "blue"  ? "text-[var(--color-primary)]" :
    (value !== undefined && value < 0) ? "text-red-400" : "text-[var(--color-text)]";
  return (
    <div className={[
      "flex items-center justify-between gap-3 px-1",
      isHeader ? "pt-4 pb-1.5 mt-1 border-b border-[var(--color-border)]" : "py-1.5",
      isSub ? "border-t border-[var(--color-border)] mt-1 pt-2" : "",
      isTotal ? "border-t-2 border-[var(--color-border)] mt-1 pt-2.5" : "",
    ].join(" ")}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={[
          isHeader ? "text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]" : "",
          isSub || isTotal ? "text-sm font-bold" : "text-sm",
          level === 1 ? "text-[var(--color-text)]" : "",
        ].join(" ")} style={{ paddingLeft: level === 1 ? 12 : 0 }}>{label}</span>
        {note && (
          <span className="text-[9px] text-[var(--color-muted)] border border-[var(--color-border)] rounded px-1 py-px shrink-0" title={note}>est.</span>
        )}
      </div>
      {value !== undefined && (
        <div className="flex items-center gap-3 shrink-0">
          {pct !== undefined && <span className="text-[10px] text-[var(--color-muted)] tabular-nums w-9 text-right">{pct}%</span>}
          <span className={`tabular-nums ${isSub || isTotal ? "font-bold text-base" : "text-sm"} ${color}`}>
            {value < 0 ? `(${formatAmount(Math.abs(value))})` : formatAmount(value)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function StatementsPage() {
  const { store } = useApp();
  const { firm } = store;
  const [tab, setTab] = useState<Tab>("income");
  const [preset, setPreset] = useState<Preset>("fy");
  const today = useMemo(() => new Date(), []);
  const range = useMemo(() => periodRange(preset, today), [preset, today]);

  const pl  = useMemo(() => incomeStatement(store, range.start, range.end), [store, range]);
  const bs  = useMemo(() => balanceSheet(store, today), [store, today]);
  const cf  = useMemo(() => cashFlowStatement(store, range.start, range.end, today), [store, range, today]);
  const monthly = useMemo(() => monthlyCashFlow(store, 12, today), [store, today]);

  // ── Build export tables for the active statement ──────────────────────────────
  const exportData = useMemo(() => {
    if (tab === "income") {
      return {
        title: "Income Statement", file: "income-statement",
        head: ["Line item", "Amount (₹)", "% of revenue"],
        body: [
          ["Revenue", pl.revenue, "100%"],
          ["Cost of goods sold", -pl.cogs, ""],
          ["Gross Profit", pl.grossProfit, `${pl.grossMarginPct}%`],
          ["Payroll", -pl.payroll, ""],
          ["Other operating expenses", -pl.otherOpex, ""],
          ["EBITDA", pl.ebitda, `${pl.ebitdaMarginPct}%`],
          ["Depreciation & amortisation (est.)", -pl.depreciation, ""],
          ["EBIT", pl.ebit, ""],
          ["Finance costs (interest)", -pl.interest, ""],
          ["Profit Before Tax", pl.pbt, ""],
          ["Income tax (est.)", -pl.tax, ""],
          ["Net Profit", pl.netProfit, `${pl.netMarginPct}%`],
        ] as (string | number)[][],
      };
    }
    if (tab === "balance") {
      return {
        title: "Balance Sheet", file: "balance-sheet",
        head: ["Line item", "Amount (₹)"],
        body: [
          ["ASSETS", ""],
          ["Cash & bank balances", bs.cash],
          ["Accounts receivable", bs.accountsReceivable],
          ["Inventory", bs.inventory],
          ["Total Current Assets", bs.currentAssets],
          ["Fixed assets (net, est.)", bs.fixedAssetsNet],
          ["Total Assets", bs.totalAssets],
          ["LIABILITIES", ""],
          ["Accounts payable", bs.accountsPayable],
          ["GST payable", bs.gstPayable],
          ["Short-term debt", bs.shortTermDebt],
          ["Other obligations", bs.otherCurrentLiabilities],
          ["Total Current Liabilities", bs.currentLiabilities],
          ["Long-term debt", bs.longTermDebt],
          ["Total Liabilities", bs.totalLiabilities],
          ["EQUITY", ""],
          ["Paid-in capital", bs.paidInCapital],
          ["Retained earnings", bs.retainedEarnings],
          ["Total Equity", bs.totalEquity],
          ["Total Liabilities + Equity", bs.totalLiabilities + bs.totalEquity],
        ] as (string | number)[][],
      };
    }
    return {
      title: "Cash Flow Statement", file: "cash-flow",
      head: ["Line item", "Amount (₹)"],
      body: [
        ["OPERATING", ""],
        ["Receipts from customers", cf.receiptsFromCustomers],
        ["Payments to suppliers", -cf.paymentsToSuppliers],
        ["Payments to employees", -cf.paymentsToEmployees],
        ["Taxes & duties paid", -cf.taxesPaid],
        ["Net cash from operations", cf.operating],
        ["FINANCING", ""],
        ["Loan proceeds", cf.loanProceeds],
        ["Loan repayments", -cf.loanRepayments],
        ["Equity raised", cf.equityRaised],
        ["Net cash from financing", cf.financing],
        ["Net change in cash", cf.netChange],
        ["Opening cash", cf.openingCash],
        ["Closing cash", cf.closingCash],
      ] as (string | number)[][],
    };
  }, [tab, pl, bs, cf]);

  const monthlySheet = useMemo(() => ({
    head: ["Month", "Receipts", "Suppliers", "Payroll", "Taxes", "Operating", "Financing", "Net", "Closing cash"],
    body: monthly.map(m => [m.label, m.receipts, -m.supplierPayments, -m.payroll, -m.taxes, m.operating, m.financing, m.net, m.closing]) as (string | number)[][],
  }), [monthly]);

  const doExportExcel = () => {
    const sheets = [{ name: exportData.title, rows: [exportData.head, ...exportData.body] }];
    if (tab === "cashflow") sheets.push({ name: "Monthly cash flow", rows: [monthlySheet.head, ...monthlySheet.body] });
    exportExcel(`${exportData.file}-${range.end}.xlsx`, sheets);
    toast.success("Excel downloaded");
  };
  const doExportPdf = () => {
    const tables = [{ title: exportData.title, head: exportData.head, body: exportData.body }];
    if (tab === "cashflow") tables.push({ title: "Monthly cash flow (12 months)", head: monthlySheet.head, body: monthlySheet.body });
    exportPdf(`${exportData.file}-${range.end}.pdf`, `${firm.name} — ${exportData.title}`, `${range.label} · generated by Headroom`, tables);
    toast.success("PDF downloaded");
  };

  const TABS = [
    { id: "income",          label: "Income Statement", icon: TrendingUp },
    { id: "balance",         label: "Balance Sheet",    icon: Scale },
    { id: "cashflow",        label: "Cash Flow",        icon: Wallet },
    { id: "assets",          label: "Fixed Assets",     icon: Building2 },
    { id: "as3-cashflow",    label: "AS-3 Cash Flow",   icon: Repeat },
    { id: "schedule3",       label: "Schedule III",     icon: FileStack },
    { id: "notes",           label: "Notes to Accounts", icon: NotebookPen },
    { id: "comparative",     label: "Comparative",      icon: Columns3 },
    { id: "segment",         label: "Segment Report",   icon: PieChart },
    { id: "ratios",          label: "Ratio Pack",       icon: Percent },
    { id: "fund-flow",       label: "Fund Flow",        icon: ArrowLeftRight },
    { id: "working-capital", label: "Working Capital",  icon: Briefcase },
    { id: "socie",           label: "Changes in Equity", icon: Layers },
    { id: "dep-schedule",    label: "Depreciation Sch.", icon: CalendarClock },
    { id: "eps-networth",    label: "EPS & Net Worth",  icon: Coins },
    { id: "cost-sheet",      label: "Cost Sheet",       icon: Receipt },
    { id: "mis-pack",        label: "MIS Pack",         icon: LayoutDashboard },
    { id: "indirect-cf",     label: "Indirect Cash Flow", icon: GitCompare },
    { id: "projection",      label: "3-Statement Forecast", icon: LineChart },
    { id: "breakeven",       label: "Break-even",       icon: Crosshair },
    { id: "budget-variance", label: "Budget Variance",  icon: Target },
    { id: "trend-pl",        label: "Monthly Trend",    icon: BarChart3 },
    { id: "expense-schedule", label: "Expense Schedule", icon: Rows3 },
    { id: "related-party",   label: "Related Party",    icon: Network },
    { id: "contingent",      label: "Contingent Liab.", icon: ShieldAlert },
    { id: "cashflow-ratios", label: "Cash-Flow Ratios", icon: Gauge },
    { id: "provisions",      label: "Provisions",       icon: HandCoins },
  ] as const satisfies readonly { id: Tab; label: string; icon: React.ElementType }[];
  const PRESETS: { id: Preset; label: string }[] = [
    { id: "month",   label: "This Month" },
    { id: "quarter", label: "This Quarter" },
    { id: "fy",      label: "Financial Year" },
    { id: "ttm",     label: "Trailing 12M" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[var(--color-primary)]" /> Financial Statements
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {firm.name} · derived live from your bank data · {range.label}
          </p>
        </div>
        {tab !== "assets" && (
          <div className="flex items-center gap-2">
            <button onClick={doExportPdf}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <FileDown size={13} /> PDF
            </button>
            <button onClick={doExportExcel}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
              <SheetIcon size={13} /> Excel
            </button>
          </div>
        )}
      </div>

      {/* Period selector */}
      {(tab === "income" || tab === "cashflow") && (
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${preset === p.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── INCOME STATEMENT ── */}
      {tab === "income" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Profit &amp; Loss Statement</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">{range.label} · all figures in ₹</p>
            <Row label="Revenue" level={0} />
            <Row label="Revenue from operations" value={pl.revenue} pct={100} accent="green" />
            <Row label="Cost of goods sold" value={-pl.cogs} pct={pl.revenue > 0 ? Math.round(pl.cogs / pl.revenue * 100) : 0} />
            <Row label="Gross Profit" value={pl.grossProfit} level={2} pct={pl.grossMarginPct} />
            <Row label="Operating Expenses" level={0} />
            <Row label="Employee benefits (payroll)" value={-pl.payroll} pct={pl.revenue > 0 ? Math.round(pl.payroll / pl.revenue * 100) : 0} />
            <Row label="Other operating expenses" value={-pl.otherOpex} pct={pl.revenue > 0 ? Math.round(pl.otherOpex / pl.revenue * 100) : 0} />
            <Row label="EBITDA" value={pl.ebitda} level={2} pct={pl.ebitdaMarginPct} />
            <Row label="Depreciation & amortisation" value={-pl.depreciation} note={store.fixedAssets?.length ? undefined : "add assets in the Fixed Assets tab"} />
            <Row label="EBIT (operating profit)" value={pl.ebit} level={2} />
            <Row label="Finance costs (interest)" value={-pl.interest} note="from active loans" />
            <Row label="Profit Before Tax" value={pl.pbt} level={2} />
            <Row label="Income tax expense" value={-pl.tax} note="estimated at 25% of PBT" />
            <Row label="Net Profit" value={pl.netProfit} level={3} pct={pl.netMarginPct} accent={pl.netProfit >= 0 ? "green" : "red"} />
          </div>
          <div className="space-y-4">
            {[
              { label: "Gross Margin",  value: `${pl.grossMarginPct}%`,  ok: pl.grossMarginPct >= 30 },
              { label: "EBITDA Margin", value: `${pl.ebitdaMarginPct}%`, ok: pl.ebitdaMarginPct >= 15 },
              { label: "Net Margin",    value: `${pl.netMarginPct}%`,    ok: pl.netMarginPct >= 8 },
            ].map(m => (
              <div key={m.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{m.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${m.ok ? "text-green-400" : "text-yellow-400"}`}>{m.value}</p>
              </div>
            ))}
            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
              <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
              <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                Derived from revenue, expense and payroll transactions. COGS uses goods received from suppliers.
                {store.fixedAssets?.length
                  ? " Depreciation is calculated from your fixed-asset register; income tax is estimated at 25% of PBT."
                  : " Depreciation is ₹0 until you add assets in the Fixed Assets tab; income tax is estimated at 25% of PBT."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── BALANCE SHEET ── */}
      {tab === "balance" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Assets</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">As of {bs.asOf}</p>
            <Row label="Current Assets" level={0} />
            <Row label="Cash & bank balances" value={bs.cash} />
            <Row label="Accounts receivable" value={bs.accountsReceivable} />
            <Row label="Inventory" value={bs.inventory} />
            <Row label="Total Current Assets" value={bs.currentAssets} level={2} />
            <Row label="Non-Current Assets" level={0} />
            <Row label="Fixed assets (net)" value={bs.fixedAssetsNet} note={store.fixedAssets?.length ? undefined : "estimated — add a register"} />
            <Row label="Total Non-Current Assets" value={bs.nonCurrentAssets} level={2} />
            <Row label="Total Assets" value={bs.totalAssets} level={3} accent="blue" />
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Liabilities &amp; Equity</p>
            <p className="text-xs text-[var(--color-muted)] mb-3">As of {bs.asOf}</p>
            <Row label="Current Liabilities" level={0} />
            <Row label="Accounts payable" value={bs.accountsPayable} />
            <Row label="GST payable" value={bs.gstPayable} />
            <Row label="Short-term debt (≤12m)" value={bs.shortTermDebt} />
            <Row label="Other obligations (≤90d)" value={bs.otherCurrentLiabilities} />
            <Row label="Total Current Liabilities" value={bs.currentLiabilities} level={2} />
            <Row label="Non-Current Liabilities" level={0} />
            <Row label="Long-term debt" value={bs.longTermDebt} />
            <Row label="Total Liabilities" value={bs.totalLiabilities} level={2} accent="red" />
            <Row label="Equity" level={0} />
            <Row label="Paid-in capital" value={bs.paidInCapital} />
            <Row label="Retained earnings" value={bs.retainedEarnings} note="balancing figure" />
            <Row label="Total Equity" value={bs.totalEquity} level={2} />
            <Row label="Total Liabilities + Equity" value={bs.totalLiabilities + bs.totalEquity} level={3} accent="blue" />
          </div>
          <div className="lg:col-span-2">
            <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 border ${bs.balances ? "bg-green-950/20 border-green-800/40 text-green-400" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>
              <Scale size={13} />
              {bs.balances
                ? `Balanced — Assets ${formatCurrency(bs.totalAssets)} = Liabilities + Equity ${formatCurrency(bs.totalLiabilities + bs.totalEquity)}`
                : "Out of balance — check inputs"}
            </div>
          </div>
        </div>
      )}

      {/* ── CASH FLOW ── */}
      {tab === "cashflow" && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <p className="text-sm font-semibold mb-1">Cash Flow Statement <span className="text-[10px] font-normal text-[var(--color-muted)]">· direct method</span></p>
            <p className="text-xs text-[var(--color-muted)] mb-3">{range.label} · all figures in ₹</p>
            <Row label="Operating Activities" level={0} />
            <Row label="Receipts from customers" value={cf.receiptsFromCustomers} accent="green" />
            <Row label="Payments to suppliers" value={-cf.paymentsToSuppliers} />
            <Row label="Payments to employees" value={-cf.paymentsToEmployees} />
            <Row label="Taxes & duties paid" value={-cf.taxesPaid} />
            <Row label="Net cash from operations" value={cf.operating} level={2} accent={cf.operating >= 0 ? "green" : "red"} />
            <Row label="Investing Activities" level={0} />
            <Row label="Capital expenditure" value={-cf.capex} note="not tracked yet" />
            <Row label="Net cash from investing" value={cf.investing} level={2} />
            <Row label="Financing Activities" level={0} />
            <Row label="Loan proceeds" value={cf.loanProceeds} />
            <Row label="Loan repayments" value={-cf.loanRepayments} />
            <Row label="Equity raised" value={cf.equityRaised} />
            <Row label="Net cash from financing" value={cf.financing} level={2} />
            <Row label="Net Change in Cash" value={cf.netChange} level={3} accent={cf.netChange >= 0 ? "green" : "red"} />
          </div>
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Opening Cash</p>
              <p className="text-xl font-bold tabular-nums">{formatAmount(cf.openingCash)}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Net Change</p>
              <p className={`text-xl font-bold tabular-nums ${cf.netChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                {cf.netChange < 0 ? `(${formatAmount(Math.abs(cf.netChange))})` : formatAmount(cf.netChange)}
              </p>
            </div>
            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Closing Cash</p>
              <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{formatAmount(cf.closingCash)}</p>
            </div>
            <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
              <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
              <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                Direct method — every line is an actual bank cash movement, so the statement reconciles to your real change in cash.
              </p>
            </div>
          </div>
        </div>

        {/* Detailed monthly cash-flow model */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Monthly Cash Flow · last 12 months</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Direct-method month-by-month, with a rolling closing-cash balance anchored to today's bank position.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Month", "Receipts", "Suppliers", "Payroll", "Taxes", "Operating", "Financing", "Net", "Closing cash"].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {monthly.map((m, i) => (
                  <tr key={m.monthKey} className={`hover:bg-white/2 ${i === monthly.length - 1 ? "bg-[var(--color-accent)]/30" : ""}`}>
                    <td className="px-3 py-2 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-400">{formatAmount(m.receipts)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">({formatAmount(m.supplierPayments)})</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">({formatAmount(m.payroll)})</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">({formatAmount(m.taxes)})</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m.operating >= 0 ? "" : "text-red-400"}`}>{m.operating < 0 ? `(${formatAmount(Math.abs(m.operating))})` : formatAmount(m.operating)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.financing < 0 ? `(${formatAmount(Math.abs(m.financing))})` : formatAmount(m.financing)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{m.net < 0 ? `(${formatAmount(Math.abs(m.net))})` : formatAmount(m.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--color-primary)]">{formatAmount(m.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      )}

      {/* ── FIXED ASSETS ── */}
      {tab === "assets" && <FixedAssetRegister />}

      {/* ── #193 AS-3 / IND AS 7 CASH FLOW (direct & indirect) ── */}
      {tab === "as3-cashflow" && <As3CashFlowStatement start={range.start} end={range.end} label={range.label} />}

      {/* ── #194 SCHEDULE III BALANCE SHEET FORMATTER ── */}
      {tab === "schedule3" && <ScheduleThreeBalanceSheet asOf={today} />}

      {/* ── #195 NOTES TO ACCOUNTS BUILDER ── */}
      {tab === "notes" && <NotesToAccounts start={range.start} end={range.end} asOf={today} label={range.label} />}

      {/* ── #196 COMPARATIVE / COMMON-SIZE STATEMENTS ── */}
      {tab === "comparative" && <ComparativeStatements today={today} />}

      {/* ── #197 SEGMENT REPORTING ── */}
      {tab === "segment" && <SegmentReporting start={range.start} end={range.end} label={range.label} />}

      {/* ── RATIO ANALYSIS PACK (Schedule III mandatory ratios) ── */}
      {tab === "ratios" && <RatioPack today={today} />}

      {/* ── FUND FLOW STATEMENT (sources & applications) ── */}
      {tab === "fund-flow" && <FundFlowStatement today={today} />}

      {/* ── WORKING-CAPITAL STATEMENT (changes in WC) ── */}
      {tab === "working-capital" && <WorkingCapitalStatement today={today} />}

      {/* ── STATEMENT OF CHANGES IN EQUITY (SOCIE) ── */}
      {tab === "socie" && <ChangesInEquity today={today} />}

      {/* ── DEPRECIATION SCHEDULE (Companies Act Schedule II) ── */}
      {tab === "dep-schedule" && <DepreciationSchedule today={today} />}

      {/* ── EPS & NET-WORTH COMPUTATION ── */}
      {tab === "eps-networth" && <EpsNetWorth start={range.start} end={range.end} asOf={today} label={range.label} />}

      {/* ── COST SHEET / GROSS-PROFIT STATEMENT ── */}
      {tab === "cost-sheet" && <CostSheet start={range.start} end={range.end} label={range.label} />}

      {/* ── MIS DASHBOARD PACK ── */}
      {tab === "mis-pack" && <MisPack start={range.start} end={range.end} asOf={today} label={range.label} />}

      {/* ── INDIRECT-METHOD CASH FLOW (reconciliation from net profit) ── */}
      {tab === "indirect-cf" && <IndirectCashFlow today={today} />}

      {/* ── 3-STATEMENT FORECAST (projected P&L / BS / cash) ── */}
      {tab === "projection" && <ProjectedStatements start={range.start} end={range.end} asOf={today} label={range.label} />}

      {/* ── BREAK-EVEN & OPERATING LEVERAGE ── */}
      {tab === "breakeven" && <BreakEvenAnalysis start={range.start} end={range.end} label={range.label} />}

      {/* ── VARIANCE-TO-BUDGET P&L ── */}
      {tab === "budget-variance" && <BudgetVariance start={range.start} end={range.end} label={range.label} />}

      {/* ── MONTHLY-TREND P&L ── */}
      {tab === "trend-pl" && <MonthlyTrendPL today={today} />}

      {/* ── EXPENSE SCHEDULE BY HEAD ── */}
      {tab === "expense-schedule" && <ExpenseSchedule start={range.start} end={range.end} label={range.label} />}

      {/* ── RELATED-PARTY DISCLOSURE (AS-18 / Ind AS 24) ── */}
      {tab === "related-party" && <RelatedPartyDisclosure start={range.start} end={range.end} asOf={today} label={range.label} />}

      {/* ── CONTINGENT LIABILITIES & COMMITMENTS ── */}
      {tab === "contingent" && <ContingentLiabilities asOf={today} />}

      {/* ── CASH-FLOW RATIOS & DRIVER ANALYSIS ── */}
      {tab === "cashflow-ratios" && <CashFlowRatios today={today} />}

      {/* ── PROVISIONS & RESERVES MOVEMENT ── */}
      {tab === "provisions" && <ProvisionsReserves today={today} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  #193–#197 · Statements section tools (appended)
// ─────────────────────────────────────────────────────────────────────────────

const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";
const amt = (n: number) => (n < 0 ? `(${formatAmount(Math.abs(n))})` : formatAmount(n));

/** Indian FY [start,end] for the FY that contains `d` (1 Apr → 31 Mar). */
function fyBounds(d: Date): { start: string; end: string; label: string } {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { start: iso(new Date(y, 3, 1)), end: iso(new Date(y + 1, 2, 31)), label: `FY ${y}–${String(y + 1).slice(2)}` };
}

// ── #193 Cash Flow Statement (AS-3 / Ind AS 7): direct & indirect method ──────────
function As3CashFlowStatement({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const [method, setMethod] = useState<"direct" | "indirect">("indirect");
  const cf = useMemo(() => cashFlowStatement(store, start, end), [store, start, end]);
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  // Indirect method: reconcile net profit → operating cash. Working-capital and
  // non-cash adjustments are inferred so it ties back to the direct operating figure.
  const wcAndOther = cf.operating - (pl.netProfit + pl.depreciation + pl.interest + pl.tax);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {(["indirect", "direct"] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 text-xs rounded font-medium capitalize transition-colors ${method === m ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {m} method
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <p className="text-sm font-semibold mb-1">Cash Flow Statement <span className="text-[10px] font-normal text-[var(--color-muted)]">· AS-3 / Ind AS 7 · {method} method</span></p>
          <p className="text-xs text-[var(--color-muted)] mb-3">{label} · all figures in ₹</p>

          <Row label="A. Cash flows from Operating Activities" level={0} />
          {method === "direct" ? (
            <>
              <Row label="Cash receipts from customers" value={cf.receiptsFromCustomers} accent="green" />
              <Row label="Cash paid to suppliers" value={-cf.paymentsToSuppliers} />
              <Row label="Cash paid to employees" value={-cf.paymentsToEmployees} />
              <Row label="Income taxes & duties paid" value={-cf.taxesPaid} />
            </>
          ) : (
            <>
              <Row label="Net profit before tax" value={pl.pbt} />
              <Row label="Add: Depreciation & amortisation" value={pl.depreciation} note="non-cash add-back" />
              <Row label="Add: Finance costs" value={pl.interest} note="reclassified" />
              <Row label="Operating profit before working-capital changes" value={pl.pbt + pl.depreciation + pl.interest} level={2} />
              <Row label="Net change in working capital & other" value={wcAndOther} note="derived to reconcile" />
              <Row label="Less: Income tax paid" value={-pl.tax} />
            </>
          )}
          <Row label="Net cash from Operating Activities (A)" value={cf.operating} level={2} accent={cf.operating >= 0 ? "green" : "red"} />

          <Row label="B. Cash flows from Investing Activities" level={0} />
          <Row label="Purchase of fixed assets (capex)" value={-cf.capex} note="not tracked yet" />
          <Row label="Net cash from Investing Activities (B)" value={cf.investing} level={2} />

          <Row label="C. Cash flows from Financing Activities" level={0} />
          <Row label="Proceeds from borrowings" value={cf.loanProceeds} />
          <Row label="Repayment of borrowings" value={-cf.loanRepayments} />
          <Row label="Proceeds from issue of share capital" value={cf.equityRaised} />
          <Row label="Net cash from Financing Activities (C)" value={cf.financing} level={2} />

          <Row label="Net increase / (decrease) in cash (A+B+C)" value={cf.netChange} level={2} accent={cf.netChange >= 0 ? "green" : "red"} />
          <Row label="Cash & equivalents at beginning of period" value={cf.openingCash} />
          <Row label="Cash & equivalents at end of period" value={cf.closingCash} level={3} accent="blue" />
        </div>
        <div className="space-y-4">
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Operating cash</p>
            <p className={`text-xl font-bold tabular-nums ${cf.operating >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(cf.operating)}</p>
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Reconciliation check</p>
            <p className={`text-sm font-bold ${Math.abs(cf.closingCash - cf.openingCash - cf.netChange) < 1 ? "text-green-400" : "text-red-400"}`}>
              {Math.abs(cf.closingCash - cf.openingCash - cf.netChange) < 1 ? "Ties to closing cash ✓" : "Out of balance"}
            </p>
          </div>
          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
            <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              The indirect method starts from net profit and adds back non-cash items (depreciation) and finance costs, then adjusts for working-capital movements — derived so it reconciles to the direct operating cash figure. AS-3 mandates this format for statutory accounts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── #194 Schedule III Balance Sheet Formatter (statutory format) ──────────────────
function ScheduleThreeBalanceSheet({ asOf }: { asOf: Date }) {
  const { store } = useApp();
  const { firm } = store;
  const bs = useMemo(() => balanceSheet(store, asOf), [store, asOf]);

  const doExport = () => {
    const body: (string | number)[][] = [
      ["I. EQUITY AND LIABILITIES", ""],
      ["(1) Shareholders' funds — Share capital", bs.paidInCapital],
      ["(1) Shareholders' funds — Reserves & surplus", bs.retainedEarnings],
      ["(2) Non-current liabilities — Long-term borrowings", bs.longTermDebt],
      ["(3) Current liabilities — Short-term borrowings", bs.shortTermDebt],
      ["(3) Current liabilities — Trade payables", bs.accountsPayable],
      ["(3) Current liabilities — Other current liabilities", bs.otherCurrentLiabilities],
      ["(3) Current liabilities — Short-term provisions (GST)", bs.gstPayable],
      ["TOTAL EQUITY AND LIABILITIES", bs.totalLiabilities + bs.totalEquity],
      ["II. ASSETS", ""],
      ["(1) Non-current assets — Property, plant & equipment (net)", bs.fixedAssetsNet],
      ["(2) Current assets — Inventories", bs.inventory],
      ["(2) Current assets — Trade receivables", bs.accountsReceivable],
      ["(2) Current assets — Cash & cash equivalents", bs.cash],
      ["TOTAL ASSETS", bs.totalAssets],
    ];
    exportPdf(`schedule-iii-balance-sheet-${bs.asOf}.pdf`, `${firm.name} — Balance Sheet (Schedule III)`, `As at ${bs.asOf} · generated by Headroom`,
      [{ title: "Balance Sheet (Schedule III, Part I)", head: ["Particulars", "Amount (₹)"], body }]);
    toast.success("PDF downloaded");
  };

  const Section = ({ title, note, rows, total, totalLabel }: {
    title: string; note?: string; rows: { label: string; value: number; n?: number }[]; total: number; totalLabel: string;
  }) => (
    <>
      <Row label={title} level={0} />
      {note && <p className="text-[10px] text-[var(--color-muted)] pl-1 -mt-1 mb-1">{note}</p>}
      {rows.map(r => <Row key={r.label} label={`${r.label}${r.n ? ` (Note ${r.n})` : ""}`} value={r.value} />)}
      <Row label={totalLabel} value={total} level={2} />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={doExport}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
          <FileDown size={13} /> PDF
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-1">I — Equity & Liabilities</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Schedule III, Part I · as at {bs.asOf}</p>
          <Section title="(1) Shareholders' Funds" rows={[
            { label: "Share capital", value: bs.paidInCapital, n: 1 },
            { label: "Reserves & surplus", value: bs.retainedEarnings, n: 2 },
          ]} total={bs.totalEquity} totalLabel="Total shareholders' funds" />
          <Section title="(2) Non-Current Liabilities" rows={[
            { label: "Long-term borrowings", value: bs.longTermDebt, n: 3 },
          ]} total={bs.nonCurrentLiabilities} totalLabel="Total non-current liabilities" />
          <Section title="(3) Current Liabilities" rows={[
            { label: "Short-term borrowings", value: bs.shortTermDebt, n: 3 },
            { label: "Trade payables", value: bs.accountsPayable, n: 4 },
            { label: "Other current liabilities", value: bs.otherCurrentLiabilities },
            { label: "Short-term provisions (GST)", value: bs.gstPayable },
          ]} total={bs.currentLiabilities} totalLabel="Total current liabilities" />
          <Row label="TOTAL EQUITY & LIABILITIES" value={bs.totalLiabilities + bs.totalEquity} level={3} accent="blue" />
        </div>
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-1">II — Assets</p>
          <p className="text-xs text-[var(--color-muted)] mb-3">Schedule III, Part I · as at {bs.asOf}</p>
          <Section title="(1) Non-Current Assets" rows={[
            { label: "Property, plant & equipment (net)", value: bs.fixedAssetsNet, n: 5 },
          ]} total={bs.nonCurrentAssets} totalLabel="Total non-current assets" />
          <Section title="(2) Current Assets" rows={[
            { label: "Inventories", value: bs.inventory, n: 6 },
            { label: "Trade receivables", value: bs.accountsReceivable, n: 7 },
            { label: "Cash & cash equivalents", value: bs.cash, n: 8 },
          ]} total={bs.currentAssets} totalLabel="Total current assets" />
          <Row label="TOTAL ASSETS" value={bs.totalAssets} level={3} accent="blue" />
        </div>
        <div className="lg:col-span-2">
          <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 border ${bs.balances ? "bg-green-950/20 border-green-800/40 text-green-400" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>
            <Scale size={13} />
            {bs.balances
              ? `Statutory format balances — Equity & Liabilities ${formatCurrency(bs.totalLiabilities + bs.totalEquity)} = Assets ${formatCurrency(bs.totalAssets)}`
              : "Out of balance — review inputs"}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Schedule III (Companies Act 2013) vertical format. Note references map to the Notes-to-Accounts tab. Figures rounded to the nearest rupee; round off to the nearest lakh/crore per turnover before filing. Your CA finalises the statutory accounts.</p>
    </div>
  );
}

// ── #195 Notes to Accounts Builder (auto-draft disclosures) ───────────────────────
function NotesToAccounts({ start, end, asOf, label }: { start: string; end: string; asOf: Date; label: string }) {
  const { store } = useApp();
  const bs = useMemo(() => balanceSheet(store, asOf), [store, asOf]);
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);
  const fc = formatCurrency;

  const notes = useMemo(() => {
    const arr: { n: number; title: string; lines: { label: string; value?: number }[] }[] = [
      { n: 1, title: "Share Capital", lines: [
        { label: "Paid-up / issued capital (confirmed investments)", value: bs.paidInCapital },
      ] },
      { n: 2, title: "Reserves & Surplus", lines: [
        { label: "Surplus in Statement of Profit & Loss (retained earnings)", value: bs.retainedEarnings },
        { label: "Net profit for the period", value: pl.netProfit },
      ] },
      { n: 3, title: "Borrowings", lines: [
        { label: "Long-term borrowings", value: bs.longTermDebt },
        { label: "Short-term borrowings (≤12 months)", value: bs.shortTermDebt },
        { label: "Finance cost charged for the period", value: pl.interest },
      ] },
      { n: 4, title: "Trade Payables", lines: [
        { label: "Total trade payables", value: bs.accountsPayable },
      ] },
      { n: 5, title: "Property, Plant & Equipment", lines: [
        { label: "Net book value", value: bs.fixedAssetsNet },
        { label: "Depreciation for the period", value: pl.depreciation },
      ] },
      { n: 6, title: "Inventories", lines: [
        { label: "Inventories (valued at cost or NRV, whichever is lower)", value: bs.inventory },
      ] },
      { n: 7, title: "Trade Receivables", lines: [
        { label: "Outstanding trade receivables", value: bs.accountsReceivable },
      ] },
      { n: 8, title: "Cash & Cash Equivalents", lines: [
        { label: "Balances with banks", value: bs.cash },
      ] },
      { n: 9, title: "Revenue from Operations", lines: [
        { label: "Sale of goods / services", value: pl.revenue },
      ] },
      { n: 10, title: "Cost of Materials & Employee Benefits", lines: [
        { label: "Cost of goods sold / materials consumed", value: pl.cogs },
        { label: "Employee benefits expense", value: pl.payroll },
        { label: "Other operating expenses", value: pl.otherOpex },
      ] },
    ];
    return arr;
  }, [bs, pl]);

  const policies = [
    "Basis of preparation: financial statements are prepared on the accrual basis under the historical-cost convention, in accordance with applicable Accounting Standards (AS) / Ind AS.",
    "Revenue recognition: revenue is recognised when control of goods/services transfers to the customer and the amount can be reliably measured.",
    "Property, plant & equipment: stated at cost less accumulated depreciation; depreciation is provided on the basis recorded in the Fixed Asset Register.",
    "Inventories: valued at the lower of cost and net realisable value.",
    "Taxation: current tax is provided on the taxable income at the applicable rate; income tax shown is an estimate pending the final computation.",
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><NotebookPen size={14} className="text-[var(--color-primary)]" /> Notes to Accounts</h2>
        <p className="text-xs text-[var(--color-muted)] mb-3">Auto-drafted disclosures for {label} (P&L) and as at {bs.asOf} (Balance Sheet). Note numbers reconcile with the Schedule III tab.</p>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">Note A — Significant Accounting Policies</p>
        <ul className="space-y-2 text-xs text-[var(--color-muted)] leading-relaxed list-disc pl-4">
          {policies.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notes.map(note => (
          <div key={note.n} className={`${CARD} p-4`}>
            <p className="text-xs font-semibold mb-2">Note {note.n} — {note.title}</p>
            <div className="space-y-1.5">
              {note.lines.map(l => (
                <div key={l.label} className="flex items-center justify-between gap-3 text-xs border-b border-[var(--color-border)] pb-1.5 last:border-0 last:pb-0">
                  <span className="text-[var(--color-muted)] min-w-0">{l.label}</span>
                  <span className="tabular-nums shrink-0">{l.value === undefined ? "—" : l.value < 0 ? `(${fc(Math.abs(l.value))})` : fc(l.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">These notes are an auto-generated draft from your live ledger. Statutory disclosures (contingent liabilities, related-party transactions, MSME dues u/s 43B(h), CSR) must be added manually. Your CA finalises the notes before filing.</p>
    </div>
  );
}

// ── #196 Comparative / Common-Size Statements (YoY + % of revenue) ────────────────
function ComparativeStatements({ today }: { today: Date }) {
  const { store } = useApp();
  const [view, setView] = useState<"comparative" | "commonsize">("comparative");

  const curFy = useMemo(() => fyBounds(today), [today]);
  const priorFy = useMemo(() => fyBounds(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())), [today]);

  const cur = useMemo(() => incomeStatement(store, curFy.start, iso(today)), [store, curFy, today]);
  const prior = useMemo(() => incomeStatement(store, priorFy.start, priorFy.end), [store, priorFy]);

  type NumKey = "revenue" | "cogs" | "grossProfit" | "payroll" | "otherOpex" | "ebitda" | "depreciation" | "interest" | "pbt" | "tax" | "netProfit";
  const ROWS: { label: string; key: NumKey; level?: number }[] = [
    { label: "Revenue from operations", key: "revenue" },
    { label: "Cost of goods sold", key: "cogs" },
    { label: "Gross profit", key: "grossProfit", level: 2 },
    { label: "Employee benefits (payroll)", key: "payroll" },
    { label: "Other operating expenses", key: "otherOpex" },
    { label: "EBITDA", key: "ebitda", level: 2 },
    { label: "Depreciation & amortisation", key: "depreciation" },
    { label: "Finance costs", key: "interest" },
    { label: "Profit before tax", key: "pbt", level: 2 },
    { label: "Tax expense", key: "tax" },
    { label: "Net profit", key: "netProfit", level: 3 },
  ];

  const yoy = (c: number, p: number) => (p === 0 ? (c === 0 ? 0 : 100) : Math.round(((c - p) / Math.abs(p)) * 100));
  const csz = (n: number, rev: number) => (rev === 0 ? 0 : Math.round((n / rev) * 1000) / 10);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {([["comparative", "Comparative (YoY)"], ["commonsize", "Common-size (% of revenue)"]] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setView(id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${view === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {lbl}
          </button>
        ))}
      </div>
      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">{view === "comparative" ? "Comparative Statement of Profit & Loss" : "Common-Size Statement of Profit & Loss"}</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{view === "comparative" ? `${priorFy.label} vs ${curFy.label} (YTD)` : "Each line as a percentage of revenue"}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">Particulars</th>
                {view === "comparative" ? (
                  <>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{priorFy.label}</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{curFy.label}</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">Change</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">YoY %</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{priorFy.label} ₹</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">% rev</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">{curFy.label} ₹</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">% rev</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ROWS.map(r => {
                const c = cur[r.key]; const p = prior[r.key];
                const change = c - p; const pct = yoy(c, p);
                const bold = r.level === 2 || r.level === 3;
                return (
                  <tr key={r.label} className={`hover:bg-white/2 ${bold ? "bg-[var(--color-accent)]/30" : ""}`}>
                    <td className={`px-4 py-2 ${bold ? "font-bold" : ""}`}>{r.label}</td>
                    {view === "comparative" ? (
                      <>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{amt(p)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${bold ? "font-bold" : ""}`}>{amt(c)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${change >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(change)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>{pct >= 0 ? "+" : ""}{pct}%</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{amt(p)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{csz(p, prior.revenue)}%</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${bold ? "font-bold" : ""}`}>{amt(c)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{csz(c, cur.revenue)}%</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Current year is FY-to-date; prior year covers the full comparable financial year. YoY % is computed on the absolute prior-period base. Common-size expresses each line as a percentage of revenue from operations.</p>
    </div>
  );
}

// ── #197 Segment Reporting (business-segment financials) ──────────────────────────
function SegmentReporting({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const fc = formatCurrency;

  // Build per-segment P&L from live transactions. Segments are derived from the
  // counterparty (revenue) / category (cost) — a practical proxy when no explicit
  // segment field exists. Top revenue counterparties become reportable segments.
  const segments = useMemo(() => {
    const inWin = (d: string) => d >= start && d <= end;
    const txns = (store.transactions ?? []).filter(t => inWin(t.date) && t.category !== "transfer");

    const revByParty = new Map<string, number>();
    for (const t of txns) {
      if (t.amount > 0 && t.category === "revenue") {
        const k = t.counterparty?.trim() || "Unattributed";
        revByParty.set(k, (revByParty.get(k) ?? 0) + t.amount);
      }
    }
    const totalRevenue = [...revByParty.values()].reduce((s, v) => s + v, 0);

    // Total directly-attributable cost (suppliers + payroll) allocated to segments
    // pro-rata to revenue — standard primary-segment allocation of common costs.
    const totalDirectCost = Math.abs(txns.filter(t => t.amount < 0 && (t.category === "expense" || t.category === "payroll")).reduce((s, t) => s + t.amount, 0));

    // Keep the top 5 revenue segments; fold the rest into "Other segments".
    const sorted = [...revByParty.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const restRev = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const rows = top.map(([name, rev]) => {
      const share = totalRevenue > 0 ? rev / totalRevenue : 0;
      const cost = Math.round(totalDirectCost * share);
      return { name, revenue: rev, cost, result: rev - cost, sharePct: Math.round(share * 1000) / 10 };
    });
    if (restRev > 0) {
      const share = totalRevenue > 0 ? restRev / totalRevenue : 0;
      const cost = Math.round(totalDirectCost * share);
      rows.push({ name: "Other segments", revenue: restRev, cost, result: restRev - cost, sharePct: Math.round(share * 1000) / 10 });
    }
    return { rows, totalRevenue, totalCost: totalDirectCost, totalResult: totalRevenue - totalDirectCost };
  }, [store.transactions, start, end]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><PieChart size={14} className="text-[var(--color-primary)]" /> Segment Reporting (AS-17 / Ind AS 108)</h2>
        <p className="text-xs text-[var(--color-muted)]">Business-segment revenue and result for {label}. Segments are derived from your top revenue customers; common costs are allocated pro-rata to segment revenue.</p>
      </div>

      {segments.rows.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No revenue transactions in this period to segment.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total segment revenue", value: fc(segments.totalRevenue), color: "text-[var(--color-text)]" },
              { label: "Total segment cost", value: fc(segments.totalCost), color: "text-red-400" },
              { label: "Total segment result", value: fc(segments.totalResult), color: segments.totalResult >= 0 ? "text-green-400" : "text-red-400" },
            ].map(c => (
              <div key={c.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[620px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Segment", "Revenue", "% of total", "Allocated cost", "Segment result", "Result margin"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {segments.rows.map(s => (
                  <tr key={s.name} className="hover:bg-white/2">
                    <td className="px-4 py-2 font-medium max-w-[200px] truncate">{s.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fc(s.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{s.sharePct}%</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-400">({fc(s.cost)})</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${s.result >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(s.result)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.revenue > 0 ? Math.round((s.result / s.revenue) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)]/30 font-bold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fc(segments.totalRevenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">100%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">({fc(segments.totalCost)})</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${segments.totalResult >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(segments.totalResult)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{segments.totalRevenue > 0 ? Math.round((segments.totalResult / segments.totalRevenue) * 100) : 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Segments are inferred from top revenue counterparties as a working proxy; under AS-17 / Ind AS 108 reportable segments follow the entity's internal management structure. Common costs are allocated pro-rata to segment revenue. Refine segment definitions with your CA before disclosure.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Additional statements section tools (appended)
// ─────────────────────────────────────────────────────────────────────────────

/** One financial ratio with formula, computed value and a health verdict. */
function RatioCard({ name, formula, value, target, ok }: {
  name: string; formula: string; value: string; target: string; ok: boolean | null;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold">{name}</p>
        <span className={`text-base font-bold tabular-nums ${ok === null ? "text-[var(--color-text)]" : ok ? "text-green-400" : "text-yellow-400"}`}>{value}</span>
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-1 leading-relaxed">{formula}</p>
      <p className="text-[10px] text-[var(--color-muted)] mt-1.5">Benchmark: {target}</p>
    </div>
  );
}

// ── Ratio Analysis Pack — the Schedule III mandatory ratios + key cover ratios ────
function RatioPack({ today }: { today: Date }) {
  const { store } = useApp();
  const bs = useMemo(() => balanceSheet(store, today), [store, today]);
  const fy = useMemo(() => fyBounds(today), [today]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);

  const r = useMemo(() => {
    const div = (a: number, b: number) => (b === 0 ? null : a / b);
    const cogs = pl.cogs + pl.payroll + pl.otherOpex; // total operating cost proxy
    const avgInventory = bs.inventory;
    const avgReceivables = bs.accountsReceivable;
    const avgPayables = bs.accountsPayable;
    const capitalEmployed = bs.totalEquity + bs.longTermDebt;
    const ebit = pl.ebit;
    return {
      current: div(bs.currentAssets, bs.currentLiabilities),
      quick: div(bs.currentAssets - bs.inventory, bs.currentLiabilities),
      debtEquity: div(bs.totalLiabilities, bs.totalEquity),
      dscr: div(pl.ebitda, pl.interest + bs.shortTermDebt),
      icr: div(ebit, pl.interest),
      invTurn: div(cogs, avgInventory),
      debtorTurn: div(pl.revenue, avgReceivables),
      creditorTurn: div(cogs, avgPayables),
      netCapTurn: div(pl.revenue, bs.currentAssets - bs.currentLiabilities),
      netMargin: pl.netMarginPct,
      roce: div(ebit, capitalEmployed),
      roe: div(pl.netProfit, bs.totalEquity),
    };
  }, [bs, pl]);

  const f1 = (n: number | null, suffix = "x") => (n === null ? "n/a" : `${n.toFixed(2)}${suffix}`);
  const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Ratio Analysis Pack</h2>
        <p className="text-xs text-[var(--color-muted)]">The Schedule III (Companies Act 2013) mandatory ratios plus key liquidity, leverage and return ratios — computed live from your P&amp;L ({fy.label} YTD) and balance sheet as at {bs.asOf}.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <RatioCard name="Current Ratio" formula="Current assets ÷ current liabilities" value={f1(r.current)} target="≥ 1.33x" ok={r.current === null ? null : r.current >= 1.33} />
        <RatioCard name="Quick Ratio" formula="(Current assets − inventory) ÷ current liabilities" value={f1(r.quick)} target="≥ 1.0x" ok={r.quick === null ? null : r.quick >= 1} />
        <RatioCard name="Debt–Equity Ratio" formula="Total liabilities ÷ shareholders' equity" value={f1(r.debtEquity)} target="≤ 2.0x" ok={r.debtEquity === null ? null : r.debtEquity <= 2} />
        <RatioCard name="Debt Service Coverage" formula="EBITDA ÷ (interest + short-term debt)" value={f1(r.dscr)} target="≥ 1.25x" ok={r.dscr === null ? null : r.dscr >= 1.25} />
        <RatioCard name="Interest Coverage" formula="EBIT ÷ finance cost" value={f1(r.icr)} target="≥ 3.0x" ok={r.icr === null ? null : r.icr >= 3} />
        <RatioCard name="Inventory Turnover" formula="Cost of sales ÷ inventory" value={f1(r.invTurn)} target="higher is better" ok={null} />
        <RatioCard name="Debtors Turnover" formula="Revenue ÷ trade receivables" value={f1(r.debtorTurn)} target="higher is better" ok={null} />
        <RatioCard name="Creditors Turnover" formula="Cost of sales ÷ trade payables" value={f1(r.creditorTurn)} target="context-specific" ok={null} />
        <RatioCard name="Net Capital Turnover" formula="Revenue ÷ net working capital" value={f1(r.netCapTurn)} target="higher is better" ok={null} />
        <RatioCard name="Net Profit Ratio" formula="Net profit ÷ revenue" value={`${r.netMargin}%`} target="≥ 8%" ok={r.netMargin >= 8} />
        <RatioCard name="Return on Capital Employed" formula="EBIT ÷ (equity + long-term debt)" value={pct(r.roce)} target="≥ 15%" ok={r.roce === null ? null : r.roce >= 0.15} />
        <RatioCard name="Return on Equity" formula="Net profit ÷ shareholders' equity" value={pct(r.roe)} target="≥ 15%" ok={r.roe === null ? null : r.roe >= 0.15} />
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Schedule III requires these ratios with an explanation for any &gt;25% YoY movement. Turnover ratios use period-end balances as a proxy for averages (Headroom is cash-centric, not ledger-based). Your CA finalises the disclosed figures and the variance notes.</p>
    </div>
  );
}

// ── Fund Flow Statement — sources & applications of funds (lender format) ─────────
function FundFlowStatement({ today }: { today: Date }) {
  const { store } = useApp();
  const priorDate = useMemo(() => new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), [today]);
  const cur = useMemo(() => balanceSheet(store, today), [store, today]);
  const prior = useMemo(() => balanceSheet(store, priorDate), [store, priorDate]);
  const fy = useMemo(() => fyBounds(today), [today]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);

  const ff = useMemo(() => {
    // Change in NON-current items drives fund flow; current items net into working capital.
    const fundsFromOps = pl.netProfit + pl.depreciation; // add back non-cash depreciation
    const equityIntroduced = Math.max(0, cur.paidInCapital - prior.paidInCapital);
    const longTermBorrowed = Math.max(0, cur.longTermDebt - prior.longTermDebt);
    const fixedAssetsSold = Math.max(0, prior.fixedAssetsNet - cur.fixedAssetsNet - pl.depreciation);

    const sources = [
      { label: "Funds from operations (net profit + depreciation)", value: fundsFromOps },
      { label: "Fresh capital introduced", value: equityIntroduced },
      { label: "Long-term borrowings raised", value: longTermBorrowed },
      { label: "Sale of fixed assets", value: fixedAssetsSold },
    ].filter(s => s.value !== 0);

    const longTermRepaid = Math.max(0, prior.longTermDebt - cur.longTermDebt);
    const capexAdditions = Math.max(0, cur.fixedAssetsNet - prior.fixedAssetsNet + pl.depreciation);
    const applications = [
      { label: "Purchase of fixed assets (capex)", value: capexAdditions },
      { label: "Repayment of long-term borrowings", value: longTermRepaid },
    ].filter(a => a.value !== 0);

    const totalSources = sources.reduce((s, x) => s + x.value, 0);
    const totalApplications = applications.reduce((s, x) => s + x.value, 0);
    const wcChange = totalSources - totalApplications; // increase (+) / decrease (−) in working capital
    return { sources, applications, totalSources, totalApplications, wcChange };
  }, [cur, prior, pl]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ArrowLeftRight size={14} className="text-[var(--color-primary)]" /> Fund Flow Statement</h2>
        <p className="text-xs text-[var(--color-muted)]">Sources and applications of funds for the year ended {cur.asOf} (vs {prior.asOf}). Banks ask for this with credit appraisals; the closing balancing figure is the change in working capital.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <Row label="Sources of Funds" level={0} />
          {ff.sources.length ? ff.sources.map(s => <Row key={s.label} label={s.label} value={s.value} accent="green" />) : <p className="text-xs text-[var(--color-muted)] py-2 pl-3">No fund inflows detected in the period.</p>}
          <Row label="Total Sources" value={ff.totalSources} level={3} accent="blue" />
        </div>
        <div className={`${CARD} p-5`}>
          <Row label="Applications of Funds" level={0} />
          {ff.applications.length ? ff.applications.map(a => <Row key={a.label} label={a.label} value={a.value} />) : <p className="text-xs text-[var(--color-muted)] py-2 pl-3">No fund outflows detected in the period.</p>}
          <Row label="Total Applications" value={ff.totalApplications} level={3} accent="blue" />
        </div>
      </div>
      <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 border ${ff.wcChange >= 0 ? "bg-green-950/20 border-green-800/40 text-green-400" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>
        <Briefcase size={13} />
        {ff.wcChange >= 0
          ? `Net increase in working capital of ${formatCurrency(ff.wcChange)} (sources exceeded long-term applications)`
          : `Net decrease in working capital of ${formatCurrency(Math.abs(ff.wcChange))} (long-term applications exceeded sources)`}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Derived by comparing the balance sheet as at {cur.asOf} with the same date a year earlier. Funds from operations add back depreciation; current-asset/liability movements are captured as the working-capital change. Review with your CA before lender submission.</p>
    </div>
  );
}

// ── Working-Capital Statement — schedule of changes in working capital ────────────
function WorkingCapitalStatement({ today }: { today: Date }) {
  const { store } = useApp();
  const priorDate = useMemo(() => new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), [today]);
  const cur = useMemo(() => balanceSheet(store, today), [store, today]);
  const prior = useMemo(() => balanceSheet(store, priorDate), [store, priorDate]);

  const rows = useMemo(() => {
    const ca = [
      { label: "Cash & bank balances", c: cur.cash, p: prior.cash },
      { label: "Trade receivables", c: cur.accountsReceivable, p: prior.accountsReceivable },
      { label: "Inventories", c: cur.inventory, p: prior.inventory },
    ];
    const cl = [
      { label: "Trade payables", c: cur.accountsPayable, p: prior.accountsPayable },
      { label: "GST payable", c: cur.gstPayable, p: prior.gstPayable },
      { label: "Short-term debt", c: cur.shortTermDebt, p: prior.shortTermDebt },
      { label: "Other current liabilities", c: cur.otherCurrentLiabilities, p: prior.otherCurrentLiabilities },
    ];
    const sumC = (a: { c: number }[]) => a.reduce((s, x) => s + x.c, 0);
    const sumP = (a: { p: number }[]) => a.reduce((s, x) => s + x.p, 0);
    return {
      ca, cl,
      curCA: sumC(ca), priCA: sumP(ca),
      curCL: sumC(cl), priCL: sumP(cl),
      curWC: sumC(ca) - sumC(cl), priWC: sumP(ca) - sumP(cl),
    };
  }, [cur, prior]);

  // For each line: a rise in a CURRENT ASSET increases WC; a rise in a CURRENT LIABILITY decreases it.
  const lineRows = useMemo(() => [
    ...rows.ca.map(x => ({ ...x, kind: "asset" as const })),
    ...rows.cl.map(x => ({ ...x, kind: "liab" as const })),
  ], [rows]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Briefcase size={14} className="text-[var(--color-primary)]" /> Statement of Changes in Working Capital</h2>
        <p className="text-xs text-[var(--color-muted)]">Line-by-line movement in current assets and current liabilities between {prior.asOf} and {cur.asOf}, with the net effect on working capital.</p>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Particulars", prior.asOf, cur.asOf, "Increase in WC", "Decrease in WC"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {lineRows.map(x => {
              const delta = x.c - x.p;
              // asset up → WC up; liability up → WC down
              const wcEffect = x.kind === "asset" ? delta : -delta;
              return (
                <tr key={x.label} className="hover:bg-white/2">
                  <td className="px-4 py-2 font-medium">{x.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(x.p)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatAmount(x.c)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-400">{wcEffect > 0 ? formatAmount(wcEffect) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">{wcEffect < 0 ? formatAmount(Math.abs(wcEffect)) : "—"}</td>
                </tr>
              );
            })}
            <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
              <td className="px-4 py-2">Net working capital</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(rows.priWC)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(rows.curWC)}</td>
              <td colSpan={2} className={`px-4 py-2 text-right tabular-nums ${rows.curWC - rows.priWC >= 0 ? "text-green-400" : "text-red-400"}`}>
                {rows.curWC - rows.priWC >= 0 ? "Increase " : "Decrease "}{formatAmount(Math.abs(rows.curWC - rows.priWC))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A rise in a current asset increases working capital; a rise in a current liability decreases it. Prior-period figures are reconstructed from the same balance-sheet logic dated one year back. WC drift hidden inside the balance sheet is made explicit here.</p>
    </div>
  );
}

// ── Statement of Changes in Equity (SOCIE) ────────────────────────────────────────
function ChangesInEquity({ today }: { today: Date }) {
  const { store } = useApp();
  const priorDate = useMemo(() => new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), [today]);
  const cur = useMemo(() => balanceSheet(store, today), [store, today]);
  const prior = useMemo(() => balanceSheet(store, priorDate), [store, priorDate]);
  const fy = useMemo(() => fyBounds(today), [today]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);

  // Opening = prior-year balances; profit for the year flows into reserves;
  // capital issued = change in paid-in capital. Closing must tie to current BS.
  const capitalIssued = cur.paidInCapital - prior.paidInCapital;
  const otherReserveMove = (cur.retainedEarnings - prior.retainedEarnings) - pl.netProfit; // dividends/adjustments (balancing)

  type Col = { capital: number; reserves: number };
  const add = (a: Col, b: Partial<Col>): Col => ({ capital: a.capital + (b.capital ?? 0), reserves: a.reserves + (b.reserves ?? 0) });
  const opening: Col = { capital: prior.paidInCapital, reserves: prior.retainedEarnings };
  const afterProfit = add(opening, { reserves: pl.netProfit });
  const afterCapital = add(afterProfit, { capital: capitalIssued });
  const closing = add(afterCapital, { reserves: otherReserveMove });

  const movementRows: { label: string; col: Partial<Col> }[] = [
    { label: "Profit for the period (transferred to reserves)", col: { reserves: pl.netProfit } },
    { label: "Capital issued during the period", col: { capital: capitalIssued } },
    { label: "Dividends / other adjustments", col: { reserves: otherReserveMove } },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Statement of Changes in Equity (SOCIE)</h2>
        <p className="text-xs text-[var(--color-muted)]">Movement in share capital and reserves &amp; surplus for the year ended {cur.asOf}, opening from balances a year earlier. Required under Ind AS Division II, Schedule III.</p>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Particulars", "Share capital", "Reserves & surplus", "Total equity"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr className="bg-[var(--color-accent)]/30 font-bold">
              <td className="px-4 py-2">Balance at {prior.asOf}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(opening.capital)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(opening.reserves)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(opening.capital + opening.reserves)}</td>
            </tr>
            {movementRows.map(m => {
              const cap = m.col.capital ?? 0, res = m.col.reserves ?? 0;
              if (cap === 0 && res === 0) return null;
              return (
                <tr key={m.label} className="hover:bg-white/2">
                  <td className="px-4 py-2">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{cap === 0 ? "—" : amt(cap)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{res === 0 ? "—" : amt(res)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{amt(cap + res)}</td>
                </tr>
              );
            })}
            <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
              <td className="px-4 py-2">Balance at {cur.asOf}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(closing.capital)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(closing.reserves)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--color-primary)]">{formatAmount(closing.capital + closing.reserves)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 border ${Math.abs((closing.capital + closing.reserves) - cur.totalEquity) < 2 ? "bg-green-950/20 border-green-800/40 text-green-400" : "bg-red-950/20 border-red-800/40 text-red-400"}`}>
        <Scale size={13} />
        {Math.abs((closing.capital + closing.reserves) - cur.totalEquity) < 2
          ? `Closing equity ${formatCurrency(closing.capital + closing.reserves)} ties to the balance sheet ✓`
          : "Closing equity does not tie to the balance sheet — review inputs"}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Retained earnings is a balancing figure in Headroom, so the dividends/other-adjustments line absorbs any reserve movement not explained by the period's profit. OCI components must be added by your CA where applicable.</p>
    </div>
  );
}

// ── Depreciation Schedule (Companies Act Schedule II) ─────────────────────────────
function DepreciationSchedule({ today }: { today: Date }) {
  const { store } = useApp();
  const fy = useMemo(() => fyBounds(today), [today]);
  const assets = useMemo(() => store.fixedAssets ?? [], [store.fixedAssets]);

  const rows = useMemo(() => assets.map(a => {
    const opening = bookValue(a, fy.start);
    const closing = bookValue(a, fy.end);
    const dep = depreciationBetween(a, fy.start, fy.end);
    return {
      id: a.id, name: a.name, category: a.category ?? "Uncategorised",
      method: a.method === "wdv" ? "WDV" : "SLM",
      life: a.usefulLifeYears, cost: a.cost,
      accDep: accumulatedDepreciation(a, fy.end),
      opening, dep, closing,
      disposed: !!(a.disposalDate && a.disposalDate <= fy.end),
    };
  }), [assets, fy]);

  const totals = useMemo(() => ({
    cost: totalGrossCost(assets, fy.end),
    accDep: totalAccumulatedDepreciation(assets, fy.end),
    nbv: totalNetBookValue(assets, fy.end),
    depForYear: rows.reduce((s, r) => s + r.dep, 0),
  }), [assets, fy, rows]);

  const doExport = () => {
    const body = rows.map(r => [r.name, r.category, r.method, r.life, r.cost, r.opening, r.dep, r.closing]) as (string | number)[][];
    body.push(["TOTAL", "", "", "", totals.cost, "", totals.depForYear, totals.nbv]);
    exportPdf(`depreciation-schedule-${fy.end}.pdf`, `${store.firm.name} — Depreciation Schedule (Schedule II)`, `${fy.label} · generated by Headroom`,
      [{ title: "Fixed Asset & Depreciation Schedule", head: ["Asset", "Block", "Method", "Life (yrs)", "Gross cost (₹)", "Opening WDV (₹)", "Depreciation (₹)", "Closing WDV (₹)"], body }]);
    toast.success("PDF downloaded");
  };

  if (!assets.length) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <CalendarClock size={28} className="mx-auto text-[var(--color-muted)] mb-2" />
        <p className="text-sm font-medium">No fixed assets recorded</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">Add assets in the Fixed Assets tab to generate the Schedule II depreciation block.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className={`${CARD} p-5 flex-1`}>
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Depreciation Schedule (Companies Act Schedule II)</h2>
          <p className="text-xs text-[var(--color-muted)]">Useful-life-based depreciation per asset for {fy.label}, from your fixed-asset register. SLM and WDV are both handled; book value telescopes exactly across periods.</p>
        </div>
        <button onClick={doExport}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
          <FileDown size={13} /> PDF
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Gross cost", value: formatAmount(totals.cost) },
          { label: "Accumulated depreciation", value: formatAmount(totals.accDep) },
          { label: "Depreciation this year", value: formatAmount(totals.depForYear) },
          { label: "Net book value", value: formatAmount(totals.nbv) },
        ].map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[760px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Asset", "Block", "Method", "Life", "Gross cost", "Opening WDV", "Depreciation", "Closing WDV"].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i < 3 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <tr key={r.id} className={`hover:bg-white/2 ${r.disposed ? "opacity-60" : ""}`}>
                <td className="px-3 py-2 font-medium">{r.name}{r.disposed ? " (disposed)" : ""}</td>
                <td className="px-3 py-2 text-[var(--color-muted)]">{r.category}</td>
                <td className="px-3 py-2">{r.method}</td>
                <td className="px-3 py-2">{r.life}y</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(r.cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(r.opening)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-400">{formatAmount(r.dep)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatAmount(r.closing)}</td>
              </tr>
            ))}
            <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
              <td className="px-3 py-2" colSpan={4}>Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatAmount(totals.cost)}</td>
              <td className="px-3 py-2 text-right tabular-nums">—</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-400">{formatAmount(totals.depForYear)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--color-primary)]">{formatAmount(totals.nbv)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Depreciation for the year = opening WDV − closing WDV per asset, so it reconciles exactly with the P&amp;L charge. The Income-tax block-of-assets (WDV) computation differs from the Companies Act useful-life basis — your CA reconciles the two before filing.</p>
    </div>
  );
}

// ── EPS & Net-Worth Computation ───────────────────────────────────────────────────
function EpsNetWorth({ start, end, asOf, label }: { start: string; end: string; asOf: Date; label: string }) {
  const { store } = useApp();
  const bs = useMemo(() => balanceSheet(store, asOf), [store, asOf]);
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  // Face value default ₹10 (most common for Indian private companies).
  const [faceValue, setFaceValue] = useFeatureState<number>("stm-eps-face-value", 10);
  const [potentialShares, setPotentialShares] = useFeatureState<number>("stm-eps-potential-shares", 0);

  const fv = faceValue > 0 ? faceValue : 10;
  const shares = Math.max(0, Math.round(bs.paidInCapital / fv));
  const dilutedShares = shares + Math.max(0, potentialShares);
  const basicEps = shares > 0 ? pl.netProfit / shares : 0;
  const dilutedEps = dilutedShares > 0 ? pl.netProfit / dilutedShares : 0;

  // Net worth (Companies Act §2(57)): paid-up capital + free reserves − accumulated losses.
  const accumulatedLosses = bs.retainedEarnings < 0 ? Math.abs(bs.retainedEarnings) : 0;
  const freeReserves = bs.retainedEarnings > 0 ? bs.retainedEarnings : 0;
  const netWorth = bs.paidInCapital + freeReserves - accumulatedLosses;
  const bookValuePerShare = shares > 0 ? netWorth / shares : 0;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> EPS &amp; Net-Worth Computation</h2>
        <p className="text-xs text-[var(--color-muted)]">Earnings per share (AS-20 / Ind AS 33) and net worth (Companies Act §2(57)) from net profit for {label} and equity as at {bs.asOf}.</p>
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Assumptions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Face value per share (₹)</span>
            <input type="number" min={1} value={faceValue}
              onChange={e => setFaceValue(Math.max(1, Number(e.target.value) || 1))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Potential dilutive shares (options/convertibles)</span>
            <input type="number" min={0} value={potentialShares}
              onChange={e => setPotentialShares(Math.max(0, Number(e.target.value) || 0))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Shares outstanding", value: shares.toLocaleString("en-IN") },
          { label: "Basic EPS", value: `₹${basicEps.toFixed(2)}` },
          { label: "Diluted EPS", value: `₹${dilutedEps.toFixed(2)}` },
          { label: "Book value / share", value: `₹${bookValuePerShare.toFixed(2)}` },
        ].map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className="text-lg font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <Row label="Earnings Per Share" level={0} />
          <Row label="Net profit attributable to equity" value={pl.netProfit} accent={pl.netProfit >= 0 ? "green" : "red"} />
          {([
            ["Weighted-avg shares (basic)", shares, false],
            ["Add: potential dilutive shares", potentialShares, false],
            ["Diluted shares", dilutedShares, true],
          ] as const).map(([lbl, val, bold]) => (
            <div key={lbl} className={`flex items-center justify-between gap-3 px-1 py-1.5 ${bold ? "border-t border-[var(--color-border)] mt-1 pt-2" : ""}`}>
              <span className={`text-sm ${bold ? "font-bold" : ""}`} style={{ paddingLeft: bold ? 0 : 12 }}>{lbl}</span>
              <span className={`tabular-nums text-sm ${bold ? "font-bold" : ""}`}>{val.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
        <div className={`${CARD} p-5`}>
          <Row label="Net Worth (§2(57))" level={0} />
          <Row label="Paid-up share capital" value={bs.paidInCapital} />
          <Row label="Add: free reserves & surplus" value={freeReserves} />
          <Row label="Less: accumulated losses" value={-accumulatedLosses} />
          <Row label="Net Worth" value={netWorth} level={3} accent="blue" />
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Share count is derived as paid-up capital ÷ face value (a working proxy — Headroom holds no share register). EPS uses the closing share count as a proxy for the weighted average; provide the actual weighted-average and dilutive instrument terms to your CA for the statutory note.</p>
    </div>
  );
}

// ── Cost Sheet / Gross-Profit Statement (cost build-up) ───────────────────────────
function CostSheet({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  const rows = useMemo(() => {
    const primeCost = pl.cogs;                       // direct materials/goods consumed
    const directWages = pl.payroll;                  // treat payroll as direct + works labour proxy
    const works = primeCost + directWages;
    const factoryCost = works;                       // no separate factory overhead bucket
    const costOfProduction = factoryCost + pl.depreciation;
    const otherOverheads = pl.otherOpex;             // admin / selling / distribution
    const costOfSales = costOfProduction + otherOverheads + pl.interest;
    const profit = pl.revenue - costOfSales;
    return { primeCost, directWages, works, costOfProduction, otherOverheads, costOfSales, profit };
  }, [pl]);

  const pctRev = (n: number) => (pl.revenue > 0 ? Math.round((n / pl.revenue) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Cost Sheet &amp; Gross-Profit Statement</h2>
        <p className="text-xs text-[var(--color-muted)]">Classical cost build-up from prime cost to cost of sales for {label}, reconciling to revenue and profit. Useful for pricing and cost-audit-style analysis.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <Row label="Cost Build-up" level={0} />
          <Row label="Direct materials / cost of goods (prime cost)" value={rows.primeCost} pct={pctRev(rows.primeCost)} />
          <Row label="Add: direct labour (payroll)" value={rows.directWages} pct={pctRev(rows.directWages)} />
          <Row label="Works / factory cost" value={rows.works} level={2} pct={pctRev(rows.works)} />
          <Row label="Add: depreciation" value={pl.depreciation} pct={pctRev(pl.depreciation)} />
          <Row label="Cost of production" value={rows.costOfProduction} level={2} pct={pctRev(rows.costOfProduction)} />
          <Row label="Add: admin / selling / distribution overheads" value={rows.otherOverheads} pct={pctRev(rows.otherOverheads)} />
          <Row label="Add: finance cost" value={pl.interest} pct={pctRev(pl.interest)} />
          <Row label="Cost of sales" value={rows.costOfSales} level={2} pct={pctRev(rows.costOfSales)} />
          <Row label="Sales / revenue" value={pl.revenue} pct={100} accent="green" />
          <Row label="Profit / (loss)" value={rows.profit} level={3} accent={rows.profit >= 0 ? "green" : "red"} />
        </div>
        <div className="space-y-4">
          {[
            { label: "Gross margin", value: `${pl.grossMarginPct}%`, ok: pl.grossMarginPct >= 30 },
            { label: "Prime cost % of sales", value: `${pctRev(rows.primeCost)}%`, ok: pctRev(rows.primeCost) <= 60 },
            { label: "Overhead % of sales", value: `${pctRev(rows.otherOverheads)}%`, ok: pctRev(rows.otherOverheads) <= 25 },
          ].map(m => (
            <div key={m.label} className={`${CARD} p-4`}>
              <p className="text-xs text-[var(--color-muted)] mb-1">{m.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${m.ok ? "text-green-400" : "text-yellow-400"}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Payroll is treated as direct/works labour and other operating expenses as overheads — a working classification for a cash-centric system. For a formal cost statement, classify each expense into direct/indirect material, labour and overhead with your cost accountant.</p>
    </div>
  );
}

// ── MIS Dashboard Pack (board-ready monthly snapshot) ─────────────────────────────
function MisPack({ start, end, asOf, label }: { start: string; end: string; asOf: Date; label: string }) {
  const { store } = useApp();
  const { firm } = store;
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);
  const bs = useMemo(() => balanceSheet(store, asOf), [store, asOf]);
  const cf = useMemo(() => cashFlowStatement(store, start, end, asOf), [store, start, end, asOf]);
  const monthly = useMemo(() => monthlyCashFlow(store, 6, asOf), [store, asOf]);

  const kpis = useMemo(() => {
    const currentRatio = bs.currentLiabilities > 0 ? bs.currentAssets / bs.currentLiabilities : null;
    return [
      { label: "Revenue", value: formatAmount(pl.revenue), tone: "text-[var(--color-text)]" },
      { label: "Net profit", value: formatAmount(pl.netProfit), tone: pl.netProfit >= 0 ? "text-green-400" : "text-red-400" },
      { label: "Net margin", value: `${pl.netMarginPct}%`, tone: pl.netMarginPct >= 8 ? "text-green-400" : "text-yellow-400" },
      { label: "EBITDA margin", value: `${pl.ebitdaMarginPct}%`, tone: "text-[var(--color-text)]" },
      { label: "Cash position", value: formatAmount(bs.cash), tone: "text-[var(--color-primary)]" },
      { label: "Operating cash flow", value: formatAmount(cf.operating), tone: cf.operating >= 0 ? "text-green-400" : "text-red-400" },
      { label: "Receivables", value: formatAmount(bs.accountsReceivable), tone: "text-[var(--color-text)]" },
      { label: "Current ratio", value: currentRatio === null ? "n/a" : `${currentRatio.toFixed(2)}x`, tone: currentRatio !== null && currentRatio >= 1.33 ? "text-green-400" : "text-yellow-400" },
    ];
  }, [pl, bs, cf]);

  const doExport = () => {
    const kpiBody = kpis.map(k => [k.label, k.value]) as (string | number)[][];
    const plBody: (string | number)[][] = [
      ["Revenue", pl.revenue], ["Gross profit", pl.grossProfit], ["EBITDA", pl.ebitda],
      ["Depreciation", -pl.depreciation], ["Finance cost", -pl.interest], ["Net profit", pl.netProfit],
    ];
    const bsBody: (string | number)[][] = [
      ["Total assets", bs.totalAssets], ["Cash", bs.cash], ["Receivables", bs.accountsReceivable],
      ["Total liabilities", bs.totalLiabilities], ["Total equity", bs.totalEquity],
    ];
    exportPdf(`mis-pack-${bs.asOf}.pdf`, `${firm.name} — Management Information System (MIS) Pack`, `${label} · generated by Headroom`, [
      { title: "Key Performance Indicators", head: ["Metric", "Value"], body: kpiBody },
      { title: "Profit & Loss Summary", head: ["Line item", "Amount (₹)"], body: plBody },
      { title: "Balance Sheet Summary", head: ["Line item", "Amount (₹)"], body: bsBody },
    ]);
    toast.success("MIS pack PDF downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className={`${CARD} p-5 flex-1`}>
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><LayoutDashboard size={14} className="text-[var(--color-primary)]" /> MIS Dashboard Pack</h2>
          <p className="text-xs text-[var(--color-muted)]">A board-ready snapshot for {label}: headline KPIs, a P&amp;L and balance-sheet summary, and a 6-month cash trend — all live from your data.</p>
        </div>
        <button onClick={doExport}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
          <FileDown size={13} /> Export MIS PDF
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-3">P&amp;L Summary</p>
          <Row label="Revenue" value={pl.revenue} accent="green" />
          <Row label="Gross profit" value={pl.grossProfit} pct={pl.grossMarginPct} />
          <Row label="EBITDA" value={pl.ebitda} level={2} pct={pl.ebitdaMarginPct} />
          <Row label="Net profit" value={pl.netProfit} level={3} accent={pl.netProfit >= 0 ? "green" : "red"} pct={pl.netMarginPct} />
        </div>
        <div className={`${CARD} p-5`}>
          <p className="text-sm font-semibold mb-3">Balance Sheet Summary</p>
          <Row label="Total assets" value={bs.totalAssets} accent="blue" />
          <Row label="Total liabilities" value={bs.totalLiabilities} accent="red" />
          <Row label="Total equity" value={bs.totalEquity} level={2} />
          <Row label="Net working capital" value={bs.currentAssets - bs.currentLiabilities} level={2} accent={bs.currentAssets - bs.currentLiabilities >= 0 ? "green" : "red"} />
        </div>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold">Cash trend · last 6 months</p>
        </div>
        <table className="w-full text-xs min-w-[560px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Month", "Receipts", "Operating", "Net", "Closing cash"].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {monthly.map((m, i) => (
              <tr key={m.monthKey} className={`hover:bg-white/2 ${i === monthly.length - 1 ? "bg-[var(--color-accent)]/30" : ""}`}>
                <td className="px-3 py-2 font-medium">{m.label}</td>
                <td className="px-3 py-2 text-right tabular-nums text-green-400">{formatAmount(m.receipts)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${m.operating >= 0 ? "" : "text-red-400"}`}>{amt(m.operating)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(m.net)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--color-primary)]">{formatAmount(m.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">The MIS pack assembles the same live figures that drive every other statement here, so it always reconciles. Add management commentary and prior-period comparatives before circulating to the board.</p>
    </div>
  );
}

// ── Indirect-Method Cash Flow — full reconciliation with working-capital movements ──
// Distinct from the AS-3 tab: this decomposes the working-capital change into its
// individual components (receivables / inventory / payables) using the year-on-year
// balance-sheet deltas, so the operating section is fully built up rather than
// reconciled with a single balancing figure.
function IndirectCashFlow({ today }: { today: Date }) {
  const { store } = useApp();
  const fy = useMemo(() => fyBounds(today), [today]);
  const priorDate = useMemo(() => new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), [today]);
  const cur = useMemo(() => balanceSheet(store, today), [store, today]);
  const prior = useMemo(() => balanceSheet(store, priorDate), [store, priorDate]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);
  const cf = useMemo(() => cashFlowStatement(store, fy.start, iso(today), today), [store, fy, today]);

  const wc = useMemo(() => {
    // A rise in a current asset is a USE of cash (−); a rise in a current liability is a SOURCE (+).
    const recvChange = -(cur.accountsReceivable - prior.accountsReceivable);
    const invChange = -(cur.inventory - prior.inventory);
    const payChange = cur.accountsPayable - prior.accountsPayable;
    const gstChange = cur.gstPayable - prior.gstPayable;
    const otherChange = cur.otherCurrentLiabilities - prior.otherCurrentLiabilities;
    const wcTotal = recvChange + invChange + payChange + gstChange + otherChange;
    const opBeforeWc = pl.pbt + pl.depreciation + pl.interest;
    const operatingDerived = opBeforeWc + wcTotal - pl.tax;
    return { recvChange, invChange, payChange, gstChange, otherChange, wcTotal, opBeforeWc, operatingDerived };
  }, [cur, prior, pl]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><GitCompare size={14} className="text-[var(--color-primary)]" /> Cash Flow Statement — Indirect Method</h2>
        <p className="text-xs text-[var(--color-muted)]">Net profit reconciled to operating cash for {fy.label} (YTD), with each working-capital movement built up from the year-on-year balance-sheet change (vs {prior.asOf}).</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} p-5`}>
          <Row label="A. Operating Activities" level={0} />
          <Row label="Profit before tax" value={pl.pbt} accent={pl.pbt >= 0 ? "green" : "red"} />
          <Row label="Add: Depreciation & amortisation" value={pl.depreciation} note="non-cash" />
          <Row label="Add: Finance costs" value={pl.interest} note="reclassified to financing" />
          <Row label="Operating profit before working-capital changes" value={wc.opBeforeWc} level={2} />
          <Row label="Working-Capital Movements" level={0} />
          <Row label="(Increase) / decrease in trade receivables" value={wc.recvChange} />
          <Row label="(Increase) / decrease in inventories" value={wc.invChange} />
          <Row label="Increase / (decrease) in trade payables" value={wc.payChange} />
          <Row label="Increase / (decrease) in GST payable" value={wc.gstChange} />
          <Row label="Increase / (decrease) in other current liabilities" value={wc.otherChange} />
          <Row label="Net working-capital change" value={wc.wcTotal} level={2} accent={wc.wcTotal >= 0 ? "green" : "red"} />
          <Row label="Less: Income tax paid" value={-pl.tax} />
          <Row label="Net cash from Operating Activities" value={wc.operatingDerived} level={3} accent={wc.operatingDerived >= 0 ? "green" : "red"} />
        </div>
        <div className="space-y-4">
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Operating cash (indirect build-up)</p>
            <p className={`text-xl font-bold tabular-nums ${wc.operatingDerived >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(wc.operatingDerived)}</p>
          </div>
          <div className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">Operating cash (direct method)</p>
            <p className={`text-xl font-bold tabular-nums ${cf.operating >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(cf.operating)}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">Difference: {formatCurrency(Math.abs(wc.operatingDerived - cf.operating))} (timing of accruals vs actual cash).</p>
          </div>
          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
            <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Unlike the AS-3 tab (single reconciling line), this statement builds each working-capital movement from the balance-sheet deltas, so the gap to direct-method cash is purely accrual timing rather than a forced plug.
            </p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Working-capital movements compare the balance sheet today with the same date a year earlier. A rise in receivables/inventory consumes cash; a rise in payables/provisions releases it. Depreciation is a non-cash add-back; finance cost is reclassified to financing. Reconcile accrual-vs-cash timing differences with your CA.</p>
    </div>
  );
}

// ── 3-Statement Forecast — projected P&L plus the resulting cash & equity position ──
function ProjectedStatements({ start, end, asOf, label }: { start: string; end: string; asOf: Date; label: string }) {
  const { store } = useApp();
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);
  const bs = useMemo(() => balanceSheet(store, asOf), [store, asOf]);

  const [revGrowthPct, setRevGrowthPct] = useFeatureState<number>("stm-proj-rev-growth", 12);
  const [costGrowthPct, setCostGrowthPct] = useFeatureState<number>("stm-proj-cost-growth", 8);
  const [horizonMonths, setHorizonMonths] = useFeatureState<number>("stm-proj-horizon-months", 12);

  const proj = useMemo(() => {
    const m = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000 / 30));
    const annualise = (n: number) => (n / m) * 12; // scale the window to a full-year base
    const g = revGrowthPct / 100, cg = costGrowthPct / 100;
    const baseRev = annualise(pl.revenue);
    const baseCogs = annualise(pl.cogs);
    const basePayroll = annualise(pl.payroll);
    const baseOpex = annualise(pl.otherOpex);
    const baseDep = annualise(pl.depreciation);
    const baseInt = annualise(pl.interest);

    const horizon = Math.max(1, Math.min(36, Math.round(horizonMonths)));
    const yf = horizon / 12; // fraction of a year being projected
    const revenue = baseRev * (1 + g) * yf;
    const cogs = baseCogs * (1 + cg) * yf;
    const payroll = basePayroll * (1 + cg) * yf;
    const otherOpex = baseOpex * (1 + cg) * yf;
    const depreciation = baseDep * yf;
    const interest = baseInt * yf;
    const grossProfit = revenue - cogs;
    const ebitda = grossProfit - payroll - otherOpex;
    const ebit = ebitda - depreciation;
    const pbt = ebit - interest;
    const tax = pbt > 0 ? pbt * 0.25 : 0;
    const netProfit = pbt - tax;

    // Projected position assumes profit + depreciation add-back accrete to cash, no new capex/financing/dividends.
    const projectedCash = bs.cash + netProfit + depreciation;
    const projectedEquity = bs.totalEquity + netProfit;
    const projectedAssets = bs.totalAssets + netProfit + depreciation;
    return { revenue, cogs, grossProfit, payroll, otherOpex, ebitda, depreciation, ebit, interest, pbt, tax, netProfit, projectedCash, projectedEquity, projectedAssets, horizon };
  }, [pl, bs, revGrowthPct, costGrowthPct, horizonMonths]);

  const r = (n: number) => Math.round(n);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><LineChart size={14} className="text-[var(--color-primary)]" /> 3-Statement Forecast</h2>
        <p className="text-xs text-[var(--color-muted)]">A projected profit &amp; loss with the resulting cash and equity position, based on your {label} run-rate and the growth assumptions below. A planning model — not a statutory statement.</p>
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Assumptions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Revenue growth (% over period)</span>
            <input type="number" value={revGrowthPct}
              onChange={e => setRevGrowthPct(Number(e.target.value) || 0)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Cost growth (% over period)</span>
            <input type="number" value={costGrowthPct}
              onChange={e => setCostGrowthPct(Number(e.target.value) || 0)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Horizon (months, 1–36)</span>
            <input type="number" min={1} max={36} value={horizonMonths}
              onChange={e => setHorizonMonths(Math.max(1, Math.min(36, Number(e.target.value) || 1)))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Projected revenue", value: formatAmount(r(proj.revenue)), tone: "text-[var(--color-text)]" },
          { label: "Projected net profit", value: formatAmount(r(proj.netProfit)), tone: proj.netProfit >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Projected cash", value: formatAmount(r(proj.projectedCash)), tone: "text-[var(--color-primary)]" },
          { label: "Projected equity", value: formatAmount(r(proj.projectedEquity)), tone: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <Row label={`Projected P&L · next ${proj.horizon} months`} level={0} />
          <Row label="Revenue" value={r(proj.revenue)} accent="green" />
          <Row label="Cost of goods sold" value={-r(proj.cogs)} />
          <Row label="Gross profit" value={r(proj.grossProfit)} level={2} />
          <Row label="Payroll" value={-r(proj.payroll)} />
          <Row label="Other operating expenses" value={-r(proj.otherOpex)} />
          <Row label="EBITDA" value={r(proj.ebitda)} level={2} />
          <Row label="Depreciation & amortisation" value={-r(proj.depreciation)} />
          <Row label="Finance costs" value={-r(proj.interest)} />
          <Row label="Profit before tax" value={r(proj.pbt)} level={2} />
          <Row label="Income tax (est. 25%)" value={-r(proj.tax)} />
          <Row label="Projected net profit" value={r(proj.netProfit)} level={3} accent={proj.netProfit >= 0 ? "green" : "red"} />
        </div>
        <div className={`${CARD} p-5`}>
          <Row label="Projected Position (period end)" level={0} />
          <Row label="Opening cash (today)" value={bs.cash} />
          <Row label="Add: net profit retained" value={r(proj.netProfit)} />
          <Row label="Add: depreciation (non-cash)" value={r(proj.depreciation)} />
          <Row label="Projected cash" value={r(proj.projectedCash)} level={2} accent="blue" />
          <Row label="Opening equity (today)" value={bs.totalEquity} />
          <Row label="Add: retained profit" value={r(proj.netProfit)} />
          <Row label="Projected total equity" value={r(proj.projectedEquity)} level={2} />
          <Row label="Projected total assets" value={r(proj.projectedAssets)} level={3} accent="blue" />
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Built by annualising your {label} run-rate, then applying the growth assumptions across the chosen horizon. The projected position assumes profit and depreciation add to cash with no new capex, financing or dividends — adjust those manually for a fuller plan. Income tax is estimated at 25% of projected PBT.</p>
    </div>
  );
}

// ── Break-even & Operating Leverage ───────────────────────────────────────────────
function BreakEvenAnalysis({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  // What share of "other operating expenses" is fixed. COGS is treated as fully
  // variable; payroll, depreciation and finance cost are treated as fixed.
  const [fixedOpexPct, setFixedOpexPct] = useFeatureState<number>("stm-be-fixed-opex-pct", 70);

  const be = useMemo(() => {
    const fp = Math.max(0, Math.min(100, fixedOpexPct)) / 100;
    const variableCosts = pl.cogs + pl.otherOpex * (1 - fp);
    const fixedCosts = pl.payroll + pl.otherOpex * fp + pl.depreciation + pl.interest;
    const contribution = pl.revenue - variableCosts;
    const cmRatio = pl.revenue > 0 ? contribution / pl.revenue : 0;
    const breakEvenRevenue = cmRatio > 0 ? fixedCosts / cmRatio : 0;
    const marginOfSafety = pl.revenue - breakEvenRevenue;
    const marginOfSafetyPct = pl.revenue > 0 ? (marginOfSafety / pl.revenue) * 100 : 0;
    const dol = pl.ebit !== 0 ? contribution / pl.ebit : null; // degree of operating leverage
    return { variableCosts, fixedCosts, contribution, cmRatio, breakEvenRevenue, marginOfSafety, marginOfSafetyPct, dol };
  }, [pl, fixedOpexPct]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Crosshair size={14} className="text-[var(--color-primary)]" /> Break-even &amp; Operating Leverage</h2>
        <p className="text-xs text-[var(--color-muted)]">Splits your {label} costs into fixed and variable to find the revenue at which you cover all costs, the margin of safety, and how sensitive profit is to revenue (operating leverage).</p>
      </div>
      <div className={`${CARD} p-5`}>
        <label className="flex flex-col gap-1.5 max-w-md">
          <span className="text-xs text-[var(--color-muted)]">Fixed share of other operating expenses (%) — payroll, depreciation &amp; finance cost are treated as fixed; COGS as fully variable</span>
          <input type="range" min={0} max={100} value={fixedOpexPct}
            onChange={e => setFixedOpexPct(Number(e.target.value))}
            className="accent-[var(--color-primary)]" />
          <span className="text-sm font-bold tabular-nums">{Math.round(fixedOpexPct)}% fixed</span>
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Break-even revenue", value: formatAmount(Math.round(be.breakEvenRevenue)), tone: "text-[var(--color-primary)]" },
          { label: "Contribution margin", value: `${(be.cmRatio * 100).toFixed(1)}%`, tone: "text-[var(--color-text)]" },
          { label: "Margin of safety", value: `${be.marginOfSafetyPct.toFixed(0)}%`, tone: be.marginOfSafetyPct >= 20 ? "text-green-400" : "text-yellow-400" },
          { label: "Operating leverage (DOL)", value: be.dol === null ? "n/a" : `${be.dol.toFixed(2)}x`, tone: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${CARD} p-5`}>
          <Row label="Cost Behaviour" level={0} />
          <Row label="Revenue" value={pl.revenue} pct={100} accent="green" />
          <Row label="Variable costs (COGS + variable opex)" value={-Math.round(be.variableCosts)} pct={pl.revenue > 0 ? Math.round(be.variableCosts / pl.revenue * 100) : 0} />
          <Row label="Contribution margin" value={Math.round(be.contribution)} level={2} pct={Math.round(be.cmRatio * 100)} />
          <Row label="Fixed costs (payroll + fixed opex + dep + interest)" value={-Math.round(be.fixedCosts)} />
          <Row label="Operating profit (EBIT)" value={pl.ebit} level={3} accent={pl.ebit >= 0 ? "green" : "red"} />
        </div>
        <div className={`${CARD} p-5`}>
          <Row label="Break-even &amp; Safety" level={0} />
          <Row label="Break-even revenue" value={Math.round(be.breakEvenRevenue)} accent="blue" />
          <Row label="Actual revenue" value={pl.revenue} />
          <Row label="Margin of safety (₹)" value={Math.round(be.marginOfSafety)} level={2} accent={be.marginOfSafety >= 0 ? "green" : "red"} />
          <div className="flex items-center justify-between gap-3 px-1 py-1.5 border-t border-[var(--color-border)] mt-1 pt-2">
            <span className="text-sm font-bold">Margin of safety (%)</span>
            <span className={`tabular-nums text-base font-bold ${be.marginOfSafetyPct >= 0 ? "text-green-400" : "text-red-400"}`}>{be.marginOfSafetyPct.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between gap-3 px-1 py-1.5">
            <span className="text-sm">Degree of operating leverage</span>
            <span className="tabular-nums text-sm">{be.dol === null ? "n/a" : `${be.dol.toFixed(2)}x`}</span>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">COGS is taken as fully variable and payroll/depreciation/finance cost as fixed — adjust the fixed share of other operating expenses with the slider to match your cost structure. A DOL of {be.dol === null ? "n/a" : `${be.dol.toFixed(1)}x`} means a 1% change in revenue moves operating profit by about that multiple. Refine the fixed/variable split with your accountant.</p>
    </div>
  );
}

// ── Variance-to-Budget P&L ────────────────────────────────────────────────────────
function BudgetVariance({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  type BudgetKey = "revenue" | "cogs" | "payroll" | "otherOpex";
  const [budget, setBudget] = useFeatureState<Record<BudgetKey, number>>("stm-budget-targets", {
    revenue: 0, cogs: 0, payroll: 0, otherOpex: 0,
  });
  const setOne = (k: BudgetKey, v: number) => setBudget(b => ({ ...b, [k]: Math.max(0, v) }));

  const lines = useMemo(() => {
    // For revenue, favourable = actual above budget; for costs, favourable = actual below budget.
    const defs: { key: BudgetKey; label: string; actual: number; favIfAbove: boolean }[] = [
      { key: "revenue", label: "Revenue from operations", actual: pl.revenue, favIfAbove: true },
      { key: "cogs", label: "Cost of goods sold", actual: pl.cogs, favIfAbove: false },
      { key: "payroll", label: "Employee benefits (payroll)", actual: pl.payroll, favIfAbove: false },
      { key: "otherOpex", label: "Other operating expenses", actual: pl.otherOpex, favIfAbove: false },
    ];
    return defs.map(d => {
      const bud = budget[d.key];
      const variance = d.actual - bud;
      const variancePct = bud > 0 ? (variance / bud) * 100 : null;
      const favourable = d.favIfAbove ? variance >= 0 : variance <= 0;
      return { ...d, budget: bud, variance, variancePct, favourable };
    });
  }, [pl, budget]);

  const budgetEbitda = budget.revenue - budget.cogs - budget.payroll - budget.otherOpex;
  const actualEbitda = pl.ebitda;
  const ebitdaVariance = actualEbitda - budgetEbitda;
  const anyBudget = budget.revenue + budget.cogs + budget.payroll + budget.otherOpex > 0;

  const INPUTS: { key: BudgetKey; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "cogs", label: "COGS" },
    { key: "payroll", label: "Payroll" },
    { key: "otherOpex", label: "Other opex" },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Budget vs Actual P&amp;L</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter your budget for {label} and compare it line-by-line with actuals from your live data. Variances are flagged favourable or adverse with the percentage swing.</p>
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Budget targets (₹)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {INPUTS.map(inp => (
            <label key={inp.key} className="flex flex-col gap-1.5">
              <span className="text-xs text-[var(--color-muted)]">{inp.label}</span>
              <input type="number" min={0} value={budget[inp.key]}
                onChange={e => setOne(inp.key, Number(e.target.value) || 0)}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
            </label>
          ))}
        </div>
      </div>
      {!anyBudget ? (
        <div className={`${CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>Enter at least one budget figure above to see the variance analysis.</div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Line item", "Budget", "Actual", "Variance", "Variance %", "Status"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : i === 5 ? "text-center" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lines.map(l => (
                <tr key={l.key} className="hover:bg-white/2">
                  <td className="px-4 py-2 font-medium">{l.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(l.budget)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatAmount(l.actual)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${l.favourable ? "text-green-400" : "text-red-400"}`}>{amt(l.variance)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.variancePct === null ? "—" : `${l.variancePct >= 0 ? "+" : ""}${l.variancePct.toFixed(1)}%`}</td>
                  <td className={`px-4 py-2 text-center text-[10px] font-semibold ${l.favourable ? "text-green-400" : "text-red-400"}`}>{l.favourable ? "FAVOURABLE" : "ADVERSE"}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
                <td className="px-4 py-2">EBITDA</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(budgetEbitda)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatAmount(actualEbitda)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${ebitdaVariance >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(ebitdaVariance)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{budgetEbitda !== 0 ? `${ebitdaVariance >= 0 ? "+" : ""}${(ebitdaVariance / Math.abs(budgetEbitda) * 100).toFixed(1)}%` : "—"}</td>
                <td className={`px-4 py-2 text-center text-[10px] font-semibold ${ebitdaVariance >= 0 ? "text-green-400" : "text-red-400"}`}>{ebitdaVariance >= 0 ? "FAVOURABLE" : "ADVERSE"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Budget targets are saved with your data and persist across sessions and devices. Favourability is direction-aware: for revenue, above-budget is favourable; for costs, below-budget is favourable. EBITDA variance is the net effect across all four lines.</p>
    </div>
  );
}

// ── Monthly-Trend P&L ─────────────────────────────────────────────────────────────
function MonthlyTrendPL({ today }: { today: Date }) {
  const { store } = useApp();
  const months = useMemo(() => monthlyAggregates(store.transactions ?? [], 12, today), [store.transactions, today]);

  const stats = useMemo(() => {
    const totalRev = months.reduce((s, m) => s + m.revenue, 0);
    const totalExp = months.reduce((s, m) => s + m.expense, 0);
    const totalNet = totalRev - totalExp;
    const avgRev = months.length ? totalRev / months.length : 0;
    const profitable = months.filter(m => m.net > 0).length;
    const peak = months.reduce<{ revenue: number; label: string }>((a, b) => (b.revenue > a.revenue ? b : a), { revenue: 0, label: "—" });
    return { totalRev, totalExp, totalNet, avgRev, profitable, peakLabel: peak.label };
  }, [months]);

  const maxRev = Math.max(1, ...months.map(m => m.revenue));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><BarChart3 size={14} className="text-[var(--color-primary)]" /> Monthly-Trend P&amp;L</h2>
        <p className="text-xs text-[var(--color-muted)]">Revenue, expense and net month-by-month over the last 12 months, to smooth seasonality and reveal the trend a single-period statement hides.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "12-month revenue", value: formatAmount(stats.totalRev), tone: "text-[var(--color-text)]" },
          { label: "12-month net", value: formatAmount(stats.totalNet), tone: stats.totalNet >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Avg monthly revenue", value: formatAmount(Math.round(stats.avgRev)), tone: "text-[var(--color-text)]" },
          { label: "Profitable months", value: `${stats.profitable} / ${months.length}`, tone: stats.profitable >= months.length / 2 ? "text-green-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[560px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Month", "Revenue", "Expense", "Net", "Margin %", "Revenue trend"].map((h, i) => (
                <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 || i === 5 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {months.map(m => {
              const margin = m.revenue > 0 ? Math.round((m.net / m.revenue) * 100) : 0;
              return (
                <tr key={m.key} className="hover:bg-white/2">
                  <td className="px-4 py-2 font-medium">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-400">{formatAmount(m.revenue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(m.expense)})</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${m.net >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(m.net)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${margin >= 0 ? "" : "text-red-400"}`}>{margin}%</td>
                  <td className="px-4 py-2">
                    <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden w-full min-w-[80px]">
                      <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${Math.round((m.revenue / maxRev) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-green-400">{formatAmount(stats.totalRev)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(stats.totalExp)})</td>
              <td className={`px-4 py-2 text-right tabular-nums ${stats.totalNet >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(stats.totalNet)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{stats.totalRev > 0 ? Math.round((stats.totalNet / stats.totalRev) * 100) : 0}%</td>
              <td className="px-4 py-2 text-[10px] text-[var(--color-muted)]">Peak: {stats.peakLabel}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Net here is cash-basis revenue less total expense per month (a simplified P&amp;L trend), so it differs slightly from the statutory net profit, which also charges depreciation, interest and estimated tax. Use this for momentum and seasonality reading.</p>
    </div>
  );
}

// ── Expense Schedule by Head — supporting schedule of operating expenses ───────────
// A Schedule-III "Note" style breakdown: aggregates every expense/payroll cash
// outflow in the window by counterparty (expense head), ranked, with % of total
// and % of revenue — the supporting annexure behind the P&L "other expenses" line.
function ExpenseSchedule({ start, end, label }: { start: string; end: string; label: string }) {
  const { store } = useApp();
  const { firm } = store;
  const pl = useMemo(() => incomeStatement(store, start, end), [store, start, end]);

  const heads = useMemo(() => {
    const inWin = (d: string) => d >= start && d <= end;
    const txns = (store.transactions ?? []).filter(t => inWin(t.date) && t.amount < 0 && (t.category === "expense" || t.category === "payroll"));
    const byHead = new Map<string, { amount: number; count: number; payroll: boolean }>();
    for (const t of txns) {
      const k = t.counterparty?.trim() || "Unattributed";
      const cur = byHead.get(k) ?? { amount: 0, count: 0, payroll: false };
      cur.amount += Math.abs(t.amount);
      cur.count += 1;
      if (t.category === "payroll") cur.payroll = true;
      byHead.set(k, cur);
    }
    const rows = [...byHead.entries()]
      .map(([head, v]) => ({ head, ...v }))
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total };
  }, [store.transactions, start, end]);

  const sharePct = (n: number) => (heads.total > 0 ? Math.round((n / heads.total) * 1000) / 10 : 0);
  const revPct = (n: number) => (pl.revenue > 0 ? Math.round((n / pl.revenue) * 1000) / 10 : 0);

  const doExport = () => {
    const body = heads.rows.map(r => [r.head, r.payroll ? "Employee benefits" : "Operating", r.count, r.amount, `${sharePct(r.amount)}%`]) as (string | number)[][];
    body.push(["TOTAL", "", heads.rows.reduce((s, r) => s + r.count, 0), heads.total, "100%"]);
    exportPdf(`expense-schedule-${end}.pdf`, `${firm.name} — Expense Schedule by Head`, `${label} · generated by Headroom`,
      [{ title: "Schedule of Operating Expenses", head: ["Expense head", "Nature", "Entries", "Amount (₹)", "% of total"], body }]);
    toast.success("PDF downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className={`${CARD} p-5 flex-1`}>
          <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Rows3 size={14} className="text-[var(--color-primary)]" /> Expense Schedule by Head</h2>
          <p className="text-xs text-[var(--color-muted)]">Supporting schedule behind the P&amp;L expense lines for {label}: every operating and payroll outflow grouped by counterparty, ranked by spend, with share of total cost and of revenue.</p>
        </div>
        <button onClick={doExport}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] px-3 py-2 rounded-lg hover:text-[var(--color-text)] hover:border-[var(--color-primary)] transition-colors">
          <FileDown size={13} /> PDF
        </button>
      </div>
      {heads.rows.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No operating or payroll outflows in this period to schedule.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total operating spend", value: formatAmount(heads.total), tone: "text-red-400" },
              { label: "Distinct expense heads", value: String(heads.rows.length), tone: "text-[var(--color-text)]" },
              { label: "Largest head % of total", value: `${sharePct(heads.rows[0].amount)}%`, tone: "text-[var(--color-text)]" },
              { label: "Total cost % of revenue", value: `${revPct(heads.total)}%`, tone: revPct(heads.total) <= 85 ? "text-green-400" : "text-yellow-400" },
            ].map(c => (
              <div key={c.label} className={`${CARD} p-4`}>
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Expense head", "Nature", "Entries", "Amount", "% of total", "% of revenue"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 || i === 1 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {heads.rows.map(r => (
                  <tr key={r.head} className="hover:bg-white/2">
                    <td className="px-4 py-2 font-medium max-w-[220px] truncate">{r.head}</td>
                    <td className="px-4 py-2 text-[var(--color-muted)] text-xs">{r.payroll ? "Employee benefits" : "Operating"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{r.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(r.amount)})</td>
                    <td className="px-4 py-2 text-right tabular-nums">{sharePct(r.amount)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{revPct(r.amount)}%</td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
                  <td className="px-4 py-2" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{heads.rows.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(heads.total)})</td>
                  <td className="px-4 py-2 text-right tabular-nums">100%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{revPct(heads.total)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Expense heads are derived from the transaction counterparty as a working proxy for a ledger group. Depreciation, finance cost and estimated tax are non-cash / financing items and are excluded here — they appear on the face of the P&amp;L. Reclassify heads to statutory expense categories with your CA.</p>
    </div>
  );
}

// ── Related-Party Disclosure (AS-18 / Ind AS 24) ──────────────────────────────────
// Auto-flags counterparties as potential related parties (you toggle the flag) and
// builds the disclosure note: transactions and year-end balances with each party.
function RelatedPartyDisclosure({ start, end, asOf, label }: { start: string; end: string; asOf: Date; label: string }) {
  const { store } = useApp();

  // Persisted list of counterparties you have confirmed as related parties.
  const [related, setRelated] = useFeatureState<Record<string, boolean>>("stm-related-parties", {});

  const parties = useMemo(() => {
    const inWin = (d: string) => d >= start && d <= end;
    const txns = (store.transactions ?? []).filter(t => inWin(t.date) && t.category !== "transfer");
    const byParty = new Map<string, { sales: number; purchases: number; loans: number; count: number }>();
    for (const t of txns) {
      const k = t.counterparty?.trim();
      if (!k) continue;
      const cur = byParty.get(k) ?? { sales: 0, purchases: 0, loans: 0, count: 0 };
      if (t.category === "revenue" && t.amount > 0) cur.sales += t.amount;
      else if (t.category === "loan") cur.loans += t.amount;
      else if (t.amount < 0) cur.purchases += Math.abs(t.amount);
      cur.count += 1;
      byParty.set(k, cur);
    }
    return [...byParty.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.sales + v.purchases + Math.abs(v.loans) }))
      .sort((a, b) => b.total - a.total);
  }, [store.transactions, start, end]);

  const flagged = parties.filter(p => related[p.name]);
  const totals = useMemo(() => ({
    sales: flagged.reduce((s, p) => s + p.sales, 0),
    purchases: flagged.reduce((s, p) => s + p.purchases, 0),
    loans: flagged.reduce((s, p) => s + p.loans, 0),
  }), [flagged]);

  const toggle = (name: string) => setRelated(r => ({ ...r, [name]: !r[name] }));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Network size={14} className="text-[var(--color-primary)]" /> Related-Party Disclosure (AS-18 / Ind AS 24)</h2>
        <p className="text-xs text-[var(--color-muted)]">Mark which counterparties are related parties (directors, group entities, KMP, relatives). Headroom then compiles the disclosure of transactions for {label} and balances as at {iso(asOf)}.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 ${CARD} overflow-x-auto`}>
          <div className="px-5 py-3 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold">Counterparties — tag related parties</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Top counterparties by total dealing value. Tap the toggle to include a party in the disclosure note.</p>
          </div>
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Counterparty", "Sales to", "Purchases from", "Loan flows", "Related?"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : i === 4 ? "text-center" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {parties.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No counterparty transactions in this period.</td></tr>
              ) : parties.slice(0, 20).map(p => (
                <tr key={p.name} className={`hover:bg-white/2 ${related[p.name] ? "bg-[var(--color-primary)]/5" : ""}`}>
                  <td className="px-4 py-2 font-medium max-w-[200px] truncate">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-400">{p.sales > 0 ? formatAmount(p.sales) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">{p.purchases > 0 ? formatAmount(p.purchases) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.loans !== 0 ? amt(p.loans) : "—"}</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => toggle(p.name)}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${related[p.name] ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"}`}>
                      {related[p.name] ? "RELATED" : "Tag"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className={`${CARD} p-5`}>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Disclosure Summary</p>
            <Row label="Sales to related parties" value={totals.sales} accent="green" />
            <Row label="Purchases from related parties" value={-totals.purchases} />
            <Row label="Net loans/advances" value={totals.loans} />
            <Row label="Related parties tagged" />
            <div className="flex items-center justify-between gap-3 px-1 py-1.5 border-t-2 border-[var(--color-border)] mt-1 pt-2.5">
              <span className="text-sm font-bold">Parties in disclosure</span>
              <span className="tabular-nums text-base font-bold text-[var(--color-primary)]">{flagged.length}</span>
            </div>
          </div>
          <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg p-3 flex gap-2">
            <Info size={13} className="text-[var(--color-muted)] shrink-0 mt-px" />
            <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
              Ind AS 24 / AS-18 require disclosure of the relationship, the transactions, and outstanding balances with each related party. Headroom cannot infer relationships, so you confirm each one; the note compiles from your live transactions.
            </p>
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Tagging persists with your data across sessions. Relationships (holding/subsidiary/associate/KMP) and the basis of pricing must be stated in the final note — agree the related-party list and disclosures with your CA before signing.</p>
    </div>
  );
}

// ── Contingent Liabilities & Commitments Register (Schedule III note) ──────────────
// Off-balance-sheet exposures (guarantees, litigation, capital commitments) that
// feed the contingent-liability note. Entries persist with the firm's data.
function ContingentLiabilities({ asOf }: { asOf: Date }) {
  type CType = "guarantee" | "litigation" | "commitment" | "other";
  interface CItem { id: string; particulars: string; type: CType; amount: number; likelihood: "remote" | "possible" | "probable" }
  const [items, setItems] = useFeatureState<CItem[]>("stm-contingent-items", []);
  const [draft, setDraft] = useState<{ particulars: string; type: CType; amount: string; likelihood: CItem["likelihood"] }>({
    particulars: "", type: "guarantee", amount: "", likelihood: "possible",
  });

  const TYPES: { id: CType; label: string }[] = [
    { id: "guarantee", label: "Bank guarantee / surety" },
    { id: "litigation", label: "Claims & litigation" },
    { id: "commitment", label: "Capital commitment" },
    { id: "other", label: "Other contingency" },
  ];
  const typeLabel = (t: CType) => TYPES.find(x => x.id === t)?.label ?? t;

  const add = () => {
    const amount = Number(draft.amount) || 0;
    if (!draft.particulars.trim() || amount <= 0) { toast.error("Enter particulars and an amount"); return; }
    setItems(list => [...list, { id: `cl-${Date.now()}`, particulars: draft.particulars.trim(), type: draft.type, amount, likelihood: draft.likelihood }]);
    setDraft({ particulars: "", type: "guarantee", amount: "", likelihood: "possible" });
    toast.success("Contingency added");
  };
  const remove = (id: string) => setItems(list => list.filter(i => i.id !== id));

  const byType = useMemo(() => {
    const m = new Map<CType, number>();
    for (const i of items) m.set(i.type, (m.get(i.type) ?? 0) + i.amount);
    return m;
  }, [items]);
  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const tone = (l: CItem["likelihood"]) => l === "probable" ? "text-red-400" : l === "possible" ? "text-yellow-400" : "text-[var(--color-muted)]";

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Contingent Liabilities &amp; Commitments</h2>
        <p className="text-xs text-[var(--color-muted)]">Register of off-balance-sheet exposures — guarantees, litigation and capital commitments — feeding the Schedule III contingent-liability note, as at {iso(asOf)}.</p>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Add a contingency</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs text-[var(--color-muted)]">Particulars</span>
            <input type="text" value={draft.particulars} placeholder="e.g. BG to GST dept"
              onChange={e => setDraft(d => ({ ...d, particulars: e.target.value }))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Type</span>
            <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value as CType }))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none">
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Amount (₹)</span>
            <input type="number" min={0} value={draft.amount}
              onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-[var(--color-muted)]">Likelihood of outflow</span>
            <select value={draft.likelihood} onChange={e => setDraft(d => ({ ...d, likelihood: e.target.value as CItem["likelihood"] }))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none">
              <option value="remote">Remote</option>
              <option value="possible">Possible (disclose)</option>
              <option value="probable">Probable (provide)</option>
            </select>
          </label>
          <div className="flex items-end">
            <button onClick={add}
              className="w-full text-xs font-medium bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity">
              Add to register
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TYPES.map(t => (
          <div key={t.id} className={`${CARD} p-4`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{t.label}</p>
            <p className="text-lg font-bold tabular-nums">{formatAmount(byType.get(t.id) ?? 0)}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm text-[var(--color-muted)]`}>No contingencies recorded. Add guarantees, claims or commitments above so they are not forgotten at year-end.</div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Particulars", "Type", "Likelihood", "Amount", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 || i === 1 ? "text-left" : i === 4 ? "text-center" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map(i => (
                <tr key={i.id} className="hover:bg-white/2">
                  <td className="px-4 py-2 font-medium max-w-[240px] truncate">{i.particulars}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)] text-xs">{typeLabel(i.type)}</td>
                  <td className={`px-4 py-2 text-xs font-semibold capitalize ${tone(i.likelihood)}`}>{i.likelihood}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatAmount(i.amount)}</td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => remove(i.id)} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 transition-colors">Remove</button>
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
                <td className="px-4 py-2" colSpan={3}>Total contingent liabilities &amp; commitments</td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--color-primary)]">{formatAmount(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Per AS-29 / Ind AS 37, a probable outflow that can be reliably estimated is a provision (recognised on the balance sheet), while a possible obligation is disclosed as a contingent liability. This register is a working note — finalise recognition vs disclosure with your CA.</p>
    </div>
  );
}

// ── Cash-Flow Ratios & Driver Analysis ────────────────────────────────────────────
// Quality-of-earnings and coverage ratios built on the direct-method cash flow,
// plus a decomposition of the change in cash into operating / financing drivers.
function CashFlowRatios({ today }: { today: Date }) {
  const { store } = useApp();
  const fy = useMemo(() => fyBounds(today), [today]);
  const cf = useMemo(() => cashFlowStatement(store, fy.start, iso(today), today), [store, fy, today]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);
  const bs = useMemo(() => balanceSheet(store, today), [store, today]);

  const r = useMemo(() => {
    const div = (a: number, b: number) => (b === 0 ? null : a / b);
    return {
      ocfMargin: div(cf.operating, pl.revenue),                       // operating cash ÷ revenue
      cashConversion: div(cf.operating, pl.ebitda),                   // EBITDA → cash conversion
      qualityOfEarnings: div(cf.operating, pl.netProfit),             // OCF ÷ net profit
      cashDebtCoverage: div(cf.operating, bs.totalLiabilities),       // OCF ÷ total debt+payables
      cashInterestCover: div(cf.operating + pl.interest, pl.interest),// (OCF+interest) ÷ interest
      cashReturnOnAssets: div(cf.operating, bs.totalAssets),          // OCF ÷ total assets
    };
  }, [cf, pl, bs]);

  const f1 = (n: number | null, suffix = "x") => (n === null ? "n/a" : `${n.toFixed(2)}${suffix}`);
  const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

  // Driver decomposition: how each bucket moved cash this period.
  const drivers = [
    { label: "Operating activities", value: cf.operating },
    { label: "Investing activities", value: cf.investing },
    { label: "Financing activities", value: cf.financing },
  ];
  const absTotal = Math.max(1, drivers.reduce((s, d) => s + Math.abs(d.value), 0));

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Cash-Flow Ratios &amp; Driver Analysis</h2>
        <p className="text-xs text-[var(--color-muted)]">Quality-of-earnings and cash-coverage ratios built on the direct-method cash flow for {fy.label} (YTD), plus a breakdown of what drove the change in cash.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <RatioCard name="Operating Cash-Flow Margin" formula="Operating cash flow ÷ revenue" value={pct(r.ocfMargin)} target="≥ 10%" ok={r.ocfMargin === null ? null : r.ocfMargin >= 0.1} />
        <RatioCard name="Cash Conversion (EBITDA)" formula="Operating cash flow ÷ EBITDA" value={pct(r.cashConversion)} target="≥ 80%" ok={r.cashConversion === null ? null : r.cashConversion >= 0.8} />
        <RatioCard name="Quality of Earnings" formula="Operating cash flow ÷ net profit" value={f1(r.qualityOfEarnings)} target="≥ 1.0x" ok={r.qualityOfEarnings === null ? null : r.qualityOfEarnings >= 1} />
        <RatioCard name="Cash Debt Coverage" formula="Operating cash flow ÷ total liabilities" value={pct(r.cashDebtCoverage)} target="≥ 20%" ok={r.cashDebtCoverage === null ? null : r.cashDebtCoverage >= 0.2} />
        <RatioCard name="Cash Interest Coverage" formula="(Operating cash + interest) ÷ interest" value={f1(r.cashInterestCover)} target="≥ 3.0x" ok={r.cashInterestCover === null ? null : r.cashInterestCover >= 3} />
        <RatioCard name="Cash Return on Assets" formula="Operating cash flow ÷ total assets" value={pct(r.cashReturnOnAssets)} target="≥ 10%" ok={r.cashReturnOnAssets === null ? null : r.cashReturnOnAssets >= 0.1} />
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">What drove the change in cash</p>
        <div className="space-y-3">
          {drivers.map(d => (
            <div key={d.label}>
              <div className="flex items-center justify-between gap-3 text-sm mb-1">
                <span>{d.label}</span>
                <span className={`tabular-nums font-semibold ${d.value >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(d.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden w-full">
                <div className={`h-full rounded-full ${d.value >= 0 ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${Math.round((Math.abs(d.value) / absTotal) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 px-1 py-1.5 border-t-2 border-[var(--color-border)] mt-3 pt-2.5">
          <span className="text-sm font-bold">Net change in cash</span>
          <span className={`tabular-nums text-base font-bold ${cf.netChange >= 0 ? "text-green-400" : "text-red-400"}`}>{amt(cf.netChange)}</span>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A quality-of-earnings ratio below 1.0x means profit is not yet converting to cash — usually receivables or inventory tying up working capital. Cash-coverage ratios use period-end balances; capex is not yet tracked, so investing cash is nil. Read alongside the indirect cash-flow tab for the working-capital detail.</p>
    </div>
  );
}

// ── Provisions & Reserves Movement Schedule ───────────────────────────────────────
// Opening → additions → utilisation → closing roll-forward for each reserve, built
// from the year-on-year balance-sheet deltas, with persisted manual provision lines.
function ProvisionsReserves({ today }: { today: Date }) {
  const { store } = useApp();
  const priorDate = useMemo(() => new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), [today]);
  const cur = useMemo(() => balanceSheet(store, today), [store, today]);
  const prior = useMemo(() => balanceSheet(store, priorDate), [store, priorDate]);
  const fy = useMemo(() => fyBounds(today), [today]);
  const pl = useMemo(() => incomeStatement(store, fy.start, iso(today)), [store, fy, today]);

  interface PRow { label: string; opening: number; additions: number; utilisation: number }
  // Derived reserve roll-forwards from the live balance sheet.
  const derived = useMemo<PRow[]>(() => {
    const reserveAdd = pl.netProfit;                                    // profit transferred to reserves
    const reserveOther = (cur.retainedEarnings - prior.retainedEarnings) - pl.netProfit; // dividends/adjustments
    return [
      { label: "Reserves & surplus (retained earnings)", opening: prior.retainedEarnings, additions: Math.max(0, reserveAdd), utilisation: Math.max(0, -reserveAdd) + Math.max(0, -reserveOther) },
      { label: "Tax provision (current year)", opening: 0, additions: pl.tax, utilisation: 0 },
      { label: "GST / statutory dues payable", opening: prior.gstPayable, additions: Math.max(0, cur.gstPayable - prior.gstPayable), utilisation: Math.max(0, prior.gstPayable - cur.gstPayable) },
    ];
  }, [cur, prior, pl]);

  // Persisted manual provision lines (e.g. gratuity, warranty, doubtful debts).
  const [manual, setManual] = useFeatureState<PRow[]>("stm-provisions-manual", []);
  const [draft, setDraft] = useState<{ label: string; opening: string; additions: string; utilisation: string }>({
    label: "", opening: "", additions: "", utilisation: "",
  });
  const add = () => {
    if (!draft.label.trim()) { toast.error("Enter a provision name"); return; }
    setManual(list => [...list, {
      label: draft.label.trim(),
      opening: Number(draft.opening) || 0,
      additions: Number(draft.additions) || 0,
      utilisation: Number(draft.utilisation) || 0,
    }]);
    setDraft({ label: "", opening: "", additions: "", utilisation: "" });
    toast.success("Provision added");
  };
  const removeManual = (idx: number) => setManual(list => list.filter((_, i) => i !== idx));

  const rows = useMemo(() => [...derived, ...manual].map(r => ({ ...r, closing: r.opening + r.additions - r.utilisation })), [derived, manual]);
  const totals = useMemo(() => rows.reduce((a, r) => ({
    opening: a.opening + r.opening, additions: a.additions + r.additions,
    utilisation: a.utilisation + r.utilisation, closing: a.closing + r.closing,
  }), { opening: 0, additions: 0, utilisation: 0, closing: 0 }), [rows]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><HandCoins size={14} className="text-[var(--color-primary)]" /> Provisions &amp; Reserves Movement</h2>
        <p className="text-xs text-[var(--color-muted)]">Opening → additions → utilisation → closing roll-forward for each reserve and provision for {fy.label}, derived from the balance sheet (vs {prior.asOf}). Add manual provisions (gratuity, warranty, doubtful debts) below.</p>
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] mb-3">Add a manual provision</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs text-[var(--color-muted)]">Provision name</span>
            <input type="text" value={draft.label} placeholder="e.g. Provision for gratuity"
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none" />
          </label>
          {([["opening", "Opening"], ["additions", "Additions"], ["utilisation", "Utilised"]] as const).map(([k, lbl]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="text-xs text-[var(--color-muted)]">{lbl} (₹)</span>
              <input type="number" min={0} value={draft[k]}
                onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums focus:border-[var(--color-primary)] outline-none" />
            </label>
          ))}
        </div>
        <button onClick={add}
          className="mt-3 text-xs font-medium bg-[var(--color-primary)] text-[var(--color-bg)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
          Add provision
        </button>
      </div>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Provision / reserve", "Opening", "Additions", "Utilisation", "Closing", ""].map((h, i) => (
                <th key={h || "act"} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : i === 5 ? "text-center" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r, i) => {
              const isManual = i >= derived.length;
              return (
                <tr key={`${r.label}-${i}`} className="hover:bg-white/2">
                  <td className="px-4 py-2 font-medium max-w-[240px] truncate">{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[var(--color-muted)]">{formatAmount(r.opening)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-400">{formatAmount(r.additions)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(r.utilisation)})</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatAmount(r.closing)}</td>
                  <td className="px-4 py-2 text-center">
                    {isManual && <button onClick={() => removeManual(i - derived.length)} className="text-[10px] text-[var(--color-muted)] hover:text-red-400 transition-colors">Remove</button>}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[var(--color-accent)]/30 font-bold border-t-2 border-[var(--color-border)]">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatAmount(totals.opening)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-green-400">{formatAmount(totals.additions)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-red-400">({formatAmount(totals.utilisation)})</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--color-primary)]">{formatAmount(totals.closing)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Reserve and statutory-dues movements are derived from year-on-year balance-sheet deltas; the tax-provision line shows the period's estimated charge. Employee, warranty and doubtful-debt provisions are not in the cash ledger — add them manually so the rollforward is complete. Confirm recognition with your CA.</p>
    </div>
  );
}
