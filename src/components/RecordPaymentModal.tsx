import { useState, useEffect } from "react";
import { X, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import DatePicker from "@/components/DatePicker";

// Shared REAL payment-recording modal - posts to the actual receipts ledger
// (POST /api/invoices/:id/payments), the single source of truth for what an
// invoice's outstanding balance is. An audit found THREE separate "part payment"
// trackers (Invoices, Receivables, Collections), each writing to its own local KV
// list that never touched paid_amount/the GL/the other two tabs - a receipt
// "recorded" in one never reduced the balance anywhere else, so AR, aging, and
// collections kept chasing the full amount while up to four screens could show
// four different "paid so far" figures for the same invoice. This is now the ONE
// place any page records a real receipt.
export interface PayableInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  paidAmount?: number;
  creditedAmount?: number;
}
interface InvoicePaymentRow { id: string; amount: number; mode: string; reference?: string; received_at: string; created_at: string; }

export default function RecordPaymentModal({ invoice, onClose, onDone }: { invoice: PayableInvoice; onClose: () => void; onDone: () => void }) {
  const total = invoice.totalAmount || 0;
  const alreadyPaid = invoice.paidAmount || 0;
  const credited = invoice.creditedAmount || 0;
  const balance = Math.round((total - alreadyPaid - credited) * 100) / 100;
  const [amount, setAmount] = useState<string>(balance > 0 ? String(balance) : "");
  const [mode, setMode] = useState("upi");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [history, setHistory] = useState<InvoicePaymentRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ payments: InvoicePaymentRow[] }>(`/api/invoices/${invoice.id}/payments`)
      .then(d => setHistory(d.payments ?? [])).catch(() => {});
  }, [invoice.id]);

  const amt = parseFloat(amount) || 0;
  const invalid = !(amt > 0) || amt > balance + 0.001;

  const submit = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      const res = await api.post<{ balance_due: number }>(`/api/invoices/${invoice.id}/payments`, { amount: amt, mode, reference: reference || undefined, received_at: receivedAt });
      toast.success(res.balance_due > 0 ? `Payment recorded · ${formatCurrency(res.balance_due)} still due` : "Payment recorded · invoice fully paid");
      onDone(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold flex items-center gap-2"><Wallet size={16} className="text-amber-400" /> Record payment</h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted)]">{invoice.invoiceNumber} · {invoice.customerName}</span>
            <span className="tabular-nums font-medium">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-xs bg-[var(--color-accent)] rounded-lg px-3 py-2">
            <span className="text-[var(--color-muted)]">Already received</span><span className="tabular-nums">{formatCurrency(alreadyPaid)}</span>
          </div>
          {credited > 0 && (
            <div className="flex justify-between text-xs bg-[var(--color-accent)] rounded-lg px-3 py-2">
              <span className="text-[var(--color-muted)]">Credit notes issued</span><span className="tabular-nums">−{formatCurrency(credited)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs px-3">
            <span className="text-[var(--color-muted)]">Balance due</span><span className="tabular-nums font-semibold text-amber-400">{formatCurrency(balance)}</span>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount received (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} max={balance} min={0} step="0.01"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm tabular-nums" />
            {amt > balance + 0.001 && <p className="text-[10px] text-red-400 mt-1">Can't exceed the {formatCurrency(balance)} balance.</p>}
            {balance > 0 && amt > 0 && amt < balance && <p className="text-[10px] text-[var(--color-muted)] mt-1">Partial — {formatCurrency(balance - amt)} will remain due.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm">
                {["upi", "cash", "bank", "neft", "cheque", "card", "other"].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <DatePicker label="Date" value={receivedAt} onChange={setReceivedAt} id="cash-received-date" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Reference (UTR / cheque no.) <span className="opacity-60">optional</span></label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. UTR 123456789" className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          {history.length > 0 && (
            <div className="border-t border-[var(--color-border)] pt-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Receipts</p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {history.map(p => (
                  <div key={p.id} className="flex justify-between text-xs">
                    <span className="text-[var(--color-muted)]">{new Date(p.received_at).toLocaleDateString("en-IN")} · {p.mode.toUpperCase()}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="tabular-nums">{formatCurrency(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
          <button onClick={submit} disabled={invalid || saving}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white font-medium disabled:opacity-50">
            {saving ? "Recording…" : "Record payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
