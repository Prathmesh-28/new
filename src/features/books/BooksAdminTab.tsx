import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { toast } from "sonner";
import {
  Building2, Lock, ScrollText, Upload, CalendarX2, FileSpreadsheet,
  RefreshCw, Plus, ShieldCheck, CheckCircle2, XCircle, Loader2,
  PieChart, FileCode2, Hash, GitMerge, Trash2, Landmark, Undo2,
  LayoutTemplate, CalendarClock, Download,
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

// Authenticated file download. api.get() parses JSON, so for raw text/XML
// downloads we fetch with the bearer token ourselves and save a Blob.
async function downloadAuthed(path: string, filename: string, mime: string): Promise<void> {
  const token = localStorage.getItem("hr_access");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${msg}`);
  }
  const text = await res.text();
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

      {/* ─────────────────────────────────────────────────────────────────────
          ADDED SECTIONS (surgical — below the original Admin controls)
          ───────────────────────────────────────────────────────────────────── */}
      <ProfitabilityPanel fy={fy} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TallyExportPanel fy={fy} />
        <NumberGapsPanel fy={fy} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <LedgerMergePanel />
        <ReversingJournalPanel />
      </div>

      <AssetRegisterPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <VoucherTemplatesPanel />
        <PdcRegisterPanel />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Profitability reports (party / item / project)
// ═════════════════════════════════════════════════════════════════════════════
type ProfitDim = "party" | "item" | "project";
interface ProfitRow {
  id?: string;
  name: string;
  revenue?: string;
  cost?: string;
  profit?: string;
  margin?: string;
}
function ProfitabilityPanel({ fy }: { fy: string }) {
  const [dim, setDim] = useState<ProfitDim>("party");
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ProfitRow[]>(`${B}/reports/profitability/${dim}?fy=${encodeURIComponent(fy)}`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dim, fy]);

  useEffect(() => { void load(); }, [load]);

  const DIMS: { id: ProfitDim; label: string }[] = [
    { id: "party", label: "By party" },
    { id: "item", label: "By item" },
    { id: "project", label: "By project" },
  ];

  return (
    <Section
      icon={<PieChart size={15} />}
      title="Profitability reports"
      subtitle={`Revenue, cost & margin by party / item / project · FY ${fy}`}
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="flex flex-wrap gap-1.5 mb-4">
        {DIMS.map((d) => {
          const active = dim === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDim(d.id)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[460px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="px-3 py-2 capitalize">{dim}</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">{loading ? "Loading…" : `No profitability data for ${fy}`}</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id ?? i} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-green-400">{rupee(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-400">{rupee(r.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(r.profit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted)]">{r.margin != null && r.margin !== "" ? `${r.margin}%` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Tally XML export
// ═════════════════════════════════════════════════════════════════════════════
function TallyExportPanel({ fy }: { fy: string }) {
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      await downloadAuthed(
        `${B}/reports/tally-xml?fy=${encodeURIComponent(fy)}`,
        `tally-export-${fy}.xml`,
        "application/xml",
      );
      toast.success("Tally XML downloaded");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [fy]);

  return (
    <Section
      icon={<FileCode2 size={15} />}
      title="Tally XML export"
      subtitle={`Masters + vouchers as a Tally-importable XML · FY ${fy}`}
    >
      <p className="text-xs text-[var(--color-muted)] mb-3">
        Exports the chart of accounts and posted vouchers for FY {fy} as a Tally Prime / ERP 9
        compatible XML envelope you can import on the Tally side.
      </p>
      <button type="button" onClick={() => void download()} className={btnPrimary} disabled={busy}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download Tally XML
      </button>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Numbering audit — voucher number gaps
// ═════════════════════════════════════════════════════════════════════════════
interface NumberGap {
  voucher_type?: string;
  series?: string;
  prefix?: string;
  from?: number | string;
  to?: number | string;
  missing?: (number | string)[];
  count?: number;
}
function NumberGapsPanel({ fy }: { fy: string }) {
  const [gaps, setGaps] = useState<NumberGap[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<NumberGap[] | { gaps?: NumberGap[] }>(`${B}/audit/number-gaps?fy=${encodeURIComponent(fy)}`);
      const arr = Array.isArray(r) ? r : Array.isArray(r?.gaps) ? r.gaps : [];
      setGaps(arr);
    } catch (e) {
      toast.error(errMsg(e));
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Section
      icon={<Hash size={15} />}
      title="Numbering audit"
      subtitle={`Detect gaps in voucher / invoice numbering · FY ${fy}`}
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      {gaps.length === 0 ? (
        <p className="text-xs py-4 text-center">
          {loading ? <span className="text-[var(--color-muted)]">Loading…</span> : (
            <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 size={13} /> No numbering gaps found for {fy}</span>
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {gaps.map((g, i) => {
            const label = g.voucher_type ?? g.series ?? g.prefix ?? `Series ${i + 1}`;
            const missing = Array.isArray(g.missing) ? g.missing : [];
            return (
              <div key={i} className="bg-[var(--color-bg)] border border-amber-700/40 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{label}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/40">
                    {g.count ?? missing.length} missing
                  </span>
                </div>
                {(g.from != null || g.to != null) && (
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">Range {String(g.from ?? "?")} → {String(g.to ?? "?")}</p>
                )}
                {missing.length > 0 && (
                  <p className="text-[11px] text-amber-300/80 mt-1 break-words">
                    Missing: {missing.slice(0, 50).map(String).join(", ")}{missing.length > 50 ? ` … +${missing.length - 50}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Ledger merge + delete
// ═════════════════════════════════════════════════════════════════════════════
interface MergeLedger { id: string; name: string; }
function LedgerMergePanel() {
  const [ledgers, setLedgers] = useState<MergeLedger[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<MergeLedger[]>(`${B}/ledgers`);
      setLedgers(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: string) => ledgers.find((l) => l.id === id)?.name ?? id;

  const merge = useCallback(async () => {
    if (!fromId || !toId) { toast.error("Pick both source and target ledgers"); return; }
    if (fromId === toId) { toast.error("Source and target must differ"); return; }
    if (!window.confirm(`Merge "${nameOf(fromId)}" into "${nameOf(toId)}"?\n\nAll entries move to the target and the source ledger is removed. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.post(`${B}/ledgers/merge`, { fromId, toId });
      toast.success("Ledgers merged");
      setFromId(""); setToId("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId, load]);

  const remove = useCallback(async () => {
    if (!fromId) { toast.error("Pick a ledger to delete"); return; }
    if (!window.confirm(`Delete ledger "${nameOf(fromId)}"?\n\nOnly allowed if it has no postings. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`${B}/ledgers/${encodeURIComponent(fromId)}`);
      toast.success("Ledger deleted");
      setFromId("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, load]);

  return (
    <Section
      icon={<GitMerge size={15} />}
      title="Ledger merge & delete"
      subtitle="Consolidate duplicate ledgers or remove an unused one"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Source ledger (merged away / deleted)</label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputCls}>
            <option value="">Select source…</option>
            {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Target ledger (entries land here)</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls}>
            <option value="">Select target…</option>
            {ledgers.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void merge()} className={btnPrimary} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />} Merge into target
          </button>
          <button type="button" onClick={() => void remove()} className={btnGhost} disabled={busy}>
            <Trash2 size={13} /> Delete source
          </button>
        </div>
      </div>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Reversing journal
// ═════════════════════════════════════════════════════════════════════════════
function ReversingJournalPanel() {
  const [voucherId, setVoucherId] = useState("");
  const [reversalDate, setReversalDate] = useState("");
  const [narration, setNarration] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ voucherNumber?: string } | null>(null);

  const post = useCallback(async () => {
    if (!voucherId.trim()) { toast.error("Enter the voucher id / number to reverse"); return; }
    setBusy(true);
    try {
      const res = await api.post<{ voucherId?: string; voucherNumber?: string }>(`${B}/journals/reversing`, {
        voucherId: voucherId.trim(),
        reversalDate: reversalDate || undefined,
        narration: narration.trim() || undefined,
      });
      setLast(res ?? null);
      toast.success(res?.voucherNumber ? `Reversing journal posted #${res.voucherNumber}` : "Reversing journal posted");
      setVoucherId(""); setNarration("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [voucherId, reversalDate, narration]);

  return (
    <Section
      icon={<Undo2 size={15} />}
      title="Reversing journal"
      subtitle="Post a dated reversal of an existing voucher"
    >
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Voucher id or number to reverse</label>
          <input value={voucherId} onChange={(e) => setVoucherId(e.target.value)} className={inputCls} placeholder="e.g. JV/2026/0007 or uuid" />
        </div>
        <div>
          <label className={labelCls}>Reversal date (optional — defaults to today)</label>
          <input type="date" value={reversalDate} onChange={(e) => setReversalDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Narration (optional)</label>
          <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} placeholder="Reason for reversal" />
        </div>
        <button type="button" onClick={() => void post()} className={btnPrimary} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Post reversing journal
        </button>
        {last?.voucherNumber && (
          <p className="text-xs text-[var(--color-muted)]">Last reversal: <b>#{last.voucherNumber}</b></p>
        )}
      </div>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Fixed-asset register + dispose
// ═════════════════════════════════════════════════════════════════════════════
interface AssetRow {
  id: string;
  name: string;
  asset_code?: string | null;
  acquired_on?: string | null;
  cost?: string | null;
  accumulated_depreciation?: string | null;
  wdv?: string | null;
  book_value?: string | null;
  status?: string | null;
  disposed_on?: string | null;
}
function AssetRegisterPanel() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<AssetRow[] | { assets?: AssetRow[] }>(`${B}/assets/register`);
      const arr = Array.isArray(r) ? r : Array.isArray(r?.assets) ? r.assets : [];
      setRows(arr);
    } catch (e) {
      toast.error(errMsg(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dispose = useCallback(async (a: AssetRow) => {
    const dateStr = window.prompt(`Dispose "${a.name}".\n\nDisposal date (YYYY-MM-DD):`, new Date().toISOString().slice(0, 10));
    if (!dateStr) return;
    const proceedsStr = window.prompt("Sale proceeds (₹, blank = 0):", "0");
    if (proceedsStr === null) return;
    setBusyId(a.id);
    try {
      await api.post(`${B}/assets/${encodeURIComponent(a.id)}/dispose`, {
        disposalDate: dateStr,
        proceeds: proceedsStr.trim() || "0",
      });
      toast.success(`Disposed ${a.name}`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const bookVal = (a: AssetRow) => a.wdv ?? a.book_value;

  return (
    <Section
      icon={<Landmark size={15} />}
      title="Fixed-asset register"
      subtitle="Cost, accumulated depreciation, written-down value & disposal"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Acquired</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Accum. dep.</th>
              <th className="px-3 py-2 text-right">WDV</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">{loading ? "Loading…" : "No fixed assets registered"}</td></tr>
            ) : (
              rows.map((a) => {
                const disposed = (a.status ?? "").toUpperCase() === "DISPOSED" || !!a.disposed_on;
                return (
                  <tr key={a.id} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      {a.name}
                      {a.asset_code ? <span className="text-[var(--color-muted)]"> · {a.asset_code}</span> : null}
                      {disposed && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-300 border border-red-700/40">Disposed</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{a.acquired_on ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(a.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400">{rupee(a.accumulated_depreciation)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{rupee(bookVal(a))}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void dispose(a)}
                        disabled={disposed || busyId === a.id}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={disposed ? "Already disposed" : "Dispose asset"}
                      >
                        {busyId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Dispose
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: Voucher templates
// ═════════════════════════════════════════════════════════════════════════════
interface VoucherTemplate {
  id?: string;
  name: string;
  voucher_type?: string | null;
  narration?: string | null;
  created_at?: string;
}
function VoucherTemplatesPanel() {
  const [list, setList] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [voucherType, setVoucherType] = useState("");
  const [narration, setNarration] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<VoucherTemplate[]>(`${B}/voucher-templates`);
      setList(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!name.trim()) { toast.error("Template name required"); return; }
    setSaving(true);
    try {
      await api.post(`${B}/voucher-templates`, {
        name: name.trim(),
        voucher_type: voucherType.trim() || null,
        narration: narration.trim() || null,
      });
      toast.success("Template saved");
      setName(""); setVoucherType(""); setNarration("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [name, voucherType, narration, load]);

  return (
    <Section
      icon={<LayoutTemplate size={15} />}
      title="Voucher templates"
      subtitle="Reusable entry presets for recurring vouchers"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Monthly rent" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className={labelCls}>Voucher type</label>
            <input value={voucherType} onChange={(e) => setVoucherType(e.target.value)} className={inputCls} placeholder="e.g. Payment" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Narration (optional)</label>
          <input value={narration} onChange={(e) => setNarration(e.target.value)} className={inputCls} placeholder="Default narration" />
        </div>
        <button type="button" onClick={() => void save()} className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save template
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] py-3 text-center">{loading ? "Loading…" : "No templates yet"}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.map((t, i) => (
            <span key={t.id ?? i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)]">
              {t.name}{t.voucher_type ? ` · ${t.voucher_type}` : ""}
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDED: PDC (post-dated cheque) register + clear / bounce
// ═════════════════════════════════════════════════════════════════════════════
interface PdcRow {
  id: string;
  cheque_number?: string | null;
  party?: string | null;
  party_name?: string | null;
  bank?: string | null;
  amount?: string | null;
  cheque_date?: string | null;
  direction?: string | null;
  status?: string | null;
}
function PdcRegisterPanel() {
  const [rows, setRows] = useState<PdcRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // new PDC form
  const [chequeNumber, setChequeNumber] = useState("");
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [direction, setDirection] = useState<"INWARD" | "OUTWARD">("INWARD");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<PdcRow[]>(`${B}/pdc`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = useCallback(async () => {
    if (!chequeNumber.trim()) { toast.error("Cheque number required"); return; }
    if (!(Number(amount) > 0)) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      await api.post(`${B}/pdc`, {
        chequeNumber: chequeNumber.trim(),
        party: party.trim() || null,
        amount: amount.trim(),
        chequeDate: chequeDate || null,
        direction,
      });
      toast.success("PDC recorded");
      setChequeNumber(""); setParty(""); setAmount(""); setChequeDate("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [chequeNumber, party, amount, chequeDate, direction, load]);

  const act = useCallback(async (id: string, action: "clear" | "bounce") => {
    setBusyId(id);
    try {
      await api.post(`${B}/pdc/${encodeURIComponent(id)}/${action}`, {});
      toast.success(action === "clear" ? "Cheque cleared" : "Cheque bounced");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }, [load]);

  return (
    <Section
      icon={<CalendarClock size={15} />}
      title="PDC register"
      subtitle="Post-dated cheques — track, clear or bounce"
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[110px]">
            <label className={labelCls}>Cheque no.</label>
            <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={inputCls} placeholder="000123" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className={labelCls}>Party</label>
            <input value={party} onChange={(e) => setParty(e.target.value)} className={inputCls} placeholder="Name" />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[100px]">
            <label className={labelCls}>Amount</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${inputCls} font-mono tabular-nums`} placeholder="0.00" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className={labelCls}>Cheque date</label>
            <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputCls} />
          </div>
          <div className="min-w-[110px]">
            <label className={labelCls}>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "INWARD" | "OUTWARD")} className={inputCls}>
              <option value="INWARD">Inward</option>
              <option value="OUTWARD">Outward</option>
            </select>
          </div>
        </div>
        <button type="button" onClick={() => void create()} className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Record PDC
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="px-3 py-2">Cheque</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-[var(--color-muted)]">{loading ? "Loading…" : "No post-dated cheques"}</td></tr>
            ) : (
              rows.map((p) => {
                const status = (p.status ?? "PENDING").toUpperCase();
                const open = status === "PENDING" || status === "OPEN";
                return (
                  <tr key={p.id} className="border-b border-[var(--color-border)]">
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.cheque_number ?? "—"}
                      {p.direction ? <span className="ml-1 text-[10px] text-[var(--color-muted)]">{p.direction}</span> : null}
                    </td>
                    <td className="px-3 py-2">{p.party_name ?? p.party ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)] whitespace-nowrap">{p.cheque_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupee(p.amount)}</td>
                    <td className="px-3 py-2 text-xs">{status}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void act(p.id, "clear")}
                        disabled={!open || busyId === p.id}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed mr-3"
                      >
                        {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => void act(p.id, "bounce")}
                        disabled={!open || busyId === p.id}
                        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <XCircle size={12} /> Bounce
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Section>
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
