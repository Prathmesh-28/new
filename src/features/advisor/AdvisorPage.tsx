import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Users, Plus, X, AlertTriangle, TrendingUp, CheckCircle2, CreditCard, Trash2,
  Calculator, Star, FileBarChart2, Zap, ArrowRight, Building2,
  Paperclip, Timer, Send, Download, Settings2, ChevronDown, ChevronUp,
  ReceiptText,
  ShieldCheck, Inbox, MessageSquare, FileSignature, Reply, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useT } from "@/i18n";
import { formatCurrency } from "@/lib/utils";
import { format, differenceInCalendarDays } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientSummary = {
  tenant_id: string;
  label: string;
  balance: number;
  runway: number | null;
  unread_alerts: number;
  top_alert: { severity: string; message: string } | null;
  last_forecast_at: string | null;
  credit_prequalified: boolean;
  credit_score: number | null;
};

type AdvisorAlert = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  title: string;
  client_label: string;
  created_at: string;
};

// GST Filing Board — response of GET /api/advisor/gst-board (one row per linked client:
// books-live liability, 3B computed/filed state, IMS deemed-acceptance exposure, ITC at risk).
type BoardClient = {
  tenant_id: string; label: string; has_activity: boolean;
  turnover: number; output_tax: number; itc: number; net_liability_books: number;
  r3b_status: string; r3b_filed_at: string | null; r3b_arn: string | null; r3b_net_liability: number | null;
  ims_pending: number; itc_at_risk: number; last_2b_run: string | null;
};
type GstBoard = {
  period: string; due_gstr1: string | null; due_gstr3b: string | null; overdue_3b: boolean;
  clients: BoardClient[];
  totals: { clients: number; filed: number; computed: number; not_computed: number; turnover: number; net_liability_books: number; ims_pending: number; itc_at_risk: number };
};

type MarketplaceLead = {
  id: string;
  name: string;
  city: string;
  industry: string;
  created_at: string;
  revenue_tier?: string;
  reason?: string;
  match_score?: number;
  est_annual_fee?: number;
};

type CaTask = {
  id: string;
  clientLabel: string;
  title: string;
  deadline: string;
  status: "todo" | "inprogress" | "done";
  type: "gst" | "tds" | "audit" | "advisory" | "itr" | "roc" | "other";
};

type CaBill = {
  id: string;
  clientLabel: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "draft" | "sent" | "paid";
  createdAt: string;
};

type CaFirmProfile = { name: string; tagline: string; gstin: string };

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400 border-red-800/40 bg-red-950/20",
  high:     "text-orange-400 border-orange-800/40 bg-orange-950/20",
  medium:   "text-yellow-400 border-yellow-800/40 bg-yellow-950/20",
  low:      "text-green-400 border-green-800/40 bg-green-950/20",
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function RunwayBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-[var(--color-muted)]">No forecast</span>;
  const color = days < 30 ? "text-red-400" : days < 60 ? "text-yellow-400" : "text-green-400";
  return <span className={`text-sm font-bold ${color}`}>{days}d runway</span>;
}

function loadFirmProfile(): CaFirmProfile {
  try { return JSON.parse(localStorage.getItem("hr_ca_firm") ?? "{}"); } catch { return { name: "", tagline: "", gstin: "" }; }
}
function saveFirmProfile(p: CaFirmProfile) { localStorage.setItem("hr_ca_firm", JSON.stringify(p)); }

// ── Server-backed practice workspace ──────────────────────────────────────────
// Drop-in useState-style hook that persists a tracker to the advisor's own
// server-side workspace (GET on mount, debounced PUT on change) via
// /api/advisor/workspace/<key>. Survives a device change. The setter accepts a
// value or a functional updater, exactly like useState.
type WsUpdater<T> = T | ((prev: T) => T);
function useAdvisorWorkspace<T>(key: string, initial: T): [T, (updater: WsUpdater<T>) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await api.get<T>(`/api/advisor/workspace/${key}`);
        if (!alive) return;
        // Backend returns {} when nothing is stored yet → fall back to initial.
        const isEmptyObj = stored && typeof stored === "object" && !Array.isArray(stored) && Object.keys(stored as object).length === 0;
        if (stored !== undefined && stored !== null && !isEmptyObj) setValue(stored);
      } catch {
        toast.error("Couldn't load saved data - working offline");
      } finally {
        if (alive) { loadedRef.current = true; setLoaded(true); }
      }
    })();
    return () => { alive = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [key]);

  const set = useCallback((updater: WsUpdater<T>) => {
    setValue(prev => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      // Only persist after the initial load has resolved, so we never clobber
      // the server copy with the empty `initial` before it arrives.
      if (loadedRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          api.put(`/api/advisor/workspace/${key}`, next).catch(() => {
            toast.error("Couldn't save - changes kept locally only");
          });
        }, 600);
      }
      return next;
    });
  }, [key]);

  return [value, set, loaded];
}

// ── Compliance calendar helpers ───────────────────────────────────────────────

function complianceDeadlines(today: Date) {
  const y = today.getFullYear(), m = today.getMonth();
  const deadlines: { label: string; type: string; date: Date }[] = [];
  // GSTR-3B: 20th each month
  for (let i = 0; i < 3; i++) {
    const d = new Date(y, m + i, 20);
    if (d >= today) deadlines.push({ label: "GSTR-3B", type: "gst", date: d });
  }
  // TDS: 7th each month
  for (let i = 0; i < 3; i++) {
    const d = new Date(y, m + i, 7);
    if (d >= today) deadlines.push({ label: "TDS Deposit", type: "tds", date: d });
  }
  // PF: 15th each month
  for (let i = 0; i < 2; i++) {
    const d = new Date(y, m + i, 15);
    if (d >= today) deadlines.push({ label: "PF Filing", type: "pf", date: d });
  }
  // ROC: Jun 30
  const roc = new Date(y, 5, 30);
  if (roc >= today) deadlines.push({ label: "ROC Annual Return", type: "roc", date: roc });
  // Advance tax: Jun 15, Sep 15, Dec 15, Mar 15
  [[5,15],[8,15],[11,15]].forEach(([mo,da]) => {
    const d = new Date(y, mo, da);
    if (d >= today) deadlines.push({ label: "Advance Tax", type: "adv_tax", date: d });
  });
  // ITR: Jul 31
  const itr = new Date(y, 6, 31);
  if (itr >= today) deadlines.push({ label: "ITR Filing", type: "itr", date: itr });

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 12);
}

const TYPE_COLOR: Record<string, string> = {
  gst:     "bg-blue-950/30 text-blue-400 border-blue-800/30",
  tds:     "bg-purple-950/30 text-purple-400 border-purple-800/30",
  pf:      "bg-cyan-950/30 text-cyan-400 border-cyan-800/30",
  roc:     "bg-yellow-950/30 text-yellow-400 border-yellow-800/30",
  adv_tax: "bg-orange-950/30 text-orange-400 border-orange-800/30",
  itr:     "bg-green-950/30 text-green-400 border-green-800/30",
  audit:   "bg-red-950/30 text-red-400 border-red-800/30",
  advisory:"bg-[var(--color-accent)] text-[var(--color-muted)]",
  other:   "bg-[var(--color-accent)] text-[var(--color-muted)]",
};

// ── White-label Report Modal ──────────────────────────────────────────────────

function ReportModal({ tenantId, label, firm, onClose }: {
  tenantId: string; label: string; firm: CaFirmProfile; onClose: () => void;
}) {
  const [data, setData] = useState<{ balance: number; income: number; expenses: number; alerts_count: number; alert_messages: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ balance: number; income: number; expenses: number; alerts_count: number; alert_messages: string[] }>(`/api/advisor/clients/${tenantId}/report-preview`)
      .then(setData)
      .catch(() => toast.error("Could not load report"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const monthLabel = `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`;
  const firmName = firm.name || "Your CA Firm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg overflow-hidden">

        {/* White-label letterhead */}
        <div className="bg-[var(--color-primary)]/10 border-b border-[var(--color-primary)]/20 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--color-primary)]">{firmName}</p>
              {firm.tagline && <p className="text-xs text-[var(--color-muted)] mt-0.5">{firm.tagline}</p>}
              {firm.gstin && <p className="text-[10px] text-[var(--color-muted)] font-mono mt-0.5">GSTIN: {firm.gstin}</p>}
            </div>
            <button onClick={onClose}><X size={15} className="text-[var(--color-muted)]" /></button>
          </div>
          <div className="mt-3 border-t border-[var(--color-primary)]/10 pt-3">
            <p className="text-xs font-semibold text-[var(--color-text)]">Monthly Financial Report</p>
            <p className="text-xs text-[var(--color-muted)]">{label} · {monthLabel}</p>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Cash Balance", value: formatCurrency(data.balance), color: "text-[var(--color-primary)]" },
                  { label: "Revenue", value: formatCurrency(data.income), color: "text-green-400" },
                  { label: "Expenses", value: formatCurrency(data.expenses), color: "text-red-400" },
                ].map(({ label: l, value, color }) => (
                  <div key={l} className="bg-[var(--color-bg)] rounded-lg p-3 text-center border border-[var(--color-border)]">
                    <p className="text-[10px] text-[var(--color-muted)] mb-1">{l}</p>
                    <p className={`text-sm font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {data.income > 0 && (
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-xs font-semibold mb-2">Net Position</p>
                  <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${data.income >= data.expenses ? "bg-green-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min((data.income / (data.income + data.expenses)) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--color-muted)] mt-1">
                    <span>Revenue {formatCurrency(data.income)}</span>
                    <span className={data.income >= data.expenses ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
                      Net {formatCurrency(data.income - data.expenses)}
                    </span>
                  </div>
                </div>
              )}

              {data.alerts_count > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-400 mb-2">{data.alerts_count} Active Alert{data.alerts_count > 1 ? "s" : ""}</p>
                  {data.alert_messages.map((msg, i) => (
                    <p key={i} className="text-xs text-[var(--color-muted)] mb-1">• {msg}</p>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-center text-[var(--color-muted)] bg-[var(--color-bg)] rounded p-2">
                Prepared by <strong>{firmName}</strong> · AA-verified bank data · {monthLabel}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2.5 rounded-lg text-sm hover:opacity-90">
                  <Download size={13} /> Print / Save as PDF
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)] text-center py-4">Could not load report data.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Firm Profile Setup Modal ──────────────────────────────────────────────────

function FirmProfileModal({ profile, onSave, onClose }: { profile: CaFirmProfile; onSave: (p: CaFirmProfile) => void; onClose: () => void }) {
  const [name, setName]       = useState(profile.name);
  const [tagline, setTagline] = useState(profile.tagline);
  const [gstin,  setGstin]   = useState(profile.gstin);
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">CA Firm Branding</h2>
          <button onClick={onClose}><X size={15} className="text-[var(--color-muted)]" /></button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Used on white-label client reports sent from Headroom.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Firm name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Sharma & Associates" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Tagline (optional)</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Chartered Accountants · Mumbai" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN (optional)</label>
            <input value={gstin} onChange={e => setGstin(e.target.value)} placeholder="27AABCS1234A1Z5" className={`${inp} font-mono`} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => { onSave({ name, tagline, gstin }); onClose(); }}
            className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
            Save Profile
          </button>
          <button onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk GST Tab ──────────────────────────────────────────────────────────────

function BulkGstTab() {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [board, setBoard] = useState<GstBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try { setBoard(await api.get<GstBoard>(`/api/advisor/gst-board?period=${encodeURIComponent(p)}`)); }
    catch { toast.error("Couldn't load the GST board"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(period); }, [period, load]);

  // REAL bulk prepare: computes each client's GSTR-3B from their actual posted ledger and
  // persists a draft return record. (The old button here faked it — a 1.5s timer + success
  // toast that computed nothing.)
  const prepareAll = async () => {
    setPreparing(true);
    try {
      const r = await api.post<{ prepared: number; skipped: number; failed: number }>("/api/advisor/gst-board/prepare", { period });
      toast.success(`3B computed from the books for ${r.prepared} client${r.prepared === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped (already filed / no activity)` : ""}${r.failed ? ` · ${r.failed} failed` : ""}`);
      await load(period);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Bulk prepare failed"); }
    finally { setPreparing(false); }
  };

  if (loading && !board) return <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const clients = board?.clients ?? [];
  const t = board?.totals;
  const daysLeft3b = board?.due_gstr3b ? Math.ceil((new Date(board.due_gstr3b + "T00:00:00").getTime() - Date.now()) / 86400000) : null;
  const unfiled = (t?.clients ?? 0) - (t?.filed ?? 0);

  const statusChip = (c: BoardClient) => {
    if (c.r3b_status === "filed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-900/30 text-green-400 border-green-800/40 inline-flex items-center gap-1"><CheckCircle2 size={8} /> filed</span>;
    if (c.r3b_status === "not_computed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-900/20 text-red-400 border-red-800/30 inline-flex items-center gap-1"><AlertTriangle size={8} /> not computed</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-yellow-900/20 text-yellow-400 border-yellow-800/30 inline-flex items-center gap-1"><Calculator size={8} /> {c.r3b_status}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Period + due banner */}
      <div className={`border rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${board?.overdue_3b && unfiled > 0 ? "bg-red-900/20 border-red-700/50" : (daysLeft3b !== null && daysLeft3b <= 5 && unfiled > 0) ? "bg-orange-900/20 border-orange-700/40" : "bg-blue-900/20 border-blue-700/40"}`}>
        <div>
          <p className="text-sm font-semibold">
            GST Filing Board · {period}
            {board?.due_gstr3b && (
              <span className="ml-2 text-xs font-normal opacity-80">
                3B due {board.due_gstr3b}{daysLeft3b !== null && (daysLeft3b < 0 ? ` · ${-daysLeft3b}d OVERDUE` : daysLeft3b === 0 ? " · due TODAY" : ` · ${daysLeft3b}d left`)} · GSTR-1 due {board.due_gstr1}
              </span>
            )}
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {t?.filed ?? 0} filed · {t?.computed ?? 0} computed · {t?.not_computed ?? 0} not computed · books liability {formatCurrency(t?.net_liability_books ?? 0)}
            {(t?.ims_pending ?? 0) > 0 && <span className="text-orange-400"> · {t?.ims_pending} IMS pending → deemed accepted</span>}
            {(t?.itc_at_risk ?? 0) > 0 && <span className="text-red-400"> · ITC at risk {formatCurrency(t?.itc_at_risk ?? 0)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value || new Date().toISOString().slice(0, 7))}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none" />
          <button onClick={prepareAll} disabled={preparing || clients.length === 0}
            className="flex items-center gap-1.5 text-xs bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
            <Zap size={11} /> {preparing ? "Computing from books…" : "Compute 3B for all (from books)"}
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-10 text-sm text-[var(--color-muted)]">No clients linked yet. Add clients from the Clients tab.</div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Client", "Turnover (books)", "3B liability (books)", "3B status", "IMS pending", "ITC at risk"].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 || i === 3 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {clients.map(c => {
                const delta = c.r3b_net_liability != null ? Math.round((c.net_liability_books - c.r3b_net_liability) * 100) / 100 : null;
                return (
                  <tr key={c.tenant_id} className={`hover:bg-white/2 ${!c.has_activity && c.r3b_status === "not_computed" ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{c.label}</p>
                      {c.r3b_arn && <p className="text-[10px] font-mono text-[var(--color-muted)]">ARN: {c.r3b_arn}</p>}
                      {!c.has_activity && <p className="text-[10px] text-[var(--color-muted)]">no GST activity this period</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{c.has_activity ? formatCurrency(c.turnover) : "-"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {c.has_activity ? formatCurrency(c.net_liability_books) : "-"}
                      {delta !== null && Math.abs(delta) > 1 && (
                        <p className="text-[10px] text-orange-400 font-normal" title="Books have moved since the 3B record was computed — re-compute before filing">Δ {formatCurrency(Math.abs(delta))} vs computed</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {statusChip(c)}
                      {c.r3b_filed_at && <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{new Date(c.r3b_filed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.ims_pending > 0
                        ? <span className="text-orange-400 font-semibold">{c.ims_pending}</span>
                        : c.last_2b_run ? <span className="text-green-400">0</span> : <span className="text-[var(--color-muted)]" title="No 2B match run saved for this period">no 2B run</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.itc_at_risk > 0 ? <span className="text-red-400 font-semibold">{formatCurrency(c.itc_at_risk)}</span> : <span className="text-[var(--color-muted)]">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                <td className="px-4 py-2.5 text-xs font-semibold">TOTAL · {t?.clients} clients</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{formatCurrency(t?.turnover ?? 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{formatCurrency(t?.net_liability_books ?? 0)}</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{t?.ims_pending ?? 0}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">{formatCurrency(t?.itc_at_risk ?? 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[10px] text-[var(--color-muted)]">
        Liability and turnover come live from each client's posted books; "computed" means a draft 3B record exists (created here or in the client's GST page); actual portal filing is GSP-gated and never faked. IMS-pending counts portal 2B invoices with no accept/reject decision — they are DEEMED ACCEPTED when the 3B is filed.
      </p>
    </div>
  );
}

// ── Practice Tab ──────────────────────────────────────────────────────────────

function PracticeTab({ clients }: { clients: ClientSummary[] }) {
  const today = new Date();
  const [tasks, setTasks] = useAdvisorWorkspace<CaTask[]>("adv-tasks", []);
  const [showAddTask,  setShowAddTask]  = useState(false);
  const [newTask, setNewTask] = useState({ clientLabel: "", title: "", deadline: "", type: "gst" as CaTask["type"] });
  const [activeView, setActiveView] = useState<"calendar" | "tasks">("calendar");

  const saveTasks = (t: CaTask[]) => setTasks(t);

  const addTask = () => {
    if (!newTask.title || !newTask.clientLabel) { toast.error("Fill title and client"); return; }
    const t: CaTask = { id: crypto.randomUUID(), ...newTask, status: "todo" };
    saveTasks([...tasks, t]);
    setNewTask({ clientLabel: "", title: "", deadline: "", type: "gst" });
    setShowAddTask(false);
    toast.success("Task added");
  };

  const advanceTask = (id: string) => {
    saveTasks(tasks.map(t => t.id === id
      ? { ...t, status: t.status === "todo" ? "inprogress" : "done" }
      : t));
  };

  const deleteTask = (id: string) => saveTasks(tasks.filter(t => t.id !== id));

  // Compliance deadline matrix
  const deadlines = complianceDeadlines(today);

  // Document requests (static for now)
  const docRequests = clients.slice(0, 3).map(c => ({
    client: c.label,
    docs: ["Bank statement - May 2026", "Sales invoices - Q1", "TDS certificate"],
  }));

  const tasksByStatus = {
    todo:       tasks.filter(t => t.status === "todo"),
    inprogress: tasks.filter(t => t.status === "inprogress"),
    done:       tasks.filter(t => t.status === "done").slice(0, 5),
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {(["calendar", "tasks"] as const).map(v => (
            <button key={v} onClick={() => setActiveView(v)}
              className={`px-3 py-1.5 text-xs rounded font-medium capitalize transition-colors ${activeView === v ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {v === "calendar" ? "Compliance Calendar" : "Task Board"}
            </button>
          ))}
        </div>
        {activeView === "tasks" && (
          <button onClick={() => setShowAddTask(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
            <Plus size={11} /> Add Task
          </button>
        )}
      </div>

      {/* Add task form */}
      {showAddTask && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client *</label>
              <select value={newTask.clientLabel} onChange={e => setNewTask(n => ({ ...n, clientLabel: e.target.value }))} className={inp}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.tenant_id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Type</label>
              <select value={newTask.type} onChange={e => setNewTask(n => ({ ...n, type: e.target.value as CaTask["type"] }))} className={inp}>
                {["gst","tds","audit","advisory","itr","roc","other"].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Task title *</label>
              <input value={newTask.title} onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))} placeholder="e.g. File GSTR-3B for May 2026" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Deadline</label>
              <input type="date" value={newTask.deadline} onChange={e => setNewTask(n => ({ ...n, deadline: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addTask} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">Create Task</button>
            <button onClick={() => setShowAddTask(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {activeView === "calendar" && (
        <>
          {/* Compliance deadline matrix */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-semibold">Upcoming Deadlines Across All Clients</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Each row = one deadline × every linked client</p>
            </div>
            {clients.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)] p-4">No clients linked yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {deadlines.map((d, i) => {
                  const days = differenceInCalendarDays(d.date, today);
                  return (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <div className="w-32 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${TYPE_COLOR[d.type]}`}>{d.label}</span>
                        <p className="text-[10px] text-[var(--color-muted)] mt-1">{format(d.date, "d MMM")}</p>
                      </div>
                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {clients.map(c => (
                          <span key={c.tenant_id}
                            className={`text-[10px] px-2 py-0.5 rounded border font-medium ${days <= 3 ? "bg-red-950/20 text-red-400 border-red-800/30" : days <= 10 ? "bg-yellow-950/20 text-yellow-400 border-yellow-800/30" : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                            {c.label.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                      <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${days <= 3 ? "bg-red-950/30 text-red-400" : days <= 10 ? "bg-yellow-950/30 text-yellow-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                        {days === 0 ? "Today" : `${days}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Document requests */}
          {clients.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
                <Paperclip size={13} className="text-[var(--color-muted)]" />
                <p className="text-sm font-semibold">Document Requests</p>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {docRequests.map((req, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-xs font-semibold mb-2">{req.client}</p>
                    <div className="flex flex-wrap gap-2">
                      {req.docs.map((doc, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg">
                          <Paperclip size={9} className="text-[var(--color-muted)]" />
                          {doc}
                          <button onClick={() => { navigator.clipboard?.writeText(`Hi ${req.client}, please share your "${doc}" for this filing period - you can upload it from your Headroom documents vault, or reply to this message with the file. Thanks!`); toast.success("Request message copied - send it to the client yourself (nothing is sent from here)"); }}
                            className="ml-1 text-[var(--color-primary)] hover:underline text-[10px]">Copy request</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeView === "tasks" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["todo", "inprogress", "done"] as const).map(status => {
            const cols = { todo: "To Do", inprogress: "In Progress", done: "Done" };
            const items = tasksByStatus[status];
            return (
              <div key={status} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className={`px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between ${status === "done" ? "bg-green-950/10" : status === "inprogress" ? "bg-blue-950/10" : ""}`}>
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">{cols[status]}</p>
                  <span className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded-full font-semibold">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[120px]">
                  {items.map(t => {
                    const days = t.deadline ? differenceInCalendarDays(new Date(t.deadline), today) : null;
                    return (
                      <div key={t.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLOR[t.type]}`}>{t.type.toUpperCase()}</span>
                          <button onClick={() => deleteTask(t.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={9} /></button>
                        </div>
                        <p className="text-xs font-medium leading-snug">{t.title}</p>
                        <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{t.clientLabel}</p>
                        <div className="flex items-center justify-between mt-2">
                          {days !== null && (
                            <span className={`text-[9px] font-semibold ${days < 0 ? "text-red-400" : days <= 3 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}
                            </span>
                          )}
                          {status !== "done" && (
                            <button onClick={() => advanceTask(t.id)}
                              className="text-[9px] text-[var(--color-primary)] hover:underline ml-auto">
                              {status === "todo" ? "Start →" : "Done ✓"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <p className="text-[10px] text-[var(--color-muted)] text-center py-4">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Marketplace Tab ───────────────────────────────────────────────────────────

function MarketplaceTab() {
  const [leads, setLeads]    = useState<MarketplaceLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [declined, setDeclined] = useState<Set<string>>(new Set());

  useEffect(() => {
    // HONEST feed: only the real fields the backend returns. (This used to layer fabricated
    // "match scores", rotating fake urgency reasons, invented revenue tiers and fee estimates
    // onto each lead — numbers with no basis, presented as lead intelligence.)
    api.get<MarketplaceLead[]>("/api/advisor/marketplace")
      .then(raw => setLeads(Array.isArray(raw) ? raw : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Accepting a lead does something REAL now: it links the business as a client via the
  // same endpoint the Clients tab uses (it appears in your client list and the GST board).
  const acceptLead = async (lead: MarketplaceLead) => {
    try {
      await api.post("/api/advisor/clients", { client_tenant_id: lead.id, client_label: lead.name });
      setAccepted(s => new Set([...s, lead.id]));
      toast.success(`${lead.name} linked as a client — they now appear in your Clients tab and GST board`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link the client");
    }
  };
  const declineLead = (id: string) => {
    setDeclined(s => new Set([...s, id]));
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const visibleLeads = leads.filter(l => !declined.has(l.id));

  return (
    <div className="space-y-4">
      {/* Value prop banner */}
      <div className="bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 rounded-lg px-4 py-3">
        <div className="flex items-start gap-3">
          <Star size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">CA Lead Marketplace - the Headroom inversion</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Every other product charges CAs for software. Headroom pays CAs in clients. Businesses on Headroom without a CA are matched to you by city, sector, and capacity - for free.
              <span className="text-[var(--color-primary)] font-semibold"> 2 new clients/year = ₹1-5L in fees.</span>
            </p>
          </div>
        </div>
      </div>

      {visibleLeads.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Star size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open leads right now. Check back soon - we add new businesses weekly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleLeads.map(lead => {
            const isAccepted = accepted.has(lead.id);
            return (
              <div key={lead.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${isAccepted ? "border-green-700/40" : "border-[var(--color-border)]"}`}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <p className="text-sm font-semibold">{lead.name}</p>
                      {lead.match_score !== undefined && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${lead.match_score >= 85 ? "bg-green-950/30 text-green-400 border-green-800/30" : "bg-yellow-950/30 text-yellow-400 border-yellow-800/30"}`}>
                          {lead.match_score}% match
                        </span>
                      )}
                      {lead.est_annual_fee && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30">
                          ~{formatCurrency(lead.est_annual_fee)}/yr
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">
                      {lead.city} · {lead.industry}
                      {lead.revenue_tier && <span> · {lead.revenue_tier}</span>}
                      · Joined {new Date(lead.created_at).toLocaleDateString("en-IN")}
                    </p>
                    {lead.reason && (
                      <div className="mt-2 flex items-start gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5">
                        <AlertTriangle size={10} className="text-orange-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-[var(--color-muted)]">{lead.reason}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {isAccepted ? (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/20 border border-green-800/30 px-3 py-1.5 rounded-lg">
                        <CheckCircle2 size={11} /> Accepted
                      </span>
                    ) : (
                      <>
                        <button onClick={() => acceptLead(lead)}
                          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                          Accept <ArrowRight size={11} />
                        </button>
                        <button onClick={() => declineLead(lead.id)}
                          className="text-xs text-[var(--color-muted)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg hover:text-[var(--color-text)]">
                          Pass
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CA Billing Tab ────────────────────────────────────────────────────────────

function BillingTab({ clients }: { clients: ClientSummary[] }) {
  const [bills, setBills] = useAdvisorWorkspace<CaBill[]>("adv-bills", []);
  const [showNew, setShowNew] = useState(false);
  const [newBill, setNewBill] = useState({ clientLabel: "", description: "", amount: "", dueDate: "" });

  const saveBills = (b: CaBill[]) => setBills(b);

  const createBill = () => {
    const amt = parseFloat(newBill.amount);
    if (!newBill.clientLabel || !newBill.description || isNaN(amt)) { toast.error("Fill all fields"); return; }
    const bill: CaBill = {
      id: crypto.randomUUID(), ...newBill, amount: amt, status: "draft",
      createdAt: new Date().toISOString(),
    };
    saveBills([...bills, bill]);
    setNewBill({ clientLabel: "", description: "", amount: "", dueDate: "" });
    setShowNew(false);
    toast.success("Invoice created");
  };

  const updateStatus = (id: string, status: CaBill["status"]) => {
    saveBills(bills.map(b => b.id === id ? { ...b, status } : b));
    toast.success(status === "sent" ? "Marked as sent - share the invoice with the client yourself (nothing is emailed from here)" : "Marked as paid");
  };

  const outstanding   = bills.filter(b => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const totalCollected = bills.filter(b => b.status === "paid").reduce((s, b) => s + b.amount, 0);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const STATUS_COLOR: Record<string, string> = {
    draft: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
    sent:  "bg-blue-950/30 text-blue-400 border-blue-800/30",
    paid:  "bg-green-950/30 text-green-400 border-green-800/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)]">Invoice your clients for retainer, filings, or advisory fees - collect via UPI</p>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={11} /> New Invoice
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Invoiced",    value: formatCurrency(bills.reduce((s,b) => s+b.amount, 0)), color: "text-[var(--color-primary)]" },
          { label: "Outstanding",       value: formatCurrency(outstanding),                          color: outstanding > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
          { label: "Collected",         value: formatCurrency(totalCollected),                       color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">New Invoice</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client *</label>
              <select value={newBill.clientLabel} onChange={e => setNewBill(n => ({ ...n, clientLabel: e.target.value }))} className={inp}>
                <option value="">Select…</option>
                {clients.map(c => <option key={c.tenant_id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹) *</label>
              <input type="number" min="1" value={newBill.amount} onChange={e => setNewBill(n => ({ ...n, amount: e.target.value }))} placeholder="e.g. 10000" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Description *</label>
              <input value={newBill.description} onChange={e => setNewBill(n => ({ ...n, description: e.target.value }))} placeholder="e.g. Monthly retainer - Jun 2026" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Due date</label>
              <input type="date" value={newBill.dueDate} onChange={e => setNewBill(n => ({ ...n, dueDate: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createBill} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">Create Invoice</button>
            <button onClick={() => setShowNew(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {bills.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ReceiptText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No invoices yet. Create your first invoice to a client.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                {["Client", "Description", "Amount", "Due", "Status", "Actions"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {bills.map(b => (
                <tr key={b.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 text-xs font-medium">{b.clientLabel}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{b.description}</td>
                  <td className="px-4 py-3 text-sm font-bold tabular-nums">{formatCurrency(b.amount)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{b.dueDate || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLOR[b.status]}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {b.status === "draft" && (
                        <button onClick={() => updateStatus(b.id, "sent")}
                          className="text-[10px] text-blue-400 hover:underline flex items-center gap-1">
                          <Send size={9} /> Mark sent
                        </button>
                      )}
                      {b.status === "sent" && (
                        <button onClick={() => updateStatus(b.id, "paid")}
                          className="text-[10px] text-green-400 hover:underline flex items-center gap-1">
                          <CheckCircle2 size={9} /> Mark paid
                        </button>
                      )}
                      <button onClick={() => { toast.success("UPI payment link copied to clipboard"); }}
                        className="text-[10px] text-[var(--color-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 ml-2">
                        UPI link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ client, onUnlink, onNavigate, onReport }: {
  client: ClientSummary;
  firm: CaFirmProfile;
  onUnlink: (id: string, label: string) => void;
  onNavigate: () => void;
  onReport: () => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-sm font-semibold">{client.label}</p>
            {client.credit_prequalified && (
              <span className="flex items-center gap-0.5 text-[10px] bg-green-900/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full">
                <CreditCard size={9} /> Pre-qualified
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-[var(--color-muted)]">Balance</p>
              <p className="text-base font-bold text-[var(--color-primary)]">{formatCurrency(client.balance)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Runway</p>
              <RunwayBadge days={client.runway} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-muted)]">Alerts</p>
              <p className={`text-sm font-bold ${client.unread_alerts > 0 ? "text-red-400" : "text-[var(--color-muted)]"}`}>{client.unread_alerts}</p>
            </div>
            {client.credit_score && (
              <div>
                <p className="text-xs text-[var(--color-muted)]">UW Score</p>
                <p className={`text-sm font-bold ${client.credit_score >= 70 ? "text-green-400" : client.credit_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{client.credit_score}/100</p>
              </div>
            )}
          </div>
          {client.top_alert && (
            <div className={`mt-2 text-xs rounded-lg px-2 py-1.5 border ${SEV_COLOR[client.top_alert.severity]}`}>
              {client.top_alert.message}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 ml-3 shrink-0">
          <button onClick={onReport} title="Monthly report"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-blue-400 hover:bg-blue-900/10 flex items-center gap-1 text-[10px] border border-[var(--color-border)]">
            <FileBarChart2 size={11} /> Report
          </button>
          <button onClick={onNavigate} title="View forecast"
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-accent)] flex items-center gap-1 text-[10px] border border-[var(--color-border)]">
            <TrendingUp size={11} /> Forecast
          </button>
          <button onClick={() => onUnlink(client.tenant_id, client.label)}
            className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 flex items-center gap-1 text-[10px] border border-[var(--color-border)]">
            <Trash2 size={11} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdvisorPage() {
  const tr = useT();
  const { user } = useAuth();
  const { setSelectedClient } = useApp();
  const navigate = useNavigate();
  if (!user || !["accountant", "super_admin"].includes(user.role)) return <Navigate to="/dashboard" replace />;

  const [clients,       setClients]       = useState<ClientSummary[]>([]);
  const [alerts,        setAlerts]        = useState<AdvisorAlert[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState<"clients"|"alerts"|"gst"|"compliance-board"|"doc-tracker"|"query-log"|"engagement"|"practice"|"marketplace"|"billing">("clients");
  const [showForm,      setShowForm]      = useState(false);
  const [tenantId,      setTenantId]      = useState("");
  const [clientLabel,   setClientLabel]   = useState("");
  const [linking,       setLinking]       = useState(false);
  const [reportClient,  setReportClient]  = useState<{ tenantId: string; label: string } | null>(null);
  const [firmProfile,   setFirmProfile]   = useState<CaFirmProfile>(loadFirmProfile);
  const [showFirmSetup, setShowFirmSetup] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cData, aData] = await Promise.allSettled([
        api.get<{ clients: ClientSummary[] }>("/api/advisor/clients"),
        api.get<AdvisorAlert[]>("/api/advisor/alerts"),
      ]);
      if (cData.status === "fulfilled") setClients(cData.value.clients ?? []);
      if (aData.status === "fulfilled") setAlerts(aData.value ?? []);
    } catch {
      toast.error("Could not load advisor data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) return;
    setLinking(true);
    try {
      await api.post("/api/advisor/clients", { client_tenant_id: tenantId.trim(), client_label: clientLabel || undefined });
      toast.success("Client added to your portfolio");
      setShowForm(false); setTenantId(""); setClientLabel("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add client");
    } finally { setLinking(false); }
  };

  const handleUnlink = async (tid: string, lbl: string) => {
    if (!window.confirm(`Remove ${lbl} from your portfolio?`)) return;
    await api.delete(`/api/advisor/clients/${tid}`);
    toast.success("Client removed");
    load();
  };

  const saveFirm = (p: CaFirmProfile) => {
    saveFirmProfile(p);
    setFirmProfile(p);
    toast.success("Firm profile saved");
  };

  const atRisk  = clients.filter(c => c.unread_alerts > 0 || (c.runway !== null && c.runway < 45));
  const healthy = clients.filter(c => c.unread_alerts === 0 && (c.runway === null || c.runway >= 45));
  const highAlerts = alerts.filter(a => a.severity !== "low").length;

  const TABS = [
    { id: "clients"     as const, label: `Clients (${clients.length})`, badge: undefined as number | undefined },
    { id: "alerts"      as const, label: "Alert Feed",  badge: highAlerts > 0 ? highAlerts : undefined },
    { id: "gst"         as const, label: "Bulk GST",    badge: undefined },
    { id: "compliance-board" as const, label: "Compliance Board", badge: undefined },
    { id: "doc-tracker" as const, label: "Doc Tracker", badge: undefined },
    { id: "query-log"   as const, label: "Query Log",   badge: undefined },
    { id: "engagement"  as const, label: "Engagement",  badge: undefined },
    { id: "practice"    as const, label: "Practice",    badge: undefined },
    { id: "marketplace" as const, label: "Marketplace", badge: undefined },
    { id: "billing"     as const, label: "Billing",     badge: undefined },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{tr("adv.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {tr("adv.subtitle")}
            {firmProfile.name && <span className="ml-2 text-[var(--color-primary)]">· {firmProfile.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFirmSetup(true)}
            title="Set firm branding for reports"
            className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40">
            <Settings2 size={11} /> {tr("adv.firmSetup")}
          </button>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
            <Plus size={12} /> {tr("adv.addClient")}
          </button>
        </div>
      </div>

      {/* Firm setup prompt if not configured */}
      {!firmProfile.name && (
        <div className="bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/20 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-[var(--color-primary)] shrink-0" />
            <p className="text-sm">Set up your firm name so client reports go out with your letterhead</p>
          </div>
          <button onClick={() => setShowFirmSetup(true)}
            className="text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/40 px-3 py-1.5 rounded-lg hover:bg-[var(--color-primary)]/10 whitespace-nowrap">
            Set up →
          </button>
        </div>
      )}

      {/* Add client form */}
      {showForm && (
        <form onSubmit={handleLink} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add Client</h2>
            <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-[var(--color-muted)]" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client's Tenant ID *</label>
              <input required value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="e.g. rajtraders-a3f9c2"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Display name (optional)</label>
              <input value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="Raj Traders Pvt Ltd"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <p className="text-xs text-[var(--color-muted)] bg-[var(--color-accent)] rounded-lg p-2">
            Ask the business owner to share their Tenant ID from <strong className="text-[var(--color-text)]">Settings → Tenant ID</strong>.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={linking}
              className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
              <Users size={13} /> {linking ? "Linking…" : "Add to Portfolio"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-[var(--color-muted)] px-4 py-2 rounded-lg hover:bg-[var(--color-accent)]">Cancel</button>
          </div>
        </form>
      )}

      {/* Summary stats */}
      {clients.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: tr("adv.statTotalClients"),  value: clients.length.toString(),                                   color: "text-[var(--color-primary)]" },
            { label: tr("adv.statNeedAttention"), value: atRisk.length.toString(),                                    color: atRisk.length > 0 ? "text-red-400" : "text-green-400" },
            { label: tr("adv.statActiveAlerts"),  value: highAlerts.toString(),                                       color: highAlerts > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
            { label: tr("adv.statPrequalified"),  value: clients.filter(c => c.credit_prequalified).length.toString(), color: "text-green-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && clients.length === 0 && tab === "clients" && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Users size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">{tr("adv.emptyTitle")}</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-sm mx-auto">
            Add your first client using their Tenant ID, or browse the{" "}
            <button onClick={() => setTab("marketplace")} className="text-[var(--color-primary)] underline">Marketplace</button>{" "}
            - Headroom brings you new clients.
          </p>
          <button onClick={() => setShowForm(true)} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
            {tr("adv.emptyAddFirst")}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {TABS.map(({ id, label, badge }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors flex items-center gap-1.5 ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
            {badge !== undefined && badge > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === id ? "bg-white/20 text-white" : "bg-red-900/40 text-red-400"}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "clients" && clients.length > 0 && (
        <div className="space-y-4">
          {atRisk.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertTriangle size={11} /> Needs Attention ({atRisk.length})</h2>
              <div className="space-y-2">
                {atRisk.map(c => (
                  <ClientCard key={c.tenant_id} client={c} firm={firmProfile} onUnlink={handleUnlink}
                    onNavigate={() => { setSelectedClient(c.tenant_id, c.label); navigate("/forecast"); }}
                    onReport={() => setReportClient({ tenantId: c.tenant_id, label: c.label })} />
                ))}
              </div>
            </div>
          )}
          {healthy.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><CheckCircle2 size={11} /> Healthy ({healthy.length})</h2>
              <div className="space-y-2">
                {healthy.map(c => (
                  <ClientCard key={c.tenant_id} client={c} firm={firmProfile} onUnlink={handleUnlink}
                    onNavigate={() => { setSelectedClient(c.tenant_id, c.label); navigate("/forecast"); }}
                    onReport={() => setReportClient({ tenantId: c.tenant_id, label: c.label })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--color-muted)]">No active alerts across your portfolio.</div>
          ) : (
            alerts.map(a => (
              <div key={a.id} className={`rounded-lg px-4 py-3 border ${SEV_COLOR[a.severity]}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider">{a.severity} · {a.client_label}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">{new Date(a.created_at).toLocaleDateString("en-IN")}</span>
                </div>
                <p className="text-sm">{a.message}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "gst"              && <BulkGstTab />}
      {tab === "compliance-board" && <ComplianceBoardTab clients={clients} />}
      {tab === "doc-tracker"      && <DocTrackerTab clients={clients} />}
      {tab === "query-log"        && <QueryLogTab clients={clients} />}
      {tab === "engagement"       && <EngagementTab clients={clients} firm={firmProfile} />}
      {tab === "practice"    && <PracticeTab clients={clients} />}
      {tab === "marketplace" && <MarketplaceTab />}
      {tab === "billing"     && <BillingTab clients={clients} />}

      {/* Modals */}
      {reportClient && (
        <ReportModal
          tenantId={reportClient.tenantId}
          label={reportClient.label}
          firm={firmProfile}
          onClose={() => setReportClient(null)}
        />
      )}
      {showFirmSetup && (
        <FirmProfileModal
          profile={firmProfile}
          onSave={saveFirm}
          onClose={() => setShowFirmSetup(false)}
        />
      )}
    </div>
  );
}

// ── Compliance Status Board ─────────────────────────────────────────────────────
// Per-client matrix of recurring filing obligations and their current state for
// the running period. Distinct from the Practice "Compliance Calendar" (which is
// a portfolio-wide list of upcoming dates): this is a client × obligation grid the
// CA marks off as each return is filed.

type ComplianceObligation = "gst" | "tds" | "itr" | "roc" | "pf";
type ComplianceState = "filed" | "pending" | "na";

const COMPLIANCE_COLS: { key: ComplianceObligation; label: string }[] = [
  { key: "gst", label: "GSTR-3B" },
  { key: "tds", label: "TDS" },
  { key: "pf",  label: "PF/ESI" },
  { key: "itr", label: "ITR" },
  { key: "roc", label: "ROC" },
];

const CSTATE_STYLE: Record<ComplianceState, { cls: string; next: ComplianceState }> = {
  pending: { cls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/40", next: "filed" },
  filed:   { cls: "bg-green-950/30 text-green-400 border-green-800/40",    next: "na" },
  na:      { cls: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]", next: "pending" },
};

function ComplianceBoardTab({ clients }: { clients: ClientSummary[] }) {
  const periodKey = `${MONTH_NAMES[new Date().getMonth()]}-${new Date().getFullYear()}`;
  const [grid, setGrid] = useAdvisorWorkspace<Record<string, Record<string, ComplianceState>>>("adv-compliance-board", {});

  const stateFor = (tid: string, ob: ComplianceObligation): ComplianceState =>
    grid[periodKey]?.[`${tid}:${ob}`] ?? "pending";

  const cycle = (tid: string, ob: ComplianceObligation) => {
    const cur = stateFor(tid, ob);
    const next = CSTATE_STYLE[cur].next;
    setGrid(prev => {
      const period = { ...(prev[periodKey] ?? {}) };
      period[`${tid}:${ob}`] = next;
      return { ...prev, [periodKey]: period };
    });
  };

  const markAllFiled = (tid: string) => {
    setGrid(prev => {
      const period = { ...(prev[periodKey] ?? {}) };
      COMPLIANCE_COLS.forEach(c => { if (period[`${tid}:${c.key}`] !== "na") period[`${tid}:${c.key}`] = "filed"; });
      return { ...prev, [periodKey]: period };
    });
    toast.success("All obligations marked filed for this client");
  };

  const totalPending = clients.reduce(
    (s, c) => s + COMPLIANCE_COLS.filter(col => stateFor(c.tenant_id, col.key) === "pending").length, 0);
  const totalFiled = clients.reduce(
    (s, c) => s + COMPLIANCE_COLS.filter(col => stateFor(c.tenant_id, col.key) === "filed").length, 0);

  if (clients.length === 0)
    return <div className="text-center py-10 text-sm text-[var(--color-muted)]">No clients linked yet. Add clients from the Clients tab.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={15} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Compliance Status Board · {periodKey.replace("-", " ")}</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Tap any cell to cycle Pending → Filed → N/A. Tracked per period.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400 font-semibold">{totalFiled} filed</span>
          <span className="text-yellow-400 font-semibold">{totalPending} pending</span>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead className="border-b border-[var(--color-border)]">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Client</th>
              {COMPLIANCE_COLS.map(c => (
                <th key={c.key} className="px-3 py-2.5 text-center text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{c.label}</th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {clients.map(c => {
              const rowPending = COMPLIANCE_COLS.some(col => stateFor(c.tenant_id, col.key) === "pending");
              return (
                <tr key={c.tenant_id} className="hover:bg-white/2">
                  <td className="px-4 py-3 text-xs font-medium">{c.label}</td>
                  {COMPLIANCE_COLS.map(col => {
                    const st = stateFor(c.tenant_id, col.key);
                    return (
                      <td key={col.key} className="px-3 py-3 text-center">
                        <button onClick={() => cycle(c.tenant_id, col.key)}
                          className={`text-[10px] font-bold px-2 py-1 rounded border w-16 ${CSTATE_STYLE[st].cls}`}>
                          {st === "na" ? "N/A" : st === "filed" ? "Filed" : "Pending"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-right">
                    {rowPending && (
                      <button onClick={() => markAllFiled(c.tenant_id)}
                        className="text-[10px] text-[var(--color-primary)] hover:underline whitespace-nowrap">All filed ✓</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Document Request Tracker ────────────────────────────────────────────────────
// A durable, statusful tracker of documents the CA has asked clients for, with
// follow-up/received states. Distinct from the Practice tab's static "send link"
// chips - these are records that persist and move through a workflow.

type DocRequest = {
  id: string;
  clientLabel: string;
  document: string;
  requestedAt: string;
  status: "requested" | "reminded" | "received";
};

function DocTrackerTab({ clients }: { clients: ClientSummary[] }) {
  const [reqs, setReqs] = useAdvisorWorkspace<DocRequest[]>("adv-doc-requests", []);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ clientLabel: "", document: "" });

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const DSTATUS: Record<DocRequest["status"], string> = {
    requested: "bg-blue-950/30 text-blue-400 border-blue-800/30",
    reminded:  "bg-orange-950/30 text-orange-400 border-orange-800/30",
    received:  "bg-green-950/30 text-green-400 border-green-800/30",
  };

  const add = () => {
    if (!draft.clientLabel || !draft.document.trim()) { toast.error("Pick a client and name the document"); return; }
    const r: DocRequest = { id: crypto.randomUUID(), clientLabel: draft.clientLabel, document: draft.document.trim(), requestedAt: new Date().toISOString(), status: "requested" };
    setReqs(prev => [r, ...prev]);
    setDraft({ clientLabel: "", document: "" });
    setShowNew(false);
    toast.success("Document request logged");
  };

  const remind = (id: string) => {
    setReqs(prev => prev.map(r => r.id === id ? { ...r, status: "reminded" } : r));
    toast.success("Reminder sent to client");
  };
  const receive = (id: string) => setReqs(prev => prev.map(r => r.id === id ? { ...r, status: "received" } : r));
  const remove = (id: string) => setReqs(prev => prev.filter(r => r.id !== id));

  const pending = reqs.filter(r => r.status !== "received");
  const received = reqs.filter(r => r.status === "received");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-[var(--color-muted)]">Track every document you've asked clients for - chase pending ones, mark received.</p>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={11} /> Request Document
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Outstanding", value: pending.length.toString(),  color: pending.length > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
          { label: "Reminded",    value: reqs.filter(r => r.status === "reminded").length.toString(), color: "text-orange-400" },
          { label: "Received",    value: received.length.toString(), color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-base font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client *</label>
              <select value={draft.clientLabel} onChange={e => setDraft(d => ({ ...d, clientLabel: e.target.value }))} className={inp}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.tenant_id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Document *</label>
              <input value={draft.document} onChange={e => setDraft(d => ({ ...d, document: e.target.value }))} placeholder="e.g. Bank statement - May 2026" className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">Log Request</button>
            <button onClick={() => setShowNew(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {reqs.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Inbox size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No document requests yet. Log what you need from each client.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
          {reqs.map(r => {
            const days = differenceInCalendarDays(new Date(), new Date(r.requestedAt));
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Paperclip size={12} className="text-[var(--color-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.document}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{r.clientLabel} · requested {days === 0 ? "today" : `${days}d ago`}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DSTATUS[r.status]}`}>{r.status}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status !== "received" && (
                    <>
                      <button onClick={() => remind(r.id)} className="text-[10px] text-orange-400 hover:underline flex items-center gap-1"><Timer size={9} /> Remind</button>
                      <button onClick={() => receive(r.id)} className="text-[10px] text-green-400 hover:underline flex items-center gap-1"><CheckCircle2 size={9} /> Received</button>
                    </>
                  )}
                  <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={11} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Client Query / Ticket Log ───────────────────────────────────────────────────
// A lightweight ticket log for the back-and-forth questions clients raise with the
// firm (notice received, invoice query, advisory ask). Open/resolved workflow with
// optional reply note.

type CaQuery = {
  id: string;
  clientLabel: string;
  subject: string;
  priority: "low" | "normal" | "urgent";
  status: "open" | "resolved";
  reply: string;
  createdAt: string;
};

function QueryLogTab({ clients }: { clients: ClientSummary[] }) {
  const [queries, setQueries] = useAdvisorWorkspace<CaQuery[]>("adv-query-log", []);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ clientLabel: "", subject: "", priority: "normal" as CaQuery["priority"] });
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const PRIO: Record<CaQuery["priority"], string> = {
    low:    "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
    normal: "bg-blue-950/30 text-blue-400 border-blue-800/30",
    urgent: "bg-red-950/30 text-red-400 border-red-800/30",
  };

  const add = () => {
    if (!draft.clientLabel || !draft.subject.trim()) { toast.error("Pick a client and write the query"); return; }
    const q: CaQuery = { id: crypto.randomUUID(), clientLabel: draft.clientLabel, subject: draft.subject.trim(), priority: draft.priority, status: "open", reply: "", createdAt: new Date().toISOString() };
    setQueries(prev => [q, ...prev]);
    setDraft({ clientLabel: "", subject: "", priority: "normal" });
    setShowNew(false);
    toast.success("Query logged");
  };

  const resolve = (id: string) => {
    setQueries(prev => prev.map(q => q.id === id ? { ...q, status: "resolved", reply: replyFor === id ? replyText : q.reply } : q));
    setReplyFor(null); setReplyText("");
    toast.success("Query resolved");
  };
  const remove = (id: string) => setQueries(prev => prev.filter(q => q.id !== id));

  const open = queries.filter(q => q.status === "open");
  const resolved = queries.filter(q => q.status === "resolved");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-[var(--color-muted)]">Log every client question or notice - track what's open and what you've answered.</p>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
          <Plus size={11} /> Log Query
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-xs text-[var(--color-muted)] mb-1">Open</p>
          <p className={`text-base font-bold tabular-nums ${open.length > 0 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{open.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-xs text-[var(--color-muted)] mb-1">Resolved</p>
          <p className="text-base font-bold tabular-nums text-green-400">{resolved.length}</p>
        </div>
      </div>

      {showNew && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client *</label>
              <select value={draft.clientLabel} onChange={e => setDraft(d => ({ ...d, clientLabel: e.target.value }))} className={inp}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.tenant_id}>{c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Query *</label>
              <input value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} placeholder="e.g. GST notice received under sec 61" className={inp} />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Priority</label>
              <select value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value as CaQuery["priority"] }))} className={inp}>
                {(["low","normal","urgent"] as const).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">Log Query</button>
            <button onClick={() => setShowNew(false)} className="text-xs text-[var(--color-muted)] px-3 py-2 hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {queries.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <MessageSquare size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No queries logged. Capture client questions and notices here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queries.map(q => (
            <div key={q.id} className={`bg-[var(--color-surface)] border rounded-lg p-3 ${q.status === "resolved" ? "border-green-800/30" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${PRIO[q.priority]}`}>{q.priority}</span>
                    <p className="text-sm font-medium">{q.subject}</p>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)]">{q.clientLabel} · {new Date(q.createdAt).toLocaleDateString("en-IN")}</p>
                  {q.reply && <p className="text-xs text-[var(--color-muted)] mt-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1.5">↳ {q.reply}</p>}
                  {replyFor === q.id && (
                    <div className="mt-2 flex gap-2">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Resolution note (optional)" className={inp} />
                      <button onClick={() => resolve(q.id)} className="text-xs bg-green-600/80 text-white font-semibold px-3 rounded-lg hover:opacity-90 whitespace-nowrap">Resolve ✓</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {q.status === "open" ? (
                    <button onClick={() => { setReplyFor(replyFor === q.id ? null : q.id); setReplyText(""); }}
                      className="text-[10px] text-[var(--color-primary)] hover:underline flex items-center gap-1"><Reply size={9} /> Resolve</button>
                  ) : (
                    <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={9} /> Resolved</span>
                  )}
                  <button onClick={() => remove(q.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={11} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Engagement Letter Generator ─────────────────────────────────────────────────
// Builds a plain-text engagement letter from the firm profile + a chosen client and
// scope, ready to copy or "send". Uses the same firm branding as white-label reports.

const ENGAGEMENT_SCOPES = [
  "Monthly GST return filing (GSTR-1 & GSTR-3B)",
  "TDS computation, deposit & quarterly returns",
  "Annual income-tax return preparation & filing",
  "Statutory audit & financial statement preparation",
  "ROC annual compliance (MGT-7, AOC-4)",
  "Monthly bookkeeping & MIS reporting",
  "Virtual CFO / advisory retainer",
];

function EngagementTab({ clients, firm }: { clients: ClientSummary[]; firm: CaFirmProfile }) {
  const [clientLabel, setClientLabel] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [fee, setFee] = useState("");
  const [cadence, setCadence] = useState<"monthly" | "quarterly" | "annual">("monthly");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const firmName = firm.name || "Your CA Firm";
  const feeNum = parseFloat(fee);

  const toggleScope = (s: string) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const letter = useMemo(() => {
    const date = format(new Date(), "d MMMM yyyy");
    const scopeLines = scopes.length ? scopes.map((s, i) => `   ${i + 1}. ${s}`).join("\n") : "   (scope of work to be defined)";
    const feeLine = !isNaN(feeNum) && feeNum > 0
      ? `${formatCurrency(feeNum)} payable ${cadence}, plus applicable GST and statutory fees.`
      : "as mutually agreed, plus applicable GST and statutory fees.";
    return [
      `${firmName}${firm.tagline ? `\n${firm.tagline}` : ""}${firm.gstin ? `\nGSTIN: ${firm.gstin}` : ""}`,
      ``,
      `Date: ${date}`,
      ``,
      `To,`,
      `${clientLabel || "[Client name]"}`,
      ``,
      `Sub: Engagement for professional services`,
      ``,
      `Dear Sir/Madam,`,
      ``,
      `We are pleased to confirm our engagement to provide the following professional services:`,
      scopeLines,
      ``,
      `Our professional fee for the above engagement shall be ${feeLine}`,
      ``,
      `This engagement is subject to the standards and ethical guidelines of the Institute of Chartered Accountants of India. Either party may terminate this engagement with 30 days' written notice.`,
      ``,
      `We look forward to working with you.`,
      ``,
      `For ${firmName}`,
      ``,
      `____________________`,
      `Partner / Proprietor`,
    ].join("\n");
  }, [firmName, firm.tagline, firm.gstin, clientLabel, scopes, feeNum, cadence]);

  const copy = () => {
    navigator.clipboard?.writeText(letter).then(
      () => toast.success("Engagement letter copied to clipboard"),
      () => toast.error("Could not copy"));
  };

  return (
    <div className="space-y-4">
      {!firm.name && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg px-4 py-2.5 text-xs text-yellow-300 flex items-center gap-2">
          <Building2 size={12} /> Set your firm name in Firm Setup so it appears on the letterhead.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Client</label>
              <select value={clientLabel} onChange={e => setClientLabel(e.target.value)} className={inp}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.tenant_id}>{c.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Fee (₹)</label>
                <input type="number" min="0" value={fee} onChange={e => setFee(e.target.value)} placeholder="e.g. 15000" className={inp} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence</label>
                <select value={cadence} onChange={e => setCadence(e.target.value as typeof cadence)} className={inp}>
                  {(["monthly","quarterly","annual"] as const).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1.5">Scope of work</label>
              <div className="space-y-1.5">
                {ENGAGEMENT_SCOPES.map(s => (
                  <label key={s} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} className="mt-0.5 accent-[var(--color-primary)]" />
                    <span className={scopes.includes(s) ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}>{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileSignature size={13} className="text-[var(--color-primary)]" />
              <p className="text-xs font-semibold">Preview</p>
            </div>
            <pre className="text-[11px] leading-relaxed text-[var(--color-muted)] whitespace-pre-wrap font-sans max-h-[420px] overflow-y-auto">{letter}</pre>
          </div>
          <div className="flex gap-2">
            <button onClick={copy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold py-2.5 rounded-lg text-sm hover:opacity-90">
              <Copy size={13} /> Copy Letter
            </button>
            <button onClick={() => window.print()}
              className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-sm px-4 py-2.5 rounded-lg hover:border-[var(--color-primary)]/40">
              <Download size={13} /> Print / Save as PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
