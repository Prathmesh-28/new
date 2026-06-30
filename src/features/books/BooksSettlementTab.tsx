import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Landmark, RefreshCw, Upload, GitCompareArrows, AlertTriangle, FileWarning,
  Receipt, Banknote, Percent, ArrowDownToLine, ArrowUpFromLine, Filter,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// PSP settlement reconciliation. Shapes mirror backend/src/modules/books/settlement.js
//   POST /api/books/settlement/ingest    { provider, rows:[{gross,fee,tax,net,utr,txn_ref,order_id,settled_on}] }
//        → { ok, provider, inserted, skipped, total }
//   POST /api/books/settlement/reconcile  { toleranceDays?, feeBand? }
//        → { scanned, posted, exceptions }
//   GET  /api/books/settlement/exceptions ?status&kind&limit
//        → [{ id, kind, status, amount, detail, line:{provider,utr,txnRef,status,gross,fee,tax,net,settledOn}, createdAt, resolvedAt }]
// ─────────────────────────────────────────────────────────────────────────────

interface IngestResult {
  ok?: boolean;
  provider?: string;
  inserted?: number;
  skipped?: number;
  total?: number;
}
interface ReconcileResult {
  scanned?: number;
  posted?: number;
  exceptions?: number;
}
interface ExceptionLine {
  provider?: string | null;
  utr?: string | null;
  txnRef?: string | null;
  status?: string | null;
  gross?: string | number | null;
  fee?: string | number | null;
  tax?: string | number | null;
  net?: string | number | null;
  settledOn?: string | null;
}
interface ExceptionRow {
  id: string;
  kind: string;
  status: string;
  amount?: string | number | null;
  detail?: Record<string, unknown> | null;
  line?: ExceptionLine | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function rupee(v: string | number | null | undefined): string {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
    if (Array.isArray(r.data)) return r.data as T[];
  }
  return [];
}

const PROVIDERS = [
  { id: "razorpay", label: "Razorpay (2.00% + 18% GST)" },
  { id: "cashfree", label: "Cashfree (1.95% + 18% GST)" },
  { id: "payu", label: "PayU (2.00% + 18% GST)" },
  { id: "stripe", label: "Stripe (2.90% + 18% GST)" },
  { id: "manual", label: "Manual (no fee)" },
] as const;

// Exception kinds the engine emits → badge styling + label.
const KIND_META: Record<string, { label: string; cls: string }> = {
  FEE: { label: "FEE", cls: "bg-amber-900/30 text-amber-300 border-amber-700/40" },
  SHORT: { label: "SHORT", cls: "bg-red-900/30 text-red-300 border-red-700/40" },
  OVER: { label: "OVER", cls: "bg-blue-900/30 text-blue-300 border-blue-700/40" },
  MISSING_DEPOSIT: { label: "MISSING", cls: "bg-purple-900/30 text-purple-300 border-purple-700/40" },
  MISSING_RECEIPT: { label: "MISSING", cls: "bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/40" },
};
function kindMeta(kind: string) {
  return KIND_META[kind] || { label: kind, cls: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]" };
}

// Filter dropdown values map the engine's badge buckets to its raw kinds.
const KIND_FILTERS = [
  { id: "", label: "All kinds" },
  { id: "FEE", label: "FEE" },
  { id: "SHORT", label: "SHORT" },
  { id: "OVER", label: "OVER" },
  { id: "MISSING_DEPOSIT", label: "MISSING deposit" },
  { id: "MISSING_RECEIPT", label: "MISSING receipt" },
] as const;

const STATUS_FILTERS = [
  { id: "OPEN", label: "Open" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "ALL", label: "All" },
] as const;

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
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" | "amber" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : tint === "amber" ? "text-amber-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[140px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
        <span className="text-[var(--color-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function HowToUse() {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex gap-3">
      <Landmark size={18} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
      <div className="text-sm text-[var(--color-muted)] space-y-1">
        <p className="text-[var(--color-text)] font-semibold">PSP settlement reconciliation</p>
        <p>
          Your payment processor (Razorpay, Cashfree, PayU, Stripe) periodically dumps a <span className="text-[var(--color-text)]">payout file</span> - one row per captured transaction with the customer's gross charge, the PSP fee, GST on the fee, and the net amount deposited to your bank.
        </p>
        <p>
          <span className="text-[var(--color-text)]">1. Ingest</span> the payout rows · <span className="text-[var(--color-text)]">2. Reconcile</span> ties each line to its bank deposit (net) and booked receipt (gross) and verifies the fee · <span className="text-[var(--color-text)]">3. Worklist</span> surfaces every deviation as an exception to resolve.
        </p>
        <p className="text-[11px]">
          Badges: <span className="font-semibold text-amber-400">FEE</span> fee/rate drift · <span className="font-semibold text-red-400">SHORT</span> bank received less than net · <span className="font-semibold text-blue-400">OVER</span> bank received more · <span className="font-semibold text-purple-400">MISSING</span> no matching deposit / receipt.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUT CSV PARSER - columns: gross, fee, tax, net, utr, txn_ref, order_id, settled_on
// ─────────────────────────────────────────────────────────────────────────────
const CSV_PLACEHOLDER =
  "gross,fee,tax,net,utr,txn_ref,order_id,settled_on\n1000,20,3.6,976.4,UTR-55012,pay_AbC123,ord_9001,2026-06-18\n2500,50,9,2441,UTR-55012,pay_DeF456,ord_9002,2026-06-18";

interface PayoutRow {
  gross?: string | number;
  fee?: string | number;
  tax?: string | number;
  net?: string | number;
  utr?: string;
  txn_ref?: string;
  order_id?: string;
  settled_on?: string;
}

const CSV_FIELDS = ["gross", "fee", "tax", "net", "utr", "txn_ref", "order_id", "settled_on"] as const;

function parsePayoutCsv(text: string): PayoutRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // Detect a header row (names any known column) and use it to map positions.
  const first = lines[0].toLowerCase();
  const hasHeader = /gross|fee|tax|net|utr|txn|order|settle/.test(first);
  let cols: string[] = [...CSV_FIELDS];
  let body = lines;
  if (hasHeader) {
    cols = lines[0].split(",").map((c) => c.trim().toLowerCase().replace(/\s+/g, "_"));
    body = lines.slice(1);
  }
  const rows: PayoutRow[] = [];
  for (const line of body) {
    const cells = line.split(",").map((c) => c.trim());
    if (cells.every((c) => !c)) continue;
    const row: PayoutRow = {};
    cols.forEach((col, i) => {
      const v = cells[i];
      if (v == null || v === "") return;
      if (col === "gross" || col === "fee" || col === "tax" || col === "net") {
        (row as Record<string, unknown>)[col] = v;
      } else if (col === "txn_ref" || col === "txn" || col === "txnref") {
        row.txn_ref = v;
      } else if (col === "order_id" || col === "order" || col === "orderid") {
        row.order_id = v;
      } else if (col === "settled_on" || col === "settled" || col === "date") {
        row.settled_on = v;
      } else if (col === "utr") {
        row.utr = v;
      }
    });
    rows.push(row);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksSettlementTab() {
  // ── ingest state ──
  const [provider, setProvider] = useState<string>("razorpay");
  const [csv, setCsv] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);

  // ── reconcile state ──
  const [toleranceDays, setToleranceDays] = useState("5");
  const [feeBand, setFeeBand] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [lastReconcile, setLastReconcile] = useState<ReconcileResult | null>(null);

  // ── exceptions worklist ──
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [kindFilter, setKindFilter] = useState<string>("");
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loadingEx, setLoadingEx] = useState(false);

  const parsed = useMemo(() => parsePayoutCsv(csv), [csv]);

  const loadExceptions = useCallback(async (status: string, kind: string) => {
    setLoadingEx(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (kind) qs.set("kind", kind);
      const res = await api.get<unknown>(`/api/books/settlement/exceptions?${qs.toString()}`);
      setExceptions(asArray<ExceptionRow>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingEx(false);
    }
  }, []);

  useEffect(() => {
    void loadExceptions(statusFilter, kindFilter);
  }, [loadExceptions, statusFilter, kindFilter]);

  const ingest = async () => {
    if (parsed.length === 0) {
      toast.error("Paste at least one payout row");
      return;
    }
    setIngesting(true);
    try {
      const res = await api.post<IngestResult>("/api/books/settlement/ingest", {
        provider,
        rows: parsed,
      });
      setLastIngest(res);
      toast.success(`Ingested ${res?.inserted ?? 0} new · ${res?.skipped ?? 0} duplicate of ${res?.total ?? parsed.length}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setIngesting(false);
    }
  };

  const reconcile = async () => {
    setReconciling(true);
    try {
      const body: Record<string, unknown> = {};
      const td = Number(toleranceDays);
      if (toleranceDays.trim() !== "" && Number.isFinite(td)) body.toleranceDays = td;
      if (feeBand.trim() !== "" && Number.isFinite(Number(feeBand))) body.feeBand = Number(feeBand);
      const res = await api.post<ReconcileResult>("/api/books/settlement/reconcile", body);
      setLastReconcile(res);
      toast.success(`Reconciled ${res?.scanned ?? 0} · ${res?.posted ?? 0} posted · ${res?.exceptions ?? 0} new exceptions`);
      await loadExceptions(statusFilter, kindFilter);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setReconciling(false);
    }
  };

  // Group counts by badge bucket for the summary strip.
  const counts = useMemo(() => {
    const c: Record<string, number> = { FEE: 0, SHORT: 0, OVER: 0, MISSING: 0 };
    for (const x of exceptions) {
      if (x.kind === "MISSING_DEPOSIT" || x.kind === "MISSING_RECEIPT") c.MISSING += 1;
      else if (c[x.kind] != null) c[x.kind] += 1;
    }
    return c;
  }, [exceptions]);

  return (
    <div className="space-y-6">
      <HowToUse />

      {/* SUMMARY STRIP */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Open exceptions" value={String(exceptions.length)} tint={exceptions.length ? "red" : "green"} />
        <StatCard label="Fee drift" value={String(counts.FEE)} tint="amber" />
        <StatCard label="Short / over" value={`${counts.SHORT} / ${counts.OVER}`} tint="red" />
        <StatCard label="Missing deposit / receipt" value={String(counts.MISSING)} tint="red" />
        {lastReconcile && (
          <StatCard label="Last run · posted" value={`${lastReconcile.posted ?? 0} / ${lastReconcile.scanned ?? 0}`} tint="green" />
        )}
      </div>

      {/* INGEST + RECONCILE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* INGEST */}
        <Card title="1 · Ingest payout file" icon={<Upload size={15} />}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>
                Payout rows (CSV: gross, fee, tax, net, utr, txn_ref, order_id, settled_on)
              </label>
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={7}
                placeholder={CSV_PLACEHOLDER}
                className={`${inputCls} font-mono text-xs resize-y`}
              />
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                {parsed.length} row{parsed.length === 1 ? "" : "s"} parsed · a header row is auto-detected · net defaults to gross − fee − tax if omitted. Re-uploading the same file is a no-op.
              </p>
            </div>
            <button type="button" onClick={ingest} disabled={ingesting || parsed.length === 0} className={`${btnPrimary} w-full`}>
              {ingesting ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              Ingest {parsed.length || ""} row{parsed.length === 1 ? "" : "s"}
            </button>

            {lastIngest && (
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Provider</span><span className="capitalize">{lastIngest.provider}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Inserted</span><span className="tabular-nums text-green-400">{lastIngest.inserted ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Skipped (duplicate)</span><span className="tabular-nums">{lastIngest.skipped ?? 0}</span></div>
                <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold"><span>Total in file</span><span className="tabular-nums">{lastIngest.total ?? 0}</span></div>
              </div>
            )}
          </div>
        </Card>

        {/* RECONCILE */}
        <Card title="2 · Run reconciliation" icon={<GitCompareArrows size={15} />}>
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-muted)]">
              Matches every expected line to its bank deposit (net) and booked receipt (gross), then verifies fee + tax against the provider's negotiated rate. Flags every deviation as an exception below.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date tolerance (days)</label>
                <input
                  value={toleranceDays}
                  onChange={(e) => setToleranceDays(e.target.value)}
                  inputMode="numeric"
                  placeholder="5"
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
              <div>
                <label className={labelCls}>Fee band override (₹, optional)</label>
                <input
                  value={feeBand}
                  onChange={(e) => setFeeBand(e.target.value)}
                  inputMode="decimal"
                  placeholder="auto (= fee)"
                  className={`${inputCls} font-mono tabular-nums`}
                />
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              A line is marked POSTED once its net deposit lands in the bank. The fee band caps how far a near-miss deposit can drift before it is flagged SHORT / OVER instead of matched silently.
            </p>
            <button type="button" onClick={reconcile} disabled={reconciling} className={`${btnPrimary} w-full`}>
              {reconciling ? <RefreshCw size={14} className="animate-spin" /> : <GitCompareArrows size={14} />}
              Reconcile now
            </button>

            {lastReconcile && (
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Lines scanned</span><span className="tabular-nums">{lastReconcile.scanned ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Posted (banked)</span><span className="tabular-nums text-green-400">{lastReconcile.posted ?? 0}</span></div>
                <div className="flex justify-between border-t border-[var(--color-border)] pt-1 mt-1 font-semibold"><span>New exceptions</span><span className={`tabular-nums ${(lastReconcile.exceptions ?? 0) > 0 ? "text-red-400" : "text-green-400"}`}>{lastReconcile.exceptions ?? 0}</span></div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* EXCEPTION WORKLIST */}
      <Card title="3 · Exception worklist" icon={<AlertTriangle size={15} />}>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className={labelCls}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
              {STATUS_FILTERS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Kind</label>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={inputCls}>
              {KIND_FILTERS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void loadExceptions(statusFilter, kindFilter)} className={`${btnGhost} ml-auto`}>
            <RefreshCw size={14} className={loadingEx ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse min-w-[860px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Kind</th>
                <th className={thCls}>Provider</th>
                <th className={thCls}>UTR / Txn ref</th>
                <th className={thR}>Gross</th>
                <th className={thR}>Fee</th>
                <th className={thR}>Tax</th>
                <th className={thR}>Net</th>
                <th className={thR}>Gap</th>
                <th className={thCls}>Detail</th>
                <th className={thCls}>Settled</th>
              </tr>
            </thead>
            <tbody>
              {loadingEx ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading exceptions…</td></tr>
              ) : exceptions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[var(--color-muted)]">
                    No {statusFilter === "ALL" ? "" : statusFilter.toLowerCase()} exceptions{kindFilter ? ` of kind ${kindFilter}` : ""}. Ingest a payout file and reconcile to populate this worklist.
                  </td>
                </tr>
              ) : (
                exceptions.map((x) => {
                  const m = kindMeta(x.kind);
                  const ln = x.line || {};
                  return (
                    <tr key={x.id} className="border-b border-[var(--color-border)] last:border-b-0 align-top">
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
                        {x.status === "RESOLVED" && (
                          <span className="ml-1 text-[10px] text-green-400">✓</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 capitalize">{ln.provider || "-"}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs block">{ln.utr || "-"}</span>
                        {ln.txnRef && <span className="font-mono text-[10px] text-[var(--color-muted)] block">{ln.txnRef}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(ln.gross)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(ln.fee)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(ln.tax)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(ln.net)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${x.amount != null ? "text-red-400" : "text-[var(--color-muted)]"}`}>
                        {x.amount != null ? rupee(x.amount) : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-[var(--color-muted)] max-w-[220px]">
                        <ExceptionDetail kind={x.kind} detail={x.detail} />
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap text-xs">{ln.settledOn || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {exceptions.length > 0 && (
          <p className="text-[11px] text-[var(--color-muted)] mt-2">
            {exceptions.length} exception{exceptions.length === 1 ? "" : "s"} shown. Fix the underlying bank line / receipt / fee and re-run reconciliation - resolved flags clear automatically.
          </p>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEPTION DETAIL - render the kind-specific detail payload as a short, human row.
// ─────────────────────────────────────────────────────────────────────────────
function ExceptionDetail({ kind, detail }: { kind: string; detail?: Record<string, unknown> | null }) {
  if (!detail) return <span>-</span>;
  const d = detail as Record<string, unknown>;
  const r = (v: unknown) => rupee(v as string | number);

  if (kind === "FEE") {
    if (d.reason === "rate_above_band") {
      return (
        <span className="inline-flex items-center gap-1">
          <Percent size={11} /> rate {String(d.ratePct ?? "?")}% &gt; band {String(d.expectedFeePct ?? "?")}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1">
        <Receipt size={11} /> fee+tax ≠ gross−net · gap {r(d.gap)}
      </span>
    );
  }
  if (kind === "SHORT" || kind === "OVER") {
    return (
      <span className="inline-flex items-center gap-1">
        {kind === "SHORT" ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
        expected {r(d.expectedNet)} · got {r(d.received)}
      </span>
    );
  }
  if (kind === "MISSING_DEPOSIT") {
    return (
      <span className="inline-flex items-center gap-1">
        <Banknote size={11} /> no bank deposit of {r(d.expectedNet)}{d.utr ? ` · UTR ${String(d.utr)}` : ""}
      </span>
    );
  }
  if (kind === "MISSING_RECEIPT") {
    return (
      <span className="inline-flex items-center gap-1">
        <FileWarning size={11} /> no booked receipt of {r(d.expectedGross)}{d.txnRef ? ` · ${String(d.txnRef)}` : ""}
      </span>
    );
  }
  // Fallback: compact JSON.
  return <span className="inline-flex items-center gap-1"><Filter size={11} />{JSON.stringify(d).slice(0, 80)}</span>;
}
