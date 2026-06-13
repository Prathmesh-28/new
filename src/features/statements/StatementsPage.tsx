import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { incomeStatement, balanceSheet, cashFlowStatement, monthlyCashFlow } from "@/lib/finance";
import { formatAmount, formatCurrency } from "@/lib/utils";
import { exportExcel, exportPdf } from "@/lib/exporters";
import { FileSpreadsheet, FileDown, Sheet as SheetIcon, Info, Scale, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

type Tab = "income" | "balance" | "cashflow";
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
    { id: "income",   label: "Income Statement", icon: TrendingUp },
    { id: "balance",  label: "Balance Sheet",    icon: Scale },
    { id: "cashflow", label: "Cash Flow",        icon: Wallet },
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
      </div>

      {/* Period selector */}
      {tab !== "balance" && (
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
            <Row label="Depreciation & amortisation" value={-pl.depreciation} note="estimated at 1.5% of revenue" />
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
                Derived from revenue, expense and payroll transactions. COGS uses goods received from suppliers; depreciation and income tax are estimates until you add a fixed-asset register.
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
            <Row label="Fixed assets (net)" value={bs.fixedAssetsNet} note="estimated" />
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
    </div>
  );
}
