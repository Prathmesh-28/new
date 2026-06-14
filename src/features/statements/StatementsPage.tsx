import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { incomeStatement, balanceSheet, cashFlowStatement, monthlyCashFlow } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { exportExcel, exportPdf } from "@/lib/exporters";
import {
  FileSpreadsheet, FileDown, Sheet as SheetIcon, Info, Scale, TrendingUp, Wallet, Building2,
  Repeat, FileStack, NotebookPen, Columns3, PieChart,
} from "lucide-react";
import { toast } from "sonner";
import FixedAssetRegister from "./FixedAssetRegister";

type Tab =
  | "income" | "balance" | "cashflow" | "assets"
  | "as3-cashflow" | "schedule3" | "notes" | "comparative" | "segment";
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

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "income",        label: "Income Statement", icon: TrendingUp },
    { id: "balance",       label: "Balance Sheet",    icon: Scale },
    { id: "cashflow",      label: "Cash Flow",        icon: Wallet },
    { id: "assets",        label: "Fixed Assets",     icon: Building2 },
    { id: "as3-cashflow",  label: "AS-3 Cash Flow",   icon: Repeat },
    { id: "schedule3",     label: "Schedule III",     icon: FileStack },
    { id: "notes",         label: "Notes to Accounts", icon: NotebookPen },
    { id: "comparative",   label: "Comparative",      icon: Columns3 },
    { id: "segment",       label: "Segment Report",   icon: PieChart },
  ];
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
