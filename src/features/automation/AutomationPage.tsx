import { useMemo, useState } from "react";
import type { Transaction } from "@/data/types";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import {
  Workflow, Zap, GitBranch, CheckSquare, BookOpen, Layers, BellRing,
  CalendarClock, ScrollText, Webhook, LayoutTemplate, Plus, Play,
  CheckCircle2, AlertTriangle, Trash2, Clock, ArrowRight,
  Hash, Tags, Network, Timer, Repeat2, FolderTree, ListChecks,
  FileBarChart, Percent, Send,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, differenceInCalendarDays, parseISO } from "date-fns";

// ── shared styles (mirrors TaxPage input + DebtPage card) ──────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg";

type TabId =
  | "overview" | "rules" | "scheduler" | "approvals" | "recipes" | "bulk"
  | "notifications" | "tasks" | "activity" | "webhooks" | "templates"
  | "numbering" | "categorize" | "escalation" | "sla" | "journals"
  | "routing" | "validation" | "reports" | "discounts" | "cadence";

const TABS = [
  ["overview", "Overview", Workflow],
  ["rules", "Rule Builder", Zap],
  ["scheduler", "Reminder Scheduler", CalendarClock],
  ["approvals", "Approval Chains", CheckSquare],
  ["recipes", "Trigger Library", BookOpen],
  ["bulk", "Bulk Runner", Layers],
  ["notifications", "Notification Rules", BellRing],
  ["tasks", "Recurring Tasks", Clock],
  ["activity", "Activity Log", ScrollText],
  ["webhooks", "Webhook Registry", Webhook],
  ["templates", "Templates Gallery", LayoutTemplate],
  ["numbering", "Numbering Rules", Hash],
  ["categorize", "Auto-Categorize", Tags],
  ["escalation", "Escalation Matrix", Network],
  ["sla", "SLA Timers", Timer],
  ["journals", "Recurring Journals", Repeat2],
  ["routing", "Document Routing", FolderTree],
  ["validation", "Data Validation", ListChecks],
  ["reports", "Scheduled Reports", FileBarChart],
  ["discounts", "Discount Rules", Percent],
  ["cadence", "Reminder Cadences", Send],
] as const;

export default function AutomationPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Workflow size={18} className="text-[var(--color-primary)]" /> Automation &amp; Workflows
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            Define IF-THEN rules, approval chains, reminders and notification logic — previewed against your live data. Execution is client-side preview; no backend scheduler runs these yet.
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <Overview onJump={setTab} />}
      {tab === "rules" && <RuleBuilder />}
      {tab === "scheduler" && <ReminderScheduler />}
      {tab === "approvals" && <ApprovalChains />}
      {tab === "recipes" && <TriggerLibrary onUse={() => setTab("rules")} />}
      {tab === "bulk" && <BulkRunner />}
      {tab === "notifications" && <NotificationRules />}
      {tab === "tasks" && <RecurringTasks />}
      {tab === "activity" && <ActivityLog />}
      {tab === "webhooks" && <WebhookRegistry />}
      {tab === "templates" && <TemplatesGallery onUse={() => setTab("rules")} />}
      {tab === "numbering" && <NumberingRules />}
      {tab === "categorize" && <AutoCategorize />}
      {tab === "escalation" && <EscalationMatrix />}
      {tab === "sla" && <SlaTimers />}
      {tab === "journals" && <RecurringJournals />}
      {tab === "routing" && <DocumentRouting />}
      {tab === "validation" && <DataValidation />}
      {tab === "reports" && <ScheduledReports />}
      {tab === "discounts" && <DiscountRules />}
      {tab === "cadence" && <ReminderCadences />}
    </div>
  );
}

// ── activity log: a shared event stream every tool can append to ───────────────
type ActivityEvent = { id: string; ts: string; tool: string; message: string; kind: "create" | "run" | "delete" };
function useActivity(): [ActivityEvent[], (e: Omit<ActivityEvent, "id" | "ts">) => void] {
  const [log, setLog] = useFeatureState<ActivityEvent[]>("auto-activity", []);
  const push = (e: Omit<ActivityEvent, "id" | "ts">) =>
    setLog(prev => [{ id: crypto.randomUUID(), ts: new Date().toISOString(), ...e }, ...prev].slice(0, 200));
  return [log, push];
}

// ── #1 Overview ────────────────────────────────────────────────────────────────
function Overview({ onJump }: { onJump: (t: TabId) => void }) {
  const [rules] = useFeatureState<RuleRow[]>("auto-rules", []);
  const [reminders] = useFeatureState<ReminderRow[]>("auto-reminders", []);
  const [chains] = useFeatureState<ApprovalChain[]>("auto-approval-chains", []);
  const [tasks] = useFeatureState<RecurringTask[]>("auto-tasks", []);
  const [hooks] = useFeatureState<HookRow[]>("auto-webhooks", []);
  const [log] = useFeatureState<ActivityEvent[]>("auto-activity", []);

  const activeRules = rules.filter(r => r.enabled).length;

  const cards = [
    { label: "Active Rules", value: `${activeRules}`, sub: `${rules.length} defined`, color: "text-[var(--color-text)]", tab: "rules" as TabId },
    { label: "Scheduled Reminders", value: `${reminders.length}`, sub: "due-date triggers", color: "text-blue-400", tab: "scheduler" as TabId },
    { label: "Approval Chains", value: `${chains.length}`, sub: "routing flows", color: "text-purple-400", tab: "approvals" as TabId },
    { label: "Recurring Tasks", value: `${tasks.length}`, sub: "calendar jobs", color: "text-yellow-400", tab: "tasks" as TabId },
    { label: "Webhook Endpoints", value: `${hooks.length}`, sub: "config only", color: "text-green-400", tab: "webhooks" as TabId },
    { label: "Logged Events", value: `${log.length}`, sub: "preview runs", color: "text-[var(--color-text)]", tab: "activity" as TabId },
  ];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-1">Build your finance ops fabric</p>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          Wire up rules, reminders and approval routing over your live transactions, invoices and obligations — no code. Each tool stores its definitions on your synced account and lets you preview / evaluate them against current data before you rely on them. There is no server-side cron firing these automatically yet, so treat results as a decision aid, not a guarantee that an action ran.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => (
          <button key={c.label} onClick={() => onJump(c.tab)}
            className={`${CARD} p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors`}>
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </button>
        ))}
      </div>

      <div className={`${CARD} p-5`}>
        <p className="text-sm font-semibold mb-3">Where to start</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([
            ["Build a rule", "IF a transaction or invoice matches a condition, THEN flag or notify.", "rules", Zap],
            ["Install a recipe", "Pre-built triggers for overdue invoices, low balance, GST dates.", "recipes", BookOpen],
            ["Schedule a reminder", "Anchor a nudge to any invoice or obligation due date.", "scheduler", CalendarClock],
          ] as const).map(([title, desc, t, Icon]) => (
            <button key={title} onClick={() => onJump(t)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 text-left hover:border-[var(--color-primary)]/40 transition-colors">
              <Icon size={16} className="text-[var(--color-primary)] mb-2" />
              <p className="text-sm font-medium flex items-center gap-1">{title} <ArrowRight size={12} className="text-[var(--color-muted)]" /></p>
              <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── #2 No-code Rule Builder (IF condition THEN action) ─────────────────────────
type RuleSubject = "transaction" | "invoice";
type RuleField = "amount" | "category" | "counterparty" | "status" | "description" | "daysOverdue";
type RuleOp = ">" | "<" | "==" | "contains";
type RuleAction = "flag" | "notify" | "tag" | "escalate";
type RuleRow = {
  id: string; name: string; subject: RuleSubject; field: RuleField; op: RuleOp;
  value: string; action: RuleAction; enabled: boolean;
};

const RULE_ACTIONS = [
  ["flag", "Flag for review"],
  ["notify", "Send notification"],
  ["tag", "Add a tag"],
  ["escalate", "Escalate to owner"],
] as const;

function RuleBuilder() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<RuleRow[]>("auto-rules", []);
  const [, pushActivity] = useActivity();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState<RuleSubject>("transaction");
  const [field, setField] = useState<RuleField>("amount");
  const [op, setOp] = useState<RuleOp>(">");
  const [value, setValue] = useState("");
  const [action, setAction] = useState<RuleAction>("flag");
  const [previewId, setPreviewId] = useState<string | null>(null);

  const fieldsFor: Record<RuleSubject, { id: RuleField; label: string }[]> = {
    transaction: [
      { id: "amount", label: "Amount (₹)" },
      { id: "category", label: "Category" },
      { id: "counterparty", label: "Counterparty" },
      { id: "description", label: "Description" },
    ],
    invoice: [
      { id: "amount", label: "Amount (₹)" },
      { id: "status", label: "Status" },
      { id: "counterparty", label: "Customer" },
      { id: "daysOverdue", label: "Days overdue" },
    ],
  };

  const addRule = () => {
    if (!name.trim() || !value.trim()) { toast.error("Enter a rule name and a value to match"); return; }
    const row: RuleRow = { id: crypto.randomUUID(), name: name.trim(), subject, field, op, value: value.trim(), action, enabled: true };
    setRules(prev => [...prev, row]);
    pushActivity({ tool: "Rule Builder", kind: "create", message: `Rule "${row.name}" created` });
    setName(""); setValue("");
    toast.success("Rule added");
  };

  // Evaluate a single rule against live store data, returning matching rows.
  const evaluate = (r: RuleRow): { label: string; sub: string }[] => {
    const today = new Date();
    const num = parseFloat(r.value);
    const cmp = (a: number, b: number) => r.op === ">" ? a > b : r.op === "<" ? a < b : a === b;
    const textMatch = (s: string) => {
      const v = r.value.toLowerCase();
      return r.op === "contains" ? s.toLowerCase().includes(v) : s.toLowerCase() === v;
    };
    if (r.subject === "transaction") {
      return store.transactions.filter(t => {
        if (r.field === "amount") return !isNaN(num) && cmp(Math.abs(t.amount), num);
        if (r.field === "category") return textMatch(t.category);
        if (r.field === "counterparty") return textMatch(t.counterparty);
        if (r.field === "description") return textMatch(t.description);
        return false;
      }).map(t => ({ label: t.description || t.counterparty, sub: `${t.category} · ${formatCurrency(Math.abs(t.amount))}` }));
    }
    return store.invoices.filter(inv => {
      if (r.field === "amount") return !isNaN(num) && cmp(inv.amount, num);
      if (r.field === "status") return textMatch(inv.status);
      if (r.field === "counterparty") return textMatch(inv.customer);
      if (r.field === "daysOverdue") {
        const od = differenceInCalendarDays(today, parseISO(inv.dueDate));
        return !isNaN(num) && cmp(od, num);
      }
      return false;
    }).map(inv => ({ label: inv.customer, sub: `${inv.status} · ${formatCurrency(inv.amount)} · due ${inv.dueDate}` }));
  };

  const numericField = field === "amount" || field === "daysOverdue";
  const ops: { id: RuleOp; label: string }[] = numericField
    ? [{ id: ">", label: "greater than" }, { id: "<", label: "less than" }, { id: "==", label: "equals" }]
    : [{ id: "contains", label: "contains" }, { id: "==", label: "equals" }];

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Zap size={14} className="text-[var(--color-primary)]" /> No-Code Rule Builder</h3>
        <p className="text-xs text-[var(--color-muted)]">Compose an IF / THEN rule. Preview shows which live records match right now — actions are illustrative until a backend executor exists.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Rule name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Big vendor payouts" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">When a…</label>
            <select value={subject} onChange={e => { setSubject(e.target.value as RuleSubject); setField(e.target.value === "invoice" ? "amount" : "amount"); }} className={INP}>
              <option value="transaction">Transaction</option>
              <option value="invoice">Invoice</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Field</label>
            <select value={field} onChange={e => { setField(e.target.value as RuleField); setOp(e.target.value === "amount" || e.target.value === "daysOverdue" ? ">" : "contains"); }} className={INP}>
              {fieldsFor[subject].map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Condition</label>
            <select value={op} onChange={e => setOp(e.target.value as RuleOp)} className={INP}>
              {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Value</label>
            <input value={value} onChange={e => setValue(e.target.value)} placeholder={numericField ? "100000" : "e.g. payroll"} className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Then</label>
            <select value={action} onChange={e => setAction(e.target.value as RuleAction)} className={INP}>
              {RULE_ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={addRule} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No rules yet. Build one above, or install one from the Trigger Library.</p>
      ) : rules.map(r => {
        const matches = evaluate(r);
        const open = previewId === r.id;
        return (
          <div key={r.id} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button onClick={() => setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${r.enabled ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                  {r.enabled ? "Enabled" : "Paused"}
                </button>
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    IF {r.subject} <strong>{r.field}</strong> {r.op} <strong>{r.value}</strong> THEN {RULE_ACTIONS.find(a => a[0] === r.action)?.[1]}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold tabular-nums ${matches.length > 0 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{matches.length} match{matches.length === 1 ? "" : "es"}</span>
                <button onClick={() => setPreviewId(open ? null : r.id)} className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] hover:underline">
                  <Play size={10} /> {open ? "Hide" : "Preview"}
                </button>
                <button onClick={() => { setRules(prev => prev.filter(x => x.id !== r.id)); pushActivity({ tool: "Rule Builder", kind: "delete", message: `Rule "${r.name}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
            {open && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                {matches.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">No live records match this condition right now.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {matches.slice(0, 25).map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                        <span className="font-medium truncate pr-2">{m.label}</span>
                        <span className="text-[var(--color-muted)] tabular-nums shrink-0">{m.sub}</span>
                      </div>
                    ))}
                    {matches.length > 25 && <p className="text-[10px] text-[var(--color-muted)] px-1">+{matches.length - 25} more</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--color-muted)]">Preview evaluates the condition against your current transactions and invoices. It does not perform the action — there is no scheduled executor yet.</p>
    </div>
  );
}

// ── #3 Reminder / Automation Scheduler ─────────────────────────────────────────
type ReminderSource = "invoice" | "obligation" | "manual";
type ReminderRow = { id: string; label: string; source: ReminderSource; refId: string; baseDate: string; offsetDays: number; channel: "whatsapp" | "email" | "in-app" };
function ReminderScheduler() {
  const { store } = useApp();
  const [reminders, setReminders] = useFeatureState<ReminderRow[]>("auto-reminders", []);
  const [, pushActivity] = useActivity();

  const [source, setSource] = useState<ReminderSource>("invoice");
  const [refId, setRefId] = useState("");
  const [label, setLabel] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [offset, setOffset] = useState("-3");
  const [channel, setChannel] = useState<ReminderRow["channel"]>("whatsapp");

  const sources = source === "invoice"
    ? store.invoices.filter(i => i.status !== "paid").map(i => ({ id: i.id, label: `${i.customer} — ${formatCurrency(i.amount)} (due ${i.dueDate})`, date: i.dueDate }))
    : source === "obligation"
      ? store.obligations.map(o => ({ id: o.id, label: `${o.name} — ${formatCurrency(o.amount)} (due ${o.dueDate})`, date: o.dueDate }))
      : [];

  const add = () => {
    const off = parseInt(offset);
    if (source !== "manual" && !refId) { toast.error("Pick the record to anchor the reminder to"); return; }
    if (source === "manual" && !label.trim()) { toast.error("Enter a label for the manual reminder"); return; }
    const base = source === "manual" ? manualDate : (sources.find(s => s.id === refId)?.date ?? manualDate);
    const lbl = source === "manual" ? label.trim() : (sources.find(s => s.id === refId)?.label ?? "Reminder");
    setReminders(prev => [...prev, { id: crypto.randomUUID(), label: lbl, source, refId, baseDate: base, offsetDays: isNaN(off) ? 0 : off, channel }]);
    pushActivity({ tool: "Reminder Scheduler", kind: "create", message: `Reminder scheduled for "${lbl}"` });
    setRefId(""); setLabel("");
    toast.success("Reminder scheduled");
  };

  const today = new Date();
  const fireDate = (r: ReminderRow) => addDays(parseISO(r.baseDate), r.offsetDays);
  const sorted = [...reminders].sort((a, b) => fireDate(a).getTime() - fireDate(b).getTime());

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Reminder / Automation Scheduler</h3>
        <p className="text-xs text-[var(--color-muted)]">Anchor a reminder to an invoice or obligation due date with an offset. Fire dates are computed below; delivery is a client-side preview, not an actual send.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Anchor to</label>
            <select value={source} onChange={e => { setSource(e.target.value as ReminderSource); setRefId(""); }} className={INP}>
              <option value="invoice">An invoice due date</option>
              <option value="obligation">An obligation due date</option>
              <option value="manual">A manual date</option>
            </select>
          </div>
          {source === "manual" ? (
            <>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Label</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. File GSTR-3B" className={INP} />
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className={INP} />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Record</label>
              <select value={refId} onChange={e => setRefId(e.target.value)} className={INP}>
                <option value="">Select…</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Offset (days)</label>
            <input type="number" value={offset} onChange={e => setOffset(e.target.value)} placeholder="-3" className={INP} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-[var(--color-muted)]">Channel:</span>
          {(["whatsapp", "email", "in-app"] as const).map(c => (
            <label key={c} className="flex items-center gap-1.5 cursor-pointer capitalize">
              <input type="radio" name="rch" checked={channel === c} onChange={() => setChannel(c)} className="accent-[var(--color-primary)]" />{c}
            </label>
          ))}
          <button onClick={add} className="ml-auto flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Schedule
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No reminders scheduled.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Reminder", "Fires on", "Channel", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {sorted.map(r => {
                const fd = fireDate(r);
                const days = differenceInCalendarDays(fd, today);
                return (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium max-w-[260px] truncate">{r.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format(fd, "d MMM yyyy")} <span className="text-[var(--color-muted)] text-[10px]">({r.offsetDays >= 0 ? "+" : ""}{r.offsetDays}d)</span></td>
                    <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{r.channel}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${days < 0 ? "bg-[var(--color-accent)] text-[var(--color-muted)]" : days <= 3 ? "bg-red-950/30 text-red-400" : days <= 14 ? "bg-yellow-950/30 text-yellow-400" : "bg-green-950/30 text-green-400"}`}>
                        {days < 0 ? "Past" : days === 0 ? "Today" : `in ${days}d`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setReminders(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #4 Approval-Chain Builder ──────────────────────────────────────────────────
type ApprovalStep = { id: string; approver: string; mode: "any" | "all" };
type ApprovalChain = { id: string; name: string; threshold: number; steps: ApprovalStep[] };
function ApprovalChains() {
  const { store } = useApp();
  const [chains, setChains] = useFeatureState<ApprovalChain[]>("auto-approval-chains", []);
  const [, pushActivity] = useActivity();

  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("100000");
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [approver, setApprover] = useState("");
  const [mode, setMode] = useState<ApprovalStep["mode"]>("any");

  const addStep = () => {
    if (!approver.trim()) { toast.error("Enter an approver name/role"); return; }
    setSteps(prev => [...prev, { id: crypto.randomUUID(), approver: approver.trim(), mode }]);
    setApprover("");
  };

  const saveChain = () => {
    const t = parseFloat(threshold);
    if (!name.trim() || isNaN(t) || steps.length === 0) { toast.error("Name, threshold and at least one step required"); return; }
    setChains(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), threshold: t, steps }]);
    pushActivity({ tool: "Approval Chains", kind: "create", message: `Chain "${name.trim()}" created (${steps.length} step)` });
    setName(""); setSteps([]);
    toast.success("Approval chain saved");
  };

  // Which pending payouts (expense transactions) would route through each chain.
  const pendingPayouts = useMemo(
    () => store.transactions.filter(t => t.amount < 0).map(t => ({ id: t.id, amount: Math.abs(t.amount), label: t.counterparty || t.description })),
    [store.transactions],
  );

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><CheckSquare size={14} className="text-[var(--color-primary)]" /> Approval-Chain Builder</h3>
        <p className="text-xs text-[var(--color-muted)]">Define who must sign off above a spend threshold. The preview counts how many current outflows would route through this chain.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Chain name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-value payouts" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Applies above (₹)</label>
            <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="100000" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Approver (name or role)</label>
            <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="e.g. Finance Lead" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as ApprovalStep["mode"])} className={INP}>
              <option value="any">Any one approves</option>
              <option value="all">All must approve</option>
            </select>
          </div>
          <button onClick={addStep} className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm font-medium hover:border-[var(--color-primary)]">
            <Plus size={13} /> Add step
          </button>
        </div>
        {steps.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span className="text-[11px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5">
                  {i + 1}. {s.approver} <span className="text-[var(--color-muted)]">({s.mode})</span>
                  <button onClick={() => setSteps(prev => prev.filter(x => x.id !== s.id))} className="ml-1.5 text-[var(--color-muted)] hover:text-red-400">✕</button>
                </span>
                {i < steps.length - 1 && <ArrowRight size={11} className="text-[var(--color-muted)]" />}
              </div>
            ))}
          </div>
        )}
        <button onClick={saveChain} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <CheckCircle2 size={13} /> Save chain
        </button>
      </div>

      {chains.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No approval chains defined.</p>
      ) : chains.map(c => {
        const routed = pendingPayouts.filter(p => p.amount >= c.threshold);
        return (
          <div key={c.id} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[11px] text-[var(--color-muted)]">Above {formatCurrency(c.threshold)} · {c.steps.map((s, i) => `${i + 1}. ${s.approver}`).join("  →  ")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)]"><strong className="text-orange-400 tabular-nums">{routed.length}</strong> current outflow(s) would route here</span>
                <button onClick={() => { setChains(prev => prev.filter(x => x.id !== c.id)); pushActivity({ tool: "Approval Chains", kind: "delete", message: `Chain "${c.name}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── #5 Trigger Library (recipes) ───────────────────────────────────────────────
type Recipe = { id: string; title: string; desc: string; rule: Omit<RuleRow, "id" | "enabled"> };
const RECIPES: Recipe[] = [
  { id: "overdue", title: "Overdue invoice nudge", desc: "Flag invoices more than 0 days overdue.", rule: { name: "Overdue invoices", subject: "invoice", field: "daysOverdue", op: ">", value: "0", action: "notify" } },
  { id: "bigpay", title: "Large payout review", desc: "Flag any outflow above ₹1,00,000.", rule: { name: "Large payouts", subject: "transaction", field: "amount", op: ">", value: "100000", action: "escalate" } },
  { id: "bigsale", title: "Big invoice raised", desc: "Notify when an invoice above ₹2,00,000 is created.", rule: { name: "Large invoices", subject: "invoice", field: "amount", op: ">", value: "200000", action: "notify" } },
  { id: "payroll", title: "Payroll posted", desc: "Flag payroll-category transactions for review.", rule: { name: "Payroll watch", subject: "transaction", field: "category", op: "==", value: "payroll", action: "flag" } },
  { id: "tax", title: "Tax outflow watch", desc: "Tag tax-category transactions.", rule: { name: "Tax outflows", subject: "transaction", field: "category", op: "==", value: "tax", action: "tag" } },
  { id: "pending", title: "Unpaid invoices", desc: "Notify on invoices still pending.", rule: { name: "Pending invoices", subject: "invoice", field: "status", op: "==", value: "pending", action: "notify" } },
];
function TriggerLibrary({ onUse }: { onUse: () => void }) {
  const [, setRules] = useFeatureState<RuleRow[]>("auto-rules", []);
  const [, pushActivity] = useActivity();

  const install = (r: Recipe) => {
    setRules(prev => [...prev, { id: crypto.randomUUID(), enabled: true, ...r.rule }]);
    pushActivity({ tool: "Trigger Library", kind: "create", message: `Installed recipe "${r.title}"` });
    toast.success(`"${r.title}" installed as a rule`);
    onUse();
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BookOpen size={14} className="text-[var(--color-primary)]" /> Trigger Library</h3>
        <p className="text-xs text-[var(--color-muted)] mt-1">One-click recipes for common Indian SMB scenarios. Installing adds a ready-made rule you can preview and tune in the Rule Builder.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {RECIPES.map(r => (
          <div key={r.id} className={`${CARD} p-4 flex flex-col`}>
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-1 flex-1 leading-relaxed">{r.desc}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-2 font-mono">IF {r.rule.subject}.{r.rule.field} {r.rule.op} {r.rule.value}</p>
            <button onClick={() => install(r)} className="mt-3 flex items-center justify-center gap-1.5 bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg text-xs hover:bg-[var(--color-primary)]/25">
              <Plus size={11} /> Install recipe
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── #6 Bulk-Action Runner (preview) ────────────────────────────────────────────
function BulkRunner() {
  const { store } = useApp();
  const [, pushActivity] = useActivity();
  const [target, setTarget] = useState<"overdue-invoices" | "pending-invoices" | "flagged-txns">("overdue-invoices");
  const [actionLabel, setActionLabel] = useState<"send-reminder" | "mark-followup" | "tag">("send-reminder");
  const today = new Date();

  const rows = useMemo(() => {
    if (target === "flagged-txns") {
      return store.transactions.filter(t => t.flagged).map(t => ({ id: t.id, label: t.counterparty || t.description, sub: formatCurrency(Math.abs(t.amount)) }));
    }
    return store.invoices.filter(i => {
      if (target === "pending-invoices") return i.status === "pending";
      return i.status === "overdue" || (i.status !== "paid" && differenceInCalendarDays(today, parseISO(i.dueDate)) > 0);
    }).map(i => ({ id: i.id, label: i.customer, sub: `${formatCurrency(i.amount)} · due ${i.dueDate}` }));
  }, [store.invoices, store.transactions, target]);

  const ACTIONS = [["send-reminder", "Send reminder"], ["mark-followup", "Mark for follow-up"], ["tag", "Apply a tag"]] as const;

  const run = () => {
    if (rows.length === 0) { toast.error("No records in this selection"); return; }
    pushActivity({ tool: "Bulk Runner", kind: "run", message: `Previewed "${ACTIONS.find(a => a[0] === actionLabel)?.[1]}" on ${rows.length} record(s)` });
    toast.success(`Preview: "${ACTIONS.find(a => a[0] === actionLabel)?.[1]}" would apply to ${rows.length} record(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Bulk-Action Runner</h3>
        <p className="text-xs text-[var(--color-muted)]">Select a batch of live records and preview a bulk action across all of them. This is a dry-run — it logs the intended action without sending or mutating anything.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Selection</label>
            <select value={target} onChange={e => setTarget(e.target.value as typeof target)} className={INP}>
              <option value="overdue-invoices">Overdue invoices</option>
              <option value="pending-invoices">Pending invoices</option>
              <option value="flagged-txns">Flagged transactions</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Action</label>
            <select value={actionLabel} onChange={e => setActionLabel(e.target.value as typeof actionLabel)} className={INP}>
              {ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <button onClick={run} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Play size={13} /> Preview run ({rows.length})
          </button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><p className="text-sm font-semibold">{rows.length} record(s) in this batch</p></div>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)] p-4">Nothing matches this selection right now.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)] max-h-[420px] overflow-y-auto">
            {rows.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium truncate pr-2">{r.label}</span>
                <span className="text-[var(--color-muted)] text-xs tabular-nums shrink-0">{r.sub}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── #7 Notification Rules ──────────────────────────────────────────────────────
type NotifRow = { id: string; event: string; channel: "whatsapp" | "email" | "in-app"; recipient: string; quietHours: boolean };
const NOTIF_EVENTS = ["Invoice overdue", "Large payout", "Low balance", "GST due date", "New vendor onboarded", "Approval pending"] as const;
function NotificationRules() {
  const [rows, setRows] = useFeatureState<NotifRow[]>("auto-notifications", []);
  const [, pushActivity] = useActivity();
  const [event, setEvent] = useState<string>(NOTIF_EVENTS[0]);
  const [channel, setChannel] = useState<NotifRow["channel"]>("whatsapp");
  const [recipient, setRecipient] = useState("");
  const [quiet, setQuiet] = useState(false);

  const add = () => {
    if (!recipient.trim()) { toast.error("Enter who should be notified"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), event, channel, recipient: recipient.trim(), quietHours: quiet }]);
    pushActivity({ tool: "Notification Rules", kind: "create", message: `Notify ${recipient.trim()} on "${event}"` });
    setRecipient("");
    toast.success("Notification rule added");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing size={14} className="text-[var(--color-primary)]" /> Notification Routing Rules</h3>
        <p className="text-xs text-[var(--color-muted)]">Decide who hears about which event, on which channel. Definitions are stored here; actual delivery depends on connected channels (preview only).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">On event</label>
            <select value={event} onChange={e => setEvent(e.target.value)} className={INP}>
              {NOTIF_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as NotifRow["channel"])} className={INP}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="in-app">In-app</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Notify (name/role)</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Owner" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add
          </button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input type="checkbox" checked={quiet} onChange={e => setQuiet(e.target.checked)} className="accent-[var(--color-primary)]" />
          Respect quiet hours — batch into a daily digest instead of pinging immediately
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No notification rules yet.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Event", "Channel", "Recipient", "Quiet hours", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{r.event}</td>
                  <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{r.channel}</td>
                  <td className="px-4 py-2.5">{r.recipient}</td>
                  <td className="px-4 py-2.5">{r.quietHours ? <span className="text-green-400 text-xs">On (digest)</span> : <span className="text-[var(--color-muted)] text-xs">Off (instant)</span>}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #8 Recurring-Task Scheduler ────────────────────────────────────────────────
type RecurringTask = { id: string; title: string; cadence: "daily" | "weekly" | "monthly" | "quarterly"; anchorDate: string; owner: string };
function RecurringTasks() {
  const [tasks, setTasks] = useFeatureState<RecurringTask[]>("auto-tasks", []);
  const [, pushActivity] = useActivity();
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<RecurringTask["cadence"]>("monthly");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().split("T")[0]);
  const [owner, setOwner] = useState("");
  const today = new Date();

  const add = () => {
    if (!title.trim()) { toast.error("Enter a task title"); return; }
    setTasks(prev => [...prev, { id: crypto.randomUUID(), title: title.trim(), cadence, anchorDate: anchor, owner: owner.trim() || "Unassigned" }]);
    pushActivity({ tool: "Recurring Tasks", kind: "create", message: `Recurring task "${title.trim()}" (${cadence})` });
    setTitle(""); setOwner("");
    toast.success("Recurring task scheduled");
  };

  // Compute the next occurrence on or after today from the anchor + cadence.
  const nextRun = (t: RecurringTask): Date => {
    const base = parseISO(t.anchorDate);
    const stepDays = t.cadence === "daily" ? 1 : t.cadence === "weekly" ? 7 : t.cadence === "monthly" ? 30 : 91;
    let d = base;
    let guard = 0;
    while (differenceInCalendarDays(d, today) < 0 && guard < 5000) { d = addDays(d, stepDays); guard++; }
    return d;
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Clock size={14} className="text-[var(--color-primary)]" /> Recurring-Task Scheduler</h3>
        <p className="text-xs text-[var(--color-muted)]">Plan repeating finance jobs — month-end close, GSTR prep, salary run. Next-occurrence dates are computed; nothing fires automatically without a backend cron.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Task</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Month-end close" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence</label>
            <select value={cadence} onChange={e => setCadence(e.target.value as RecurringTask["cadence"])} className={INP}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Starting</label>
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Owner</label>
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="e.g. CA / Finance" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Schedule task
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No recurring tasks scheduled.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Task", "Cadence", "Owner", "Next run", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {tasks.map(t => {
                const nr = nextRun(t);
                const days = differenceInCalendarDays(nr, today);
                return (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{t.title}</td>
                    <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{t.cadence}</td>
                    <td className="px-4 py-2.5">{t.owner}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format(nr, "d MMM yyyy")} <span className="text-[var(--color-muted)] text-[10px]">({days === 0 ? "today" : `in ${days}d`})</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setTasks(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #9 Automation Activity Log ─────────────────────────────────────────────────
function ActivityLog() {
  const [log, setLog] = useFeatureState<ActivityEvent[]>("auto-activity", []);
  const KIND_COLOR: Record<ActivityEvent["kind"], string> = {
    create: "text-green-400 bg-green-950/30 border-green-800/30",
    run: "text-blue-400 bg-blue-950/30 border-blue-800/30",
    delete: "text-red-400 bg-red-950/30 border-red-800/30",
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between`}>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Automation Activity Log</h3>
          <p className="text-xs text-[var(--color-muted)] mt-1">Every rule, reminder, chain and preview run you create here is recorded. This is your local audit trail, not a backend execution log.</p>
        </div>
        {log.length > 0 && (
          <button onClick={() => { setLog([]); toast.success("Activity log cleared"); }} className="text-xs text-[var(--color-muted)] hover:text-red-400 border border-[var(--color-border)] rounded-lg px-3 py-1.5">
            Clear log
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <ScrollText size={24} className="mx-auto text-[var(--color-muted)] mb-3" />
          <p className="text-sm font-medium mb-1">No activity yet</p>
          <p className="text-xs text-[var(--color-muted)]">Create a rule, schedule a reminder or run a bulk preview and it will appear here.</p>
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[var(--color-border)]`}>
          {log.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${KIND_COLOR[e.kind]}`}>{e.kind}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{e.message}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{e.tool}</p>
              </div>
              <span className="text-[10px] text-[var(--color-muted)] tabular-nums shrink-0">{format(parseISO(e.ts), "d MMM, HH:mm")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── #10 Webhook / Integration Registry (config only) ───────────────────────────
type HookRow = { id: string; name: string; url: string; event: string; active: boolean };
function WebhookRegistry() {
  const [hooks, setHooks] = useFeatureState<HookRow[]>("auto-webhooks", []);
  const [, pushActivity] = useActivity();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState<string>(NOTIF_EVENTS[0]);

  const add = () => {
    if (!name.trim() || !url.trim()) { toast.error("Enter a name and endpoint URL"); return; }
    if (!/^https?:\/\//i.test(url.trim())) { toast.error("URL must start with http:// or https://"); return; }
    setHooks(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), url: url.trim(), event, active: true }]);
    pushActivity({ tool: "Webhook Registry", kind: "create", message: `Webhook "${name.trim()}" registered` });
    setName(""); setUrl("");
    toast.success("Webhook registered (config only — not dispatched)");
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Webhook size={14} className="text-[var(--color-primary)]" /> Webhook / Integration Registry</h3>
        <p className="text-xs text-[var(--color-muted)]">Register outbound endpoints to receive finance events. This stores the configuration only — no events are actually dispatched until a backend dispatcher is wired up.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ops Slack" className={INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Endpoint URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://hooks.example.com/…" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">On event</label>
            <select value={event} onChange={e => setEvent(e.target.value)} className={INP}>
              {NOTIF_EVENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <Plus size={13} /> Register endpoint
        </button>
      </div>

      {hooks.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No endpoints registered.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Name", "Event", "Endpoint", "Status", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {hooks.map(h => (
                <tr key={h.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{h.name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{h.event}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-muted)] max-w-[280px] truncate">{h.url}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setHooks(prev => prev.map(x => x.id === h.id ? { ...x, active: !x.active } : x))}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${h.active ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                      {h.active ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setHooks(prev => prev.filter(x => x.id !== h.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Secrets and signing keys are not collected here. Treat this as a planning registry until a server-side dispatcher with signature verification is available.</p>
    </div>
  );
}

// ── #11 Workflow Templates Gallery ─────────────────────────────────────────────
type Template = { id: string; title: string; persona: string; steps: string[]; rule?: Omit<RuleRow, "id" | "enabled"> };
const TEMPLATES: Template[] = [
  { id: "dunning", title: "Dunning sequence", persona: "Finance", steps: ["Invoice 3 days overdue", "WhatsApp reminder", "Day 7 — phone task", "Day 30 — escalate to owner"], rule: { name: "Dunning trigger", subject: "invoice", field: "daysOverdue", op: ">", value: "3", action: "notify" } },
  { id: "monthclose", title: "Month-end close", persona: "CA", steps: ["Reconcile bank lines", "Post recurring journals", "Review flagged transactions", "Prepare GSTR data"] },
  { id: "p2p", title: "Procure-to-pay gate", persona: "Ops", steps: ["PO raised", "Approval above ₹50k", "Goods received note", "Three-way match", "Schedule payment"], rule: { name: "PO approval gate", subject: "transaction", field: "amount", op: ">", value: "50000", action: "escalate" } },
  { id: "onboard", title: "Vendor onboarding", persona: "Ops", steps: ["Collect PAN / GST / bank", "Verify GSTIN", "Risk check", "Activate vendor"] },
  { id: "cashsweep", title: "Idle-cash watch", persona: "Owner", steps: ["Balance above buffer", "Notify owner", "Suggest sweep or prepayment"] },
  { id: "gstpipeline", title: "GST filing pipeline", persona: "CA", steps: ["GSTR-2B vs books recon", "Resolve mismatches", "Validate GSTR-1", "File before due date"] },
];
function TemplatesGallery({ onUse }: { onUse: () => void }) {
  const [, setRules] = useFeatureState<RuleRow[]>("auto-rules", []);
  const [, pushActivity] = useActivity();

  const useTemplate = (t: Template) => {
    if (t.rule) {
      setRules(prev => [...prev, { id: crypto.randomUUID(), enabled: true, ...t.rule! }]);
      pushActivity({ tool: "Templates Gallery", kind: "create", message: `Applied template "${t.title}" (rule added)` });
      toast.success(`"${t.title}" applied — starter rule added to the Rule Builder`);
      onUse();
    } else {
      pushActivity({ tool: "Templates Gallery", kind: "create", message: `Viewed template "${t.title}"` });
      toast.success(`"${t.title}" is a manual checklist — no auto rule attached`);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><LayoutTemplate size={14} className="text-[var(--color-primary)]" /> Workflow Templates Gallery</h3>
        <p className="text-xs text-[var(--color-muted)] mt-1">End-to-end blueprints for common finance ops. Templates with a triggerable step can seed a starter rule; the rest are checklists to build out manually.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map(t => (
          <div key={t.id} className={`${CARD} p-4 flex flex-col`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t.title}</p>
              <span className="text-[9px] uppercase tracking-wider text-[var(--color-muted)] border border-[var(--color-border)] rounded px-1.5 py-0.5">{t.persona}</span>
            </div>
            <ol className="mt-3 space-y-1.5 flex-1">
              {t.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--color-muted)]">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-[9px] tabular-nums mt-px">{i + 1}</span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            <button onClick={() => useTemplate(t)} className="mt-3 flex items-center justify-center gap-1.5 bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-2 rounded-lg text-xs hover:bg-[var(--color-primary)]/25">
              {t.rule ? <><Zap size={11} /> Use template</> : <><GitBranch size={11} /> Use as checklist</>}
            </button>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-4 border border-yellow-800/40 bg-yellow-950/10 flex items-start gap-2">
        <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-muted)]">Templates describe the intended flow. Multi-step execution (approvals, sends, postings) needs a backend orchestrator that does not exist yet — today these seed rules and checklists you action manually.</p>
      </div>
    </div>
  );
}

// ── #12 Invoice Auto-Numbering Rules ───────────────────────────────────────────
type NumberingRule = { id: string; prefix: string; pad: number; start: number; resetYearly: boolean };
function NumberingRules() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<NumberingRule[]>("auto-numbering", []);
  const [, pushActivity] = useActivity();
  const [prefix, setPrefix] = useState("INV-");
  const [pad, setPad] = useState("4");
  const [start, setStart] = useState("1");
  const [reset, setReset] = useState(true);

  const add = () => {
    const p = parseInt(pad), s = parseInt(start);
    if (!prefix.trim()) { toast.error("Enter a prefix"); return; }
    if (isNaN(p) || isNaN(s)) { toast.error("Pad width and start must be numbers"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), prefix: prefix.trim(), pad: Math.max(0, p), start: s, resetYearly: reset }]);
    pushActivity({ tool: "Numbering Rules", kind: "create", message: `Numbering scheme "${prefix.trim()}" added` });
    toast.success("Numbering rule added");
  };

  // Next sequence = invoice count + start. Format with FY suffix if reset-yearly.
  const fySuffix = () => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
  };
  const sample = (r: NumberingRule) => {
    const seq = (r.start + store.invoices.length).toString().padStart(r.pad, "0");
    return r.resetYearly ? `${r.prefix}${fySuffix()}/${seq}` : `${r.prefix}${seq}`;
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Hash size={14} className="text-[var(--color-primary)]" /> Invoice Auto-Numbering Rules</h3>
        <p className="text-xs text-[var(--color-muted)]">Define a sequential numbering scheme. The sample below is computed from your current invoice count — actual assignment happens when invoices are issued (preview only).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Prefix</label>
            <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="INV-" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pad width</label>
            <input type="number" value={pad} onChange={e => setPad(e.target.value)} placeholder="4" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Start at</label>
            <input type="number" value={start} onChange={e => setStart(e.target.value)} placeholder="1" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add scheme
          </button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input type="checkbox" checked={reset} onChange={e => setReset(e.target.checked)} className="accent-[var(--color-primary)]" />
          Reset sequence each financial year (insert FY tag, e.g. {fySuffix()})
        </label>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No numbering schemes defined.</p>
      ) : rules.map(r => (
        <div key={r.id} className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
          <div>
            <p className="text-sm font-medium font-mono">{sample(r)}</p>
            <p className="text-[11px] text-[var(--color-muted)] mt-0.5">Prefix <strong>{r.prefix}</strong> · pad {r.pad} · start {r.start} · {r.resetYearly ? "FY reset" : "continuous"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--color-muted)]">next after {store.invoices.length} existing</span>
            <button onClick={() => { setRules(prev => prev.filter(x => x.id !== r.id)); pushActivity({ tool: "Numbering Rules", kind: "delete", message: `Scheme "${r.prefix}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── #13 Auto-Categorization Rule Set ───────────────────────────────────────────
type TxnCategory = Transaction["category"];
type CatRule = { id: string; keyword: string; category: TxnCategory };
const CAT_OPTIONS: TxnCategory[] = ["revenue", "expense", "payroll", "loan", "tax", "transfer"];
function AutoCategorize() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<CatRule[]>("auto-categorize", []);
  const [, pushActivity] = useActivity();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<TxnCategory>("expense");

  const add = () => {
    if (!keyword.trim()) { toast.error("Enter a keyword to match"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), keyword: keyword.trim().toLowerCase(), category }]);
    pushActivity({ tool: "Auto-Categorize", kind: "create", message: `Rule "${keyword.trim()}" → ${category}` });
    setKeyword("");
    toast.success("Categorization rule added");
  };

  // For each rule, find live transactions whose text matches but category differs (would be re-classed).
  const evalRule = (r: CatRule) =>
    store.transactions.filter(t => {
      const hay = `${t.description} ${t.counterparty}`.toLowerCase();
      return hay.includes(r.keyword);
    });

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Tags size={14} className="text-[var(--color-primary)]" /> Auto-Categorization Rule Set</h3>
        <p className="text-xs text-[var(--color-muted)]">Map a keyword in a transaction's description or counterparty to a category. The preview shows live matches and how many would change category — no data is mutated.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">If text contains</label>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. swiggy, rent, gst" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Set category to</label>
            <select value={category} onChange={e => setCategory(e.target.value as TxnCategory)} className={INP}>
              {CAT_OPTIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add rule
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No categorization rules yet.</p>
      ) : rules.map(r => {
        const matches = evalRule(r);
        const changed = matches.filter(t => t.category !== r.category).length;
        return (
          <div key={r.id} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">"<span className="font-mono">{r.keyword}</span>" → <span className="capitalize text-[var(--color-primary)]">{r.category}</span></p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-muted)]"><strong className="tabular-nums text-[var(--color-text)]">{matches.length}</strong> match · <strong className="tabular-nums text-orange-400">{changed}</strong> would re-class</span>
                <button onClick={() => { setRules(prev => prev.filter(x => x.id !== r.id)); pushActivity({ tool: "Auto-Categorize", kind: "delete", message: `Rule "${r.keyword}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
            {matches.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-1.5 max-h-40 overflow-y-auto">
                {matches.slice(0, 15).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                    <span className="font-medium truncate pr-2">{t.description || t.counterparty}</span>
                    <span className="text-[var(--color-muted)] shrink-0 capitalize">{t.category}{t.category !== r.category && <span className="text-orange-400"> → {r.category}</span>}</span>
                  </div>
                ))}
                {matches.length > 15 && <p className="text-[10px] text-[var(--color-muted)] px-1">+{matches.length - 15} more</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── #14 Escalation-Matrix Builder ──────────────────────────────────────────────
type EscTier = { id: string; afterDays: number; assignee: string };
function EscalationMatrix() {
  const { store } = useApp();
  const [tiers, setTiers] = useFeatureState<EscTier[]>("auto-escalation", []);
  const [, pushActivity] = useActivity();
  const [days, setDays] = useState("30");
  const [assignee, setAssignee] = useState("");
  const today = new Date();

  const add = () => {
    const d = parseInt(days);
    if (isNaN(d) || !assignee.trim()) { toast.error("Enter a day threshold and an assignee"); return; }
    setTiers(prev => [...prev, { id: crypto.randomUUID(), afterDays: d, assignee: assignee.trim() }].sort((a, b) => a.afterDays - b.afterDays));
    pushActivity({ tool: "Escalation Matrix", kind: "create", message: `Tier at ${d}d → ${assignee.trim()}` });
    setAssignee("");
    toast.success("Escalation tier added");
  };

  // Overdue invoices with their ageing, bucketed by the highest tier they exceed.
  const overdue = useMemo(() => store.invoices
    .filter(i => i.status !== "paid")
    .map(i => ({ ...i, age: differenceInCalendarDays(today, parseISO(i.dueDate)) }))
    .filter(i => i.age > 0), [store.invoices]);

  const bucketFor = (age: number) => [...tiers].reverse().find(t => age >= t.afterDays);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Network size={14} className="text-[var(--color-primary)]" /> Escalation-Matrix Builder</h3>
        <p className="text-xs text-[var(--color-muted)]">Define who owns an overdue account as it ages (30 / 60 / 90 days). The preview buckets your live overdue invoices into each tier — assignment is illustrative, no one is paged.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">After (days overdue)</label>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} placeholder="30" className={INP} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Escalate to</label>
            <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="e.g. Collections Lead" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add tier
          </button>
        </div>
      </div>

      {tiers.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No escalation tiers defined.</p>
      ) : tiers.map((t, i) => {
        const inTier = overdue.filter(o => bucketFor(o.age)?.id === t.id);
        const total = inTier.reduce((s, o) => s + o.amount, 0);
        return (
          <div key={t.id} className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold w-6 h-6 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center tabular-nums">{i + 1}</span>
              <div>
                <p className="text-sm font-medium">{t.assignee}</p>
                <p className="text-[11px] text-[var(--color-muted)]">Owns invoices overdue ≥ {t.afterDays} days</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)]"><strong className="tabular-nums text-orange-400">{inTier.length}</strong> invoice(s) · {formatCurrency(total)}</span>
              <button onClick={() => { setTiers(prev => prev.filter(x => x.id !== t.id)); pushActivity({ tool: "Escalation Matrix", kind: "delete", message: `Tier "${t.assignee}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── #15 SLA-Timer Config ───────────────────────────────────────────────────────
type SlaRow = { id: string; stage: string; hours: number; thenWhat: "escalate" | "remind" | "reassign" };
function SlaTimers() {
  const [rows, setRows] = useFeatureState<SlaRow[]>("auto-sla", []);
  const [, pushActivity] = useActivity();
  const [stage, setStage] = useState("Approval pending");
  const [hours, setHours] = useState("24");
  const [thenWhat, setThenWhat] = useState<SlaRow["thenWhat"]>("escalate");
  const STAGES = ["Approval pending", "Invoice response", "Vendor onboarding", "Document review", "Dispute resolution"] as const;
  const ACTIONS = [["escalate", "Escalate to next tier"], ["remind", "Send a reminder"], ["reassign", "Reassign owner"]] as const;

  const add = () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { toast.error("Enter a positive SLA window in hours"); return; }
    setRows(prev => [...prev, { id: crypto.randomUUID(), stage, hours: h, thenWhat }]);
    pushActivity({ tool: "SLA Timers", kind: "create", message: `SLA ${h}h on "${stage}"` });
    toast.success("SLA timer configured");
  };

  const fmt = (h: number) => h < 24 ? `${h}h` : `${Math.round((h / 24) * 10) / 10}d`;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Timer size={14} className="text-[var(--color-primary)]" /> SLA-Timer Configuration</h3>
        <p className="text-xs text-[var(--color-muted)]">Set how long each stage may sit before action triggers. These windows are stored as policy — there is no live clock running them server-side yet.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Stage</label>
            <select value={stage} onChange={e => setStage(e.target.value)} className={INP}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Window (hours)</label>
            <input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="24" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">On breach</label>
            <select value={thenWhat} onChange={e => setThenWhat(e.target.value as SlaRow["thenWhat"])} className={INP}>
              {ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add SLA
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No SLA timers configured.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Stage", "Window", "On breach", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{r.stage}</td>
                  <td className="px-4 py-2.5 tabular-nums">{fmt(r.hours)}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">{ACTIONS.find(a => a[0] === r.thenWhat)?.[1]}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #16 Recurring-Journal Templates ────────────────────────────────────────────
type JournalTpl = { id: string; name: string; debit: string; credit: string; amount: number; cadence: "monthly" | "quarterly"; anchorDate: string };
function RecurringJournals() {
  const [tpls, setTpls] = useFeatureState<JournalTpl[]>("auto-journals", []);
  const [, pushActivity] = useActivity();
  const [name, setName] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<JournalTpl["cadence"]>("monthly");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().split("T")[0]);
  const today = new Date();

  const add = () => {
    const a = parseFloat(amount);
    if (!name.trim() || !debit.trim() || !credit.trim() || isNaN(a)) { toast.error("Name, debit, credit and amount are required"); return; }
    setTpls(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), debit: debit.trim(), credit: credit.trim(), amount: a, cadence, anchorDate: anchor }]);
    pushActivity({ tool: "Recurring Journals", kind: "create", message: `Journal "${name.trim()}" (${cadence})` });
    setName(""); setDebit(""); setCredit(""); setAmount("");
    toast.success("Recurring journal template saved");
  };

  const nextPost = (t: JournalTpl) => {
    const step = t.cadence === "monthly" ? 30 : 91;
    let d = parseISO(t.anchorDate), guard = 0;
    while (differenceInCalendarDays(d, today) < 0 && guard < 5000) { d = addDays(d, step); guard++; }
    return d;
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Repeat2 size={14} className="text-[var(--color-primary)]" /> Recurring-Journal Templates</h3>
        <p className="text-xs text-[var(--color-muted)]">Define repeating postings — depreciation, accruals, prepaid amortization. Next-post dates are computed; nothing is posted to your ledger without a backend job.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Template name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Office rent accrual" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debit account</label>
            <input value={debit} onChange={e => setDebit(e.target.value)} placeholder="e.g. Rent Expense" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Credit account</label>
            <input value={credit} onChange={e => setCredit(e.target.value)} placeholder="e.g. Accrued Liabilities" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence</label>
            <select value={cadence} onChange={e => setCadence(e.target.value as JournalTpl["cadence"])} className={INP}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First post</label>
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Save template
          </button>
        </div>
      </div>

      {tpls.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No recurring journals defined.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Template", "Entry", "Amount", "Next post", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {tpls.map(t => {
                const nr = nextPost(t);
                return (
                  <tr key={t.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{t.name} <span className="text-[var(--color-muted)] text-[10px] capitalize">· {t.cadence}</span></td>
                    <td className="px-4 py-2.5 text-[11px] text-[var(--color-muted)]">Dr {t.debit} → Cr {t.credit}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(t.amount)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{format(nr, "d MMM yyyy")}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setTpls(prev => prev.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #17 Document-Routing Rules ─────────────────────────────────────────────────
type RouteRule = { id: string; keyword: string; folder: string; ledger: string };
function DocumentRouting() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<RouteRule[]>("auto-routing", []);
  const [, pushActivity] = useActivity();
  const [keyword, setKeyword] = useState("");
  const [folder, setFolder] = useState("");
  const [ledger, setLedger] = useState("");

  const add = () => {
    if (!keyword.trim() || !folder.trim()) { toast.error("Enter a keyword and a destination folder"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), keyword: keyword.trim().toLowerCase(), folder: folder.trim(), ledger: ledger.trim() || "Unassigned" }]);
    pushActivity({ tool: "Document Routing", kind: "create", message: `Route "${keyword.trim()}" → ${folder.trim()}` });
    setKeyword(""); setFolder(""); setLedger("");
    toast.success("Routing rule added");
  };

  // Approximate "documents" by transactions whose counterparty/description matches the keyword.
  const matchCount = (r: RouteRule) =>
    store.transactions.filter(t => `${t.description} ${t.counterparty}`.toLowerCase().includes(r.keyword)).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FolderTree size={14} className="text-[var(--color-primary)]" /> Document-Routing Rules</h3>
        <p className="text-xs text-[var(--color-muted)]">Route incoming bills and receipts to a folder and ledger by a keyword in the vendor or description. Match counts are estimated from your live transactions; no files are moved here.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">If text contains</label>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. electricity" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Route to folder</label>
            <input value={folder} onChange={e => setFolder(e.target.value)} placeholder="e.g. Utilities" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Post to ledger</label>
            <input value={ledger} onChange={e => setLedger(e.target.value)} placeholder="e.g. Power & Fuel" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add route
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No routing rules defined.</p>
      ) : rules.map(r => (
        <div key={r.id} className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
          <p className="text-sm font-medium">"<span className="font-mono">{r.keyword}</span>" <ArrowRight size={11} className="inline text-[var(--color-muted)]" /> <span className="text-[var(--color-primary)]">{r.folder}</span> <span className="text-[var(--color-muted)] text-[11px]">· ledger {r.ledger}</span></p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-muted)]"><strong className="tabular-nums text-[var(--color-text)]">{matchCount(r)}</strong> live txn(s) match</span>
            <button onClick={() => { setRules(prev => prev.filter(x => x.id !== r.id)); pushActivity({ tool: "Document Routing", kind: "delete", message: `Route "${r.keyword}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── #18 Data-Validation Rules ──────────────────────────────────────────────────
type ValCheck = "missing-invoice-number" | "future-dated-invoice" | "uncategorized-large-txn" | "duplicate-invoice-amount" | "negative-amount-revenue";
function DataValidation() {
  const { store } = useApp();
  const [enabled, setEnabled] = useFeatureState<ValCheck[]>("auto-validation", []);
  const [, pushActivity] = useActivity();
  const today = new Date();

  const CHECKS: { id: ValCheck; label: string; desc: string; run: () => string[] }[] = useMemo(() => [
    {
      id: "missing-invoice-number", label: "Missing invoice number", desc: "Invoices with no invoice number assigned.",
      run: () => store.invoices.filter(i => !i.invoiceNumber?.trim()).map(i => `${i.customer} · ${formatCurrency(i.amount)}`),
    },
    {
      id: "future-dated-invoice", label: "Future-dated invoice", desc: "Invoice date is later than today.",
      run: () => store.invoices.filter(i => differenceInCalendarDays(parseISO(i.invoiceDate), today) > 0).map(i => `${i.customer} · dated ${i.invoiceDate}`),
    },
    {
      id: "uncategorized-large-txn", label: "Large transfer-category outflow", desc: "Outflows over ₹50,000 sitting in the generic 'transfer' category.",
      run: () => store.transactions.filter(t => t.category === "transfer" && t.amount < 0 && Math.abs(t.amount) > 50000).map(t => `${t.counterparty || t.description} · ${formatCurrency(Math.abs(t.amount))}`),
    },
    {
      id: "duplicate-invoice-amount", label: "Duplicate amount, same customer", desc: "Possible double-billing: same customer and amount on multiple invoices.",
      run: () => {
        const seen = new Map<string, number>();
        store.invoices.forEach(i => { const k = `${i.customer}|${i.amount}`; seen.set(k, (seen.get(k) ?? 0) + 1); });
        return [...seen.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k.split("|")[0]} · ${formatCurrency(Number(k.split("|")[1]))} ×${n}`);
      },
    },
    {
      id: "negative-amount-revenue", label: "Revenue posted as outflow", desc: "Revenue-category transactions with a negative amount.",
      run: () => store.transactions.filter(t => t.category === "revenue" && t.amount < 0).map(t => `${t.counterparty || t.description} · ${formatCurrency(t.amount)}`),
    },
  ], [store.invoices, store.transactions]);

  const toggle = (id: ValCheck) => {
    setEnabled(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const runAll = () => {
    const total = CHECKS.filter(c => enabled.includes(c.id)).reduce((s, c) => s + c.run().length, 0);
    pushActivity({ tool: "Data Validation", kind: "run", message: `Ran ${enabled.length} check(s) — ${total} issue(s) found` });
    toast.success(`${total} issue(s) across ${enabled.length} enabled check(s)`);
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ListChecks size={14} className="text-[var(--color-primary)]" /> Data-Validation Rules</h3>
          <p className="text-xs text-[var(--color-muted)] mt-1">Toggle integrity checks and run them against your live books. Findings are surfaced for review — nothing is auto-corrected.</p>
        </div>
        <button onClick={runAll} disabled={enabled.length === 0} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40">
          <Play size={13} /> Run enabled checks
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CHECKS.map(c => {
          const on = enabled.includes(c.id);
          const findings = on ? c.run() : [];
          return (
            <div key={c.id} className={`${CARD} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-relaxed">{c.desc}</p>
                </div>
                <button onClick={() => toggle(c.id)}
                  className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${on ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                  {on ? "Enabled" : "Off"}
                </button>
              </div>
              {on && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <p className={`text-xs font-semibold mb-1.5 ${findings.length ? "text-orange-400" : "text-green-400"}`}>{findings.length} issue(s)</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {findings.slice(0, 10).map((f, i) => <p key={i} className="text-[11px] text-[var(--color-muted)] truncate">{f}</p>)}
                    {findings.length > 10 && <p className="text-[10px] text-[var(--color-muted)]">+{findings.length - 10} more</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── #19 Scheduled-Report Config ────────────────────────────────────────────────
type ReportJob = { id: string; report: string; cadence: "daily" | "weekly" | "monthly"; channel: "email" | "whatsapp"; recipient: string; anchorDate: string };
function ScheduledReports() {
  const [jobs, setJobs] = useFeatureState<ReportJob[]>("auto-reports", []);
  const [, pushActivity] = useActivity();
  const [report, setReport] = useState("Cash position");
  const [cadence, setCadence] = useState<ReportJob["cadence"]>("weekly");
  const [channel, setChannel] = useState<ReportJob["channel"]>("email");
  const [recipient, setRecipient] = useState("");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().split("T")[0]);
  const REPORTS = ["Cash position", "P&L summary", "Receivables ageing", "GST liability", "Expense breakdown"] as const;
  const today = new Date();

  const add = () => {
    if (!recipient.trim()) { toast.error("Enter a recipient"); return; }
    setJobs(prev => [...prev, { id: crypto.randomUUID(), report, cadence, channel, recipient: recipient.trim(), anchorDate: anchor }]);
    pushActivity({ tool: "Scheduled Reports", kind: "create", message: `"${report}" (${cadence}) to ${recipient.trim()}` });
    setRecipient("");
    toast.success("Report schedule saved");
  };

  const nextRun = (j: ReportJob) => {
    const step = j.cadence === "daily" ? 1 : j.cadence === "weekly" ? 7 : 30;
    let d = parseISO(j.anchorDate), guard = 0;
    while (differenceInCalendarDays(d, today) < 0 && guard < 5000) { d = addDays(d, step); guard++; }
    return d;
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileBarChart size={14} className="text-[var(--color-primary)]" /> Scheduled-Report Delivery</h3>
        <p className="text-xs text-[var(--color-muted)]">Configure which report goes to whom, how often. Next-delivery dates are computed; actual compilation and sending require a backend scheduler (preview only).</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Report</label>
            <select value={report} onChange={e => setReport(e.target.value)} className={INP}>
              {REPORTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence</label>
            <select value={cadence} onChange={e => setCadence(e.target.value as ReportJob["cadence"])} className={INP}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First delivery</label>
            <input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as ReportJob["channel"])} className={INP}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Recipient</label>
            <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. owner@firm.in" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Schedule
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No report schedules configured.</p>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)]">
              <tr>{["Report", "Cadence", "To", "Next delivery", ""].map(h =>
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-medium">{j.report}</td>
                  <td className="px-4 py-2.5 capitalize text-[var(--color-muted)]">{j.cadence}</td>
                  <td className="px-4 py-2.5"><span className="capitalize text-[var(--color-muted)] text-[11px]">{j.channel}</span> · {j.recipient}</td>
                  <td className="px-4 py-2.5 tabular-nums">{format(nextRun(j), "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setJobs(prev => prev.filter(x => x.id !== j.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── #20 Conditional-Discount Rules ─────────────────────────────────────────────
type DiscountRule = { id: string; minAmount: number; percent: number; label: string };
function DiscountRules() {
  const { store } = useApp();
  const [rules, setRules] = useFeatureState<DiscountRule[]>("auto-discounts", []);
  const [, pushActivity] = useActivity();
  const [minAmount, setMinAmount] = useState("100000");
  const [percent, setPercent] = useState("5");
  const [label, setLabel] = useState("");

  const add = () => {
    const m = parseFloat(minAmount), p = parseFloat(percent);
    if (isNaN(m) || isNaN(p) || p <= 0) { toast.error("Enter a valid threshold and discount %"); return; }
    setRules(prev => [...prev, { id: crypto.randomUUID(), minAmount: m, percent: p, label: label.trim() || `${p}% above ${formatCurrency(m)}` }].sort((a, b) => a.minAmount - b.minAmount));
    pushActivity({ tool: "Discount Rules", kind: "create", message: `${p}% discount above ${formatCurrency(m)}` });
    setLabel("");
    toast.success("Discount rule added");
  };

  // For each invoice pick the highest-threshold rule it qualifies for; show total discount that would apply.
  const bestRule = (amount: number) => [...rules].reverse().find(r => amount >= r.minAmount);
  const preview = useMemo(() => {
    let totalDisc = 0, count = 0;
    store.invoices.forEach(inv => {
      const r = bestRule(inv.amount);
      if (r) { totalDisc += inv.amount * (r.percent / 100); count++; }
    });
    return { totalDisc, count };
  }, [store.invoices, rules]);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Conditional-Discount Rules</h3>
        <p className="text-xs text-[var(--color-muted)]">Define tiered discounts by invoice value. The preview applies each invoice's best-matching tier across your live AR — these are illustrative figures, not applied to any invoice.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice value ≥ (₹)</label>
            <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="100000" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount %</label>
            <input type="number" value={percent} onChange={e => setPercent(e.target.value)} placeholder="5" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Label (optional)</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Bulk order tier" className={INP} />
          </div>
          <button onClick={add} className="flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={13} /> Add tier
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No discount tiers defined.</p>
      ) : (
        <>
          <div className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
            <p className="text-sm font-medium">Applied across live AR</p>
            <p className="text-xs text-[var(--color-muted)]"><strong className="tabular-nums text-orange-400">{preview.count}</strong> invoice(s) qualify · est. discount <strong className="text-[var(--color-text)]">{formatCurrency(preview.totalDisc)}</strong></p>
          </div>
          {rules.map(r => (
            <div key={r.id} className={`${CARD} p-4 flex items-center justify-between gap-3 flex-wrap`}>
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{r.percent}% off when invoice ≥ {formatCurrency(r.minAmount)}</p>
              </div>
              <button onClick={() => { setRules(prev => prev.filter(x => x.id !== r.id)); pushActivity({ tool: "Discount Rules", kind: "delete", message: `Discount tier "${r.label}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── #21 Reminder-Cadence Templates ─────────────────────────────────────────────
type CadenceStep = { id: string; offsetDays: number; channel: "whatsapp" | "email" | "call"; note: string };
type Cadence = { id: string; name: string; steps: CadenceStep[] };
function ReminderCadences() {
  const { store } = useApp();
  const [cadences, setCadences] = useFeatureState<Cadence[]>("auto-cadences", []);
  const [, pushActivity] = useActivity();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<CadenceStep[]>([]);
  const [offset, setOffset] = useState("3");
  const [channel, setChannel] = useState<CadenceStep["channel"]>("whatsapp");
  const [note, setNote] = useState("");
  const today = new Date();

  const addStep = () => {
    const o = parseInt(offset);
    if (isNaN(o)) { toast.error("Enter an offset in days"); return; }
    setSteps(prev => [...prev, { id: crypto.randomUUID(), offsetDays: o, channel, note: note.trim() }].sort((a, b) => a.offsetDays - b.offsetDays));
    setNote("");
  };
  const save = () => {
    if (!name.trim() || steps.length === 0) { toast.error("Name and at least one step required"); return; }
    setCadences(prev => [...prev, { id: crypto.randomUUID(), name: name.trim(), steps }]);
    pushActivity({ tool: "Reminder Cadences", kind: "create", message: `Cadence "${name.trim()}" (${steps.length} step)` });
    setName(""); setSteps([]);
    toast.success("Reminder cadence saved");
  };

  // How many open invoices this cadence would currently touch (any unpaid invoice).
  const openInvoices = store.invoices.filter(i => i.status !== "paid").length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 space-y-3`}>
        <h3 className="text-sm font-semibold flex items-center gap-2"><Send size={14} className="text-[var(--color-primary)]" /> Reminder-Cadence Templates</h3>
        <p className="text-xs text-[var(--color-muted)]">Build a multi-touch dunning cadence (offset measured in days from the due date). Saved cadences would apply to your {openInvoices} open invoice(s) — sending requires a backend scheduler (preview only).</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cadence name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard dunning" className={INP} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Offset from due (days)</label>
            <input type="number" value={offset} onChange={e => setOffset(e.target.value)} placeholder="3" className={INP} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as CadenceStep["channel"])} className={INP}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="call">Call task</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Polite first nudge" className={INP} />
          </div>
          <button onClick={addStep} className="flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm font-medium hover:border-[var(--color-primary)]">
            <Plus size={13} /> Add step
          </button>
        </div>
        {steps.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span className="text-[11px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5">
                  {s.offsetDays >= 0 ? "+" : ""}{s.offsetDays}d · <span className="capitalize">{s.channel}</span>{s.note && <span className="text-[var(--color-muted)]"> — {s.note}</span>}
                  <button onClick={() => setSteps(prev => prev.filter(x => x.id !== s.id))} className="ml-1.5 text-[var(--color-muted)] hover:text-red-400">✕</button>
                </span>
                {i < steps.length - 1 && <ArrowRight size={11} className="text-[var(--color-muted)]" />}
              </div>
            ))}
          </div>
        )}
        <button onClick={save} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] rounded-lg px-3 py-2 text-sm font-medium w-fit">
          <CheckCircle2 size={13} /> Save cadence
        </button>
      </div>

      {cadences.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)] px-1">No reminder cadences defined.</p>
      ) : cadences.map(c => {
        // Illustrate the cadence against the nearest-due open invoice.
        const sample = store.invoices.filter(i => i.status !== "paid").sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime())[0];
        return (
          <div key={c.id} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{c.steps.length} touch(es) · {c.steps.map(s => `${s.offsetDays >= 0 ? "+" : ""}${s.offsetDays}d`).join(", ")}</p>
              </div>
              <button onClick={() => { setCadences(prev => prev.filter(x => x.id !== c.id)); pushActivity({ tool: "Reminder Cadences", kind: "delete", message: `Cadence "${c.name}" removed` }); }} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
            {sample && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                <p className="text-[11px] text-[var(--color-muted)] mb-2">Applied to nearest-due open invoice: <strong className="text-[var(--color-text)]">{sample.customer}</strong> (due {sample.dueDate})</p>
                <div className="space-y-1.5">
                  {c.steps.map(s => {
                    const fd = addDays(parseISO(sample.dueDate), s.offsetDays);
                    const days = differenceInCalendarDays(fd, today);
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                        <span className="capitalize">{s.channel}{s.note && <span className="text-[var(--color-muted)]"> — {s.note}</span>}</span>
                        <span className="text-[var(--color-muted)] tabular-nums shrink-0">{format(fd, "d MMM")} ({days < 0 ? "past" : days === 0 ? "today" : `in ${days}d`})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
