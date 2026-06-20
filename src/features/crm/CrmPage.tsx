import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Users, KanbanSquare, UserPlus, Building2, Contact as ContactIcon,
  Plus, RefreshCw, ArrowLeft, ArrowRight, Trophy, ArrowRightCircle,
  CheckCircle2, Mail, Phone, Globe,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (response shapes inlined — backend confirmed)
// ─────────────────────────────────────────────────────────────────────────────
type Stage = "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: Stage;
  probability: number | null;
  status: string | null;
  account_id: string | null;
}

interface StageBucket {
  count: number;
  value: number;
  deals: Deal[];
}

interface Pipeline {
  stages: {
    QUALIFIED: StageBucket;
    PROPOSAL: StageBucket;
    NEGOTIATION: StageBucket;
  };
  weightedValue: number;
  openCount: number;
  wonCount: number;
  wonValue: number;
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
  status: string;
}

type TabId = "pipeline" | "leads" | "accounts" | "contacts";
const BOARD_STAGES: ("QUALIFIED" | "PROPOSAL" | "NEGOTIATION")[] = ["QUALIFIED", "PROPOSAL", "NEGOTIATION"];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}

// money is plain numbers — render with ₹ + grouped digits.
function rupee(v: number | null | undefined): string {
  const n = Number(v);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const WRITE_ROLES = new Set([
  "owner", "finance_manager", "accountant", "sales", "operations_manager", "super_admin",
]);

const STAGE_LABEL: Record<"QUALIFIED" | "PROPOSAL" | "NEGOTIATION", string> = {
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
};

const STAGE_TINT: Record<"QUALIFIED" | "PROPOSAL" | "NEGOTIATION", string> = {
  QUALIFIED: "text-blue-300",
  PROPOSAL: "text-amber-300",
  NEGOTIATION: "text-purple-300",
};

const LEAD_STATUS_STYLE: Record<string, string> = {
  NEW: "bg-blue-900/30 text-blue-300 border border-blue-700/40",
  QUALIFIED: "bg-green-900/30 text-green-300 border border-green-700/40",
  CONVERTED: "bg-purple-900/30 text-purple-300 border border-purple-700/40",
  LOST: "bg-red-900/30 text-red-300 border border-red-700/40",
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";

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
    { id: "accounts", label: "Accounts", icon: <Building2 size={14} /> },
    { id: "contacts", label: "Contacts", icon: <ContactIcon size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      {/* HEADER */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} className="text-[var(--color-primary)]" />
          CRM — pipeline & customers
        </h1>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Leads → deals → books customers</p>
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
        {tab === "accounts" && <AccountsTab canWrite={canWrite} />}
        {tab === "contacts" && <ContactsTab canWrite={canWrite} />}
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

  // new-deal form
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<"QUALIFIED" | "PROPOSAL" | "NEGOTIATION">("QUALIFIED");
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
    const idx = BOARD_STAGES.indexOf(deal.stage as "QUALIFIED" | "PROPOSAL" | "NEGOTIATION");
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
      setStage("QUALIFIED");
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BOARD_STAGES.map((s) => (
            <div key={s} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="h-4 w-24 rounded bg-[var(--color-border)] animate-pulse" />
              <div className="h-20 rounded bg-[var(--color-border)] animate-pulse" />
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

      {/* NEW DEAL */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] tabular-nums">
          {pipeline?.wonCount ?? 0} won · {pipeline?.openCount ?? 0} open
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
              <select value={stage} onChange={(e) => setStage(e.target.value as "QUALIFIED" | "PROPOSAL" | "NEGOTIATION")} className={inputCls}>
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
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Create deal
            </button>
          </div>
        </div>
      )}

      {/* BOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    const idx = BOARD_STAGES.indexOf(d.stage as "QUALIFIED" | "PROPOSAL" | "NEGOTIATION");
                    const busy = busyDeal === d.id;
                    return (
                      <div key={d.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                        <p className="text-sm font-medium leading-snug">{d.title}</p>
                        <p className="text-sm tabular-nums text-[var(--color-primary)] mt-1">{rupee(d.value)}</p>
                        {accountName(d.account_id) && (
                          <p className="text-[11px] text-[var(--color-muted)] mt-0.5 flex items-center gap-1">
                            <Building2 size={11} /> {accountName(d.account_id)}
                          </p>
                        )}
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
// LEADS TAB
// ─────────────────────────────────────────────────────────────────────────────
function LeadsTab({ canWrite }: { canWrite: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busyLead, setBusyLead] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
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

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter a lead name");
      return;
    }
    setSaving(true);
    try {
      await api.post<Lead>("/api/crm/leads", {
        name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        source: source.trim() || undefined,
      });
      toast.success(`Lead "${name.trim()}" added`);
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
      setSource("");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const convert = async (lead: Lead) => {
    setBusyLead(lead.id);
    try {
      await api.post<{ account: Account; contact: ContactRow; deal: Deal }>(`/api/crm/leads/${lead.id}/convert`, {});
      toast.success("Converted to deal");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyLead(null);
    }
  };

  const canConvert = (s: string) => ["NEW", "QUALIFIED"].includes((s || "").toUpperCase());

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
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
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
                <Th>Email</Th>
                <Th>Status</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={5} />
              ) : leads.length === 0 ? (
                <EmptyRow cols={5} text="No leads yet." />
              ) : (
                leads.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{l.name}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)]">{l.company || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--color-muted)] truncate max-w-[200px]">{l.email || "—"}</td>
                    <td className="px-3 py-2.5"><LeadStatusPill status={l.status} /></td>
                    <td className="px-3 py-2.5 text-right">
                      {canWrite && canConvert(l.status) ? (
                        <button
                          type="button"
                          onClick={() => convert(l)}
                          disabled={busyLead === l.id}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busyLead === l.id ? <RefreshCw size={12} className="animate-spin" /> : <ArrowRightCircle size={12} />}
                          Convert
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

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter an account name");
      return;
    }
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
      setName("");
      setIndustry("");
      setWebsite("");
      setPhone("");
      setGstin("");
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
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
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

  useEffect(() => {
    void load();
  }, [load]);

  const accountName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? null : null);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter a contact name");
      return;
    }
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
      setName("");
      setEmail("");
      setPhone("");
      setDesignation("");
      setAccountId("");
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
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              Cancel
            </button>
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
