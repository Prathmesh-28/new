import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Plus, FileText, Send, Download, QrCode, X, Check, Clock, AlertCircle, MessageCircle, Bell, Zap, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { payInvoiceWithStripe } from "@/lib/billing";

interface InvoiceItem { description: string; hsn_sac: string; quantity: number; unit_price: number; gst_rate: number; amount: number; }
interface Invoice {
  id: string; invoice_number: string; customer_name: string; customer_gstin?: string;
  customer_email?: string; subtotal: number; gst_rate: number; gst_amount: number;
  total_amount: number; status: string; due_date?: string; paid_at?: string;
  irn?: string; upi_link?: string; aging?: string; items?: InvoiceItem[]; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft:     "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  sent:      "bg-blue-900/30 text-blue-400 border-blue-800/40",
  paid:      "bg-green-900/30 text-green-400 border-green-800/40",
  cancelled: "bg-red-900/20 text-red-400/60 border-red-800/20",
};
const AGING_COLOR: Record<string, string> = {
  current: "text-green-400", "30d": "text-yellow-400", "60d": "text-orange-400", "90d+": "text-red-400",
};

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState([{ description: "", hsn_sac: "", quantity: "1", unit_price: "", gst_rate: "18" }]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems(v => [...v, { description: "", hsn_sac: "", quantity: "1", unit_price: "", gst_rate: gstRate }]);
  const removeItem = (i: number) => setItems(v => v.filter((_, j) => j !== i));
  const updateItem = (i: number, key: string, val: string) => setItems(v => v.map((row, j) => j === i ? { ...row, [key]: val } : row));

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const gst      = subtotal * (parseFloat(gstRate) / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || items.some(it => !it.description || !it.unit_price)) {
      toast.error("Fill customer name and all item descriptions/prices"); return;
    }
    setSaving(true);
    try {
      await api.post("/api/invoices", {
        customer_name: customerName, customer_gstin: customerGstin || undefined,
        customer_email: customerEmail || undefined,
        customer_phone: customerPhone || undefined,
        gst_rate: parseFloat(gstRate),
        due_date: dueDate || undefined,
        items: items.map(it => ({
          description: it.description, hsn_sac: it.hsn_sac || undefined,
          quantity: parseFloat(it.quantity) || 1, unit_price: parseFloat(it.unit_price) || 0,
          gst_rate: parseFloat(it.gst_rate) || parseFloat(gstRate),
        })),
      });
      toast.success("Invoice created");
      onCreated();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally { setSaving(false); }
  };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const lbl = "block text-xs font-medium text-[var(--color-muted)] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-bold">New Invoice</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className={lbl}>Customer name *</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} required className={inp} placeholder="Acme Pvt Ltd" />
            </div>
            <div>
              <label className={lbl}>Customer GSTIN</label>
              <input value={customerGstin} onChange={e => setCustomerGstin(e.target.value)} className={inp} placeholder="27AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div>
              <label className={lbl}>Customer email</label>
              <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className={inp} placeholder="accounts@acme.com" />
            </div>
            <div>
              <label className={lbl}>Customer WhatsApp</label>
              <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={inp} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className={lbl}>GST rate (%)</label>
              <select value={gstRate} onChange={e => setGstRate(e.target.value)} className={inp}>
                {["0", "5", "12", "18", "28"].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Line items</label>
              <button type="button" onClick={addItem} className="text-xs text-[var(--color-primary)] hover:underline">+ Add item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <input value={item.description} onChange={e => updateItem(i, "description", e.target.value)}
                      className={inp} placeholder="Description" required />
                  </div>
                  <div className="col-span-2">
                    <input value={item.hsn_sac} onChange={e => updateItem(i, "hsn_sac", e.target.value)}
                      className={inp} placeholder="HSN/SAC" />
                  </div>
                  <div className="col-span-1">
                    <input type="number" min="0.001" step="0.001" value={item.quantity}
                      onChange={e => updateItem(i, "quantity", e.target.value)} className={inp} placeholder="Qty" required />
                  </div>
                  <div className="col-span-2">
                    <input type="number" min="0" step="0.01" value={item.unit_price}
                      onChange={e => updateItem(i, "unit_price", e.target.value)} className={inp} placeholder="Rate ₹" required />
                  </div>
                  <div className="col-span-1 text-right pt-2 text-xs font-semibold tabular-nums">
                    {formatCurrency((parseFloat(item.quantity)||0)*(parseFloat(item.unit_price)||0))}
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 pt-2">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-[var(--color-muted)]"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-[var(--color-muted)]"><span>GST {gstRate}%</span><span>{formatCurrency(gst)}</span></div>
            <div className="flex justify-between font-bold text-base text-[var(--color-primary)]"><span>Total</span><span>{formatCurrency(subtotal + gst)}</span></div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? "Creating…" : "Create Invoice"}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpiQrModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [qr, setQr]       = useState<string | null>(null);
  const [url, setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post<{ url: string; qr: string }>(`/api/invoices/${invoice.id}/upi-link`, {})
      .then(r => { setUrl(r.url); setQr(r.qr); })
      .catch(() => toast.error("Could not generate UPI link"))
      .finally(() => setLoading(false));
  }, [invoice.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-sm text-center">
        <h2 className="text-sm font-bold mb-1">UPI QR Code</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">{invoice.invoice_number} · {formatCurrency(invoice.total_amount)}</p>
        {loading ? <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto my-8" />
          : qr ? <img src={qr} alt="UPI QR" className="mx-auto rounded-lg mb-3 w-48 h-48" />
          : <p className="text-sm text-[var(--color-muted)]">Could not generate QR</p>
        }
        {url && <p className="text-[10px] text-[var(--color-muted)] break-all mb-4">{url.slice(0, 60)}…</p>}
        <button onClick={onClose} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">Close</button>
      </div>
    </div>
  );
}

function CollectionAutoPanel({ invoices, onRefresh }: { invoices: Invoice[]; onRefresh: () => void }) {
  const overdue = invoices.filter(i => i.aging && i.aging !== "current" && i.status !== "paid" && i.status !== "cancelled");
  const [reminding, setReminding] = useState<Record<string, boolean>>({});
  const [reminded, setReminded]   = useState<Set<string>>(new Set());

  const sendReminder = async (id: string) => {
    setReminding(r => ({ ...r, [id]: true }));
    try {
      await api.post(`/api/invoices/${id}/remind`, {});
      setReminded(s => new Set([...s, id]));
      toast.success("WhatsApp reminder sent with UPI payment link");
      onRefresh();
    } catch {
      toast.error("Could not send reminder");
    } finally {
      setReminding(r => ({ ...r, [id]: false }));
    }
  };

  const remindAll = async () => {
    const unreminded = overdue.filter(i => !reminded.has(i.id));
    for (const inv of unreminded) await sendReminder(inv.id);
    toast.success(`${unreminded.length} reminders sent`);
  };

  if (overdue.length === 0) {
    return (
      <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 flex items-center gap-3">
        <Check size={14} className="text-green-400 shrink-0" />
        <p className="text-sm text-green-300">All invoices are current — no overdue collections.</p>
      </div>
    );
  }

  const totalOverdue = overdue.reduce((s, i) => s + parseFloat(String(i.total_amount)), 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-sm font-semibold">Auto-Collection</span>
          <span className="text-xs bg-red-900/30 text-red-400 border border-red-800/30 px-2 py-0.5 rounded-full">{overdue.length} overdue · {formatCurrency(totalOverdue)}</span>
        </div>
        <button onClick={remindAll} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90">
          <Bell size={11} /> Remind All
        </button>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {overdue.map(inv => (
          <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-medium truncate">{inv.customer_name}</p>
                <span className={`text-[10px] font-semibold ${AGING_COLOR[inv.aging ?? "current"]}`}>
                  {inv.aging === "90d+" ? "90d+ overdue" : inv.aging === "60d" ? "60d overdue" : "30d overdue"}
                </span>
              </div>
              <p className="text-xs text-[var(--color-muted)]">{inv.invoice_number} · Due {inv.due_date}</p>
            </div>
            <p className="text-sm font-bold tabular-nums text-red-400 shrink-0">{formatCurrency(parseFloat(String(inv.total_amount)))}</p>
            {reminded.has(inv.id) ? (
              <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 border border-green-800/30 px-2 py-1 rounded-lg shrink-0">
                <Check size={10} /> Sent
              </span>
            ) : (
              <button onClick={() => sendReminder(inv.id)} disabled={reminding[inv.id]}
                className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-green-400 hover:border-green-700/50 hover:bg-green-900/10 px-2.5 py-1.5 rounded-lg shrink-0 disabled:opacity-40 transition-colors">
                <MessageCircle size={11} /> {reminding[inv.id] ? "Sending…" : "Remind"}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
        <p className="text-[11px] text-[var(--color-muted)]">Sends WhatsApp message with a one-tap UPI payment link. Invoice auto-marks paid when collected.</p>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [qrInvoice, setQrInvoice] = useState<Invoice | null>(null);
  const [tab, setTab]           = useState<"all" | "pending" | "paid" | "collection">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Invoice[]>("/api/invoices");
      setInvoices(data);
    } catch { /* ok */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markStatus = async (id: string, status: string) => {
    await api.patch(`/api/invoices/${id}`, { status }).catch(() => toast.error("Failed to update"));
    toast.success(`Marked as ${status}`);
    load();
  };

  const sendInvoice = async (id: string) => {
    await api.post(`/api/invoices/${id}/send`, {}).catch(() => toast.error("Failed to send"));
    toast.success("Invoice emailed to customer");
    load();
  };

  const downloadPdf = (id: string, num: string) => {
    const token = localStorage.getItem("hr_access");
    const a = document.createElement("a");
    fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/invoices/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(b => { a.href = URL.createObjectURL(b); a.download = `${num}.pdf`; a.click(); })
      .catch(() => toast.error("PDF generation failed"));
  };

  const overdueCount = invoices.filter(i => i.aging && i.aging !== "current" && i.status !== "paid" && i.status !== "cancelled").length;

  const filtered = invoices.filter(inv =>
    tab === "all" ? true :
    tab === "pending" ? inv.status !== "paid" && inv.status !== "cancelled" :
    tab === "paid" ? inv.status === "paid" :
    true
  );

  const totalPending = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + parseFloat(String(i.total_amount)), 0);
  const totalOverdue = invoices.filter(i => i.aging && i.aging !== "current" && i.aging !== "paid").reduce((s, i) => s + parseFloat(String(i.total_amount)), 0);
  const totalPaid    = invoices.filter(i => i.status === "paid").reduce((s, i) => s + parseFloat(String(i.total_amount)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Invoices</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">GST-compliant · UPI collections · Auto-reconcile</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={13} /> New Invoice
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending",  value: totalPending, color: "text-yellow-400" },
          { label: "Overdue",  value: totalOverdue, color: "text-red-400" },
          { label: "Paid (all time)", value: totalPaid, color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
            <p className={`text-xl font-semibold tabular-nums ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {(["all", "pending", "paid", "collection"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded font-medium capitalize transition-colors flex items-center gap-1.5 ${tab === t ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {t === "collection" && <Zap size={10} />}
            {t === "collection" ? "Auto-Collect" : t}
            {t === "collection" && overdueCount > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === t ? "bg-white/20 text-white" : "bg-red-900/40 text-red-400"}`}>{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "collection" ? (
        <CollectionAutoPanel invoices={invoices} onRefresh={load} />
      ) : loading ? (
        <div className="py-12 text-center text-sm text-[var(--color-muted)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-12 text-center">
          <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No invoices yet. Create your first GST-compliant invoice.</p>
          <button onClick={() => setShowNew(true)} className="mt-4 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg">Create Invoice</button>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden md:table-cell">Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-medium">{inv.invoice_number}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{new Date(inv.created_at).toLocaleDateString("en-IN")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium truncate max-w-[160px]">{inv.customer_name}</p>
                    {inv.customer_gstin && <p className="text-[10px] text-[var(--color-muted)]">{inv.customer_gstin}</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <p className="font-semibold">{formatCurrency(parseFloat(String(inv.total_amount)))}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">+GST {inv.gst_rate}%</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {inv.due_date ? (
                      <span className={`text-xs tabular-nums ${AGING_COLOR[inv.aging ?? "current"] ?? ""}`}>
                        {inv.aging === "90d+" ? "90d+ overdue" : inv.aging === "60d" ? "60d overdue" : inv.aging === "30d" ? "30d overdue" : inv.due_date}
                      </span>
                    ) : <span className="text-xs text-[var(--color-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[inv.status] ?? ""}`}>
                      {inv.status === "paid" ? <Check size={9} /> : inv.status === "sent" ? <Send size={9} /> : inv.status === "draft" ? <Clock size={9} /> : <AlertCircle size={9} />}
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => downloadPdf(inv.id, inv.invoice_number)} title="Download PDF"
                        className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-white/5 rounded">
                        <Download size={13} />
                      </button>
                      {inv.status !== "paid" && inv.status !== "cancelled" && (
                        <>
                          {inv.customer_email && inv.status !== "sent" && (
                            <button onClick={() => sendInvoice(inv.id)} title="Send by email"
                              className="p-1.5 text-[var(--color-muted)] hover:text-blue-400 hover:bg-blue-900/10 rounded">
                              <Send size={13} />
                            </button>
                          )}
                          <button onClick={() => setQrInvoice(inv)} title="UPI QR code"
                            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded">
                            <QrCode size={13} />
                          </button>
                          <button onClick={() => payInvoiceWithStripe(inv.id)} title="Pay by card (Stripe)"
                            className="p-1.5 text-[var(--color-muted)] hover:text-indigo-400 hover:bg-indigo-900/10 rounded">
                            <CreditCard size={13} />
                          </button>
                          {inv.aging && inv.aging !== "current" && (
                            <button onClick={async () => {
                              try { await api.post(`/api/invoices/${inv.id}/remind`, {}); toast.success("Reminder sent"); }
                              catch { toast.error("Failed to send reminder"); }
                            }} title="Send WhatsApp reminder"
                              className="p-1.5 text-[var(--color-muted)] hover:text-green-400 hover:bg-green-900/10 rounded">
                              <MessageCircle size={13} />
                            </button>
                          )}
                          <button onClick={() => markStatus(inv.id, "paid")} title="Mark paid"
                            className="p-1.5 text-[var(--color-muted)] hover:text-green-400 hover:bg-green-900/10 rounded">
                            <Check size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew   && <NewInvoiceModal onClose={() => setShowNew(false)} onCreated={load} />}
      {qrInvoice && <UpiQrModal invoice={qrInvoice} onClose={() => setQrInvoice(null)} />}
    </div>
  );
}
