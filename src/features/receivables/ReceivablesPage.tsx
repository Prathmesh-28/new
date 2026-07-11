import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { Plus, X, Send, CheckCircle2, AlertTriangle, Clock, Kanban, List, Award, Gauge, Banknote, Link2, PieChart, MailCheck, TrendingUp, Repeat, ShieldAlert, Percent, CalendarClock, Flame, Layers, CalendarCheck, FileWarning, TicketPercent, Ban, Eraser, History, Hourglass, Trophy, Coins, Target, Wallet, Calculator, CalendarRange, Siren, FileText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import AiInsight from "@/components/ai/AiInsight";
import { useT } from "@/i18n";
import type { Invoice } from "@/data/types";
import DatePicker from "@/components/DatePicker";
import RecordPaymentModal from "@/components/RecordPaymentModal";
import { useCustomerCredit, setCustomerCreditLimit } from "@/lib/customerCredit";

const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

function agingBucket(daysOverdue: number): "current" | "30d" | "60d" | "90d" {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "30d";
  if (daysOverdue <= 60) return "60d";
  return "90d";
}

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "30d":   "1-30 days overdue",
  "60d":   "31-60 days overdue",
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

function KanbanPipeline({ withDays, isReadOnly, onMarkPaid, onChase, onFinance }: {
  withDays: (Invoice & { bucket: string; daysOverdue: number })[];
  isReadOnly: boolean;
  onMarkPaid: (id: string) => void;
  onChase: (inv: typeof withDays[0]) => void;
  onFinance: (inv: typeof withDays[0]) => void;
}) {
  const cols = [
    { key: "current", label: "Current",     color: "border-green-700/40",  headerColor: "text-green-400",  dot: "bg-green-500" },
    { key: "30d",     label: "1-30 d overdue", color: "border-yellow-700/40", headerColor: "text-yellow-400", dot: "bg-yellow-500" },
    { key: "60d",     label: "31-60 d overdue", color: "border-orange-700/40", headerColor: "text-orange-400", dot: "bg-orange-500" },
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
                      {inv.source === "backend" && (
                        <button onClick={() => onFinance(inv)} title="Advance this invoice (get cash now)"
                          className="flex-1 flex items-center justify-center gap-1 py-1 text-[10px] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 rounded-md transition-colors">
                          <Banknote size={9} /> Finance
                        </button>
                      )}
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

type ReceivablesTab = "overview" | "risk-score" | "factoring" | "cash-app" | "concentration" | "ar-confirm" | "dso-trend" | "ar-turnover" | "ecl-matrix" | "credit-util" | "cash-timeline" | "overdue-heatmap" | "dunning-funnel" | "promise-to-pay" | "disputes" | "early-discount" | "credit-hold" | "write-off" | "pay-timeline" | "days-beyond-terms" | "reliability-rank" | "interest-accrual" | "collection-target" | "partial-pay" | "recovery-roi" | "payment-plan" | "stress-test" | "statement";

export default function ReceivablesPage() {
  const tr = useT();
  const navigate = useNavigate();
  // "Turn this invoice into cash" → the live financing tab with the invoice preselected.
  const financeInvoice = (inv: Invoice) => navigate(`/credit?invoice_id=${inv.id}`);
  const { store, addInvoice, updateInvoice, deleteInvoice, isReadOnly } = useApp();
  const { invoices } = store;
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [tab, setTab] = useState<ReceivablesTab>("overview");

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

  // Compact AI context: top overdue customers + a simple DSO proxy.
  const overdue = withDays.filter(i => i.daysOverdue > 0);
  const topOverdue = [...overdue]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map(i => ({ customer: i.customer, amount: i.amount, daysOverdue: i.daysOverdue }));
  // DSO proxy: weighted average age of open invoices (days since due) clamped at 0.
  const dso = pending.length > 0
    ? Math.round(withDays.reduce((s, i) => s + Math.max(0, i.daysOverdue), 0) / pending.length)
    : 0;

  const handleChase = (inv: typeof withDays[0]) => {
    const msg = chaseMessage(inv, inv.daysOverdue);
    const mailto = `mailto:?subject=${encodeURIComponent(`Payment reminder: Invoice ${inv.invoiceNumber ?? ""} (${formatCurrency(inv.amount)})`)}&body=${encodeURIComponent(msg)}`;
    window.open(mailto, "_blank");
  };

  // Backend-origin invoices are mirrored from the /api/invoices DB; route their
  // status/delete through the API so Receivables stays in sync with the ledger.
  // Store-origin (manual / CSV import) invoices stay KV-only.
  const handleMarkPaid = async (inv: Invoice) => {
    updateInvoice({ ...inv, status: "paid" });
    if (inv.source === "backend") {
      try {
        await api.patch(`/api/invoices/${inv.id}`, { status: "paid" });
      } catch {
        toast.error("Marked paid locally, but failed to sync to the ledger");
        return;
      }
    }
    toast.success(`Invoice from ${inv.customer} marked as paid`);
  };

  const handleDelete = async (inv: Invoice) => {
    deleteInvoice(inv.id);
    if (inv.source === "backend") {
      try {
        await api.delete(`/api/invoices/${inv.id}`);
      } catch {
        toast.error("Deleted locally, but failed to sync to the ledger");
        return;
      }
    }
    toast.success("Invoice deleted");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{tr("recv.title")}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{tr("recv.subtitle")}</p>
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
              <Plus size={13} /> {tr("recv.addInvoice")}
            </button>
          )}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([["overview", tr("recv.tab.overview"), List], ["risk-score", tr("recv.tab.riskScore"), Gauge], ["factoring", tr("recv.tab.factoring"), Banknote], ["cash-app", tr("recv.tab.cashApp"), Link2], ["concentration", tr("recv.tab.concentration"), PieChart], ["ar-confirm", tr("recv.tab.arConfirm"), MailCheck], ["dso-trend", tr("recv.tab.dsoTrend"), TrendingUp], ["ar-turnover", tr("recv.tab.arTurnover"), Repeat], ["ecl-matrix", "ECL Provisioning", ShieldAlert], ["credit-util", "Credit Utilization", Percent], ["cash-timeline", "Collection Forecast", CalendarClock], ["overdue-heatmap", "Overdue Heatmap", Flame], ["dunning-funnel", "Dunning Funnel", Layers], ["promise-to-pay", "Promise-to-Pay", CalendarCheck], ["disputes", "Dispute Tracker", FileWarning], ["early-discount", "Early-Pay Discount", TicketPercent], ["credit-hold", "Credit-Hold List", Ban], ["write-off", "Write-Off Policy", Eraser], ["pay-timeline", "Payment Timeline", History], ["days-beyond-terms", "Days Beyond Terms", Hourglass], ["reliability-rank", "Reliability Ranking", Trophy], ["interest-accrual", "Overdue Interest", Coins], ["collection-target", "Collection Target", Target], ["partial-pay", "Partial Payments", Wallet], ["recovery-roi", "Recovery ROI", Calculator], ["payment-plan", "Payment Plan", CalendarRange], ["stress-test", "Concentration Stress Test", Siren], ["statement", "Statement Generator", FileText]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      <AiInsight
        collapsed
        question="Which receivables are most at risk and what collection actions should I prioritise?"
        context={{
          totalOutstanding,
          openInvoiceCount: pending.length,
          dsoDays: dso,
          ageingBuckets: {
            current: bucketTotals["current"],
            "1-30d": bucketTotals["30d"],
            "31-60d": bucketTotals["60d"],
            "60d+": bucketTotals["90d"],
          },
          topOverdueCustomers: topOverdue,
        }}
      />

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
      {tab === "days-beyond-terms" && <DaysBeyondTerms />}
      {tab === "reliability-rank" && <ReliabilityRanking />}
      {tab === "interest-accrual" && <OverdueInterestAccrual />}
      {tab === "collection-target" && <CollectionTargetTracker />}
      {tab === "partial-pay" && <PartialPaymentTracker />}
      {tab === "recovery-roi" && <RecoveryROICalculator />}
      {tab === "payment-plan" && <PaymentPlanBuilder />}
      {tab === "stress-test" && <ConcentrationStressTest />}
      {tab === "statement" && <CustomerStatementGenerator />}

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
            <p className="text-xs text-[var(--color-muted)]">{tr("recv.totalOutstanding")}</p>
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
          onMarkPaid={id => { const inv = invoices.find(i => i.id === id); if (inv) handleMarkPaid(inv); }}
          onChase={inv => { const msg = chaseMessage(inv, inv.daysOverdue); window.open(`mailto:?subject=${encodeURIComponent(`Payment reminder: ${formatCurrency(inv.amount)}`)}&body=${encodeURIComponent(msg)}`, "_blank"); }}
          onFinance={financeInvoice}
        />
      )}

      {/* Invoice list */}
      {view === "list" && pending.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold">{tr("recv.outstandingInvoices")}</h2>
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
                    {inv.source === "backend" && (
                      <button onClick={() => financeInvoice(inv)} title="Advance this invoice (get cash now)"
                        className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors">
                        <Banknote size={13} />
                      </button>
                    )}
                    <button onClick={() => handleMarkPaid(inv)} title="Mark as paid"
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-green-400 hover:bg-green-950/20 transition-colors">
                      <CheckCircle2 size={13} />
                    </button>
                    <button onClick={() => handleDelete(inv)} title="Delete"
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-400 hover:bg-red-950/20 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : pending.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={tr("recv.empty.title")}
          description={tr("recv.empty.desc")}
          ctaText="Raise an invoice"
          ctaHref="/invoices"
        />
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
                  <button onClick={() => handleDelete(inv)}
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
// #55 - CUSTOMER RISK SCORING (pay-behaviour + exposure score per customer)
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
  score: number;           // 0-100, higher = safer
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
// #56 - FACTORING / DISCOUNTING ESTIMATOR (net proceeds if you sell invoices)
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
            Compare against your cost of capital before factoring. Estimate only - actual KredX/TReDS terms vary.
          </p>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #57 - CASH APPLICATION / AUTO-MATCH RECEIPTS (bank credits → open invoices)
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
  const { store, updateInvoice } = useApp();
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

  const apply = async (m: CashMatch) => {
    if (!m.invoiceId) return;
    const inv = invoices.find(i => i.id === m.invoiceId);
    if (!inv) return;
    // Backend-origin invoices get a REAL receipt for the ACTUAL amount received (capped at
    // the outstanding balance) via POST /:id/payments — the server flips to paid only when
    // fully settled. Before this, a "likely" match (±2% or even a name hit alone) force-
    // marked the WHOLE invoice paid: a ₹5,000 receipt with a matching customer name could
    // settle a ₹50,000 invoice and stop all dunning on the unpaid ₹45,000.
    if (inv.source === "backend") {
      try {
        // For open backend mirrors, store `amount` IS the outstanding balance.
        const amt = Math.round(Math.min(m.amount, inv.amount) * 100) / 100;
        const res = await api.post<{ balance_due: number }>(`/api/invoices/${inv.id}/payments`, {
          amount: amt, mode: "bank",
          reference: (m.description || "").slice(0, 120) || undefined,
          received_at: m.date,
        });
        setApplied(prev => ({ ...prev, [m.invoiceId!]: m.txnId }));
        if (res.balance_due <= 0) updateInvoice({ ...inv, status: "paid" });
        else updateInvoice({ ...inv, amount: res.balance_due });
        toast.success(res.balance_due > 0
          ? `${formatCurrency(amt)} applied to ${m.invoiceLabel} · ${formatCurrency(res.balance_due)} still due`
          : `${formatCurrency(amt)} applied — ${m.invoiceLabel} fully paid`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not record the receipt");
      }
      return;
    }
    // KV-only invoice (manual/CSV — no backend row exists): local settle, as before.
    setApplied(prev => ({ ...prev, [m.invoiceId!]: m.txnId }));
    if (inv.status !== "paid") updateInvoice({ ...inv, status: "paid" });
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
    const inv = invoices.find(i => i.id === invId);
    if (inv?.source === "backend") {
      // The local link is cleared, but the receipt itself is a real record in the books —
      // don't pretend otherwise.
      toast.warning("Link removed here — the recorded payment stays on the invoice (adjust it from the Invoices page if it was wrong)");
    } else {
      toast.success("Receipt un-applied");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-2">
        <Link2 size={14} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold">Cash Application - auto-match receipts to invoices</h3>
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
// #58 - CONCENTRATION RISK ALERT (flags when >X% of AR is one customer)
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
    // Herfindahl-Hirschman Index on shares (0-10000); >2500 = highly concentrated
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
          { label: "HHI (0-10,000)", value: String(hhi), color: hhi > 2500 ? "text-red-400" : hhi > 1500 ? "text-yellow-400" : "text-green-400" },
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
              {breaches.map(b => `${b.name} (${b.pct.toFixed(1)}%)`).join(", ")} each exceed your {limit}% threshold. A default by any of these would materially hit cash flow - diversify or tighten credit.
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
// #59 - AR CONFIRMATION / BALANCE STATEMENT MAILER (audit-time confirmations)
// ════════════════════════════════════════════════════════════════════════════
function ARConfirmationMailer() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [asOf, setAsOf] = useState(new Date().toISOString().split("T")[0]);
  // per-customer contact edits (persisted onto the invoice rows by the send call)
  const [contacts, setContacts] = useFeatureState<Record<string, { email?: string; phone?: string }>>("receivables-ar-contacts", {});
  // The REAL server-side dispatch log (letters composed + sent by the backend via
  // Twilio/SMTP - never a client mailto/wa.me draft).
  const [sentLog, setSentLog] = useState<Record<string, { channel: string; to: string; at: string }>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ whatsapp: boolean; email: boolean }>({ whatsapp: false, email: false });

  const loadLog = useCallback(async () => {
    try {
      const rows = await api.get<{ customer_name: string; channel: string; sent_to: string; created_at: string }[]>("/api/invoices/confirmations/log");
      setSentLog(Object.fromEntries((rows ?? []).map(r => [r.customer_name, { channel: r.channel, to: r.sent_to, at: r.created_at }])));
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void loadLog();
    api.get<{ whatsapp: boolean; email: boolean }>("/api/capabilities")
      .then(c => setChannels({ whatsapp: !!c?.whatsapp, email: !!c?.email }))
      .catch(() => {});
  }, [loadLog]);

  const balances = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, { items: Invoice[]; total: number }> = {};
    open.forEach(i => { (map[i.customer] ||= { items: [], total: 0 }); map[i.customer].items.push(i); map[i.customer].total += i.amount; });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [invoices]);

  const setContact = (name: string, field: "email" | "phone", value: string) =>
    setContacts(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));

  const send = async (name: string, channel: "whatsapp" | "email") => {
    const c = contacts[name] || {};
    setSending(name);
    try {
      const res = await api.post<{ ok: boolean; to: string; invoices: number }>("/api/invoices/confirmations/send", {
        customer: name, channel, asOf, email: c.email || undefined, phone: c.phone || undefined,
      });
      toast.success(`Confirmation sent to ${res.to} (${res.invoices} invoice${res.invoices !== 1 ? "s" : ""})`);
      await loadLog();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Couldn't send the confirmation");
    } finally {
      setSending(null);
    }
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
          <DatePicker value={asOf} onChange={setAsOf} />
        </div>
      </div>

      <div className="space-y-3">
        {balances.map(b => {
          const sent = sentLog[b.name];
          const c = contacts[b.name] || {};
          const busy = sending === b.name;
          return (
            <div key={b.name} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{b.name}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">
                    {b.items.length} open invoice{b.items.length !== 1 ? "s" : ""}
                    {sent && ` · sent via ${sent.channel} to ${sent.to} on ${format(parseISO(sent.at), "d MMM yyyy")}`}
                  </p>
                </div>
                <p className="text-base font-bold tabular-nums text-[var(--color-primary)] shrink-0">{formatCurrency(b.total)}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                <input value={c.email ?? ""} onChange={e => setContact(b.name, "email", e.target.value)} placeholder="customer@email.com" className={INP} />
                <input value={c.phone ?? ""} onChange={e => setContact(b.name, "phone", e.target.value)} placeholder="WhatsApp e.g. +919876543210" className={INP} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void send(b.name, "email")}
                  disabled={busy || !channels.email}
                  title={!channels.email ? "Email (SMTP) isn't configured on the server" : undefined}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-2 rounded-lg font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={12} /> {sent ? "Resend email" : "Email confirmation"}
                </button>
                <button
                  onClick={() => void send(b.name, "whatsapp")}
                  disabled={busy || !channels.whatsapp}
                  title={!channels.whatsapp ? "WhatsApp (Twilio) isn't configured on the server" : undefined}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-text)] px-3 py-2 rounded-lg font-medium hover:bg-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <MailCheck size={12} /> {sent ? "Resend WhatsApp" : "WhatsApp"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Sends a positive-confirmation letter (auditor-style) per customer, composed on the server from that customer's real open invoices as on the chosen date, via the business WhatsApp/email channel. Max 2 sends per customer per week.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #60 - DSO TREND (Days Sales Outstanding trend over the last 6 months)
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
          <h3 className="text-sm font-semibold">Days Sales Outstanding - last 6 months</h3>
          <span className="text-xs text-[var(--color-muted)] ml-auto">Lower = cash converts faster</span>
        </div>
        <div className="flex items-end gap-2 h-40">
          {months.map(m => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
              <span className="text-[10px] font-semibold tabular-nums text-[var(--color-text)]">{m.billed > 0 ? m.dso : "-"}</span>
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
// #61 - AR TURNOVER RATIO (how many times receivables convert per year)
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
          <p className={`text-sm font-bold ${grade.color}`}>{grade.label} turnover - {stats.annualised.toFixed(1)}× per year</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            You collect and re-lend your receivables roughly {stats.annualised.toFixed(1)} times a year ({stats.count} invoices in the window). Higher turnover frees cash; under 4× usually signals lax credit terms or slow collections.
          </p>
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Turnover = net credit sales ÷ average receivables; DSO = 365 ÷ turnover. Average AR is estimated from current open balance - a true average needs opening + closing balances from your ledger.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #62 - ECL PROVISIONING MATRIX (Ind-AS 109 expected-credit-loss by aging)
// ════════════════════════════════════════════════════════════════════════════
function ECLProvisioning() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // default loss rates (%) per bucket - durable so the user's policy persists
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
// #63 - CREDIT-LIMIT UTILIZATION (per-customer exposure vs set credit ceiling)
// ════════════════════════════════════════════════════════════════════════════
function CreditUtilization() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  // Real per-customer credit limit + real GL exposure (book_ledgers.credit_limit) -
  // the same figure the invoice-send credit-limit gate itself checks, instead of a
  // local KV number that gate never saw and that could disagree with Collections'
  // and Invoices' own separate KV credit-limit trackers for the same customer.
  const { credit, loading, refresh } = useCustomerCredit();
  const [savingName, setSavingName] = useState<string | null>(null);

  // Customers who only have unsent (draft) invoices don't have a ledger yet - show
  // them too (0 real exposure until sent) so the "set a limit" action still works.
  const draftOnlyNames = useMemo(() => {
    const known = new Set(credit.map(c => c.name.toLowerCase()));
    const names = new Set<string>();
    invoices.filter(i => i.status !== "paid").forEach(i => { if (!known.has(i.customer.toLowerCase())) names.add(i.customer); });
    return [...names];
  }, [credit, invoices]);

  const rows = useMemo(() => {
    const all = [
      ...credit.map(c => ({ name: c.name, exposure: c.outstanding, limit: c.creditLimit })),
      ...draftOnlyNames.map(name => ({ name, exposure: 0, limit: 0 })),
    ];
    return all.map(r => {
      const util = r.limit > 0 ? (r.exposure / r.limit) * 100 : 0;
      const headroom = r.limit - r.exposure;
      const status = r.limit <= 0 ? "unset" : util >= 100 ? "over" : util >= 80 ? "near" : "ok";
      return { ...r, util, headroom, status };
    }).sort((a, b) => b.util - a.util || b.exposure - a.exposure);
  }, [credit, draftOnlyNames]);

  const overCount = rows.filter(r => r.status === "over").length;
  const nearCount = rows.filter(r => r.status === "near").length;
  const unsetCount = rows.filter(r => r.status === "unset").length;

  const setLimit = async (name: string, value: string) => {
    const v = parseFloat(value);
    setSavingName(name);
    try { await setCustomerCreditLimit(name, isNaN(v) ? 0 : v); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save credit limit"); }
    finally { setSavingName(null); }
  };

  if (loading && rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <p className="text-sm text-[var(--color-muted)]">Loading real exposure from the books…</p>
      </div>
    );
  }
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
                  <input type="number" defaultValue={r.limit || ""} key={`${r.name}-${r.limit}`}
                    onBlur={e => { if (e.target.value !== String(r.limit || "")) void setLimit(r.name, e.target.value); }}
                    disabled={savingName === r.name} placeholder="-"
                    className="w-28 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-sm text-right tabular-nums outline-none focus:border-[var(--color-primary)] disabled:opacity-50" />
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
// #64 - COLLECTION FORECAST (invoice-to-cash timeline by expected pay date)
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
          <h3 className="text-sm font-semibold">Collection Forecast - next 8 weeks</h3>
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
              <span className="text-xs tabular-nums font-semibold w-24 text-right shrink-0">{w.amount > 0 ? formatCurrency(Math.round(w.amount)) : "-"}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Each open invoice is placed in the week of its expected pay date = due date + that customer's average days-late (from paid history). Overdue invoices are shown separately as cash you should already have.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #65 - OVERDUE HEATMAP (top customers × aging bucket, intensity by amount)
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
                {buckets.map(b => <th key={b} className={`px-3 py-2.5 text-right font-medium ${BUCKET_COLOR[b]}`}>{b === "current" ? "Current" : b === "30d" ? "1-30d" : b === "60d" ? "31-60d" : "60d+"}</th>)}
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
      <p className="text-[10px] text-[var(--color-muted)]">Darker cells = larger amounts; colour shifts green → red as invoices age. Scan the right-hand columns to spot customers parking big balances in the 60d+ band - chase those first.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #66 - DUNNING FUNNEL (open AR distributed across reminder/escalation stages)
// ════════════════════════════════════════════════════════════════════════════
const DUNNING_STAGES: { key: string; label: string; desc: string; min: number; max: number; color: string }[] = [
  { key: "not-due",    label: "Not yet due",            desc: "Monitor - no action",  min: -9999, max: 0,     color: "#1A6B55" },
  { key: "reminder",   label: "Stage 1 · Reminder",     desc: "Gentle nudge 1-15d",   min: 1,     max: 15,    color: "#22c55e" },
  { key: "followup",   label: "Stage 2 · Follow-up",    desc: "Firm chase 16-30d",    min: 16,    max: 30,    color: "#eab308" },
  { key: "escalation", label: "Stage 3 · Escalation",   desc: "Demand 31-60d",        min: 31,    max: 60,    color: "#f97316" },
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

  // Nothing is "queued" anywhere - this is guidance, not an action (the old success
  // toast claimed a queue while doing literally nothing). Reminders really dispatch
  // from Invoices → Collections → Remind.
  const handleChaseStage = (label: string, count: number) => {
    if (count === 0) { toast.error("No invoices in this stage"); return; }
    toast.info(`${count} invoice${count !== 1 ? "s" : ""} sit in "${label}". Use Invoices → Collections → Remind to actually send reminders - nothing is queued from here.`);
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
      <p className="text-[10px] text-[var(--color-muted)]">Each open invoice falls into a stage by days past due: not-due → reminder (1-15) → follow-up (16-30) → escalation (31-60) → final demand (60d+). Use it to decide who gets which message today.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #67 - PROMISE-TO-PAY CAPTURE (log debtor commitments, flag broken promises)
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
          <DatePicker value={date} onChange={setDate} />
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
      <p className="text-[10px] text-[var(--color-muted)]">A promise turns green once its invoice is marked paid, red once the promised date passes unpaid. Chase broken promises first - they predict default better than aging alone.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #68 - DISPUTE / DEDUCTION TRACKER (quarantine contested amounts, keep chasing rest)
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
    toast.success("Dispute logged - undisputed balance keeps chasing");
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
          { label: "Undisputed - still chase", value: formatCurrency(Math.round(stillChaseable)), color: "text-[var(--color-primary)]" },
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
      <p className="text-[10px] text-[var(--color-muted)]">Logging a dispute ring-fences only the contested rupees - the undisputed balance stays in your collection pipeline instead of the whole invoice stalling. Resolve to release the hold.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #69 - EARLY-PAYMENT DISCOUNT ENGINE (2/10-net-30 style offers + uptake/cost)
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
      <p className="text-[10px] text-[var(--color-muted)]">A {discountPct}/{windowDays} net {netDays} offer costs you ≈{apr.toFixed(0)}% annualised - only worth it if it beats your cost of borrowing or factoring. Eligible = still within the discount window from invoice date.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #70 - CREDIT-HOLD CANDIDATE LIST (who to stop shipping to: overdue / over-limit)
// ════════════════════════════════════════════════════════════════════════════
function CreditHoldList() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const { credit } = useCustomerCredit();
  const limits = useMemo(() => Object.fromEntries(credit.map(c => [c.name, c.creditLimit])), [credit]);
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
// #71 - WRITE-OFF / BAD-DEBT PROVISIONING POLICY (auto-flag uncollectible by age)
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
      <p className="text-[10px] text-[var(--color-muted)]">Invoices overdue beyond your policy threshold are flagged as doubtful debt. Approving records an intent-to-write-off locally (audit trail) - book the actual write-off and reverse any GST in your accounting software.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// #72 - CUSTOMER PAYMENT BEHAVIOR TIMELINE (days-to-pay history per customer)
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
        <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold truncate">{active} - invoice history</h3></div>
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

/* ── Days Beyond Terms (DBT) ─────────────────────────────────── */
function DaysBeyondTerms() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const rows = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const byCust = new Map<string, { customer: string; owed: number; weighted: number; count: number; worst: number }>();
    for (const i of open) {
      const dbt = Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate)));
      const amt = i.amount || 0;
      const r = byCust.get(i.customer) ?? { customer: i.customer, owed: 0, weighted: 0, count: 0, worst: 0 };
      r.owed += amt; r.weighted += dbt * amt; r.count += 1; r.worst = Math.max(r.worst, dbt);
      byCust.set(i.customer, r);
    }
    return Array.from(byCust.values())
      .map(r => ({ ...r, dbt: r.owed > 0 ? Math.round(r.weighted / r.owed) : 0 }))
      .sort((a, b) => b.dbt - a.dbt);
  }, [invoices]);
  const portfolio = useMemo(() => {
    const owed = rows.reduce((s, r) => s + r.owed, 0);
    const w = rows.reduce((s, r) => s + r.dbt * r.owed, 0);
    return owed > 0 ? Math.round(w / owed) : 0;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Hourglass size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">No open invoices - Days Beyond Terms appears once there are unpaid receivables.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3">
        <Hourglass size={14} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold mr-auto">Days Beyond Terms (DBT)</h3>
        <div className="text-right">
          <p className="text-[10px] text-[var(--color-muted)]">Portfolio weighted DBT</p>
          <p className={`text-lg font-bold tabular-nums ${portfolio > 30 ? "text-red-400" : portfolio > 10 ? "text-yellow-400" : "text-green-400"}`}>{portfolio}d</p>
        </div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="divide-y divide-[var(--color-border)] max-h-[28rem] overflow-y-auto">
          {rows.map(r => (
            <div key={r.customer} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{r.customer}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{r.count} open · worst {r.worst}d · {formatCurrency(r.owed)}</p>
              </div>
              <span className={`text-sm font-bold tabular-nums shrink-0 ${r.dbt > 30 ? "text-red-400" : r.dbt > 10 ? "text-yellow-400" : "text-green-400"}`}>{r.dbt}d</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">DBT = value-weighted days past due across each customer's open invoices. Unlike DSO it isolates slippage beyond agreed terms, so a rising DBT flags a deteriorating payer even when sales are flat.</p>
    </div>
  );
}

/* ── Customer Payment-Reliability Ranking ────────────────────── */
function ReliabilityRanking() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const rows = useMemo(() => {
    const byCust = new Map<string, { customer: string; paid: number; onTime: number; openOverdue: number; volume: number }>();
    for (const i of invoices) {
      const r = byCust.get(i.customer) ?? { customer: i.customer, paid: 0, onTime: 0, openOverdue: 0, volume: 0 };
      r.volume += i.amount || 0;
      if (i.status === "paid") {
        r.paid += 1;
        if (differenceInDays(new Date(), parseISO(i.dueDate)) <= 0) r.onTime += 1;
      } else if (differenceInDays(new Date(), parseISO(i.dueDate)) > 0) {
        r.openOverdue += 1;
      }
      byCust.set(i.customer, r);
    }
    return Array.from(byCust.values())
      .map(r => {
        const onTimeRate = r.paid > 0 ? r.onTime / r.paid : 1;
        const overduePenalty = r.openOverdue > 0 ? Math.min(0.4, r.openOverdue * 0.1) : 0;
        const score = Math.max(0, Math.round((onTimeRate - overduePenalty) * 100));
        return { ...r, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [invoices]);

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Trophy size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
        <p className="text-sm text-[var(--color-muted)]">Add invoices to rank customers by payment reliability.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3">
        <Trophy size={14} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold">Customer Payment-Reliability Ranking</h3>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="divide-y divide-[var(--color-border)] max-h-[28rem] overflow-y-auto">
          {rows.map((r, idx) => (
            <div key={r.customer} className="px-4 py-3 flex items-center gap-3">
              <span className="text-xs font-bold tabular-nums w-6 shrink-0 text-[var(--color-muted)]">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{r.customer}</p>
                <p className="text-[10px] text-[var(--color-muted)]">{r.onTime}/{r.paid} paid on time · {r.openOverdue} overdue open · {formatCurrency(r.volume)}</p>
              </div>
              <div className="w-24 h-2 bg-[var(--color-bg)] rounded overflow-hidden shrink-0">
                <div className="h-full rounded" style={{ width: `${r.score}%`, background: r.score >= 80 ? "#22c55e" : r.score >= 50 ? "#eab308" : "#ef4444" }} />
              </div>
              <span className={`text-sm font-bold tabular-nums shrink-0 w-10 text-right ${r.score >= 80 ? "text-green-400" : r.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{r.score}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">Score blends the on-time share of settled invoices with a penalty for currently-overdue open invoices. Use the bottom of the list to tighten credit terms or require advances.</p>
    </div>
  );
}

/* ── Overdue Interest Accrual ────────────────────────────────── */
function OverdueInterestAccrual() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [ratePa, setRatePa] = useFeatureState<string>("rec-interest-rate-pa", "18");
  const [graceDays, setGraceDays] = useFeatureState<string>("rec-interest-grace", "0");

  const data = useMemo(() => {
    const rate = (parseFloat(ratePa) || 0) / 100;
    const grace = parseInt(graceDays) || 0;
    const list = invoices
      .filter(i => i.status !== "paid")
      .map(i => {
        const overdue = Math.max(0, differenceInDays(new Date(), parseISO(i.dueDate)) - grace);
        const interest = (i.amount || 0) * rate * (overdue / 365);
        return { ...i, overdue, interest };
      })
      .filter(i => i.overdue > 0)
      .sort((a, b) => b.interest - a.interest);
    const total = list.reduce((s, i) => s + i.interest, 0);
    const principal = list.reduce((s, i) => s + (i.amount || 0), 0);
    return { list, total, principal };
  }, [invoices, ratePa, graceDays]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Coins size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Overdue Interest Accrual</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Interest % p.a.</label>
          <input value={ratePa} onChange={e => setRatePa(e.target.value)} className={`${INP} w-24`} inputMode="decimal" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Grace days</label>
          <input value={graceDays} onChange={e => setGraceDays(e.target.value)} className={`${INP} w-24`} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Accrued interest claimable</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(data.total))}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Overdue principal</p>
          <p className="text-lg font-bold tabular-nums">{formatCurrency(data.principal)}</p>
        </div>
      </div>
      {data.list.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">No invoices past due beyond the grace period.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {data.list.map(i => (
              <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{i.customer}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">{i.invoiceNumber ?? i.id} · {i.overdue}d overdue · {formatCurrency(i.amount)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(Math.round(i.interest))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simple interest = principal × rate × (overdue days − grace) ÷ 365. Many B2B contracts and the MSMED Act allow charging interest on late payment; use this to quantify and, where applicable, invoice it.</p>
    </div>
  );
}

/* ── Partial Payment Tracker ─────────────────────────────────── */
// Was: a local KV list of "part-payments" that never touched the real invoice
// balance - recording one here did nothing to what Invoices/Collections/AR aging
// showed for the same invoice, so up to four screens could show four different
// "paid so far" figures. Now fetches real invoice balances and records receipts
// through the SAME endpoint (and shared modal) as the Invoices page - a payment
// recorded here updates the actual balance everywhere.
interface BackendInvoiceRow { id: string; invoice_number: string; customer_name: string; total_amount: number; paid_amount?: number; credited_amount?: number; status: string; due_date?: string; }
function PartialPaymentTracker() {
  const { store } = useApp();
  const [backendInvoices, setBackendInvoices] = useState<BackendInvoiceRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get<BackendInvoiceRow[]>("/api/invoices")
      .then(rows => setBackendInvoices(Array.isArray(rows) ? rows : []))
      .catch(() => setBackendInvoices(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    if (backendInvoices) {
      return backendInvoices
        .filter(i => i.status !== "paid" && i.status !== "cancelled")
        .map(i => {
          const total = Number(i.total_amount) || 0;
          const paid = Number(i.paid_amount) || 0;
          const credited = Number(i.credited_amount) || 0;
          const outstanding = Math.max(0, Math.round((total - paid - credited) * 100) / 100);
          const pct = total > 0 ? Math.min(100, Math.round(((paid + credited) / total) * 100)) : 0;
          return { id: i.id, invoiceNumber: i.invoice_number, customer: i.customer_name, total, paid, credited, outstanding, pct, dueDate: i.due_date || "" };
        })
        .filter(r => r.outstanding > 0.009)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }
    // Offline fallback: the KV mirror carries no real paid/credited figures, so
    // "outstanding" here is just the face amount - honestly worse than nothing,
    // but at least never claims a payment happened when the server is unreachable.
    return (store.invoices ?? [])
      .filter(i => i.status !== "paid")
      .map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber ?? i.id, customer: i.customer, total: i.amount, paid: 0, credited: 0, outstanding: i.amount, pct: 0, dueDate: i.dueDate || "" }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [backendInvoices, store.invoices]);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalCollected = rows.reduce((s, r) => s + r.paid + r.credited, 0);
  const payingRow = rows.find(r => r.id === payingId);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Partial Payment Tracker</h3>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Real receipts against your open invoices - recording one here updates the actual balance everywhere (Invoices, Collections, AR aging), and books it to the GL.</p>
        {!backendInvoices && !loading && <p className="text-[10px] text-amber-400 mt-1">Couldn't load live balances from the server - showing local data, which may not reflect real payments.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Collected so far</p>
          <p className="text-lg font-bold tabular-nums text-green-400">{formatCurrency(Math.round(totalCollected))}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs text-[var(--color-muted)] mb-1">Remaining outstanding</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(totalOutstanding))}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Wallet size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No open invoices with a balance due.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {rows.map(r => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{r.customer} · {r.invoiceNumber}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{formatCurrency(r.paid + r.credited)} of {formatCurrency(r.total)} · {formatCurrency(r.outstanding)} left</p>
                  </div>
                  <span className={`text-xs font-bold tabular-nums shrink-0 ${r.pct >= 100 ? "text-green-400" : "text-[var(--color-primary)]"}`}>{r.pct}%</span>
                  <button onClick={() => setPayingId(r.id)} className="shrink-0 text-[10px] px-2.5 py-1.5 rounded bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold">Record payment</button>
                </div>
                <div className="h-2 bg-[var(--color-bg)] rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{ width: `${r.pct}%`, background: r.pct >= 100 ? "#22c55e" : "#1A6B55" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Real receipts, posted to the GL and reflected in AR aging and Collections immediately.</p>
      {payingRow && (
        <RecordPaymentModal
          invoice={{ id: payingRow.id, invoiceNumber: payingRow.invoiceNumber, customerName: payingRow.customer, totalAmount: payingRow.total, paidAmount: payingRow.paid, creditedAmount: payingRow.credited }}
          onClose={() => setPayingId(null)}
          onDone={load}
        />
      )}
    </div>
  );
}

/* ── Recovery ROI Calculator ─────────────────────────────────── */
function RecoveryROICalculator() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const open = useMemo(() => invoices.filter(i => i.status !== "paid").sort((a, b) => b.amount - a.amount), [invoices]);
  const [sel, setSel] = useState("");
  const [recoveryPct, setRecoveryPct] = useFeatureState<string>("rec-roi-recovery-pct", "60");
  const [agencyPct, setAgencyPct] = useFeatureState<string>("rec-roi-agency-pct", "20");
  const [legalCost, setLegalCost] = useFeatureState<string>("rec-roi-legal-cost", "15000");
  const [ownHours, setOwnHours] = useState("8");
  const [hourlyCost, setHourlyCost] = useState("500");

  const inv = open.find(i => i.id === sel);
  const data = useMemo(() => {
    const face = inv?.amount ?? 0;
    const recRate = (parseFloat(recoveryPct) || 0) / 100;
    const agency = (parseFloat(agencyPct) || 0) / 100;
    const legal = parseFloat(legalCost) || 0;
    const hours = parseFloat(ownHours) || 0;
    const rate = parseFloat(hourlyCost) || 0;
    const expectedGross = face * recRate;
    const agencyFee = expectedGross * agency;
    const internalCost = hours * rate;
    const totalCost = agencyFee + legal + internalCost;
    const netRecovery = expectedGross - totalCost;
    const roi = totalCost > 0 ? (netRecovery / totalCost) * 100 : 0;
    return { face, expectedGross, agencyFee, legal, internalCost, totalCost, netRecovery, roi };
  }, [inv, recoveryPct, agencyPct, legalCost, ownHours, hourlyCost]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Recovery ROI Calculator</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Account to pursue</label>
          <select value={sel} onChange={e => setSel(e.target.value)} className={INP}>
            <option value="">Select an open invoice</option>
            {open.map(i => <option key={i.id} value={i.id}>{i.customer} · {i.invoiceNumber ?? i.id} · {formatCurrency(i.amount)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Expected recovery %</label>
            <input value={recoveryPct} onChange={e => setRecoveryPct(e.target.value)} className={INP} inputMode="decimal" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Agency fee %</label>
            <input value={agencyPct} onChange={e => setAgencyPct(e.target.value)} className={INP} inputMode="decimal" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Legal cost (₹)</label>
            <input value={legalCost} onChange={e => setLegalCost(e.target.value)} className={INP} inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Your hours</label>
            <input value={ownHours} onChange={e => setOwnHours(e.target.value)} className={INP} inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Cost / hour (₹)</label>
            <input value={hourlyCost} onChange={e => setHourlyCost(e.target.value)} className={INP} inputMode="numeric" />
          </div>
        </div>
      </div>
      {!inv ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Calculator size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Pick an overdue account to estimate whether pursuit is worth the cost.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Expected gross recovery</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(data.expectedGross))}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Total recovery cost</p>
              <p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(Math.round(data.totalCost))}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Net recovery</p>
              <p className={`text-lg font-bold tabular-nums ${data.netRecovery >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(Math.round(data.netRecovery))}</p>
            </div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <tbody>
                {[
                  { label: "Face value", val: Math.round(data.face) },
                  { label: `Agency fee (${agencyPct}% of recovery)`, val: -Math.round(data.agencyFee) },
                  { label: "Legal / filing cost", val: -Math.round(data.legal) },
                  { label: "Your time cost", val: -Math.round(data.internalCost) },
                  { label: "Net recovery", val: Math.round(data.netRecovery), bold: true },
                ].map(r => (
                  <tr key={r.label} className={`border-b border-[var(--color-border)] last:border-0 ${r.bold ? "bg-[var(--color-accent)] font-semibold" : ""}`}>
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5 tabular-nums text-right">{r.val < 0 ? `(${formatCurrency(Math.abs(r.val))})` : formatCurrency(r.val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`rounded-lg p-4 text-sm font-medium ${data.netRecovery >= 0 ? "bg-green-950/20 text-green-400" : "bg-red-950/20 text-red-400"}`}>
            {data.netRecovery >= 0
              ? `Worth pursuing - ROI ≈ ${data.roi.toFixed(0)}% on ${formatCurrency(Math.round(data.totalCost))} spent.`
              : `Pursuit likely loses money - costs exceed expected net recovery by ${formatCurrency(Math.round(-data.netRecovery))}. Consider settlement or write-off.`}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Compares expected recovery against agency, legal and internal time costs so you don't throw good money after bad. Tune the recovery % down for older or higher-risk debtors.</p>
    </div>
  );
}

/* ── Payment Plan Builder ────────────────────────────────────── */
function PaymentPlanBuilder() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const open = useMemo(() => invoices.filter(i => i.status !== "paid").sort((a, b) => b.amount - a.amount), [invoices]);
  const [sel, setSel] = useState("");
  const [installments, setInstallments] = useState("3");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [freq, setFreq] = useState<"weekly" | "fortnightly" | "monthly">("monthly");
  const [downPct, setDownPct] = useState("0");

  const inv = open.find(i => i.id === sel);
  const schedule = useMemo(() => {
    if (!inv) return [] as { n: number; date: string; amount: number }[];
    const n = Math.max(1, Math.min(36, parseInt(installments) || 1));
    const down = Math.max(0, Math.min(100, parseFloat(downPct) || 0)) / 100;
    const downAmt = inv.amount * down;
    const remaining = inv.amount - downAmt;
    const step = freq === "weekly" ? 7 : freq === "fortnightly" ? 14 : 30;
    const base = parseISO(startDate);
    const out: { n: number; date: string; amount: number }[] = [];
    if (downAmt > 0) out.push({ n: 0, date: startDate, amount: Math.round(downAmt) });
    const per = remaining / n;
    let allocated = 0;
    for (let k = 0; k < n; k++) {
      const d = new Date(base);
      d.setDate(d.getDate() + step * (k + (downAmt > 0 ? 1 : 0)));
      // last installment absorbs rounding remainder
      const amount = k === n - 1 ? Math.round(remaining - allocated) : Math.round(per);
      allocated += amount;
      out.push({ n: k + 1, date: d.toISOString().split("T")[0], amount });
    }
    return out;
  }, [inv, installments, downPct, freq, startDate]);

  const copyPlan = () => {
    if (!inv) return;
    const lines = schedule.map(s => `${s.n === 0 ? "Down payment" : `Installment ${s.n}`}: ${formatCurrency(s.amount)} on ${format(parseISO(s.date), "d MMM yyyy")}`);
    const text = `Payment plan for ${inv.customer} (${inv.invoiceNumber ?? inv.id}), total ${formatCurrency(inv.amount)}:\n${lines.join("\n")}`;
    navigator.clipboard?.writeText(text);
    toast.success("Payment plan copied to clipboard");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Payment Plan Builder</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Invoice to schedule</label>
          <select value={sel} onChange={e => setSel(e.target.value)} className={INP}>
            <option value="">Select an open invoice</option>
            {open.map(i => <option key={i.id} value={i.id}>{i.customer} · {i.invoiceNumber ?? i.id} · {formatCurrency(i.amount)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Installments</label>
            <input value={installments} onChange={e => setInstallments(e.target.value)} className={INP} inputMode="numeric" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Down payment %</label>
            <input value={downPct} onChange={e => setDownPct(e.target.value)} className={INP} inputMode="decimal" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Frequency</label>
            <select value={freq} onChange={e => setFreq(e.target.value as typeof freq)} className={INP}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">First payment</label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
        </div>
      </div>
      {!inv ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CalendarRange size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Select an invoice to break it into an installment schedule a debtor can agree to.</p>
        </div>
      ) : (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold">{schedule.length} payment{schedule.length !== 1 ? "s" : ""} · total {formatCurrency(inv.amount)}</h3>
              <button onClick={copyPlan} className="text-xs text-[var(--color-primary)] font-medium hover:underline">Copy plan</button>
            </div>
            <div className="divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
              {schedule.map(s => (
                <div key={s.n} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-[var(--color-muted)] w-24 shrink-0">{s.n === 0 ? "Down payment" : `Installment ${s.n}`}</span>
                  <span className="text-xs text-[var(--color-muted)] flex-1">{format(parseISO(s.date), "EEE d MMM yyyy")}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(s.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Splits an overdue balance into an agreed installment schedule (optional down-payment first). The final installment absorbs rounding so the plan sums exactly to the invoice. Copy it into a WhatsApp/email to the debtor.</p>
    </div>
  );
}

/* ── AR Concentration Stress Test ────────────────────────────── */
function ConcentrationStressTest() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [topN, setTopN] = useFeatureState<string>("rec-stress-topn", "3");
  const [delayDays, setDelayDays] = useFeatureState<string>("rec-stress-delay", "60");
  const [lossPct, setLossPct] = useFeatureState<string>("rec-stress-loss", "100");

  const data = useMemo(() => {
    const open = invoices.filter(i => i.status !== "paid");
    const map: Record<string, number> = {};
    open.forEach(i => { map[i.customer] = (map[i.customer] ?? 0) + i.amount; });
    const ranked = Object.entries(map).map(([name, exposure]) => ({ name, exposure })).sort((a, b) => b.exposure - a.exposure);
    const total = ranked.reduce((s, c) => s + c.exposure, 0);
    const n = Math.max(1, parseInt(topN) || 1);
    const top = ranked.slice(0, n);
    const topExposure = top.reduce((s, c) => s + c.exposure, 0);
    const loss = (parseFloat(lossPct) || 0) / 100;
    const impact = topExposure * loss;
    const concPct = total > 0 ? (topExposure / total) * 100 : 0;
    return { ranked, total, top, topExposure, impact, concPct, delay: parseInt(delayDays) || 0, n };
  }, [invoices, topN, lossPct, delayDays]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Siren size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">AR Concentration Stress Test</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Top N customers</label>
          <input value={topN} onChange={e => setTopN(e.target.value)} className={`${INP} w-20`} inputMode="numeric" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Delay (days)</label>
          <input value={delayDays} onChange={e => setDelayDays(e.target.value)} className={`${INP} w-24`} inputMode="numeric" />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Loss severity %</label>
          <input value={lossPct} onChange={e => setLossPct(e.target.value)} className={`${INP} w-24`} inputMode="decimal" />
        </div>
      </div>
      {data.ranked.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Siren size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No open receivables to stress-test. Add invoices on the Overview tab.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Top {data.n} exposure</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(Math.round(data.topExposure))}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Share of open AR</p>
              <p className={`text-lg font-bold tabular-nums ${data.concPct >= 50 ? "text-red-400" : data.concPct >= 30 ? "text-yellow-400" : "text-green-400"}`}>{data.concPct.toFixed(0)}%</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Cash at risk in scenario</p>
              <p className="text-lg font-bold tabular-nums text-red-400">{formatCurrency(Math.round(data.impact))}</p>
            </div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)]"><h3 className="text-sm font-semibold">Stressed customers</h3></div>
            <div className="divide-y divide-[var(--color-border)]">
              {data.top.map((c, i) => (
                <div key={c.name} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs text-[var(--color-muted)] w-4 shrink-0">{i + 1}</span>
                  <p className="text-xs font-medium truncate flex-1">{c.name}</p>
                  <span className="text-xs text-[var(--color-muted)] shrink-0">{data.total > 0 ? Math.round((c.exposure / data.total) * 100) : 0}% of AR</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0 text-[var(--color-primary)]">{formatCurrency(c.exposure)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`rounded-lg p-4 text-sm font-medium ${data.concPct >= 40 ? "bg-red-950/20 text-red-400" : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)]"}`}>
            If your top {data.n} customer{data.n !== 1 ? "s" : ""} delay {data.delay} days at {lossPct}% severity, {formatCurrency(Math.round(data.impact))} of collections is exposed - {data.concPct >= 40 ? "dangerously concentrated. Diversify the book or tighten their terms." : "within a comfortable range."}
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Simulates the cash hit if your largest debtors default or delay together. High concentration means one buyer's slip can sink your month - use it to justify diversifying sales or insuring top accounts.</p>
    </div>
  );
}

/* ── Customer Statement Generator ────────────────────────────── */
function CustomerStatementGenerator() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const customers = useMemo(() => Array.from(new Set(invoices.map(i => i.customer))).sort(), [invoices]);
  const [sel, setSel] = useState("");
  const [includePaid, setIncludePaid] = useState(true);

  const statement = useMemo(() => {
    if (!sel) return null;
    const list = invoices
      .filter(i => i.customer === sel && (includePaid || i.status !== "paid"))
      .sort((a, b) => parseISO(a.invoiceDate).getTime() - parseISO(b.invoiceDate).getTime());
    let running = 0;
    const lines = list.map(i => {
      const charge = i.amount;
      const credit = i.status === "paid" ? i.amount : 0;
      running += charge - credit;
      return { inv: i, charge, credit, balance: running };
    });
    const outstanding = list.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
    const billed = list.reduce((s, i) => s + i.amount, 0);
    return { lines, outstanding, billed };
  }, [sel, invoices, includePaid]);

  const copyStatement = () => {
    if (!statement || !sel) return;
    const header = `Statement of account - ${sel} (as of ${format(new Date(), "d MMM yyyy")})`;
    const body = statement.lines.map(l =>
      `${format(parseISO(l.inv.invoiceDate), "d MMM yyyy")} · ${l.inv.invoiceNumber ?? l.inv.id} · ${l.inv.status === "paid" ? "PAID" : "DUE"} · ${formatCurrency(l.inv.amount)} · bal ${formatCurrency(l.balance)}`
    ).join("\n");
    const footer = `Total outstanding: ${formatCurrency(statement.outstanding)}`;
    navigator.clipboard?.writeText(`${header}\n${body}\n${footer}`);
    toast.success("Statement copied to clipboard");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <FileText size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Customer Statement Generator</h3>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-[var(--color-muted)] block mb-1">Customer</label>
          <select value={sel} onChange={e => setSel(e.target.value)} className={INP}>
            <option value="">Select a customer</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] pb-2">
          <input type="checkbox" checked={includePaid} onChange={e => setIncludePaid(e.target.checked)} className="accent-[var(--color-primary)]" />
          Include paid invoices
        </label>
      </div>
      {!statement ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileText size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Select a customer to generate a running-balance statement of account.</p>
        </div>
      ) : statement.lines.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">No invoices match for {sel}.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Total billed</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(statement.billed)}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Outstanding balance</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(statement.outstanding)}</p>
            </div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-semibold">Statement - {sel}</h3>
              <button onClick={copyStatement} className="text-xs text-[var(--color-primary)] font-medium hover:underline">Copy statement</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="text-[var(--color-muted)] border-b border-[var(--color-border)]">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Invoice</th>
                    <th className="px-4 py-2 text-right font-medium">Charge</th>
                    <th className="px-4 py-2 text-right font-medium">Credit</th>
                    <th className="px-4 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {statement.lines.map(l => (
                    <tr key={l.inv.id}>
                      <td className="px-4 py-2.5 text-[var(--color-muted)]">{format(parseISO(l.inv.invoiceDate), "d MMM yy")}</td>
                      <td className="px-4 py-2.5">
                        {l.inv.invoiceNumber ?? l.inv.id}
                        <span className={`ml-2 text-[10px] font-semibold ${l.inv.status === "paid" ? "text-green-400" : l.inv.status === "overdue" ? "text-red-400" : "text-yellow-400"}`}>{l.inv.status === "paid" ? "PAID" : l.inv.status === "overdue" ? "OVERDUE" : "DUE"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(l.charge)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-green-400">{l.credit > 0 ? formatCurrency(l.credit) : "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCurrency(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Builds a chronological statement of account with a running balance (charges from invoices, credits when paid). Copy it to WhatsApp or email the customer their full ledger in one tap.</p>
    </div>
  );
}

/* ── Collection-Target Tracker ───────────────────────────────── */
function CollectionTargetTracker() {
  const { store } = useApp();
  const invoices = store.invoices ?? [];
  const [target, setTarget] = useFeatureState<string>("rec-collection-target", "");

  const data = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const collected = invoices
      .filter(i => i.status === "paid" && parseISO(i.invoiceDate) >= monthStart)
      .reduce((s, i) => s + (i.amount || 0), 0);
    const open = invoices.filter(i => i.status !== "paid");
    const dueThisMonth = open
      .filter(i => { const d = parseISO(i.dueDate); return d >= monthStart && d <= new Date(now.getFullYear(), now.getMonth() + 1, 0); })
      .reduce((s, i) => s + (i.amount || 0), 0);
    const tgt = parseFloat(target) || 0;
    const pct = tgt > 0 ? Math.min(100, Math.round((collected / tgt) * 100)) : 0;
    const gap = Math.max(0, tgt - collected);
    return { collected, dueThisMonth, tgt, pct, gap };
  }, [invoices, target]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <Target size={14} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">Collection-Target Tracker · {format(new Date(), "MMMM yyyy")}</h3>
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Monthly collection target</label>
          <input value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 500000" className={`${INP} w-44`} inputMode="decimal" />
        </div>
      </div>

      {data.tgt <= 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Target size={32} className="mx-auto mb-3 text-[var(--color-muted)] opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">Set a target above to track progress. Collected so far this month: {formatCurrency(data.collected)}.</p>
        </div>
      ) : (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-muted)]">{formatCurrency(data.collected)} of {formatCurrency(data.tgt)}</span>
              <span className={`font-bold tabular-nums ${data.pct >= 100 ? "text-green-400" : data.pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>{data.pct}%</span>
            </div>
            <div className="h-3 bg-[var(--color-bg)] rounded overflow-hidden">
              <div className="h-full rounded transition-all" style={{ width: `${data.pct}%`, background: data.pct >= 100 ? "#22c55e" : data.pct >= 60 ? "#eab308" : "#ef4444" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Gap to target</p>
              <p className="text-lg font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(Math.round(data.gap))}</p>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">Open & due this month</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(data.dueThisMonth)}</p>
            </div>
          </div>
          <button
            onClick={() => toast.success(data.gap <= 0 ? "Target hit - nice work!" : `${formatCurrency(Math.round(data.gap))} to go; ${formatCurrency(data.dueThisMonth)} due this month covers it`)}
            className="px-4 py-2 text-xs rounded bg-[var(--color-primary)] text-[var(--color-bg)] font-medium">
            Check progress
          </button>
        </>
      )}
      <p className="text-[10px] text-[var(--color-muted)]">Tracks cash collected (paid invoices dated this month) against your goal, and shows whether invoices already due this month can close the gap. Target persists across sessions.</p>
    </div>
  );
}
