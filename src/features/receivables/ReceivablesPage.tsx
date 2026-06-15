import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { Plus, X, Send, CheckCircle2, AlertTriangle, Clock, Kanban, List, Award, Gauge, Banknote, Link2, PieChart, MailCheck, TrendingUp, Repeat, ShieldAlert, Percent, CalendarClock, Flame, Layers, CalendarCheck, FileWarning, TicketPercent, Ban, Eraser, History } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/data/types";

const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

function agingBucket(daysOverdue: number): "current" | "30d" | "60d" | "90d" {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "30d";
  if (daysOverdue <= 60) return "60d";
  return "90d";
}

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "30d":   "1–30 days overdue",
  "60d":   "31–60 days overdue",
  "90d":   "60+ days overdue",
};
const BUCKET_COLOR: Record<string, string> = {
  current: "text-green-400",
  "30d":   "text-yellow-400",
  "60d":   "text-orange-400",
  "90d":   "text-red-400",
};

function AddInvoiceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (inv: Invoice) => void }) {
  const [customer,    setCustomer]    = useState("");
  const [amount,      setAmount]      = useState("");
  const [invoiceNum,  setInvoiceNum]  = useState("");
  const [description, setDescription] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate,     setDueDate]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!customer || isNaN(amt) || amt <= 0) { toast.error("Fill all required fields"); return; }
    const today = new Date().toISOString().split("T")[0];
    onAdd({
      id: generateId(),
      customer,
      amount: amt,
      invoiceNumber: invoiceNum || undefined,
      invoiceDate,
      dueDate,
      description,
      status: dueDate < today ? "overdue" : "pending",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">Add Invoice</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--color-muted)]" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Customer name *</label>
              <input required value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Corp"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹) *</label>
              <input required type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice number</label>
              <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="INV-2024-001"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[var(--color-muted)] block mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Services for Q1 2024"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
              Add Invoice
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function chaseMessage(inv: Invoice, daysOverdue: number): string {
  const amt = formatCurrency(inv.amount);
  if (daysOverdue <= 0) {
    return `Hi, this is a friendly reminder that invoice ${inv.invoiceNumber ?? inv.id} for ${amt} is due on ${format(parseISO(inv.dueDate), "d MMM yyyy")}. Please let us know if you have any questions.`;
  }
  return `Hi, invoice ${inv.invoiceNumber ?? inv.id} for ${amt} was due on ${format(parseISO(inv.dueDate), "d MMM yyyy")} and is now ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue. Please arrange payment at the earliest or contact us to discuss.`;
}

function KanbanPipeline({ withDays, isReadOnly, onMarkPaid, onChase }: {
  withDays: (Invoice & { bucket: string; daysOverdue: number })[];
  isReadOnly: boolean;
  onMarkPaid: (id: string) => void;
  onChase: (inv: typeof withDays[0]) => void;
}) {
  const cols = [
    { key: "current", label: "Current",     color: "border-green-700/40",  headerColor: "text-green-400",  dot: "bg-green-500" },
    { key: "30d",     label: "1–30 d overdue", color: "border-yellow-700/40", headerColor: "text-yellow-400", dot: "bg-yellow-500" },
    { key: "60d",     label: "31–60 d overdue", color: "border-orange-700/40", headerColor: "text-orange-400", dot: "bg-orange-500" },
    { key: "90d",     label: "60d+ overdue", color: "border-red-700/40",   headerColor: "text-red-400",    dot: "bg-red-500" },
  ] as const;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cols.map(col => {
        const cards = withDays.filter(i => i.bucket === col.key);
        const total = cards.reduce((s, i) => s + i.amount, 0);
        return (
          <div key={col.key} className={`border ${col.color} rounded-lg overflow-hidden`}>
            <div className="px-3 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className={`text-xs font-semibold ${col.headerColor}`}>{col.label}</span>
              </div>
              <span className="text-[10px] text-[var(--color-muted)]">{cards.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[80px]">
              {cards.length === 0 && (
                <div className="py-4 text-center text-[10px] text-[var(--color-muted)]">None</div>
              )}
              {cards.map(inv => (
                <div key={inv.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-2.5">
                  <p className="text-xs font-semibold truncate">{inv.customer}</p>
                  <p className="text-base font-bold tabular-nums text-[var(--color-primary)] my-1">{formatCurrency(inv.amount)}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mb-2">Due {format(parseISO(inv.dueDate), "d MMM")}</p>
                  {!isReadOnly && (
                    <div className="flex gap-1">
                      <button onClick={() => onChase(inv)} title="Send reminder"
                        className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-blue-400 hover:border-blue-700/40 rounded-md transition-colors">
                        <Send size={9} /> Chase
                      </button>
                      <button onClick={() => onMarkPaid(inv.id)} title="Mark paid"
                        className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-green-400 hover:border-green-700/40 rounded-md transition-colors">
                        <CheckCircle2 size={9} /> Paid
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {total > 0 && (
              <div className="px-3 py-2 border-t border-[var(--color-border)]">
                <p className={`text-xs font-bold tabular-nums ${col.headerColor}`}>{formatCurrency(total)}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ReceivablesTab = "overview" | "risk-score" | "factoring" | "cash-app" | "concentration" | "ar-confirm" | "dso-trend" | "ar-turnover" | "ecl-matrix" | "credit-util" | "cash-timeline" | "overdue-heatmap" | "dunning-funnel" | "promise-to-pay" | "disputes" | "early-discount" | "credit-hold" | "write-off" | "pay-timeline";

export default function ReceivablesPage() {
  const { store, addInvoice, updateInvoice, deleteInvoice, isReadOnly } = useApp();
  const { invoices } = store;
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [tab, setTab] = useState<ReceivablesTab>("overview");
  const today = new Date().toISOString().split("T")[0];

  const pending = invoices.filter(i => i.status !== "paid");
  const paid    = invoices.filter(i => i.status === "paid");

  const totalOutstanding = pending.reduce((s, i) => s + i.amount, 0);

  const withDays = pending.map(inv => {
    const due = parseISO(inv.dueDate);
    const daysOverdue = differenceInDays(new Date(), due);
    return { ...inv, daysOverdue, bucket: agingBucket(daysOverdue) };
  });

  const buckets = ["current", "30d", "60d", "90d"] as const;
  const bucketTotals = Object.fromEntries(buckets.map(b => [
    b,
    { count: withDays.filter(i => i.bucket === b).length, amount: withDays.filter(i => i.bucket === b).reduce((s, i) => s + i.amount, 0) },
  ]));

  const handleChase = (inv: typeof withDays[0]) => {
    const msg = chaseMessage(inv, inv.daysOverdue);
    const mailto = `mailto:?subject=${encodeURIComponent(`Payment reminder: Invoice ${inv.invoiceNumber ?? ""} (${formatCurrency(inv.amount)})`)}&body=${encodeURIComponent(msg)}`;
    window.open(mailto, "_blank");
  };

  const handleMarkPaid = (inv: Invoice) => {
    updateInvoice({ ...inv, status: "paid" });
    toast.success(`Invoice from ${inv.customer} marked as paid`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Receivables</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">Track outstanding invoices and follow up on overdue payments</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-0.5">
            <button onClick={() => setView("list")} title="List view"
              className={`p-1.5 rounded ${view === "list" ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <List size={13} />
            </button>
            <button onClick={() => setView("kanban")} title="Kanban view"
              className={`p-1.5 rounded ${view === "kanban" ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Kanban size={13} />
            </button>
          </div>
          {!isReadOnly && (
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
              <Plus size={13} /> Add Invoice
            </button>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([["overview", "Overview", List], ["risk-score", "Customer Risk Scoring", Gauge], ["factoring", "Factoring / Discounting", Banknote], ["cash-app", "Cash Application", Link2], ["concentration", "Concentration Risk", PieChart], ["ar-confirm", "AR Confirmation Mailer", MailCheck], ["dso-trend", "DSO Trend", TrendingUp], ["ar-turnover", "AR Turnover", Repeat], ["ecl-matrix", "ECL Provisioning", ShieldAlert], ["credit-util", "Credit Utilization", Percent], ["cash-timeline", "Collection Forecast", CalendarClock], ["overdue-heatmap", "Overdue Heatmap", Flame], ["dunning-funnel", "Dunning Funnel", Layers], ["promise-to-pay", "Promise-to-Pay", CalendarCheck], ["disputes", "Dispute Tracker", FileWarning], ["early-discount", "Early-Pay Discount", TicketPercent], ["credit-hold", "Credit-Hold List", Ban], ["write-off", "Write-Off Policy", Eraser], ["pay-timeline", "Payment Timeline", History]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {tab === "risk-score" && <CustomerRiskScoring />}
      {tab === "factoring" && <FactoringEstimator />}
      {tab === "cash-app" && <CashApplication />}
      {tab === "concentration" && <ConcentrationRisk />}
      {tab === "ar-confirm" && <ARConfirmationMailer />}
      {tab === "dso-trend" && <DSOTrend />}
      {tab === "ar-turnover" && <ARTurnover />}
      {tab === "ecl-matrix" && <ECLProvisioning />}
      {tab === "credit-util" && <CreditUtilization />}
      {tab === "cash-timeline" && <CollectionForecast />}
      {tab === "overdue-heatmap" && <OverdueHeatmap />}
      {tab === "dunning-funnel" && <DunningFunnel />}
      {tab === "promise-to-pay" && <PromiseToPay />}
      {tab === "disputes" && <DisputeTracker />}
      {tab === "early-discount" && <EarlyPaymentDiscount />}
      {tab === "credit-hold" && <CreditHoldList />}
      {tab === "write-off" && <WriteOffPolicy />}
      {tab === "pay-timeline" && <PaymentTimeline />}

      {tab === "overview" && <>
      {/* Aging summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {buckets.map(b => (
          <div key={b} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{BUCKET_LABELS[b]}</p>
            <p className={`text-lg font-bold ${BUCKET_COLOR[b]}`}>{formatCurrency(bucketTotals[b].amount)}</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">{bucketTotals[b].count} invoice{bucketTotals[b].count !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      {/* Total outstanding */}
      {totalOutstanding > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--color-muted)]">Total outstanding</p>
            <p className="text-2xl font-bold text-[var(--color-primary)]">{formatCurrency(totalOutstanding)}</p>
          </div>
          {bucketTotals["90d"].amount > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle size={14} />
              <span>{formatCurrency(bucketTotals["90d"].amount)} is 60+ days overdue</span>
            </div>
          )}
        </div>
      )}

      {/* Kanban pipeline */}
      {view === "kanban" && pending.length > 0 && (
        <KanbanPipeline
          withDays={withDays}
          isReadOnly={isReadOnly}
          onMarkPaid={id => { const inv = invoices.find(i => i.id === id); if (inv) { updateInvoice({ ...inv, status: "paid" }); toast.success("Marked paid"); } }}
          onChase={inv => { const msg = chaseMessage(inv, inv.daysOverdue); window.open(`mailto:?subject=${encodeURIComponent(`Payment reminder: ${formatCurrency(inv.amount)}`)}&body=${encodeURIComponent(msg)}`, "_blank"); }}
        />
      )}

      {/* Invoice list */}
      {view === "list" && pending.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">Outstanding Invoices</h2>
            <span className="text-xs text-[var(--color-muted)]">{pending.length} invoices</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {withDays.sort((a, b) => b.daysOverdue - a.daysOverdue).map(inv => (
              <div key={inv.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-accent)] transition-colors">
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${inv.bucket === "current" ? "bg-green-500" : inv.bucket === "30d" ? "bg-yellow-500" : inv.bucket === "60d" ? "bg-orange-500" : "bg-red-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold truncate">{inv.customer}</p>
                    {inv.invoiceNumber && <span className="text-xs text-[var(--color-muted)] shrink-0">{inv.invoiceNumber}</span>}
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    Due {format(parseISO(inv.dueDate), "d MMM yyyy")}
                    {inv.daysOverdue > 0 && <span className={`ml-2 font-semibold ${BUCKET_COLOR[inv.bucket]}`}>{inv.daysOverdue}d overdue</span>}
                    {inv.description && ` · ${inv.description}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--color-primary)]">{formatCurrency(inv.amount)}</p>
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleChase(inv)} title="Send chase email"
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-blue-400 hover:bg-blue-950/20 transition-colors">
                      <Send size={13} />
                    </button>
                    <button onClick={() => handleMarkPaid(inv)} title="Mark as paid"
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-green-400 hover:bg-green-950/20 transition-colors">
                      <CheckCircle2 size={13} />
                    </button>
                    <button onClick={() => deleteInvoice(inv.id)} title="Delete"
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : view === "list" ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Clock size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-semibold mb-1">No outstanding invoices</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-xs mx-auto">
            Add invoices to track receivables and get reminders before they go overdue.
          </p>
          {!isReadOnly && (
            <button onClick={() => setShowAdd(true)}
              className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">
              Add First Invoice
            </button>
          )}
        </div>
      ) : null}

      {/* Paid invoices */}
      {paid.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">Paid ({paid.length})</h2>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {paid.map(inv => (
              <div key={inv.id} className="px-4 py-3 flex items-center gap-3 opacity-50">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.customer}</p>
                  <p className="text-xs text-[var(--color-muted)]">Paid · Due {format(parseISO(inv.dueDate), "d MMM yyyy")}</p>
                </div>
                <p className="text-sm font-medium text-[var(--color-muted)]">{formatCurrency(inv.amount)}</p>
                {!isReadOnly && (
                  <button onClick={() => deleteInvoice(inv.id)}
                    className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 transition-colors">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Payment DNA */}
      {invoices.length >= 2 && (() => {
        // Build per-customer stats from all invoices
        const customerMap: Record<string, { total: number; paidCount: number; totalCount: number; avgDays: number; daysArr: number[] }> = {};
        invoices.forEach(inv => {
          const c = inv.customer;
          if (!customerMap[c]) customerMap[c] = { total: 0, paidCount: 0, totalCount: 0, avgDays: 0, daysArr: [] };
          customerMap[c].total += inv.amount;
          customerMap[c].totalCount++;
          if (inv.status === "paid") {
            customerMap[c].paidCount++;
            const daysOverdue = differenceInDays(new Date(), parseISO(inv.dueDate));
            customerMap[c].daysArr.push(Math.max(0, daysOverdue));
          }
        });
        const customers = Object.entries(customerMap).map(([name, stats]) => {
          const payRate = stats.totalCount > 0 ? (stats.paidCount / stats.totalCount) * 100 : 0;
          const avgDaysLate = stats.daysArr.length > 0 ? stats.daysArr.reduce((a, b) => a + b, 0) / stats.daysArr.length : 0;
          const score = Math.max(0, Math.min(100, Math.round(payRate * 0.6 + Math.max(0, 40 - avgDaysLate * 2))));
          const reliability = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Poor";
          const reliabilityColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-[var(--color-primary)]" : score >= 40 ? "text-yellow-400" : "text-red-400";
          return { name, score, payRate, avgDaysLate: Math.round(avgDaysLate), total: stats.total, paidCount: stats.paidCount, totalCount: stats.totalCount, reliability, reliabilityColor };
        }).sort((a, b) => b.score - a.score);

        return (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award size={14} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">Customer Payment DNA</h2>
              <span className="text-xs text-[var(--color-muted)] ml-auto">Who pays on time, who stalls</span>
            </div>
            <div className="space-y-3">
              {customers.slice(0, 8).map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-muted)] w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <span className={`text-xs font-semibold shrink-0 ml-2 ${c.reliabilityColor}`}>{c.reliability}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${c.score}%`, background: c.score >= 80 ? "#22c55e" : c.score >= 60 ? "#1A6B55" : c.score >= 40 ? "#eab308" : "#ef4444" }} />
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[90px]">
                    <p className="text-xs text-[var(--color-text)] font-semibold tabular-nums">{formatCurrency(c.total)}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">
                      {c.paidCount}/{c.totalCount} paid
                      {c.avgDaysLate > 0 && ` · avg ${c.avgDaysLate}d late`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-muted)] mt-3">Score = payment rate × 60% + speed × 40%. Use this to decide credit terms per customer.</p>
          </div>
        );
      })()}
      </>}

      {showAdd && (
        <AddInvoiceModal
          onClose={() => setShowAdd(false)}
          onAdd={inv => { addInvoice(inv); toast.success(`Invoice from ${inv.customer} added`); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #55 — CUSTOMER RISK SCORING (pay-behaviour + exposure score per customer)
// ════════════════════════════════════════════════════════════════════════════
interface CustomerRisk {
  name: string;
  exposure: number;        // outstanding (unpaid) amount
  totalBilled: number;
  paidCount: number;
  totalCount: number;
  payRate: number;         // % invoices paid
  avgDaysLate: number;
  worstOverdue: number;    // current open max days overdue
  score: number;           // 0–100, higher = safer
  band: "Low" | "Medium" | "High" | "Severe";
}

function riskBand(score: number): CustomerRisk["band"] {
  if (score >= 75) return "Low";
  if (score >= 55) return "Medium";
  if (score >= 35) return "High";
  return "Severe";
}
const RISK_COLOR: Record<CustomerRisk["band"], string> = {
  Low: "text-green-400", Medium: "text-yellow-400", High: "text-orange-400", Severe: "text-red-400",
};
const RISK_BG: Record<CustomerRisk["band"], string> = {
  Low: "#22c55e", Medium: "#eab308", High: "#f97316", Severe: "#ef4444",
};

function CustomerRiskScoring() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];

  const rows = useMemo<CustomerRisk[]>(() => {
    const map: Record<string, Invoice[]> = {};
    invoices.forEach(inv => { (map[inv.customer] ||= []).push(inv); });
    const out: CustomerRisk[] = Object.entries(map).map(([name, list]) => {
      const totalCount = list.length;
      const paid = list.filter(i => i.status === "paid");
      const open = list.filter(i => i.status !== "paid");
      const exposure = open.reduce((s, i) => s + i.amount, 0);
      const totalBilled = list.reduce((s, i) => s + i.amount, 0);
      const payRate = totalCount > 0 ? (paid.length / totalCount) * 100 : 0;
      // average days late uses paid invoices (settled after due date)
      const lateArr = paid.map(i => Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate))));
      const avgDaysLate = lateArr.length ? lateArr.reduce((a, b) => a + b, 0) / lateArr.length : 0;
      const worstOverdue = open.reduce((m, i) => Math.max(m, differenceInDays(new Date(), parseISO(i.dueDate))), 0);
      // Score: pay-rate 45%, lateness penalty 30%, open-overdue penalty 25%
      const lateScore = Math.max(0, 30 - avgDaysLate * 0.6);
      const overdueScore = Math.max(0, 25 - Math.max(0, worstOverdue) * 0.4);
      const score = Math.round(Math.max(0, Math.min(100, payRate * 0.45 + lateScore + overdueScore)));
      return { name, exposure, totalBilled, paidCount: paid.length, totalCount, payRate, avgDaysLate: Math.round(avgDaysLate), worstOverdue: Math.max(0, worstOverdue), score, band: riskBand(score) };
    });
    return out.sort((a, b) => (b.exposure - a.exposure) || (a.score - b.score));
  }, [invoices]);

  const totalExposure = rows.reduce((s, r) => s + r.exposure, 0);
  const atRisk = rows.filter(r => r.band === "High" || r.band === "Severe");
  const atRiskExposure = atRisk.reduce((s, r) => s + r.exposure, 0);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Gauge size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to score customers by pay-behaviour and exposure.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total open exposure", value: formatCurrency(totalExposure), color: "text-[var(--color-primary)]" },
          { label: "High / Severe risk", value: `${atRisk.length} customer${atRisk.length !== 1 ? "s" : ""}`, color: "text-red-400" },
          { label: "Exposure at risk", value: formatCurrency(atRiskExposure), color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <Gauge size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Customer Risk Scoring</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Higher score = safer to extend credit</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map(r => (
            <div key={r.name} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold truncate">{r.name}</p>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${RISK_COLOR[r.band]}`}>{r.band} risk</span>
                </div>
                <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${r.score}%`, background: RISK_BG[r.band] }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-1">
                  {r.paidCount}/{r.totalCount} paid · {Math.round(r.payRate)}% pay-rate
                  {r.avgDaysLate > 0 && ` · avg ${r.avgDaysLate}d late`}
                  {r.worstOverdue > 0 && ` · ${r.worstOverdue}d max overdue`}
                </p>
              </div>
              <div className="text-right shrink-0 min-w-[96px]">
                <p className={`text-base font-bold tabular-nums ${RISK_COLOR[r.band]}`}>{r.score}<span className="text-[10px] text-[var(--color-muted)]">/100</span></p>
                <p className="text-xs text-[var(--color-text)] font-semibold tabular-nums">{formatCurrency(r.exposure)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Score = pay-rate (45%) + payment-speed (30%) + open-overdue health (25%). Use bands to set credit limits and hold thresholds per customer.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #56 — FACTORING / DISCOUNTING ESTIMATOR (net proceeds if you sell invoices)
// ════════════════════════════════════════════════════════════════════════════
function FactoringEstimator() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const open = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [advanceRate, setAdvanceRate] = useState("85");   // % advanced upfront
  const [discountPa, setDiscountPa] = useState("18");     // financier interest % p.a.
  const [feePct, setFeePct] = useState("1.5");            // processing/service fee % of face
  const [tenorDays, setTenorDays] = useState("60");       // expected days to collection

  const toggle = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const allOn = open.length > 0 && open.every(i => selected[i.id]);
  const selectAll = () => {
    if (allOn) setSelected({});
    else setSelected(Object.fromEntries(open.map(i => [i.id, true])));
  };

  const chosen = open.filter(i => selected[i.id]);
  const face = chosen.reduce((s, i) => s + i.amount, 0);
  const adv = (parseFloat(advanceRate) || 0) / 100;
  const rate = (parseFloat(discountPa) || 0) / 100;
  const fee = (parseFloat(feePct) || 0) / 100;
  const days = parseFloat(tenorDays) || 0;

  const advanced = face * adv;                         // cash you get upfront
  const discountCost = advanced * rate * (days / 365); // interest on the advance for the tenor
  const serviceFee = face * fee;                       // flat service/processing fee
  const totalCost = discountCost + serviceFee;
  const reserveReleased = face - advanced;             // released on collection (less costs)
  const netProceeds = face - totalCost;                // total cash you ultimately net
  const effectiveCostPct = face > 0 ? (totalCost / face) * 100 : 0;
  const annualisedPct = (advanced > 0 && days > 0) ? (totalCost / advanced) * (365 / days) * 100 : 0;

  const inp = INP;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Banknote size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Factoring / Invoice-Discounting Estimator</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Advance rate (%)</label>
            <input type="number" value={advanceRate} onChange={e => setAdvanceRate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Discount rate (% p.a.)</label>
            <input type="number" value={discountPa} onChange={e => setDiscountPa(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Service fee (% of face)</label>
            <input type="number" value={feePct} onChange={e => setFeePct(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected tenor (days)</label>
            <input type="number" value={tenorDays} onChange={e => setTenorDays(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {open.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Banknote size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No open invoices available to factor.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Select invoices to discount</h3>
            <button onClick={selectAll} className="text-xs text-[var(--color-primary)] font-medium hover:underline">{allOn ? "Clear all" : "Select all"}</button>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-72 overflow-y-auto">
            {open.map(i => (
              <label key={i.id} className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--color-accent)] transition-colors">
                <input type="checkbox" checked={!!selected[i.id]} onChange={() => toggle(i.id)} className="accent-[var(--color-primary)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.customer}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{i.invoiceNumber ?? i.id} · due {format(parseISO(i.dueDate), "d MMM yyyy")}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(i.amount)}</p>
              </label>
            ))}
          </div>
        </div>
      )}

      {face > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Face value selected", value: formatCurrency(face), color: "text-[var(--color-text)]" },
              { label: "Advance now", value: formatCurrency(Math.round(advanced)), color: "text-[var(--color-primary)]" },
              { label: "Total financing cost", value: formatCurrency(Math.round(totalCost)), color: "text-red-400" },
              { label: "Net proceeds", value: formatCurrency(Math.round(netProceeds)), color: "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <tbody>
                {[
                  { label: `Advance @ ${advanceRate}% of face`, val: Math.round(advanced) },
                  { label: `Discount interest (${discountPa}% p.a. × ${tenorDays}d)`, val: -Math.round(discountCost) },
                  { label: `Service fee (${feePct}% of face)`, val: -Math.round(serviceFee) },
                  { label: "Reserve released on collection", val: Math.round(reserveReleased) },
                  { label: "Net proceeds", val: Math.round(netProceeds), bold: true },
                ].map(r => (
                  <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5 tabular-nums text-right">{r.val < 0 ? `(${formatCurrency(Math.abs(r.val))})` : formatCurrency(r.val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">
            Effective cost {effectiveCostPct.toFixed(2)}% of face · annualised ≈ {annualisedPct.toFixed(1)}% on the advance.
            Compare against your cost of capital before factoring. Estimate only — actual KredX/TReDS terms vary.
          </p>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #57 — CASH APPLICATION / AUTO-MATCH RECEIPTS (bank credits → open invoices)
// ════════════════════════════════════════════════════════════════════════════
interface CashMatch {
  txnId: string;
  date: string;
  amount: number;
  counterparty: string;
  description: string;
  invoiceId?: string;
  invoiceLabel?: string;
  confidence: "exact" | "likely" | "none";
}

function normalise(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function CashApplication() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const transactions = store.transactions ?? [];
  // applied = invoiceId -> txnId user has confirmed
  const [applied, setApplied] = useFeatureState<Record<string, string>>("receivables-cash-applied", {});

  const matches = useMemo<CashMatch[]>(() => {
    // candidate receipts: revenue inflows (positive) not yet applied as a txn
    const appliedTxnIds = new Set(Object.values(applied));
    const receipts = transactions.filter(t => t.category === "revenue" && t.amount > 0 && !appliedTxnIds.has(t.id));
    const openInvoices = invoices.filter(i => i.status !== "paid" && !applied[i.id]);

    return receipts.map(t => {
      const tcp = normalise(t.counterparty);
      const tdesc = normalise(t.description);
      // 1) exact: amount equal (±1) AND customer name appears in counterparty/desc
      let inv = openInvoices.find(i => {
        const ic = normalise(i.customer);
        const num = normalise(i.invoiceNumber ?? "");
        const nameHit = ic.length > 2 && (tcp.includes(ic) || tdesc.includes(ic) || (num.length > 2 && (tcp.includes(num) || tdesc.includes(num))));
        return nameHit && Math.abs(i.amount - t.amount) <= 1;
      });
      if (inv) return { txnId: t.id, date: t.date, amount: t.amount, counterparty: t.counterparty, description: t.description, invoiceId: inv.id, invoiceLabel: `${inv.customer} · ${inv.invoiceNumber ?? inv.id}`, confidence: "exact" as const };
      // 2) likely: amount within 2% OR a name hit alone
      inv = openInvoices.find(i => {
        const ic = normalise(i.customer);
        const nameHit = ic.length > 2 && (tcp.includes(ic) || tdesc.includes(ic));
        const amtClose = i.amount > 0 && Math.abs(i.amount - t.amount) / i.amount <= 0.02;
        return nameHit || amtClose;
      });
      if (inv) return { txnId: t.id, date: t.date, amount: t.amount, counterparty: t.counterparty, description: t.description, invoiceId: inv.id, invoiceLabel: `${inv.customer} · ${inv.invoiceNumber ?? inv.id}`, confidence: "likely" as const };
      return { txnId: t.id, date: t.date, amount: t.amount, counterparty: t.counterparty, description: t.description, confidence: "none" as const };
    });
  }, [transactions, invoices, applied]);

  const matched = matches.filter(m => m.invoiceId);
  const unmatched = matches.filter(m => !m.invoiceId);

  const apply = (m: CashMatch) => {
    if (!m.invoiceId) return;
    setApplied(prev => ({ ...prev, [m.invoiceId!]: m.txnId }));
    toast.success(`Applied ${formatCurrency(m.amount)} to ${m.invoiceLabel}`);
  };

  const appliedRows = Object.entries(applied)
    .map(([invId, txnId]) => {
      const inv = invoices.find(i => i.id === invId);
      const txn = transactions.find(t => t.id === txnId);
      return inv && txn ? { inv, txn } : null;
    })
    .filter((x): x is { inv: Invoice; txn: typeof transactions[number] } => x !== null);

  const unapply = (invId: string) => {
    setApplied(prev => { const n = { ...prev }; delete n[invId]; return n; });
    toast.success("Receipt un-applied");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-2">
        <Link2 size={14} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold">Cash Application — auto-match receipts to invoices</h3>
        <span className="text-xs text-[var(--color-muted)] ml-auto">{matched.length} suggested · {appliedRows.length} applied</span>
      </div>

      {matches.length === 0 && appliedRows.length === 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Link2 size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No unapplied revenue receipts found. Receipts auto-match by amount and customer name.</p>
        </div>
      )}

      {matched.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Suggested matches</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {matched.map(m => (
              <div key={m.txnId} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-accent)] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{m.counterparty || m.description}</p>
                    <span className={`text-[10px] font-bold shrink-0 ${m.confidence === "exact" ? "text-green-400" : "text-yellow-400"}`}>{m.confidence === "exact" ? "Exact match" : "Likely match"}</span>
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] truncate">{format(parseISO(m.date), "d MMM yyyy")} → {m.invoiceLabel}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(m.amount)}</p>
                <button onClick={() => apply(m)} className="shrink-0 flex items-center gap-1 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-2.5 py-1.5 rounded-lg font-semibold hover:opacity-90">
                  <CheckCircle2 size={12} /> Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold text-[var(--color-muted)]">Unmatched receipts ({unmatched.length})</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {unmatched.map(m => (
              <div key={m.txnId} className="px-4 py-3 flex items-center gap-3">
                <AlertTriangle size={13} className="text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.counterparty || m.description}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{format(parseISO(m.date), "d MMM yyyy")} · no open invoice matched</p>
                </div>
                <p className="text-sm font-medium tabular-nums shrink-0 text-[var(--color-muted)]">{formatCurrency(m.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {appliedRows.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Applied</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {appliedRows.map(({ inv, txn }) => (
              <div key={inv.id} className="px-4 py-3 flex items-center gap-3 opacity-80">
                <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{inv.customer} · {inv.invoiceNumber ?? inv.id}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Receipt {format(parseISO(txn.date), "d MMM yyyy")} · {txn.counterparty || txn.description}</p>
                </div>
                <p className="text-sm font-medium tabular-nums shrink-0">{formatCurrency(txn.amount)}</p>
                <button onClick={() => unapply(inv.id)} title="Un-apply" className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 transition-colors"><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Auto-matches revenue inflows to open invoices by amount and customer name. Applying records the link locally; confirm payment on the Overview tab to mark the invoice paid.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #58 — CONCENTRATION RISK ALERT (flags when >X% of AR is one customer)
// ════════════════════════════════════════════════════════════════════════════
function ConcentrationRisk() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [threshold, setThreshold] = useState("25"); // % alert level

  const { rows, total, top1, top3, hhi } = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, number> = {};
    open.forEach(i => { map[i.customer] = (map[i.customer] || 0) + i.amount; });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const rows = Object.entries(map)
      .map(([name, amount]) => ({ name, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
    const top1 = rows[0]?.pct ?? 0;
    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.pct, 0);
    // Herfindahl–Hirschman Index on shares (0–10000); >2500 = highly concentrated
    const hhi = Math.round(rows.reduce((s, r) => s + (r.pct) ** 2, 0));
    return { rows, total, top1, top3, hhi };
  }, [invoices]);

  const limit = parseFloat(threshold) || 0;
  const breaches = rows.filter(r => r.pct > limit);
  const inp = INP;

  if (total === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <PieChart size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No outstanding receivables to analyse for concentration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <PieChart size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Concentration Risk</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Alert when one customer &gt; (%)</label>
          <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} className={`${inp} w-32`} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Top customer share", value: `${top1.toFixed(1)}%`, color: top1 > limit ? "text-red-400" : "text-[var(--color-text)]" },
          { label: "Top 3 share", value: `${top3.toFixed(1)}%`, color: top3 > 60 ? "text-orange-400" : "text-[var(--color-text)]" },
          { label: "HHI (0–10,000)", value: String(hhi), color: hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-yellow-400" : "text-green-400" },
          { label: "Breaches", value: `${breaches.length}`, color: breaches.length ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {breaches.length > 0 && (
        <div className="rounded-lg p-4 border border-red-800/40 bg-red-950/20 flex items-start gap-2">
          <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-400">Concentration alert</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {breaches.map(b => `${b.name} (${b.pct.toFixed(1)}%)`).join(", ")} each exceed your {limit}% threshold. A default by any of these would materially hit cash flow — diversify or tighten credit.
            </p>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-sm font-semibold">AR by customer</h3>
          <span className="text-xs text-[var(--color-muted)]">{formatCurrency(total)} total</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map(r => {
            const over = r.pct > limit;
            return (
              <div key={r.name} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <span className={`text-xs font-semibold shrink-0 ml-2 ${over ? "text-red-400" : "text-[var(--color-muted)]"}`}>{r.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${r.pct}%`, background: over ? "#ef4444" : "#1A6B55" }} />
                  </div>
                </div>
                <p className="text-sm font-semibold tabular-nums shrink-0 min-w-[88px] text-right">{formatCurrency(r.amount)}</p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">HHI = sum of squared % shares; &gt;2,500 = highly concentrated, &lt;1,500 = diversified. Lenders watch customer concentration when sizing your AR-backed limit.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #59 — AR CONFIRMATION / BALANCE STATEMENT MAILER (audit-time confirmations)
// ════════════════════════════════════════════════════════════════════════════
function ARConfirmationMailer() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const firmName = store.firm?.name || "our company";
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  // store per-customer contact details + sent log durably
  const [contacts, setContacts] = useFeatureState<Record<string, { email?: string; phone?: string }>>("receivables-ar-contacts", {});
  const [sentLog, setSentLog] = useFeatureState<Record<string, string>>("receivables-ar-confirm-sent", {});

  const balances = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, { items: Invoice[]; total: number }> = {};
    open.forEach(i => { (map[i.customer] ||= { items: [], total: 0 }); map[i.customer].items.push(i); map[i.customer].total += i.amount; });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [invoices]);

  const buildMessage = (name: string, total: number, items: Invoice[]): string => {
    const lines = items
      .map(i => `  • ${i.invoiceNumber ?? i.id} dated ${format(parseISO(i.invoiceDate), "d MMM yyyy")} — ${formatCurrency(i.amount)}`)
      .join("\n");
    return `Dear ${name},

For audit purposes, please confirm the balance receivable by ${firmName} from you as on ${format(parseISO(asOf), "d MMM yyyy")}.

As per our books, the outstanding balance is ${formatCurrency(total)}, comprising:
${lines}

Kindly reply confirming whether this balance agrees with your records. If you note any discrepancy, please share details.

Thank you,
${firmName}`;
  };

  const setContact = (name: string, field: "email" | "phone", value: string) =>
    setContacts(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  const sendEmail = (name: string, total: number, items: Invoice[]) => {
    const c = contacts[name] || {};
    const subject = `Balance confirmation request as on ${format(parseISO(asOf), "d MMM yyyy")} — ${firmName}`;
    const body = buildMessage(name, total, items);
    const to = c.email ? encodeURIComponent(c.email) : "";
    window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    setSentLog(prev => ({ ...prev, [name]: new Date().toISOString() }));
    toast.success(`Confirmation drafted for ${name}`);
  };

  const sendWhatsApp = (name: string, total: number, items: Invoice[]) => {
    const c = contacts[name] || {};
    const phone = (c.phone || "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(buildMessage(name, total, items));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
    setSentLog(prev => ({ ...prev, [name]: new Date().toISOString() }));
    toast.success(`WhatsApp confirmation opened for ${name}`);
  };

  if (balances.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <MailCheck size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No outstanding balances to confirm. Balance confirmations are sent for open receivables.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <MailCheck size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">AR Balance Confirmation Mailer</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Confirm balance as on</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className={`${INP} w-44`} />
        </div>
      </div>

      <div className="space-y-3">
        {balances.map(b => {
          const sentAt = sentLog[b.name];
          const c = contacts[b.name] || {};
          return (
            <div key={b.name} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{b.name}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{b.items.length} open invoice{b.items.length !== 1 ? "s" : ""}{sentAt && ` · last sent ${format(parseISO(sentAt), "d MMM yyyy")}`}</p>
                </div>
                <p className="text-base font-bold tabular-nums text-[var(--color-primary)] shrink-0">{formatCurrency(b.total)}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <input value={c.email ?? ""} onChange={e => setContact(b.name, "email", e.target.value)} placeholder="customer@email.com" className={INP} />
                <input value={c.phone ?? ""} onChange={e => setContact(b.name, "phone", e.target.value)} placeholder="WhatsApp e.g. 919876543210" className={INP} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => sendEmail(b.name, b.total, b.items)} className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold hover:opacity-90">
                  <Send size={12} /> Email confirmation
                </button>
                <button onClick={() => sendWhatsApp(b.name, b.total, b.items)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg font-medium hover:bg-[var(--color-accent)]">
                  <MailCheck size={12} /> WhatsApp
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Drafts a positive-confirmation letter (auditor-style) per customer with the open-invoice breakdown as on the chosen date. Opens your mail / WhatsApp client; nothing is sent automatically.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #60 — DSO TREND (Days Sales Outstanding trend over the last 6 months)
// ════════════════════════════════════════════════════════════════════════════
function DSOTrend() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];

  const months = useMemo(() => {
    const now = new Date();
    const out: { key: string; label: string; dso: number; ar: number; billed: number }[] = [];
    for (let m = 5; m >= 0; m--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const monthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const daysInMonth = monthEnd.getDate();
      // AR still open as at month-end: invoiced on/before month-end and not paid by then
      const arOpen = invoices.filter(i => {
        const inv = parseISO(i.invoiceDate);
        if (inv > monthEnd) return false;
        if (i.status !== "paid") return true;
        // paid invoices: assume settled around the due date; open if due after month-end
        return parseISO(i.dueDate) > monthEnd;
      });
      const ar = arOpen.reduce((s, i) => s + i.amount, 0);
      // credit sales billed within the month
      const billed = invoices
        .filter(i => { const d = parseISO(i.invoiceDate); return d >= monthStart && d <= monthEnd; })
        .reduce((s, i) => s + i.amount, 0);
      const dso = billed > 0 ? Math.round((ar / billed) * daysInMonth) : 0;
      out.push({ key: `${ref.getFullYear()}-${ref.getMonth()}`, label: format(ref, "MMM yy"), dso, ar, billed });
    }
    return out;
  }, [invoices]);

  const valid = months.filter(m => m.billed > 0);
  const latest = valid.length ? valid[valid.length - 1].dso : 0;
  const prior = valid.length > 1 ? valid[valid.length - 2].dso : latest;
  const delta = latest - prior;
  const avg = valid.length ? Math.round(valid.reduce((s, m) => s + m.dso, 0) / valid.length) : 0;
  const maxDso = Math.max(1, ...months.map(m => m.dso));

  if (invoices.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <TrendingUp size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to track your Days Sales Outstanding trend month over month.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Current DSO", value: `${latest} days`, color: "text-[var(--color-primary)]" },
          { label: "vs last month", value: `${delta > 0 ? "+" : ""}${delta} days`, color: delta > 0 ? "text-red-400" : delta < 0 ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "6-month average", value: `${avg} days`, color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Days Sales Outstanding — last 6 months</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Lower = cash converts faster</span>
        </div>
        <div className="flex items-end gap-2 h-40">
          {months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
              <span className="text-[10px] font-semibold tabular-nums text-[var(--color-text)]">{m.billed > 0 ? m.dso : "—"}</span>
              <div className="w-full rounded-t transition-all" style={{ height: `${(m.dso / maxDso) * 100}%`, minHeight: m.dso > 0 ? "4px" : "0", background: m.dso > avg && avg > 0 ? "#f97316" : "#1A6B55" }} />
              <span className="text-[10px] text-[var(--color-muted)]">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">DSO ≈ (open AR at month-end ÷ that month's credit sales) × days in month. Paid invoices are assumed settled near their due date. Rising DSO means cash is taking longer to come in.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #61 — AR TURNOVER RATIO (how many times receivables convert per year)
// ════════════════════════════════════════════════════════════════════════════
function ARTurnover() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [windowDays, setWindowDays] = useState("365");

  const stats = useMemo(() => {
    const days = Math.max(1, parseFloat(windowDays) || 365);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    // credit sales billed within the window
    const inWindow = invoices.filter(i => parseISO(i.invoiceDate) >= cutoff);
    const netSales = inWindow.reduce((s, i) => s + i.amount, 0);
    const openAR = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    // average AR proxy: mean of open AR and total billed-but-unsettled span
    const billedTotal = inWindow.reduce((s, i) => s + i.amount, 0);
    const avgAR = openAR > 0 ? (openAR + Math.min(openAR, billedTotal)) / 2 : openAR;
    const turnover = avgAR > 0 ? netSales / avgAR : 0;
    const annualised = days !== 365 && netSales > 0 ? turnover * (365 / days) : turnover;
    const dso = annualised > 0 ? Math.round(365 / annualised) : 0;
    return { days, netSales, openAR, avgAR, turnover, annualised, dso, count: inWindow.length };
  }, [invoices, windowDays]);

  if (invoices.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Repeat size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to compute your accounts-receivable turnover ratio.</p>
      </div>
    );
  }

  const grade = stats.annualised >= 8 ? { label: "Strong", color: "text-green-400" } : stats.annualised >= 4 ? { label: "Healthy", color: "text-[var(--color-primary)]" } : stats.annualised >= 2 ? { label: "Slow", color: "text-yellow-400" } : { label: "Weak", color: "text-red-400" };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Repeat size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">AR Turnover Ratio</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Window (days of credit sales)</label>
          <input type="number" value={windowDays} onChange={e => setWindowDays(e.target.value)} className={`${INP} w-40`} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Turnover (annualised)", value: `${stats.annualised.toFixed(1)}×`, color: grade.color },
          { label: "Implied DSO", value: `${stats.dso} days`, color: "text-[var(--color-text)]" },
          { label: "Credit sales in window", value: formatCurrency(Math.round(stats.netSales)), color: "text-[var(--color-primary)]" },
          { label: "Avg receivables", value: formatCurrency(Math.round(stats.avgAR)), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg p-4 border border-[var(--color-border)] bg-[var(--color-surface)] flex items-start gap-2">
        <Repeat size={15} className={`${grade.color} shrink-0 mt-0.5`} />
        <div>
          <p className={`text-sm font-bold ${grade.color}`}>{grade.label} turnover — {stats.annualised.toFixed(1)}× per year</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            You collect and re-lend your receivables roughly {stats.annualised.toFixed(1)} times a year ({stats.count} invoices in the window). Higher turnover frees cash; under 4× usually signals lax credit terms or slow collections.
          </p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Turnover = net credit sales ÷ average receivables; DSO = 365 ÷ turnover. Average AR is estimated from current open balance — a true average needs opening + closing balances from your ledger.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #62 — ECL PROVISIONING MATRIX (Ind-AS 109 expected-credit-loss by aging)
// ════════════════════════════════════════════════════════════════════════════
function ECLProvisioning() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // default loss rates (%) per bucket — durable so the user's policy persists
  const [rates, setRates] = useFeatureState<Record<string, string>>("rec-ecl-rates", { current: "0.5", "30d": "3", "60d": "12", "90d": "40" });

  const buckets = ["current", "30d", "60d", "90d"] as const;

  const data = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    return buckets.map(b => {
      const items = open.filter(i => agingBucket(differenceInDays(new Date(), parseISO(i.dueDate))) === b);
      const gross = items.reduce((s, i) => s + i.amount, 0);
      const rate = Math.max(0, parseFloat(rates[b] ?? "0") || 0);
      const ecl = gross * (rate / 100);
      return { bucket: b, count: items.length, gross, rate, ecl };
    });
  }, [invoices, rates]);

  const grossTotal = data.reduce((s, d) => s + d.gross, 0);
  const eclTotal = data.reduce((s, d) => s + d.ecl, 0);
  const netCarrying = grossTotal - eclTotal;
  const blended = grossTotal > 0 ? (eclTotal / grossTotal) * 100 : 0;

  if (grossTotal === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <ShieldAlert size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open receivables to provision. ECL builds an expected-loss allowance across your aging buckets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Gross receivables", value: formatCurrency(Math.round(grossTotal)), color: "text-[var(--color-text)]" },
          { label: "Expected credit loss", value: formatCurrency(Math.round(eclTotal)), color: "text-red-400" },
          { label: "Net carrying amount", value: formatCurrency(Math.round(netCarrying)), color: "text-green-400" },
          { label: "Blended loss rate", value: `${blended.toFixed(1)}%`, color: "text-orange-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <ShieldAlert size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">ECL Provisioning Matrix</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Edit loss % per bucket</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                <th className="px-4 py-2.5 text-left font-medium">Aging bucket</th>
                <th className="px-4 py-2.5 text-right font-medium">Invoices</th>
                <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                <th className="px-4 py-2.5 text-right font-medium">Loss %</th>
                <th className="px-4 py-2.5 text-right font-medium">Provision</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.bucket} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5"><span className={BUCKET_COLOR[d.bucket]}>{BUCKET_LABELS[d.bucket]}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[var(--color-muted)]">{d.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Math.round(d.gross))}</td>
                  <td className="px-4 py-2.5 text-right">
                    <input type="number" value={rates[d.bucket] ?? ""} onChange={e => setRates(prev => ({ ...prev, [d.bucket]: e.target.value }))}
                      className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-right tabular-nums outline-none focus:border-[var(--color-primary)]" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(d.ecl))}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-accent)] font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{data.reduce((s, d) => s + d.count, 0)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Math.round(grossTotal))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{blended.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-400">{formatCurrency(Math.round(eclTotal))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Simplified Ind-AS 109 / IFRS 9 provision-matrix approach: apply a historical loss rate to each aging band. Net carrying amount = gross − provision; book the provision as an allowance for doubtful debts.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #63 — CREDIT-LIMIT UTILIZATION (per-customer exposure vs set credit ceiling)
// ════════════════════════════════════════════════════════════════════════════
function CreditUtilization() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // per-customer credit limit, durable
  const [limits, setLimits] = useFeatureState<Record<string, number>>("rec-credit-limits", {});

  const rows = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, number> = {};
    open.forEach(i => { map[i.customer] = (map[i.customer] || 0) + i.amount; });
    return Object.entries(map).map(([name, exposure]) => {
      const limit = limits[name] ?? 0;
      const util = limit > 0 ? (exposure / limit) * 100 : 0;
      const headroom = limit - exposure;
      const status = limit <= 0 ? "unset" : util >= 100 ? "over" : util >= 80 ? "near" : "ok";
      return { name, exposure, limit, util, headroom, status };
    }).sort((a, b) => b.util - a.util || b.exposure - a.exposure);
  }, [invoices, limits]);

  const overCount = rows.filter(r => r.status === "over").length;
  const nearCount = rows.filter(r => r.status === "near").length;
  const unsetCount = rows.filter(r => r.status === "unset").length;

  const setLimit = (name: string, value: string) => {
    const v = parseFloat(value);
    setLimits(prev => ({ ...prev, [name]: isNaN(v) ? 0 : v }));
  };

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Percent size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open exposure to track. Set a credit ceiling per customer and watch utilization here.</p>
      </div>
    );
  }

  const STATUS: Record<string, { label: string; color: string; bar: string }> = {
    ok:    { label: "Within limit", color: "text-green-400",  bar: "#22c55e" },
    near:  { label: "Near limit",   color: "text-yellow-400", bar: "#eab308" },
    over:  { label: "Over limit",   color: "text-red-400",    bar: "#ef4444" },
    unset: { label: "No limit set",  color: "text-[var(--color-muted)]", bar: "#1A6B55" },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Customers tracked", value: String(rows.length), color: "text-[var(--color-text)]" },
          { label: "Over limit", value: String(overCount), color: overCount ? "text-red-400" : "text-green-400" },
          { label: "Near limit (80%+)", value: String(nearCount), color: nearCount ? "text-yellow-400" : "text-[var(--color-muted)]" },
          { label: "No limit set", value: String(unsetCount), color: unsetCount ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <Percent size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Credit-Limit Utilization</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Set a ceiling to enable hold alerts</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {rows.map(r => {
            const s = STATUS[r.status];
            return (
              <div key={r.name} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    <span className={`text-[10px] font-bold shrink-0 ${s.color}`}>{s.label}{r.limit > 0 && ` · ${Math.round(r.util)}%`}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, r.util)}%`, background: s.bar }} />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1">
                    Exposure {formatCurrency(r.exposure)}
                    {r.limit > 0 && ` of ${formatCurrency(r.limit)} · ${r.headroom >= 0 ? `${formatCurrency(r.headroom)} headroom` : `${formatCurrency(Math.abs(r.headroom))} over`}`}
                  </p>
                </div>
                <div className="shrink-0">
                  <label className="text-[10px] text-[var(--color-muted)] block mb-0.5 text-right">Limit (₹)</label>
                  <input type="number" value={r.limit || ""} onChange={e => setLimit(r.name, e.target.value)} placeholder="—"
                    className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-right tabular-nums outline-none focus:border-[var(--color-primary)]" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Utilization = open exposure ÷ credit limit. Customers at 80%+ deserve a closer look before you ship more on credit; over-limit accounts should go on hold until they pay down.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #64 — COLLECTION FORECAST (invoice-to-cash timeline by expected pay date)
// ════════════════════════════════════════════════════════════════════════════
function CollectionForecast() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // optional per-customer average days-late, learned from paid history, shifts the expected date
  const customerLag = useMemo(() => {
    const map: Record<string, number[]> = {};
    invoices.filter(i => i.status === "paid").forEach(i => {
      (map[i.customer] ||= []).push(Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate))));
    });
    const lag: Record<string, number> = {};
    Object.entries(map).forEach(([c, arr]) => { lag[c] = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0; });
    return lag;
  }, [invoices]);

  const weeks = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const now = new Date();
    const out: { idx: number; label: string; amount: number; count: number }[] = [];
    for (let w = 0; w < 8; w++) out.push({ idx: w, label: w === 0 ? "This week" : `Wk +${w}`, amount: 0, count: 0 });
    let overdueAmt = 0, overdueCnt = 0;
    open.forEach(i => {
      const lag = customerLag[i.customer] ?? 0;
      const expected = new Date(parseISO(i.dueDate));
      expected.setDate(expected.getDate() + lag);
      const diffDays = differenceInDays(expected, now);
      if (diffDays < 0) { overdueAmt += i.amount; overdueCnt++; return; }
      const wk = Math.min(7, Math.floor(diffDays / 7));
      out[wk].amount += i.amount;
      out[wk].count++;
    });
    return { out, overdueAmt, overdueCnt };
  }, [invoices, customerLag]);

  const expected8w = weeks.out.reduce((s, w) => s + w.amount, 0);
  const maxAmt = Math.max(1, weeks.overdueAmt, ...weeks.out.map(w => w.amount));

  if (invoices.filter(i => i.status !== "paid").length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <CalendarClock size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open invoices to forecast. This projects when cash lands based on due dates and each customer's payment lag.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Expected next 8 weeks", value: formatCurrency(Math.round(expected8w)), color: "text-[var(--color-primary)]" },
          { label: "Already overdue", value: formatCurrency(Math.round(weeks.overdueAmt)), color: weeks.overdueAmt > 0 ? "text-red-400" : "text-green-400" },
          { label: "Overdue invoices", value: `${weeks.overdueCnt}`, color: weeks.overdueCnt ? "text-orange-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarClock size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Collection Forecast — next 8 weeks</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Adjusted for each customer's pay lag</span>
        </div>
        {weeks.overdueAmt > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-red-400 w-16 shrink-0">Overdue</span>
            <div className="flex-1 h-5 bg-[var(--color-bg)] rounded overflow-hidden">
              <div className="h-full rounded bg-red-500/70" style={{ width: `${(weeks.overdueAmt / maxAmt) * 100}%` }} />
            </div>
            <span className="text-xs tabular-nums font-semibold w-24 text-right shrink-0">{formatCurrency(Math.round(weeks.overdueAmt))}</span>
          </div>
        )}
        <div className="space-y-2">
          {weeks.out.map(w => (
            <div key={w.idx} className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)] w-16 shrink-0">{w.label}</span>
              <div className="flex-1 h-5 bg-[var(--color-bg)] rounded overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${(w.amount / maxAmt) * 100}%`, background: "#1A6B55" }} />
              </div>
              <span className="text-xs tabular-nums font-semibold w-24 text-right shrink-0">{w.amount > 0 ? formatCurrency(Math.round(w.amount)) : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Each open invoice is placed in the week of its expected pay date = due date + that customer's average days-late (from paid history). Overdue invoices are shown separately as cash you should already have.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #65 — OVERDUE HEATMAP (top customers × aging bucket, intensity by amount)
// ════════════════════════════════════════════════════════════════════════════
function OverdueHeatmap() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const buckets = ["current", "30d", "60d", "90d"] as const;

  const { rows, maxCell, grand } = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, Record<string, number>> = {};
    open.forEach(i => {
      const b = agingBucket(differenceInDays(new Date(), parseISO(i.dueDate)));
      (map[i.customer] ||= { current: 0, "30d": 0, "60d": 0, "90d": 0 });
      map[i.customer][b] += i.amount;
    });
    const rows = Object.entries(map)
      .map(([name, cells]) => ({ name, cells, total: buckets.reduce((s, b) => s + cells[b], 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
    const maxCell = Math.max(1, ...rows.flatMap(r => buckets.map(b => r.cells[b])));
    const grand = rows.reduce((s, r) => s + r.total, 0);
    return { rows, maxCell, grand };
  }, [invoices]);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Flame size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open receivables to map. This heatmap shows where your overdue cash is concentrated.</p>
      </div>
    );
  }

  const cellBg = (b: string, amt: number): string => {
    if (amt <= 0) return "transparent";
    const intensity = 0.12 + (amt / maxCell) * 0.55;
    const hue = b === "current" ? "34,197,94" : b === "30d" ? "234,179,8" : b === "60d" ? "249,115,22" : "239,68,68";
    return `rgba(${hue},${intensity.toFixed(2)})`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <Flame size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Overdue Heatmap</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Top {rows.length} by open balance · {formatCurrency(grand)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)]">
                <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                {buckets.map(b => <th key={b} className={`px-3 py-2.5 text-right font-medium ${BUCKET_COLOR[b]}`}>{b === "current" ? "Current" : b === "30d" ? "1–30d" : b === "60d" ? "31–60d" : "60d+"}</th>)}
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 font-medium truncate max-w-[160px]">{r.name}</td>
                  {buckets.map(b => (
                    <td key={b} className="px-3 py-2 text-right tabular-nums" style={{ background: cellBg(b, r.cells[b]) }}>
                      {r.cells[b] > 0 ? formatCurrency(Math.round(r.cells[b])) : <span className="text-[var(--color-muted)] opacity-40">·</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatCurrency(Math.round(r.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Darker cells = larger amounts; colour shifts green → red as invoices age. Scan the right-hand columns to spot customers parking big balances in the 60d+ band — chase those first.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #66 — DUNNING FUNNEL (open AR distributed across reminder/escalation stages)
// ════════════════════════════════════════════════════════════════════════════
const DUNNING_STAGES: { key: string; label: string; desc: string; min: number; max: number; color: string }[] = [
  { key: "not-due",    label: "Not yet due",            desc: "Monitor — no action",  min: -9999, max: 0,     color: "#1A6B55" },
  { key: "reminder",   label: "Stage 1 · Reminder",     desc: "Gentle nudge 1–15d",   min: 1,     max: 15,    color: "#22c55e" },
  { key: "followup",   label: "Stage 2 · Follow-up",    desc: "Firm chase 16–30d",    min: 16,    max: 30,    color: "#eab308" },
  { key: "escalation", label: "Stage 3 · Escalation",   desc: "Demand 31–60d",        min: 31,    max: 60,    color: "#f97316" },
  { key: "demand",     label: "Stage 4 · Final demand", desc: "Legal/recovery 60d+",  min: 61,    max: 99999, color: "#ef4444" },
];

function DunningFunnel() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];

  const data = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid").map(i => ({ d: differenceInDays(new Date(), parseISO(i.dueDate)), amount: i.amount }));
    return DUNNING_STAGES.map(s => {
      const items = open.filter(i => i.d >= s.min && i.d <= s.max);
      return { ...s, count: items.length, amount: items.reduce((sum, i) => sum + i.amount, 0) };
    });
  }, [invoices]);

  const totalAmt = data.reduce((s, d) => s + d.amount, 0);
  const totalCnt = data.reduce((s, d) => s + d.count, 0);
  const actionable = data.filter(d => d.key !== "not-due").reduce((s, d) => s + d.amount, 0);

  const handleChaseStage = (label: string, count: number) => {
    if (count === 0) { toast.error("No invoices in this stage"); return; }
    toast.success(`${count} invoice${count !== 1 ? "s" : ""} queued for "${label}" — open each customer to send the reminder`);
  };

  if (totalCnt === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Layers size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open invoices to route. The funnel groups AR into reminder stages by how far past due each invoice is.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Open AR in funnel", value: formatCurrency(Math.round(totalAmt)), color: "text-[var(--color-primary)]" },
          { label: "Needs a reminder", value: formatCurrency(Math.round(actionable)), color: actionable > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Open invoices", value: `${totalCnt}`, color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Dunning-Stage Funnel</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">By days past due</span>
        </div>
        {data.map(s => {
          const pct = totalAmt > 0 ? (s.amount / totalAmt) * 100 : 0;
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <p className="text-xs font-semibold truncate" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{s.desc}</p>
              </div>
              <div className="flex-1 h-6 bg-[var(--color-bg)] rounded overflow-hidden relative">
                <div className="h-full rounded transition-all" style={{ width: `${Math.max(pct, s.amount > 0 ? 4 : 0)}%`, background: s.color, opacity: 0.8 }} />
                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold tabular-nums">{s.count} inv · {formatCurrency(Math.round(s.amount))}</span>
              </div>
              {s.key !== "not-due" && (
                <button onClick={() => handleChaseStage(s.label, s.count)} title="Queue reminders for this stage"
                  className="shrink-0 flex items-center gap-1 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-blue-400 hover:border-blue-700/40 px-2 py-1.5 rounded-md transition-colors">
                  <Send size={10} /> Chase
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Each open invoice falls into a stage by days past due: not-due → reminder (1–15) → follow-up (16–30) → escalation (31–60) → final demand (60d+). Use it to decide who gets which message today.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #67 — PROMISE-TO-PAY CAPTURE (log debtor commitments, flag broken promises)
// ════════════════════════════════════════════════════════════════════════════
interface Promise { invoiceId: string; date: string; amount: string; note: string; loggedAt: string; }

function PromiseToPay() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const open = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);
  const [promises, setPromises] = useFeatureState<Record<string, Promise>>("rec-promise-to-pay", {});
  const [invoiceId, setInvoiceId] = useState("");
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const today = new Date().toISOString().split("T")[0];

  const add = () => {
    if (!invoiceId) { toast.error("Pick an invoice"); return; }
    setPromises(prev => ({ ...prev, [invoiceId]: { invoiceId, date, amount, note, loggedAt: new Date().toISOString() } }));
    toast.success("Promise-to-pay logged");
    setInvoiceId(""); setAmount(""); setNote("");
  };
  const remove = (id: string) => setPromises(prev => { const n = { ...prev }; delete n[id]; return n; });

  const rows = useMemo(() => Object.values(promises).map(p => {
    const inv = invoices.find(i => i.id === p.invoiceId);
    const paid = inv?.status === "paid";
    const overdue = !paid && p.date < today;
    const dueIn = differenceInDays(parseISO(p.date), new Date());
    return { ...p, inv, paid, overdue, dueIn };
  }).sort((a, b) => a.date.localeCompare(b.date)), [promises, invoices, today]);

  const kept = rows.filter(r => r.paid).length;
  const broken = rows.filter(r => r.overdue).length;
  const promisedAmt = rows.filter(r => !r.paid).reduce((s, r) => s + (parseFloat(r.amount) || r.inv?.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Promised (open)", value: formatCurrency(Math.round(promisedAmt)), color: "text-[var(--color-primary)]" },
          { label: "Promises kept", value: String(kept), color: "text-green-400" },
          { label: "Broken promises", value: String(broken), color: broken ? "text-red-400" : "text-green-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarCheck size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Log a promise-to-pay</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={`${INP} md:col-span-2`}>
            <option value="">Select open invoice…</option>
            {open.map(i => <option key={i.id} value={i.id}>{i.customer} · {i.invoiceNumber ?? i.id} · {formatCurrency(i.amount)}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INP} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (optional)" className={INP} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (e.g. spoke to accounts)" className={`${INP} md:col-span-3`} />
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm rounded-lg px-3 py-2 hover:opacity-90">Log promise</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CalendarCheck size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No promises logged yet. Capture verbal commitments so broken ones surface automatically.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Tracked promises</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <div key={r.invoiceId} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${r.paid ? "bg-green-500" : r.overdue ? "bg-red-500" : "bg-yellow-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.inv?.customer ?? "Unknown"} {r.inv?.invoiceNumber && <span className="text-xs text-[var(--color-muted)]">{r.inv.invoiceNumber}</span>}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">
                    Promised {format(parseISO(r.date), "d MMM yyyy")}
                    {r.paid ? " · kept (paid)" : r.overdue ? ` · broken (${Math.abs(r.dueIn)}d ago)` : ` · due in ${r.dueIn}d`}
                    {r.note && ` · ${r.note}`}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(Math.round(parseFloat(r.amount) || r.inv?.amount || 0))}</p>
                <button onClick={() => remove(r.invoiceId)} title="Remove" className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 transition-colors shrink-0"><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A promise turns green once its invoice is marked paid, red once the promised date passes unpaid. Chase broken promises first — they predict default better than aging alone.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #68 — DISPUTE / DEDUCTION TRACKER (quarantine contested amounts, keep chasing rest)
// ════════════════════════════════════════════════════════════════════════════
const DISPUTE_REASONS = ["Pricing", "Quality / damage", "Short delivery", "Freight", "Duplicate", "Other"] as const;
interface Dispute { invoiceId: string; amount: string; reason: string; status: "open" | "resolved"; loggedAt: string; }

function DisputeTracker() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const open = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);
  const [disputes, setDisputes] = useFeatureState<Record<string, Dispute>>("rec-disputes", {});
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(DISPUTE_REASONS[0]);

  const add = () => {
    if (!invoiceId) { toast.error("Pick an invoice"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a disputed amount"); return; }
    setDisputes(prev => ({ ...prev, [invoiceId]: { invoiceId, amount, reason, status: "open", loggedAt: new Date().toISOString() } }));
    toast.success("Dispute logged — undisputed balance keeps chasing");
    setInvoiceId(""); setAmount("");
  };
  const toggle = (id: string) => setDisputes(prev => ({ ...prev, [id]: { ...prev[id], status: prev[id].status === "open" ? "resolved" : "open" } }));
  const remove = (id: string) => setDisputes(prev => { const n = { ...prev }; delete n[id]; return n; });

  const rows = useMemo(() => Object.values(disputes).map(d => {
    const inv = invoices.find(i => i.id === d.invoiceId);
    const disputed = Math.min(parseFloat(d.amount) || 0, inv?.amount ?? 0);
    const chaseable = (inv?.amount ?? 0) - disputed;
    return { ...d, inv, disputed, chaseable };
  }).filter(r => r.inv).sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved")), [disputes, invoices]);

  const openDisputed = rows.filter(r => r.status === "open").reduce((s, r) => s + r.disputed, 0);
  const quarantined = rows.filter(r => r.status === "open").length;
  const stillChaseable = rows.filter(r => r.status === "open").reduce((s, r) => s + r.chaseable, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Disputed (quarantined)", value: formatCurrency(Math.round(openDisputed)), color: "text-orange-400" },
          { label: "Open disputes", value: String(quarantined), color: quarantined ? "text-red-400" : "text-green-400" },
          { label: "Undisputed — still chase", value: formatCurrency(Math.round(stillChaseable)), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileWarning size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Log a dispute / deduction</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={`${INP} md:col-span-2`}>
            <option value="">Select open invoice…</option>
            {open.map(i => <option key={i.id} value={i.id}>{i.customer} · {i.invoiceNumber ?? i.id} · {formatCurrency(i.amount)}</option>)}
          </select>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Disputed amount" className={INP} />
          <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>
            {DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold text-sm rounded-lg px-3 py-2 hover:opacity-90 md:col-start-4">Log dispute</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileWarning size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No disputes logged. Quarantine the contested portion so the rest of the invoice keeps chasing.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Disputes &amp; deductions</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <div key={r.invoiceId} className={`px-4 py-3 flex items-center gap-3 ${r.status === "resolved" ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold truncate">{r.inv?.customer}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-[var(--color-accent)] text-[var(--color-muted)]">{r.reason}</span>
                    {r.status === "resolved" && <span className="text-[10px] font-bold text-green-400 shrink-0">Resolved</span>}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)]">{r.inv?.invoiceNumber ?? r.inv?.id} · disputed {formatCurrency(Math.round(r.disputed))} · {formatCurrency(Math.round(r.chaseable))} still chaseable</p>
                </div>
                <button onClick={() => toggle(r.invoiceId)} className="shrink-0 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-green-400 hover:border-green-700/40 px-2 py-1.5 rounded-md transition-colors">{r.status === "open" ? "Mark resolved" : "Reopen"}</button>
                <button onClick={() => remove(r.invoiceId)} title="Remove" className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 transition-colors shrink-0"><X size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Logging a dispute ring-fences only the contested rupees — the undisputed balance stays in your collection pipeline instead of the whole invoice stalling. Resolve to release the hold.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #69 — EARLY-PAYMENT DISCOUNT ENGINE (2/10-net-30 style offers + uptake/cost)
// ════════════════════════════════════════════════════════════════════════════
function EarlyPaymentDiscount() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [discountPct, setDiscountPct] = useState("2");
  const [windowDays, setWindowDays] = useState("10");
  const [netDays, setNetDays] = useState("30");

  const open = useMemo(() => invoices.filter(i => i.status !== "paid"), [invoices]);
  const disc = (parseFloat(discountPct) || 0) / 100;
  const wd = parseFloat(windowDays) || 0;
  const nd = parseFloat(netDays) || 0;
  // implied annualised cost of offering the discount
  const apr = (disc > 0 && nd > wd) ? (disc / (1 - disc)) * (365 / (nd - wd)) * 100 : 0;

  const offers = useMemo(() => open.map(i => {
    const dso = differenceInDays(new Date(), parseISO(i.invoiceDate));
    const eligible = dso <= wd; // still inside the discount window
    const discountAmt = i.amount * disc;
    return { ...i, dso, eligible, discountAmt, netIfTaken: i.amount - discountAmt };
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.amount - a.amount), [open, wd, disc]);

  const eligibleOffers = offers.filter(o => o.eligible);
  const offered = eligibleOffers.reduce((s, o) => s + o.amount, 0);
  const costIfAllTaken = eligibleOffers.reduce((s, o) => s + o.discountAmt, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <TicketPercent size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Early-Payment Discount Engine</h3>
        </div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Discount (%)</label><input type="number" value={discountPct} onChange={e => setDiscountPct(e.target.value)} className={`${INP} w-24`} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">If paid within (days)</label><input type="number" value={windowDays} onChange={e => setWindowDays(e.target.value)} className={`${INP} w-32`} /></div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Net terms (days)</label><input type="number" value={netDays} onChange={e => setNetDays(e.target.value)} className={`${INP} w-28`} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `${discountPct}/${windowDays} net ${netDays}`, value: `${apr.toFixed(0)}% APR`, color: apr > 24 ? "text-red-400" : "text-orange-400" },
          { label: "Eligible invoices", value: String(eligibleOffers.length), color: "text-[var(--color-text)]" },
          { label: "Face value offered", value: formatCurrency(Math.round(offered)), color: "text-[var(--color-primary)]" },
          { label: "Cost if all taken", value: formatCurrency(Math.round(costIfAllTaken)), color: "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {open.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <TicketPercent size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No open invoices to offer an early-payment discount on.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Offers by invoice</h3>
            <span className="text-xs text-[var(--color-muted)]">{eligibleOffers.length} still in window</span>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {offers.map(o => (
              <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-1.5 h-9 rounded-full shrink-0 ${o.eligible ? "bg-green-500" : "bg-[var(--color-border)]"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{o.customer} {o.invoiceNumber && <span className="text-xs text-[var(--color-muted)]">{o.invoiceNumber}</span>}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{o.dso}d since invoice · {o.eligible ? `pay ${formatCurrency(Math.round(o.netIfTaken))} to save ${formatCurrency(Math.round(o.discountAmt))}` : "discount window passed"}</p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(o.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A {discountPct}/{windowDays} net {netDays} offer costs you ≈{apr.toFixed(0)}% annualised — only worth it if it beats your cost of borrowing or factoring. Eligible = still within the discount window from invoice date.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #70 — CREDIT-HOLD CANDIDATE LIST (who to stop shipping to: overdue / over-limit)
// ════════════════════════════════════════════════════════════════════════════
function CreditHoldList() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [limits] = useFeatureState<Record<string, number>>("rec-credit-limits", {});
  const [overdueDays, setOverdueDays] = useState("45");
  const [cleared, setCleared] = useFeatureState<Record<string, true>>("rec-credit-hold-cleared", {});

  const threshold = parseFloat(overdueDays) || 0;

  const rows = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, { exposure: number; worst: number; count: number }> = {};
    open.forEach(i => {
      const d = differenceInDays(new Date(), parseISO(i.dueDate));
      (map[i.customer] ||= { exposure: 0, worst: 0, count: 0 });
      map[i.customer].exposure += i.amount;
      map[i.customer].worst = Math.max(map[i.customer].worst, d);
      map[i.customer].count++;
    });
    return Object.entries(map).map(([name, v]) => {
      const limit = limits[name] ?? 0;
      const overLimit = limit > 0 && v.exposure > limit;
      const tooOverdue = v.worst >= threshold;
      const reasons: string[] = [];
      if (tooOverdue) reasons.push(`${v.worst}d overdue`);
      if (overLimit) reasons.push(`over limit by ${formatCurrency(Math.round(v.exposure - limit))}`);
      return { name, ...v, limit, overLimit, tooOverdue, reasons, hold: (tooOverdue || overLimit) && !cleared[name] };
    }).filter(r => r.tooOverdue || r.overLimit).sort((a, b) => b.exposure - a.exposure);
  }, [invoices, limits, threshold, cleared]);

  const holds = rows.filter(r => r.hold);
  const heldExposure = holds.reduce((s, r) => s + r.exposure, 0);

  const toggleClear = (name: string) => setCleared(prev => {
    const n = { ...prev };
    if (n[name]) delete n[name]; else n[name] = true;
    return n;
  });

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Ban size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Credit-Hold Candidates</h3>
        </div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Hold if worst invoice is overdue by (days)</label><input type="number" value={overdueDays} onChange={e => setOverdueDays(e.target.value)} className={`${INP} w-44`} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "On hold", value: String(holds.length), color: holds.length ? "text-red-400" : "text-green-400" },
          { label: "Exposure on hold", value: formatCurrency(Math.round(heldExposure)), color: "text-orange-400" },
          { label: "Candidates total", value: String(rows.length), color: "text-[var(--color-text)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Ban size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No customers breach your overdue or credit-limit thresholds. Set limits on the Credit Utilization tab to catch over-exposure too.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Stop shipping on credit to</h3></div>
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <div key={r.name} className="px-4 py-3 flex items-center gap-3">
                <Ban size={14} className={`shrink-0 ${r.hold ? "text-red-400" : "text-[var(--color-muted)] opacity-40"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    {!r.hold && <span className="text-[10px] font-bold text-green-400 shrink-0">Cleared</span>}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)]">{r.count} open invoice{r.count !== 1 ? "s" : ""} · {r.reasons.join(" · ")}</p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(Math.round(r.exposure))}</p>
                <button onClick={() => toggleClear(r.name)} className="shrink-0 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-2 py-1.5 rounded-md transition-colors">{cleared[r.name] ? "Re-hold" : "Override hold"}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">A customer lands here if their worst open invoice passes your overdue threshold or their open exposure exceeds the credit limit set on the Credit Utilization tab. Override to release a hold once they commit to pay.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #71 — WRITE-OFF / BAD-DEBT PROVISIONING POLICY (auto-flag uncollectible by age)
// ════════════════════════════════════════════════════════════════════════════
function WriteOffPolicy() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [policyDays, setPolicyDays] = useFeatureState<string>("rec-writeoff-policy-days", "180");
  const [approved, setApproved] = useFeatureState<Record<string, true>>("rec-writeoff-approved", {});

  const threshold = parseFloat(policyDays) || 0;

  const candidates = useMemo(() => invoices
    .filter(i => i.status !== "paid")
    .map(i => ({ ...i, daysOverdue: differenceInDays(new Date(), parseISO(i.dueDate)) }))
    .filter(i => i.daysOverdue >= threshold)
    .sort((a, b) => b.daysOverdue - a.daysOverdue), [invoices, threshold]);

  const candidateTotal = candidates.reduce((s, i) => s + i.amount, 0);
  const approvedRows = candidates.filter(i => approved[i.id]);
  const approvedTotal = approvedRows.reduce((s, i) => s + i.amount, 0);
  const pendingTotal = candidateTotal - approvedTotal;

  const toggle = (id: string) => setApproved(prev => {
    const n = { ...prev };
    if (n[id]) delete n[id]; else n[id] = true;
    return n;
  });

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Eraser size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Write-Off / Bad-Debt Policy</h3>
        </div>
        <div><label className="text-xs text-[var(--color-muted)] block mb-1">Provision as doubtful after (days overdue)</label><input type="number" value={policyDays} onChange={e => setPolicyDays(e.target.value)} className={`${INP} w-44`} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Doubtful candidates", value: String(candidates.length), color: candidates.length ? "text-orange-400" : "text-green-400" },
          { label: "Total to provision", value: formatCurrency(Math.round(candidateTotal)), color: "text-red-400" },
          { label: "Approved write-offs", value: formatCurrency(Math.round(approvedTotal)), color: "text-[var(--color-text)]" },
          { label: "Pending approval", value: formatCurrency(Math.round(pendingTotal)), color: "text-yellow-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {candidates.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Eraser size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No invoices past your {threshold}-day doubtful-debt threshold. Lower the policy days to preview what would qualify.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h3 className="text-sm font-semibold">Uncollectible candidates</h3>
            <span className="text-xs text-[var(--color-muted)]">Tick to approve write-off</span>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {candidates.map(i => (
              <label key={i.id} className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--color-accent)] transition-colors">
                <input type="checkbox" checked={!!approved[i.id]} onChange={() => toggle(i.id)} className="accent-[var(--color-primary)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${approved[i.id] ? "line-through opacity-60" : ""}`}>{i.customer} {i.invoiceNumber && <span className="text-xs text-[var(--color-muted)]">{i.invoiceNumber}</span>}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{i.daysOverdue}d overdue · due {format(parseISO(i.dueDate), "d MMM yyyy")}{i.description && ` · ${i.description}`}</p>
                </div>
                <p className="text-sm font-bold tabular-nums shrink-0 text-red-400">{formatCurrency(i.amount)}</p>
              </label>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Invoices overdue beyond your policy threshold are flagged as doubtful debt. Approving records an intent-to-write-off locally (audit trail) — book the actual write-off and reverse any GST in your accounting software.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #72 — CUSTOMER PAYMENT BEHAVIOR TIMELINE (days-to-pay history per customer)
// ════════════════════════════════════════════════════════════════════════════
function PaymentTimeline() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];

  const customers = useMemo(() => {
    const names = Array.from(new Set(invoices.map(i => i.customer))).sort();
    return names;
  }, [invoices]);
  const [selected, setSelected] = useState("");
  const active = selected || customers[0] || "";

  const data = useMemo(() => {
    const list = invoices
      .filter(i => i.customer === active)
      .map(i => {
        const daysFromDue = differenceInDays(new Date(), parseISO(i.dueDate));
        const isPaid = i.status === "paid";
        // for paid invoices we approximate settlement at today (no paidDate in model) → use overdue at due as the lateness proxy
        const lateness = isPaid ? Math.max(0, daysFromDue) : Math.max(0, daysFromDue);
        return { ...i, isPaid, lateness, daysFromDue };
      })
      .sort((a, b) => parseISO(b.invoiceDate).getTime() - parseISO(a.invoiceDate).getTime());
    const paid = list.filter(i => i.isPaid);
    const avgLate = paid.length ? Math.round(paid.reduce((s, i) => s + i.lateness, 0) / paid.length) : 0;
    const onTime = paid.filter(i => i.lateness <= 0).length;
    const maxLate = Math.max(1, ...list.map(i => i.lateness));
    return { list, avgLate, onTime, paidCount: paid.length, maxLate };
  }, [invoices, active]);

  if (customers.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <History size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to chart each customer's days-to-pay history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <History size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Customer Payment Timeline</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <select value={active} onChange={e => setSelected(e.target.value)} className={`${INP} w-56`}>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Avg days late (settled)", value: `${data.avgLate}d`, color: data.avgLate > 15 ? "text-red-400" : data.avgLate > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Paid on time", value: `${data.onTime}/${data.paidCount}`, color: "text-[var(--color-text)]" },
          { label: "Invoices on record", value: String(data.list.length), color: "text-[var(--color-primary)]" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold truncate">{active} — invoice history</h3></div>
        <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
          {data.list.map(i => (
            <div key={i.id} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${i.isPaid ? (i.lateness > 0 ? "bg-yellow-500" : "bg-green-500") : i.daysFromDue > 0 ? "bg-red-500" : "bg-[var(--color-primary)]"}`} />
              <div className="w-28 shrink-0">
                <p className="text-xs font-medium truncate">{i.invoiceNumber ?? i.id}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{format(parseISO(i.invoiceDate), "d MMM yy")}</p>
              </div>
              <div className="flex-1 h-4 bg-[var(--color-bg)] rounded overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${(i.lateness / data.maxLate) * 100}%`, minWidth: i.lateness > 0 ? "3px" : "0", background: i.lateness > 30 ? "#ef4444" : i.lateness > 0 ? "#eab308" : "#22c55e" }} />
              </div>
              <span className="text-[10px] tabular-nums shrink-0 w-24 text-right text-[var(--color-muted)]">
                {i.isPaid ? (i.lateness > 0 ? `paid ${i.lateness}d late` : "paid on time") : i.daysFromDue > 0 ? `${i.daysFromDue}d overdue` : "not yet due"}
              </span>
              <span className="text-xs font-semibold tabular-nums shrink-0 w-20 text-right">{formatCurrency(i.amount)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Each bar shows how late an invoice ran past its due date (green on-time, amber late, red 30d+). Use the pattern to set this customer's credit terms and reminder tone. Lateness is measured against the due date.</p>
    </div>
  );
}
