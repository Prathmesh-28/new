import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  CalendarRange, Lock, LockOpen, Archive, RefreshCw, Plus, Trash2,
  ShieldCheck, Scale, Upload, ListChecks, BookLock, Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - shapes mirror backend/src/modules/books/{ops,closing,vouchertools,importer}.js
// ─────────────────────────────────────────────────────────────────────────────
type PeriodStatus = "OPEN" | "LOCKED" | "CLOSED";

interface PeriodRow {
  id?: string;
  financial_year: string;
  period_month: number; // 1 = Apr … 12 = Mar
  status: PeriodStatus;
  locked_by?: string | null;
  locked_at?: string | null;
}

interface Ledger {
  id: string;
  name: string;
  opening_balance: string | number | null;
  opening_is_debit: boolean;
  is_active?: boolean;
}

interface YearEndResult {
  fy: string;
  netProfit: string | number;
  closingVoucher?: { voucherId?: string; voucherNumber?: string | number };
  periodsLocked?: number[];
}

interface OpeningSaveResult {
  updated: unknown[] | number;
  openingNet: string | number;
  balanced: boolean;
}

interface OpeningImportResult {
  updated: number;
  skipped: { name: string; reason: string }[];
  openingNet: string | number;
  balanced: boolean;
}

interface ReversingResult {
  posted?: { voucherId?: string; voucherNumber?: string | number };
  reversal?: { voucherId?: string; voucherNumber?: string | number };
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
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Indian FY: period month 1 = April … 12 = March.
const MONTH_NAMES = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
] as const;
function monthLabel(m: number): string {
  return MONTH_NAMES[(num(m) - 1 + 12) % 12] || `Month ${m}`;
}

// FY string is "YYYY-yy" e.g. "2026-27"; Indian FY starts 1 Apr.
function currentFy(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
function isFy(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s.trim());
}
function fyOptions(): string[] {
  const cur = Number(currentFy().slice(0, 4));
  const out: string[] = [];
  for (let y = cur + 1; y >= cur - 5; y--) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, icon, children, action }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
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

function HowToUse() {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex gap-3">
      <Info size={16} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
      <div className="text-xs text-[var(--color-muted)] leading-relaxed space-y-1">
        <p className="text-sm font-semibold text-[var(--color-text)]">Period close &amp; year-end</p>
        <p>
          <b>Lock</b> a month to stop new postings into it (reversible); <b>close</b> it for hard finality.
          Set your <b>opening balances</b> once at onboarding - a correct opening trial balance nets to zero.
          When the books are final, run the <b>year-end Period-Closing-Voucher</b>: it zeroes every P&amp;L
          ledger into Reserves &amp; Surplus and locks all 12 periods of that financial year.
          Use a <b>reversing journal</b> for accruals that auto-unwind on a later date.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PeriodStatus }) {
  const map: Record<PeriodStatus, string> = {
    OPEN: "bg-green-900/30 text-green-300 border-green-700/40",
    LOCKED: "bg-amber-900/30 text-amber-300 border-amber-700/40",
    CLOSED: "bg-red-900/30 text-red-300 border-red-700/40",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status]}`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksClosingTab() {
  const [fy, setFy] = useState(currentFy());

  return (
    <div className="space-y-6">
      <HowToUse />

      {/* FINANCIAL YEAR PICKER */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className={labelCls}>Financial year</label>
          <div className="flex items-center gap-2">
            <select
              value={fyOptions().includes(fy) ? fy : ""}
              onChange={(e) => e.target.value && setFy(e.target.value)}
              className={inputCls}
            >
              {!fyOptions().includes(fy) && <option value="">{fy}</option>}
              {fyOptions().map((f) => (
                <option key={f} value={f}>FY {f}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-muted)] max-w-md">
          Indian FY runs 1 Apr → 31 Mar. Period statuses and the year-end close below apply to FY <b>{fy}</b>.
        </p>
      </div>

      {/* PERIODS + STATUS */}
      <PeriodsCard fy={fy} />

      {/* YEAR-END CLOSE */}
      <YearEndCloseCard fy={fy} />

      {/* OPENING BALANCES */}
      <OpeningBalancesCard />

      {/* IMPORT OPENING BALANCES (CSV) */}
      <OpeningImportCard />

      {/* REVERSING JOURNAL */}
      <ReversingJournalCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIODS - list 12 months + lock/close/reopen each
// ─────────────────────────────────────────────────────────────────────────────
function PeriodsCard({ fy }: { fy: string }) {
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async (f: string) => {
    setBusy(true);
    try {
      const r = await api.get<PeriodRow[]>(`/api/books/periods?fy=${encodeURIComponent(f)}`);
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(fy); }, [fy, load]);

  // Merge the 12 canonical FY months with whatever the server has recorded.
  const byMonth = useMemo(() => {
    const m = new Map<number, PeriodRow>();
    for (const r of rows) m.set(num(r.period_month), r);
    return m;
  }, [rows]);

  const setStatus = async (period_month: number, status: PeriodStatus) => {
    if (status === "CLOSED" &&
      !window.confirm(`Close ${monthLabel(period_month)} (FY ${fy})? Closed periods are final and cannot be posted into.`)) {
      return;
    }
    setPending(period_month);
    try {
      await api.post("/api/books/periods/status", {
        financial_year: fy,
        period_month,
        status,
      });
      toast.success(`${monthLabel(period_month)} → ${status}`);
      await load(fy);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card
      title="Accounting periods"
      icon={<CalendarRange size={15} />}
      action={
        <button type="button" onClick={() => void load(fy)} className={btnGhost} title="Refresh">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      }
    >
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Period</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Locked at</th>
              <th className={`${thCls} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const row = byMonth.get(month);
              const status: PeriodStatus = (row?.status as PeriodStatus) || "OPEN";
              const isPending = pending === month;
              return (
                <tr key={month} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">
                    {monthLabel(month)}
                    <span className="ml-2 text-[10px] text-[var(--color-muted)] tabular-nums">P{month}</span>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={status} /></td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">
                    {row?.locked_at ? new Date(row.locked_at).toLocaleDateString("en-IN") : "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {isPending ? (
                        <RefreshCw size={14} className="animate-spin text-[var(--color-muted)]" />
                      ) : (
                        <>
                          {status !== "OPEN" && (
                            <button
                              type="button"
                              onClick={() => setStatus(month, "OPEN")}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-primary)]"
                              title="Reopen"
                            >
                              <LockOpen size={12} /> Reopen
                            </button>
                          )}
                          {status === "OPEN" && (
                            <button
                              type="button"
                              onClick={() => setStatus(month, "LOCKED")}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-primary)]"
                              title="Lock"
                            >
                              <Lock size={12} /> Lock
                            </button>
                          )}
                          {status !== "CLOSED" && (
                            <button
                              type="button"
                              onClick={() => setStatus(month, "CLOSED")}
                              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-red-700/40 text-red-300 hover:bg-red-900/20"
                              title="Close (final)"
                            >
                              <Archive size={12} /> Close
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--color-muted)] mt-2">
        Lock is reversible; Close marks the period final. The year-end close below closes all 12 at once.
      </p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR-END CLOSE - Period-Closing-Voucher (zeroes P&L → Reserves, locks the FY)
// ─────────────────────────────────────────────────────────────────────────────
function YearEndCloseCard({ fy }: { fy: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<YearEndResult | null>(null);

  // Reset the stale result when the FY changes.
  useEffect(() => { setResult(null); }, [fy]);

  const run = async () => {
    if (!isFy(fy)) { toast.error("Pick a financial year (YYYY-yy)"); return; }
    if (!window.confirm(
      `Run the year-end Period-Closing-Voucher for FY ${fy}?\n\nThis posts a closing journal that zeroes every P&L ledger into Reserves & Surplus and LOCKS all 12 periods. It is idempotent - an already-closed FY is refused.`
    )) return;
    setBusy(true);
    try {
      const res = await api.post<YearEndResult>("/api/books/period/close", { fy });
      setResult(res);
      toast.success(`FY ${res?.fy ?? fy} closed · net ${rupee(res?.netProfit)}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const profit = num(result?.netProfit);

  return (
    <Card title="Year-end close (Period-Closing-Voucher)" icon={<BookLock size={15} />}>
      <div className="space-y-3">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs text-[var(--color-muted)] leading-relaxed">
          Posts a closing journal dated 31 Mar of FY <b className="text-[var(--color-text)]">{fy}</b>: each income/expense
          ledger is driven to zero and the net profit/loss lands in <b>Reserves &amp; Surplus</b>. All 12 periods
          are then locked. Re-running a closed FY is rejected (409).
        </div>

        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <BookLock size={14} />}
          Run year-end close for FY {fy}
        </button>

        {result && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 text-green-300 font-semibold">
              <ShieldCheck size={15} /> FY {result.fy} closed
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Net {profit < 0 ? "loss" : "profit"}</span>
              <span className={`tabular-nums font-semibold ${profit < 0 ? "text-red-400" : "text-green-400"}`}>
                {rupee(Math.abs(profit))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Closing voucher</span>
              <span className="font-mono text-xs">
                #{result.closingVoucher?.voucherNumber ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-muted)]">Periods locked</span>
              <span className="tabular-nums">{result.periodsLocked?.length ?? 0} / 12</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENING BALANCES - edit opening balance per ledger (bulk save)
// ─────────────────────────────────────────────────────────────────────────────
interface OpeningEdit {
  ledgerId: string;
  name: string;
  amount: string;
  isDebit: boolean;
  dirty: boolean;
}

function OpeningBalancesCard() {
  const [edits, setEdits] = useState<OpeningEdit[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<OpeningSaveResult | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const ledgers = await api.get<Ledger[]>("/api/books/ledgers");
      setEdits(
        (Array.isArray(ledgers) ? ledgers : []).map((l) => ({
          ledgerId: l.id,
          name: l.name,
          amount: num(l.opening_balance) ? String(num(l.opening_balance)) : "",
          isDebit: l.opening_is_debit !== false,
          dirty: false,
        })),
      );
      setLastResult(null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = (ledgerId: string, p: Partial<OpeningEdit>) =>
    setEdits((ls) => ls.map((l) => (l.ledgerId === ledgerId ? { ...l, ...p, dirty: true } : l)));

  // Live opening trial-balance check (Dr − Cr should net to 0).
  const net = useMemo(
    () => edits.reduce((s, e) => s + (e.isDebit ? num(e.amount) : -num(e.amount)), 0),
    [edits],
  );
  const dirtyCount = edits.filter((e) => e.dirty).length;

  const save = async () => {
    const entries = edits
      .filter((e) => e.dirty)
      .map((e) => ({
        ledgerId: e.ledgerId,
        openingBalance: num(e.amount),
        openingIsDebit: e.isDebit,
      }));
    if (entries.length === 0) { toast.error("No changed opening balances to save"); return; }
    setSaving(true);
    try {
      const res = await api.post<OpeningSaveResult>("/api/books/opening-balances", { entries });
      setLastResult(res);
      toast.success(
        res?.balanced
          ? `Saved · opening trial balance is balanced`
          : `Saved · opening net ${rupee(res?.openingNet)} (not balanced)`,
      );
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Opening balances"
      icon={<Scale size={15} />}
      action={
        <button type="button" onClick={() => void load()} className={btnGhost} title="Reload">
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Reload
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--color-muted)]">
            Set the opening balance carried into the books for each ledger.
            A balanced opening should net to <b>₹0.00</b>.
          </div>
          <div className={`text-sm font-semibold tabular-nums ${Math.abs(net) < 0.005 ? "text-green-400" : "text-amber-400"}`}>
            Opening net: {rupee(net)}
          </div>
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)] max-h-[420px]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)]">
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Ledger</th>
                <th className={`${thCls} text-center`}>Dr / Cr</th>
                <th className={thR}>Opening balance</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading ledgers…</td></tr>
              ) : edits.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-8 text-center text-[var(--color-muted)]">No ledgers yet - create ledgers first.</td></tr>
              ) : (
                edits.map((e) => (
                  <tr key={e.ledgerId} className={`border-b border-[var(--color-border)] last:border-b-0 ${e.dirty ? "bg-[var(--color-bg)]/40" : ""}`}>
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={e.isDebit ? "DR" : "CR"}
                        onChange={(ev) => patch(e.ledgerId, { isDebit: ev.target.value === "DR" })}
                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1 text-xs outline-none"
                      >
                        <option value="DR">Dr</option>
                        <option value="CR">Cr</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={e.amount}
                        onChange={(ev) => patch(e.ledgerId, { amount: ev.target.value })}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-32 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1 text-sm text-right tabular-nums font-mono outline-none focus:border-[var(--color-primary)]"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {lastResult && (
          <p className={`text-xs ${lastResult.balanced ? "text-green-400" : "text-amber-400"}`}>
            Last save: opening net {rupee(lastResult.openingNet)} · {lastResult.balanced ? "balanced" : "not balanced"}.
          </p>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving || dirtyCount === 0} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Scale size={14} />}
            Save {dirtyCount > 0 ? `${dirtyCount} ` : ""}opening balance{dirtyCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT OPENING BALANCES - paste CSV (ledger, opening_balance, opening_is_debit)
// ─────────────────────────────────────────────────────────────────────────────
const OB_PLACEHOLDER =
  "ledger,opening_balance,opening_is_debit\nCash,50000,true\nState Bank of India,250000,true\nCapital A/c,300000,false";

interface ObRow { ledger: string; opening_balance: string; opening_is_debit: boolean }

function parseObCsv(text: string): ObRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = /ledger|opening/.test(first);
  const body = hasHeader ? lines.slice(1) : lines;
  const rows: ObRow[] = [];
  for (const line of body) {
    const c = line.split(",").map((x) => x.trim());
    if (!c[0]) continue;
    const flag = (c[2] || "").toLowerCase();
    rows.push({
      ledger: c[0],
      opening_balance: c[1] ?? "",
      // default to debit; only "false"/"cr"/"credit"/"0" mark a credit opening
      opening_is_debit: !["false", "cr", "credit", "0", "no"].includes(flag),
    });
  }
  return rows;
}

function OpeningImportCard() {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OpeningImportResult | null>(null);

  const parsed = useMemo(() => parseObCsv(csv), [csv]);

  const run = async () => {
    if (parsed.length === 0) { toast.error("Paste at least one opening-balance row"); return; }
    setBusy(true);
    try {
      const res = await api.post<OpeningImportResult>("/api/books/import/opening-balances", { rows: parsed });
      setResult(res);
      toast.success(
        `Imported ${res?.updated ?? 0} · ${res?.skipped?.length ?? 0} skipped · ${res?.balanced ? "balanced" : "not balanced"}`,
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Import opening balances (CSV)" icon={<Upload size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>
            Paste rows (CSV: ledger, opening_balance, opening_is_debit - ledger may be a name or id)
          </label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={OB_PLACEHOLDER}
            className={`${inputCls} font-mono text-xs resize-y`}
          />
          <p className="text-[11px] text-[var(--color-muted)] mt-1">
            {parsed.length} row{parsed.length === 1 ? "" : "s"} parsed · a header row is auto-detected and skipped.
            Negative amounts flip Dr/Cr. Unknown ledgers are reported as skipped.
          </p>
        </div>
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
          Import opening balances
        </button>

        {result && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span><span className="text-[var(--color-muted)]">Updated:</span> <b className="text-green-400 tabular-nums">{result.updated}</b></span>
              <span><span className="text-[var(--color-muted)]">Skipped:</span> <b className="text-amber-400 tabular-nums">{result.skipped?.length ?? 0}</b></span>
              <span>
                <span className="text-[var(--color-muted)]">Opening net:</span>{" "}
                <b className={`tabular-nums ${result.balanced ? "text-green-400" : "text-amber-400"}`}>{rupee(result.openingNet)}</b>
              </span>
            </div>
            {result.skipped && result.skipped.length > 0 && (
              <div className="border-t border-[var(--color-border)] pt-2">
                <p className="text-[11px] text-[var(--color-muted)] mb-1">Skipped rows:</p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="text-[var(--color-muted)]">
                      <span className="font-mono">{s.name}</span> - {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSING JOURNAL - post a journal + its auto-reversal on a later date
// ─────────────────────────────────────────────────────────────────────────────
interface JLine { key: string; ledgerId: string; debit: string; credit: string }
function newJLine(): JLine {
  return { key: Math.random().toString(36).slice(2), ledgerId: "", debit: "", credit: "" };
}

function ReversingJournalCard() {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [narration, setNarration] = useState("");
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [reverseDate, setReverseDate] = useState("");
  const [lines, setLines] = useState<JLine[]>([newJLine(), newJLine()]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ReversingResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setLedgers(Array.isArray(l) ? l : []);
      } catch {
        /* ledger list optional */
      }
    })();
  }, []);

  const patch = (key: string, p: Partial<JLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addLine = () => setLines((ls) => [...ls, newJLine()]);
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 2 ? ls.filter((l) => l.key !== key) : ls));

  const drTotal = lines.reduce((s, l) => s + num(l.debit), 0);
  const crTotal = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(drTotal - crTotal) < 0.005 && drTotal > 0;

  const submit = async () => {
    const entries = lines
      .filter((l) => l.ledgerId && (num(l.debit) > 0 || num(l.credit) > 0))
      .map((l) => ({ ledgerId: l.ledgerId, debit: num(l.debit), credit: num(l.credit) }));
    if (entries.length < 2) { toast.error("Add at least two ledger lines"); return; }
    if (!balanced) { toast.error("Debits and credits must balance (and be above zero)"); return; }
    setSaving(true);
    try {
      const res = await api.post<ReversingResult>("/api/books/journals/reversing", {
        entries,
        voucherDate,
        reverseDate: reverseDate || undefined,
        narration: narration.trim() || undefined,
      });
      setResult(res);
      toast.success(
        `Posted #${res?.posted?.voucherNumber ?? "?"} + auto-reversal #${res?.reversal?.voucherNumber ?? "?"}`,
      );
      setLines([newJLine(), newJLine()]);
      setNarration("");
      setReverseDate("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Reversing journal" icon={<ListChecks size={15} />}>
      <div className="space-y-4">
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs text-[var(--color-muted)]">
          Posts the journal on the entry date, then a mirror entry (debits ↔ credits) on the reverse date -
          ideal for month-end accruals and provisions that should auto-unwind in the next period.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Entry date</label>
            <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Reverse on (optional)</label>
            <input type="date" value={reverseDate} onChange={(e) => setReverseDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Narration</label>
            <input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. March rent accrual" className={inputCls} />
          </div>
        </div>

        {/* LINES */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Ledger</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] text-right">Debit</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] text-right">Credit</span>
            <span />
          </div>
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 items-center">
              <select value={l.ledgerId} onChange={(e) => patch(l.key, { ledgerId: e.target.value })} className={inputCls}>
                <option value="">Select ledger…</option>
                {ledgers.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
              </select>
              <input
                value={l.debit}
                onChange={(e) => patch(l.key, { debit: e.target.value, ...(e.target.value ? { credit: "" } : {}) })}
                inputMode="decimal" placeholder="0.00"
                className={`${inputCls} text-right tabular-nums font-mono`}
              />
              <input
                value={l.credit}
                onChange={(e) => patch(l.key, { credit: e.target.value, ...(e.target.value ? { debit: "" } : {}) })}
                inputMode="decimal" placeholder="0.00"
                className={`${inputCls} text-right tabular-nums font-mono`}
              />
              <button
                type="button" onClick={() => removeLine(l.key)} disabled={lines.length <= 2}
                className="px-1 py-2 text-[var(--color-muted)] hover:text-red-400 disabled:opacity-30" title="Remove line"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addLine} className={btnGhost}>
            <Plus size={14} /> Add line
          </button>
        </div>

        {/* TOTALS */}
        <div className="flex items-center justify-end gap-6 text-sm border-t border-[var(--color-border)] pt-3">
          <span><span className="text-[var(--color-muted)]">Dr:</span> <b className="tabular-nums font-mono">{rupee(drTotal)}</b></span>
          <span><span className="text-[var(--color-muted)]">Cr:</span> <b className="tabular-nums font-mono">{rupee(crTotal)}</b></span>
          <span className={`text-xs font-semibold ${balanced ? "text-green-400" : "text-amber-400"}`}>
            {balanced ? "Balanced" : "Out of balance"}
          </span>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={saving || !balanced} className={btnPrimary}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <ListChecks size={14} />}
            Post reversing journal
          </button>
        </div>

        {result && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
            <span><span className="text-[var(--color-muted)]">Posted:</span> <b className="font-mono">#{result.posted?.voucherNumber ?? "-"}</b></span>
            <span><span className="text-[var(--color-muted)]">Auto-reversal:</span> <b className="font-mono">#{result.reversal?.voucherNumber ?? "-"}</b></span>
          </div>
        )}
      </div>
    </Card>
  );
}
