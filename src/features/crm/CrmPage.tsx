import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Users, KanbanSquare, UserPlus, Building2, Contact as ContactIcon,
  Plus, RefreshCw, ArrowLeft, ArrowRight, Trophy, ArrowRightCircle,
  CheckCircle2, Mail, Phone, Globe, X, Clock, AlertTriangle, ShieldCheck,
  ListChecks, StickyNote, Send, Gauge, Timer,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes inlined — backend confirmed)
// ─────────────────────────────────────────────────────────────────────────────
type Stage = "QUALIFICATION" | "DEMO" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
type OpenStage = "QUALIFICATION" | "DEMO" | "PROPOSAL" | "NEGOTIATION";

interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: Stage;
  probability: number | null;
  status: string | null;
  account_id: string | null;
  contact_id: string | null;
  sla_status: string | null;
  response_by: string | null;
  escalated: boolean | null;
}

interface StageBucket {
  count: number;
  value: number;
  deals: Deal[];
}

interface Pipeline {
  stages: Record<OpenStage, StageBucket | undefined>;
  stageOrder: OpenStage[];
  weightedValue: number;
  openCount: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
}

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  gstin: string | null;
  books_ledger_id: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  account_id: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
}

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  priority: string | null;
  score: number | null;
  sla_status: string | null;
  response_by: string | null;
  first_response_at: string | null;
  escalated: boolean | null;
  converted_deal_id: string | null;
  lost_reason: string | null;
  value?: number | null;
  expected_close?: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  reference_type: string | null;
  reference_id: string | null;
}

interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
}

type TimelineEvent =
  | { type: "activity"; at: string; kind: string; direction: string | null; subject: string | null; body: string | null; id: string }
  | { type: "task"; at: string; title: string; status: string; priority: string; due_date: string | null; id: string }
  | { type: "note"; at: string; title: string | null; body: string; id: string }
  | { type: "status"; at: string; from: string | null; to: string | null; duration_secs: number | null; id: string };

interface SlaPriority { priority: string; response_time: number; resolution_time?: number; default_priority?: boolean; }
interface Sla {
  id: string;
  name: string;
  apply_on: string;
  enabled: boolean;
  is_default: boolean;
  priorities: SlaPriority[];
}

type TabId = "pipeline" | "leads" | "accounts" | "contacts" | "tasks" | "sla";
const BOARD_STAGES: OpenStage[] = ["QUALIFICATION", "DEMO", "PROPOSAL", "NEGOTIATION"];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

function rupee(v: number | null | undefined): string {
  const n = Number(v);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const WRITE_ROLES = new Set([
  "owner", "finance_manager", "accountant", "sales", "operations_manager", "super_admin",
]);

const STAGE_LABEL: Record<OpenStage, string> = {
  QUALIFICATION: "Qualification",
  DEMO: "Demo",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
};

const STAGE_TINT: Record<OpenStage, string> = {
  QUALIFICATION: "text-blue-300",
  DEMO: "text-cyan-300",
  PROPOSAL: "text-amber-300",
  NEGOTIATION: "text-purple-300",
};

const LEAD_STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  CONTACTED: "bg-cyan-900/30 text-cyan-300 border border-cyan-700/40",
  NURTURE: "bg-teal-900/30 text-teal-300 border border-teal-700/40",
  QUALIFIED: "bg-green-900/30 text-green-300 border border-green-700/40",
  UNQUALIFIED: "bg-red-900/30 text-red-300 border border-red-700/40",
  JUNK: "bg-red-900/30 text-red-300 border border-red-700/40",
  CONVERTED: "bg-purple-900/30 text-purple-300 border border-purple-700/40",
};

const LEAD_STATUS_OPTIONS = ["NEW", "CONTACTED", "NURTURE", "QUALIFIED", "UNQUALIFIED", "JUNK"];

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]";

// ─────────────────────────────────────────────────────────────────────────────
// SMALL REUSABLE PIECES
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "muted" }) {
  const color =
    tint === "green" ? "text-green-400" : tint === "muted" ? "text-[var(--color-text)]" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[150px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function LeadStatusPill({ status }: { status: string }) {
  const key = (status || "").toUpperCase();
  const cls = LEAD_STATUS_STYLE[key] ?? "bg-[var(--color-bg)] text-[var(--color-muted)] border border-[var(--color-border)]";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{key || "—"}</span>;
}

// SLA badge — Fulfilled (within), Failed (breached), First Response Due, escalated.
function SlaBadge({ status, escalated }: { status: string | null; escalated?: boolean | null }) {
  if (!status) return null;
  const s = status.toUpperCase();
  let cls = "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]";
  let Icon = Clock;
  if (s === "FULFILLED") { cls = "bg-green-900/30 text-green-300 border-green-700/40"; Icon = ShieldCheck; }
  else if (s === "FAILED") { cls = "bg-red-900/30 text-red-300 border-red-700/40"; Icon = AlertTriangle; }
  else if (s.includes("DUE")) { cls = "bg-amber-900/30 text-amber-300 border-amber-700/40"; Icon = Timer; }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon size={11} /> {status}{escalated ? " · escalated" : ""}
    </span>
  );
}

function ScorePill({ score }: { score: number | null }) {
  const n = Number(score || 0);
  const cls = n >= 70 ? "text-green-300" : n >= 40 ? "text-amber-300" : "text-[var(--color-muted)]";
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cls}`}><Gauge size={12} /> {n}</span>;
}

function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[150px]">
          <div className="h-3 w-20 rounded bg-[var(--color-border)] animate-pulse" />
          <div className="h-5 w-24 rounded bg-[var(--color-border)] animate-pulse mt-2" />
        </div>
      ))}
    </div>
  );
}

function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-[var(--color-border)]">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-3 py-3">
              <div
                className="h-3 rounded bg-[var(--color-border)] animate-pulse"
                style={{ width: `${40 + ((r + c) % 4) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-[var(--color-muted)]">{text}</td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function CrmPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.has(user?.role ?? "");

  const [tab, setTab] = useState<TabId>("pipeline");

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "pipeline", label: "Pipeline", icon: <KanbanSquare size={14} /> },
    { id: "leads",    label: "Leads",    icon: <UserPlus size={14} /> },
    { id: "tasks",    label: "Tasks",    icon: <ListChecks size={14} /> },
    { id: "accounts", label: "Accounts", icon: <Building2 size={14} /> },
    { id: "contacts", label: "Contacts", icon: <ContactIcon size={14} /> },
    { id: "sla",      label: "SLA",      icon: <ShieldCheck size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} className="text-[var(--color-primary)]" />
          CRM — pipeline & customers
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Leads → deals → books customers · SLA-tracked</p>
      </div>

      {/* PILL TAB BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)] font-semibold"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BODY */}
      <div className="px-4 sm:px-6 py-5 pb-12">
        {tab === "pipeline" && <PipelineTab canWrite={canWrite} />}
        {tab === "leads" && <LeadsTab canWrite={canWrite} />}
        {tab === "tasks" && <TasksTab canWrite={canWrite} />}
        {tab === "accounts" && <AccountsTab canWrite={canWrite} />}
        {tab === "contacts" && <ContactsTab canWrite={canWrite} />}
        {tab === "sla" && <SlaTab canWrite={canWrite} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE TAB
// ─────────────────────────────────────────────────────────────────────────────
function PipelineTab({ canWrite }: { canWrite: boolean }) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busyDeal, setBusyDeal] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<OpenStage>("QUALIFICATION");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        api.get<Pipeline>("/api/crm/pipeline"),
        api.get<Account[]>("/api/crm/accounts"),
      ]);
      setPipeline(p);
      setAccounts(Array.isArray(a) ? a : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accountName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? null : null);

  const moveStage = async (deal: Deal, dir: -1 | 1) => {
    const idx = BOARD_STAGES.indexOf(deal.stage as OpenStage);
    if (idx === -1) return;
    const next = BOARD_STAGES[idx + dir];
    if (!next) return;
    setBusyDeal(deal.id);
    try {
      await api.post<Deal>(`/api/crm/deals/${deal.id}/stage`, { stage: next });
      toast.success(`Moved "${deal.title}" → ${STAGE_LABEL[next]}`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyDeal(null);
    }
  };

  const winDeal = async (deal: Deal) => {
    if (!window.confirm(`Mark "${deal.title}" as Won? This creates a customer in Books.`)) return;
    setBusyDeal(deal.id);
    try {
      await api.post<unknown>(`/api/crm/deals/${deal.id}/win`, {});
      toast.success(`"${deal.title}" won — customer created in Books`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyDeal(null);
    }
  };

  const loseDeal = async (deal: Deal) => {
    const reason = window.prompt(`Reason for losing "${deal.title}"?`);
    if (!reason) return;
    setBusyDeal(deal.id);
    try {
      await api.post<Deal>(`/api/crm/deals/${deal.id}/stage`, { stage: "LOST", lostReason: reason });
      toast.success(`"${deal.title}" marked lost`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyDeal(null);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Enter a deal title");
      return;
    }
    setSaving(true);
    try {
      await api.post<Deal>("/api/crm/deals", {
        title: title.trim(),
        value: value.trim() ? Number(value) : undefined,
        stage,
        accountId: accountId || undefined,
      });
      toast.success(`Deal "${title.trim()}" created`);
      setTitle("");
      setValue("");
      setStage("QUALIFICATION");
      setAccountId("");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <CardSkeleton count={3} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {BOARD_STAGES.map((s) => (
            <div key={s} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="h-4 w-24 rounded bg-[var(--color-border)] animate-pulse" />
              <div className="h-20 rounded bg-[var(--color-border)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* STAT STRIP */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Weighted pipeline" value={rupee(pipeline?.weightedValue)} />
        <StatCard label="Open deals" value={String(pipeline?.openCount ?? 0)} tint="muted" />
        <StatCard label="Won value" value={rupee(pipeline?.wonValue)} tint="green" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">
          {pipeline?.wonCount ?? 0} won · {pipeline?.openCount ?? 0} open · {pipeline?.lostCount ?? 0} lost
        </p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New deal
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New deal</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme — annual contract" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Value (₹)</label>
              <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Stage</label>
              <select value={stage} onChange={(e) => setStage(e.target.value as OpenStage)} className={inputCls}>
                {BOARD_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Account (optional)</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create deal
            </button>
          </div>
        </div>
      )}

      {/* BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {BOARD_STAGES.map((s) => {
          const bucket = pipeline?.stages?.[s];
          const deals = bucket?.deals ?? [];
          return (
            <div key={s} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${STAGE_TINT[s]}`}>{STAGE_LABEL[s]}</h3>
                <span className="text-[11px] text-[var(--color-muted)] tabular-nums">
                  {bucket?.count ?? 0} · {rupee(bucket?.value)}
                </span>
              </div>
              <div className="p-3 space-y-3 flex-1">
                {deals.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)] text-center py-8 border border-dashed border-[var(--color-border)] rounded-lg">
                    No deals here.
                  </p>
                ) : (
                  deals.map((d) => {
                    const idx = BOARD_STAGES.indexOf(d.stage as OpenStage);
                    const busy = busyDeal === d.id;
                    return (
                      <div key={d.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                        <p className="text-sm font-medium leading-snug">{d.title}</p>
                        <p className="text-sm tabular-nums text-[var(--color-primary)] mt-1">{rupee(d.value)} · {d.probability ?? 0}%</p>
                        {accountName(d.account_id) && (
                          <p className="text-[11px] text-[var(--color-muted)] mt-0.5 flex items-center gap-1">
                            <Building2 size={11} /> {accountName(d.account_id)}
                          </p>
                        )}
                        {d.sla_status && <div className="mt-1.5"><SlaBadge status={d.sla_status} escalated={d.escalated} /></div>}
                        {canWrite && (
                          <div className="flex items-center gap-1.5 mt-3">
                            <button
                              type="button"
                              onClick={() => moveStage(d, -1)}
                              disabled={busy || idx <= 0}
                              title="Move back a stage"
                              className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowLeft size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStage(d, 1)}
                              disabled={busy || idx < 0 || idx >= BOARD_STAGES.length - 1}
                              title="Move forward a stage"
                              className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowRight size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => loseDeal(d)}
                              disabled={busy}
                              title="Mark lost"
                              className="p-1.5 rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-red-300 hover:border-red-700/50 disabled:opacity-30"
                            >
                              <X size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => winDeal(d)}
                              disabled={busy}
                              title="Mark won"
                              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-green-600/90 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {busy ? <RefreshCw size={12} className="animate-spin" /> : <Trophy size={12} />} Win
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD DETAIL DRAWER — SLA badge + timeline + convert + activity logging
// ─────────────────────────────────────────────────────────────────────────────
function LeadDrawer({ lead, canWrite, onClose, onChanged }: {
  lead: Lead; canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api.get<TimelineEvent[]>(`/api/crm/leads/${lead.id}/timeline`);
      setTimeline(Array.isArray(t) ? t : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => { void load(); }, [load]);

  const logResponse = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      // an OUTBOUND activity marks first_response_at + recomputes the SLA status
      await api.post("/api/crm/activities", { kind: "EMAIL", direction: "OUTBOUND", subject: "Reply", body: reply.trim(), leadId: lead.id });
      toast.success("Response logged — SLA updated");
      setReply("");
      await load();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      if (status === "UNQUALIFIED" || status === "JUNK") {
        const reason = window.prompt("Reason for marking lost?");
        if (!reason) { setBusy(false); return; }
        await api.post(`/api/crm/leads/${lead.id}/lost-reason`, { reason });
      }
      await api.post(`/api/crm/leads/${lead.id}/status`, { status });
      toast.success(`Status → ${status}`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const convert = async () => {
    setBusy(true);
    try {
      // Carry the lead's value (and expected close) onto the new deal so it isn't ₹0.
      const value = lead.value != null ? Number(lead.value) : 0;
      await api.post(`/api/crm/leads/${lead.id}/convert`, {
        value,
        expectedClose: lead.expected_close || undefined,
      });
      toast.success("Lead converted to deal — account + contact created");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const canConvert = !lead.converted_deal_id && lead.status !== "CONVERTED";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-surface)] border-l border-[var(--color-border)] h-full overflow-y-auto">
        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">{lead.name}</h2>
            <p className="text-xs text-[var(--color-muted)]">{lead.company || "No company"}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--color-bg)]"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* badges */}
          <div className="flex flex-wrap items-center gap-2">
            <LeadStatusPill status={lead.status} />
            <ScorePill score={lead.score} />
            <SlaBadge status={lead.sla_status} escalated={lead.escalated} />
          </div>

          {/* SLA detail */}
          {lead.sla_status && (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs space-y-1">
              <p className="flex justify-between"><span className="text-[var(--color-muted)]">Respond by</span><span className="tabular-nums">{fmtDate(lead.response_by)}</span></p>
              <p className="flex justify-between"><span className="text-[var(--color-muted)]">First response</span><span className="tabular-nums">{fmtDate(lead.first_response_at)}</span></p>
            </div>
          )}

          {/* contact */}
          <div className="text-xs text-[var(--color-muted)] space-y-1">
            {lead.email && <p className="flex items-center gap-1.5"><Mail size={12} /> {lead.email}</p>}
            {lead.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {lead.phone}</p>}
            {lead.source && <p className="flex items-center gap-1.5"><ArrowRightCircle size={12} /> {lead.source}</p>}
          </div>

          {canWrite && (
            <>
              {/* status + convert */}
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUS_OPTIONS.filter((s) => s !== lead.status).map((s) => (
                  <button key={s} type="button" disabled={busy} onClick={() => setStatus(s)} className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
              {canConvert && (
                <button type="button" disabled={busy} onClick={convert} className={`${btnPrimary} w-full`}>
                  {busy ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRightCircle size={14} />} Convert to deal
                </button>
              )}

              {/* log a response (drives first_response_at + SLA) */}
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <label className={labelCls}>Log outbound response (updates SLA)</label>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Replied to the lead…" className={inputCls} />
                <button type="button" disabled={busy || !reply.trim()} onClick={logResponse} className={`${btnPrimary} mt-2 w-full`}>
                  <Send size={13} /> Log response
                </button>
              </div>
            </>
          )}

          {/* timeline */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Timeline</h3>
            {loading ? (
              <div className="h-20 rounded bg-[var(--color-border)] animate-pulse" />
            ) : timeline.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No activity yet.</p>
            ) : (
              <ol className="space-y-2 border-l border-[var(--color-border)] pl-3">
                {timeline.map((ev) => (
                  <li key={`${ev.type}-${ev.id}`} className="relative">
                    <span className="absolute -left-[15px] top-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                    <p className="text-xs">
                      {ev.type === "status" && <span><span className="text-[var(--color-muted)]">Status</span> {ev.from || "—"} → <span className="font-medium">{ev.to || "—"}</span></span>}
                      {ev.type === "activity" && <span><span className="text-[var(--color-muted)]">{ev.kind}{ev.direction ? ` · ${ev.direction}` : ""}</span> {ev.subject || ev.body || ""}</span>}
                      {ev.type === "task" && <span><span className="text-[var(--color-muted)]">Task</span> {ev.title} <span className="text-[10px]">({ev.status})</span></span>}
                      {ev.type === "note" && <span><span className="text-[var(--color-muted)]">Note</span> {ev.title || ev.body}</span>}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted)] tabular-nums">{fmtDate(ev.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS TAB
// ─────────────────────────────────────────────────────────────────────────────
function LeadsTab({ canWrite }: { canWrite: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Lead[]>("/api/crm/leads");
      setLeads(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // keep the open drawer's lead row fresh after edits
  useEffect(() => {
    if (selected) {
      const fresh = leads.find((l) => l.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [leads, selected]);

  const submit = async () => {
    if (!name.trim() && !company.trim() && !email.trim()) {
      toast.error("Enter a name, company, or email");
      return;
    }
    setSaving(true);
    try {
      await api.post<Lead>("/api/crm/leads", {
        name: name.trim() || undefined,
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        source: source.trim() || undefined,
        priority: priority.trim() || undefined,
      });
      toast.success("Lead added");
      setName(""); setCompany(""); setEmail(""); setPhone(""); setSource(""); setPriority("");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{leads.length} leads</p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New lead
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New lead</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Referral, Website" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Priority (SLA)</label>
              <input value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="e.g. High" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add lead
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th>SLA</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : leads.length === 0 ? (
                <EmptyRow cols={5} text="No leads yet." />
              ) : (
                leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelected(l)}
                    className="border-b border-[var(--color-border)] last:border-b-0 cursor-pointer hover:bg-[var(--color-bg)]"
                  >
                    <td className="px-3 py-2.5 font-medium">{l.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{l.company || "—"}</td>
                    <td className="px-3 py-2.5"><ScorePill score={l.score} /></td>
                    <td className="px-3 py-2.5"><LeadStatusPill status={l.status} /></td>
                    <td className="px-3 py-2.5">{l.sla_status ? <SlaBadge status={l.sla_status} escalated={l.escalated} /> : <span className="text-xs text-[var(--color-muted)]">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <LeadDrawer lead={selected} canWrite={canWrite} onClose={() => setSelected(null)} onChanged={() => void load()} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASKS TAB
// ─────────────────────────────────────────────────────────────────────────────
const TASK_STATUS_FLOW: Record<string, string> = { BACKLOG: "TODO", TODO: "IN_PROGRESS", IN_PROGRESS: "DONE", DONE: "DONE", CANCELED: "TODO" };
const TASK_STATUS_STYLE: Record<string, string> = {
  BACKLOG: "text-[var(--color-muted)]",
  TODO: "text-blue-300",
  IN_PROGRESS: "text-amber-300",
  DONE: "text-green-300",
  CANCELED: "text-red-300",
};

function TasksTab({ canWrite }: { canWrite: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Task[]>("/api/crm/tasks");
      setTasks(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!title.trim()) { toast.error("Enter a task title"); return; }
    setSaving(true);
    try {
      await api.post<Task>("/api/crm/tasks", {
        title: title.trim(),
        priority,
        dueDate: dueDate || undefined,
      });
      toast.success("Task added");
      setTitle(""); setPriority("MEDIUM"); setDueDate(""); setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const advance = async (t: Task) => {
    const next = TASK_STATUS_FLOW[t.status] || "DONE";
    setBusy(t.id);
    try {
      await api.post(`/api/crm/tasks/${t.id}/status`, { status: next });
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{tasks.length} tasks</p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New task
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New task</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className={labelCls}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow up with Acme" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="datetime-local" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Add task
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Title</Th>
                <Th>Priority</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : tasks.length === 0 ? (
                <EmptyRow cols={5} text="No tasks yet." />
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{t.title}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{t.priority}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] tabular-nums">{t.due_date ? fmtDate(t.due_date) : "—"}</td>
                    <td className={`px-3 py-2.5 font-semibold ${TASK_STATUS_STYLE[t.status] || ""}`}>{t.status}</td>
                    <td className="px-3 py-2.5 text-right">
                      {canWrite && t.status !== "DONE" && t.status !== "CANCELED" ? (
                        <button
                          type="button"
                          onClick={() => advance(t)}
                          disabled={busy === t.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40"
                        >
                          {busy === t.id ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          → {TASK_STATUS_FLOW[t.status]}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA TAB — view + create service level agreements
// ─────────────────────────────────────────────────────────────────────────────
function SlaTab({ canWrite }: { canWrite: boolean }) {
  const [slas, setSlas] = useState<Sla[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [applyOn, setApplyOn] = useState("Lead");
  const [isDefault, setIsDefault] = useState(true);
  const [priorities, setPriorities] = useState<SlaPriority[]>([
    { priority: "High", response_time: 1, resolution_time: 8, default_priority: true },
    { priority: "Low", response_time: 8, resolution_time: 24 },
  ]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Sla[]>("/api/crm/slas");
      setSlas(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setPriRow = (i: number, patch: Partial<SlaPriority>) => {
    setPriorities((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : (patch.default_priority ? { ...r, default_priority: false } : r))));
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter an SLA name"); return; }
    setSaving(true);
    try {
      await api.post<Sla>("/api/crm/slas", {
        name: name.trim(),
        applyOn,
        isDefault,
        priorities: priorities.map((p) => ({
          priority: p.priority,
          response_time: Number(p.response_time) || 0,
          resolution_time: Number(p.resolution_time) || Number(p.response_time) || 0,
          default_priority: !!p.default_priority,
        })),
      });
      toast.success("SLA saved (9–18 Mon–Fri working hours)");
      setName(""); setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)]">Response/resolution deadlines by priority · business hours 9–18 Mon–Fri</p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New SLA
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold">New service level agreement</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard SLA" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Apply on</label>
              <select value={applyOn} onChange={(e) => setApplyOn(e.target.value)} className={inputCls}>
                <option value="Lead">Lead</option>
                <option value="Deal">Deal</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                Default for {applyOn}s
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">Priorities (hours)</p>
            <div className="space-y-2">
              {priorities.map((p, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className={`${inputCls} col-span-4`} value={p.priority} onChange={(e) => setPriRow(i, { priority: e.target.value })} placeholder="Priority" />
                  <input className={`${inputCls} col-span-3 tabular-nums`} type="number" value={p.response_time} onChange={(e) => setPriRow(i, { response_time: Number(e.target.value) })} placeholder="Response h" />
                  <input className={`${inputCls} col-span-3 tabular-nums`} type="number" value={p.resolution_time ?? ""} onChange={(e) => setPriRow(i, { resolution_time: Number(e.target.value) })} placeholder="Resolve h" />
                  <label className="col-span-2 inline-flex items-center gap-1 text-[11px]">
                    <input type="radio" name="defpri" checked={!!p.default_priority} onChange={() => setPriRow(i, { default_priority: true })} /> default
                  </label>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setPriorities((r) => [...r, { priority: "", response_time: 4, resolution_time: 12 }])} className="text-xs text-[var(--color-primary)] mt-2">+ add priority</button>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save SLA
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Name</Th>
                <Th>Applies to</Th>
                <Th>Priorities</Th>
                <Th>Default</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={4} />
              ) : slas.length === 0 ? (
                <EmptyRow cols={4} text="No SLAs configured. Create one to track response/resolution deadlines." />
              ) : (
                slas.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{s.apply_on}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] text-xs">
                      {(s.priorities || []).map((p) => `${p.priority} (${p.response_time}h)`).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {s.is_default ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-300"><CheckCircle2 size={13} /> Default</span> : <span className="text-xs text-[var(--color-muted)]">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AccountsTab({ canWrite }: { canWrite: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<Account[]>("/api/crm/accounts");
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter an account name"); return; }
    setSaving(true);
    try {
      await api.post<Account>("/api/crm/accounts", {
        name: name.trim(),
        industry: industry.trim() || undefined,
        website: website.trim() || undefined,
        phone: phone.trim() || undefined,
        gstin: gstin.trim() || undefined,
      });
      toast.success(`Account "${name.trim()}" created`);
      setName(""); setIndustry(""); setWebsite(""); setPhone(""); setGstin(""); setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{accounts.length} accounts</p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New account
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New account</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Pvt Ltd" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Manufacturing" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Website</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>GSTIN</label>
              <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create account
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Account</Th>
                <Th>Industry</Th>
                <Th>Phone</Th>
                <Th>GSTIN</Th>
                <Th>Books</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : accounts.length === 0 ? (
                <EmptyRow cols={5} text="No accounts yet." />
              ) : (
                accounts.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{a.name}</span>
                      {a.website && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
                          <Globe size={11} /> {a.website}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{a.industry || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] tabular-nums">{a.phone || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-muted)]">{a.gstin || "—"}</td>
                    <td className="px-3 py-2.5">
                      {a.books_ledger_id ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-300">
                          <CheckCircle2 size={13} /> Linked
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ContactsTab({ canWrite }: { canWrite: boolean }) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([
        api.get<ContactRow[]>("/api/crm/contacts"),
        api.get<Account[]>("/api/crm/accounts"),
      ]);
      setContacts(Array.isArray(c) ? c : []);
      setAccounts(Array.isArray(a) ? a : []);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const accountName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? null : null);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a contact name"); return; }
    setSaving(true);
    try {
      await api.post<ContactRow>("/api/crm/contacts", {
        name: name.trim(),
        accountId: accountId || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        designation: designation.trim() || undefined,
      });
      toast.success(`Contact "${name.trim()}" added`);
      setName(""); setEmail(""); setPhone(""); setDesignation(""); setAccountId(""); setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{contacts.length} contacts</p>
        {canWrite && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnPrimary}>
            <Plus size={14} /> New contact
          </button>
        )}
      </div>

      {open && canWrite && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-4">New contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Designation</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. CFO" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Add contact
            </button>
          </div>
        </div>
      )}

      <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>Name</Th>
                <Th>Designation</Th>
                <Th>Email</Th>
                <Th>Account</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={4} />
              ) : contacts.length === 0 ? (
                <EmptyRow cols={4} text="No contacts yet." />
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{c.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{c.designation || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">
                      {c.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail size={11} /> {c.email}
                        </span>
                      ) : c.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} /> {c.phone}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{accountName(c.account_id) || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
