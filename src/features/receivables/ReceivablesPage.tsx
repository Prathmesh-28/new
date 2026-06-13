import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId } from "@/lib/utils";
import { differenceInDays, format, parseISO } from "date-fns";
import { Plus, X, Send, CheckCircle2, AlertTriangle, Clock, Kanban, List, Star, TrendingDown, TrendingUp, Award } from "lucide-react";
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

export default function ReceivablesPage() {
  const { store, addInvoice, updateInvoice, deleteInvoice, isReadOnly } = useApp();
  const { invoices } = store;
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<"list" | "kanban">("list");
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

      {showAdd && (
        <AddInvoiceModal
          onClose={() => setShowAdd(false)}
          onAdd={inv => { addInvoice(inv); toast.success(`Invoice from ${inv.customer} added`); setShowAdd(false); }}
        />
      )}
    </div>
  );
}
