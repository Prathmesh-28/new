import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";
import { differenceInDays, format, parseISO, addDays } from "date-fns";
import {
  PhoneCall, MessageSquare, AlertTriangle, CheckCircle2, Clock, Filter,
  Send, TrendingDown, ArrowUpRight, Zap, RefreshCw, BarChart2, Star, FileText, Copy,
  Layers, LineChart, HandCoins, Users, Scissors, Plus, Trash2, Mail,
  Gauge, ShieldAlert, CalendarClock, Percent, TrendingUp, ListChecks, Tag, Gavel,
  Activity, PieChart, Trophy, History, FlaskConical, Save,
  Printer, Banknote, IndianRupee, UserCheck,
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
  name, amount, days, onClose, onSent,
}: { name: string; amount: number; days: number; onClose: () => void; onSent: () => void }) {
  const [selected, setSelected] = useState("soft");
  const [channel, setChannel]   = useState<"whatsapp" | "email" | "sms">("whatsapp");

  const template = REMINDER_TEMPLATES.find(t => t.id === selected)!;
  const text = template.text(name, formatCurrency(amount), days);

  // Open the message in the user's own WhatsApp / email / SMS, prefilled. This
  // genuinely sends (the user picks the recipient + hits send) without claiming
  // the server delivered it — honest and works on web + mobile.
  const send = () => {
    const msg = encodeURIComponent(text);
    if (channel === "whatsapp")  window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank", "noopener");
    else if (channel === "email") window.location.href = `mailto:?subject=${encodeURIComponent(`Payment reminder — ${formatCurrency(amount)} overdue`)}&body=${msg}`;
    else                          window.location.href = `sms:?&body=${msg}`;
    toast.success(`Reminder for ${name} opened in ${channel === "whatsapp" ? "WhatsApp" : channel}`);
    onSent();
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

  const [view, setView]           = useState<"collections" | "profitability" | "clv" | "score" | "statement" | "dunning" | "dso" | "promise" | "agents" | "settlement" | "cei" | "provision" | "plan" | "interest" | "forecast" | "worklist" | "discount" | "legal" | "kpi" | "dispute" | "concentration" | "defaulters" | "behavior" | "abtest" | "letters" | "interestinv" | "nach" | "byrep">("collections");
  const [filter, setFilter]       = useState<Aging | "all">("all");
  const [reminder, setReminder]   = useState<{ id: string; name: string; amount: number; days: number } | null>(null);
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

  // Honest: only real outstanding receivables derived from the tenant's invoices.
  const displayData = receivables;

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

  // Customer profitability: all invoices grouped by customer
  const customerProfitability = useMemo(() => {
    const map: Record<string, { totalInvoiced: number; totalPaid: number; invoiceCount: number; paidCount: number; totalDaysToCollect: number; overdueAmount: number }> = {};
    store.invoices.forEach(inv => {
      if (!map[inv.customer]) map[inv.customer] = { totalInvoiced: 0, totalPaid: 0, invoiceCount: 0, paidCount: 0, totalDaysToCollect: 0, overdueAmount: 0 };
      const c = map[inv.customer];
      c.totalInvoiced += inv.amount;
      c.invoiceCount++;
      if (inv.status === "paid") {
        c.totalPaid += inv.amount;
        c.paidCount++;
        const dueDate = parseISO(inv.dueDate);
        const daysTaken = differenceInDays(new Date(), dueDate);
        c.totalDaysToCollect += Math.max(0, daysTaken);
      } else {
        const overdueDays = Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate)));
        if (overdueDays > 0) c.overdueAmount += inv.amount;
      }
    });
    return Object.entries(map)
      .map(([customer, d]) => ({
        customer,
        totalInvoiced: d.totalInvoiced,
        totalPaid: d.totalPaid,
        invoiceCount: d.invoiceCount,
        collectionRate: d.invoiceCount > 0 ? Math.round((d.paidCount / d.invoiceCount) * 100) : 0,
        avgDaysToCollect: d.paidCount > 0 ? Math.round(d.totalDaysToCollect / d.paidCount) : 0,
        overdueAmount: d.overdueAmount,
        score: Math.round((d.paidCount / Math.max(d.invoiceCount, 1)) * 100 - (d.totalDaysToCollect / Math.max(d.paidCount, 1)) * 0.5),
      }))
      .sort((a, b) => b.totalInvoiced - a.totalInvoiced);
  }, [store.invoices]);

  const markContacted = (id: string) => {
    setContacted(s => new Set([...s, id]));
    toast.success("Marked as contacted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <PhoneCall size={20} className="text-[var(--color-primary)]" />
            Collections
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Active AR chase — send reminders, track follow-ups, close overdue faster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
            {([
              { id: "collections",   label: "Collections",   icon: <PhoneCall size={10} /> },
              { id: "profitability", label: "Profitability",  icon: <BarChart2 size={10} /> },
              { id: "clv",           label: "CLV",            icon: <Star size={10} /> },
              { id: "score",         label: "Risk Score",     icon: <AlertTriangle size={10} /> },
              { id: "statement",     label: "Statement",      icon: <FileText size={10} /> },
              { id: "dunning",       label: "Dunning",        icon: <Layers size={10} /> },
              { id: "dso",           label: "DSO Trend",      icon: <LineChart size={10} /> },
              { id: "promise",       label: "Promise-to-Pay", icon: <HandCoins size={10} /> },
              { id: "agents",        label: "Agents",         icon: <Users size={10} /> },
              { id: "settlement",    label: "Settlement",     icon: <Scissors size={10} /> },
              { id: "cei",           label: "CEI",            icon: <Gauge size={10} /> },
              { id: "provision",     label: "Bad-Debt",       icon: <ShieldAlert size={10} /> },
              { id: "plan",          label: "Payment Plan",   icon: <CalendarClock size={10} /> },
              { id: "interest",      label: "Late Interest",  icon: <Percent size={10} /> },
              { id: "forecast",      label: "Forecast",       icon: <TrendingUp size={10} /> },
              { id: "worklist",      label: "Worklist",       icon: <ListChecks size={10} /> },
              { id: "discount",      label: "Early-Pay",      icon: <Tag size={10} /> },
              { id: "legal",         label: "Legal Notice",   icon: <Gavel size={10} /> },
              { id: "kpi",           label: "KPI Board",      icon: <Activity size={10} /> },
              { id: "dispute",       label: "Disputes",       icon: <ShieldAlert size={10} /> },
              { id: "concentration", label: "Concentration",  icon: <PieChart size={10} /> },
              { id: "defaulters",    label: "Defaulters",     icon: <Trophy size={10} /> },
              { id: "behavior",      label: "Behavior",       icon: <History size={10} /> },
              { id: "abtest",        label: "A/B Templates",  icon: <FlaskConical size={10} /> },
              { id: "letters",       label: "Letter Series",  icon: <Printer size={10} /> },
              { id: "interestinv",   label: "Interest Invoice", icon: <IndianRupee size={10} /> },
              { id: "nach",          label: "NACH Mandates",  icon: <Banknote size={10} /> },
              { id: "byrep",         label: "Ageing by Rep",  icon: <UserCheck size={10} /> },
            ] as const).map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium transition-colors ${view === v.id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <Link to="/invoices" className="flex items-center gap-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg font-medium hover:border-[var(--color-primary)]/40 transition-colors">
            <RefreshCw size={12} /> Invoices
          </Link>
        </div>
      </div>

      {view === "profitability" && (
        <div className="space-y-4">
          {customerProfitability.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <BarChart2 size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <p className="text-sm text-[var(--color-muted)]">Create invoices to see per-customer profitability metrics.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Customers", value: customerProfitability.length.toString(), color: "text-[var(--color-primary)]" },
                  { label: "Total Invoiced",  value: formatCurrency(customerProfitability.reduce((s, c) => s + c.totalInvoiced, 0)), color: "text-blue-400" },
                  { label: "Total Collected", value: formatCurrency(customerProfitability.reduce((s, c) => s + c.totalPaid, 0)), color: "text-green-400" },
                  { label: "Still Overdue",   value: formatCurrency(customerProfitability.reduce((s, c) => s + c.overdueAmount, 0)), color: "text-red-400" },
                ].map(c => (
                  <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                    <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                    <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
                  <Star size={13} className="text-[var(--color-primary)]" />
                  <span className="text-sm font-semibold">Customer Profitability</span>
                  <span className="text-xs text-[var(--color-muted)] ml-auto">Sorted by invoice value</span>
                </div>
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Customer","Total Invoiced","Collected","Collection Rate","Avg Days to Pay","Overdue","Score"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customerProfitability.map(c => (
                      <tr key={c.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                        <td className="px-4 py-3 font-semibold">{c.customer}</td>
                        <td className="px-4 py-3 tabular-nums">{formatCurrency(c.totalInvoiced)}</td>
                        <td className="px-4 py-3 tabular-nums text-green-400">{formatCurrency(c.totalPaid)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden w-16">
                              <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${c.collectionRate}%` }} />
                            </div>
                            <span className="tabular-nums text-xs font-semibold">{c.collectionRate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{c.avgDaysToCollect > 0 ? `${c.avgDaysToCollect}d` : "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-red-400">{c.overdueAmount > 0 ? formatCurrency(c.overdueAmount) : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.score >= 80 ? "bg-green-950/30 text-green-400" : c.score >= 50 ? "bg-yellow-950/30 text-yellow-400" : "bg-red-950/30 text-red-400"}`}>
                            {c.score >= 80 ? "A" : c.score >= 50 ? "B" : "C"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[var(--color-muted)]">Score A = high collection rate + fast payment · B = moderate · C = slow payer or high overdue risk</p>
            </>
          )}
        </div>
      )}

      {view === "collections" && <>
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
          {sorted.length === 0 && displayData.length === 0 && (
            <EmptyState
              icon={PhoneCall}
              title="No outstanding receivables"
              description="When customers owe you money, overdue invoices appear here so you can chase them. Create your first invoice to start tracking collections."
              ctaText="Create an invoice"
              ctaHref="/invoices"
            />
          )}
          {sorted.length === 0 && displayData.length > 0 && (
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
                      onClick={() => setReminder({ id: row.id, name: row.clientName, amount: row.amount, days: row.daysOverdue })}
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
          onSent={() => markContacted(reminder.id)}
        />
      )}
      </>}

      {view === "clv" && <ClvCalculator />}
      {view === "score" && <LatePaymentScorer />}
      {view === "statement" && <CustomerStatement />}
      {view === "dunning" && <DunningSequence />}
      {view === "dso" && <DsoTrend />}
      {view === "promise" && <PromiseToPay />}
      {view === "agents" && <AgentAssignment />}
      {view === "settlement" && <SettlementWorkflow />}
      {view === "cei" && <CollectionEffectiveness />}
      {view === "provision" && <BadDebtProvision />}
      {view === "plan" && <PaymentPlanBuilder />}
      {view === "interest" && <LateInterestCalculator />}
      {view === "forecast" && <CollectionForecast />}
      {view === "worklist" && <PriorityWorklist />}
      {view === "discount" && <EarlyPayDiscount />}
      {view === "legal" && <LegalNoticeDrafter />}
      {view === "kpi" && <CollectionsKpiBoard />}
      {view === "dispute" && <DisputeLogger />}
      {view === "concentration" && <ConcentrationRisk />}
      {view === "defaulters" && <TopDefaulters />}
      {view === "behavior" && <PaymentBehavior />}
      {view === "abtest" && <ReminderAbTester />}
      {view === "letters" && <CollectionLetterSeries />}
      {view === "interestinv" && <InterestInvoiceGenerator />}
      {view === "nach" && <NachMandateTracker />}
      {view === "byrep" && <AgeingBySalesperson />}
    </div>
  );
}

function ClvCalculator() {
  const { store } = useApp();
  const [marginPct, setMarginPct] = useState(25);
  const [lifespanYrs, setLifespanYrs] = useState(3);

  const customerData = useMemo(() => {
    const inv = store.invoices ?? [];
    const map: Record<string, { total: number; count: number; dates: number[] }> = {};
    for (const i of inv) {
      const name = i.customer ?? "Unknown";
      if (!map[name]) map[name] = { total: 0, count: 0, dates: [] };
      map[name].total += Number(i.amount ?? 0);
      map[name].count += 1;
      if (i.invoiceDate) map[name].dates.push(new Date(i.invoiceDate).getTime());
    }
    return Object.entries(map).map(([customer, d]) => {
      const aov = d.count > 0 ? d.total / d.count : 0;
      const dates = d.dates.sort((a, b) => a - b);
      let avgFreqDays = 30;
      if (dates.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / 86400000);
        avgFreqDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }
      const ordersPerYear = avgFreqDays > 0 ? 365 / avgFreqDays : 12;
      const clv = aov * ordersPerYear * lifespanYrs * (marginPct / 100);
      return { customer, aov, ordersPerYear: Math.round(ordersPerYear * 10) / 10, total: d.total, count: d.count, clv };
    }).sort((a, b) => b.clv - a.clv);
  }, [store.invoices, marginPct, lifespanYrs]);

  const topClv = customerData.reduce((s, c) => s + c.clv, 0);
  const top20Clv = customerData.slice(0, Math.max(1, Math.ceil(customerData.length * 0.2))).reduce((s, c) => s + c.clv, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Gross Margin %</label>
            <div className="flex items-center gap-2">
              <input type="range" min={5} max={80} value={marginPct} onChange={e => setMarginPct(Number(e.target.value))}
                className="w-28 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-8 tabular-nums">{marginPct}%</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer Lifespan (years)</label>
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={10} value={lifespanYrs} onChange={e => setLifespanYrs(Number(e.target.value))}
                className="w-28 accent-[var(--color-primary)]" />
              <span className="text-sm font-bold w-4 tabular-nums">{lifespanYrs}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total Customers", value: customerData.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Projected CLV", value: formatCurrency(topClv), color: "text-green-400" },
          { label: "Top 20% CLV Share", value: topClv > 0 ? `${Math.round((top20Clv / topClv) * 100)}%` : "—", color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {customerData.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Star size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add invoices to calculate customer lifetime value.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <Star size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Customer Lifetime Value</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">CLV = AOV × Orders/yr × Lifespan × Margin</span>
          </div>
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer","Invoices","Avg Order Value","Orders/Year","Projected CLV","Tier"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customerData.map((c, i) => {
                const maxClv = customerData[0]?.clv ?? 1;
                const pct = maxClv > 0 ? (c.clv / maxClv) * 100 : 0;
                const tier = i < Math.ceil(customerData.length * 0.2) ? { label: "Platinum", cls: "bg-purple-950/30 text-purple-400" }
                           : i < Math.ceil(customerData.length * 0.5) ? { label: "Gold",     cls: "bg-yellow-950/30 text-yellow-400" }
                           : { label: "Standard", cls: "bg-[var(--color-accent)] text-[var(--color-muted)]" };
                return (
                  <tr key={c.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-semibold">{c.customer}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{c.count}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(c.aov)}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{c.ordersPerYear}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden w-20">
                          <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular-nums text-xs font-semibold">{formatCurrency(c.clv)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.cls}`}>{tier.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Platinum = top 20% by CLV · CLV formula: AOV × purchase frequency × lifespan × margin · Adjust sliders to model scenarios</p>
    </div>
  );
}

function LatePaymentScorer() {
  const { store } = useApp();

  const scored = useMemo(() => {
    const inv = store.invoices ?? [];
    const map: Record<string, { total: number; overdue: number; paid: number; avgDaysLate: number[]; lastPaid: number }> = {};

    for (const i of inv) {
      const name = i.customer ?? "Unknown";
      if (!map[name]) map[name] = { total: 0, overdue: 0, paid: 0, avgDaysLate: [], lastPaid: 0 };
      map[name].total += 1;
      if (i.status === "overdue") map[name].overdue += 1;
      if (i.status === "paid") {
        map[name].paid += 1;
        const due = new Date(i.dueDate).getTime();
        const now = Date.now();
        const late = Math.max(0, Math.round((now - due) / 86400000));
        map[name].avgDaysLate.push(late);
        map[name].lastPaid = Math.max(map[name].lastPaid, new Date(i.invoiceDate).getTime());
      }
    }

    return Object.entries(map).map(([customer, d]) => {
      const overdueRate  = d.total > 0 ? d.overdue / d.total : 0;
      const avgLate      = d.avgDaysLate.length > 0 ? d.avgDaysLate.reduce((a, b) => a + b, 0) / d.avgDaysLate.length : 0;
      const recency      = d.lastPaid > 0 ? Math.min(1, (Date.now() - d.lastPaid) / (365 * 86400000)) : 1;

      // Score 0–100: lower = safer
      const riskScore = Math.round(
        overdueRate * 40 +            // overdue frequency weight 40
        Math.min(avgLate / 90, 1) * 35 + // avg days late weight 35
        recency * 25                  // recency weight 25
      );

      const risk = riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";
      return { customer, total: d.total, overdueRate: Math.round(overdueRate * 100), avgLate: Math.round(avgLate), riskScore, risk };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [store.invoices]);

  const high   = scored.filter(s => s.risk === "High").length;
  const medium = scored.filter(s => s.risk === "Medium").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "High Risk",   value: high.toString(),              color: "text-red-400" },
          { label: "Medium Risk", value: medium.toString(),            color: "text-yellow-400" },
          { label: "Low Risk",    value: (scored.length - high - medium).toString(), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {scored.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <AlertTriangle size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add invoices to calculate late payment risk scores.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <AlertTriangle size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Late Payment Risk Scores</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">Higher score = higher risk</span>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer","Invoices","Overdue Rate","Avg Days Late","Risk Score","Risk"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scored.map(s => {
                const barPct = s.riskScore;
                const riskCls = s.risk === "High" ? "bg-red-950/30 text-red-400" : s.risk === "Medium" ? "bg-yellow-950/30 text-yellow-400" : "bg-green-950/30 text-green-400";
                const barColor = s.risk === "High" ? "bg-red-500" : s.risk === "Medium" ? "bg-yellow-500" : "bg-green-500";
                return (
                  <tr key={s.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-semibold">{s.customer}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{s.total}</td>
                    <td className="px-4 py-3 tabular-nums">{s.overdueRate}%</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{s.avgLate > 0 ? `${s.avgLate}d` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden w-20">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
                        </div>
                        <span className="tabular-nums text-xs font-semibold w-6">{s.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${riskCls}`}>{s.risk}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Score = 40% overdue frequency + 35% avg days late + 25% recency penalty · High ≥65 · Medium ≥35 · Low &lt;35 · Use to prioritise follow-up</p>
    </div>
  );
}

function CustomerStatement() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const customers = Array.from(new Set(invoices.map(i => i.customer).filter(Boolean)));
  const [selected, setSelected] = useState(customers[0] ?? "");
  const [copied, setCopied] = useState(false);

  const custInvoices = invoices.filter(i => i.customer === selected);

  type Entry = { date: string; particulars: string; debit: number; credit: number };
  const entries: Entry[] = [];
  for (const inv of custInvoices) {
    entries.push({ date: inv.invoiceDate, particulars: `Invoice ${inv.invoiceNumber || inv.id.slice(0, 6)}`, debit: inv.amount, credit: 0 });
    if (inv.status === "paid") {
      entries.push({ date: inv.dueDate || inv.invoiceDate, particulars: `Payment received — ${inv.invoiceNumber || inv.id.slice(0, 6)}`, debit: 0, credit: inv.amount });
    }
  }
  entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let running = 0;
  const ledger = entries.map(e => { running += e.debit - e.credit; return { ...e, balance: running }; });

  const totalInvoiced = custInvoices.reduce((s, i) => s + i.amount, 0);
  const totalReceived = custInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = custInvoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const overdue = custInvoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const firmName = store.firm?.name ?? "Your Company";
  const fc = formatCurrency;
  const stmtDate = format(new Date(), "dd MMM yyyy");

  const copyStatement = () => {
    const lines = [
      `STATEMENT OF ACCOUNT`,
      `${firmName}`,
      `Customer: ${selected}`,
      `As on: ${stmtDate}`,
      ``,
      `Date        Particulars                         Debit        Credit       Balance`,
      ...ledger.map(e => `${(e.date || "").padEnd(11)} ${e.particulars.slice(0, 35).padEnd(35)} ${String(e.debit || "").padStart(11)} ${String(e.credit || "").padStart(11)} ${String(e.balance).padStart(11)}`),
      ``,
      `Outstanding Balance: ${fc(outstanding)}`,
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (customers.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to generate customer account statements.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] min-w-[200px]">
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm font-bold">{firmName}</p>
          <p className="text-xs text-[var(--color-muted)]">Statement as on {stmtDate}</p>
        </div>
        <button onClick={copyStatement} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Copy size={11} /> {copied ? "Copied!" : "Copy statement"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Invoiced", value: fc(totalInvoiced), color: "text-[var(--color-primary)]" },
          { label: "Total Received", value: fc(totalReceived), color: "text-green-400" },
          { label: "Outstanding",    value: fc(outstanding),   color: outstanding > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Overdue",        value: fc(overdue),       color: overdue > 0 ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Account Statement — {selected}</span>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Date", "Particulars", "Debit", "Credit", "Balance"].map(h => (
                <th key={h} className={`text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5 ${h === "Particulars" || h === "Date" ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledger.map((e, i) => (
              <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-2.5 text-[var(--color-muted)]">{e.date || "—"}</td>
                <td className="px-4 py-2.5">{e.particulars}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{e.debit ? fc(e.debit) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{e.credit ? fc(e.credit) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fc(e.balance)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)] font-bold">
              <td className="px-4 py-2.5" colSpan={4}>Closing Balance (Outstanding)</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fc(outstanding)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Simplified statement derived from invoice records (invoice = debit, payment = credit). For a GST-compliant statement of account, include actual payment dates, TDS adjustments and credit/debit notes.</p>
    </div>
  );
}

// ── #50 DUNNING SEQUENCE AUTOMATION ─────────────────────────────────────────
// Staged reminder ladder (D+1 / D+7 / D+15 / D+30) across WhatsApp / email / SMS.
// Computes, per overdue invoice, which ladder step is due now from its days-overdue.
const DUNNING_LADDER = [
  { day: 1,  step: "Gentle nudge",  tone: "soft",  cls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
  { day: 7,  step: "Reminder",      tone: "firm",  cls: "bg-orange-950/30 text-orange-400 border-orange-800/30" },
  { day: 15, step: "Follow-up",     tone: "firm",  cls: "bg-orange-950/40 text-orange-300 border-orange-700/40" },
  { day: 30, step: "Final notice",  tone: "final", cls: "bg-red-950/40 text-red-300 border-red-700/40" },
] as const;

function dunningMessage(tone: string, name: string, amt: string, days: number, ref: string) {
  if (tone === "soft")  return `Hi ${name}, a gentle reminder that invoice ${ref} for ${amt} is now ${days} day(s) past due. Could you confirm the payment date? Thank you!`;
  if (tone === "final") return `FINAL NOTICE — ${name}: invoice ${ref} for ${amt} is ${days} days overdue and remains unpaid. Please clear it within 7 days to avoid further action. Reply with a payment date.`;
  return `Dear ${name}, invoice ${ref} for ${amt} is now ${days} days overdue. Kindly arrange payment at the earliest. Let us know if there is any issue with the invoice.`;
}

function DunningSequence() {
  const { store } = useApp();
  const [channel, setChannel] = useState<"whatsapp" | "email" | "sms">("whatsapp");

  const queue = useMemo(() => {
    return (store.invoices ?? [])
      .filter(inv => inv.status !== "paid")
      .map(inv => {
        const days = Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate)));
        // Highest ladder step whose threshold has been crossed.
        let stepIdx = -1;
        DUNNING_LADDER.forEach((l, i) => { if (days >= l.day) stepIdx = i; });
        const ref = inv.invoiceNumber || inv.id.slice(0, 6);
        return { id: inv.id, customer: inv.customer, amount: inv.amount, days, ref, stepIdx };
      })
      .filter(r => r.stepIdx >= 0)
      .sort((a, b) => b.days - a.days);
  }, [store.invoices]);

  const send = (r: { customer: string; amount: number; days: number; ref: string; stepIdx: number }) => {
    const tone = DUNNING_LADDER[r.stepIdx].tone;
    const text = dunningMessage(tone, r.customer, formatCurrency(r.amount), r.days, r.ref);
    const msg = encodeURIComponent(text);
    if (channel === "whatsapp")  window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener");
    else if (channel === "email") window.location.href = `mailto:?subject=${encodeURIComponent(`Reminder: invoice ${r.ref} — ${formatCurrency(r.amount)} overdue`)}&body=${msg}`;
    else                          window.location.href = `sms:?&body=${msg}`;
    toast.success(`${DUNNING_LADDER[r.stepIdx].step} opened for ${r.customer}`);
  };

  const stepCounts = DUNNING_LADDER.map((_, i) => queue.filter(q => q.stepIdx === i).length);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Dunning ladder</span>
        </div>
        <div className="flex gap-2 ml-auto">
          {(["whatsapp", "email", "sms"] as const).map(c => (
            <button key={c} onClick={() => setChannel(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${channel === c ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {c === "whatsapp" ? "WhatsApp" : c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {DUNNING_LADDER.map((l, i) => (
          <div key={l.day} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[var(--color-muted)]">D+{l.day} · {l.step}</p>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${l.cls}`}>{stepCounts[i]}</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{stepCounts[i]}</p>
            <p className="text-[10px] text-[var(--color-muted)]">accounts at this stage</p>
          </div>
        ))}
      </div>

      {queue.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Layers size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No invoices have crossed a dunning threshold yet. Overdue invoices appear here when D+1 is reached.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <Send size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Reminders due now</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">{queue.length} account(s) · {channel}</span>
          </div>
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Invoice", "Amount", "Days Overdue", "Ladder Step", "Action"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queue.map(r => {
                const l = DUNNING_LADDER[r.stepIdx];
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-semibold">{r.customer}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{r.ref}</td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 tabular-nums text-red-400">{r.days}d</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${l.cls}`}>D+{l.day} · {l.step}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => send(r)}
                        className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2.5 py-1.5 rounded-lg hover:border-[var(--color-primary)]/40 transition-colors font-medium">
                        {channel === "email" ? <Mail size={11} /> : <MessageSquare size={11} />} Send
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Ladder triggers at D+1 (gentle) → D+7 → D+15 → D+30 (final). The step shown is the highest threshold each invoice has crossed. Sending opens your own WhatsApp/email/SMS prefilled — you choose the recipient and hit send.</p>
    </div>
  );
}

// ── #51 DSO TREND & AGING ANALYTICS ─────────────────────────────────────────
// Days-Sales-Outstanding per month + worst payers, from live invoices.
function DsoTrend() {
  const { store } = useApp();

  const { months, worstPayers, currentDso, prevDso } = useMemo(() => {
    const invoices = store.invoices ?? [];
    // Build last-6-month buckets.
    const buckets: { key: string; label: string; sales: number; outstanding: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yy"), sales: 0, outstanding: 0 });
    }
    const byKey: Record<string, { sales: number; outstanding: number }> = {};
    buckets.forEach(b => { byKey[b.key] = b; });

    invoices.forEach(inv => {
      const key = (inv.invoiceDate || "").slice(0, 7);
      if (byKey[key]) {
        byKey[key].sales += inv.amount;
        if (inv.status !== "paid") byKey[key].outstanding += inv.amount;
      }
    });

    // DSO per month = (outstanding AR for the month / month sales) × days-in-month.
    const months = buckets.map(b => {
      const dsoVal = b.sales > 0 ? Math.round((b.outstanding / b.sales) * 30) : 0;
      return { ...b, dso: dsoVal };
    });

    // Worst payers: avg days-late on their open invoices, sorted descending.
    const payerMap: Record<string, { sumDays: number; n: number; open: number }> = {};
    invoices.filter(i => i.status !== "paid").forEach(i => {
      const days = Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate)));
      if (!payerMap[i.customer]) payerMap[i.customer] = { sumDays: 0, n: 0, open: 0 };
      payerMap[i.customer].sumDays += days;
      payerMap[i.customer].n += 1;
      payerMap[i.customer].open += i.amount;
    });
    const worstPayers = Object.entries(payerMap)
      .map(([customer, d]) => ({ customer, avgDays: Math.round(d.sumDays / Math.max(d.n, 1)), open: d.open, count: d.n }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 8);

    const withData = months.filter(m => m.dso > 0);
    const currentDso = months[months.length - 1]?.dso ?? 0;
    const prevDso = withData.length >= 2 ? withData[withData.length - 2].dso : 0;
    return { months, worstPayers, currentDso, prevDso };
  }, [store.invoices]);

  const maxDso = Math.max(...months.map(m => m.dso), 1);
  const delta = currentDso - prevDso;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Current DSO", value: `${currentDso}d`, color: "text-[var(--color-primary)]" },
          { label: "Prev. month DSO", value: prevDso > 0 ? `${prevDso}d` : "—", color: "text-[var(--color-muted)]" },
          { label: "MoM change", value: `${delta >= 0 ? "+" : ""}${delta}d`, color: delta > 0 ? "text-red-400" : "text-green-400" },
          { label: "Worst payers", value: worstPayers.length.toString(), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <LineChart size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">DSO trend — last 6 months</span>
          <span className="text-xs text-[var(--color-muted)] ml-auto">lower is better</span>
        </div>
        <div className="flex items-end gap-3 h-40">
          {months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
              <span className="text-[10px] font-semibold tabular-nums">{m.dso > 0 ? `${m.dso}d` : "—"}</span>
              <div className="w-full rounded-t bg-[var(--color-primary)] transition-all" style={{ height: `${(m.dso / maxDso) * 100}%`, minHeight: m.dso > 0 ? "4px" : "0" }} />
              <span className="text-[10px] text-[var(--color-muted)]">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {worstPayers.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <LineChart size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add invoices to see DSO trends and your slowest-paying customers.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold">Worst payers (open invoices)</span>
          </div>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Open Invoices", "Outstanding", "Avg Days Late"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {worstPayers.map(p => (
                <tr key={p.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{p.customer}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{p.count}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(p.open)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{p.avgDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">DSO ≈ (open AR for the month ÷ that month&apos;s sales) × 30 days. A rising trend means cash is taking longer to collect. Worst payers ranked by average days past due on their open invoices.</p>
    </div>
  );
}

// ── #52 PROMISE-TO-PAY TRACKER ──────────────────────────────────────────────
// Log customer commitments; auto-flag breaches when the promised date passes.
type PromiseRow = {
  id: string;
  customer: string;
  amount: number;
  promiseDate: string;
  note: string;
  status: "open" | "kept" | "broken";
  createdAt: string;
};

function PromiseToPay() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<PromiseRow[]>("collections-promise-to-pay", []);
  const customers = Array.from(new Set((store.invoices ?? []).map(i => i.customer).filter(Boolean)));

  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState(format(addDays(new Date(), 7), "yyyy-MM-dd"));
  const [note, setNote] = useState("");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!customer.trim() || amt <= 0) { toast.error("Pick a customer and a promised amount"); return; }
    setRows([{ id: crypto.randomUUID(), customer: customer.trim(), amount: amt, promiseDate, note: note.trim(), status: "open", createdAt: new Date().toISOString() }, ...rows]);
    setAmount(""); setNote("");
    toast.success("Promise-to-pay logged");
  };

  const setStatus = (id: string, status: PromiseRow["status"]) =>
    setRows(rows.map(r => (r.id === id ? { ...r, status } : r)));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  // A row is breached when still open and the promised date has passed.
  const display = rows.map(r => {
    const overdue = r.status === "open" && differenceInDays(new Date(), parseISO(r.promiseDate)) > 0;
    return { ...r, breached: overdue, daysLate: overdue ? differenceInDays(new Date(), parseISO(r.promiseDate)) : 0 };
  });

  const followUp = (r: PromiseRow & { daysLate: number }) => {
    const text = `Hi ${r.customer}, you had committed to pay ${formatCurrency(r.amount)} by ${format(parseISO(r.promiseDate), "d MMM yyyy")}, which is now ${r.daysLate} day(s) past. Could you confirm a fresh payment date today? Thank you.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    toast.success(`Follow-up opened for ${r.customer}`);
  };

  const openCount = display.filter(r => r.status === "open" && !r.breached).length;
  const breachedCount = display.filter(r => r.breached).length;
  const keptCount = display.filter(r => r.status === "kept").length;
  const promisedValue = display.filter(r => r.status === "open").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <HandCoins size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Log a promise-to-pay</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            {customers.length > 0 ? (
              <select value={customer} onChange={e => setCustomer(e.target.value)} className={inp}>
                <option value="">Select…</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" className={inp} />
            )}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Promised amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Promised by</label>
            <input type="date" value={promiseDate} onChange={e => setPromiseDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" className={inp} />
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          <Plus size={13} /> Add promise
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open promises", value: openCount.toString(), color: "text-[var(--color-primary)]" },
          { label: "Broken", value: breachedCount.toString(), color: "text-red-400" },
          { label: "Kept", value: keptCount.toString(), color: "text-green-400" },
          { label: "Promised value (open)", value: formatCurrency(promisedValue), color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {display.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <HandCoins size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No promises logged yet. When a customer commits to a payment date, record it here to auto-track breaches.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Amount", "Promised By", "Status", "Note", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.map(r => (
                <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] ${r.breached ? "bg-red-950/5" : ""}`}>
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{format(parseISO(r.promiseDate), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">
                    {r.status === "kept" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-950/30 text-green-400">Kept</span>
                    ) : r.status === "broken" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950/40 text-red-300">Broken</span>
                    ) : r.breached ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950/30 text-red-400">Breached · {r.daysLate}d late</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-950/30 text-yellow-400">Open</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)] truncate max-w-[140px]">{r.note || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.breached && (
                        <button onClick={() => followUp(r)} title="Follow up on WhatsApp"
                          className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:border-[var(--color-primary)]/40 transition-colors">
                          <MessageSquare size={11} /> Chase
                        </button>
                      )}
                      {r.status === "open" && (
                        <button onClick={() => setStatus(r.id, "kept")} title="Mark kept"
                          className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:border-green-700/40 transition-colors text-green-400">
                          <CheckCircle2 size={11} /> Kept
                        </button>
                      )}
                      {r.status === "open" && (
                        <button onClick={() => setStatus(r.id, "broken")} title="Mark broken"
                          className="text-xs text-[var(--color-muted)] hover:text-red-400 px-1.5 py-1">Broken</button>
                      )}
                      <button onClick={() => remove(r.id)} title="Delete"
                        className="text-[var(--color-muted)] hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Promises auto-flag as breached once the committed date passes while still open. Use Chase to send a WhatsApp follow-up. Records sync across your devices.</p>
    </div>
  );
}

// ── #53 COLLECTION AGENT ASSIGNMENT & TARGETS ──────────────────────────────
// Route overdue accounts to reps, set a per-rep collection target, track progress.
type AgentRow = { id: string; name: string; target: number };

function AgentAssignment() {
  const { store } = useApp();
  const [agents, setAgents] = useFeatureState<AgentRow[]>("collections-agents", []);
  const [assignments, setAssignments] = useFeatureState<Record<string, string>>("collections-agent-assignments", {});

  const [agentName, setAgentName] = useState("");
  const [agentTarget, setAgentTarget] = useState("");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const overdue = useMemo(() => {
    return (store.invoices ?? [])
      .filter(inv => inv.status !== "paid" && differenceInDays(new Date(), parseISO(inv.dueDate)) > 0)
      .map(inv => ({
        id: inv.id,
        customer: inv.customer,
        amount: inv.amount,
        days: Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate))),
        ref: inv.invoiceNumber || inv.id.slice(0, 6),
      }))
      .sort((a, b) => b.days - a.days);
  }, [store.invoices]);

  const addAgent = () => {
    if (!agentName.trim()) { toast.error("Enter an agent name"); return; }
    setAgents([...agents, { id: crypto.randomUUID(), name: agentName.trim(), target: parseFloat(agentTarget) || 0 }]);
    setAgentName(""); setAgentTarget("");
    toast.success("Agent added");
  };

  const removeAgent = (id: string) => {
    setAgents(agents.filter(a => a.id !== id));
    const next: Record<string, string> = {};
    Object.entries(assignments).forEach(([invId, agId]) => { if (agId !== id) next[invId] = agId; });
    setAssignments(next);
  };

  const assign = (invId: string, agentId: string) => setAssignments({ ...assignments, [invId]: agentId });

  // Per-agent progress = sum of assigned overdue amounts vs their target.
  const agentStats = agents.map(a => {
    const assigned = overdue.filter(o => assignments[o.id] === a.id);
    const assignedValue = assigned.reduce((s, o) => s + o.amount, 0);
    const pct = a.target > 0 ? Math.min(100, Math.round((assignedValue / a.target) * 100)) : 0;
    return { ...a, count: assigned.length, assignedValue, pct };
  });

  const unassigned = overdue.filter(o => !assignments[o.id]).length;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Add collection agent</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Agent / rep name</label>
            <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Priya" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Collection target (₹)</label>
            <input type="number" value={agentTarget} onChange={e => setAgentTarget(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div className="flex items-end">
            <button onClick={addAgent} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
              <Plus size={13} /> Add agent
            </button>
          </div>
        </div>
      </div>

      {agentStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agentStats.map(a => (
            <div key={a.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{a.name}</p>
                <button onClick={() => removeAgent(a.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={12} /></button>
              </div>
              <p className="text-xs text-[var(--color-muted)]">{a.count} account(s) · {formatCurrency(a.assignedValue)} assigned</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${a.pct}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums">{a.target > 0 ? `${a.pct}%` : "—"}</span>
              </div>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">Target {a.target > 0 ? formatCurrency(a.target) : "not set"}</p>
            </div>
          ))}
        </div>
      )}

      {overdue.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No overdue accounts to route. Overdue invoices appear here for assignment to your reps.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold">Overdue accounts</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">{unassigned} unassigned</span>
          </div>
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Invoice", "Amount", "Days Overdue", "Assigned To"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overdue.map(o => (
                <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{o.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{o.ref}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(o.amount)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{o.days}d</td>
                  <td className="px-4 py-3">
                    <select value={assignments[o.id] ?? ""} onChange={e => assign(o.id, e.target.value)}
                      className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 outline-none focus:border-[var(--color-primary)]">
                      <option value="">Unassigned</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Add reps with a collection target, then route each overdue account to a rep. Progress = assigned overdue value ÷ target. Agents and assignments sync across devices.</p>
    </div>
  );
}

// ── #54 SETTLEMENT / WRITE-OFF WORKFLOW ─────────────────────────────────────
// Discount-to-settle approval + bad-debt (write-off) posting calculator.
type SettlementRow = {
  id: string;
  customer: string;
  original: number;
  type: "settlement" | "writeoff";
  discountPct: number;
  reason: string;
  status: "proposed" | "approved" | "rejected";
  createdAt: string;
};

function SettlementWorkflow() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<SettlementRow[]>("collections-settlements", []);

  const openAccounts = useMemo(() => {
    return (store.invoices ?? [])
      .filter(inv => inv.status !== "paid")
      .map(inv => ({ id: inv.id, customer: inv.customer, amount: inv.amount, ref: inv.invoiceNumber || inv.id.slice(0, 6) }));
  }, [store.invoices]);

  const [selId, setSelId] = useState("");
  const [type, setType] = useState<"settlement" | "writeoff">("settlement");
  const [discountPct, setDiscountPct] = useState(20);
  const [reason, setReason] = useState("");

  const sel = openAccounts.find(a => a.id === selId);
  const original = sel?.amount ?? 0;
  const recoverable = type === "writeoff" ? 0 : Math.round(original * (1 - discountPct / 100));
  const loss = original - recoverable;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const propose = () => {
    if (!sel) { toast.error("Select an open account"); return; }
    setRows([{
      id: crypto.randomUUID(),
      customer: sel.customer,
      original,
      type,
      discountPct: type === "writeoff" ? 100 : discountPct,
      reason: reason.trim(),
      status: "proposed",
      createdAt: new Date().toISOString(),
    }, ...rows]);
    setReason("");
    toast.success(type === "writeoff" ? "Write-off proposed for approval" : "Settlement proposed for approval");
  };

  const setStatus = (id: string, status: SettlementRow["status"]) =>
    setRows(rows.map(r => (r.id === id ? { ...r, status } : r)));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const approvedLoss = rows.filter(r => r.status === "approved").reduce((s, r) => s + Math.round(r.original * (r.discountPct / 100)), 0);
  const recovered = rows.filter(r => r.status === "approved").reduce((s, r) => s + Math.round(r.original * (1 - r.discountPct / 100)), 0);
  const pending = rows.filter(r => r.status === "proposed").length;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Scissors size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Propose settlement or write-off</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Open account</label>
            <select value={selId} onChange={e => setSelId(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {openAccounts.map(a => <option key={a.id} value={a.id}>{a.customer} · {a.ref} · {formatCurrency(a.amount)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Action</label>
            <div className="flex gap-1">
              {(["settlement", "writeoff"] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${type === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                  {t === "writeoff" ? "Write-off" : "Settle"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">{type === "writeoff" ? "Write-off = 100%" : `Discount ${discountPct}%`}</label>
            <input type="range" min={0} max={90} value={discountPct} disabled={type === "writeoff"}
              onChange={e => setDiscountPct(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)] disabled:opacity-40" />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Reason / approval note</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. customer in financial distress, partial recovery agreed" className={inp} />
        </div>

        {sel && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Original due", value: formatCurrency(original), color: "text-[var(--color-text)]" },
              { label: type === "writeoff" ? "Recoverable" : "Recover (net)", value: formatCurrency(recoverable), color: "text-green-400" },
              { label: type === "writeoff" ? "Bad debt" : "Discount loss", value: formatCurrency(loss), color: "text-red-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        )}

        <button onClick={propose} className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          <Plus size={13} /> Submit for approval
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending approval", value: pending.toString(), color: "text-yellow-400" },
          { label: "Approved recovery", value: formatCurrency(recovered), color: "text-green-400" },
          { label: "Bad debt / discount", value: formatCurrency(approvedLoss), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Scissors size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No settlement or write-off proposals yet. Propose a discount-to-settle or a bad-debt write-off above for approval.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Type", "Original", "Recover", "Loss", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const rRecover = Math.round(r.original * (1 - r.discountPct / 100));
                const rLoss = r.original - rRecover;
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-3 font-semibold">{r.customer}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.type === "writeoff" ? "bg-red-950/30 text-red-400" : "bg-blue-950/30 text-blue-400"}`}>
                        {r.type === "writeoff" ? "Write-off" : `Settle −${r.discountPct}%`}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCurrency(r.original)}</td>
                    <td className="px-4 py-3 tabular-nums text-green-400">{formatCurrency(rRecover)}</td>
                    <td className="px-4 py-3 tabular-nums text-red-400">{formatCurrency(rLoss)}</td>
                    <td className="px-4 py-3">
                      {r.status === "approved" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-950/30 text-green-400">Approved</span>
                      ) : r.status === "rejected" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-[var(--color-muted)]">Rejected</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-950/30 text-yellow-400">Proposed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.status === "proposed" && (
                          <>
                            <button onClick={() => setStatus(r.id, "approved")} title="Approve"
                              className="flex items-center gap-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-1 rounded-lg hover:border-green-700/40 transition-colors text-green-400">
                              <CheckCircle2 size={11} /> Approve
                            </button>
                            <button onClick={() => setStatus(r.id, "rejected")} title="Reject"
                              className="text-xs text-[var(--color-muted)] hover:text-red-400 px-1.5 py-1">Reject</button>
                          </>
                        )}
                        <button onClick={() => remove(r.id)} title="Delete"
                          className="text-[var(--color-muted)] hover:text-red-400 p-1"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Settlement = accept a discounted amount to close the account; write-off = recognise the full balance as bad debt (Dr Bad-debt expense, Cr Debtors). Approved figures feed the recovery/loss summary. Records sync across devices.</p>
    </div>
  );
}

// ── #55 COLLECTION EFFECTIVENESS INDEX (CEI) ────────────────────────────────
// CEI = (collected during a period ÷ amount that was collectible) × 100.
// Computed per month over the last 6 months from live invoices.
function CollectionEffectiveness() {
  const { store } = useApp();

  const { months, overallCei } = useMemo(() => {
    const invoices = store.invoices ?? [];
    const now = new Date();
    const buckets: { key: string; label: string; collectible: number; collected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM yy"), collectible: 0, collected: 0 });
    }
    const byKey: Record<string, { collectible: number; collected: number }> = {};
    buckets.forEach(b => { byKey[b.key] = b; });

    // Collectible = invoices that became due in the month; collected = the paid ones.
    invoices.forEach(inv => {
      const key = (inv.dueDate || "").slice(0, 7);
      if (byKey[key]) {
        byKey[key].collectible += inv.amount;
        if (inv.status === "paid") byKey[key].collected += inv.amount;
      }
    });

    const months = buckets.map(b => ({
      ...b,
      cei: b.collectible > 0 ? Math.round((b.collected / b.collectible) * 100) : 0,
    }));
    const totalCollectible = months.reduce((s, m) => s + m.collectible, 0);
    const totalCollected = months.reduce((s, m) => s + m.collected, 0);
    const overallCei = totalCollectible > 0 ? Math.round((totalCollected / totalCollectible) * 100) : 0;
    return { months, overallCei };
  }, [store.invoices]);

  const maxCei = Math.max(...months.map(m => m.cei), 1);
  const hasData = months.some(m => m.collectible > 0);
  const grade = overallCei >= 80 ? { label: "Excellent", cls: "text-green-400" } : overallCei >= 60 ? { label: "Healthy", cls: "text-yellow-400" } : { label: "Needs work", cls: "text-red-400" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Overall CEI (6 mo)", value: hasData ? `${overallCei}%` : "—", color: grade.cls },
          { label: "Rating", value: hasData ? grade.label : "—", color: grade.cls },
          { label: "Latest month CEI", value: hasData ? `${months[months.length - 1].cei}%` : "—", color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Gauge size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add invoices with due dates to measure how effectively you collect what becomes due.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Gauge size={14} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Collection Effectiveness — last 6 months</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">higher is better</span>
          </div>
          <div className="flex items-end gap-3 h-40">
            {months.map(m => (
              <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-[10px] font-semibold tabular-nums">{m.collectible > 0 ? `${m.cei}%` : "—"}</span>
                <div className="w-full rounded-t bg-[var(--color-primary)] transition-all" style={{ height: `${(m.cei / maxCei) * 100}%`, minHeight: m.cei > 0 ? "4px" : "0" }} />
                <span className="text-[10px] text-[var(--color-muted)]">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">CEI = collected ÷ collectible (invoices that fell due that month) × 100. ≥80% is excellent, 60–80% healthy, below means too much slips past its due date.</p>
    </div>
  );
}

// ── #56 BAD-DEBT PROVISIONING CALCULATOR ────────────────────────────────────
// Apply an aging-based provisioning policy to open receivables for the books.
const DEFAULT_PROVISION: Record<Aging, number> = { "current": 0, "1-30": 0, "31-60": 10, "61-90": 25, "90+": 50 };

function BadDebtProvision() {
  const { store } = useApp();
  const [pct, setPct] = useState<Record<Aging, number>>(DEFAULT_PROVISION);

  const rows = useMemo(() => {
    const map: Record<Aging, number> = { "current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    (store.invoices ?? []).filter(i => i.status !== "paid").forEach(i => { map[getAging(i.dueDate)] += i.amount; });
    return (["current", "1-30", "31-60", "61-90", "90+"] as Aging[]).map(age => ({
      age,
      outstanding: map[age],
      rate: pct[age],
      provision: Math.round(map[age] * (pct[age] / 100)),
    }));
  }, [store.invoices, pct]);

  const totalOut = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalProv = rows.reduce((s, r) => s + r.provision, 0);
  const netRealisable = totalOut - totalProv;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Provisioning policy (% doubtful by age)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["current", "1-30", "31-60", "61-90", "90+"] as Aging[]).map(age => (
            <div key={age}>
              <label className="text-[10px] text-[var(--color-muted)] block mb-1">{AGING_STYLE[age].label}</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={pct[age]}
                  onChange={e => setPct({ ...pct, [age]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] tabular-nums" />
                <span className="text-xs text-[var(--color-muted)]">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total outstanding", value: formatCurrency(totalOut), color: "text-[var(--color-text)]" },
          { label: "Bad-debt provision", value: formatCurrency(totalProv), color: "text-red-400" },
          { label: "Net realisable AR", value: formatCurrency(netRealisable), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {totalOut === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ShieldAlert size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open receivables to provision against. Outstanding invoices appear here grouped by aging bucket.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Aging Bucket", "Outstanding", "Provision %", "Provision Amount"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.age} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${AGING_STYLE[r.age].badge}`}>{AGING_STYLE[r.age].label}</span></td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.outstanding)}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{r.rate}%</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{r.provision > 0 ? formatCurrency(r.provision) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-accent)] font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(totalOut)}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{totalOut > 0 ? `${Math.round((totalProv / totalOut) * 100)}%` : "—"}</td>
                <td className="px-4 py-3 tabular-nums text-red-400">{formatCurrency(totalProv)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Provision matrix posts as Dr Bad-debt expense / Cr Provision for doubtful debts. Adjust the % per bucket to match your accounting policy; older buckets typically carry higher provisioning.</p>
    </div>
  );
}

// ── #57 PAYMENT PLAN / INSTALLMENT BUILDER ──────────────────────────────────
// Split an open balance into N equal installments and produce a schedule.
function PaymentPlanBuilder() {
  const { store } = useApp();
  const openAccounts = useMemo(() => (store.invoices ?? [])
    .filter(inv => inv.status !== "paid")
    .map(inv => ({ id: inv.id, customer: inv.customer, amount: inv.amount, ref: inv.invoiceNumber || inv.id.slice(0, 6) })), [store.invoices]);

  const [selId, setSelId] = useState("");
  const [count, setCount] = useState(3);
  const [everyDays, setEveryDays] = useState(30);
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [copied, setCopied] = useState(false);

  const sel = openAccounts.find(a => a.id === selId);
  const total = sel?.amount ?? 0;

  const schedule = useMemo(() => {
    if (!sel || count < 1) return [];
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return Array.from({ length: count }, (_, i) => ({
      n: i + 1,
      // Push the rounding remainder into the final installment so the plan sums exactly.
      amount: i === count - 1 ? base + remainder : base,
      date: format(addDays(parseISO(startDate), i * everyDays), "d MMM yyyy"),
    }));
  }, [sel, count, total, everyDays, startDate]);

  const copyPlan = () => {
    if (!sel) return;
    const lines = [
      `PAYMENT PLAN — ${sel.customer} (Invoice ${sel.ref})`,
      `Total: ${formatCurrency(total)} in ${count} installments`,
      ``,
      ...schedule.map(s => `Installment ${s.n}: ${formatCurrency(s.amount)} due ${s.date}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    toast.success("Payment plan copied");
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  if (openAccounts.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <CalendarClock size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">No open invoices to build a payment plan for. Outstanding accounts appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Build an installment plan</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Open account</label>
            <select value={selId} onChange={e => setSelId(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {openAccounts.map(a => <option key={a.id} value={a.id}>{a.customer} · {a.ref} · {formatCurrency(a.amount)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Installments</label>
            <input type="number" min={1} max={36} value={count} onChange={e => setCount(Math.max(1, Math.min(36, Number(e.target.value) || 1)))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Every (days)</label>
            <input type="number" min={1} max={180} value={everyDays} onChange={e => setEveryDays(Math.max(1, Number(e.target.value) || 1))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First due</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {sel && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total to recover", value: formatCurrency(total), color: "text-[var(--color-text)]" },
              { label: "Per installment", value: schedule.length > 0 ? `~${formatCurrency(schedule[0].amount)}` : "—", color: "text-[var(--color-primary)]" },
              { label: "Plan length", value: `${(count - 1) * everyDays} days`, color: "text-yellow-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
              <span className="text-sm font-semibold">Schedule — {sel.customer}</span>
              <button onClick={copyPlan} className="ml-auto flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
                <Copy size={11} /> {copied ? "Copied!" : "Copy plan"}
              </button>
            </div>
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["#", "Due Date", "Amount"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map(s => (
                  <tr key={s.n} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-muted)]">{s.n}</td>
                    <td className="px-4 py-2.5 tabular-nums">{s.date}</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Splits the open balance into equal installments; the rounding remainder lands on the final one so the plan sums exactly to the balance. Copy and share the schedule with the customer to confirm terms.</p>
    </div>
  );
}

// ── #58 OVERDUE INTEREST CALCULATOR (MSME) ──────────────────────────────────
// Compute delayed-payment interest on overdue invoices at a configurable annual rate.
function LateInterestCalculator() {
  const { store } = useApp();
  const [annualPct, setAnnualPct] = useState(18);

  const rows = useMemo(() => {
    return (store.invoices ?? [])
      .filter(inv => inv.status !== "paid")
      .map(inv => {
        const days = Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate)));
        const interest = Math.round(inv.amount * (annualPct / 100) * (days / 365));
        return { id: inv.id, customer: inv.customer, ref: inv.invoiceNumber || inv.id.slice(0, 6), amount: inv.amount, days, interest };
      })
      .filter(r => r.days > 0)
      .sort((a, b) => b.interest - a.interest);
  }, [store.invoices, annualPct]);

  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  const totalPrincipal = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Percent size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Delayed-payment interest</span>
        </div>
        <div className="ml-auto">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Annual interest rate</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={36} value={annualPct} onChange={e => setAnnualPct(Number(e.target.value))} className="w-32 accent-[var(--color-primary)]" />
            <span className="text-sm font-bold w-10 tabular-nums">{annualPct}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Overdue principal", value: formatCurrency(totalPrincipal), color: "text-[var(--color-text)]" },
          { label: "Interest claimable", value: formatCurrency(totalInterest), color: "text-orange-400" },
          { label: "Overdue accounts", value: rows.length.toString(), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Percent size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No overdue invoices to charge interest on. Once an invoice passes its due date it appears here with accrued interest.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <span className="text-sm font-semibold">Interest accrued by invoice</span>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Invoice", "Principal", "Days Overdue", "Interest"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{r.ref}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{r.days}d</td>
                  <td className="px-4 py-3 tabular-nums text-orange-400 font-semibold">{formatCurrency(r.interest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simple interest = principal × annual rate × days÷365. Under the MSMED Act buyers owe compound interest at 3× the RBI bank rate on delayed MSME payments — set the rate to match your contract or the applicable statutory rate.</p>
    </div>
  );
}

// ── #59 CASH FORECAST FROM RECEIVABLES ──────────────────────────────────────
// Project expected collections into weekly buckets using a recovery-probability
// curve keyed to each invoice's aging (older = less likely to land soon).
const RECOVERY_PROB: Record<Aging, number> = { "current": 0.95, "1-30": 0.85, "31-60": 0.65, "61-90": 0.45, "90+": 0.25 };

function CollectionForecast() {
  const { store } = useApp();

  const { weeks, expectedTotal, faceTotal } = useMemo(() => {
    const open = (store.invoices ?? []).filter(i => i.status !== "paid");
    const now = new Date();
    const weeks = Array.from({ length: 6 }, (_, i) => ({
      label: i === 0 ? "This week" : `Week +${i}`,
      start: addDays(now, i * 7),
      expected: 0,
    }));
    let expectedTotal = 0;
    let faceTotal = 0;
    open.forEach(inv => {
      const prob = RECOVERY_PROB[getAging(inv.dueDate)];
      const expected = inv.amount * prob;
      faceTotal += inv.amount;
      expectedTotal += expected;
      // Bucket by expected-pay date: overdue lands in week 0; not-yet-due lands on its due week.
      const daysToDue = differenceInDays(parseISO(inv.dueDate), now);
      const wi = daysToDue <= 0 ? 0 : Math.min(5, Math.floor(daysToDue / 7));
      weeks[wi].expected += expected;
    });
    return { weeks, expectedTotal: Math.round(expectedTotal), faceTotal };
  }, [store.invoices]);

  const maxWeek = Math.max(...weeks.map(w => w.expected), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open AR (face value)", value: formatCurrency(faceTotal), color: "text-[var(--color-text)]" },
          { label: "Expected to collect", value: formatCurrency(expectedTotal), color: "text-green-400" },
          { label: "Risk-adjusted shortfall", value: formatCurrency(faceTotal - expectedTotal), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {faceTotal === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <TrendingUp size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open receivables to forecast. Outstanding invoices project into expected weekly collections here.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Expected collections — next 6 weeks</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">risk-adjusted</span>
          </div>
          <div className="flex items-end gap-3 h-40">
            {weeks.map(w => (
              <div key={w.label} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-[10px] font-semibold tabular-nums">{w.expected > 0 ? formatCurrency(Math.round(w.expected)) : "—"}</span>
                <div className="w-full rounded-t bg-green-500/70 transition-all" style={{ height: `${(w.expected / maxWeek) * 100}%`, minHeight: w.expected > 0 ? "4px" : "0" }} />
                <span className="text-[10px] text-[var(--color-muted)]">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Each invoice is weighted by a recovery probability set by its aging (Current 95% → 90d+ 25%) and bucketed by its due week (overdue counts as this week). Expected = Σ(amount × probability) — a conservative cash-in estimate, not a guarantee.</p>
    </div>
  );
}

// ── #60 PRIORITY WORKLIST (value × age × risk) ──────────────────────────────
// Rank open accounts by a chase-priority score so reps work the biggest wins first.
function PriorityWorklist() {
  const { store } = useApp();

  const rows = useMemo(() => {
    const open = (store.invoices ?? []).filter(i => i.status !== "paid");
    const maxAmt = Math.max(...open.map(i => i.amount), 1);
    return open
      .map(inv => {
        const days = Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate)));
        const valueScore = (inv.amount / maxAmt) * 100;       // 0–100 by value
        const ageScore = Math.min(days / 90, 1) * 100;        // 0–100, caps at 90d
        const riskScore = (1 - RECOVERY_PROB[getAging(inv.dueDate)]) * 100; // older = riskier
        // Weighted blend: value 40%, age 35%, risk 25%.
        const priority = Math.round(valueScore * 0.4 + ageScore * 0.35 + riskScore * 0.25);
        return { id: inv.id, customer: inv.customer, ref: inv.invoiceNumber || inv.id.slice(0, 6), amount: inv.amount, days, priority };
      })
      .sort((a, b) => b.priority - a.priority);
  }, [store.invoices]);

  const focus = rows.slice(0, Math.min(5, rows.length));
  const focusValue = focus.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Accounts to work", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Top-5 focus value", value: formatCurrency(focusValue), color: "text-yellow-400" },
          { label: "Highest priority", value: rows.length > 0 ? `${rows[0].priority}` : "—", color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ListChecks size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open accounts to prioritise. Outstanding invoices are ranked here by value, age and risk.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <ListChecks size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Chase worklist</span>
            <span className="text-xs text-[var(--color-muted)] ml-auto">work top-down</span>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Rank", "Customer", "Invoice", "Amount", "Days Overdue", "Priority"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)] ${i < 5 ? "bg-[var(--color-primary)]/5" : ""}`}>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{r.ref}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{r.days > 0 ? `${r.days}d` : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden w-20">
                        <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${r.priority}%` }} />
                      </div>
                      <span className="tabular-nums text-xs font-semibold w-6">{r.priority}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Priority = 40% value + 35% age + 25% recovery-risk, each scaled 0–100. The top five (highlighted) are where chasing recovers the most cash per minute of effort.</p>
    </div>
  );
}

// ── #61 EARLY-PAYMENT DISCOUNT ENGINE ───────────────────────────────────────
// Model a 2/10-net-30 style early-pay discount and the implied annualised cost.
function EarlyPayDiscount() {
  const { store } = useApp();
  const [discountPct, setDiscountPct] = useState(2);
  const [payWithin, setPayWithin] = useState(10);
  const [netDays, setNetDays] = useState(30);

  const open = useMemo(() => (store.invoices ?? []).filter(i => i.status !== "paid"), [store.invoices]);
  const openValue = open.reduce((s, i) => s + i.amount, 0);

  const rows = useMemo(() => open
    .map(inv => ({
      id: inv.id,
      customer: inv.customer,
      ref: inv.invoiceNumber || inv.id.slice(0, 6),
      amount: inv.amount,
      discounted: Math.round(inv.amount * (1 - discountPct / 100)),
      saving: Math.round(inv.amount * (discountPct / 100)),
    }))
    .sort((a, b) => b.amount - a.amount), [open, discountPct]);

  // Implied annual cost of offering the discount (your cost of accelerating cash).
  const daysSaved = Math.max(1, netDays - payWithin);
  const impliedApr = Math.round((discountPct / (100 - discountPct)) * (365 / daysSaved) * 100);
  const totalDiscount = Math.round(openValue * (discountPct / 100));
  const cashIfTaken = openValue - totalDiscount;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Early-payment discount terms</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount %</label>
            <input type="number" min={0} max={20} value={discountPct} onChange={e => setDiscountPct(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">If paid within (days)</label>
            <input type="number" min={1} max={90} value={payWithin} onChange={e => setPayWithin(Math.max(1, Number(e.target.value) || 1))} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Net terms (days)</label>
            <input type="number" min={1} max={180} value={netDays} onChange={e => setNetDays(Math.max(1, Number(e.target.value) || 1))} className={inp} />
          </div>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Offer: <span className="font-semibold text-[var(--color-text)]">{discountPct}/{payWithin} net {netDays}</span> — {discountPct}% off if paid within {payWithin} days, otherwise full amount by day {netDays}.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Open AR", value: formatCurrency(openValue), color: "text-[var(--color-text)]" },
          { label: "Cash if all take it", value: formatCurrency(cashIfTaken), color: "text-green-400" },
          { label: "Discount given", value: formatCurrency(totalDiscount), color: "text-red-400" },
          { label: "Implied annual cost", value: `${impliedApr}%`, color: impliedApr > 24 ? "text-red-400" : "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Tag size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open invoices to offer early-pay discounts on. Outstanding accounts appear here with their discounted amounts.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Invoice", "Full Amount", "Pay-now Amount", "Customer Saves"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{r.ref}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3 tabular-nums text-green-400 font-semibold">{formatCurrency(r.discounted)}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{formatCurrency(r.saving)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Implied annual cost = (d ÷ (100−d)) × (365 ÷ days saved). At 2/10 net 30 that is ~37% — only worth offering if your cash is scarcer than that. Use it selectively for customers whose early cash genuinely beats the discount.</p>
    </div>
  );
}

// ── #62 LEGAL / DEMAND NOTICE DRAFTER ───────────────────────────────────────
// Generate a formal demand-notice / legal-notice draft from a selected overdue account.
function LegalNoticeDrafter() {
  const { store } = useApp();
  const overdue = useMemo(() => (store.invoices ?? [])
    .filter(inv => inv.status !== "paid" && differenceInDays(new Date(), parseISO(inv.dueDate)) > 0)
    .map(inv => ({
      id: inv.id,
      customer: inv.customer,
      ref: inv.invoiceNumber || inv.id.slice(0, 6),
      amount: inv.amount,
      dueDate: inv.dueDate,
      days: Math.max(0, differenceInDays(new Date(), parseISO(inv.dueDate))),
    }))
    .sort((a, b) => b.days - a.days), [store.invoices]);

  const [selId, setSelId] = useState("");
  const [graceDays, setGraceDays] = useState(15);
  const [copied, setCopied] = useState(false);

  const sel = overdue.find(o => o.id === selId);
  const firmName = store.firm?.name ?? "Your Company";

  const notice = useMemo(() => {
    if (!sel) return "";
    return [
      `LEGAL DEMAND NOTICE`,
      ``,
      `From: ${firmName}`,
      `To: ${sel.customer}`,
      `Date: ${format(new Date(), "d MMMM yyyy")}`,
      ``,
      `Subject: Demand for payment of overdue invoice ${sel.ref} amounting to ${formatCurrency(sel.amount)}`,
      ``,
      `Dear Sir/Madam,`,
      ``,
      `1. You are liable to pay our client ${firmName} a sum of ${formatCurrency(sel.amount)} towards invoice no. ${sel.ref}, which fell due on ${format(parseISO(sel.dueDate), "d MMMM yyyy")} and remains unpaid for ${sel.days} days as on date.`,
      ``,
      `2. Despite repeated reminders, the said amount has not been settled, causing financial loss and inconvenience.`,
      ``,
      `3. You are hereby called upon to pay the entire outstanding sum of ${formatCurrency(sel.amount)}, together with applicable interest, within ${graceDays} days of receipt of this notice.`,
      ``,
      `4. Take notice that failing payment within the stipulated period, our client shall be constrained to initiate appropriate legal proceedings for recovery, entirely at your risk as to cost and consequences.`,
      ``,
      `This notice is issued without prejudice to the rights and remedies available to our client.`,
      ``,
      `For ${firmName}`,
      `Authorised Signatory`,
    ].join("\n");
  }, [sel, firmName, graceDays]);

  const copy = () => {
    navigator.clipboard.writeText(notice).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    toast.success("Notice draft copied");
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  if (overdue.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Gavel size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">No overdue accounts to draft a demand notice for. Overdue invoices become eligible here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Gavel size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Draft a demand / legal notice</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Overdue account</label>
            <select value={selId} onChange={e => setSelId(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {overdue.map(o => <option key={o.id} value={o.id}>{o.customer} · {o.ref} · {formatCurrency(o.amount)} · {o.days}d</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pay within (days)</label>
            <input type="number" min={1} max={90} value={graceDays} onChange={e => setGraceDays(Math.max(1, Number(e.target.value) || 1))} className={inp} />
          </div>
        </div>
      </div>

      {sel && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <FileText size={13} className="text-[var(--color-primary)]" />
            <span className="text-sm font-semibold">Notice draft — {sel.customer}</span>
            <button onClick={copy} className="ml-auto flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
              <Copy size={11} /> {copied ? "Copied!" : "Copy notice"}
            </button>
          </div>
          <pre className="p-4 text-xs text-[var(--color-text)] leading-relaxed whitespace-pre-wrap font-sans">{notice}</pre>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A starting-point demand-notice draft auto-filled from the invoice and your firm name. This is not legal advice — have a lawyer review and adapt it (e.g. for a Section 138 cheque-bounce or MSMED Act claim) before serving.</p>
    </div>
  );
}

// ── COLLECTIONS KPI BOARD (DSO / CEI / ADD / Best Possible DSO) ──────────────
// Headline receivables KPIs computed straight from the invoice book — DSO,
// Collection Effectiveness Index, Average Days Delinquent and Best-Possible DSO.
function CollectionsKpiBoard() {
  const { store } = useApp();
  const k = useMemo(() => {
    const inv = store.invoices ?? [];
    const open = inv.filter(i => i.status !== "paid");
    const paid = inv.filter(i => i.status === "paid");
    const totalInvoiced = inv.reduce((s, i) => s + i.amount, 0);
    const openValue = open.reduce((s, i) => s + i.amount, 0);
    const paidValue = paid.reduce((s, i) => s + i.amount, 0);
    const currentOpen = open.filter(i => differenceInDays(new Date(), parseISO(i.dueDate)) <= 0).reduce((s, i) => s + i.amount, 0);

    // Window over the most recent 90 days for a comparable run-rate.
    const windowDays = 90;
    const recent = inv.filter(i => differenceInDays(new Date(), parseISO(i.invoiceDate)) <= windowDays);
    const recentSales = recent.reduce((s, i) => s + i.amount, 0);
    const dailySales = recentSales > 0 ? recentSales / windowDays : 0;

    // DSO = AR ÷ avg daily credit sales. Falls back to invoice-share method if no recent sales.
    const dso = dailySales > 0
      ? Math.round(openValue / dailySales)
      : totalInvoiced > 0 ? Math.round((openValue / totalInvoiced) * windowDays) : 0;

    // CEI = (beginning AR + sales − ending AR) ÷ (beginning AR + sales − ending current AR).
    // Simplified single-period proxy: collected ÷ (collected + still-overdue).
    const overdueValue = open.filter(i => differenceInDays(new Date(), parseISO(i.dueDate)) > 0).reduce((s, i) => s + i.amount, 0);
    const cei = (paidValue + overdueValue) > 0 ? Math.round((paidValue / (paidValue + overdueValue)) * 100) : 0;

    // ADD = DSO − Best-Possible DSO (the delinquency drag).
    const bpdso = dailySales > 0 ? Math.round(currentOpen / dailySales) : 0;
    const add = Math.max(0, dso - bpdso);

    const overdueCount = open.filter(i => differenceInDays(new Date(), parseISO(i.dueDate)) > 0).length;
    return { dso, cei, add, bpdso, openValue, overdueValue, overdueCount, paidValue, totalInvoiced };
  }, [store.invoices]);

  const cards = [
    { label: "DSO", value: `${k.dso}d`, sub: "Days Sales Outstanding", color: k.dso > 60 ? "text-red-400" : k.dso > 45 ? "text-yellow-400" : "text-green-400", icon: LineChart },
    { label: "CEI", value: `${k.cei}%`, sub: "Collection Effectiveness", color: k.cei >= 80 ? "text-green-400" : k.cei >= 60 ? "text-yellow-400" : "text-red-400", icon: Gauge },
    { label: "ADD", value: `${k.add}d`, sub: "Avg Days Delinquent", color: k.add > 30 ? "text-red-400" : k.add > 15 ? "text-yellow-400" : "text-green-400", icon: Clock },
    { label: "Best-Possible DSO", value: `${k.bpdso}d`, sub: "If only current AR", color: "text-[var(--color-primary)]", icon: TrendingDown },
  ];

  if ((store.invoices ?? []).length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Activity size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">Create invoices to compute DSO, CEI and delinquency KPIs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--color-muted)] font-medium">{c.label}</p>
              <c.icon size={13} className={c.color} />
            </div>
            <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Open receivables", value: formatCurrency(k.openValue), color: "text-[var(--color-text)]" },
          { label: "Overdue value", value: formatCurrency(k.overdueValue), color: "text-red-400" },
          { label: "Collected to date", value: formatCurrency(k.paidValue), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <p className="text-sm font-semibold mb-2">What these mean</p>
        <ul className="text-xs text-[var(--color-muted)] space-y-1.5 list-disc pl-4">
          <li><span className="text-[var(--color-text)] font-medium">DSO</span> = open AR ÷ average daily credit sales (last 90 days). Lower is better — under 45 days is healthy for most SMBs.</li>
          <li><span className="text-[var(--color-text)] font-medium">CEI</span> = collected ÷ (collected + still-overdue). Above 80% means you are converting most of what is due.</li>
          <li><span className="text-[var(--color-text)] font-medium">ADD</span> = DSO − Best-Possible DSO. It isolates the delay caused purely by overdue accounts.</li>
        </ul>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Computed from your invoice records. CEI here is a single-period proxy (collected vs still-overdue) rather than the full beginning/ending-AR formula, which needs period snapshots.</p>
    </div>
  );
}

// ── DISPUTE & DEDUCTION LOGGER ──────────────────────────────────────────────
// Durable log of contested / short-paid invoices with reason codes so the
// undisputed balance can keep being chased while the dispute is resolved.
type DisputeRow = { id: string; invoiceId: string; customer: string; ref: string; disputed: number; reason: string; status: "open" | "resolved"; createdAt: string };
const DISPUTE_REASONS = ["Pricing", "Damaged goods", "Short delivery", "Freight", "Quality", "Duplicate billing", "Other"] as const;

function DisputeLogger() {
  const { store } = useApp();
  const [rows, setRows] = useFeatureState<DisputeRow[]>("col-disputes", []);
  const open = useMemo(() => (store.invoices ?? []).filter(i => i.status !== "paid")
    .map(i => ({ id: i.id, customer: i.customer, ref: i.invoiceNumber || i.id.slice(0, 6), amount: i.amount })), [store.invoices]);

  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(DISPUTE_REASONS[0]);

  const sel = open.find(o => o.id === invoiceId);

  const add = () => {
    if (!sel) { toast.error("Pick an invoice"); return; }
    const amt = Math.min(Number(amount) || sel.amount, sel.amount);
    if (amt <= 0) { toast.error("Enter a disputed amount"); return; }
    const row: DisputeRow = { id: crypto.randomUUID(), invoiceId: sel.id, customer: sel.customer, ref: sel.ref, disputed: amt, reason, status: "open", createdAt: new Date().toISOString() };
    setRows(prev => [row, ...prev]);
    setInvoiceId(""); setAmount("");
    toast.success("Dispute logged");
  };
  const toggle = (id: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, status: r.status === "open" ? "resolved" : "open" } : r));
  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const openDisputes = rows.filter(r => r.status === "open");
  const disputedValue = openDisputes.reduce((s, r) => s + r.disputed, 0);
  // Quarantine view: per disputed invoice, how much remains clean (still chaseable).
  const cleanByInvoice = openDisputes.map(r => {
    const inv = open.find(o => o.id === r.invoiceId);
    const total = inv?.amount ?? r.disputed;
    return { ...r, clean: Math.max(0, total - r.disputed) };
  });
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open disputes", value: openDisputes.length.toString(), color: "text-orange-400" },
          { label: "Disputed value", value: formatCurrency(disputedValue), color: "text-red-400" },
          { label: "Still chaseable (clean)", value: formatCurrency(cleanByInvoice.reduce((s, r) => s + r.clean, 0)), color: "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Log a dispute / deduction</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice</label>
            <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={inp}>
              <option value="">Select…</option>
              {open.map(o => <option key={o.id} value={o.id}>{o.customer} · {o.ref} · {formatCurrency(o.amount)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Disputed amount</label>
            <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder={sel ? String(sel.amount) : "0"} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className={inp}>
              {DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={12} /> Log dispute
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ShieldAlert size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No disputes logged. Capture short-payments with a reason so the undisputed balance still gets chased.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Customer", "Invoice", "Disputed", "Reason", "Logged", "Status", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{r.ref}</td>
                  <td className="px-4 py-3 tabular-nums text-red-400">{formatCurrency(r.disputed)}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{r.reason}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{format(parseISO(r.createdAt), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle(r.id)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === "open" ? "bg-orange-950/30 text-orange-400" : "bg-green-950/30 text-green-400"}`}>
                      {r.status === "open" ? "Open" : "Resolved"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Disputed amounts are quarantined — log them here so collectors keep chasing the clean balance while the deduction is investigated. Click a status to mark resolved.</p>
    </div>
  );
}

// ── CONCENTRATION RISK ──────────────────────────────────────────────────────
// Shows what share of open receivables each customer represents and flags
// dangerous dependency when one buyer exceeds a threshold of the AR book.
function ConcentrationRisk() {
  const { store } = useApp();
  const [threshold, setThreshold] = useState(25);
  const data = useMemo(() => {
    const open = (store.invoices ?? []).filter(i => i.status !== "paid");
    const map: Record<string, number> = {};
    for (const i of open) map[i.customer] = (map[i.customer] ?? 0) + i.amount;
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const rows = Object.entries(map)
      .map(([customer, amount]) => ({ customer, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.pct, 0);
    // Herfindahl index (0–10000) as a concentration measure.
    const hhi = Math.round(rows.reduce((s, r) => s + r.pct * r.pct, 0));
    return { rows, total, top3: Math.round(top3), hhi };
  }, [store.invoices]);

  if (data.rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <PieChart size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">No open receivables to assess concentration. Outstanding invoices populate this view.</p>
      </div>
    );
  }

  const concentrated = data.rows.filter(r => r.pct >= threshold);
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <PieChart size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Receivables concentration</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Alert threshold</label>
          <input type="range" min={10} max={60} value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-28 accent-[var(--color-primary)]" />
          <span className="text-sm font-bold w-10 tabular-nums">{threshold}%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open AR", value: formatCurrency(data.total), color: "text-[var(--color-text)]" },
          { label: "Top-3 share", value: `${data.top3}%`, color: data.top3 > 60 ? "text-red-400" : data.top3 > 40 ? "text-yellow-400" : "text-green-400" },
          { label: "HHI index", value: data.hhi.toString(), color: data.hhi > 2500 ? "text-red-400" : data.hhi > 1500 ? "text-yellow-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {concentrated.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg px-5 py-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">{concentrated.length} customer(s) each exceed {threshold}% of open AR</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">A default or delay from {concentrated.map(c => c.customer).join(", ")} would hit cash hard. Diversify or tighten their credit terms.</p>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Customer", "Open AR", "Share", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-3 font-semibold">{r.customer}</td>
                <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                <td className="px-4 py-3 tabular-nums">{Math.round(r.pct)}%</td>
                <td className="px-4 py-3 w-1/3">
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${r.pct >= threshold ? "bg-red-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">HHI = sum of squared market shares. Below 1500 = diversified, 1500–2500 = moderate, above 2500 = concentrated. Computed on open receivables only.</p>
    </div>
  );
}

// ── TOP-DEFAULTERS LEADERBOARD ──────────────────────────────────────────────
// Ranks chronic late payers by overdue value and worst days-overdue so the
// owner knows exactly where to focus recovery effort.
function TopDefaulters() {
  const { store } = useApp();
  const rows = useMemo(() => {
    const open = (store.invoices ?? []).filter(i => i.status !== "paid" && differenceInDays(new Date(), parseISO(i.dueDate)) > 0);
    const map: Record<string, { overdue: number; count: number; maxDays: number }> = {};
    for (const i of open) {
      const d = Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate)));
      if (!map[i.customer]) map[i.customer] = { overdue: 0, count: 0, maxDays: 0 };
      map[i.customer].overdue += i.amount;
      map[i.customer].count += 1;
      if (d > map[i.customer].maxDays) map[i.customer].maxDays = d;
    }
    return Object.entries(map)
      .map(([customer, d]) => ({ customer, ...d }))
      .sort((a, b) => b.overdue - a.overdue);
  }, [store.invoices]);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Trophy size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">No overdue accounts — nobody on the defaulters list. Overdue invoices rank customers here.</p>
      </div>
    );
  }

  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const medal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Defaulters", value: rows.length.toString(), color: "text-orange-400" },
          { label: "Total overdue", value: formatCurrency(totalOverdue), color: "text-red-400" },
          { label: "Worst (days)", value: `${Math.max(...rows.map(r => r.maxDays))}d`, color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Trophy size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Top defaulters</span>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Ranked by overdue value</span>
        </div>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["#", "Customer", "Overdue Value", "Overdue Invoices", "Worst Days", "Share"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.customer} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                <td className="px-4 py-3 font-bold">{medal(i)}</td>
                <td className="px-4 py-3 font-semibold">{r.customer}</td>
                <td className="px-4 py-3 tabular-nums text-red-400 font-semibold">{formatCurrency(r.overdue)}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{r.count}</td>
                <td className="px-4 py-3 tabular-nums">{r.maxDays}d</td>
                <td className="px-4 py-3 tabular-nums text-[var(--color-muted)]">{totalOverdue > 0 ? Math.round((r.overdue / totalOverdue) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Chronic late payers ranked by total overdue value across all their unpaid, past-due invoices. Focus recovery on the top of the list for the biggest cash impact.</p>
    </div>
  );
}

// ── CUSTOMER PAYMENT BEHAVIOR TIMELINE ──────────────────────────────────────
// Per-customer history of every invoice and how many days it took (or is taking)
// to pay — a quick read on whether a buyer is getting better or worse.
function PaymentBehavior() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const customers = Array.from(new Set(invoices.map(i => i.customer).filter(Boolean)));
  const [selected, setSelected] = useState(customers[0] ?? "");

  const rows = useMemo(() => {
    return invoices
      .filter(i => i.customer === selected)
      .map(i => {
        const due = parseISO(i.dueDate);
        const daysLate = i.status === "paid"
          ? Math.max(0, differenceInDays(parseISO(i.invoiceDate) > due ? parseISO(i.invoiceDate) : due, due)) // paid-late proxy
          : Math.max(0, differenceInDays(new Date(), due));
        return {
          id: i.id,
          ref: i.invoiceNumber || i.id.slice(0, 6),
          amount: i.amount,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          status: i.status,
          daysLate,
        };
      })
      .sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || ""));
  }, [invoices, selected]);

  const paidRows = rows.filter(r => r.status === "paid");
  const avgLate = paidRows.length > 0 ? Math.round(paidRows.reduce((s, r) => s + r.daysLate, 0) / paidRows.length) : 0;
  const onTimePct = paidRows.length > 0 ? Math.round((paidRows.filter(r => r.daysLate === 0).length / paidRows.length) * 100) : 0;

  if (customers.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <History size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to view per-customer payment behavior over time.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] min-w-[200px]">
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ml-auto flex gap-6">
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)]">Avg days late</p>
            <p className={`text-lg font-bold tabular-nums ${avgLate > 15 ? "text-red-400" : avgLate > 0 ? "text-yellow-400" : "text-green-400"}`}>{avgLate}d</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--color-muted)]">On-time rate</p>
            <p className={`text-lg font-bold tabular-nums ${onTimePct >= 80 ? "text-green-400" : onTimePct >= 50 ? "text-yellow-400" : "text-red-400"}`}>{onTimePct}%</p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <History size={13} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Payment timeline — {selected}</span>
          <span className="text-xs text-[var(--color-muted)] ml-auto">{rows.length} invoice(s)</span>
        </div>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {["Invoice", "Invoiced", "Due", "Amount", "Status", "Days late"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const statusCls = r.status === "paid" ? "bg-green-950/30 text-green-400" : r.status === "overdue" ? "bg-red-950/30 text-red-400" : "bg-yellow-950/30 text-yellow-400";
              return (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3 font-semibold">{r.ref}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{r.invoiceDate ? format(parseISO(r.invoiceDate), "d MMM yy") : "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{r.dueDate ? format(parseISO(r.dueDate), "d MMM yy") : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${statusCls}`}>{r.status}</span></td>
                  <td className={`px-4 py-3 tabular-nums ${r.daysLate > 0 ? "text-red-400" : "text-green-400"}`}>{r.daysLate > 0 ? `${r.daysLate}d` : "on time"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">For unpaid invoices, days late is measured from due date to today. For paid invoices we use the available dates as a proxy (the store does not record an explicit payment date), so treat paid-late figures as indicative.</p>
    </div>
  );
}

// ── REMINDER TEMPLATE A/B TESTER ────────────────────────────────────────────
// Build two reminder variants, record which one was used and whether it was
// followed by payment, and see which message collects faster over time.
type AbVariant = { subject: string; body: string };
type AbResult = { id: string; variant: "A" | "B"; customer: string; sentAt: string; paid: boolean };

function ReminderAbTester() {
  const { store } = useApp();
  const [variants, setVariants] = useFeatureState<{ a: AbVariant; b: AbVariant }>("col-ab-variants", {
    a: { subject: "Quick reminder on your invoice", body: "Hi, just a friendly nudge that your invoice is due. Could you confirm the payment date? Thanks!" },
    b: { subject: "Payment due — please action", body: "Dear customer, your invoice is now past due. Kindly clear it at the earliest to avoid any service disruption." },
  });
  const [results, setResults] = useFeatureState<AbResult[]>("col-ab-results", []);
  const [customer, setCustomer] = useState("");

  const customers = Array.from(new Set((store.invoices ?? []).map(i => i.customer).filter(Boolean)));

  const log = (variant: "A" | "B") => {
    if (!customer) { toast.error("Pick a customer"); return; }
    setResults(prev => [{ id: crypto.randomUUID(), variant, customer, sentAt: new Date().toISOString(), paid: false }, ...prev]);
    toast.success(`Logged variant ${variant} sent to ${customer}`);
  };
  const togglePaid = (id: string) => setResults(prev => prev.map(r => r.id === id ? { ...r, paid: !r.paid } : r));
  const remove = (id: string) => setResults(prev => prev.filter(r => r.id !== id));

  const stat = (v: "A" | "B") => {
    const sent = results.filter(r => r.variant === v);
    const paid = sent.filter(r => r.paid).length;
    return { sent: sent.length, paid, rate: sent.length > 0 ? Math.round((paid / sent.length) * 100) : 0 };
  };
  const a = stat("A"), b = stat("B");
  const winner = a.sent + b.sent === 0 ? null : a.rate === b.rate ? "Tie" : a.rate > b.rate ? "A" : "B";

  const setV = (key: "a" | "b", field: keyof AbVariant, val: string) =>
    setVariants(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {([["a", "A"], ["b", "B"]] as const).map(([key, label]) => {
          const s = label === "A" ? a : b;
          return (
            <div key={key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical size={14} className="text-[var(--color-primary)]" />
                  <span className="text-sm font-semibold">Variant {label}</span>
                </div>
                <span className="text-xs text-[var(--color-muted)]">{s.paid}/{s.sent} paid · {s.rate}%</span>
              </div>
              <input value={variants[key].subject} onChange={e => setV(key, "subject", e.target.value)} placeholder="Subject" className={inp} />
              <textarea value={variants[key].body} onChange={e => setV(key, "body", e.target.value)} rows={3} placeholder="Message body" className={`${inp} resize-none`} />
              <button onClick={() => log(label)} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
                <Save size={12} /> Log {label} as sent
              </button>
            </div>
          );
        })}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-[var(--color-muted)]">Customer for next send</label>
        <select value={customer} onChange={e => setCustomer(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] min-w-[180px]">
          <option value="">Select…</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {winner && (
          <span className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-green-950/30 text-green-400">
            {winner === "Tie" ? "Variants tied so far" : `Variant ${winner} is winning`}
          </span>
        )}
      </div>

      {results.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FlaskConical size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No sends logged yet. Pick a customer, log which variant you sent, then mark it paid to learn which message collects faster.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Variant", "Customer", "Sent", "Paid?", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                  <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">{r.variant}</span></td>
                  <td className="px-4 py-3 font-semibold">{r.customer}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{format(parseISO(r.sentAt), "d MMM yyyy")}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => togglePaid(r.id)} className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.paid ? "bg-green-950/30 text-green-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>
                      {r.paid ? "Paid" : "Not yet"}
                    </button>
                  </td>
                  <td className="px-4 py-3"><button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A simple, honest A/B log: record which message you sent and whether payment followed. The paid-rate per variant tells you which tone collects better. Sample sizes are small, so treat early winners as directional.</p>
    </div>
  );
}

// ── #76 COLLECTION LETTER SERIES GENERATOR ──────────────────────────────────
// Pick an overdue customer, generate the right escalation letter (reminder →
// second notice → final demand) based on days overdue, and print/copy it.
const LETTER_STAGES = [
  { id: "reminder", label: "1 · Reminder",     minDays: 1,  tone: (n: string, amt: string, d: number, ref: string) => `Dear ${n},\n\nThis is a friendly reminder that invoice ${ref} for ${amt} fell due ${d} day(s) ago and remains unpaid. We would appreciate settlement at your earliest convenience.\n\nIf payment has already been made, please disregard this note.\n\nRegards,\nAccounts Team` },
  { id: "second",   label: "2 · Second notice", minDays: 30, tone: (n: string, amt: string, d: number, ref: string) => `Dear ${n},\n\nDespite our earlier reminder, invoice ${ref} for ${amt} is now ${d} days overdue. We request that you clear this balance within 7 days to keep your account in good standing.\n\nPlease contact us immediately if there is any dispute or difficulty.\n\nRegards,\nAccounts Team` },
  { id: "final",    label: "3 · Final demand",  minDays: 60, tone: (n: string, amt: string, d: number, ref: string) => `Dear ${n},\n\nFINAL DEMAND FOR PAYMENT\n\nInvoice ${ref} for ${amt} is ${d} days overdue. This is our final request before we escalate recovery, which may include suspension of services and referral for legal action.\n\nKindly remit the full amount within 7 days of this letter.\n\nRegards,\nAccounts Team` },
] as const;

function CollectionLetterSeries() {
  const { store } = useApp();
  const overdue = useMemo(() => (store.invoices ?? [])
    .filter(i => i.status !== "paid")
    .map(i => ({ id: i.id, ref: i.invoiceNumber ?? i.id.slice(0, 8), customer: i.customer, amount: i.amount, days: Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate))) }))
    .filter(i => i.days > 0)
    .sort((a, b) => b.days - a.days), [store.invoices]);

  const [selId, setSelId] = useState("");
  const [stage, setStage] = useState<typeof LETTER_STAGES[number]["id"]>("reminder");
  const sel = overdue.find(o => o.id === selId) ?? null;
  const stageDef = LETTER_STAGES.find(s => s.id === stage)!;
  const suggested = !sel ? "reminder" : sel.days >= 60 ? "final" : sel.days >= 30 ? "second" : "reminder";

  const letter = sel ? stageDef.tone(sel.customer, formatCurrency(sel.amount), sel.days, sel.ref) : "";

  const copy = () => { navigator.clipboard.writeText(letter); toast.success("Letter copied"); };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to print"); return; }
    w.document.write(`<pre style="font-family:Georgia,serif;font-size:14px;white-space:pre-wrap;padding:40px;line-height:1.6">${letter.replace(/</g, "&lt;")}</pre>`);
    w.document.close(); w.print();
    toast.success("Print dialog opened");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Printer size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Collection letter series</span>
        </div>
        {overdue.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing overdue" description="No overdue invoices to chase. Generate letters once invoices cross their due date." />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Overdue invoice</label>
                <select value={selId} onChange={e => { setSelId(e.target.value); const o = overdue.find(x => x.id === e.target.value); if (o) setStage(o.days >= 60 ? "final" : o.days >= 30 ? "second" : "reminder"); }}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
                  <option value="">Select…</option>
                  {overdue.map(o => <option key={o.id} value={o.id}>{o.customer} · {formatCurrency(o.amount)} · {o.days}d</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Stage</label>
                <div className="flex gap-2">
                  {LETTER_STAGES.map(s => (
                    <button key={s.id} onClick={() => setStage(s.id)}
                      className={`flex-1 text-xs px-2 py-2 rounded-lg border font-medium transition-all ${stage === s.id ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {sel && suggested !== stage && (
              <p className="text-[11px] text-yellow-400">Suggested stage for {sel.days} days overdue: <span className="font-semibold">{LETTER_STAGES.find(s => s.id === suggested)!.label}</span></p>
            )}
            {sel && (
              <>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
                  <pre className="text-xs text-[var(--color-text)] whitespace-pre-wrap font-sans leading-relaxed">{letter}</pre>
                </div>
                <div className="flex gap-2">
                  <button onClick={print} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-4 py-2 rounded-lg text-sm hover:opacity-90"><Printer size={13} /> Print</button>
                  <button onClick={copy} className="flex items-center gap-1.5 border border-[var(--color-border)] px-4 py-2 rounded-lg text-sm font-medium hover:border-[var(--color-primary)]/40"><Copy size={13} /> Copy</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">A staged letter series escalates pressure honestly: reminder, second notice, then final demand. The stage is pre-selected from how many days the invoice is overdue.</p>
    </div>
  );
}

// ── #77 INTEREST-ON-DELAYED-PAYMENT INVOICE ─────────────────────────────────
// Compute interest on an overdue invoice (MSME Act default 18% p.a. or custom)
// and generate a debit-note line ready to bill the customer.
function InterestInvoiceGenerator() {
  const { store } = useApp();
  const overdue = useMemo(() => (store.invoices ?? [])
    .filter(i => i.status !== "paid")
    .map(i => ({ id: i.id, ref: i.invoiceNumber ?? i.id.slice(0, 8), customer: i.customer, amount: i.amount, days: Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate))) }))
    .filter(i => i.days > 0)
    .sort((a, b) => b.days - a.days), [store.invoices]);

  const [selId, setSelId] = useState("");
  const [rate, setRate] = useState("18");
  const [saved, setSaved] = useFeatureState<{ id: string; customer: string; ref: string; principal: number; days: number; rate: number; interest: number; createdAt: string }[]>("col-interest-invoices", []);

  const sel = overdue.find(o => o.id === selId) ?? null;
  const ratePct = parseFloat(rate) || 0;
  const interest = sel ? Math.round((sel.amount * (ratePct / 100) * sel.days) / 365) : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const generate = () => {
    if (!sel || interest <= 0) { toast.error("Pick an overdue invoice"); return; }
    setSaved([{ id: crypto.randomUUID(), customer: sel.customer, ref: sel.ref, principal: sel.amount, days: sel.days, rate: ratePct, interest, createdAt: new Date().toISOString() }, ...saved]);
    toast.success(`Interest debit note for ${formatCurrency(interest)} generated`);
  };
  const remove = (id: string) => setSaved(saved.filter(s => s.id !== id));
  const totalBilled = saved.reduce((s, r) => s + r.interest, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <IndianRupee size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Interest on delayed payment</span>
        </div>
        {overdue.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No overdue invoices" description="Interest accrues only on invoices past their due date." />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-[var(--color-muted)] block mb-1">Overdue invoice</label>
                <select value={selId} onChange={e => setSelId(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {overdue.map(o => <option key={o.id} value={o.id}>{o.customer} · {formatCurrency(o.amount)} · {o.days}d</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-muted)] block mb-1">Annual rate (%)</label>
                <input type="number" value={rate} onChange={e => setRate(e.target.value)} className={inp} />
              </div>
            </div>
            {sel && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)]">Principal</p><p className="text-sm font-bold">{formatCurrency(sel.amount)}</p></div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)]">Days overdue</p><p className="text-sm font-bold">{sel.days}</p></div>
                <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)]">Interest due</p><p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(interest)}</p></div>
              </div>
            )}
            <button onClick={generate} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-4 py-2 rounded-lg text-sm hover:opacity-90"><Plus size={13} /> Generate debit note</button>
          </>
        )}
      </div>

      {saved.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Generated interest notes</span>
            <span className="text-xs text-[var(--color-muted)]">Total billable: <span className="font-bold text-[var(--color-primary)]">{formatCurrency(totalBilled)}</span></span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {saved.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{r.customer} <span className="text-[var(--color-muted)] text-xs">· {r.ref}</span></p>
                  <p className="text-[11px] text-[var(--color-muted)]">{formatCurrency(r.principal)} · {r.days}d @ {r.rate}% · {format(parseISO(r.createdAt), "d MMM")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(r.interest)}</span>
                  <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simple interest = principal × rate × days ÷ 365. The MSMED Act allows up to 3× the RBI bank rate; 18% p.a. is a common default. Confirm your contract terms before billing.</p>
    </div>
  );
}

// ── #78 NACH / AUTO-DEBIT MANDATE TRACKER ───────────────────────────────────
// Track e-NACH mandates per customer: registration status, cap, next debit.
type NachRow = {
  id: string;
  customer: string;
  umrn: string;
  maxAmount: number;
  frequency: "monthly" | "as-presented" | "quarterly";
  nextDebit: string;
  status: "pending" | "active" | "rejected" | "cancelled";
  createdAt: string;
};

function NachMandateTracker() {
  const { store } = useApp();
  const customers = Array.from(new Set((store.invoices ?? []).map(i => i.customer).filter(Boolean)));
  const [rows, setRows] = useFeatureState<NachRow[]>("col-nach-mandates", []);

  const [customer, setCustomer] = useState("");
  const [umrn, setUmrn] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [frequency, setFrequency] = useState<NachRow["frequency"]>("monthly");
  const [nextDebit, setNextDebit] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const add = () => {
    const amt = parseFloat(maxAmount) || 0;
    if (!customer.trim() || amt <= 0) { toast.error("Pick a customer and a debit cap"); return; }
    setRows([{ id: crypto.randomUUID(), customer: customer.trim(), umrn: umrn.trim(), maxAmount: amt, frequency, nextDebit, status: "pending", createdAt: new Date().toISOString() }, ...rows]);
    setUmrn(""); setMaxAmount("");
    toast.success("Mandate logged as pending registration");
  };
  const setStatus = (id: string, status: NachRow["status"]) => setRows(rows.map(r => r.id === id ? { ...r, status } : r));
  const remove = (id: string) => setRows(rows.filter(r => r.id !== id));

  const active = rows.filter(r => r.status === "active").length;
  const coveredValue = rows.filter(r => r.status === "active").reduce((s, r) => s + r.maxAmount, 0);
  const STATUS_CLS: Record<NachRow["status"], string> = {
    pending: "bg-yellow-950/30 text-yellow-400", active: "bg-green-950/30 text-green-400",
    rejected: "bg-red-950/30 text-red-400", cancelled: "bg-[var(--color-accent)] text-[var(--color-muted)]",
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Banknote size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Register an e-NACH / auto-debit mandate</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
            {customers.length > 0 ? (
              <select value={customer} onChange={e => setCustomer(e.target.value)} className={inp}>
                <option value="">Select…</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Customer name" className={inp} />}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">UMRN / ref</label>
            <input value={umrn} onChange={e => setUmrn(e.target.value)} placeholder="optional" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Debit cap (₹)</label>
            <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value as NachRow["frequency"])} className={inp}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="as-presented">As presented</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Next debit</label>
            <input type="date" value={nextDebit} onChange={e => setNextDebit(e.target.value)} className={inp} />
          </div>
          <div className="flex items-end">
            <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 rounded-lg text-sm hover:opacity-90"><Plus size={13} /> Add mandate</button>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Mandates</span>
            <span className="text-xs text-[var(--color-muted)]">{active} active · covering {formatCurrency(coveredValue)}/cycle</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2.5 gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{r.customer} {r.umrn && <span className="text-[var(--color-muted)] text-xs">· {r.umrn}</span>}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{formatCurrency(r.maxAmount)} · {r.frequency} · next {format(parseISO(r.nextDebit), "d MMM yyyy")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_CLS[r.status]}`}>{r.status}</span>
                  {r.status === "pending" && <button onClick={() => setStatus(r.id, "active")} className="text-[11px] text-green-400 hover:underline">Activate</button>}
                  {r.status === "pending" && <button onClick={() => setStatus(r.id, "rejected")} className="text-[11px] text-red-400 hover:underline">Reject</button>}
                  {r.status === "active" && <button onClick={() => setStatus(r.id, "cancelled")} className="text-[11px] text-[var(--color-muted)] hover:underline">Cancel</button>}
                  <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Track e-NACH/auto-debit mandates so recurring AR collects itself. Status reflects bank registration; this log is your control sheet, not the NPCI register.</p>
    </div>
  );
}

// ── #79 AGEING BY SALESPERSON ───────────────────────────────────────────────
// Tag each customer with an account owner, then roll open AR up by owner so you
// can hold the right rep accountable for their book's ageing.
function AgeingBySalesperson() {
  const { store } = useApp();
  const customers = useMemo(() => Array.from(new Set((store.invoices ?? []).map(i => i.customer).filter(Boolean))), [store.invoices]);
  const [owners, setOwners] = useFeatureState<Record<string, string>>("col-customer-owners", {});

  const open = useMemo(() => (store.invoices ?? [])
    .filter(i => i.status !== "paid")
    .map(i => ({ customer: i.customer, amount: i.amount, aging: getAging(i.dueDate) })), [store.invoices]);

  type Bucket = { total: number; current: number; b1: number; b2: number; b3: number; b4: number };
  const byRep = useMemo(() => {
    const map: Record<string, Bucket> = {};
    open.forEach(o => {
      const rep = owners[o.customer] || "Unassigned";
      if (!map[rep]) map[rep] = { total: 0, current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
      const m = map[rep];
      m.total += o.amount;
      if (o.aging === "current") m.current += o.amount;
      else if (o.aging === "1-30") m.b1 += o.amount;
      else if (o.aging === "31-60") m.b2 += o.amount;
      else if (o.aging === "61-90") m.b3 += o.amount;
      else m.b4 += o.amount;
    });
    return Object.entries(map).map(([rep, b]) => ({ rep, ...b })).sort((a, b) => b.total - a.total);
  }, [open, owners]);

  const grand = byRep.reduce((s, r) => s + r.total, 0);
  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserCheck size={14} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold">Assign account owners</span>
        </div>
        {customers.length === 0 ? (
          <EmptyState icon={Users} title="No customers yet" description="Add invoices to assign account owners and age AR by rep." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {customers.map(c => (
              <div key={c} className="flex items-center justify-between gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                <span className="text-xs truncate">{c}</span>
                <input value={owners[c] ?? ""} onChange={e => setOwners({ ...owners, [c]: e.target.value })} placeholder="Sales rep" className={inp} />
              </div>
            ))}
          </div>
        )}
      </div>

      {byRep.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 overflow-x-auto">
          <span className="text-sm font-semibold">Open AR ageing by rep</span>
          <table className="w-full mt-3">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Rep", "Current", "1–30", "31–60", "61–90", "90+", "Total"].map(h => (
                  <th key={h} className={`text-xs font-semibold text-[var(--color-muted)] px-3 py-2 ${h === "Rep" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byRep.map(r => (
                <tr key={r.rep} className="border-b border-[var(--color-border)]/50">
                  <td className="text-xs font-medium px-3 py-2">{r.rep}</td>
                  <td className="text-xs text-right px-3 py-2">{formatCurrency(r.current)}</td>
                  <td className="text-xs text-right px-3 py-2 text-yellow-400">{formatCurrency(r.b1)}</td>
                  <td className="text-xs text-right px-3 py-2 text-orange-400">{formatCurrency(r.b2)}</td>
                  <td className="text-xs text-right px-3 py-2 text-red-400">{formatCurrency(r.b3)}</td>
                  <td className="text-xs text-right px-3 py-2 text-red-300 font-semibold">{formatCurrency(r.b4)}</td>
                  <td className="text-xs text-right px-3 py-2 font-bold">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="text-xs font-bold px-3 py-2">All reps</td>
                <td colSpan={5} />
                <td className="text-xs text-right px-3 py-2 font-bold text-[var(--color-primary)]">{formatCurrency(grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tag each customer with their sales rep, then see whose book is carrying the oldest AR. Unassigned customers roll up together until you assign an owner.</p>
    </div>
  );
}
