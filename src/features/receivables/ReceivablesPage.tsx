import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { Plus, X, Send, CheckCircle2, AlertTriangle, Clock, Kanban, List, Award, Gauge, Banknote, Link2, PieChart, MailCheck } from "lucide-react";
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

type ReceivablesTab = "overview" | "risk-score" | "factoring" | "cash-app" | "concentration" | "ar-confirm";

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
        {([["overview", "Overview", List], ["risk-score", "Customer Risk Scoring", Gauge], ["factoring", "Factoring / Discounting", Banknote], ["cash-app", "Cash Application", Link2], ["concentration", "Concentration Risk", PieChart], ["ar-confirm", "AR Confirmation Mailer", MailCheck]] as const).map(([id, label, Icon]) => (
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
