import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Workflow, Plus, RefreshCw, Trash2, Play, FlaskConical, Repeat,
  Mail, FileUp, FolderTree, ListChecks, ChevronRight, AlertTriangle,
  CalendarClock, Eye, Pencil, X,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - shapes mirror backend/src/modules/books/{rules,recurrence,dunning,importconfig}.js
// ─────────────────────────────────────────────────────────────────────────────
interface RuleGroup {
  id: string;
  name: string;
  description?: string | null;
  order_index?: number | null;
  is_active?: boolean;
}
interface Trigger { field: string; operator: string; value: string; negate?: boolean }
interface RuleAction { type: string; value: string | boolean | null }
interface Rule {
  id: string;
  group_id: string;
  name: string;
  description?: string | null;
  strict_mode?: string;
  is_active?: boolean;
  stop_processing?: boolean;
  order_index?: number | null;
  triggers?: Trigger[];
  actions?: RuleAction[];
  group_name?: string;
}
interface ApplyResult {
  rows: Record<string, unknown>[];
  fired: { index: number; ruleId: string; ruleName: string }[];
}

interface Recurrence {
  id: string;
  name: string;
  template_kind: string;
  template?: Record<string, unknown>;
  start: string | null;
  repetition: { type: string; moment: unknown; skip: number; weekend: string };
  end: { kind: string; date: string | null; count: number | null };
  next_run: string | null;
  last_run: string | null;
  occurrences_done: number;
  active: boolean;
}
interface PreviewResult { id: string; name: string; from: string; occurrences: string[] }
interface RunResult {
  asOf: string;
  generated: { recurrence: string; name: string; period: string; voucher?: unknown; error?: string }[];
}

interface DunLevel {
  level: number;
  name: string;
  minOverdueDays: number;
  interestPct: string;
  fee: string;
  tone: string;
  subject: string;
  body: string;
}
interface DunProcedure { procedure: string; configured: boolean; levels: DunLevel[] }
interface DueDunItem {
  voucherId: string;
  number: string;
  partyName: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  level: number;
  levelName: string;
  tone: string;
  outstanding: string;
  interest: string;
  fee: string;
  totalDue: string;
}
interface DueDunResult { asOf: string; procedure: string; count: number; items: DueDunItem[] }
interface DunRunResult {
  asOf: string;
  procedure: string;
  advanced: number;
  skippedNotDue: number;
  skippedAlready: number;
  dryRun: boolean;
  letters: { voucherId: string; invoiceNumber: string; partyName: string; level: number; levelName: string; tone: string; subject: string; body: string; totalDue: string }[];
}

interface ImportConfig {
  id: string;
  name: string;
  format: string;
  bank_ledger_id: string;
  bank_ledger_name?: string | null;
  date_format?: string | null;
  mappings?: Record<string, unknown>;
}
interface ImportRunResult { configId: string; bankLedgerId: string; parsed: number; imported: number; duplicates: number }
interface Ledger { id: string; name: string; is_bank?: boolean }

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const TRIGGER_FIELDS = ["amount", "amount_abs", "description", "reference", "account", "category", "ledger", "date", "tag"] as const;
const TRIGGER_OPERATORS = [
  "contains", "not_contains", "is", "is_not", "starts", "ends", "matches", "any",
  "more", "more_eq", "less", "less_eq", "eq", "before", "after", "on", "has", "has_not",
] as const;
const ACTION_TYPES = ["set_category", "set_ledger", "add_tag", "set_flag", "clear_category", "convert"] as const;
const REPETITION_TYPES = ["daily", "weekly", "monthly", "yearly", "ndom"] as const;
const WEEKEND_MODES = ["do-nothing", "skip", "prev-workday", "next-workday"] as const;
const TEMPLATE_KINDS = ["SALES_INVOICE", "BILL", "JOURNAL"] as const;
const END_KINDS = ["none", "date", "count"] as const;
const IMPORT_FORMATS = ["ofx", "qfx", "qif", "camt053", "camt", "mt940", "csv"] as const;
const WEEKDAYS = [
  { v: 0, l: "Sunday" }, { v: 1, l: "Monday" }, { v: 2, l: "Tuesday" }, { v: 3, l: "Wednesday" },
  { v: 4, l: "Thursday" }, { v: 5, l: "Friday" }, { v: 6, l: "Saturday" },
] as const;

type SubTab = "rules" | "recurrences" | "dunning" | "imports";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function rupee(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
    if (Array.isArray(r.items)) return r.items as T[];
    if (Array.isArray(r.levels)) return r.levels as T[];
  }
  return [];
}

// shared styles (mirror BooksGstTab / BooksInventoryTab conventions)
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
function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="text-[var(--color-primary)]">{icon}</span> {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function StatCard({ label, value, tint }: { label: string; value: string; tint?: "green" | "red" }) {
  const color = tint === "green" ? "text-green-400" : tint === "red" ? "text-red-400" : "text-[var(--color-primary)]";
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex-1 min-w-[130px]">
      <p className="text-[11px] text-[var(--color-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</p>
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[13px] text-[var(--color-muted)] leading-relaxed">
      {children}
    </div>
  );
}
function Pill({ children, tone }: { children: React.ReactNode; tone?: "muted" | "green" | "amber" | "red" }) {
  const cls =
    tone === "green" ? "bg-green-900/30 text-green-300 border-green-700/40"
    : tone === "amber" ? "bg-amber-900/30 text-amber-300 border-amber-700/40"
    : tone === "red" ? "bg-red-900/30 text-red-300 border-red-700/40"
    : "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksAutomationTab() {
  const [sub, setSub] = useState<SubTab>("rules");

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "rules", label: "Rules engine", icon: <Workflow size={14} /> },
    { id: "recurrences", label: "Recurrences", icon: <Repeat size={14} /> },
    { id: "dunning", label: "Dunning ladder", icon: <Mail size={14} /> },
    { id: "imports", label: "Import configs", icon: <FileUp size={14} /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Workflow size={18} className="text-[var(--color-primary)]" /> Automation
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Auto-categorise transactions, schedule recurring vouchers, chase overdue receivables, and replay bank statement imports - all hands-off.
        </p>
      </div>

      {/* SUB-TAB BAR */}
      <div className="flex gap-2 overflow-x-auto">
        {subTabs.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSub(t.id)}
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

      {sub === "rules" && <RulesSection />}
      {sub === "recurrences" && <RecurrencesSection />}
      {sub === "dunning" && <DunningSection />}
      {sub === "imports" && <ImportConfigsSection />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) RULES ENGINE - groups + rules CRUD + triggers/actions editor + test apply
// ─────────────────────────────────────────────────────────────────────────────
function RulesSection() {
  const [groups, setGroups] = useState<RuleGroup[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [g, r] = await Promise.all([
        api.get<RuleGroup[]>("/api/books/rules/groups"),
        api.get<Rule[]>("/api/books/rules"),
      ]);
      setGroups(asArray<RuleGroup>(g));
      setRules(asArray<Rule>(r));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <Hint>
        Rules auto-tag and route transactions before you confirm them. A <b>group</b> is an ordered bucket of <b>rules</b>; each rule has
        one or more <b>triggers</b> (all must match in AND mode, any in OR mode) and one or more <b>actions</b> that set a category, GL ledger,
        tag or flag. Use <b>Test apply</b> to dry-run your rules over sample rows - it never touches the ledger.
      </Hint>

      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className={btnGhost}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RuleGroupsCard groups={groups} onReload={load} />
        <RuleCreateCard groups={groups} onReload={load} />
      </div>

      <RulesListCard rules={rules} busy={busy} onReload={load} />

      <TestApplyCard />
    </div>
  );
}

function RuleGroupsCard({ groups, onReload }: { groups: RuleGroup[]; onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [orderIndex, setOrderIndex] = useState("0");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a group name"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/rules/groups", {
        name: name.trim(),
        description: description.trim() || undefined,
        orderIndex: Number(orderIndex) || 0,
      });
      toast.success(`Group "${name.trim()}" saved`);
      setName(""); setDescription("");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Rule groups" icon={<FolderTree size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Group name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank inbox" className={inputCls} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this group does" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Order</label>
            <input value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} inputMode="numeric" className={`${inputCls} font-mono tabular-nums`} />
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Save group
        </button>
        <div className="border-t border-[var(--color-border)] pt-3 space-y-1.5">
          {groups.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No groups yet - create one (lower order runs first).</p>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-[var(--color-muted)] w-6 tabular-nums">{g.order_index ?? 0}</span>
                <span className="font-medium">{g.name}</span>
                {g.is_active === false && <Pill tone="amber">inactive</Pill>}
                {g.description && <span className="text-[var(--color-muted)] text-xs truncate">· {g.description}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function TriggerRow({ t, onChange, onRemove }: { t: Trigger; onChange: (p: Partial<Trigger>) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-[var(--color-muted)] cursor-pointer" title="Negate this trigger">
        <input type="checkbox" checked={!!t.negate} onChange={(e) => onChange({ negate: e.target.checked })} className="accent-[var(--color-primary)] w-3.5 h-3.5" />
        not
      </label>
      <select value={t.field} onChange={(e) => onChange({ field: e.target.value })} className={`${inputCls} flex-1`}>
        {TRIGGER_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select value={t.operator} onChange={(e) => onChange({ operator: e.target.value })} className={`${inputCls} flex-1`}>
        {TRIGGER_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <input value={t.value} onChange={(e) => onChange({ value: e.target.value })} placeholder="value" className={`${inputCls} flex-1`} />
      <button type="button" onClick={onRemove} className="px-2 py-2 text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={14} /></button>
    </div>
  );
}
function ActionRow({ a, onChange, onRemove }: { a: RuleAction; onChange: (p: Partial<RuleAction>) => void; onRemove: () => void }) {
  const needsValue = a.type !== "clear_category" && a.type !== "convert";
  return (
    <div className="flex items-center gap-2">
      <select value={a.type} onChange={(e) => onChange({ type: e.target.value })} className={`${inputCls} flex-1`}>
        {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        value={a.value == null ? "" : String(a.value)}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder={needsValue ? "value" : "(no value)"}
        disabled={!needsValue}
        className={`${inputCls} flex-1 disabled:opacity-40`}
      />
      <button type="button" onClick={onRemove} className="px-2 py-2 text-[var(--color-muted)] hover:text-red-400" title="Remove"><Trash2 size={14} /></button>
    </div>
  );
}

function RuleCreateCard({ groups, onReload }: { groups: RuleGroup[]; onReload: () => Promise<void> }) {
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [strictMode, setStrictMode] = useState<"AND" | "OR">("AND");
  const [stopProcessing, setStopProcessing] = useState(false);
  const [orderIndex, setOrderIndex] = useState("0");
  const [triggers, setTriggers] = useState<Trigger[]>([{ field: "description", operator: "contains", value: "", negate: false }]);
  const [actions, setActions] = useState<RuleAction[]>([{ type: "set_category", value: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groups, groupId]);

  const setTrigger = (i: number, p: Partial<Trigger>) => setTriggers((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const setAction = (i: number, p: Partial<RuleAction>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...p } : a)));

  const submit = async () => {
    if (!groupId) { toast.error("Pick a rule group first"); return; }
    if (!name.trim()) { toast.error("Enter a rule name"); return; }
    const trigs = triggers.filter((t) => t.field && t.operator);
    const acts = actions.filter((a) => a.type);
    if (trigs.length === 0) { toast.error("Add at least one trigger"); return; }
    if (acts.length === 0) { toast.error("Add at least one action"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/rules", {
        groupId,
        name: name.trim(),
        strictMode,
        stopProcessing,
        orderIndex: Number(orderIndex) || 0,
        triggers: trigs,
        actions: acts.map((a) => ({
          type: a.type,
          value: a.type === "set_flag" ? a.value === "true" || a.value === true : (a.value === "" ? null : a.value),
        })),
      });
      toast.success(`Rule "${name.trim()}" created`);
      setName("");
      setTriggers([{ field: "description", operator: "contains", value: "", negate: false }]);
      setActions([{ type: "set_category", value: "" }]);
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="New rule" icon={<Plus size={15} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputCls}>
              <option value="">Select group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Rule name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Swiggy → Meals" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <label className={labelCls}>Match mode</label>
            <select value={strictMode} onChange={(e) => setStrictMode(e.target.value as "AND" | "OR")} className={inputCls}>
              <option value="AND">AND (all)</option>
              <option value="OR">OR (any)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Order</label>
            <input value={orderIndex} onChange={(e) => setOrderIndex(e.target.value)} inputMode="numeric" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input type="checkbox" checked={stopProcessing} onChange={(e) => setStopProcessing(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
            Stop after
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Triggers</span>
            <button type="button" onClick={() => setTriggers((ts) => [...ts, { field: "description", operator: "contains", value: "", negate: false }])} className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1"><Plus size={12} /> Add</button>
          </div>
          <div className="space-y-2">
            {triggers.map((t, i) => (
              <TriggerRow key={i} t={t} onChange={(p) => setTrigger(i, p)} onRemove={() => setTriggers((ts) => ts.length > 1 ? ts.filter((_, j) => j !== i) : ts)} />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Actions</span>
            <button type="button" onClick={() => setActions((as) => [...as, { type: "set_category", value: "" }])} className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1"><Plus size={12} /> Add</button>
          </div>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <ActionRow key={i} a={a} onChange={(p) => setAction(i, p)} onRemove={() => setActions((as) => as.length > 1 ? as.filter((_, j) => j !== i) : as)} />
            ))}
          </div>
        </div>

        <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create rule
        </button>
      </div>
    </Card>
  );
}

function RulesListCard({ rules, busy, onReload }: { rules: Rule[]; busy: boolean; onReload: () => Promise<void> }) {
  const toggleActive = async (r: Rule) => {
    try {
      await api.patch(`/api/books/rules/${r.id}`, { isActive: !(r.is_active !== false) });
      toast.success(r.is_active !== false ? "Rule disabled" : "Rule enabled");
      await onReload();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (r: Rule) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return;
    try {
      await api.delete(`/api/books/rules/${r.id}`);
      toast.success("Rule deleted");
      await onReload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Card title={`Rules (${rules.length})`} icon={<ListChecks size={15} />}>
      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Rule</th>
              <th className={thCls}>Group</th>
              <th className={thCls}>Mode</th>
              <th className={thCls}>Triggers → Actions</th>
              <th className={thCls}>Status</th>
              <th className={thR}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">No rules yet - create one above.</td></tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0 align-top">
                  <td className="px-3 py-2.5 font-medium">
                    {r.name}
                    {r.stop_processing && <span className="ml-2 text-[10px] text-amber-400">stop</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-muted)]">{r.group_name ?? "-"}</td>
                  <td className="px-3 py-2.5"><Pill>{r.strict_mode ?? "AND"}</Pill></td>
                  <td className="px-3 py-2.5 text-xs text-[var(--color-muted)] max-w-[360px]">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {(r.triggers ?? []).map((t, i) => (
                        <span key={i} className="font-mono">{t.negate ? "!" : ""}{t.field} {t.operator} {t.value}{i < (r.triggers?.length ?? 0) - 1 ? "," : ""}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 items-center">
                      <ChevronRight size={11} className="text-[var(--color-primary)]" />
                      {(r.actions ?? []).map((a, i) => (
                        <span key={i} className="font-mono text-[var(--color-primary)]">{a.type}{a.value != null && a.value !== "" ? `=${a.value}` : ""}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{r.is_active !== false ? <Pill tone="green">active</Pill> : <Pill tone="amber">off</Pill>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => toggleActive(r)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] mr-3">{r.is_active !== false ? "Disable" : "Enable"}</button>
                    <button type="button" onClick={() => remove(r)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const TEST_PLACEHOLDER =
  '[\n  { "description": "SWIGGY ORDER 12345", "amount": -450, "reference": "UPI/123", "date": "2026-06-01" },\n  { "description": "Client retainer", "amount": 50000, "date": "2026-06-03" }\n]';

function TestApplyCard() {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    let rows: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(json || "[]");
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      toast.error("Rows must be valid JSON (an array of objects)");
      return;
    }
    if (rows.length === 0) { toast.error("Paste at least one row"); return; }
    setBusy(true);
    try {
      const res = await api.post<ApplyResult>("/api/books/rules/apply", { rows });
      setResult(res);
      toast.success(`${res?.fired?.length ?? 0} rule hit(s) across ${rows.length} row(s)`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Test apply (dry run)" icon={<FlaskConical size={15} />}>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Sample rows (JSON array of transaction objects)</label>
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} placeholder={TEST_PLACEHOLDER} className={`${inputCls} font-mono text-xs resize-y`} />
        </div>
        <button type="button" onClick={run} disabled={busy} className={btnPrimary}>
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <FlaskConical size={14} />} Run rules over rows
        </button>

        {result && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-3">
              <StatCard label="Rows" value={String(result.rows?.length ?? 0)} />
              <StatCard label="Rule hits" value={String(result.fired?.length ?? 0)} tint={result.fired?.length ? "green" : undefined} />
            </div>
            <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-bg)]">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className={thCls}>#</th>
                    <th className={thCls}>Mutated row</th>
                    <th className={thCls}>Rules fired</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.rows ?? []).map((row, i) => {
                    const fired = (result.fired ?? []).filter((f) => f.index === i);
                    return (
                      <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0 align-top">
                        <td className="px-3 py-2.5 tabular-nums text-[var(--color-muted)]">{i}</td>
                        <td className="px-3 py-2.5 font-mono text-xs break-all">{JSON.stringify(row)}</td>
                        <td className="px-3 py-2.5">
                          {fired.length === 0 ? <span className="text-[var(--color-muted)] text-xs">-</span> : (
                            <div className="flex flex-wrap gap-1">{fired.map((f, j) => <Pill key={j} tone="green">{f.ruleName}</Pill>)}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (2) RECURRENCES - list, create, preview, run due
// ─────────────────────────────────────────────────────────────────────────────
function RecurrencesSection() {
  const [list, setList] = useState<Recurrence[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [asOf, setAsOf] = useState(todayIso());

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<Recurrence[]>("/api/books/recurrences");
      setList(asArray<Recurrence>(r));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doPreview = async (id: string) => {
    try {
      const res = await api.get<PreviewResult>(`/api/books/recurrences/${id}/preview?count=12`);
      setPreview(res);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (r: Recurrence) => {
    if (!window.confirm(`Delete recurrence "${r.name}"?`)) return;
    try {
      await api.delete(`/api/books/recurrences/${r.id}`);
      toast.success("Recurrence deleted");
      if (preview?.id === r.id) setPreview(null);
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const runDue = async () => {
    if (!window.confirm(`Materialise (post vouchers for) every recurrence due on/before ${asOf}? This posts to the ledger.`)) return;
    setRunning(true);
    try {
      const res = await api.post<RunResult>("/api/books/recurrences/run", { asOf });
      setRunResult(res);
      const errs = (res.generated ?? []).filter((g) => g.error).length;
      toast.success(`Generated ${(res.generated?.length ?? 0) - errs} voucher(s)${errs ? `, ${errs} error(s)` : ""}`);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <Hint>
        A recurrence posts a templated voucher (sales invoice, bill or journal) on a schedule - daily / weekly / monthly / yearly or an
        nth-weekday-of-month rhythm, with skip-N, a weekend strategy and an end condition (by date or after N runs). <b>Preview</b> shows the
        next dates without posting; <b>Run due</b> catches up every missed occurrence up to the as-of date and posts to the ledger.
      </Hint>

      <RecurrenceCreateCard onReload={load} />

      <Card
        title={`Schedules (${list.length})`}
        icon={<CalendarClock size={15} />}
        action={
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>As of</label>
              <DatePicker value={asOf} onChange={setAsOf} />
            </div>
            <button type="button" onClick={() => void load()} className={btnGhost}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></button>
            <button type="button" onClick={runDue} disabled={running} className={btnPrimary}>
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Run due
            </button>
          </div>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Name</th>
                <th className={thCls}>Kind</th>
                <th className={thCls}>Repeat</th>
                <th className={thCls}>Next run</th>
                <th className={thR}>Done</th>
                <th className={thCls}>Status</th>
                <th className={thR}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {busy ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--color-muted)]">No recurrences yet.</td></tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">{r.template_kind?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-muted)]">
                      {r.repetition?.type}{r.repetition?.skip ? ` ·skip ${r.repetition.skip}` : ""}{r.repetition?.weekend && r.repetition.weekend !== "do-nothing" ? ` ·${r.repetition.weekend}` : ""}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{r.next_run ?? "-"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.occurrences_done}</td>
                    <td className="px-3 py-2.5">{r.active ? <Pill tone="green">active</Pill> : <Pill tone="amber">done</Pill>}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => doPreview(r.id)} className="text-[var(--color-muted)] hover:text-[var(--color-primary)] mr-3" title="Preview"><Eye size={15} /></button>
                      <button type="button" onClick={() => remove(r)} className="text-[var(--color-muted)] hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {preview && (
          <div className="mt-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Next occurrences - {preview.name}</h4>
              <button type="button" onClick={() => setPreview(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={15} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.occurrences.length === 0 ? (
                <span className="text-sm text-[var(--color-muted)]">No upcoming occurrences.</span>
              ) : (
                preview.occurrences.map((d) => <Pill key={d}>{d}</Pill>)
              )}
            </div>
          </div>
        )}

        {runResult && (
          <div className="mt-4 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Run result · as of {runResult.asOf}</h4>
            {(runResult.generated ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Nothing was due.</p>
            ) : (
              <div className="space-y-1.5">
                {runResult.generated.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums text-[var(--color-muted)] font-mono text-xs">{g.period}</span>
                    <span className="font-medium">{g.name}</span>
                    {g.error ? <Pill tone="red">{g.error}</Pill> : <Pill tone="green">posted</Pill>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function RecurrenceCreateCard({ onReload }: { onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [templateKind, setTemplateKind] = useState<typeof TEMPLATE_KINDS[number]>("SALES_INVOICE");
  const [start, setStart] = useState(todayIso());
  const [repType, setRepType] = useState<typeof REPETITION_TYPES[number]>("monthly");
  const [moment, setMoment] = useState("");          // weekly weekday OR monthly day-of-month
  const [ndomNth, setNdomNth] = useState("1");
  const [ndomWd, setNdomWd] = useState("1");
  const [skip, setSkip] = useState("0");
  const [weekend, setWeekend] = useState<typeof WEEKEND_MODES[number]>("do-nothing");
  const [endKind, setEndKind] = useState<typeof END_KINDS[number]>("none");
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState("");
  const [templateJson, setTemplateJson] = useState("{}");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a name"); return; }
    let template: Record<string, unknown>;
    try { template = JSON.parse(templateJson || "{}"); } catch { toast.error("Template must be valid JSON"); return; }

    let repMoment: string | number | undefined;
    if (repType === "weekly") repMoment = Number(moment) || 1;
    else if (repType === "monthly") repMoment = moment.trim() ? Number(moment) : undefined;
    else if (repType === "ndom") repMoment = `${ndomNth},${ndomWd}`;

    const end: Record<string, unknown> = { kind: endKind };
    if (endKind === "date") end.date = endDate;
    if (endKind === "count") end.count = Number(endCount) || 0;

    setSaving(true);
    try {
      await api.post("/api/books/recurrences", {
        name: name.trim(),
        template_kind: templateKind,
        template,
        start,
        repetition: { type: repType, moment: repMoment, skip: Number(skip) || 0, weekend },
        end,
      });
      toast.success(`Recurrence "${name.trim()}" created`);
      setName(""); setTemplateJson("{}");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="New recurrence" icon={<Plus size={15} />}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly retainer" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Template kind</label>
            <select value={templateKind} onChange={(e) => setTemplateKind(e.target.value as typeof TEMPLATE_KINDS[number])} className={inputCls}>
              {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Start date</label>
            <DatePicker value={start} onChange={setStart} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>Repeat</label>
            <select value={repType} onChange={(e) => setRepType(e.target.value as typeof REPETITION_TYPES[number])} className={inputCls}>
              {REPETITION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {repType === "weekly" && (
            <div>
              <label className={labelCls}>On weekday</label>
              <select value={moment} onChange={(e) => setMoment(e.target.value)} className={inputCls}>
                {WEEKDAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
          )}
          {repType === "monthly" && (
            <div>
              <label className={labelCls}>Day of month (blank = start's day)</label>
              <input value={moment} onChange={(e) => setMoment(e.target.value)} inputMode="numeric" placeholder="1-31" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          )}
          {repType === "ndom" && (
            <>
              <div>
                <label className={labelCls}>Nth (-1 = last)</label>
                <select value={ndomNth} onChange={(e) => setNdomNth(e.target.value)} className={inputCls}>
                  {["1", "2", "3", "4", "5", "-1"].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Weekday</label>
                <select value={ndomWd} onChange={(e) => setNdomWd(e.target.value)} className={inputCls}>
                  {WEEKDAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </div>
            </>
          )}
          <div>
            <label className={labelCls}>Skip-N (0 = every)</label>
            <input value={skip} onChange={(e) => setSkip(e.target.value)} inputMode="numeric" className={`${inputCls} font-mono tabular-nums`} />
          </div>
          <div>
            <label className={labelCls}>Weekend</label>
            <select value={weekend} onChange={(e) => setWeekend(e.target.value as typeof WEEKEND_MODES[number])} className={inputCls}>
              {WEEKEND_MODES.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className={labelCls}>End</label>
            <select value={endKind} onChange={(e) => setEndKind(e.target.value as typeof END_KINDS[number])} className={inputCls}>
              <option value="none">Never</option>
              <option value="date">On date</option>
              <option value="count">After N runs</option>
            </select>
          </div>
          {endKind === "date" && (
            <div>
              <label className={labelCls}>End date</label>
              <DatePicker value={endDate} onChange={setEndDate} />
            </div>
          )}
          {endKind === "count" && (
            <div>
              <label className={labelCls}>After N runs</label>
              <input value={endCount} onChange={(e) => setEndCount(e.target.value)} inputMode="numeric" placeholder="e.g. 12" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>
            Template JSON - {templateKind === "SALES_INVOICE" ? "{ customerLedgerId, lines:[…] }" : templateKind === "BILL" ? "{ vendorLedgerId, lines:[…] }" : "{ narration, entries:[{ ledgerId, debit, credit }] }"}
          </label>
          <textarea value={templateJson} onChange={(e) => setTemplateJson(e.target.value)} rows={4} className={`${inputCls} font-mono text-xs resize-y`} />
        </div>

        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create recurrence
        </button>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (3) DUNNING LADDER - procedure editor, due list, run
// ─────────────────────────────────────────────────────────────────────────────
function emptyLevel(level: number): DunLevel {
  return { level, name: `Level ${level}`, minOverdueDays: level === 1 ? 1 : level * 15, interestPct: "0", fee: "0", tone: "firm", subject: "Overdue invoice {{invoiceNumber}}", body: "Dear {{party}}, invoice {{invoiceNumber}} for {{outstanding}} is {{daysOverdue}} day(s) overdue. Total due {{totalDue}}." };
}

function DunningSection() {
  const [levels, setLevels] = useState<DunLevel[]>([]);
  const [configured, setConfigured] = useState(false);
  const [procedure, setProcedure] = useState("Default");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [asOf, setAsOf] = useState(todayIso());
  const [due, setDue] = useState<DueDunResult | null>(null);
  const [dueBusy, setDueBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<DunRunResult | null>(null);

  const loadProc = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.get<DunProcedure>("/api/books/dunning/procedure");
      setLevels(res?.levels ?? []);
      setConfigured(!!res?.configured);
      if (res?.procedure) setProcedure(res.procedure);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadProc(); }, [loadProc]);

  const loadDue = useCallback(async (d: string) => {
    setDueBusy(true);
    try {
      const res = await api.get<DueDunResult>(`/api/books/dunning/due?asOf=${encodeURIComponent(d)}`);
      setDue(res);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDueBusy(false);
    }
  }, []);

  useEffect(() => { void loadDue(asOf); }, [loadDue, asOf]);

  const setLevel = (i: number, p: Partial<DunLevel>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const saveProc = async () => {
    if (levels.length === 0) { toast.error("Add at least one level"); return; }
    setSaving(true);
    try {
      const res = await api.post<DunProcedure>("/api/books/dunning/procedure", {
        name: procedure.trim() || "Default",
        levels: levels.map((l) => ({
          minOverdueDays: Number(l.minOverdueDays) || 0,
          name: l.name,
          tone: l.tone,
          interestPct: l.interestPct,
          fee: l.fee,
          subject: l.subject,
          body: l.body,
        })),
      });
      setLevels(res?.levels ?? []);
      setConfigured(!!res?.configured);
      toast.success("Dunning ladder saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const runDun = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const res = await api.post<DunRunResult>("/api/books/dunning/run", { asOf, procedure, dryRun });
      setRunResult(res);
      toast.success(`${dryRun ? "Dry run" : "Run"}: ${res.advanced} advanced, ${res.skippedAlready} already at level, ${res.skippedNotDue} not due`);
      if (!dryRun) await loadDue(asOf);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  const toneTint = (t: string): "green" | "amber" | "red" | undefined =>
    t === "gentle" ? "green" : t === "firm" ? "amber" : t === "final" || t === "legal" ? "red" : undefined;

  return (
    <div className="space-y-5">
      <Hint>
        The dunning ladder is an escalating set of <b>levels</b>, each owning a band of days-overdue with its own interest rate (% p.a.),
        flat fee and letter (tone runs gentle → firm → final → legal). Thresholds must strictly increase. Letters support placeholders like{" "}
        <code>{"{{party}}"}</code>, <code>{"{{outstanding}}"}</code>, <code>{"{{interest}}"}</code>, <code>{"{{totalDue}}"}</code>.{" "}
        {!configured && <b>You are seeing the built-in default ladder - save it to make it yours.</b>}
      </Hint>

      <Card
        title="Dunning ladder"
        icon={<Mail size={15} />}
        action={
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>Procedure</label>
              <input value={procedure} onChange={(e) => setProcedure(e.target.value)} className={inputCls} />
            </div>
            <button type="button" onClick={() => void loadProc()} className={btnGhost}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></button>
            <button type="button" onClick={() => setLevels((ls) => [...ls, emptyLevel(ls.length + 1)])} className={btnGhost}><Plus size={14} /> Level</button>
            <button type="button" onClick={saveProc} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Pencil size={14} />} Save ladder
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {levels.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No levels - add one.</p>
          ) : (
            levels.map((l, i) => (
              <div key={i} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-2">Level {l.level} <Pill tone={toneTint(l.tone)}>{l.tone}</Pill></span>
                  <button type="button" onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div><label className={labelCls}>Name</label><input value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} className={inputCls} /></div>
                  <div><label className={labelCls}>Min overdue days</label><input value={l.minOverdueDays} onChange={(e) => setLevel(i, { minOverdueDays: Number(e.target.value) || 0 })} inputMode="numeric" className={`${inputCls} font-mono tabular-nums`} /></div>
                  <div><label className={labelCls}>Interest % p.a.</label><input value={l.interestPct} onChange={(e) => setLevel(i, { interestPct: e.target.value })} inputMode="decimal" className={`${inputCls} font-mono tabular-nums`} /></div>
                  <div><label className={labelCls}>Flat fee ₹</label><input value={l.fee} onChange={(e) => setLevel(i, { fee: e.target.value })} inputMode="decimal" className={`${inputCls} font-mono tabular-nums`} /></div>
                  <div>
                    <label className={labelCls}>Tone</label>
                    <select value={l.tone} onChange={(e) => setLevel(i, { tone: e.target.value })} className={inputCls}>
                      {["gentle", "firm", "final", "legal"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div><label className={labelCls}>Subject</label><input value={l.subject} onChange={(e) => setLevel(i, { subject: e.target.value })} className={inputCls} /></div>
                <div><label className={labelCls}>Body</label><textarea value={l.body} onChange={(e) => setLevel(i, { body: e.target.value })} rows={3} className={`${inputCls} resize-y`} /></div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card
        title="Overdue receivables (due to dun)"
        icon={<AlertTriangle size={15} />}
        action={
          <div className="flex items-end gap-2">
            <div>
              <label className={labelCls}>As of</label>
              <DatePicker value={asOf} onChange={setAsOf} />
            </div>
            <button type="button" onClick={() => runDun(true)} disabled={running} className={btnGhost}>
              <FlaskConical size={14} /> Dry run
            </button>
            <button type="button" onClick={() => runDun(false)} disabled={running} className={btnPrimary}>
              {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Run dunning
            </button>
          </div>
        }
      >
        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Invoice</th>
                <th className={thCls}>Party</th>
                <th className={thR}>Days overdue</th>
                <th className={thCls}>Level</th>
                <th className={thR}>Outstanding</th>
                <th className={thR}>Interest</th>
                <th className={thR}>Fee</th>
                <th className={thR}>Total due</th>
              </tr>
            </thead>
            <tbody>
              {dueBusy ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading…</td></tr>
              ) : (due?.items?.length ?? 0) === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-muted)]">No receivables are due for dunning at {asOf}.</td></tr>
              ) : (
                due!.items.map((it) => (
                  <tr key={it.voucherId} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-xs">{it.number}</td>
                    <td className="px-3 py-2.5">{it.partyName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-400">{it.daysOverdue}</td>
                    <td className="px-3 py-2.5"><Pill tone={toneTint(it.tone)}>{it.level} · {it.levelName}</Pill></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(it.outstanding)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(it.interest)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{rupee(it.fee)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-400">{rupee(it.totalDue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {runResult && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <StatCard label="Advanced" value={String(runResult.advanced)} tint="green" />
              <StatCard label="Already at level" value={String(runResult.skippedAlready)} />
              <StatCard label="Not due" value={String(runResult.skippedNotDue)} />
              {runResult.dryRun && <StatCard label="Mode" value="DRY RUN" />}
            </div>
            {(runResult.letters ?? []).length > 0 && (
              <div className="space-y-2">
                {runResult.letters.map((lt, i) => (
                  <details key={i} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                    <summary className="cursor-pointer text-sm flex items-center gap-2 flex-wrap">
                      <Pill tone={toneTint(lt.tone)}>L{lt.level}</Pill>
                      <span className="font-medium">{lt.partyName}</span>
                      <span className="text-[var(--color-muted)] text-xs">{lt.invoiceNumber}</span>
                      <span className="ml-auto tabular-nums font-semibold text-red-400">{rupee(lt.totalDue)}</span>
                    </summary>
                    <div className="mt-2 text-sm">
                      <p className="font-semibold">{lt.subject}</p>
                      <pre className="whitespace-pre-wrap text-xs text-[var(--color-muted)] mt-1 font-sans">{lt.body}</pre>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (4) IMPORT CONFIGS - CRUD + run
// ─────────────────────────────────────────────────────────────────────────────
function ImportConfigsSection() {
  const [configs, setConfigs] = useState<ImportConfig[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const c = await api.get<ImportConfig[]>("/api/books/import-configs");
      setConfigs(asArray<ImportConfig>(c));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setLedgers(asArray<Ledger>(l).filter((x) => x.is_bank !== false));
      } catch { /* ledger list optional */ }
    })();
  }, [load]);

  return (
    <div className="space-y-5">
      <Hint>
        An import config is a reusable, per-bank statement profile: which parser (OFX / QIF / CAMT / MT940 / CSV), the bank ledger it posts
        against, an optional date-format hint and CSV column / value <b>mappings</b>. Running a config parses pasted statement content,
        dedupes already-seen lines by hash (re-uploading the same file imports nothing new), and drops new lines into the reconciliation inbox -
        the ledger is only touched when you confirm each line.
      </Hint>

      <ImportConfigCreateCard ledgers={ledgers} onReload={load} />

      <Card
        title={`Configs (${configs.length})`}
        icon={<FolderTree size={15} />}
        action={<button type="button" onClick={() => void load()} className={btnGhost}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh</button>}
      >
        {busy ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">Loading…</p>
        ) : configs.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">No import configs yet - create one above.</p>
        ) : (
          <div className="space-y-3">
            {configs.map((c) => <ImportConfigRow key={c.id} cfg={c} onReload={load} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function ImportConfigCreateCard({ ledgers, onReload }: { ledgers: Ledger[]; onReload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<typeof IMPORT_FORMATS[number]>("csv");
  const [bankLedgerId, setBankLedgerId] = useState("");
  const [dateFormat, setDateFormat] = useState("");
  const [mappingsJson, setMappingsJson] = useState('{\n  "columns": {},\n  "rules": [],\n  "valueMap": {}\n}');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Enter a config name"); return; }
    if (!bankLedgerId) { toast.error("Pick a bank ledger"); return; }
    let mappings: Record<string, unknown>;
    try { mappings = JSON.parse(mappingsJson || "{}"); } catch { toast.error("Mappings must be valid JSON"); return; }
    setSaving(true);
    try {
      await api.post("/api/books/import-configs", {
        name: name.trim(),
        format,
        bank_ledger_id: bankLedgerId,
        date_format: dateFormat.trim() || undefined,
        mappings,
      });
      toast.success(`Config "${name.trim()}" created`);
      setName("");
      await onReload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="New import config" icon={<Plus size={15} />}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC current CSV" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof IMPORT_FORMATS[number])} className={inputCls}>
              {IMPORT_FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Bank ledger</label>
            <select value={bankLedgerId} onChange={(e) => setBankLedgerId(e.target.value)} className={inputCls}>
              <option value="">Select ledger…</option>
              {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Date format hint (optional)</label>
            <input value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} placeholder="e.g. DD/MM/YYYY" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Mappings JSON (columns / rules / valueMap)</label>
            <textarea value={mappingsJson} onChange={(e) => setMappingsJson(e.target.value)} rows={4} className={`${inputCls} font-mono text-xs resize-y`} />
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create config
        </button>
      </div>
    </Card>
  );
}

function ImportConfigRow({ cfg, onReload }: { cfg: ImportConfig; onReload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportRunResult | null>(null);

  const remove = async () => {
    if (!window.confirm(`Delete import config "${cfg.name}"? (Imported-line hashes are kept so prior lines never re-import.)`)) return;
    try {
      await api.delete(`/api/books/import-configs/${cfg.id}`);
      toast.success("Config deleted");
      await onReload();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const run = async () => {
    if (!content.trim()) { toast.error("Paste statement content to import"); return; }
    setRunning(true);
    try {
      const res = await api.post<ImportRunResult>(`/api/books/import-configs/${cfg.id}/run`, { content });
      setResult(res);
      toast.success(`Parsed ${res.parsed}, imported ${res.imported} new, ${res.duplicates} duplicate(s)`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{cfg.name}</span>
          <Pill>{cfg.format?.toUpperCase()}</Pill>
          <span className="text-xs text-[var(--color-muted)]">→ {cfg.bank_ledger_name ?? cfg.bank_ledger_id}</span>
          {cfg.date_format && <span className="text-xs text-[var(--color-muted)]">· {cfg.date_format}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnGhost}><Play size={14} /> {open ? "Close" : "Run import"}</button>
          <button type="button" onClick={remove} className="px-2 py-2 text-[var(--color-muted)] hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelCls}>Statement content ({cfg.format?.toUpperCase()})</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder={cfg.format === "csv" ? "date,amount,description,reference\n2026-06-01,-450,SWIGGY,UPI/123" : "Paste raw statement file content…"} className={`${inputCls} font-mono text-xs resize-y`} />
          </div>
          <button type="button" onClick={run} disabled={running} className={btnPrimary}>
            {running ? <RefreshCw size={14} className="animate-spin" /> : <FileUp size={14} />} Import lines
          </button>
          {result && (
            <div className="flex flex-wrap gap-3">
              <StatCard label="Parsed" value={String(result.parsed)} />
              <StatCard label="Imported (new)" value={String(result.imported)} tint="green" />
              <StatCard label="Duplicates" value={String(result.duplicates)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
