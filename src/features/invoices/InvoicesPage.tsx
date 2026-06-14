import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { useFeatureState } from "@/hooks/useFeatureState";
import type { Invoice as StoreInvoice } from "@/data/types";
import { formatCurrency } from "@/lib/utils";
import {
  Plus, FileText, Send, Download, QrCode, X, Check, Clock, AlertCircle, MessageCircle, Bell, Zap,
  FileSignature, FilePlus2, Repeat, Link2, FileMinus2, ShieldAlert, Globe, GitPullRequestArrow,
  Palette, Truck, Percent, Trash2, ArrowRight, Copy,
} from "lucide-react";
import { toast } from "sonner";

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
  const { setStore } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [qrInvoice, setQrInvoice] = useState<Invoice | null>(null);
  const [tab, setTab]           = useState<
    "all" | "pending" | "paid" | "collection"
    | "quote" | "proforma" | "recurring" | "paylink" | "creditnote" | "creditlimit"
    | "multicurrency" | "approval" | "template" | "challan" | "latefee"
  >("all");

  // Mirror the backend invoices into the shared store so the analytics engine,
  // Collections, Working Capital and Dashboard all read ONE unified AR list.
  // Reconcile deterministically: drop any prior backend-sourced mirrors and
  // re-add the current set (handles backend updates/deletes), while leaving
  // CSV-imported / manual store invoices untouched.
  const syncToStore = useCallback((data: Invoice[]) => {
    const mirrored: StoreInvoice[] = data
      .filter(d => d.status !== "cancelled")
      .map(d => ({
        id: d.id,
        customer: d.customer_name,
        amount: Number(d.total_amount) || 0,
        invoiceNumber: d.invoice_number,
        invoiceDate: (d.created_at || "").split("T")[0],
        dueDate: (d.due_date || d.created_at || "").split("T")[0],
        description: d.invoice_number || "",
        status: d.status === "paid"
          ? "paid"
          : (d.due_date && new Date(d.due_date) < new Date() ? "overdue" : "pending"),
        source: "backend",
      }));
    setStore(s => ({
      ...s,
      invoices: [...(s.invoices ?? []).filter(si => si.source !== "backend"), ...mirrored],
    }));
  }, [setStore]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Invoice[]>("/api/invoices");
      setInvoices(data);
      syncToStore(data);
    } catch { /* ok */ } finally { setLoading(false); }
  }, [syncToStore]);

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

      {/* Billing tools selector */}
      <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
        {([
          ["quote", "Quotation", FileSignature],
          ["proforma", "Proforma", FilePlus2],
          ["recurring", "Recurring", Repeat],
          ["paylink", "Pay Links", Link2],
          ["creditnote", "Credit/Debit Note", FileMinus2],
          ["creditlimit", "Credit Limit", ShieldAlert],
          ["multicurrency", "Multi-Currency", Globe],
          ["approval", "Approval", GitPullRequestArrow],
          ["template", "Template Studio", Palette],
          ["challan", "Delivery Challan", Truck],
          ["latefee", "Late-Fee/Interest", Percent],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      {tab === "quote"         ? <QuotationBuilder /> :
       tab === "proforma"      ? <ProformaGenerator /> :
       tab === "recurring"     ? <RecurringBilling /> :
       tab === "paylink"       ? <PaymentLinkBuilder invoices={invoices} /> :
       tab === "creditnote"    ? <CreditDebitNoteManager invoices={invoices} /> :
       tab === "creditlimit"   ? <CreditLimitManager invoices={invoices} /> :
       tab === "multicurrency" ? <MultiCurrencyInvoicing /> :
       tab === "approval"      ? <ApprovalWorkflow invoices={invoices} /> :
       tab === "template"      ? <TemplateStudio /> :
       tab === "challan"       ? <DeliveryChallan /> :
       tab === "latefee"       ? <LateFeeApplier invoices={invoices} /> :
       tab === "collection" ? (
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
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
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
                          <button onClick={() => setQrInvoice(inv)} title="UPI / card payment link"
                            className="p-1.5 text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded">
                            <QrCode size={13} />
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for the billing tools below
// ─────────────────────────────────────────────────────────────────────────────
const INP = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const LBL = "block text-xs text-[var(--color-muted)] mb-1";
const GST_RATES = ["0", "5", "12", "18", "28"] as const;
const uid = () => Math.random().toString(36).slice(2);

interface DocItem { id: string; description: string; hsn_sac: string; qty: string; rate: string; gst: string; }
const blankItem = (gst = "18"): DocItem => ({ id: uid(), description: "", hsn_sac: "", qty: "1", rate: "", gst });

// GST-correct line math: tax computed PER LINE on its own rate (mixed-rate safe).
function computeDoc(items: DocItem[]) {
  let subtotal = 0, gst = 0;
  const lines = items.map(it => {
    const amount = (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0);
    const lineGst = amount * ((parseFloat(it.gst) || 0) / 100);
    subtotal += amount; gst += lineGst;
    return { ...it, amount, lineGst };
  });
  return { lines, subtotal, gst: Math.round(gst * 100) / 100, total: Math.round((subtotal + gst) * 100) / 100 };
}

// Client-side UPI deep link (BIP-21 style upi://pay). No backend needed.
function buildUpiLink(vpa: string, name: string, amount: number, note: string) {
  const p = new URLSearchParams({
    pa: vpa, pn: name, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 50),
  });
  return `upi://pay?${p.toString()}`;
}

function LineItemsEditor({ items, setItems }: { items: DocItem[]; setItems: React.Dispatch<React.SetStateAction<DocItem[]>> }) {
  const upd = (id: string, k: keyof DocItem, v: string) => setItems(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Line items</label>
        <button type="button" onClick={() => setItems(p => [...p, blankItem()])} className="text-xs text-[var(--color-primary)] hover:underline">+ Add item</button>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="grid grid-cols-12 gap-2 items-start">
            <input value={item.description} onChange={e => upd(item.id, "description", e.target.value)} className={`${INP} col-span-4`} placeholder="Description" />
            <input value={item.hsn_sac} onChange={e => upd(item.id, "hsn_sac", e.target.value)} className={`${INP} col-span-2`} placeholder="HSN/SAC" />
            <input type="number" min="0" step="0.001" value={item.qty} onChange={e => upd(item.id, "qty", e.target.value)} className={`${INP} col-span-1`} placeholder="Qty" />
            <input type="number" min="0" step="0.01" value={item.rate} onChange={e => upd(item.id, "rate", e.target.value)} className={`${INP} col-span-2`} placeholder="Rate ₹" />
            <select value={item.gst} onChange={e => upd(item.id, "gst", e.target.value)} className={`${INP} col-span-2`}>
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
            {items.length > 1 && (
              <button type="button" onClick={() => setItems(p => p.filter(r => r.id !== item.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400 pt-2"><X size={13} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DocTotals({ subtotal, gst, total, prefix }: { subtotal: number; gst: number; total: number; prefix?: string }) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3 space-y-1 text-sm">
      <div className="flex justify-between text-[var(--color-muted)]"><span>{prefix ?? ""}Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
      <div className="flex justify-between text-[var(--color-muted)]"><span>GST</span><span>{formatCurrency(gst)}</span></div>
      <div className="flex justify-between font-bold text-base text-[var(--color-primary)]"><span>Total</span><span>{formatCurrency(total)}</span></div>
    </div>
  );
}

const NOTE = (text: string) => (
  <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)] flex items-start gap-2">
    <AlertCircle size={12} className="shrink-0 mt-px" />{text}
  </div>
);

// #39 ── Quotation / Estimate Builder ────────────────────────────────────────
interface Quotation { id: string; number: string; customer: string; validUntil: string; items: DocItem[]; status: "open" | "accepted" | "converted"; createdAt: string; }
function QuotationBuilder() {
  const [quotes, setQuotes] = useFeatureState<Quotation[]>("invoice-quotations", []);
  const [customer, setCustomer] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<DocItem[]>([blankItem()]);
  const calc = computeDoc(items);

  const save = () => {
    if (!customer || items.some(i => !i.description || !i.rate)) { toast.error("Add customer and item details"); return; }
    const number = `QT-${new Date().getFullYear()}-${String(quotes.length + 1).padStart(3, "0")}`;
    setQuotes(p => [{ id: uid(), number, customer, validUntil, items, status: "open", createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setValidUntil(""); setItems([blankItem()]);
    toast.success(`Quotation ${number} saved`);
  };
  const convert = (id: string) => {
    setQuotes(p => p.map(q => q.id === id ? { ...q, status: "converted" } : q));
    toast.success("Quotation converted to invoice draft — open 'New Invoice' to finalise");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSignature size={14} className="text-[var(--color-primary)]" /> Quotation / Estimate Builder</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LBL}>Customer *</label><input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Acme Pvt Ltd" /></div>
          <div><label className={LBL}>Valid until</label><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={INP} /></div>
        </div>
        <LineItemsEditor items={items} setItems={setItems} />
        <DocTotals subtotal={calc.subtotal} gst={calc.gst} total={calc.total} />
        <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-4 rounded-lg text-sm hover:opacity-90">Save Quotation</button>
      </div>
      {quotes.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Quote", "Customer", "Valid", "Total", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {quotes.map(q => { const c = computeDoc(q.items); return (
                <tr key={q.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{q.number}</td>
                  <td className="px-4 py-2.5">{q.customer}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{q.validUntil || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(c.total)}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${q.status === "converted" ? "bg-green-900/30 text-green-400 border-green-800/40" : q.status === "accepted" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{q.status}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    {q.status !== "converted" && <button onClick={() => convert(q.id)} className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">Convert <ArrowRight size={11} /></button>}
                    <button onClick={() => setQuotes(p => p.filter(x => x.id !== q.id))} className="ml-3 text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Quotations carry no GST liability until converted. On conversion, copy lines into a New Invoice to allot a GST invoice number.")}
    </div>
  );
}

// #40 ── Proforma Invoice Generator ──────────────────────────────────────────
interface Proforma { id: string; number: string; customer: string; advancePct: string; items: DocItem[]; converted: boolean; createdAt: string; }
function ProformaGenerator() {
  const [docs, setDocs] = useFeatureState<Proforma[]>("invoice-proformas", []);
  const [customer, setCustomer] = useState("");
  const [advancePct, setAdvancePct] = useState("50");
  const [items, setItems] = useState<DocItem[]>([blankItem()]);
  const calc = computeDoc(items);
  const advance = Math.round(calc.total * (parseFloat(advancePct) || 0) / 100);

  const save = () => {
    if (!customer || items.some(i => !i.description || !i.rate)) { toast.error("Add customer and item details"); return; }
    const number = `PI-${new Date().getFullYear()}-${String(docs.length + 1).padStart(3, "0")}`;
    setDocs(p => [{ id: uid(), number, customer, advancePct, items, converted: false, createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setItems([blankItem()]);
    toast.success(`Proforma ${number} created`);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FilePlus2 size={14} className="text-[var(--color-primary)]" /> Proforma Invoice Generator</h2>
        <p className="text-xs text-[var(--color-muted)]">Issued before supply to request an advance. Not a tax invoice — no ITC for the buyer until the final invoice.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LBL}>Customer *</label><input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Acme Pvt Ltd" /></div>
          <div><label className={LBL}>Advance requested (%)</label><input type="number" min="0" max="100" value={advancePct} onChange={e => setAdvancePct(e.target.value)} className={INP} /></div>
        </div>
        <LineItemsEditor items={items} setItems={setItems} />
        <DocTotals subtotal={calc.subtotal} gst={calc.gst} total={calc.total} />
        <div className="flex justify-between text-sm font-bold text-orange-400"><span>Advance payable now ({advancePct || 0}%)</span><span>{formatCurrency(advance)}</span></div>
        <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-4 rounded-lg text-sm hover:opacity-90">Save Proforma</button>
      </div>
      {docs.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Proforma", "Customer", "Total", "Advance", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {docs.map(d => { const c = computeDoc(d.items); const adv = Math.round(c.total * (parseFloat(d.advancePct) || 0) / 100); return (
                <tr key={d.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{d.number}</td>
                  <td className="px-4 py-2.5">{d.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(c.total)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-orange-400">{formatCurrency(adv)}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${d.converted ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{d.converted ? "converted" : "open"}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    {!d.converted && <button onClick={() => { setDocs(p => p.map(x => x.id === d.id ? { ...x, converted: true } : x)); toast.success("Marked converted — raise the tax invoice on supply"); }} className="text-xs text-[var(--color-primary)] hover:underline">Mark converted</button>}
                    <button onClick={() => setDocs(p => p.filter(x => x.id !== d.id))} className="ml-3 text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// #41 ── Recurring / Subscription Billing ─────────────────────────────────────
interface Recurring { id: string; customer: string; amount: string; gst: string; freq: "monthly" | "quarterly" | "yearly"; nextRun: string; active: boolean; generated: number; }
function RecurringBilling() {
  const [subs, setSubs] = useFeatureState<Recurring[]>("invoice-recurring", []);
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("18");
  const [freq, setFreq] = useState<Recurring["freq"]>("monthly");
  const [nextRun, setNextRun] = useState(() => new Date().toISOString().split("T")[0]);

  const advance = (date: string, f: Recurring["freq"]) => {
    const d = new Date(date);
    if (f === "monthly") d.setMonth(d.getMonth() + 1);
    else if (f === "quarterly") d.setMonth(d.getMonth() + 3);
    else d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  };

  const add = () => {
    if (!customer || !amount) { toast.error("Add customer and amount"); return; }
    setSubs(p => [...p, { id: uid(), customer, amount, gst, freq, nextRun, active: true, generated: 0 }]);
    setCustomer(""); setAmount("");
    toast.success("Subscription scheduled");
  };
  const runNow = (id: string) => {
    setSubs(p => p.map(s => s.id === id ? { ...s, nextRun: advance(s.nextRun, s.freq), generated: s.generated + 1 } : s));
    toast.success("Invoice generated — next cycle scheduled");
  };

  const today = new Date().toISOString().split("T")[0];
  const dueNow = subs.filter(s => s.active && s.nextRun <= today);
  const mrr = subs.filter(s => s.active).reduce((sum, s) => {
    const t = (parseFloat(s.amount) || 0) * (1 + (parseFloat(s.gst) || 0) / 100);
    return sum + (s.freq === "monthly" ? t : s.freq === "quarterly" ? t / 3 : t / 12);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active subscriptions", value: String(subs.filter(s => s.active).length), color: "text-blue-400" },
          { label: "Est. MRR (incl GST)", value: formatCurrency(Math.round(mrr)), color: "text-green-400" },
          { label: "Due to generate", value: String(dueNow.length), color: dueNow.length ? "text-orange-400" : "text-[var(--color-muted)]" },
        ].map(c => <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p></div>)}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Repeat size={14} className="text-[var(--color-primary)]" /> Recurring / Subscription Billing</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Customer *" />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={INP} placeholder="Amount ₹ *" />
          <select value={gst} onChange={e => setGst(e.target.value)} className={INP}>{GST_RATES.map(r => <option key={r} value={r}>GST {r}%</option>)}</select>
          <select value={freq} onChange={e => setFreq(e.target.value as Recurring["freq"])} className={INP}>{(["monthly", "quarterly", "yearly"] as const).map(f => <option key={f} value={f}>{f}</option>)}</select>
          <input type="date" value={nextRun} onChange={e => setNextRun(e.target.value)} className={INP} />
        </div>
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Schedule</button>
      </div>
      {subs.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Customer", "Amount+GST", "Freq", "Next run", "Generated", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {subs.map(s => { const tot = (parseFloat(s.amount) || 0) * (1 + (parseFloat(s.gst) || 0) / 100); const due = s.active && s.nextRun <= today; return (
                <tr key={s.id} className={`hover:bg-white/2 ${due ? "bg-orange-950/10" : ""}`}>
                  <td className="px-4 py-2.5 font-medium">{s.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(tot))}</td>
                  <td className="px-4 py-2.5 text-xs capitalize">{s.freq}</td>
                  <td className={`px-4 py-2.5 text-xs ${due ? "text-orange-400 font-semibold" : "text-[var(--color-muted)]"}`}>{s.nextRun}</td>
                  <td className="px-4 py-2.5 tabular-nums text-xs">{s.generated}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => runNow(s.id)} className="text-xs text-[var(--color-primary)] hover:underline">Generate now</button>
                    <button onClick={() => setSubs(p => p.map(x => x.id === s.id ? { ...x, active: !x.active } : x))} className="ml-3 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">{s.active ? "Pause" : "Resume"}</button>
                    <button onClick={() => setSubs(p => p.filter(x => x.id !== s.id))} className="ml-3 text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Cycles advance on 'Generate now'. Connect to a scheduler/cron to auto-generate the invoice on the next-run date.")}
    </div>
  );
}

// #42 ── Payment Links (UPI/card) on Invoice ─────────────────────────────────
function PaymentLinkBuilder({ invoices }: { invoices: Invoice[] }) {
  const { store } = useApp();
  const vpaDefault = (store.firm as { upiVpa?: string } | undefined)?.upiVpa ?? "";
  const [vpa, setVpa] = useState(vpaDefault);
  const [payeeName, setPayeeName] = useState(store.firm?.name ?? "");
  const [selected, setSelected] = useState("");
  const [manualAmt, setManualAmt] = useState("");

  const inv = invoices.find(i => i.id === selected);
  const amount = inv ? Number(inv.total_amount) || 0 : parseFloat(manualAmt) || 0;
  const note = inv ? inv.invoice_number : "Payment";
  const upi = vpa && amount > 0 ? buildUpiLink(vpa, payeeName || "Merchant", amount, note) : "";
  // Generic web pay URL (card/netbanking) — a hosted checkout page can read these params.
  const webPay = amount > 0 ? `https://pay.headroom.app/c?${new URLSearchParams({ amt: amount.toFixed(2), cu: "INR", ref: note }).toString()}` : "";

  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.success("Link copied"); };
  const unpaid = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} className="text-[var(--color-primary)]" /> Payment Links (UPI / card)</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LBL}>Your UPI VPA</label><input value={vpa} onChange={e => setVpa(e.target.value)} className={INP} placeholder="merchant@upi" /></div>
          <div><label className={LBL}>Payee name</label><input value={payeeName} onChange={e => setPayeeName(e.target.value)} className={INP} placeholder="Your Firm" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Invoice (live)</label>
            <select value={selected} onChange={e => { setSelected(e.target.value); setManualAmt(""); }} className={INP}>
              <option value="">— manual amount —</option>
              {unpaid.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {formatCurrency(Number(i.total_amount) || 0)}</option>)}
            </select>
          </div>
          <div><label className={LBL}>Or amount (₹)</label><input type="number" value={manualAmt} disabled={!!selected} onChange={e => setManualAmt(e.target.value)} className={`${INP} disabled:opacity-50`} placeholder="0" /></div>
        </div>
      </div>
      {amount > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
          <p className="text-sm">Collecting <span className="font-bold text-[var(--color-primary)]">{formatCurrency(amount)}</span> for <span className="font-mono text-xs">{note}</span></p>
          {[{ label: "UPI deep link", val: upi, hint: "Opens any UPI app (GPay/PhonePe/Paytm)" }, { label: "Card / netbanking link", val: webPay, hint: "Hosted checkout page" }].map(l => l.val && (
            <div key={l.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold">{l.label}</span><span className="text-[10px] text-[var(--color-muted)]">{l.hint}</span></div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] text-[var(--color-muted)] break-all">{l.val}</code>
                <button onClick={() => copy(l.val)} className="shrink-0 p-1.5 text-[var(--color-muted)] hover:text-[var(--color-primary)]"><Copy size={13} /></button>
                <a href={l.val} target="_blank" rel="noreferrer" className="shrink-0 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg">Open</a>
              </div>
            </div>
          ))}
          {!upi && <p className="text-xs text-yellow-400">Enter your UPI VPA above to generate the one-tap UPI link.</p>}
        </div>
      )}
      {NOTE("Links are built client-side. UPI mark-as-paid is manual here (or via the QR webhook). Settle to your own VPA / PSP — no funds touch Headroom.")}
    </div>
  );
}

// #43 ── Credit Note & Debit Note Manager ────────────────────────────────────
interface CDNote { id: string; type: "credit" | "debit"; number: string; againstInvoice: string; customer: string; reason: string; taxable: string; gst: string; createdAt: string; }
function CreditDebitNoteManager({ invoices }: { invoices: Invoice[] }) {
  const [notes, setNotes] = useFeatureState<CDNote[]>("invoice-cdnotes", []);
  const [type, setType] = useState<CDNote["type"]>("credit");
  const [against, setAgainst] = useState("");
  const [customer, setCustomer] = useState("");
  const [reason, setReason] = useState("");
  const [taxable, setTaxable] = useState("");
  const [gst, setGst] = useState("18");

  const onPickInv = (num: string) => {
    setAgainst(num);
    const inv = invoices.find(i => i.invoice_number === num);
    if (inv) { setCustomer(inv.customer_name); setGst(String(inv.gst_rate ?? 18)); }
  };
  const tx = parseFloat(taxable) || 0;
  const gstAmt = Math.round(tx * (parseFloat(gst) || 0) / 100);
  const total = tx + gstAmt;

  const save = () => {
    if (!customer || !taxable) { toast.error("Add customer and taxable value"); return; }
    const prefix = type === "credit" ? "CN" : "DN";
    const number = `${prefix}-${new Date().getFullYear()}-${String(notes.filter(n => n.type === type).length + 1).padStart(3, "0")}`;
    setNotes(p => [{ id: uid(), type, number, againstInvoice: against, customer, reason, taxable, gst, createdAt: new Date().toISOString() }, ...p]);
    setTaxable(""); setReason("");
    toast.success(`${type === "credit" ? "Credit" : "Debit"} note ${number} issued`);
  };

  const netCredit = notes.filter(n => n.type === "credit").reduce((s, n) => s + (parseFloat(n.taxable) || 0) * (1 + (parseFloat(n.gst) || 0) / 100), 0);
  const netDebit = notes.filter(n => n.type === "debit").reduce((s, n) => s + (parseFloat(n.taxable) || 0) * (1 + (parseFloat(n.gst) || 0) / 100), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Credit notes (GST reduces output tax)</p><p className="text-lg font-bold tabular-nums text-green-400">{formatCurrency(Math.round(netCredit))}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Debit notes (GST increases output tax)</p><p className="text-lg font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(netDebit))}</p></div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileMinus2 size={14} className="text-[var(--color-primary)]" /> Credit / Debit Note Manager</h2>
        <div className="flex gap-2">
          {(["credit", "debit"] as const).map(t => <button key={t} onClick={() => setType(t)} className={`flex-1 py-2 text-xs font-semibold rounded-lg border capitalize ${type === t ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>{t} note</button>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Against invoice</label>
            <select value={against} onChange={e => onPickInv(e.target.value)} className={INP}>
              <option value="">— select / manual —</option>
              {invoices.map(i => <option key={i.id} value={i.invoice_number}>{i.invoice_number}</option>)}
            </select>
          </div>
          <div><label className={LBL}>Customer *</label><input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} /></div>
          <div><label className={LBL}>Taxable value (₹) *</label><input type="number" value={taxable} onChange={e => setTaxable(e.target.value)} className={INP} /></div>
          <div><label className={LBL}>GST rate</label><select value={gst} onChange={e => setGst(e.target.value)} className={INP}>{GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
        </div>
        <div><label className={LBL}>Reason</label><input value={reason} onChange={e => setReason(e.target.value)} className={INP} placeholder="Goods returned / price revision / deficiency" /></div>
        <div className="flex justify-between text-sm border-t border-[var(--color-border)] pt-2"><span className="text-[var(--color-muted)]">GST {gst}% + total</span><span className="font-bold tabular-nums">{formatCurrency(gstAmt)} · {formatCurrency(total)}</span></div>
        <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">Issue {type} note</button>
      </div>
      {notes.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Note", "Type", "Against", "Customer", "Total", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {notes.map(n => { const t = (parseFloat(n.taxable) || 0) * (1 + (parseFloat(n.gst) || 0) / 100); return (
                <tr key={n.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{n.number}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${n.type === "credit" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-orange-900/30 text-orange-400 border-orange-800/40"}`}>{n.type}</span></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{n.againstInvoice || "—"}</td>
                  <td className="px-4 py-2.5">{n.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(t))}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setNotes(p => p.filter(x => x.id !== n.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Credit notes must be reported in GSTR-1 by 30 Nov following the FY-end to reverse output tax. Debit notes increase tax liability in the issue month.")}
    </div>
  );
}

// #44 ── Customer Credit Limit & Hold ────────────────────────────────────────
interface CreditCfg { id: string; customer: string; limit: string; overdueDaysHold: string; }
function CreditLimitManager({ invoices }: { invoices: Invoice[] }) {
  const [cfgs, setCfgs] = useFeatureState<CreditCfg[]>("invoice-credit-limits", []);
  const [customer, setCustomer] = useState("");
  const [limit, setLimit] = useState("");
  const [holdDays, setHoldDays] = useState("30");

  const add = () => {
    if (!customer || !limit) { toast.error("Add customer and limit"); return; }
    setCfgs(p => [...p.filter(c => c.customer.toLowerCase() !== customer.toLowerCase()), { id: uid(), customer, limit, overdueDaysHold: holdDays }]);
    setCustomer(""); setLimit("");
    toast.success("Credit limit set");
  };

  // Outstanding (unpaid) exposure per customer from live invoices.
  const exposure = useMemo(() => {
    const map: Record<string, { outstanding: number; overdue: number }> = {};
    const now = Date.now();
    invoices.forEach(i => {
      if (i.status === "paid" || i.status === "cancelled") return;
      const amt = Number(i.total_amount) || 0;
      const k = i.customer_name;
      map[k] = map[k] || { outstanding: 0, overdue: 0 };
      map[k].outstanding += amt;
      if (i.due_date && new Date(i.due_date).getTime() < now) map[k].overdue += amt;
    });
    return map;
  }, [invoices]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldAlert size={14} className="text-[var(--color-primary)]" /> Customer Credit Limit & Hold</h2>
        <div className="grid grid-cols-3 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Customer *" />
          <input type="number" value={limit} onChange={e => setLimit(e.target.value)} className={INP} placeholder="Credit limit ₹ *" />
          <input type="number" value={holdDays} onChange={e => setHoldDays(e.target.value)} className={INP} placeholder="Hold if overdue > days" />
        </div>
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">Set limit</button>
      </div>
      {cfgs.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Customer", "Limit", "Outstanding", "Utilisation", "Overdue", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {cfgs.map(c => {
                const lim = parseFloat(c.limit) || 0;
                const ex = exposure[c.customer] || { outstanding: 0, overdue: 0 };
                const util = lim > 0 ? Math.round((ex.outstanding / lim) * 100) : 0;
                const onHold = ex.outstanding > lim || ex.overdue > 0;
                return (
                  <tr key={c.id} className={`hover:bg-white/2 ${onHold ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{c.customer}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(lim)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(ex.outstanding))}</td>
                    <td className="px-4 py-2.5 w-32">
                      <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, util)}%`, background: util > 100 ? "#ef4444" : util > 80 ? "#f97316" : "#22c55e" }} /></div><span className="text-[10px] tabular-nums">{util}%</span></div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{ex.overdue > 0 ? formatCurrency(Math.round(ex.overdue)) : "—"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${onHold ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{onHold ? "ON HOLD" : "OK to bill"}</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setCfgs(p => p.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Exposure is computed from unpaid live invoices. ON HOLD when outstanding exceeds the limit or any invoice is past its due date — block new orders until cleared.")}
    </div>
  );
}

// #45 ── Multi-Currency Export Invoicing (FX realisation) ─────────────────────
interface FxInvoice { id: string; number: string; customer: string; currency: string; fcyAmount: string; rateAtInvoice: string; rateAtRealisation: string; realised: boolean; createdAt: string; }
const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SGD", "AUD"] as const;
function MultiCurrencyInvoicing() {
  const [docs, setDocs] = useFeatureState<FxInvoice[]>("invoice-fx", []);
  const [customer, setCustomer] = useState("");
  const [currency, setCurrency] = useState<string>("USD");
  const [fcy, setFcy] = useState("");
  const [rate, setRate] = useState("");

  const add = () => {
    if (!customer || !fcy || !rate) { toast.error("Add customer, amount and FX rate"); return; }
    const number = `EXP-${new Date().getFullYear()}-${String(docs.length + 1).padStart(3, "0")}`;
    setDocs(p => [{ id: uid(), number, customer, currency, fcyAmount: fcy, rateAtInvoice: rate, rateAtRealisation: "", realised: false, createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setFcy(""); setRate("");
    toast.success(`Export invoice ${number} (LUT — 0% IGST) recorded`);
  };
  const realise = (id: string, realRate: string) => {
    setDocs(p => p.map(d => d.id === id ? { ...d, rateAtRealisation: realRate, realised: true } : d));
    toast.success("Realisation booked — FX gain/loss computed");
  };

  const totalGainLoss = docs.reduce((s, d) => {
    if (!d.realised) return s;
    const fcyAmt = parseFloat(d.fcyAmount) || 0;
    return s + fcyAmt * ((parseFloat(d.rateAtRealisation) || 0) - (parseFloat(d.rateAtInvoice) || 0));
  }, 0);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Globe size={14} className="text-[var(--color-primary)]" /> Multi-Currency Export Invoicing</h2>
        <p className="text-xs text-[var(--color-muted)]">Exports under LUT are zero-rated (0% IGST). Record the FX rate on invoice date; book realised INR + FX gain/loss when payment lands.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Overseas customer *" />
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={INP}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <input type="number" value={fcy} onChange={e => setFcy(e.target.value)} className={INP} placeholder={`Amount (${currency}) *`} />
          <input type="number" step="0.0001" value={rate} onChange={e => setRate(e.target.value)} className={INP} placeholder="₹/unit on invoice *" />
        </div>
        {fcy && rate && <p className="text-xs text-[var(--color-muted)]">Invoice value: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(Math.round((parseFloat(fcy) || 0) * (parseFloat(rate) || 0)))}</span> ({currency} {fcy} @ ₹{rate})</p>}
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Record export invoice</button>
      </div>
      {docs.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-[var(--color-muted)]">Net realised FX gain / (loss)</span>
            <span className={`text-lg font-bold tabular-nums ${totalGainLoss >= 0 ? "text-green-400" : "text-red-400"}`}>{totalGainLoss < 0 ? `(${formatCurrency(Math.abs(Math.round(totalGainLoss)))})` : formatCurrency(Math.round(totalGainLoss))}</span>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "FCY", "Inv rate", "INR @ invoice", "Real. rate", "FX G/(L)", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {docs.map(d => {
                  const fcyAmt = parseFloat(d.fcyAmount) || 0;
                  const invINR = fcyAmt * (parseFloat(d.rateAtInvoice) || 0);
                  const gl = d.realised ? fcyAmt * ((parseFloat(d.rateAtRealisation) || 0) - (parseFloat(d.rateAtInvoice) || 0)) : 0;
                  return (
                    <tr key={d.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-mono text-xs">{d.number}</td>
                      <td className="px-4 py-2.5">{d.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs">{d.currency} {fcyAmt.toLocaleString()}</td>
                      <td className="px-4 py-2.5 tabular-nums text-xs">₹{d.rateAtInvoice}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(Math.round(invINR))}</td>
                      <td className="px-4 py-2.5">
                        {d.realised ? <span className="text-xs tabular-nums">₹{d.rateAtRealisation}</span> : (
                          <input type="number" step="0.0001" placeholder="₹/unit" className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none"
                            onKeyDown={e => { if (e.key === "Enter") realise(d.id, (e.target as HTMLInputElement).value); }} />
                        )}
                      </td>
                      <td className={`px-4 py-2.5 tabular-nums text-xs font-semibold ${!d.realised ? "text-[var(--color-muted)]" : gl >= 0 ? "text-green-400" : "text-red-400"}`}>{d.realised ? (gl < 0 ? `(${formatCurrency(Math.abs(Math.round(gl)))})` : formatCurrency(Math.round(gl))) : "pending"}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setDocs(p => p.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {NOTE("Type the realisation rate and press Enter to book. FX gain/loss = FCY × (realisation rate − invoice rate). Report under 'other income' / forex P&L.")}
    </div>
  );
}

// #46 ── Invoice Approval Workflow (maker-checker) ───────────────────────────
interface ApprovalReq { id: string; invoiceNumber: string; customer: string; amount: number; maker: string; status: "pending" | "approved" | "rejected"; note: string; createdAt: string; }
function ApprovalWorkflow({ invoices }: { invoices: Invoice[] }) {
  const { store } = useApp();
  const [threshold, setThreshold] = useFeatureState<number>("invoice-approval-threshold", 100000);
  const [reqs, setReqs] = useFeatureState<ApprovalReq[]>("invoice-approvals", []);
  const maker = store.firm?.name ?? "Maker";

  // High-value live invoices not yet routed for approval.
  const highValue = invoices.filter(i => (Number(i.total_amount) || 0) >= threshold && i.status !== "cancelled");
  const routed = new Set(reqs.map(r => r.invoiceNumber));

  const route = (i: Invoice) => {
    setReqs(p => [{ id: uid(), invoiceNumber: i.invoice_number, customer: i.customer_name, amount: Number(i.total_amount) || 0, maker, status: "pending", note: "", createdAt: new Date().toISOString() }, ...p]);
    toast.success(`${i.invoice_number} routed for checker approval`);
  };
  const decide = (id: string, status: "approved" | "rejected") => {
    setReqs(p => p.map(r => r.id === id ? { ...r, status } : r));
    toast.success(`Invoice ${status}`);
  };

  const pending = reqs.filter(r => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitPullRequestArrow size={14} className="text-[var(--color-primary)]" /> Invoice Approval Workflow</h2>
        <div className="max-w-xs">
          <label className={LBL}>Approval threshold (₹) — invoices above this need a checker</label>
          <input type="number" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value) || 0)} className={INP} />
        </div>
      </div>
      {highValue.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">High-value invoices ({formatCurrency(threshold)}+)</p>
          <div className="space-y-2">
            {highValue.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span><span className="font-mono text-xs">{i.invoice_number}</span> · {i.customer_name} · <span className="font-semibold">{formatCurrency(Number(i.total_amount) || 0)}</span></span>
                {routed.has(i.invoice_number) ? <span className="text-[10px] text-[var(--color-muted)]">routed</span> : <button onClick={() => route(i)} className="text-xs text-[var(--color-primary)] hover:underline">Route for approval</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {reqs.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "Amount", "Maker", "Status", "Checker action"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {reqs.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{r.invoiceNumber}</td>
                  <td className="px-4 py-2.5">{r.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{r.maker}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${r.status === "approved" ? "bg-green-900/30 text-green-400 border-green-800/40" : r.status === "rejected" ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>{r.status}</span></td>
                  <td className="px-4 py-2.5">
                    {r.status === "pending" ? (
                      <div className="flex gap-2">
                        <button onClick={() => decide(r.id, "approved")} className="text-xs text-green-400 hover:underline flex items-center gap-1"><Check size={11} /> Approve</button>
                        <button onClick={() => decide(r.id, "rejected")} className="text-xs text-red-400 hover:underline flex items-center gap-1"><X size={11} /> Reject</button>
                      </div>
                    ) : <span className="text-[10px] text-[var(--color-muted)]">closed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs text-[var(--color-muted)]">No approval requests yet.{pending.length === 0 && highValue.length === 0 ? " No high-value invoices above the threshold." : ""}</p>}
      {NOTE("Maker routes, a separate checker approves/rejects before the invoice is sent. Approved high-value invoices are safe to email/dispatch.")}
    </div>
  );
}

// #47 ── Branded Invoice Template Studio ─────────────────────────────────────
interface Theme { logoText: string; primary: string; accent: string; font: string; terms: string; footer: string; }
const DEFAULT_THEME: Theme = { logoText: "YOUR FIRM", primary: "#6366f1", accent: "#f1f5f9", font: "Inter", terms: "Payment due within 15 days. Interest @18% p.a. on overdue.", footer: "Thank you for your business." };
function TemplateStudio() {
  const [theme, setTheme] = useFeatureState<Theme>("invoice-template-theme", DEFAULT_THEME);
  const upd = (k: keyof Theme, v: string) => setTheme(t => ({ ...t, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Palette size={14} className="text-[var(--color-primary)]" /> Branded Template Studio</h2>
          <div><label className={LBL}>Logo text / company name</label><input value={theme.logoText} onChange={e => upd("logoText", e.target.value)} className={INP} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LBL}>Primary colour</label><div className="flex gap-2"><input type="color" value={theme.primary} onChange={e => upd("primary", e.target.value)} className="h-9 w-12 rounded border border-[var(--color-border)] bg-[var(--color-bg)]" /><input value={theme.primary} onChange={e => upd("primary", e.target.value)} className={INP} /></div></div>
            <div><label className={LBL}>Accent colour</label><div className="flex gap-2"><input type="color" value={theme.accent} onChange={e => upd("accent", e.target.value)} className="h-9 w-12 rounded border border-[var(--color-border)] bg-[var(--color-bg)]" /><input value={theme.accent} onChange={e => upd("accent", e.target.value)} className={INP} /></div></div>
          </div>
          <div><label className={LBL}>Font family</label><select value={theme.font} onChange={e => upd("font", e.target.value)} className={INP}>{["Inter", "Georgia", "Arial", "Courier New", "Times New Roman"].map(f => <option key={f} value={f}>{f}</option>)}</select></div>
          <div><label className={LBL}>Terms & conditions</label><textarea value={theme.terms} onChange={e => upd("terms", e.target.value)} className={`${INP} h-20`} /></div>
          <div><label className={LBL}>Footer note</label><input value={theme.footer} onChange={e => upd("footer", e.target.value)} className={INP} /></div>
          <button onClick={() => setTheme(DEFAULT_THEME)} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Reset to default</button>
        </div>
        {/* Live preview */}
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6 text-black overflow-hidden" style={{ fontFamily: theme.font }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-extrabold tracking-tight" style={{ color: theme.primary }}>{theme.logoText || "YOUR FIRM"}</span>
            <span className="text-xs font-bold px-3 py-1 rounded" style={{ background: theme.accent, color: theme.primary }}>TAX INVOICE</span>
          </div>
          <div className="text-xs text-gray-500 mb-3">Invoice #INV-2026-001 · {new Date().toLocaleDateString("en-IN")}</div>
          <table className="w-full text-xs mb-3">
            <thead><tr style={{ background: theme.accent }}><th className="text-left p-1.5">Item</th><th className="text-right p-1.5">Qty</th><th className="text-right p-1.5">Rate</th><th className="text-right p-1.5">Amount</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-1.5">Consulting services</td><td className="text-right p-1.5">10</td><td className="text-right p-1.5">5,000</td><td className="text-right p-1.5">50,000</td></tr>
              <tr className="border-b"><td className="p-1.5">GST @ 18%</td><td colSpan={2}></td><td className="text-right p-1.5">9,000</td></tr>
            </tbody>
          </table>
          <div className="flex justify-end text-sm font-bold mb-3" style={{ color: theme.primary }}>Total: ₹59,000</div>
          <p className="text-[10px] text-gray-600 border-t pt-2">{theme.terms}</p>
          <p className="text-[10px] text-gray-400 mt-1">{theme.footer}</p>
        </div>
      </div>
      {NOTE("Theme is saved and applied to future invoice PDFs / shares. Use brand-consistent colours and add your registered GSTIN + address in firm settings.")}
    </div>
  );
}

// #48 ── Delivery Challan → Invoice ──────────────────────────────────────────
interface Challan { id: string; number: string; customer: string; purpose: string; vehicle: string; items: DocItem[]; invoiced: boolean; createdAt: string; }
const CHALLAN_PURPOSE = ["Supply on approval", "Job work", "Branch transfer", "Exhibition/demo", "Other"];
function DeliveryChallan() {
  const [docs, setDocs] = useFeatureState<Challan[]>("invoice-challans", []);
  const [customer, setCustomer] = useState("");
  const [purpose, setPurpose] = useState(CHALLAN_PURPOSE[0]);
  const [vehicle, setVehicle] = useState("");
  const [items, setItems] = useState<DocItem[]>([blankItem()]);
  const calc = computeDoc(items);

  const save = () => {
    if (!customer || items.some(i => !i.description || !i.qty)) { toast.error("Add customer and item details"); return; }
    const number = `DC-${new Date().getFullYear()}-${String(docs.length + 1).padStart(3, "0")}`;
    setDocs(p => [{ id: uid(), number, customer, purpose, vehicle, items, invoiced: false, createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setVehicle(""); setItems([blankItem()]);
    toast.success(`Delivery challan ${number} created`);
  };
  const toInvoice = (id: string) => {
    setDocs(p => p.map(d => d.id === id ? { ...d, invoiced: true } : d));
    toast.success("Challan converted — raise the tax invoice with these lines in New Invoice");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Truck size={14} className="text-[var(--color-primary)]" /> Delivery Challan → Invoice</h2>
        <p className="text-xs text-[var(--color-muted)]">For goods movement without immediate sale (Rule 55). Convert to a tax invoice on billing.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Consignee *" />
          <select value={purpose} onChange={e => setPurpose(e.target.value)} className={INP}>{CHALLAN_PURPOSE.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <input value={vehicle} onChange={e => setVehicle(e.target.value)} className={INP} placeholder="Vehicle no." />
        </div>
        <LineItemsEditor items={items} setItems={setItems} />
        <DocTotals subtotal={calc.subtotal} gst={calc.gst} total={calc.total} prefix="Goods value — " />
        <button onClick={save} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-4 rounded-lg text-sm hover:opacity-90">Create challan</button>
      </div>
      {docs.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Challan", "Consignee", "Purpose", "Vehicle", "Value", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {docs.map(d => { const c = computeDoc(d.items); return (
                <tr key={d.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{d.number}</td>
                  <td className="px-4 py-2.5">{d.customer}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{d.purpose}</td>
                  <td className="px-4 py-2.5 text-xs">{d.vehicle || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(c.total)}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${d.invoiced ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{d.invoiced ? "invoiced" : "open"}</span></td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {!d.invoiced && <button onClick={() => toInvoice(d.id)} className="text-xs text-[var(--color-primary)] hover:underline inline-flex items-center gap-1">To invoice <ArrowRight size={11} /></button>}
                    <button onClick={() => setDocs(p => p.filter(x => x.id !== d.id))} className="ml-3 text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// #49 ── Late-Fee / Interest Auto-Apply ──────────────────────────────────────
function LateFeeApplier({ invoices }: { invoices: Invoice[] }) {
  const [annualRate, setAnnualRate] = useFeatureState<number>("invoice-late-interest-rate", 18);
  const [flatFee, setFlatFee] = useFeatureState<number>("invoice-late-flat-fee", 0);
  const [graceDays, setGraceDays] = useFeatureState<number>("invoice-late-grace-days", 0);
  const [applied, setApplied] = useFeatureState<Record<string, number>>("invoice-late-applied", {});

  const now = Date.now();
  const overdue = useMemo(() => invoices
    .filter(i => i.status !== "paid" && i.status !== "cancelled" && i.due_date && new Date(i.due_date).getTime() < now)
    .map(i => {
      const principal = Number(i.total_amount) || 0;
      const rawDays = Math.floor((now - new Date(i.due_date as string).getTime()) / 86400000);
      const days = Math.max(0, rawDays - (graceDays || 0));
      // Simple interest: principal × rate% × days/365
      const interest = Math.round(principal * (annualRate / 100) * (days / 365));
      const fee = days > 0 ? (flatFee || 0) : 0;
      return { inv: i, principal, days, interest, fee, payable: principal + interest + fee };
    })
    .filter(r => r.days > 0), [invoices, annualRate, flatFee, graceDays, now]);

  const totalInterest = overdue.reduce((s, r) => s + r.interest, 0);
  const totalFee = overdue.reduce((s, r) => s + r.fee, 0);

  const apply = (id: string, charge: number) => {
    setApplied(p => ({ ...p, [id]: charge }));
    toast.success("Late charge applied — re-invoice the customer for the higher amount");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Late-Fee / Interest Auto-Apply</h2>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          <div><label className={LBL}>Interest rate (% p.a.)</label><input type="number" value={annualRate} onChange={e => setAnnualRate(parseFloat(e.target.value) || 0)} className={INP} /></div>
          <div><label className={LBL}>Flat late fee (₹)</label><input type="number" value={flatFee} onChange={e => setFlatFee(parseFloat(e.target.value) || 0)} className={INP} /></div>
          <div><label className={LBL}>Grace period (days)</label><input type="number" value={graceDays} onChange={e => setGraceDays(parseFloat(e.target.value) || 0)} className={INP} /></div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Overdue invoices", value: String(overdue.length), color: overdue.length ? "text-orange-400" : "text-[var(--color-muted)]" },
          { label: "Interest accrued", value: formatCurrency(totalInterest), color: "text-red-400" },
          { label: "Late fees", value: formatCurrency(totalFee), color: "text-red-400" },
        ].map(c => <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p></div>)}
      </div>
      {overdue.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "Principal", "Days late", "Interest", "Fee", "Payable", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {overdue.map(r => {
                const charge = r.interest + r.fee;
                const done = applied[r.inv.id] != null;
                return (
                  <tr key={r.inv.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.inv.invoice_number}</td>
                    <td className="px-4 py-2.5">{r.inv.customer_name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.principal)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-orange-400">{r.days}d</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.interest)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{formatCurrency(r.fee)}</td>
                    <td className="px-4 py-2.5 tabular-nums font-bold">{formatCurrency(r.payable)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {done ? <span className="text-[10px] text-green-400 inline-flex items-center gap-1"><Check size={10} /> applied</span>
                        : <button onClick={() => apply(r.inv.id, charge)} className="text-xs text-[var(--color-primary)] hover:underline">Apply +{formatCurrency(charge)}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 flex items-center gap-3"><Check size={14} className="text-green-400 shrink-0" /><p className="text-sm text-green-300">No overdue invoices past the grace period — nothing to charge.</p></div>}
      {NOTE("Simple interest = principal × rate% × days/365 (after grace). Late fees/interest are a separate supply; re-invoice with a debit note where GST applies per your terms.")}
    </div>
  );
}
