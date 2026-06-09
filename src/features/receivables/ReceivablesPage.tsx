import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { Plus, X, Send, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/data/types";

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

export default function ReceivablesPage() {
  const { store, addInvoice, updateInvoice, deleteInvoice, isReadOnly } = useApp();
  const { invoices } = store;
  const [showAdd, setShowAdd] = useState(false);
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
        {!isReadOnly && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] px-3 py-1.5 rounded-lg font-semibold hover:opacity-90">
            <Plus size={13} /> Add Invoice
          </button>
        )}
      </div>

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

      {/* Invoice list */}
      {pending.length > 0 ? (
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
      ) : (
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
      )}

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

      {showAdd && (
        <AddInvoiceModal
          onClose={() => setShowAdd(false)}
          onAdd={inv => { addInvoice(inv); toast.success(`Invoice from ${inv.customer} added`); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
