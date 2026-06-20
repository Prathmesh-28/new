import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Building2, Lock, ScrollText, Upload, CalendarX2, FileSpreadsheet,
  RefreshCw, Plus, ShieldCheck, CheckCircle2, XCircle, Loader2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// API base — all books routes are mounted under /api/books
// ─────────────────────────────────────────────────────────────────────────────
const B = "/api/books";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (loose — mirror backend response shapes)
// ─────────────────────────────────────────────────────────────────────────────
interface CostCentre {
  id: string;
  name: string;
  category: string | null;
  is_active?: boolean;
}
interface CostCentreReportRow {
  id: string;
  name: string;
  category: string | null;
  income: string;
  expense: string;
  net: string;
}
type PeriodStatus = "OPEN" | "LOCKED" | "CLOSED";
interface Period {
  id?: string;
  financial_year: string;
  period_month: number;
  status: PeriodStatus;
  locked_at?: string | null;
}
interface AuditRow {
  id: string | number;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  detail?: unknown;
  created_at: string;
}
interface ImportSkip { name: string; reason: string; }
interface LedgerImportResult { created: number; updated: number; skipped: ImportSkip[]; }
interface OpeningImportResult {
  updated: number;
  skipped: ImportSkip[];
  openingNet: string;
  balanced: boolean;
}
interface CloseResult {
  fy: string;
  netProfit: string;
  closingVoucher?: { voucher_number?: string; voucher_date?: string } | null;
  periodsLocked: number[];
}
interface Sch3Line { name: string; group?: string; amount: string; }
interface Sch3Group { lines: Sch3Line[]; subtotal: string; }
interface ScheduleIII {
  balanceSheet: {
    financialYear: string;
    equityAndLiabilities: {
      shareholdersFunds: Sch3Line[];
      nonCurrentLiabilities: Sch3Line[];
      currentLiabilities: Sch3Line[];
      total: string;
    };
    assets: {
      nonCurrentAssets: Sch3Line[];
      currentAssets: Sch3Line[];
      total: string;
    };
    balanced: boolean;
  };
  statementOfPL: {
    revenueFromOperations: Sch3Group;
    otherIncome: Sch3Group;
    totalRevenue: string;
    expenses: Sch3Group;
    totalExpenses: string;
    profitBeforeTax: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function currentFy(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 3
    ? `${y}-${String((y + 1) % 100).padStart(2, "0")}`
    : `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}
function rupee(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s ? `₹${s}` : "₹0.00";
}
function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const MONTH_LABELS = [
  "Apr", "May", "Jun", "Jul", "Aug", "Sep",
  "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
];
// FY period_month: 1 = Apr … 12 = Mar
function monthLabel(m: number): string {
  return MONTH_LABELS[(m - 1 + 12) % 12] ?? String(m);
}

// Parse a simple CSV block into rows keyed by a header line.
// First non-empty line is the header; subsequent lines map columns by index.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(",").map((c) => c.trim());
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI BITS (matches BooksPage conventions)
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50 transition-colors";

function Section({
  icon, title, subtitle, children, action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text)]">
            <span className="text-[var(--color-primary)]">{icon}</span>
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[var(--color-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: PeriodStatus }) {
  const map: Record<PeriodStatus, string> = {
    OPEN: "bg-green-900/30 text-green-300 border border-green-700/40",
    LOCKED: "bg-amber-900/30 text-amber-300 border border-amber-700/40",
    CLOSED: "bg-red-900/30 text-red-300 border border-red-700/40",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  );
}

function ImportSummary({ created, updated, skipped, openingNet }: {
  created?: number; updated?: number; skipped: ImportSkip[]; openingNet?: string;
}) {
  return (
    <div className="mt-3 text-xs">
      <div className="flex flex-wrap gap-3">
        {created != null && <span className="text-green-400">Created: <b>{created}</b></span>}
        <span className="text-blue-400">Updated: <b>{updated ?? 0}</b></span>
        <span className="text-amber-400">Skipped: <b>{skipped.length}</b></span>
        {openingNet != null && <span className="text-[var(--color-muted)]">Opening net: <b className="tabular-nums">{rupee(openingNet)}</b></span>}
      </div>
      {skipped.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-amber-300/80">
          {skipped.slice(0, 20).map((s, i) => (
            <li key={i}>• {s.name}: {s.reason}</li>
          ))}
          {skipped.length > 20 && <li>… and {skipped.length - 20} more</li>}
        </ul>
      )}
    </div>
  );
}

function Sch3Rows({ lines }: { lines: Sch3Line[] }) {
  if (!lines.length) return <p className="text-xs text-[var(--color-muted)] py-1 px-3">—</p>;
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between px-3 py-1 text-xs">
          <span className="text-[var(--color-muted)]">{l.name}</span>
          <span className="tabular-nums">{rupee(l.amount)}</span>
        </div>
      ))}
    </>
  );
}

function Sch3Block({ title, lines, subtotal }: { title: string; lines: Sch3Line[]; subtotal: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between px-3 py-1 text-[11px] font-semibold text-[var(--color-text)] border-b border-[var(--color-border)]">
        <span>{title}</span>
        <span className="tabular-nums">{rupee(subtotal)}</span>
      </div>
      <Sch3Rows lines={lines} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksAdminTab() {
  const [fy, setFy] = useState(currentFy());

  return (
    <div className="space-y-5">
      {/* FY selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Financial year</label>
        <input
          value={fy}
          onChange={(e) => setFy(e.target.value)}
          placeholder="2026-27"
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm w-32 outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CostCentresPanel fy={fy} />
        <PeriodLockPanel fy={fy} />
      </div>

      <ImportPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <YearEndClosePanel fy={fy} />
        <AuditLogPanel />
      </div>

      <ScheduleIIIPanel fy={fy} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COST CENTRES
// ─────────────────────────────────────────────────────────────────────────────
function CostCentresPanel({ fy }: { fy: string }) {
  const [list, setList] = useState<CostCentre[]>([]);
  const [report, setReport] = useState<CostCentreReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, r] = await Promise.all([
        api.get<CostCentre[]>(`${B}/cost-centres`),
        api.get<CostCentreReportRow[]>(`${B}/cost-centres/report?fy=${encodeURIComponent(fy)}`),
      ]);
      setList(Array.isArray(l) ? l : []);
      setReport(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      await api.post(`${B}/cost-centres`, { name: name.trim(), category: category.trim() || null });
      toast.success("Cost centre saved");
      setName(""); setCategory("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [name, category, load]);

  return (
    <Section
      icon={<Building2 size={15} />}
      title="Cost centres"
      subtitle="Tally-style dimension + cost-centre-wise P&L"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex-1 min-w-[140px]">
          <label className={labelCls}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Mumbai branch" />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className={labelCls}>Category</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="optional" />
        </div>
        <button type="button" onClick={() => void create()} className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {list.map((c) => (
            <span key={c.id} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
              {c.name}{c.category ? ` · ${c.category}` : ""}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="px-3 py-2">Cost centre</th>
              <th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">Expense</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {report.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">No cost-centre activity for {fy}</td></tr>
            ) : (
              report.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{r.name}{r.category ? <span className="text-[var(--color-muted)]"> · {r.category}</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-400">{rupee(r.income)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-400">{rupee(r.expense)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(r.net)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD LOCK
// ─────────────────────────────────────────────────────────────────────────────
function PeriodLockPanel({ fy }: { fy: string }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyMonth, setBusyMonth] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Period[]>(`${B}/periods?fy=${encodeURIComponent(fy)}`);
      setPeriods(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  // Build a full 12-month view (1..12) backfilling OPEN where the row is absent.
  const byMonth = new Map(periods.map((p) => [p.period_month, p]));
  const months: Period[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return byMonth.get(m) ?? { financial_year: fy, period_month: m, status: "OPEN" as PeriodStatus };
  });

  const setStatus = useCallback(async (period_month: number, status: PeriodStatus) => {
    setBusyMonth(period_month);
    try {
      await api.post(`${B}/periods/status`, { financial_year: fy, period_month, status });
      toast.success(`${monthLabel(period_month)} → ${status}`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyMonth(null);
    }
  }, [fy, load]);

  const NEXT: Record<PeriodStatus, PeriodStatus> = { OPEN: "LOCKED", LOCKED: "OPEN", CLOSED: "OPEN" };

  return (
    <Section
      icon={<Lock size={15} />}
      title="Period lock"
      subtitle="Lock / unlock the 12 months of the financial year"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {months.map((p) => (
          <div key={p.period_month} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold">{monthLabel(p.period_month)}</div>
              <div className="mt-1"><StatusPill status={p.status} /></div>
            </div>
            <button
              type="button"
              disabled={busyMonth === p.period_month}
              onClick={() => void setStatus(p.period_month, NEXT[p.status])}
              title={p.status === "CLOSED" ? "Re-open closed period" : p.status === "LOCKED" ? "Unlock" : "Lock"}
              className="text-[10px] px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-50 transition-colors"
            >
              {busyMonth === p.period_month ? <Loader2 size={11} className="animate-spin" /> : (NEXT[p.status] === "LOCKED" ? "Lock" : "Open")}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)] mt-3">
        Click a month to toggle OPEN/LOCKED. CLOSED periods come from year-end close; toggling re-opens them.
      </p>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────
function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<AuditRow[]>(`${B}/audit?limit=${limit}`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Section
      icon={<ScrollText size={15} />}
      title="Audit log"
      subtitle="Who changed what, when"
      action={
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs outline-none"
          >
            {[50, 100, 250, 500].map((n) => <option key={n} value={n}>Last {n}</option>)}
          </select>
          <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="sticky top-0 bg-[var(--color-surface)]">
            <tr className="text-left text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">No audit entries</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{fmtTime(r.created_at)}</td>
                  <td className="px-3 py-2 text-xs">{r.actor_email ?? "—"}</td>
                  <td className="px-3 py-2 text-xs font-medium">{r.action}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{r.entity}{r.entity_id ? <span className="opacity-60"> #{String(r.entity_id).slice(0, 8)}</span> : null}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT (ledgers + opening balances via paste-CSV)
// ─────────────────────────────────────────────────────────────────────────────
function ImportPanel() {
  const [ledgerCsv, setLedgerCsv] = useState("");
  const [openingCsv, setOpeningCsv] = useState("");
  const [ledgerRes, setLedgerRes] = useState<LedgerImportResult | null>(null);
  const [openingRes, setOpeningRes] = useState<OpeningImportResult | null>(null);
  const [busy, setBusy] = useState<"ledgers" | "opening" | null>(null);

  const importLedgers = useCallback(async () => {
    const rows = parseCsv(ledgerCsv);
    if (!rows.length) { toast.error("Paste CSV with a header row (name,group,opening_balance,…)"); return; }
    setBusy("ledgers");
    try {
      const res = await api.post<LedgerImportResult>(`${B}/import/ledgers`, { rows });
      setLedgerRes(res);
      toast.success(`Ledgers: ${res.created} created, ${res.updated} updated, ${res.skipped.length} skipped`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [ledgerCsv]);

  const importOpening = useCallback(async () => {
    const rows = parseCsv(openingCsv);
    if (!rows.length) { toast.error("Paste CSV with a header row (ledger,opening_balance,opening_is_debit)"); return; }
    setBusy("opening");
    try {
      const res = await api.post<OpeningImportResult>(`${B}/import/opening-balances`, { rows });
      setOpeningRes(res);
      toast.success(`Opening: ${res.updated} updated, ${res.skipped.length} skipped${res.balanced ? " · balanced" : ""}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }, [openingCsv]);

  return (
    <Section
      icon={<Upload size={15} />}
      title="Opening balances & import"
      subtitle="Paste CSV — first line is the header. One bad row is skipped, not the batch."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ledgers */}
        <div>
          <label className={labelCls}>Chart of accounts — columns: name, group, opening_balance, opening_is_debit, gstin, pan, state_code</label>
          <textarea
            value={ledgerCsv}
            onChange={(e) => setLedgerCsv(e.target.value)}
            rows={6}
            spellCheck={false}
            className={`${inputCls} font-mono text-xs resize-y`}
            placeholder={"name,group,opening_balance,opening_is_debit\nReliance Ltd,Sundry Debtors,15000,true\nOffice Rent,Indirect Expenses,,"}
          />
          <button type="button" onClick={() => void importLedgers()} className={`${btnPrimary} mt-2`} disabled={busy === "ledgers"}>
            {busy === "ledgers" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Import ledgers
          </button>
          {ledgerRes && <ImportSummary created={ledgerRes.created} updated={ledgerRes.updated} skipped={ledgerRes.skipped} />}
        </div>

        {/* Opening balances */}
        <div>
          <label className={labelCls}>Opening balances — columns: ledger (name or id), opening_balance, opening_is_debit</label>
          <textarea
            value={openingCsv}
            onChange={(e) => setOpeningCsv(e.target.value)}
            rows={6}
            spellCheck={false}
            className={`${inputCls} font-mono text-xs resize-y`}
            placeholder={"ledger,opening_balance,opening_is_debit\nCash,50000,true\nReliance Ltd,15000,true"}
          />
          <button type="button" onClick={() => void importOpening()} className={`${btnPrimary} mt-2`} disabled={busy === "opening"}>
            {busy === "opening" ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Import opening balances
          </button>
          {openingRes && (
            <>
              <ImportSummary updated={openingRes.updated} skipped={openingRes.skipped} openingNet={openingRes.openingNet} />
              <div className="mt-2 text-xs">
                {openingRes.balanced ? (
                  <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 size={13} /> Opening trial balance nets to zero</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-400"><XCircle size={13} /> Opening does not net to zero ({rupee(openingRes.openingNet)})</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END CLOSE
// ─────────────────────────────────────────────────────────────────────────────
function YearEndClosePanel({ fy }: { fy: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CloseResult | null>(null);

  const close = useCallback(async () => {
    if (!window.confirm(
      `Close FY ${fy}?\n\nThis posts the closing journal (P&L → Reserves & Surplus) and LOCKS all 12 periods of ${fy}. This cannot be undone without re-opening periods.`
    )) return;
    setBusy(true);
    try {
      const res = await api.post<CloseResult>(`${B}/period/close`, { fy });
      setResult(res);
      toast.success(`FY ${fy} closed · net profit ${rupee(res.netProfit)}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [fy]);

  return (
    <Section
      icon={<CalendarX2 size={15} />}
      title="Year-end close"
      subtitle={`Post the period-closing voucher for FY ${fy}`}
    >
      <p className="text-xs text-[var(--color-muted)] mb-3">
        Computes net profit/loss from P&L ledgers, posts a closing journal into Reserves & Surplus,
        and locks every period of the year.
      </p>
      <button type="button" onClick={() => void close()} className={btnPrimary} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarX2 size={14} />} Close FY {fy}
      </button>
      {result && (
        <div className="mt-3 text-xs space-y-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <div>Net profit: <b className="tabular-nums">{rupee(result.netProfit)}</b></div>
          {result.closingVoucher?.voucher_number && (
            <div className="text-[var(--color-muted)]">Closing voucher: {result.closingVoucher.voucher_number} ({result.closingVoucher.voucher_date})</div>
          )}
          <div className="text-[var(--color-muted)]">Periods locked: {result.periodsLocked.length}/12</div>
        </div>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE III (Balance sheet + Statement of P&L)
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleIIIPanel({ fy }: { fy: string }) {
  const [data, setData] = useState<ScheduleIII | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ScheduleIII>(`${B}/reports/schedule-iii?fy=${encodeURIComponent(fy)}`);
      setData(r);
    } catch (e) {
      toast.error(errMsg(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  const bs = data?.balanceSheet;
  const pl = data?.statementOfPL;

  return (
    <Section
      icon={<ShieldCheck size={15} />}
      title="Schedule III"
      subtitle={`Companies Act balance sheet + statement of P&L · FY ${fy}`}
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      {!data ? (
        <p className="text-xs text-[var(--color-muted)] py-4 text-center">
          {loading ? "Loading…" : "No data"}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Balance sheet */}
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold">Balance Sheet</h4>
              {bs && (
                bs.balanced ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-900/30 text-green-300 border border-green-700/40"><CheckCircle2 size={11} /> Balanced</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700/40"><XCircle size={11} /> Out of balance</span>
                )
              )}
            </div>
            {bs && (
              <>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] px-3 mb-1 mt-2">Equity & Liabilities</p>
                <Sch3Block title="Shareholders' funds" lines={bs.equityAndLiabilities.shareholdersFunds} subtotal="" />
                <Sch3Block title="Non-current liabilities" lines={bs.equityAndLiabilities.nonCurrentLiabilities} subtotal="" />
                <Sch3Block title="Current liabilities" lines={bs.equityAndLiabilities.currentLiabilities} subtotal="" />
                <div className="flex justify-between px-3 py-1.5 text-xs font-bold border-t border-[var(--color-border)]">
                  <span>Total Equity & Liabilities</span>
                  <span className="tabular-nums">{rupee(bs.equityAndLiabilities.total)}</span>
                </div>

                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] px-3 mb-1 mt-3">Assets</p>
                <Sch3Block title="Non-current assets" lines={bs.assets.nonCurrentAssets} subtotal="" />
                <Sch3Block title="Current assets" lines={bs.assets.currentAssets} subtotal="" />
                <div className="flex justify-between px-3 py-1.5 text-xs font-bold border-t border-[var(--color-border)]">
                  <span>Total Assets</span>
                  <span className="tabular-nums">{rupee(bs.assets.total)}</span>
                </div>
              </>
            )}
          </div>

          {/* Statement of P&L */}
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
            <h4 className="text-xs font-bold mb-2">Statement of Profit & Loss</h4>
            {pl && (
              <>
                <Sch3Block title="Revenue from operations" lines={pl.revenueFromOperations.lines} subtotal={pl.revenueFromOperations.subtotal} />
                <Sch3Block title="Other income" lines={pl.otherIncome.lines} subtotal={pl.otherIncome.subtotal} />
                <div className="flex justify-between px-3 py-1 text-xs font-semibold">
                  <span>Total revenue</span>
                  <span className="tabular-nums">{rupee(pl.totalRevenue)}</span>
                </div>
                <Sch3Block title="Expenses" lines={pl.expenses.lines} subtotal={pl.expenses.subtotal} />
                <div className="flex justify-between px-3 py-1 text-xs font-semibold">
                  <span>Total expenses</span>
                  <span className="tabular-nums">{rupee(pl.totalExpenses)}</span>
                </div>
                <div className="flex justify-between px-3 py-1.5 text-xs font-bold border-t border-[var(--color-border)] mt-1">
                  <span>Profit before tax</span>
                  <span className="tabular-nums text-[var(--color-primary)]">{rupee(pl.profitBeforeTax)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
