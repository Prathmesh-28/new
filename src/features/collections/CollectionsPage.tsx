import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  PhoneCall, MessageSquare, AlertTriangle, CheckCircle2, Clock, Filter,
  Send, ChevronDown, TrendingDown, ArrowUpRight, Zap, MailOpen, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Aging = "current" | "1-30" | "31-60" | "61-90" | "90+";

function getAging(dueDateStr: string): Aging {
  const days = differenceInDays(new Date(), parseISO(dueDateStr));
  if (days < 0)  return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const AGING_STYLE: Record<Aging, { label: string; badge: string; row: string }> = {
  "current": { label: "Current",  badge: "bg-[var(--color-accent)] text-[var(--color-muted)]",    row: "" },
  "1-30":    { label: "1–30d",    badge: "bg-yellow-950/40 text-yellow-400 border border-yellow-800/30", row: "bg-yellow-950/5" },
  "31-60":   { label: "31–60d",   badge: "bg-orange-950/40 text-orange-400 border border-orange-800/30", row: "bg-orange-950/5" },
  "61-90":   { label: "61–90d",   badge: "bg-red-950/40 text-red-400 border border-red-800/30",          row: "bg-red-950/5" },
  "90+":     { label: "90d+",     badge: "bg-red-950/60 text-red-300 border border-red-700/40",           row: "bg-red-950/10" },
};

const REMINDER_TEMPLATES = [
  { id: "soft",   label: "Friendly nudge",   text: (name: string, amt: string, days: number) => `Hi, just a gentle reminder that your invoice of ${amt} was due ${days} days ago. Please let us know if you need any details. Thanks!` },
  { id: "firm",   label: "Firm reminder",    text: (name: string, amt: string, days: number) => `Dear ${name}, your payment of ${amt} is now ${days} days overdue. Kindly clear this at your earliest to avoid service disruption.` },
  { id: "final",  label: "Final notice",     text: (name: string, amt: string, days: number) => `FINAL NOTICE: ${name}, your outstanding payment of ${amt} (${days} days overdue) has not been received. Legal action will be initiated if not cleared within 7 days.` },
];

function ReminderModal({
  name, amount, days, onClose,
}: { name: string; amount: number; days: number; onClose: () => void }) {
  const [selected, setSelected] = useState("soft");
  const [channel, setChannel]   = useState<"whatsapp" | "email" | "sms">("whatsapp");

  const template = REMINDER_TEMPLATES.find(t => t.id === selected)!;
  const text = template.text(name, formatCurrency(amount), days);

  const send = () => {
    toast.success(`Reminder sent to ${name} via ${channel}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-base font-bold mb-4">Send payment reminder</h2>

        {/* Channel */}
        <div className="flex gap-2 mb-4">
          {(["whatsapp", "email", "sms"] as const).map(c => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all capitalize ${
                channel === c
                  ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent"
                  : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {c === "whatsapp" ? "📱 WhatsApp" : c === "email" ? "📧 Email" : "💬 SMS"}
            </button>
          ))}
        </div>

        {/* Template select */}
        <div className="flex gap-2 mb-3">
          {REMINDER_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                selected === t.id
                  ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30"
                  : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 mb-4">
          <p className="text-xs text-[var(--color-text)] leading-relaxed">{text}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={send}
            className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 flex items-center justify-center gap-1.5"
          >
            <Send size={13} /> Send now
          </button>
          <button
            onClick={onClose}
            className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  const { store } = useApp();

  const [filter, setFilter]       = useState<Aging | "all">("all");
  const [reminder, setReminder]   = useState<{ name: string; amount: number; days: number } | null>(null);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().split("T")[0];

  const receivables = useMemo(() => {
    return store.invoices
      .filter(inv => inv.status !== "paid")
      .map(inv => ({
        id: inv.id,
        clientName: inv.customer,
        amount: inv.amount,
        dueDate: inv.dueDate,
        status: inv.status,
        aging: getAging(inv.dueDate),
        daysOverdue: Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate))),
      }));
  }, [store]);

  // If no invoices in store, show mock data
  const displayData = receivables.length > 0 ? receivables : [
    { id: "r1", clientName: "Mehta Corp",          amount: 320000, dueDate: "2026-05-26", status: "pending", aging: "1-30"  as Aging, daysOverdue: 18 },
    { id: "r2", clientName: "Reddy Industries",    amount: 185000, dueDate: "2026-05-10", status: "pending", aging: "31-60" as Aging, daysOverdue: 34 },
    { id: "r3", clientName: "Sharma Textiles",     amount: 92000,  dueDate: "2026-04-15", status: "pending", aging: "61-90" as Aging, daysOverdue: 59 },
    { id: "r4", clientName: "Kapoor Electronics",  amount: 445000, dueDate: "2026-03-20", status: "pending", aging: "90+"   as Aging, daysOverdue: 85 },
    { id: "r5", clientName: "Gupta Traders",       amount: 67000,  dueDate: "2026-06-20", status: "pending", aging: "current" as Aging, daysOverdue: 0 },
    { id: "r6", clientName: "Singh Distributors",  amount: 230000, dueDate: "2026-06-05", status: "pending", aging: "1-30"  as Aging, daysOverdue: 8 },
  ];

  const filtered = filter === "all" ? displayData : displayData.filter(r => r.aging === filter);
  const sorted   = [...filtered].sort((a, b) => b.daysOverdue - a.daysOverdue);

  const totalOverdue = displayData.filter(r => r.aging !== "current").reduce((s, r) => s + r.amount, 0);
  const critical     = displayData.filter(r => r.aging === "90+" || r.aging === "61-90");
  const avgDays      = displayData.length > 0
    ? Math.round(displayData.reduce((s, r) => s + r.daysOverdue, 0) / displayData.length)
    : 0;

  const agingSummary: Record<Aging, { count: number; amount: number }> = {
    "current": { count: 0, amount: 0 },
    "1-30":    { count: 0, amount: 0 },
    "31-60":   { count: 0, amount: 0 },
    "61-90":   { count: 0, amount: 0 },
    "90+":     { count: 0, amount: 0 },
  };
  displayData.forEach(r => {
    agingSummary[r.aging].count++;
    agingSummary[r.aging].amount += r.amount;
  });

  const markContacted = (id: string) => {
    setContacted(s => new Set([...s, id]));
    toast.success("Marked as contacted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PhoneCall size={20} className="text-[var(--color-primary)]" />
            Collections
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Active AR chase — send reminders, track follow-ups, close overdue faster.
          </p>
        </div>
        <button className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors">
          <RefreshCw size={12} /> Sync invoices
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total overdue",    value: formatCurrency(totalOverdue), icon: TrendingDown,  color: "text-red-400" },
          { label: "Accounts overdue", value: displayData.filter(r => r.aging !== "current").length.toString(), icon: AlertTriangle, color: "text-orange-400" },
          { label: "Avg days overdue", value: `${avgDays}d`,               icon: Clock,          color: "text-yellow-400" },
          { label: "Critical (60d+)",  value: formatCurrency(critical.reduce((s, r) => s + r.amount, 0)), icon: Zap, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)] font-medium">{label}</p>
              <Icon size={13} className={color} />
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Aging buckets */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">Aging summary</h2>
        <div className="grid grid-cols-5 gap-2">
          {(["current", "1-30", "31-60", "61-90", "90+"] as Aging[]).map(age => {
            const { count, amount } = agingSummary[age];
            const style = AGING_STYLE[age];
            const maxAmt = Math.max(...Object.values(agingSummary).map(v => v.amount), 1);
            const pct = (amount / maxAmt) * 100;
            return (
              <button
                key={age}
                onClick={() => setFilter(filter === age ? "all" : age)}
                className={`p-3 rounded-lg border transition-all text-left ${
                  filter === age
                    ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/30"
                }`}
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>{style.label}</span>
                <p className="text-sm font-bold mt-2 tabular-nums">{count}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{formatCurrency(amount)}</p>
                <div className="mt-2 h-1 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">
            {filter === "all" ? "All outstanding" : `${AGING_STYLE[filter].label} overdue`}
            <span className="ml-2 text-xs text-[var(--color-muted)]">{sorted.length} accounts</span>
          </h2>
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[var(--color-muted)]" />
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as Aging | "all")}
              className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 outline-none"
            >
              <option value="all">All aging</option>
              <option value="current">Current</option>
              <option value="1-30">1–30 days</option>
              <option value="31-60">31–60 days</option>
              <option value="61-90">61–90 days</option>
              <option value="90+">90+ days</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-border)]">
          {sorted.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400 opacity-50" />
              <p className="text-sm text-[var(--color-muted)]">No outstanding receivables in this bucket</p>
            </div>
          )}
          {sorted.map(row => {
            const style  = AGING_STYLE[row.aging];
            const isContacted = contacted.has(row.id);
            return (
              <div key={row.id} className={`px-4 py-3 hover:bg-white/2 transition-colors ${style.row}`}>
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{row.clientName}</p>
                      {isContacted && (
                        <span className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-800/30 px-1.5 py-0.5 rounded-full font-medium shrink-0">contacted</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">
                      Due {format(parseISO(row.dueDate), "d MMM yyyy")}
                      {row.daysOverdue > 0 && ` · ${row.daysOverdue}d overdue`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">{formatCurrency(row.amount)}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>{style.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setReminder({ name: row.clientName, amount: row.amount, days: row.daysOverdue })}
                      className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40 transition-colors font-medium"
                    >
                      <MessageSquare size={11} /> Remind
                    </button>
                    {!isContacted && (
                      <button
                        onClick={() => markContacted(row.id)}
                        className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg hover:border-green-700/40 transition-colors text-[var(--color-muted)]"
                      >
                        <CheckCircle2 size={11} /> Mark contacted
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tip */}
      {critical.length > 0 && (
        <div className="bg-orange-950/20 border border-orange-800/30 rounded-lg px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              {formatCurrency(critical.reduce((s, r) => s + r.amount, 0))} has been overdue for 60+ days
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Recoveries beyond 90 days drop to under 40%. Send final notices now for {critical.filter(r => r.aging === "90+").length} account(s).
            </p>
          </div>
        </div>
      )}

      {reminder && (
        <ReminderModal
          name={reminder.name}
          amount={reminder.amount}
          days={reminder.days}
          onClose={() => setReminder(null)}
        />
      )}
    </div>
  );
}
