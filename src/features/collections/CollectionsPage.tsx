import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";
import { differenceInDays, format, parseISO } from "date-fns";
import {
  PhoneCall, MessageSquare, AlertTriangle, CheckCircle2, Clock, Filter,
  Send, TrendingDown, ArrowUpRight, Zap, RefreshCw, BarChart2, Star, FileText, Copy,
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

  const [view, setView]           = useState<"collections" | "profitability" | "clv" | "score" | "statement">("collections");
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
          <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
            {([
              { id: "collections",   label: "Collections",   icon: <PhoneCall size={10} /> },
              { id: "profitability", label: "Profitability",  icon: <BarChart2 size={10} /> },
              { id: "clv",           label: "CLV",            icon: <Star size={10} /> },
              { id: "score",         label: "Risk Score",     icon: <AlertTriangle size={10} /> },
              { id: "statement",     label: "Statement",      icon: <FileText size={10} /> },
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
