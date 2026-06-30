import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import {
  FileBarChart, Download, RefreshCw, Scale, FileSpreadsheet,
  BookOpen, GitCompareArrows, Target, Users, Package, FolderKanban,
  FileCode2, FileJson, TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - response shapes mirror backend/src/modules/books/reports.js
// ─────────────────────────────────────────────────────────────────────────────
interface Sch3Line { name: string; group: string; amount: string }
interface Sch3Block { lines: Sch3Line[]; subtotal: string }
interface ScheduleIII {
  balanceSheet: {
    financialYear: string;
    asOf: string | null;
    equityAndLiabilities: { shareholdersFunds: Sch3Line[]; nonCurrentLiabilities: Sch3Line[]; currentLiabilities: Sch3Line[]; total: string };
    assets: { nonCurrentAssets: Sch3Line[]; currentAssets: Sch3Line[]; total: string };
    balanced: boolean;
  };
  statementOfPL: {
    financialYear: string;
    asOf: string | null;
    revenueFromOperations: Sch3Block;
    otherIncome: Sch3Block;
    totalRevenue: string;
    expenses: Sch3Block;
    totalExpenses: string;
    profitBeforeTax: string;
  };
  priorYear?: { financialYear: string; available: boolean };
}

interface AgingParty {
  ledgerId: string;
  name: string;
  notDue: string; d0_30: string; d31_60: string; d61_90: string; d90plus: string;
  total: string;
}
interface AgingReport {
  asOf: string;
  parties: AgingParty[];
  totals: { notDue: string; d0_30: string; d31_60: string; d61_90: string; d90plus: string; total: string };
}

interface DayBookEntry { ledger: string; debit: string; credit: string }
interface DayBookVoucher {
  id: string;
  voucher_type: string;
  voucher_number: string;
  voucher_date: string;
  narration: string | null;
  reference: string | null;
  is_cancelled: boolean;
  entries: DayBookEntry[];
}

interface ComparativePL {
  current: { fy: string; totalIncome: string; totalExpense: string; netProfit: string };
  previous: { fy: string; totalIncome: string; totalExpense: string; netProfit: string };
}

interface ProfRow {
  ledgerId?: string; itemId?: string; projectId?: string;
  party?: string; name?: string;
  unit?: string; status?: string;
  revenue?: string; salesValue?: string; qtySold?: string;
  cost: string;
  grossMargin?: string; grossProfit?: string;
  marginPct: string;
  costDerivable?: boolean; salesDerivable?: boolean;
}
interface ProfReport {
  financialYear: string;
  rows: ProfRow[];
  totals: { revenue?: string; salesValue?: string; cost: string; grossMargin?: string; grossProfit?: string; marginPct: string };
}

interface BudgetReport {
  financialYear: string;
  rows: { ledger: string; budget: string; actual: string; variance: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Indian financial year for a date (1 Apr → 31 Mar). Returns "YYYY-YY".
function currentFy(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

// Render a backend money string (already "1234.56") with Indian grouping + ₹.
function rupee(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return `₹${String(v ?? "0")}`;
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  // Indian grouping: last 3 digits, then groups of 2.
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return `${neg ? "-" : ""}₹${grouped}.${decPart}`;
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-50";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[140px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Card({
  title, icon, children, action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[var(--color-primary)]">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function TableShell({ head, children, cols }: { head: React.ReactNode; children: React.ReactNode; cols: number }) {
  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
      <table className="w-full text-sm border-collapse" data-cols={cols}>
        <thead>
          <tr className="border-b border-[var(--color-border)]">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-[var(--color-muted)]">{text}</td>
    </tr>
  );
}

// Download a JSON or text blob to the browser.
function saveBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksReportsProTab() {
  const [fy, setFy] = useState(currentFy());
  const [asOf, setAsOf] = useState(todayIso());

  return (
    <div className="space-y-6">
      {/* HEADER + HOW TO USE */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileBarChart size={18} className="text-[var(--color-primary)]" />
          Advanced financial reports
        </h2>
        <div className="mt-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-xs text-[var(--color-muted)] leading-relaxed">
          <span className="font-semibold text-[var(--color-fg)]">How to use:</span> Pick a financial
          year (Apr-Mar, e.g. <span className="font-mono">{currentFy()}</span>) and an
          "as-of" date, then load any report. Schedule III gives the statutory P&amp;L and
          balance sheet; aging shows what each party owes you (AR) or you owe them (AP);
          the day-book lists every voucher in a date range. Use the download buttons to
          export a Tally-importable XML or the GSTR-1 portal JSON.
        </div>
      </div>

      {/* GLOBAL CONTROLS */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className={labelCls}>Financial year (YYYY-YY)</label>
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value.trim() || currentFy())}
            placeholder="2026-27"
            className={`${inputCls} font-mono w-40`}
          />
        </div>
        <div>
          <label className={labelCls}>As of date</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value || todayIso())} className={inputCls} />
        </div>
        <DownloadButtons fy={fy} />
      </div>

      {/* SCHEDULE III */}
      <ScheduleIIICard fy={fy} asOf={asOf} />

      {/* COMPARATIVE P&L */}
      <ComparativePLCard fy={fy} />

      {/* AR + AP AGING */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <AgingCard kind="ar" asOf={asOf} />
        <AgingCard kind="ap" asOf={asOf} />
      </div>

      {/* DAY BOOK */}
      <DayBookCard />

      {/* BUDGET vs ACTUAL */}
      <BudgetVsActualCard fy={fy} />

      {/* PROFITABILITY */}
      <ProfitabilityCard fy={fy} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD BUTTONS - Tally XML + GSTR-1 JSON
// ─────────────────────────────────────────────────────────────────────────────
function DownloadButtons({ fy }: { fy: string }) {
  const [tallyBusy, setTallyBusy] = useState(false);
  const [gstrBusy, setGstrBusy] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  const downloadTally = useCallback(async () => {
    setTallyBusy(true);
    try {
      const xml = await api.get<string>(`/api/books/reports/tally-xml?fy=${encodeURIComponent(fy)}`);
      // backend sends application/xml; api.get parses JSON only on json responses - guard for both.
      const text = typeof xml === "string" ? xml : JSON.stringify(xml);
      saveBlob(text, "application/xml", `tally-${fy}.xml`);
      toast.success(`Downloaded tally-${fy}.xml`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setTallyBusy(false);
    }
  }, [fy]);

  const downloadGstr1 = useCallback(async () => {
    setGstrBusy(true);
    try {
      const data = await api.get<unknown>(`/api/books/gst/gstr1-json?period=${encodeURIComponent(period)}`);
      saveBlob(JSON.stringify(data, null, 2), "application/json", `gstr1-${period}.json`);
      toast.success(`Downloaded gstr1-${period}.json`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGstrBusy(false);
    }
  }, [period]);

  return (
    <div className="ml-auto flex flex-wrap items-end gap-3">
      <button type="button" onClick={downloadTally} disabled={tallyBusy} className={btnGhost}>
        {tallyBusy ? <RefreshCw size={14} className="animate-spin" /> : <FileCode2 size={14} />}
        Tally XML
      </button>
      <div className="flex items-end gap-2">
        <div>
          <label className={labelCls}>GSTR-1 period</label>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value || new Date().toISOString().slice(0, 7))}
            className={inputCls}
          />
        </div>
        <button type="button" onClick={downloadGstr1} disabled={gstrBusy} className={btnPrimary}>
          {gstrBusy ? <RefreshCw size={14} className="animate-spin" /> : <FileJson size={14} />}
          GSTR-1 JSON
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE III - statutory P&L + balance sheet
// ─────────────────────────────────────────────────────────────────────────────
function Sch3Section({ title, lines, subtotal }: { title: string; lines: Sch3Line[]; subtotal?: string }) {
  return (
    <>
      <tr className="bg-[var(--color-bg)]">
        <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]" colSpan={2}>{title}</td>
      </tr>
      {lines.length === 0 ? (
        <tr><td className="px-3 py-2 text-[var(--color-muted)] text-xs" colSpan={2}>- none -</td></tr>
      ) : (
        lines.map((l, i) => (
          <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
            <td className="px-3 py-2 pl-6">{l.name}<span className="ml-2 text-[10px] text-[var(--color-muted)]">{l.group}</span></td>
            <td className="px-3 py-2 text-right tabular-nums">{rupee(l.amount)}</td>
          </tr>
        ))
      )}
      {subtotal != null && (
        <tr className="border-b border-[var(--color-border)]">
          <td className="px-3 py-2 text-right text-xs font-semibold text-[var(--color-muted)]">Subtotal</td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(subtotal)}</td>
        </tr>
      )}
    </>
  );
}

function ScheduleIIICard({ fy, asOf }: { fy: string; asOf: string }) {
  const [data, setData] = useState<ScheduleIII | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<ScheduleIII>(
        `/api/books/reports/schedule-iii?fy=${encodeURIComponent(fy)}&asOf=${encodeURIComponent(asOf)}`,
      );
      setData(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [fy, asOf]);

  useEffect(() => { void load(); }, [load]);

  const bs = data?.balanceSheet;
  const pl = data?.statementOfPL;

  // Flatten Schedule III blocks into export rows ({section, particulars, group, amount}).
  const bsRows = (() => {
    if (!bs) return [];
    const out: Record<string, unknown>[] = [];
    const push = (section: string, lines: Sch3Line[]) =>
      lines.forEach((l) => out.push({ section, particulars: l.name, group: l.group, amount: l.amount }));
    push("Shareholders' funds", bs.equityAndLiabilities.shareholdersFunds);
    push("Non-current liabilities", bs.equityAndLiabilities.nonCurrentLiabilities);
    push("Current liabilities", bs.equityAndLiabilities.currentLiabilities);
    out.push({ section: "", particulars: "Total equity & liabilities", group: "", amount: bs.equityAndLiabilities.total });
    push("Non-current assets", bs.assets.nonCurrentAssets);
    push("Current assets", bs.assets.currentAssets);
    out.push({ section: "", particulars: "Total assets", group: "", amount: bs.assets.total });
    return out;
  })();
  const plRows = (() => {
    if (!pl) return [];
    const out: Record<string, unknown>[] = [];
    const block = (section: string, b: Sch3Block) => {
      b.lines.forEach((l) => out.push({ section, particulars: l.name, group: l.group, amount: l.amount }));
      out.push({ section, particulars: "Subtotal", group: "", amount: b.subtotal });
    };
    block("Revenue from operations", pl.revenueFromOperations);
    block("Other income", pl.otherIncome);
    out.push({ section: "", particulars: "Total revenue", group: "", amount: pl.totalRevenue });
    block("Expenses", pl.expenses);
    out.push({ section: "", particulars: "Total expenses", group: "", amount: pl.totalExpenses });
    out.push({ section: "", particulars: "Profit before tax", group: "", amount: pl.profitBeforeTax });
    return out;
  })();
  const sch3Cols = [
    { key: "section", label: "Section" },
    { key: "particulars", label: "Particulars" },
    { key: "group", label: "Group" },
    { key: "amount", label: "Amount" },
  ];

  return (
    <Card
      title="Schedule III - P&L and Balance Sheet"
      icon={<Scale size={15} />}
      action={
        <button type="button" onClick={load} disabled={busy} className={btnGhost}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      {busy && !data ? (
        <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-[var(--color-muted)] py-6 text-center">No data.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* BALANCE SHEET */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Balance Sheet</h4>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  bs?.balanced
                    ? "bg-green-900/30 text-green-300 border-green-700/40"
                    : "bg-red-900/30 text-red-300 border-red-700/40"
                }`}>{bs?.balanced ? "Balanced" : "Out of balance"}</span>
                <ExportMenu size="sm" filename={`balance-sheet-${fy}`} title={`Balance Sheet ${fy}`} columns={sch3Cols} rows={bsRows} />
              </div>
            </div>
            <TableShell cols={2} head={<><th className={thCls}>Particulars</th><th className={thR}>Amount</th></>}>
              <Sch3Section title="Shareholders' funds" lines={bs?.equityAndLiabilities.shareholdersFunds ?? []} />
              <Sch3Section title="Non-current liabilities" lines={bs?.equityAndLiabilities.nonCurrentLiabilities ?? []} />
              <Sch3Section title="Current liabilities" lines={bs?.equityAndLiabilities.currentLiabilities ?? []} />
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="px-3 py-2.5 font-semibold">Total equity &amp; liabilities</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--color-primary)]">{rupee(bs?.equityAndLiabilities.total)}</td>
              </tr>
              <Sch3Section title="Non-current assets" lines={bs?.assets.nonCurrentAssets ?? []} />
              <Sch3Section title="Current assets" lines={bs?.assets.currentAssets ?? []} />
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="px-3 py-2.5 font-semibold">Total assets</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--color-primary)]">{rupee(bs?.assets.total)}</td>
              </tr>
            </TableShell>
          </div>

          {/* STATEMENT OF P&L */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Statement of Profit &amp; Loss</h4>
              <ExportMenu size="sm" filename={`statement-pl-${fy}`} title={`Statement of P&L ${fy}`} columns={sch3Cols} rows={plRows} />
            </div>
            <TableShell cols={2} head={<><th className={thCls}>Particulars</th><th className={thR}>Amount</th></>}>
              <Sch3Section title="Revenue from operations" lines={pl?.revenueFromOperations.lines ?? []} subtotal={pl?.revenueFromOperations.subtotal} />
              <Sch3Section title="Other income" lines={pl?.otherIncome.lines ?? []} subtotal={pl?.otherIncome.subtotal} />
              <tr className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2.5 font-semibold">Total revenue</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-green-400">{rupee(pl?.totalRevenue)}</td>
              </tr>
              <Sch3Section title="Expenses" lines={pl?.expenses.lines ?? []} subtotal={pl?.expenses.subtotal} />
              <tr className="border-b border-[var(--color-border)]">
                <td className="px-3 py-2.5 font-semibold">Total expenses</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-400">{rupee(pl?.totalExpenses)}</td>
              </tr>
              <tr className="border-t-2 border-[var(--color-border)]">
                <td className="px-3 py-2.5 font-semibold">Profit before tax</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${Number(pl?.profitBeforeTax ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(pl?.profitBeforeTax)}</td>
              </tr>
            </TableShell>
            {data.priorYear && (
              <p className="text-[11px] text-[var(--color-muted)]">
                Prior-year comparative ({data.priorYear.financialYear}):{" "}
                {data.priorYear.available ? "available in API response" : "not available"}.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARATIVE P&L - current vs previous FY
// ─────────────────────────────────────────────────────────────────────────────
function ComparativePLCard({ fy }: { fy: string }) {
  const [data, setData] = useState<ComparativePL | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<ComparativePL>(`/api/books/reports/profit-loss/comparative?fy=${encodeURIComponent(fy)}`);
      setData(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  const delta = (a?: string, b?: string) => {
    const d = Number(a ?? 0) - Number(b ?? 0);
    return d;
  };

  const Row = ({ label, cur, prev, goodHigh }: { label: string; cur?: string; prev?: string; goodHigh: boolean }) => {
    const d = delta(cur, prev);
    const good = goodHigh ? d >= 0 : d <= 0;
    return (
      <tr className="border-b border-[var(--color-border)] last:border-b-0">
        <td className="px-3 py-2.5 font-medium">{label}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{rupee(cur)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(prev)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${good ? "text-green-400" : "text-red-400"}`}>
          {d >= 0 ? "+" : ""}{rupee(String(d))}
        </td>
      </tr>
    );
  };

  const cmpRows: Record<string, unknown>[] = data
    ? [
        { metric: "Total income", current: data.current.totalIncome, previous: data.previous.totalIncome, change: String(delta(data.current.totalIncome, data.previous.totalIncome)) },
        { metric: "Total expense", current: data.current.totalExpense, previous: data.previous.totalExpense, change: String(delta(data.current.totalExpense, data.previous.totalExpense)) },
        { metric: "Net profit", current: data.current.netProfit, previous: data.previous.netProfit, change: String(delta(data.current.netProfit, data.previous.netProfit)) },
      ]
    : [];

  return (
    <Card
      title="Comparative P&L (year-over-year)"
      icon={<GitCompareArrows size={15} />}
      action={
        <div className="flex items-center gap-2">
          <ExportMenu
            size="sm"
            filename={`comparative-pl-${fy}`}
            title="Comparative P&L"
            columns={[
              { key: "metric", label: "Metric" },
              { key: "current", label: data?.current.fy ?? "Current" },
              { key: "previous", label: data?.previous.fy ?? "Previous" },
              { key: "change", label: "Change" },
            ]}
            rows={cmpRows}
          />
          <button type="button" onClick={load} disabled={busy} className={btnGhost}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      }
    >
      <TableShell
        cols={4}
        head={
          <>
            <th className={thCls}>Metric</th>
            <th className={thR}>{data?.current.fy ?? "Current"}</th>
            <th className={thR}>{data?.previous.fy ?? "Previous"}</th>
            <th className={thR}>Change</th>
          </>
        }
      >
        {busy && !data ? (
          <EmptyRow cols={4} text="Loading…" />
        ) : !data ? (
          <EmptyRow cols={4} text="No data." />
        ) : (
          <>
            <Row label="Total income" cur={data.current.totalIncome} prev={data.previous.totalIncome} goodHigh />
            <Row label="Total expense" cur={data.current.totalExpense} prev={data.previous.totalExpense} goodHigh={false} />
            <Row label="Net profit" cur={data.current.netProfit} prev={data.previous.netProfit} goodHigh />
          </>
        )}
      </TableShell>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AR / AP AGING
// ─────────────────────────────────────────────────────────────────────────────
function AgingCard({ kind, asOf }: { kind: "ar" | "ap"; asOf: string }) {
  const [data, setData] = useState<AgingReport | null>(null);
  const [busy, setBusy] = useState(false);
  const path = kind === "ar" ? "ar-aging" : "ap-aging";
  const title = kind === "ar" ? "Accounts Receivable aging" : "Accounts Payable aging";
  const partyCol = kind === "ar" ? "Customer" : "Vendor";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<AgingReport>(`/api/books/reports/${path}?asOf=${encodeURIComponent(asOf)}`);
      setData(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [path, asOf]);

  useEffect(() => { void load(); }, [load]);

  const t = data?.totals;

  const agingRows: Record<string, unknown>[] = (data?.parties ?? []).map((p) => ({
    party: p.name, notDue: p.notDue, d0_30: p.d0_30, d31_60: p.d31_60, d61_90: p.d61_90, d90plus: p.d90plus, total: p.total,
  }));
  if (t) agingRows.push({ party: "Total", notDue: t.notDue, d0_30: t.d0_30, d31_60: t.d31_60, d61_90: t.d61_90, d90plus: t.d90plus, total: t.total });

  return (
    <Card
      title={title}
      icon={<TrendingUp size={15} />}
      action={
        <div className="flex items-center gap-2">
          <ExportMenu
            size="sm"
            filename={`${path}-${asOf}`}
            title={title}
            columns={[
              { key: "party", label: partyCol },
              { key: "notDue", label: "Not due" },
              { key: "d0_30", label: "0-30" },
              { key: "d31_60", label: "31-60" },
              { key: "d61_90", label: "61-90" },
              { key: "d90plus", label: "90+" },
              { key: "total", label: "Total" },
            ]}
            rows={agingRows}
          />
          <button type="button" onClick={load} disabled={busy} className={btnGhost}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      }
    >
      <TableShell
        cols={7}
        head={
          <>
            <th className={thCls}>{partyCol}</th>
            <th className={thR}>Not due</th>
            <th className={thR}>0-30</th>
            <th className={thR}>31-60</th>
            <th className={thR}>61-90</th>
            <th className={thR}>90+</th>
            <th className={thR}>Total</th>
          </>
        }
      >
        {busy && !data ? (
          <EmptyRow cols={7} text="Loading…" />
        ) : (data?.parties.length ?? 0) === 0 ? (
          <EmptyRow cols={7} text="Nothing outstanding." />
        ) : (
          <>
            {data!.parties.map((p) => (
              <tr key={p.ledgerId} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-3 py-2.5 font-medium">{p.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(p.notDue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(p.d0_30)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(p.d31_60)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{rupee(p.d61_90)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-red-400">{rupee(p.d90plus)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(p.total)}</td>
              </tr>
            ))}
            {t && (
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                <td className="px-3 py-2.5 font-semibold">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(t.notDue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(t.d0_30)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(t.d31_60)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-300">{rupee(t.d61_90)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-400">{rupee(t.d90plus)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--color-primary)]">{rupee(t.total)}</td>
              </tr>
            )}
          </>
        )}
      </TableShell>
      {data && <p className="text-[11px] text-[var(--color-muted)] mt-2">As of {data.asOf}.</p>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY BOOK - vouchers in a date range with their entries
// ─────────────────────────────────────────────────────────────────────────────
function DayBookCard() {
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<DayBookVoucher[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<DayBookVoucher[]>(
        `/api/books/reports/day-book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setRows(Array.isArray(d) ? d : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const dayBookRows: Record<string, unknown>[] = (rows ?? []).map((v) => {
    const dr = v.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const cr = v.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    return {
      date: v.voucher_date,
      voucher: `${v.voucher_type} ${v.voucher_number}`,
      narration: v.narration ?? "",
      entries: v.entries
        .map((e) => `${e.ledger}: ${Number(e.debit || 0) > 0 ? `Dr ${e.debit}` : `Cr ${e.credit}`}`)
        .join("; "),
      debit: dr.toFixed(2),
      credit: cr.toFixed(2),
      cancelled: v.is_cancelled ? "Yes" : "",
    };
  });

  return (
    <Card
      title="Day book"
      icon={<BookOpen size={15} />}
      action={
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <button type="button" onClick={load} disabled={busy} className={btnGhost}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Load
          </button>
          <ExportMenu
            size="sm"
            filename={`day-book-${from}_${to}`}
            title="Day book"
            subtitle={`${from} to ${to}`}
            columns={[
              { key: "date", label: "Date" },
              { key: "voucher", label: "Voucher" },
              { key: "narration", label: "Narration" },
              { key: "entries", label: "Entries" },
              { key: "debit", label: "Debit" },
              { key: "credit", label: "Credit" },
              { key: "cancelled", label: "Cancelled" },
            ]}
            rows={dayBookRows}
          />
        </div>
      }
    >
      <TableShell
        cols={5}
        head={
          <>
            <th className={thCls}>Date</th>
            <th className={thCls}>Voucher</th>
            <th className={thCls}>Entries</th>
            <th className={thR}>Debit</th>
            <th className={thR}>Credit</th>
          </>
        }
      >
        {busy && !rows ? (
          <EmptyRow cols={5} text="Loading…" />
        ) : (rows?.length ?? 0) === 0 ? (
          <EmptyRow cols={5} text="No vouchers in this range." />
        ) : (
          rows!.map((v) => {
            const dr = v.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
            const cr = v.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
            return (
              <tr key={v.id} className={`border-b border-[var(--color-border)] last:border-b-0 ${v.is_cancelled ? "opacity-50" : ""}`}>
                <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-muted)]">{v.voucher_date}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs">{v.voucher_type} {v.voucher_number}</span>
                  {v.is_cancelled && <span className="ml-2 text-[10px] text-red-400">cancelled</span>}
                  {v.narration && <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{v.narration}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="space-y-0.5">
                    {v.entries.map((e, i) => (
                      <div key={i} className="text-xs flex justify-between gap-3">
                        <span>{e.ledger}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">
                          {Number(e.debit || 0) > 0 ? `Dr ${rupee(e.debit)}` : `Cr ${rupee(e.credit)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(String(dr))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(String(cr))}</td>
              </tr>
            );
          })
        )}
      </TableShell>
      {rows && rows.length >= 1000 && (
        <p className="text-[11px] text-amber-300 mt-2">Showing the first 1000 vouchers - narrow the date range to see the rest.</p>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET vs ACTUAL
// ─────────────────────────────────────────────────────────────────────────────
function BudgetVsActualCard({ fy }: { fy: string }) {
  const [data, setData] = useState<BudgetReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<BudgetReport>(`/api/books/reports/budget-vs-actual?fy=${encodeURIComponent(fy)}`);
      setData(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card
      title="Budget vs actual"
      icon={<Target size={15} />}
      action={
        <div className="flex items-center gap-2">
          <ExportMenu
            size="sm"
            filename={`budget-vs-actual-${fy}`}
            title={`Budget vs actual ${fy}`}
            columns={[
              { key: "ledger", label: "Ledger" },
              { key: "budget", label: "Budget" },
              { key: "actual", label: "Actual" },
              { key: "variance", label: "Variance" },
            ]}
            rows={(data?.rows ?? []) as unknown as Record<string, unknown>[]}
          />
          <button type="button" onClick={load} disabled={busy} className={btnGhost}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      }
    >
      <TableShell
        cols={4}
        head={
          <>
            <th className={thCls}>Ledger</th>
            <th className={thR}>Budget</th>
            <th className={thR}>Actual</th>
            <th className={thR}>Variance</th>
          </>
        }
      >
        {busy && !data ? (
          <EmptyRow cols={4} text="Loading…" />
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyRow cols={4} text="No budgets set for this year." />
        ) : (
          data!.rows.map((r, i) => {
            const v = Number(r.variance || 0);
            return (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                <td className="px-3 py-2.5 font-medium">{r.ledger}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.budget)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.actual)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${v >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(r.variance)}</td>
              </tr>
            );
          })
        )}
      </TableShell>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">Positive variance means actual spend/earn came in under budget.</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFITABILITY - by item / party / project
// ─────────────────────────────────────────────────────────────────────────────
type ProfDim = "item" | "party" | "project";

function ProfitabilityCard({ fy }: { fy: string }) {
  const [dim, setDim] = useState<ProfDim>("party");
  const [data, setData] = useState<ProfReport | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.get<ProfReport>(`/api/books/reports/profitability/${dim}?fy=${encodeURIComponent(fy)}`);
      setData(d);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [dim, fy]);

  useEffect(() => { void load(); }, [load]);

  const DIMS: { key: ProfDim; label: string; icon: React.ReactNode }[] = [
    { key: "party", label: "By party", icon: <Users size={13} /> },
    { key: "item", label: "By item", icon: <Package size={13} /> },
    { key: "project", label: "By project", icon: <FolderKanban size={13} /> },
  ];

  // Column shape differs per dimension.
  const nameHead = dim === "item" ? "Item" : dim === "project" ? "Project" : "Party";
  const revHead = dim === "item" ? "Sales value" : "Revenue";
  const gmHead = dim === "item" ? "Gross profit" : "Gross margin";
  const revOf = (r: ProfRow) => (dim === "item" ? r.salesValue : r.revenue);
  const gmOf = (r: ProfRow) => (dim === "item" ? r.grossProfit : r.grossMargin);
  const t = data?.totals;
  const tRev = dim === "item" ? t?.salesValue : t?.revenue;
  const tGm = dim === "item" ? t?.grossProfit : t?.grossMargin;

  const profCols = [
    { key: "name", label: nameHead },
    ...(dim === "item" ? [{ key: "qtySold", label: "Qty sold" }] : []),
    { key: "revenue", label: revHead },
    { key: "cost", label: "Cost" },
    { key: "grossMargin", label: gmHead },
    { key: "marginPct", label: "Margin %" },
  ];
  const profRows: Record<string, unknown>[] = (data?.rows ?? []).map((r) => ({
    name: r.party || r.name || "-",
    qtySold: r.qtySold ?? "",
    revenue: revOf(r) ?? "",
    cost: r.cost,
    grossMargin: gmOf(r) ?? "",
    marginPct: r.marginPct,
  }));
  if (t)
    profRows.push({
      name: "Total",
      qtySold: "",
      revenue: tRev ?? "",
      cost: t.cost,
      grossMargin: tGm ?? "",
      marginPct: t.marginPct,
    });

  return (
    <Card
      title="Profitability analysis"
      icon={<FileSpreadsheet size={15} />}
      action={
        <div className="flex items-center gap-2">
          <ExportMenu
            size="sm"
            filename={`profitability-${dim}-${fy}`}
            title={`Profitability by ${dim} ${fy}`}
            columns={profCols}
            rows={profRows}
          />
          <button type="button" onClick={load} disabled={busy} className={btnGhost}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {DIMS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDim(d.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              dim === d.key
                ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                : "border-[var(--color-border)] hover:bg-[var(--color-bg)]"
            }`}
          >
            {d.icon} {d.label}
          </button>
        ))}
      </div>

      <TableShell
        cols={dim === "item" ? 6 : 5}
        head={
          <>
            <th className={thCls}>{nameHead}</th>
            {dim === "item" && <th className={thR}>Qty sold</th>}
            <th className={thR}>{revHead}</th>
            <th className={thR}>Cost</th>
            <th className={thR}>{gmHead}</th>
            <th className={thR}>Margin %</th>
          </>
        }
      >
        {busy && !data ? (
          <EmptyRow cols={dim === "item" ? 6 : 5} text="Loading…" />
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyRow cols={dim === "item" ? 6 : 5} text="No data for this year." />
        ) : (
          <>
            {data!.rows.map((r, i) => {
              const label = r.party || r.name || "-";
              const notDerivable = (dim === "item" && r.salesDerivable === false) || (dim === "party" && r.costDerivable === false);
              const margin = Number(r.marginPct ?? 0);
              return (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">
                    {label}
                    {r.unit && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.unit}</span>}
                    {r.status && <span className="ml-2 text-[10px] text-[var(--color-muted)]">{r.status}</span>}
                    {notDerivable && <span className="ml-2 text-[10px] text-amber-300">partial</span>}
                  </td>
                  {dim === "item" && <td className="px-3 py-2.5 text-right tabular-nums">{r.qtySold}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(revOf(r))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.cost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${Number(gmOf(r) ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{rupee(gmOf(r))}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${margin >= 0 ? "" : "text-red-400"}`}>{r.marginPct}%</td>
                </tr>
              );
            })}
            {t && (
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                <td className="px-3 py-2.5 font-semibold">Total</td>
                {dim === "item" && <td />}
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(tRev)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rupee(t.cost)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-[var(--color-primary)]">{rupee(tGm)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{t.marginPct}%</td>
              </tr>
            )}
          </>
        )}
      </TableShell>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">
        A "partial" flag means cost (per party) or sales value (per item) couldn't be fully derived from the source documents.
      </p>
    </Card>
  );
}
