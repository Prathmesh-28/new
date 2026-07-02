import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { useFeatureState } from "@/hooks/useFeatureState";
import type { Invoice as StoreInvoice } from "@/data/types";
import { formatCurrency } from "@/lib/utils";
import DiscussButton from "@/features/collab/DiscussButton";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import {
  Plus, FileText, Send, Download, QrCode, X, Check, Clock, AlertCircle, MessageCircle, Bell, Zap,
  FileSignature, FilePlus2, Repeat, Link2, FileMinus2, ShieldAlert, Globe, GitPullRequestArrow,
  Palette, Truck, Percent, Trash2, ArrowRight, Copy,
  Layers, UploadCloud, FileSearch, Calculator, MessageSquareWarning, ScrollText, Milestone, PiggyBank,
  FileJson, BookUser, Wallet, TrendingUp, Receipt,
  Table2, CalendarClock, CopyCheck, BadgePercent,
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

function NewInvoiceModal({ onClose, onCreated, initial }: { onClose: () => void; onCreated: () => void; initial?: { customer?: string; amount?: string; desc?: string } }) {
  const tr = useT();
  const [customerName, setCustomerName] = useState(initial?.customer ?? "");
  const [customerGstin, setCustomerGstin] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState([{ description: initial?.desc ?? "", hsn_sac: "", quantity: "1", unit_price: initial?.amount ?? "", gst_rate: "18" }]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems(v => [...v, { description: "", hsn_sac: "", quantity: "1", unit_price: "", gst_rate: gstRate }]);
  const removeItem = (i: number) => setItems(v => v.filter((_, j) => j !== i));
  const updateItem = (i: number, key: string, val: string) => setItems(v => v.map((row, j) => j === i ? { ...row, [key]: val } : row));

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const gst      = items.reduce((s, it) => {
    const lineAmt = (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
    const lineRate = parseFloat(it.gst_rate) || parseFloat(gstRate) || 0;
    return s + lineAmt * (lineRate / 100);
  }, 0);

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
          <h2 className="text-base font-bold">{tr("quickcreate.invoice")}</h2>
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
              {saving ? tr("inv.creating") : tr("inv.createInvoice")}
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
    api.post<{ upi_link: string; qr: string }>(`/api/invoices/${invoice.id}/upi-link`, {})
      .then(r => { setUrl(r.upi_link); setQr(r.qr); })
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
        <p className="text-sm text-green-300">All invoices are current - no overdue collections.</p>
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
            <DiscussButton entityType="invoice" entityId={inv.id} entityLabel={inv.invoice_number} />
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

// ── Billing-tool tabs, grouped for progressive disclosure ──────────────────
// All 28 tools are preserved; they're just organised into a few clear
// categories so the tab bar reads as a calm group selector instead of a wall.
type ToolTabId =
  | "quote" | "proforma" | "recurring" | "paylink" | "creditnote" | "creditlimit"
  | "multicurrency" | "approval" | "template" | "challan" | "latefee"
  | "ageing" | "bulk" | "pomatch" | "tds" | "dispute" | "terms" | "milestone" | "advance"
  | "einvoicejson" | "statement" | "partial" | "profit" | "tcs"
  | "gstr1" | "duedate" | "duplicate" | "discount";

type ToolGroupKey = "documents" | "compliance" | "collections" | "advanced";

const TOOL_TABS: readonly (readonly [ToolTabId, string, typeof Plus])[] = [
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
  ["ageing", "Ageing Buckets", Layers],
  ["bulk", "Bulk (CSV)", UploadCloud],
  ["pomatch", "PO Matcher", FileSearch],
  ["tds", "TDS & Round-off", Calculator],
  ["dispute", "Dispute Tracker", MessageSquareWarning],
  ["terms", "Payment Terms", ScrollText],
  ["milestone", "Milestone Billing", Milestone],
  ["advance", "Advance/Retainer", PiggyBank],
  ["einvoicejson", "e-Invoice JSON", FileJson],
  ["statement", "Statement of A/c", BookUser],
  ["partial", "Partial Payments", Wallet],
  ["profit", "Invoice Margin", TrendingUp],
  ["tcs", "TCS u/s 206C", Receipt],
  ["gstr1", "GSTR-1 Summary", Table2],
  ["duedate", "Smart Due-Date", CalendarClock],
  ["duplicate", "Duplicate Check", CopyCheck],
  ["discount", "Discount + GST", BadgePercent],
] as const;

const TOOL_GROUPS: readonly { key: ToolGroupKey; label: string; icon: typeof Plus; tabs: readonly ToolTabId[] }[] = [
  // Documents you raise & get paid on
  { key: "documents", label: "Documents", icon: FileSignature,
    tabs: ["quote", "proforma", "recurring", "paylink", "creditnote", "challan", "advance", "milestone"] },
  // GST / statutory tax tooling
  { key: "compliance", label: "GST & Tax", icon: FileJson,
    tabs: ["einvoicejson", "gstr1", "tcs", "tds", "discount"] },
  // Receivables, risk & follow-up
  { key: "collections", label: "Collections & Risk", icon: ShieldAlert,
    tabs: ["creditlimit", "latefee", "ageing", "dispute", "statement", "partial", "duedate", "terms"] },
  // Power tools / everything else
  { key: "advanced", label: "Advanced", icon: Layers,
    tabs: ["multicurrency", "approval", "template", "bulk", "pomatch", "profit", "duplicate"] },
] as const;

// Reverse lookup: which group does a given tool tab belong to?
const TOOL_TAB_GROUP: Record<ToolTabId, ToolGroupKey> = TOOL_GROUPS.reduce(
  (acc, g) => { g.tabs.forEach(t => { acc[t] = g.key; }); return acc; },
  {} as Record<ToolTabId, ToolGroupKey>,
);

export default function InvoicesPage() {
  const tr = useT();   // `t` is used as a tab-id map param below
  const { setStore } = useApp();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [composeInitial, setComposeInitial] = useState<{ customer?: string; amount?: string; desc?: string } | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [qrInvoice, setQrInvoice] = useState<Invoice | null>(null);

  // Open a pre-filled new-invoice form when the assistant deep-links here
  // (/invoices?compose=1&customer=&amount=&desc=), then strip the params.
  useEffect(() => {
    if (searchParams.get("compose") === "1") {
      setComposeInitial({
        customer: searchParams.get("customer") ?? undefined,
        amount: searchParams.get("amount") ?? undefined,
        desc: searchParams.get("desc") ?? undefined,
      });
      setShowNew(true);
      ["compose", "customer", "amount", "desc"].forEach(k => searchParams.delete(k));
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab]           = useState<
    "all" | "pending" | "paid" | "collection"
    | "quote" | "proforma" | "recurring" | "paylink" | "creditnote" | "creditlimit"
    | "multicurrency" | "approval" | "template" | "challan" | "latefee"
    | "ageing" | "bulk" | "pomatch" | "tds" | "dispute" | "terms" | "milestone" | "advance"
    | "einvoicejson" | "statement" | "partial" | "profit" | "tcs"
    | "gstr1" | "duedate" | "duplicate" | "discount"
  >("all");

  // Which billing-tool GROUP is currently revealed. Defaults to the first
  // group; we keep it in sync below so the active tool's group stays open.
  const [toolGroup, setToolGroup] = useState<ToolGroupKey>("documents");

  // If the active tab is a billing tool, make sure its group is the one shown
  // (handles deep-links / programmatic tab changes without clicking a group).
  const activeToolGroup = (TOOL_TAB_GROUP as Record<string, ToolGroupKey>)[tab];
  useEffect(() => {
    if (activeToolGroup) setToolGroup(activeToolGroup);
  }, [activeToolGroup]);

  const visibleTools = useMemo(
    () => TOOL_TABS.filter(([id]) => TOOL_TAB_GROUP[id] === toolGroup),
    [toolGroup],
  );

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
    setLoading(true); setLoadError(false);
    try {
      const data = await api.get<Invoice[]>("/api/invoices");
      setInvoices(data);
      syncToStore(data);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [syncToStore]);

  useEffect(() => { load(); }, [load]);

  const markStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/api/invoices/${id}`, { status });
      toast.success(`Marked as ${status}`);
      load();
    } catch {
      toast.error("Failed to update");
    }
  };

  const sendInvoice = async (id: string) => {
    try {
      await api.post(`/api/invoices/${id}/send`, {});
      toast.success("Invoice emailed to customer");
      load();
    } catch {
      toast.error("Failed to send");
    }
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
          <h1 className="text-xl font-bold">{tr("Invoices")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{tr("inv.subtitle")}</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90">
          <Plus size={13} /> {tr("quickcreate.invoice")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: tr("inv.stat.pending"),  value: totalPending, color: "text-yellow-400" },
          { label: tr("inv.stat.overdue"),  value: totalOverdue, color: "text-red-400" },
          { label: tr("inv.stat.paidAll"), value: totalPaid, color: "text-green-400" },
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
            {t === "collection" ? tr("inv.tab.autoCollect") : tr("inv.tab." + t)}
            {t === "collection" && overdueCount > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${tab === t ? "bg-white/20 text-white" : "bg-red-900/40 text-red-400"}`}>{overdueCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Billing tools - grouped to keep the bar calm. Pick a category, then
          its tools appear below. The active tool's group stays selected. */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
          {TOOL_GROUPS.map(({ key, label, icon: GroupIcon, tabs }) => {
            const active = toolGroup === key;
            return (
              <button key={key} onClick={() => setToolGroup(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${active ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                <GroupIcon size={11} />{label}
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>{tabs.length}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
          {visibleTools.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
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
       tab === "ageing"        ? <AgeingBuckets invoices={invoices} /> :
       tab === "bulk"          ? <BulkInvoiceGenerator onCreated={load} /> :
       tab === "pomatch"       ? <PoMatcher invoices={invoices} /> :
       tab === "tds"           ? <TdsRoundOffHelper /> :
       tab === "dispute"       ? <DisputeTracker invoices={invoices} /> :
       tab === "terms"         ? <PaymentTermsLibrary /> :
       tab === "milestone"     ? <MilestoneBilling /> :
       tab === "advance"       ? <AdvanceAdjustment invoices={invoices} /> :
       tab === "einvoicejson"  ? <EInvoiceJsonGenerator invoices={invoices} /> :
       tab === "statement"     ? <StatementOfAccount invoices={invoices} /> :
       tab === "partial"       ? <PartialPaymentTracker invoices={invoices} /> :
       tab === "profit"        ? <InvoiceMarginAnalyzer invoices={invoices} /> :
       tab === "tcs"           ? <TcsCalculator /> :
       tab === "gstr1"         ? <Gstr1Summary invoices={invoices} /> :
       tab === "duedate"       ? <DueDateSuggester invoices={invoices} /> :
       tab === "duplicate"     ? <DuplicateDetector invoices={invoices} /> :
       tab === "discount"      ? <DiscountTaxCalculator /> :
       tab === "collection" ? (
        <CollectionAutoPanel invoices={invoices} onRefresh={load} />
      ) : loading ? (
        <LoadingState rows={5} label={tr("inv.loading")} />
      ) : loadError ? (
        <ErrorState title={tr("inv.errorTitle")} message={tr("inv.errorMsg")} onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-lg p-12 text-center">
          <FileText size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">{tr("inv.empty")}</p>
          <button onClick={() => setShowNew(true)} className="mt-4 text-sm bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg">{tr("inv.createInvoice")}</button>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px] rcard">
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
                  <td data-label="Invoice" className="px-4 py-3">
                    <p className="font-mono text-xs font-medium">{inv.invoice_number}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">{new Date(inv.created_at).toLocaleDateString("en-IN")}</p>
                  </td>
                  <td data-label="Customer" className="px-4 py-3">
                    <p className="font-medium truncate max-w-[160px]">{inv.customer_name}</p>
                    {inv.customer_gstin && <p className="text-[10px] text-[var(--color-muted)]">{inv.customer_gstin}</p>}
                  </td>
                  <td data-label="Amount" className="px-4 py-3 text-right tabular-nums">
                    <p className="font-semibold">{formatCurrency(parseFloat(String(inv.total_amount)))}</p>
                    <p className="text-[10px] text-[var(--color-muted)]">+GST {inv.gst_rate}%</p>
                  </td>
                  <td data-label="Due" className="px-4 py-3 hidden md:table-cell">
                    {inv.due_date ? (
                      <span className={`text-xs tabular-nums ${AGING_COLOR[inv.aging ?? "current"] ?? ""}`}>
                        {inv.aging === "90d+" ? "90d+ overdue" : inv.aging === "60d" ? "60d overdue" : inv.aging === "30d" ? "30d overdue" : inv.due_date}
                      </span>
                    ) : <span className="text-xs text-[var(--color-muted)]">-</span>}
                  </td>
                  <td data-label="Status" className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[inv.status] ?? ""}`}>
                      {inv.status === "paid" ? <Check size={9} /> : inv.status === "sent" ? <Send size={9} /> : inv.status === "draft" ? <Clock size={9} /> : <AlertCircle size={9} />}
                      {inv.status}
                    </span>
                  </td>
                  <td data-label="" className="px-4 py-3">
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

      {showNew   && <NewInvoiceModal initial={composeInitial} onClose={() => { setShowNew(false); setComposeInitial(undefined); }} onCreated={load} />}
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
    toast.success("Quotation converted to invoice draft - open 'New Invoice' to finalise");
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
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{q.validUntil || "-"}</td>
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
        <p className="text-xs text-[var(--color-muted)]">Issued before supply to request an advance. Not a tax invoice - no ITC for the buyer until the final invoice.</p>
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
                    {!d.converted && <button onClick={() => { setDocs(p => p.map(x => x.id === d.id ? { ...x, converted: true } : x)); toast.success("Marked converted - raise the tax invoice on supply"); }} className="text-xs text-[var(--color-primary)] hover:underline">Mark converted</button>}
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
    toast.success("Invoice generated - next cycle scheduled");
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
  // Generic web pay URL (card/netbanking) - a hosted checkout page can read these params.
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
              <option value="">- manual amount -</option>
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
      {NOTE("Links are built client-side. UPI mark-as-paid is manual here (or via the QR webhook). Settle to your own VPA / PSP - no funds touch Headroom.")}
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
              <option value="">- select / manual -</option>
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
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{n.againstInvoice || "-"}</td>
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
                    <td className="px-4 py-2.5 tabular-nums text-red-400">{ex.overdue > 0 ? formatCurrency(Math.round(ex.overdue)) : "-"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${onHold ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>{onHold ? "ON HOLD" : "OK to bill"}</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setCfgs(p => p.filter(x => x.id !== c.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Exposure is computed from unpaid live invoices. ON HOLD when outstanding exceeds the limit or any invoice is past its due date - block new orders until cleared.")}
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
    toast.success(`Export invoice ${number} (LUT - 0% IGST) recorded`);
  };
  const realise = (id: string, realRate: string) => {
    setDocs(p => p.map(d => d.id === id ? { ...d, rateAtRealisation: realRate, realised: true } : d));
    toast.success("Realisation booked - FX gain/loss computed");
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
          <label className={LBL}>Approval threshold (₹) - invoices above this need a checker</label>
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
    toast.success("Challan converted - raise the tax invoice with these lines in New Invoice");
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
        <DocTotals subtotal={calc.subtotal} gst={calc.gst} total={calc.total} prefix="Goods value - " />
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
                  <td className="px-4 py-2.5 text-xs">{d.vehicle || "-"}</td>
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
    toast.success("Late charge applied - re-invoice the customer for the higher amount");
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
      ) : <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 flex items-center gap-3"><Check size={14} className="text-green-400 shrink-0" /><p className="text-sm text-green-300">No overdue invoices past the grace period - nothing to charge.</p></div>}
      {NOTE("Simple interest = principal × rate% × days/365 (after grace). Late fees/interest are a separate supply; re-invoice with a debit note where GST applies per your terms.")}
    </div>
  );
}

// #50 ── Receivables Ageing Buckets ──────────────────────────────────────────
// Classic AR ageing report computed from live unpaid invoices, days-past-due.
function AgeingBuckets({ invoices }: { invoices: Invoice[] }) {
  const BUCKETS = ["Not due", "1-30", "31-60", "61-90", "90+"] as const;

  const byCustomer = useMemo(() => {
    const now = Date.now();
    const bucketOf = (due?: string) => {
      if (!due) return "Not due" as const;
      const days = Math.floor((now - new Date(due).getTime()) / 86400000);
      if (days <= 0) return "Not due" as const;
      if (days <= 30) return "1-30" as const;
      if (days <= 60) return "31-60" as const;
      if (days <= 90) return "61-90" as const;
      return "90+" as const;
    };
    const map: Record<string, Record<string, number>> = {};
    invoices.filter(i => i.status !== "paid" && i.status !== "cancelled").forEach(i => {
      const amt = Number(i.total_amount) || 0;
      const b = bucketOf(i.due_date);
      map[i.customer_name] = map[i.customer_name] || { "Not due": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      map[i.customer_name][b] += amt;
    });
    return map;
  }, [invoices]);

  const totals = BUCKETS.reduce((acc, b) => {
    acc[b] = Object.values(byCustomer).reduce((s, row) => s + (row[b] || 0), 0);
    return acc;
  }, {} as Record<string, number>);
  const grand = BUCKETS.reduce((s, b) => s + (totals[b] || 0), 0);
  const overdueTotal = (totals["1-30"] || 0) + (totals["31-60"] || 0) + (totals["61-90"] || 0) + (totals["90+"] || 0);

  const colour = (b: string) => b === "Not due" ? "text-green-400" : b === "1-30" ? "text-yellow-400" : b === "31-60" ? "text-orange-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Total outstanding", value: formatCurrency(Math.round(grand)), color: "text-[var(--color-text)]" },
          { label: "Overdue (past due)", value: formatCurrency(Math.round(overdueTotal)), color: "text-red-400" },
          { label: "% overdue", value: grand > 0 ? `${Math.round((overdueTotal / grand) * 100)}%` : "0%", color: "text-orange-400" },
        ].map(c => <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p></div>)}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Layers size={14} className="text-[var(--color-primary)]" /> Receivables Ageing Buckets</h2>
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map(b => (
            <div key={b} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 min-w-[110px]">
              <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{b} days</p>
              <p className={`text-sm font-bold tabular-nums ${colour(b)}`}>{formatCurrency(Math.round(totals[b] || 0))}</p>
            </div>
          ))}
        </div>
      </div>
      {Object.keys(byCustomer).length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Customer", ...BUCKETS, "Total"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {Object.entries(byCustomer).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0)).map(([cust, row]) => {
                const rowTotal = BUCKETS.reduce((s, b) => s + (row[b] || 0), 0);
                return (
                  <tr key={cust} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-medium">{cust}</td>
                    {BUCKETS.map(b => <td key={b} className={`px-4 py-2.5 tabular-nums text-xs ${row[b] ? colour(b) : "text-[var(--color-muted)]"}`}>{row[b] ? formatCurrency(Math.round(row[b])) : "-"}</td>)}
                    <td className="px-4 py-2.5 tabular-nums font-bold">{formatCurrency(Math.round(rowTotal))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 flex items-center gap-3"><Check size={14} className="text-green-400 shrink-0" /><p className="text-sm text-green-300">No outstanding receivables - all invoices are paid.</p></div>}
      {NOTE("Buckets are by days past the due date, computed live from unpaid invoices. Use the 61-90 / 90+ columns to prioritise collection calls and provisioning.")}
    </div>
  );
}

// #51 ── Bulk Invoice Generator (CSV) ────────────────────────────────────────
// Paste/upload CSV: customer,gstin,description,qty,rate,gst,due_date - one invoice per row.
interface BulkRow { customer: string; gstin: string; description: string; qty: number; rate: number; gst: number; due: string; valid: boolean; error: string; }
function BulkInvoiceGenerator({ onCreated }: { onCreated: () => void }) {
  const SAMPLE = "customer,gstin,description,qty,rate,gst,due_date\nAcme Pvt Ltd,27AAAAA0000A1Z5,Consulting,10,5000,18,2026-07-31\nBeta Traders,,Annual maintenance,1,120000,18,2026-08-15";
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(0);

  const rows = useMemo<BulkRow[]>(() => {
    const lines = raw.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    const start = /customer/i.test(lines[0]) ? 1 : 0;
    return lines.slice(start).map(line => {
      const c = line.split(",").map(x => x.trim());
      const qty = parseFloat(c[3]) || 0;
      const rate = parseFloat(c[4]) || 0;
      const gst = c[5] !== undefined && c[5] !== "" ? parseFloat(c[5]) : 18;
      let error = "";
      if (!c[0]) error = "missing customer";
      else if (!c[2]) error = "missing description";
      else if (qty <= 0) error = "qty must be > 0";
      else if (rate <= 0) error = "rate must be > 0";
      else if (!GST_RATES.includes(String(gst) as typeof GST_RATES[number])) error = "GST not 0/5/12/18/28";
      return { customer: c[0] || "", gstin: c[1] || "", description: c[2] || "", qty, rate, gst, due: c[6] || "", valid: !error, error };
    });
  }, [raw]);

  const valid = rows.filter(r => r.valid);
  const grandTotal = valid.reduce((s, r) => s + r.qty * r.rate * (1 + r.gst / 100), 0);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result || ""));
    reader.readAsText(f);
  };

  const run = async () => {
    if (valid.length === 0) { toast.error("No valid rows to invoice"); return; }
    setSubmitting(true); setDone(0);
    let ok = 0;
    for (const r of valid) {
      try {
        await api.post("/api/invoices", {
          customer_name: r.customer, customer_gstin: r.gstin || undefined,
          gst_rate: r.gst, due_date: r.due || undefined,
          items: [{ description: r.description, quantity: r.qty, unit_price: r.rate, gst_rate: r.gst }],
        });
        ok++; setDone(d => d + 1);
      } catch { /* continue */ }
    }
    setSubmitting(false);
    toast.success(`${ok}/${valid.length} invoices created`);
    if (ok > 0) { setRaw(""); onCreated(); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><UploadCloud size={14} className="text-[var(--color-primary)]" /> Bulk Invoice Generator (CSV)</h2>
        <p className="text-xs text-[var(--color-muted)]">One invoice per row. Columns: <code className="text-[10px]">customer, gstin, description, qty, rate, gst, due_date</code>. Header row optional.</p>
        <div className="flex items-center gap-3">
          <label className="text-xs bg-[var(--color-accent)] border border-[var(--color-border)] px-3 py-1.5 rounded-lg cursor-pointer hover:opacity-90">
            Upload CSV<input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
          <button onClick={() => setRaw(SAMPLE)} className="text-xs text-[var(--color-primary)] hover:underline">Load sample</button>
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} className={`${INP} h-32 font-mono text-xs`} placeholder={SAMPLE} />
      </div>
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Rows parsed", value: String(rows.length), color: "text-[var(--color-text)]" },
              { label: "Valid", value: String(valid.length), color: "text-green-400" },
              { label: "Total (incl GST)", value: formatCurrency(Math.round(grandTotal)), color: "text-[var(--color-primary)]" },
            ].map(c => <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p></div>)}
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["#", "Customer", "Description", "Qty", "Rate", "GST", "Total", "Status"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r, i) => (
                  <tr key={i} className={`hover:bg-white/2 ${!r.valid ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{i + 1}</td>
                    <td className="px-4 py-2.5">{r.customer || <span className="text-[var(--color-muted)]">-</span>}</td>
                    <td className="px-4 py-2.5 text-xs">{r.description || <span className="text-[var(--color-muted)]">-</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{r.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{formatCurrency(r.rate)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-xs">{r.gst}%</td>
                    <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(Math.round(r.qty * r.rate * (1 + r.gst / 100)))}</td>
                    <td className="px-4 py-2.5">{r.valid ? <span className="text-[10px] text-green-400 inline-flex items-center gap-1"><Check size={10} /> ok</span> : <span className="text-[10px] text-red-400">{r.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={run} disabled={submitting || valid.length === 0} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-4 rounded-lg text-sm hover:opacity-90 disabled:opacity-50">
            {submitting ? `Creating… ${done}/${valid.length}` : `Generate ${valid.length} invoice${valid.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {NOTE("Each valid row posts a real GST invoice via the backend (one line item each). Invalid rows are skipped - fix the flagged errors and re-run.")}
    </div>
  );
}

// #52 ── Invoice ↔ PO Matcher (2-way match) ──────────────────────────────────
interface PoRec { id: string; poNumber: string; customer: string; poAmount: string; invoiceNumber: string; tolerancePct: string; createdAt: string; }
function PoMatcher({ invoices }: { invoices: Invoice[] }) {
  const [pos, setPos] = useFeatureState<PoRec[]>("invoice-po-match", []);
  const [poNumber, setPoNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [poAmount, setPoAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [tolerancePct, setTolerancePct] = useState("2");

  const onPickInv = (num: string) => {
    setInvoiceNumber(num);
    const inv = invoices.find(i => i.invoice_number === num);
    if (inv) setCustomer(inv.customer_name);
  };

  const add = () => {
    if (!poNumber || !poAmount) { toast.error("Add PO number and PO amount"); return; }
    setPos(p => [{ id: uid(), poNumber, customer, poAmount, invoiceNumber, tolerancePct, createdAt: new Date().toISOString() }, ...p]);
    setPoNumber(""); setPoAmount(""); setInvoiceNumber(""); setCustomer("");
    toast.success("PO recorded for matching");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileSearch size={14} className="text-[var(--color-primary)]" /> Invoice ↔ PO Matcher</h2>
        <p className="text-xs text-[var(--color-muted)]">2-way match: invoice value vs buyer PO. Flags over-billing beyond tolerance before you dispatch.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={poNumber} onChange={e => setPoNumber(e.target.value)} className={INP} placeholder="PO number *" />
          <input type="number" value={poAmount} onChange={e => setPoAmount(e.target.value)} className={INP} placeholder="PO amount ₹ *" />
          <select value={invoiceNumber} onChange={e => onPickInv(e.target.value)} className={INP}>
            <option value="">- match invoice -</option>
            {invoices.map(i => <option key={i.id} value={i.invoice_number}>{i.invoice_number}</option>)}
          </select>
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Customer" />
          <input type="number" value={tolerancePct} onChange={e => setTolerancePct(e.target.value)} className={INP} placeholder="Tolerance %" />
        </div>
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Record PO</button>
      </div>
      {pos.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["PO", "Customer", "PO value", "Invoice", "Inv value", "Variance", "Match", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pos.map(p => {
                const po = parseFloat(p.poAmount) || 0;
                const inv = invoices.find(i => i.invoice_number === p.invoiceNumber);
                const invAmt = inv ? Number(inv.total_amount) || 0 : 0;
                const variance = invAmt - po;
                const tol = (parseFloat(p.tolerancePct) || 0) / 100 * po;
                const status = !inv ? "unmatched" : Math.abs(variance) <= tol ? "matched" : variance > 0 ? "over-billed" : "under-billed";
                const cls = status === "matched" ? "bg-green-900/30 text-green-400 border-green-800/40"
                  : status === "unmatched" ? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"
                  : status === "over-billed" ? "bg-red-900/30 text-red-400 border-red-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40";
                return (
                  <tr key={p.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.poNumber}</td>
                    <td className="px-4 py-2.5">{p.customer || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(po)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)]">{p.invoiceNumber || "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{inv ? formatCurrency(invAmt) : "-"}</td>
                    <td className={`px-4 py-2.5 tabular-nums text-xs font-semibold ${!inv ? "text-[var(--color-muted)]" : variance === 0 ? "text-[var(--color-muted)]" : variance > 0 ? "text-red-400" : "text-yellow-400"}`}>{inv ? (variance < 0 ? `(${formatCurrency(Math.abs(Math.round(variance)))})` : formatCurrency(Math.round(variance))) : "-"}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cls}`}>{status}</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setPos(prev => prev.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Variance = invoice total − PO value. Within tolerance ⇒ matched. Over-billed invoices should be reduced via a credit note; under-billed may need a debit note.")}
    </div>
  );
}

// #53 ── TDS-on-Invoice & Round-off Helper ───────────────────────────────────
// Buyer-side TDS (192J/194C/194Q etc.) net-payable + GST round-off ledger entry.
const TDS_SECTIONS = [
  { code: "194C", label: "194C - Contractor/sub-contractor", rate: 1 },
  { code: "194C-2", label: "194C - Contractor (firm/company)", rate: 2 },
  { code: "194J", label: "194J - Professional/technical fees", rate: 10 },
  { code: "194J-T", label: "194J - Technical services", rate: 2 },
  { code: "194H", label: "194H - Commission/brokerage", rate: 5 },
  { code: "194I", label: "194I - Rent (plant/machinery)", rate: 2 },
  { code: "194Q", label: "194Q - Purchase of goods", rate: 0.1 },
] as const;
function TdsRoundOffHelper() {
  const [taxable, setTaxable] = useState("100000");
  const [gst, setGst] = useState("18");
  const [section, setSection] = useState<string>("194J");
  const [tdsOnGst, setTdsOnGst] = useState(false);

  const tx = parseFloat(taxable) || 0;
  const gstAmt = tx * ((parseFloat(gst) || 0) / 100);
  const rawTotal = tx + gstAmt;
  const rounded = Math.round(rawTotal);
  const roundOff = Math.round((rounded - rawTotal) * 100) / 100;

  const sec = TDS_SECTIONS.find(s => s.code === section) ?? TDS_SECTIONS[0];
  // TDS is normally on the taxable value (excl GST) unless GST not separately shown.
  const tdsBase = tdsOnGst ? rounded : tx;
  const tds = Math.round(tdsBase * (sec.rate / 100));
  const netPayable = rounded - tds;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> TDS-on-Invoice & Round-off Helper</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LBL}>Taxable value (₹)</label><input type="number" value={taxable} onChange={e => setTaxable(e.target.value)} className={INP} /></div>
          <div><label className={LBL}>GST rate</label><select value={gst} onChange={e => setGst(e.target.value)} className={INP}>{GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
          <div className="col-span-2"><label className={LBL}>TDS section (buyer deducts)</label><select value={section} onChange={e => setSection(e.target.value)} className={INP}>{TDS_SECTIONS.map(s => <option key={s.code} value={s.code}>{s.label} ({s.rate}%)</option>)}</select></div>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" checked={tdsOnGst} onChange={e => setTdsOnGst(e.target.checked)} className="accent-[var(--color-primary)]" />
          Deduct TDS on GST-inclusive value (only if GST is not shown separately - CBDT Circular 23/2017)
        </label>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-2 text-sm">
        <div className="flex justify-between text-[var(--color-muted)]"><span>Taxable value</span><span className="tabular-nums">{formatCurrency(tx)}</span></div>
        <div className="flex justify-between text-[var(--color-muted)]"><span>GST {gst}%</span><span className="tabular-nums">{formatCurrency(Math.round(gstAmt))}</span></div>
        <div className="flex justify-between text-[var(--color-muted)]"><span>Invoice total (raw)</span><span className="tabular-nums">{rawTotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Round-off (ledger entry)</span><span className={`tabular-nums ${roundOff >= 0 ? "text-green-400" : "text-red-400"}`}>{roundOff >= 0 ? "+" : ""}{roundOff.toFixed(2)}</span></div>
        <div className="flex justify-between font-semibold border-t border-[var(--color-border)] pt-2"><span>Invoice total (rounded)</span><span className="tabular-nums">{formatCurrency(rounded)}</span></div>
        <div className="flex justify-between text-orange-400"><span>Less: TDS {sec.code} @ {sec.rate}% on {formatCurrency(tdsBase)}</span><span className="tabular-nums">({formatCurrency(tds)})</span></div>
        <div className="flex justify-between font-bold text-base text-[var(--color-primary)] border-t border-[var(--color-border)] pt-2"><span>Net payable by buyer</span><span className="tabular-nums">{formatCurrency(netPayable)}</span></div>
      </div>
      {NOTE("You still pay full GST to the government; the buyer deducts TDS from the net remittance and deposits it against your PAN (claim it in 26AS). Round-off books to the 'Round Off' ledger.")}
    </div>
  );
}

// #54 ── Invoice Dispute Tracker ─────────────────────────────────────────────
interface Dispute { id: string; invoiceNumber: string; customer: string; amount: number; reason: string; raisedOn: string; status: "open" | "in-review" | "resolved" | "written-off"; resolution: string; }
const DISPUTE_REASONS = ["Price mismatch", "Quantity/short supply", "Quality/deficiency", "Duplicate billing", "Tax/GST error", "Goods not received", "Other"];
function DisputeTracker({ invoices }: { invoices: Invoice[] }) {
  const [disputes, setDisputes] = useFeatureState<Dispute[]>("invoice-disputes", []);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);

  const onPickInv = (num: string) => {
    setInvoiceNumber(num);
    const inv = invoices.find(i => i.invoice_number === num);
    if (inv) setCustomer(inv.customer_name);
  };

  const raise = () => {
    if (!invoiceNumber) { toast.error("Pick the disputed invoice"); return; }
    const inv = invoices.find(i => i.invoice_number === invoiceNumber);
    setDisputes(p => [{ id: uid(), invoiceNumber, customer: customer || inv?.customer_name || "", amount: inv ? Number(inv.total_amount) || 0 : 0, reason, raisedOn: new Date().toISOString().split("T")[0], status: "open", resolution: "" }, ...p]);
    setInvoiceNumber(""); setCustomer("");
    toast.success("Dispute logged");
  };
  const setStatus = (id: string, status: Dispute["status"]) => {
    setDisputes(p => p.map(d => d.id === id ? { ...d, status } : d));
    toast.success(`Dispute ${status}`);
  };

  const open = disputes.filter(d => d.status === "open" || d.status === "in-review");
  const disputedValue = open.reduce((s, d) => s + d.amount, 0);
  const STAT_CLS: Record<Dispute["status"], string> = {
    open: "bg-red-900/30 text-red-400 border-red-800/40",
    "in-review": "bg-yellow-900/30 text-yellow-400 border-yellow-800/40",
    resolved: "bg-green-900/30 text-green-400 border-green-800/40",
    "written-off": "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Open disputes</p><p className={`text-xl font-bold tabular-nums ${open.length ? "text-red-400" : "text-[var(--color-muted)]"}`}>{open.length}</p></div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Value in dispute</p><p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(disputedValue))}</p></div>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><MessageSquareWarning size={14} className="text-[var(--color-primary)]" /> Invoice Dispute Tracker</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <select value={invoiceNumber} onChange={e => onPickInv(e.target.value)} className={INP}>
            <option value="">- disputed invoice * -</option>
            {invoices.map(i => <option key={i.id} value={i.invoice_number}>{i.invoice_number} · {i.customer_name}</option>)}
          </select>
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Customer" />
          <select value={reason} onChange={e => setReason(e.target.value)} className={INP}>{DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
        </div>
        <button onClick={raise} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">Log dispute</button>
      </div>
      {disputes.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "Amount", "Reason", "Raised", "Status", "Action"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {disputes.map(d => (
                <tr key={d.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{d.invoiceNumber}</td>
                  <td className="px-4 py-2.5">{d.customer}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(d.amount)}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{d.reason}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{d.raisedOn}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STAT_CLS[d.status]}`}>{d.status}</span></td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {d.status === "open" && <button onClick={() => setStatus(d.id, "in-review")} className="text-xs text-yellow-400 hover:underline">Review</button>}
                    {(d.status === "open" || d.status === "in-review") && <>
                      <button onClick={() => setStatus(d.id, "resolved")} className="ml-2 text-xs text-green-400 hover:underline">Resolve</button>
                      <button onClick={() => setStatus(d.id, "written-off")} className="ml-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">Write off</button>
                    </>}
                    <button onClick={() => setDisputes(p => p.filter(x => x.id !== d.id))} className="ml-2 text-[var(--color-muted)] hover:text-red-400 align-middle inline-flex"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Track buyer disputes to an audit trail. A resolved dispute may need a credit note (over-billing) or fresh delivery proof; write-offs hit bad-debt expense.")}
    </div>
  );
}

// #55 ── Payment Terms Library ───────────────────────────────────────────────
interface PaymentTerm { id: string; name: string; netDays: number; earlyPayDays: number; earlyPayDiscount: number; lateRate: number; isDefault: boolean; }
const SEED_TERMS: PaymentTerm[] = [
  { id: "net15", name: "Net 15", netDays: 15, earlyPayDays: 0, earlyPayDiscount: 0, lateRate: 18, isDefault: true },
  { id: "net30", name: "Net 30", netDays: 30, earlyPayDays: 0, earlyPayDiscount: 0, lateRate: 18, isDefault: false },
  { id: "2-10-net30", name: "2/10 Net 30", netDays: 30, earlyPayDays: 10, earlyPayDiscount: 2, lateRate: 18, isDefault: false },
  { id: "due-receipt", name: "Due on receipt", netDays: 0, earlyPayDays: 0, earlyPayDiscount: 0, lateRate: 24, isDefault: false },
];
function PaymentTermsLibrary() {
  const [terms, setTerms] = useFeatureState<PaymentTerm[]>("invoice-payment-terms", SEED_TERMS);
  const [name, setName] = useState("");
  const [netDays, setNetDays] = useState("30");
  const [earlyDays, setEarlyDays] = useState("0");
  const [earlyDisc, setEarlyDisc] = useState("0");
  const [lateRate, setLateRate] = useState("18");

  const today = new Date();
  const add = () => {
    if (!name) { toast.error("Name the term"); return; }
    setTerms(p => [...p, { id: uid(), name, netDays: parseInt(netDays) || 0, earlyPayDays: parseInt(earlyDays) || 0, earlyPayDiscount: parseFloat(earlyDisc) || 0, lateRate: parseFloat(lateRate) || 0, isDefault: p.length === 0 }]);
    setName("");
    toast.success("Payment term added");
  };
  const makeDefault = (id: string) => { setTerms(p => p.map(t => ({ ...t, isDefault: t.id === id }))); toast.success("Default term set"); };
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-IN"); };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><ScrollText size={14} className="text-[var(--color-primary)]" /> Payment Terms Library</h2>
        <p className="text-xs text-[var(--color-muted)]">Reusable terms applied to new invoices - sets due date, early-pay discount and late-interest rate.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input value={name} onChange={e => setName(e.target.value)} className={INP} placeholder="Term name *" />
          <input type="number" value={netDays} onChange={e => setNetDays(e.target.value)} className={INP} placeholder="Net days" />
          <input type="number" value={earlyDays} onChange={e => setEarlyDays(e.target.value)} className={INP} placeholder="Early-pay within (days)" />
          <input type="number" value={earlyDisc} onChange={e => setEarlyDisc(e.target.value)} className={INP} placeholder="Early-pay disc %" />
          <input type="number" value={lateRate} onChange={e => setLateRate(e.target.value)} className={INP} placeholder="Late rate % p.a." />
        </div>
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Add term</button>
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="border-b border-[var(--color-border)]">{["Term", "Net days", "Due if today", "Early pay", "Late rate", "Default", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {terms.map(t => (
              <tr key={t.id} className="hover:bg-white/2">
                <td className="px-4 py-2.5 font-medium">{t.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{t.netDays}d</td>
                <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{addDays(t.netDays)}</td>
                <td className="px-4 py-2.5 text-xs">{t.earlyPayDiscount > 0 ? `${t.earlyPayDiscount}% in ${t.earlyPayDays}d` : "-"}</td>
                <td className="px-4 py-2.5 tabular-nums text-xs">{t.lateRate}% p.a.</td>
                <td className="px-4 py-2.5">{t.isDefault ? <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-[var(--color-primary)]/15 text-[var(--color-primary)] border-[var(--color-primary)]/30">default</span> : <button onClick={() => makeDefault(t.id)} className="text-xs text-[var(--color-primary)] hover:underline">Set default</button>}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => setTerms(p => p.filter(x => x.id !== t.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {NOTE("e.g. '2/10 Net 30' = 2% discount if paid within 10 days, else full amount by 30 days. The default term pre-fills the due date on every new invoice.")}
    </div>
  );
}

// #56 ── Milestone / Stage Billing ───────────────────────────────────────────
interface MilestoneStage { id: string; name: string; pct: string; billed: boolean; }
interface MilestoneProject { id: string; customer: string; contractValue: string; gst: string; milestones: MilestoneStage[]; createdAt: string; }
function MilestoneBilling() {
  const [projects, setProjects] = useFeatureState<MilestoneProject[]>("invoice-milestones", []);
  const [customer, setCustomer] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [gst, setGst] = useState("18");
  const [draft, setDraft] = useState<MilestoneStage[]>([
    { id: uid(), name: "Advance / kick-off", pct: "30", billed: false },
    { id: uid(), name: "Mid-delivery", pct: "40", billed: false },
    { id: uid(), name: "Completion", pct: "30", billed: false },
  ]);

  const draftSum = draft.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);
  const updDraft = (id: string, k: "name" | "pct", v: string) => setDraft(p => p.map(m => m.id === id ? { ...m, [k]: v } : m));

  const create = () => {
    if (!customer || !contractValue) { toast.error("Add customer and contract value"); return; }
    if (Math.round(draftSum) !== 100) { toast.error(`Milestone % must total 100 (now ${draftSum}%)`); return; }
    setProjects(p => [{ id: uid(), customer, contractValue, gst, milestones: draft.map(m => ({ ...m, id: uid() })), createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setContractValue("");
    toast.success("Milestone schedule created");
  };
  const bill = (pid: string, mid: string) => {
    setProjects(p => p.map(pr => pr.id === pid ? { ...pr, milestones: pr.milestones.map(m => m.id === mid ? { ...m, billed: true } : m) } : pr));
    toast.success("Milestone marked billed - raise the tax invoice for this stage");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Milestone size={14} className="text-[var(--color-primary)]" /> Milestone / Stage Billing</h2>
        <p className="text-xs text-[var(--color-muted)]">Split a contract into stage-wise invoices (projects/construction/services). Each milestone bills its % of the contract + GST.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} className={INP} placeholder="Customer *" />
          <input type="number" value={contractValue} onChange={e => setContractValue(e.target.value)} className={INP} placeholder="Contract value ₹ *" />
          <select value={gst} onChange={e => setGst(e.target.value)} className={INP}>{GST_RATES.map(r => <option key={r} value={r}>GST {r}%</option>)}</select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Milestones</label>
            <button type="button" onClick={() => setDraft(p => [...p, { id: uid(), name: "", pct: "0", billed: false }])} className="text-xs text-[var(--color-primary)] hover:underline">+ Add milestone</button>
          </div>
          {draft.map(m => (
            <div key={m.id} className="grid grid-cols-12 gap-2 items-center">
              <input value={m.name} onChange={e => updDraft(m.id, "name", e.target.value)} className={`${INP} col-span-7`} placeholder="Milestone name" />
              <input type="number" value={m.pct} onChange={e => updDraft(m.id, "pct", e.target.value)} className={`${INP} col-span-3`} placeholder="%" />
              <span className="col-span-1 text-xs tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round((parseFloat(contractValue) || 0) * (parseFloat(m.pct) || 0) / 100))}</span>
              {draft.length > 1 && <button type="button" onClick={() => setDraft(p => p.filter(x => x.id !== m.id))} className="col-span-1 text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>}
            </div>
          ))}
          <p className={`text-xs ${Math.round(draftSum) === 100 ? "text-green-400" : "text-yellow-400"}`}>Milestones total: {draftSum}% {Math.round(draftSum) === 100 ? "✓" : "(must be 100%)"}</p>
        </div>
        <button onClick={create} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-4 rounded-lg text-sm hover:opacity-90">Create schedule</button>
      </div>
      {projects.map(pr => {
        const cv = parseFloat(pr.contractValue) || 0;
        const g = parseFloat(pr.gst) || 0;
        const billedPct = pr.milestones.filter(m => m.billed).reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);
        return (
          <div key={pr.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div><p className="font-semibold text-sm">{pr.customer}</p><p className="text-xs text-[var(--color-muted)]">Contract {formatCurrency(cv)} · GST {g}% · {Math.round(billedPct)}% billed</p></div>
              <button onClick={() => setProjects(p => p.filter(x => x.id !== pr.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
            <div className="space-y-1.5">
              {pr.milestones.map(m => {
                const base = cv * (parseFloat(m.pct) || 0) / 100;
                const withGst = base * (1 + g / 100);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                    <span className="flex-1 min-w-0 truncate">{m.name || "-"} <span className="text-[var(--color-muted)] text-xs">({m.pct}%)</span></span>
                    <span className="tabular-nums text-xs text-[var(--color-muted)]">{formatCurrency(Math.round(base))} + GST</span>
                    <span className="tabular-nums font-semibold">{formatCurrency(Math.round(withGst))}</span>
                    {m.billed ? <span className="text-[10px] text-green-400 inline-flex items-center gap-1 shrink-0"><Check size={10} /> billed</span>
                      : <button onClick={() => bill(pr.id, m.id)} className="text-xs text-[var(--color-primary)] hover:underline shrink-0">Bill now</button>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {NOTE("GST is due on each milestone at the earlier of invoice or payment. Raise a separate tax invoice when you click 'Bill now' for that stage.")}
    </div>
  );
}

// #57 ── Advance / Retainer Adjustment Ledger ────────────────────────────────
interface Advance { id: string; customer: string; received: string; adjusted: string; createdAt: string; }
function AdvanceAdjustment({ invoices }: { invoices: Invoice[] }) {
  const [advances, setAdvances] = useFeatureState<Advance[]>("invoice-advances", []);
  const [customer, setCustomer] = useState("");
  const [received, setReceived] = useState("");
  const [adjustId, setAdjustId] = useState("");
  const [adjustAmt, setAdjustAmt] = useState("");

  const customers = useMemo(() => Array.from(new Set(invoices.map(i => i.customer_name))), [invoices]);

  const addAdvance = () => {
    if (!customer || !received) { toast.error("Add customer and advance amount"); return; }
    setAdvances(p => [{ id: uid(), customer, received, adjusted: "0", createdAt: new Date().toISOString() }, ...p]);
    setCustomer(""); setReceived("");
    toast.success("Advance recorded (Receipt Voucher - GST on advance for services)");
  };
  const applyAdjust = () => {
    const a = advances.find(x => x.id === adjustId);
    const amt = parseFloat(adjustAmt) || 0;
    if (!a || amt <= 0) { toast.error("Pick an advance and a positive amount"); return; }
    const remaining = (parseFloat(a.received) || 0) - (parseFloat(a.adjusted) || 0);
    if (amt > remaining) { toast.error(`Only ${formatCurrency(remaining)} unadjusted on this advance`); return; }
    setAdvances(p => p.map(x => x.id === adjustId ? { ...x, adjusted: String((parseFloat(x.adjusted) || 0) + amt) } : x));
    setAdjustAmt("");
    toast.success("Advance adjusted against invoice");
  };

  const totalReceived = advances.reduce((s, a) => s + (parseFloat(a.received) || 0), 0);
  const totalAdjusted = advances.reduce((s, a) => s + (parseFloat(a.adjusted) || 0), 0);
  const unadjusted = totalReceived - totalAdjusted;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Advances received", value: formatCurrency(Math.round(totalReceived)), color: "text-blue-400" },
          { label: "Adjusted to invoices", value: formatCurrency(Math.round(totalAdjusted)), color: "text-green-400" },
          { label: "Unadjusted (liability)", value: formatCurrency(Math.round(unadjusted)), color: unadjusted > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
        ].map(c => <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p><p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p></div>)}
      </div>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={14} className="text-[var(--color-primary)]" /> Advance / Retainer Adjustment</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input value={customer} onChange={e => setCustomer(e.target.value)} list="adv-cust" className={INP} placeholder="Customer *" />
          <datalist id="adv-cust">{customers.map(c => <option key={c} value={c} />)}</datalist>
          <input type="number" value={received} onChange={e => setReceived(e.target.value)} className={INP} placeholder="Advance received ₹ *" />
          <button onClick={addAdvance} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Record advance</button>
        </div>
      </div>
      {advances.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className={LBL}>Adjust an advance</label>
              <select value={adjustId} onChange={e => setAdjustId(e.target.value)} className={INP}>
                <option value="">- select advance -</option>
                {advances.filter(a => (parseFloat(a.received) || 0) - (parseFloat(a.adjusted) || 0) > 0).map(a => {
                  const rem = (parseFloat(a.received) || 0) - (parseFloat(a.adjusted) || 0);
                  return <option key={a.id} value={a.id}>{a.customer} · {formatCurrency(rem)} left</option>;
                })}
              </select>
            </div>
            <div className="w-40"><label className={LBL}>Amount to adjust ₹</label><input type="number" value={adjustAmt} onChange={e => setAdjustAmt(e.target.value)} className={INP} /></div>
            <button onClick={applyAdjust} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">Adjust</button>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["Customer", "Received", "Adjusted", "Unadjusted", "Date", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {advances.map(a => {
                  const rec = parseFloat(a.received) || 0;
                  const adj = parseFloat(a.adjusted) || 0;
                  const rem = rec - adj;
                  return (
                    <tr key={a.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-medium">{a.customer}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(rec)}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(adj)}</td>
                      <td className={`px-4 py-2.5 tabular-nums font-semibold ${rem > 0 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{formatCurrency(rem)}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{a.createdAt.split("T")[0]}</td>
                      <td className="px-4 py-2.5 text-right"><button onClick={() => setAdvances(p => p.filter(x => x.id !== a.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {NOTE("Advances for services attract GST on receipt (issue a Receipt Voucher). On the final invoice, adjust the advance and pay GST only on the balance to avoid double tax.")}
    </div>
  );
}

// #58 ── e-Invoice JSON (IRP schema) Generator ───────────────────────────────
// Builds the NIC IRP e-invoice payload (schema 1.1) for any invoice so the CA
// can upload it to the GST portal / e-invoice API offline tool.
function EInvoiceJsonGenerator({ invoices }: { invoices: Invoice[] }) {
  const [supplierGstin, setSupplierGstin] = useFeatureState<string>("invoice-irp-supplier-gstin", "");
  const [supplierState, setSupplierState] = useFeatureState<string>("invoice-irp-supplier-state", "27");
  const [selId, setSelId] = useState("");

  const elig = invoices.filter(i => i.status !== "cancelled");
  const inv = elig.find(i => i.id === selId);

  // CGST+SGST when buyer state == seller state, else IGST (intra vs inter-state).
  const buyerState = (inv?.customer_gstin || "").slice(0, 2) || supplierState;
  const intra = buyerState === supplierState;

  const json = useMemo(() => {
    if (!inv) return "";
    const sub = parseFloat(String(inv.subtotal)) || 0;
    const tax = parseFloat(String(inv.gst_amount)) || 0;
    const tot = parseFloat(String(inv.total_amount)) || 0;
    const cgst = intra ? Math.round(tax / 2 * 100) / 100 : 0;
    const sgst = intra ? Math.round((tax - cgst) * 100) / 100 : 0;
    const igst = intra ? 0 : Math.round(tax * 100) / 100;
    const payload = {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
      DocDtls: { Typ: "INV", No: inv.invoice_number, Dt: (inv.created_at || "").split("T")[0].split("-").reverse().join("/") },
      SellerDtls: { Gstin: supplierGstin || "URP", LglNm: "Your Business", Loc: "Mumbai", Pin: 400001, Stcd: supplierState },
      BuyerDtls: { Gstin: inv.customer_gstin || "URP", LglNm: inv.customer_name, Pos: buyerState, Loc: "-", Pin: 999999, Stcd: buyerState },
      ItemList: (inv.items && inv.items.length > 0 ? inv.items : [{ description: inv.invoice_number, hsn_sac: "", quantity: 1, unit_price: sub, gst_rate: inv.gst_rate, amount: sub }]).map((it, i) => {
        const amt = Math.round((parseFloat(String(it.amount)) || (parseFloat(String(it.quantity)) || 0) * (parseFloat(String(it.unit_price)) || 0)) * 100) / 100;
        const rate = parseFloat(String(it.gst_rate)) || 0;
        const lt = Math.round(amt * rate / 100 * 100) / 100;
        return {
          SlNo: String(i + 1), IsServc: it.hsn_sac ? "N" : "Y", HsnCd: it.hsn_sac || "9983",
          Qty: parseFloat(String(it.quantity)) || 1, Unit: "NOS", UnitPrice: parseFloat(String(it.unit_price)) || amt,
          TotAmt: amt, AssAmt: amt, GstRt: rate,
          IgstAmt: intra ? 0 : lt, CgstAmt: intra ? Math.round(lt / 2 * 100) / 100 : 0,
          SgstAmt: intra ? Math.round((lt - Math.round(lt / 2 * 100) / 100) * 100) / 100 : 0, TotItemVal: Math.round((amt + lt) * 100) / 100,
        };
      }),
      ValDtls: { AssVal: Math.round(sub * 100) / 100, CgstVal: cgst, SgstVal: sgst, IgstVal: igst, TotInvVal: Math.round(tot * 100) / 100 },
    };
    return JSON.stringify(payload, null, 2);
  }, [inv, intra, buyerState, supplierGstin, supplierState]);

  const copy = () => { navigator.clipboard.writeText(json).then(() => toast.success("e-Invoice JSON copied")).catch(() => toast.error("Copy failed")); };
  const download = () => {
    if (!inv) return;
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${inv.invoice_number}-einvoice.json`; a.click();
    toast.success("JSON downloaded");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileJson size={14} className="text-[var(--color-primary)]" /> e-Invoice JSON (IRP schema 1.1)</h2>
        <p className="text-xs text-[var(--color-muted)]">Generates the NIC e-invoice payload for upload to the GST portal bulk-generation tool or e-invoice API.</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={LBL}>Your GSTIN</label><input value={supplierGstin} onChange={e => setSupplierGstin(e.target.value)} className={INP} placeholder="27AAAAA0000A1Z5" maxLength={15} /></div>
          <div><label className={LBL}>Your state code</label><input value={supplierState} onChange={e => setSupplierState(e.target.value.replace(/\D/g, "").slice(0, 2))} className={INP} placeholder="27" maxLength={2} /></div>
          <div>
            <label className={LBL}>Invoice</label>
            <select value={selId} onChange={e => setSelId(e.target.value)} className={INP}>
              <option value="">- select invoice -</option>
              {elig.map(i => <option key={i.id} value={i.id}>{i.invoice_number} · {i.customer_name}</option>)}
            </select>
          </div>
        </div>
        {inv && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full border font-medium ${intra ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-orange-900/30 text-orange-400 border-orange-800/40"}`}>{intra ? "Intra-state: CGST+SGST" : "Inter-state: IGST"}</span>
              <span className="text-[var(--color-muted)]">Buyer state {buyerState} · Seller state {supplierState}</span>
            </div>
            <pre className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-[10px] leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto whitespace-pre">{json}</pre>
            <div className="flex gap-2">
              <button onClick={copy} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90"><Copy size={13} /> Copy JSON</button>
              <button onClick={download} className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] py-2 px-4 rounded-lg text-sm"><Download size={13} /> Download .json</button>
            </div>
          </>
        )}
      </div>
      {NOTE("Schema mirrors the mandatory IRP fields (Version 1.1). PIN/place are placeholders - fill registered address before upload. e-Invoicing is mandatory for AATO above ₹5 crore.")}
    </div>
  );
}

// #56 ── Customer Statement of Account ───────────────────────────────────────
function StatementOfAccount({ invoices }: { invoices: Invoice[] }) {
  const customers = useMemo(() => Array.from(new Set(invoices.filter(i => i.status !== "cancelled").map(i => i.customer_name))).sort(), [invoices]);
  const [customer, setCustomer] = useState("");

  const rows = useMemo(() => {
    return invoices
      .filter(i => i.customer_name === customer && i.status !== "cancelled")
      .slice()
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  }, [invoices, customer]);

  let running = 0;
  const ledger = rows.map(r => {
    const amt = parseFloat(String(r.total_amount)) || 0;
    const paid = r.status === "paid";
    running += paid ? 0 : amt;
    return { ...r, amt, paid, balance: running };
  });
  const billed = rows.reduce((s, r) => s + (parseFloat(String(r.total_amount)) || 0), 0);
  const received = rows.filter(r => r.status === "paid").reduce((s, r) => s + (parseFloat(String(r.total_amount)) || 0), 0);
  const outstanding = billed - received;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><BookUser size={14} className="text-[var(--color-primary)]" /> Customer Statement of Account</h2>
        <div className="max-w-sm">
          <label className={LBL}>Customer</label>
          <select value={customer} onChange={e => setCustomer(e.target.value)} className={INP}>
            <option value="">- select customer -</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {customer && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Billed</p><p className="text-base font-bold tabular-nums">{formatCurrency(billed)}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Received</p><p className="text-base font-bold tabular-nums text-green-400">{formatCurrency(received)}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Outstanding</p><p className={`text-base font-bold tabular-nums ${outstanding > 0 ? "text-orange-400" : "text-[var(--color-muted)]"}`}>{formatCurrency(outstanding)}</p></div>
          </div>
        )}
      </div>
      {customer && ledger.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Invoice", "Debit", "Credit", "Balance"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ledger.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{(r.created_at || "").split("T")[0]}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.invoice_number}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(r.amt)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-green-400">{r.paid ? formatCurrency(r.amt) : "-"}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{formatCurrency(r.balance)}</td>
                </tr>
              ))}
              <tr className="bg-[var(--color-bg)] font-bold">
                <td className="px-4 py-2.5" colSpan={4}>Closing balance due</td>
                <td className={`px-4 py-2.5 tabular-nums ${outstanding > 0 ? "text-orange-400" : "text-green-400"}`}>{formatCurrency(outstanding)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {customer && ledger.length === 0 && <p className="text-sm text-[var(--color-muted)] px-1">No invoices for this customer.</p>}
      {NOTE("A running ledger of all tax invoices and receipts for one buyer. Unpaid invoices add to the debit balance; payments clear it. Share at period-end for reconciliation.")}
    </div>
  );
}

// #28 ── Partial Payment Tracker ─────────────────────────────────────────────
interface PartPayment { id: string; invoiceId: string; amount: string; mode: string; date: string; }
function PartialPaymentTracker({ invoices }: { invoices: Invoice[] }) {
  const [pays, setPays] = useFeatureState<PartPayment[]>("invoice-partial-payments", []);
  const open = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("UPI");

  const paidFor = (id: string) => pays.filter(p => p.invoiceId === id).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  const add = () => {
    const inv = open.find(i => i.id === invoiceId);
    if (!inv) { toast.error("Select an open invoice"); return; }
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) { toast.error("Enter a valid amount"); return; }
    const outstanding = (parseFloat(String(inv.total_amount)) || 0) - paidFor(invoiceId);
    if (amt > outstanding + 0.5) { toast.error(`Amount exceeds outstanding ${formatCurrency(outstanding)}`); return; }
    setPays(p => [{ id: uid(), invoiceId, amount, mode, date: new Date().toISOString().split("T")[0] }, ...p]);
    setAmount("");
    toast.success("Part payment recorded");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Partial Payment Tracker</h2>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={LBL}>Invoice</label>
            <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className={INP}>
              <option value="">- select open invoice -</option>
              {open.map(i => { const out = (parseFloat(String(i.total_amount)) || 0) - paidFor(i.id); return <option key={i.id} value={i.id}>{i.invoice_number} · {formatCurrency(out)} due</option>; })}
            </select>
          </div>
          <div><label className={LBL}>Amount ₹</label><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={INP} /></div>
          <div>
            <label className={LBL}>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={INP}>{["UPI", "NEFT/RTGS", "Cheque", "Cash", "Card"].map(m => <option key={m} value={m}>{m}</option>)}</select>
          </div>
        </div>
        <button onClick={add} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 px-4 rounded-lg text-sm hover:opacity-90">+ Record part payment</button>
      </div>
      {open.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "Total", "Paid", "Outstanding", "% Paid"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {open.map(i => {
                const total = parseFloat(String(i.total_amount)) || 0;
                const paid = paidFor(i.id);
                const out = total - paid;
                const pct = total > 0 ? Math.round(paid / total * 100) : 0;
                return (
                  <tr key={i.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-4 py-2.5 truncate max-w-[160px]">{i.customer_name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(total)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-green-400">{formatCurrency(paid)}</td>
                    <td className={`px-4 py-2.5 tabular-nums font-semibold ${out > 0.5 ? "text-orange-400" : "text-green-400"}`}>{formatCurrency(out)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden min-w-[40px]"><div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} /></div><span className="text-[10px] tabular-nums text-[var(--color-muted)]">{pct}%</span></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pays.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Date", "Invoice", "Amount", "Mode", ""].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pays.map(p => {
                const inv = invoices.find(i => i.id === p.invoiceId);
                return (
                  <tr key={p.id} className="hover:bg-white/2">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{p.date}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{inv ? inv.invoice_number : "-"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(parseFloat(p.amount) || 0)}</td>
                    <td className="px-4 py-2.5 text-xs">{p.mode}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => setPays(v => v.filter(x => x.id !== p.id))} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {NOTE("Installments are tracked locally against the invoice's GST-inclusive total. Once cumulative receipts equal the total, mark the invoice paid in the main list.")}
    </div>
  );
}

// ── Invoice Margin / Profitability Analyzer ──────────────────────────────────
// Margin works on the pre-GST taxable value (GST is a pass-through, not revenue).
function InvoiceMarginAnalyzer({ invoices }: { invoices: Invoice[] }) {
  const [costs, setCosts] = useFeatureState<Record<string, string>>("invoice-line-costs", {});
  const elig = invoices.filter(i => i.status !== "cancelled");

  const rows = elig.map(i => {
    const revenue = parseFloat(String(i.subtotal)) || 0;
    const cost = parseFloat(costs[i.id] || "") || 0;
    const margin = revenue - cost;
    const marginPct = revenue > 0 && cost > 0 ? Math.round(margin / revenue * 1000) / 10 : null;
    return { i, revenue, cost, margin, marginPct };
  });
  const withCost = rows.filter(r => r.cost > 0);
  const totalRev = withCost.reduce((s, r) => s + r.revenue, 0);
  const totalMargin = withCost.reduce((s, r) => s + r.margin, 0);
  const blendedPct = totalRev > 0 ? Math.round(totalMargin / totalRev * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Invoice Margin Analyzer</h2>
        <p className="text-xs text-[var(--color-muted)]">Enter the cost of goods/services for each invoice to see profit per invoice. Margin is computed on taxable value (GST excluded - it is a pass-through).</p>
        {withCost.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Revenue (costed)</p><p className="text-base font-bold tabular-nums">{formatCurrency(totalRev)}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Gross margin</p><p className={`text-base font-bold tabular-nums ${totalMargin >= 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(totalMargin)}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Blended margin %</p><p className={`text-base font-bold tabular-nums ${blendedPct >= 0 ? "text-green-400" : "text-red-400"}`}>{blendedPct}%</p></div>
          </div>
        )}
      </div>
      {elig.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead><tr className="border-b border-[var(--color-border)]">{["Invoice", "Customer", "Taxable value", "Cost ₹", "Margin", "Margin %"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map(({ i, revenue, margin, marginPct }) => (
                <tr key={i.id} className="hover:bg-white/2">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.invoice_number}</td>
                  <td className="px-4 py-2.5 truncate max-w-[150px]">{i.customer_name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatCurrency(revenue)}</td>
                  <td className="px-4 py-2.5"><input type="number" min="0" step="0.01" value={costs[i.id] || ""} onChange={e => setCosts(c => ({ ...c, [i.id]: e.target.value }))} className={`${INP} w-28 py-1`} placeholder="0" /></td>
                  <td className={`px-4 py-2.5 tabular-nums font-semibold ${marginPct === null ? "text-[var(--color-muted)]" : margin >= 0 ? "text-green-400" : "text-red-400"}`}>{marginPct === null ? "-" : formatCurrency(margin)}</td>
                  <td className={`px-4 py-2.5 tabular-nums ${marginPct === null ? "text-[var(--color-muted)]" : marginPct >= 0 ? "text-green-400" : "text-red-400"}`}>{marginPct === null ? "-" : `${marginPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-[var(--color-muted)] px-1">No invoices yet.</p>}
      {NOTE("Costs are stored locally per invoice. Margin = taxable value − cost. A negative or thin margin flags loss-making or under-priced work to renegotiate.")}
    </div>
  );
}

// #31 ── TCS Calculator (Sec 206C / 206C(1H)) ────────────────────────────────
function TcsCalculator() {
  const SECTIONS = [
    { code: "206C(1H)", label: "Sale of goods > ₹50L (1H)", rate: 0.1, panRate: 1, threshold: 5000000 },
    { code: "206C(1)-scrap", label: "Scrap", rate: 1, panRate: 5, threshold: 0 },
    { code: "206C(1)-timber", label: "Timber / forest produce", rate: 2.5, panRate: 5, threshold: 0 },
    { code: "206C(1F)", label: "Motor vehicle > ₹10L", rate: 1, panRate: 1, threshold: 1000000 },
  ] as const;
  const [sectionIdx, setSectionIdx] = useState(0);
  const [saleValue, setSaleValue] = useState("");
  const [priorReceipts, setPriorReceipts] = useState("0");
  const [hasPan, setHasPan] = useState(true);

  const sec = SECTIONS[sectionIdx];
  const sale = parseFloat(saleValue) || 0;
  const prior = parseFloat(priorReceipts) || 0;
  // 206C(1H): TCS only on the receipt amount exceeding the ₹50L cumulative threshold.
  const taxable = sec.code === "206C(1H)"
    ? Math.max(0, (prior + sale) - sec.threshold) - Math.max(0, prior - sec.threshold)
    : sec.code === "206C(1F)"
      ? (sale > sec.threshold ? sale : 0)
      : sale;
  const rate = hasPan ? sec.rate : sec.panRate;
  const tcs = Math.round(taxable * rate / 100 * 100) / 100;
  const collectTotal = Math.round((sale + tcs) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> TCS Calculator (Sec 206C)</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>TCS section</label>
            <select value={sectionIdx} onChange={e => setSectionIdx(parseInt(e.target.value, 10))} className={INP}>
              {SECTIONS.map((s, i) => <option key={s.code} value={i}>{s.label}</option>)}
            </select>
          </div>
          <div><label className={LBL}>This sale / receipt (₹)</label><input type="number" min="0" step="0.01" value={saleValue} onChange={e => setSaleValue(e.target.value)} className={INP} placeholder="100000" /></div>
          {sec.code === "206C(1H)" && (
            <div><label className={LBL}>Prior receipts this FY from buyer (₹)</label><input type="number" min="0" step="0.01" value={priorReceipts} onChange={e => setPriorReceipts(e.target.value)} className={INP} /></div>
          )}
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)] cursor-pointer py-2">
              <input type="checkbox" checked={hasPan} onChange={e => setHasPan(e.target.checked)} className="accent-[var(--color-primary)]" />
              Buyer has PAN/Aadhaar (else higher rate u/s 206CC)
            </label>
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-[var(--color-muted)]"><span>TCS-taxable portion</span><span className="tabular-nums">{formatCurrency(taxable)}</span></div>
          <div className="flex justify-between text-[var(--color-muted)]"><span>TCS rate applied</span><span className="tabular-nums">{rate}%{!hasPan && " (no-PAN)"}</span></div>
          <div className="flex justify-between font-semibold text-orange-400"><span>TCS to collect</span><span className="tabular-nums">{formatCurrency(tcs)}</span></div>
          <div className="flex justify-between font-bold text-base text-[var(--color-primary)]"><span>Total to invoice (sale + TCS)</span><span className="tabular-nums">{formatCurrency(collectTotal)}</span></div>
        </div>
      </div>
      {NOTE("TCS is collected over and above the sale value and shown as a separate line. 206C(1H) applies only to receipts beyond the ₹50L cumulative threshold per buyer per FY. No-PAN buyers attract the higher 206CC rate. Verify current rates before filing.")}
    </div>
  );
}

// #52/#53 ── GSTR-1 Summary (B2B / B2CL / B2CS split) ─────────────────────────
// Outward-supply summary for filing. B2CL = inter-state B2C invoice > ₹2.5L.
// Here all parties are treated intra-state for the B2CL test only when no GSTIN.
function Gstr1Summary({ invoices }: { invoices: Invoice[] }) {
  const elig = invoices.filter(i => i.status !== "cancelled");

  type Bucket = { label: string; count: number; taxable: number; tax: number };
  const buckets: Record<"b2b" | "b2cl" | "b2cs", Bucket> = {
    b2b:  { label: "B2B (registered buyer)", count: 0, taxable: 0, tax: 0 },
    b2cl: { label: "B2CL (unregistered, invoice > ₹2.5L)", count: 0, taxable: 0, tax: 0 },
    b2cs: { label: "B2CS (unregistered, ≤ ₹2.5L)", count: 0, taxable: 0, tax: 0 },
  };
  for (const i of elig) {
    const taxable = parseFloat(String(i.subtotal)) || 0;
    const tax = parseFloat(String(i.gst_amount)) || 0;
    const total = parseFloat(String(i.total_amount)) || 0;
    const key: "b2b" | "b2cl" | "b2cs" = i.customer_gstin
      ? "b2b"
      : total > 250000 ? "b2cl" : "b2cs";
    buckets[key].count += 1;
    buckets[key].taxable += taxable;
    buckets[key].tax += tax;
  }
  const order = ["b2b", "b2cl", "b2cs"] as const;
  const totTaxable = order.reduce((s, k) => s + buckets[k].taxable, 0);
  const totTax = order.reduce((s, k) => s + buckets[k].tax, 0);

  // Rate-wise breakup for the GSTR-1 HSN/rate summary.
  const byRate = new Map<string, { taxable: number; tax: number }>();
  for (const i of elig) {
    const lines = i.items?.length ? i.items : null;
    if (lines) {
      for (const it of lines) {
        const lineAmt = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
        const lineRate = it.gst_rate ?? i.gst_rate ?? 0;
        const r = String(lineRate);
        const cur = byRate.get(r) ?? { taxable: 0, tax: 0 };
        cur.taxable += lineAmt;
        cur.tax += lineAmt * (Number(lineRate) / 100);
        byRate.set(r, cur);
      }
    } else {
      const r = String(i.gst_rate ?? 0);
      const cur = byRate.get(r) ?? { taxable: 0, tax: 0 };
      cur.taxable += parseFloat(String(i.subtotal)) || 0;
      cur.tax += parseFloat(String(i.gst_amount)) || 0;
      byRate.set(r, cur);
    }
  }
  const rateRows = [...byRate.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

  const exportCsv = () => {
    const header = "Table,Invoices,Taxable Value,Tax";
    const lines = order.map(k => `${buckets[k].label},${buckets[k].count},${buckets[k].taxable.toFixed(2)},${buckets[k].tax.toFixed(2)}`);
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `GSTR1-summary-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("GSTR-1 summary exported");
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Table2 size={14} className="text-[var(--color-primary)]" /> GSTR-1 Outward-Supply Summary</h2>
          <button onClick={exportCsv} disabled={elig.length === 0} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg disabled:opacity-40"><Download size={12} /> Export CSV</button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Invoices are auto-classified into GSTR-1 tables: B2B when the buyer has a GSTIN, else B2CL (large, &gt; ₹2.5L) or B2CS. Cross-check before filing.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Total taxable value</p><p className="text-base font-bold tabular-nums">{formatCurrency(totTaxable)}</p></div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Total GST</p><p className="text-base font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(totTax)}</p></div>
        </div>
      </div>
      {elig.length > 0 ? (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["GSTR-1 table", "Invoices", "Taxable value", "GST"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {order.map(k => (
                  <tr key={k} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">{buckets[k].label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{buckets[k].count}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(buckets[k].taxable)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(buckets[k].tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead><tr className="border-b border-[var(--color-border)]">{["GST rate", "Taxable value", "Tax"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rateRows.map(([r, v]) => (
                  <tr key={r} className="hover:bg-white/2">
                    <td className="px-4 py-2.5">{r}%</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCurrency(v.taxable)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[var(--color-primary)]">{formatCurrency(v.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="text-sm text-[var(--color-muted)] px-1">No invoices to summarise.</p>}
      {NOTE("This mirrors GSTR-1 tables 4 (B2B), 5 (B2CL) and 7 (B2CS) plus a rate-wise breakup. Place-of-supply and HSN tables still need review against your GSTIN before filing on the portal.")}
    </div>
  );
}

// #27 ── Smart Due-Date Suggester ────────────────────────────────────────────
// Suggests terms from this buyer's historic average days-to-pay (paid invoices).
function DueDateSuggester({ invoices }: { invoices: Invoice[] }) {
  const customers = useMemo(() => [...new Set(invoices.map(i => i.customer_name))].sort(), [invoices]);
  const [customer, setCustomer] = useState("");
  const [defaultDays, setDefaultDays] = useFeatureState<string>("inv-duedate-default", "30");

  const paid = invoices.filter(i => i.customer_name === customer && i.status === "paid" && i.paid_at && i.created_at);
  const daysList = paid.map(i => {
    const created = new Date(i.created_at).getTime();
    const settled = new Date(i.paid_at as string).getTime();
    return Math.max(0, Math.round((settled - created) / 86400000));
  });
  const avgDays = daysList.length > 0 ? Math.round(daysList.reduce((s, d) => s + d, 0) / daysList.length) : null;
  const fallback = parseInt(defaultDays, 10) || 30;
  const suggested = avgDays ?? fallback;
  // Pad the riskier (slower) payers slightly to set a realistic, collectable date.
  const suggestedDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + suggested);
    return d.toISOString().split("T")[0];
  })();

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock size={14} className="text-[var(--color-primary)]" /> Smart Due-Date Suggester</h2>
        <p className="text-xs text-[var(--color-muted)]">Recommends payment terms from this buyer's historic days-to-pay on settled invoices. New buyers fall back to your default term.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Customer</label>
            <select value={customer} onChange={e => setCustomer(e.target.value)} className={INP}>
              <option value="">- select customer -</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={LBL}>Default term for new buyers (days)</label><input type="number" min="0" value={defaultDays} onChange={e => setDefaultDays(e.target.value)} className={INP} /></div>
        </div>
        {customer && (
          <div className="border-t border-[var(--color-border)] pt-3 grid grid-cols-3 gap-3">
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Paid invoices</p><p className="text-base font-bold tabular-nums">{paid.length}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Avg days-to-pay</p><p className="text-base font-bold tabular-nums">{avgDays === null ? "-" : `${avgDays}d`}</p></div>
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3"><p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">Suggested due date</p><p className="text-base font-bold tabular-nums text-[var(--color-primary)]">{suggestedDate}</p></div>
          </div>
        )}
        {customer && (
          <div className="text-xs text-[var(--color-muted)]">
            {avgDays === null
              ? `No settled history for this buyer - using your default of ${fallback} days (Net ${fallback}).`
              : `Based on ${paid.length} paid invoice${paid.length === 1 ? "" : "s"}, this buyer pays in ~${avgDays} days. Suggested term: Net ${suggested}.`}
          </div>
        )}
      </div>
      {NOTE("Days-to-pay is measured from invoice creation to the recorded payment date. Use the suggested term as the due date on the next invoice to set realistic, collectable expectations.")}
    </div>
  );
}

// #55 ── Duplicate Invoice Detector ──────────────────────────────────────────
// Flags likely double-billing: same customer + same GST-inclusive total within
// a short window. Revenue-leak / double-charge prevention before sending.
function DuplicateDetector({ invoices }: { invoices: Invoice[] }) {
  const [windowDays, setWindowDays] = useFeatureState<string>("inv-duplicate-window", "14");
  const days = parseInt(windowDays, 10) || 14;

  const elig = invoices.filter(i => i.status !== "cancelled");
  const groups = useMemo(() => {
    const out: { key: string; customer: string; amount: number; rows: Invoice[] }[] = [];
    const byKey = new Map<string, Invoice[]>();
    for (const i of elig) {
      const amt = Math.round((parseFloat(String(i.total_amount)) || 0) * 100) / 100;
      const key = `${i.customer_name.trim().toLowerCase()}|${amt}`;
      byKey.set(key, [...(byKey.get(key) ?? []), i]);
    }
    for (const [key, rows] of byKey) {
      if (rows.length < 2) continue;
      const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let near = false;
      for (let j = 1; j < sorted.length; j++) {
        const gap = (new Date(sorted[j].created_at).getTime() - new Date(sorted[j - 1].created_at).getTime()) / 86400000;
        if (gap <= days) { near = true; break; }
      }
      if (near) {
        const amt = Math.round((parseFloat(String(sorted[0].total_amount)) || 0) * 100) / 100;
        out.push({ key, customer: sorted[0].customer_name, amount: amt, rows: sorted });
      }
    }
    return out;
  }, [elig, days]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><CopyCheck size={14} className="text-[var(--color-primary)]" /> Duplicate Invoice Detector</h2>
        <p className="text-xs text-[var(--color-muted)]">Flags invoices to the same customer for an identical total raised within a short window - a common double-billing slip.</p>
        <div className="w-48"><label className={LBL}>Match window (days)</label><input type="number" min="1" value={windowDays} onChange={e => setWindowDays(e.target.value)} className={INP} /></div>
      </div>
      {groups.length > 0 ? (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.key} className="bg-[var(--color-surface)] border border-yellow-700/40 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-yellow-900/15 border-b border-yellow-800/30 flex items-center gap-2">
                <AlertCircle size={13} className="text-yellow-400 shrink-0" />
                <span className="text-sm font-medium">{g.customer}</span>
                <span className="text-xs text-[var(--color-muted)]">· {g.rows.length} invoices at {formatCurrency(g.amount)}</span>
              </div>
              <table className="w-full text-sm min-w-[480px]">
                <tbody className="divide-y divide-[var(--color-border)]">
                  {g.rows.map(r => (
                    <tr key={r.id} className="hover:bg-white/2">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.invoice_number}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--color-muted)]">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatCurrency(parseFloat(String(r.total_amount)) || 0)}</td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[r.status] ?? ""}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <Check size={14} className="text-green-400 shrink-0" />
          <p className="text-sm text-green-300">No suspected duplicates within a {days}-day window.</p>
        </div>
      )}
      {NOTE("Detection is heuristic - matched by customer name and identical GST-inclusive total. Genuine repeat orders may appear; verify before cancelling. Cancel a true duplicate within the IRN window to avoid GST mismatch.")}
    </div>
  );
}

// #34/#35 ── Item Discount + GST Calculator ──────────────────────────────────
// Discount is applied to the taxable value BEFORE GST (GST law), with round-off.
function DiscountTaxCalculator() {
  const [items, setItems] = useState<DocItem[]>([blankItem()]);
  const [discountMode, setDiscountMode] = useState<"pct" | "amt">("pct");
  const [discountVal, setDiscountVal] = useState("0");


  // Gross taxable (pre-discount) and proportional discount applied per line, then GST per line.
  const grossTaxable = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0);
  const discount = discountMode === "pct"
    ? Math.round(grossTaxable * ((parseFloat(discountVal) || 0) / 100) * 100) / 100
    : Math.min(grossTaxable, parseFloat(discountVal) || 0);
  const factor = grossTaxable > 0 ? (grossTaxable - discount) / grossTaxable : 1;

  let netTaxable = 0, gst = 0;
  for (const it of items) {
    const lineGross = (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0);
    const lineNet = lineGross * factor;
    netTaxable += lineNet;
    gst += lineNet * ((parseFloat(it.gst) || 0) / 100);
  }
  netTaxable = Math.round(netTaxable * 100) / 100;
  gst = Math.round(gst * 100) / 100;
  const preRound = netTaxable + gst;
  const roundedTotal = Math.round(preRound);
  const roundOff = Math.round((roundedTotal - preRound) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><BadgePercent size={14} className="text-[var(--color-primary)]" /> Item Discount + GST Calculator</h2>
        <p className="text-xs text-[var(--color-muted)]">Trade discount is reduced from the taxable value <em>before</em> GST (Sec 15 CGST Act), then GST is charged per-line and the total is rounded to the nearest rupee.</p>
        <LineItemsEditor items={items} setItems={setItems} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Discount type</label>
            <select value={discountMode} onChange={e => setDiscountMode(e.target.value as "pct" | "amt")} className={INP}>
              <option value="pct">Percentage (%)</option>
              <option value="amt">Flat amount (₹)</option>
            </select>
          </div>
          <div><label className={LBL}>Discount {discountMode === "pct" ? "(%)" : "(₹)"}</label><input type="number" min="0" step="0.01" value={discountVal} onChange={e => setDiscountVal(e.target.value)} className={INP} /></div>
        </div>
        <div className="border-t border-[var(--color-border)] pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-[var(--color-muted)]"><span>Gross taxable value</span><span className="tabular-nums">{formatCurrency(Math.round(grossTaxable * 100) / 100)}</span></div>
          <div className="flex justify-between text-orange-400"><span>Less: discount</span><span className="tabular-nums">− {formatCurrency(discount)}</span></div>
          <div className="flex justify-between text-[var(--color-muted)]"><span>Net taxable value</span><span className="tabular-nums">{formatCurrency(netTaxable)}</span></div>
          <div className="flex justify-between text-[var(--color-muted)]"><span>GST</span><span className="tabular-nums">{formatCurrency(gst)}</span></div>
          <div className="flex justify-between text-[var(--color-muted)]"><span>Round-off</span><span className="tabular-nums">{roundOff >= 0 ? "+" : "−"} {formatCurrency(Math.abs(roundOff))}</span></div>
          <div className="flex justify-between font-bold text-base text-[var(--color-primary)]"><span>Invoice total</span><span className="tabular-nums">{formatCurrency(roundedTotal)}</span></div>
        </div>
      </div>
      {NOTE("Discount is spread proportionally across lines so each rate's GST falls on its post-discount value. Only discounts known at or before supply are deductible from taxable value; post-supply discounts need a credit note. Round-off is booked to the round-off ledger.")}
    </div>
  );
}
