import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, formatAmount, generateId } from "@/lib/utils";
import { api } from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import AiInsight from "@/components/ai/AiInsight";
import { Package, TrendingDown, TrendingUp, Search, ArrowUpDown, Calendar, X, Clock, AlertTriangle, CheckCircle2, ShieldAlert, ClipboardList, GitCompareArrows, Receipt, Contact, Percent, Plus, Trash2, ShieldCheck, Banknote, CalendarClock, PieChart, Copy, FileInput, Star, ListChecks, Wallet, Undo2, LineChart, Layers, Network, FileCheck2, Gavel, PiggyBank, FileBadge, BadgePercent, Ban, CreditCard, Repeat, Truck, CopyCheck, Hourglass, Scale, Pencil, Building2, BadgeCheck, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import DatePicker from "@/components/DatePicker";

/* ─────────────────────────────────────────────────────────────────────────
   Vendor master record - REAL persistence via /api/vendors (GET/POST/PATCH/DELETE).
   This is the single source of truth for a vendor's profile (GSTIN, PAN, bank/UPI,
   payment terms, MSME/Udyam, category). The MSME/TDS/KYC/terms tabs read this saved
   profile instead of re-typing. Spend analytics stay derived from transactions and
   are merged onto the master by name.
   ───────────────────────────────────────────────────────────────────────── */
export interface VendorMaster {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  upi: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  payment_terms_days: number | null;
  is_msme: boolean | null;
  msme_category: string | null;   // micro | small | medium — 43B(h) applies to micro/small only
  udyam: string | null;
  category: string | null;
  notes: string | null;
}

type VendorDraft = Partial<Omit<VendorMaster, "id">> & { name: string };

// Shared loader for the vendor master. Each consumer keeps its own copy in state,
// but they all hit the same persisted backend so edits in the Directory show up in
// the KYC/TDS tabs after a save+refetch. Wrapped so it never throws into render.
function useVendorMaster() {
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<VendorMaster[]>("/api/vendors");
      setVendors(Array.isArray(rows) ? rows : []);
    } catch (e) {
      // Offline / not-yet-seeded: keep whatever we had, surface once.
      console.warn("[vendors] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upsert = useCallback(async (draft: VendorDraft, id?: string): Promise<VendorMaster | null> => {
    try {
      const saved = id
        ? await api.patch<VendorMaster>(`/api/vendors/${id}`, draft)
        : await api.post<VendorMaster>("/api/vendors", draft);
      setVendors(prev => {
        const without = prev.filter(v => v.id !== saved.id && v.name !== saved.name);
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      return saved;
    } catch (e) {
      toast.error(`Could not save vendor - ${(e as Error).message || "offline"}`);
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.delete(`/api/vendors/${id}`);
      setVendors(prev => prev.filter(v => v.id !== id));
      return true;
    } catch (e) {
      toast.error(`Could not delete vendor - ${(e as Error).message || "offline"}`);
      return false;
    }
  }, []);

  return { vendors, loading, refresh, upsert, remove };
}

/* ─────────────────────────────────────────────────────────────────────────
   Real Accounts Payable (#6 audit fix): bills are REAL PURCHASE vouchers posted
   to the books (backend/src/modules/vendorBills.js) - GL, GST input, optional
   TDS withholding, and bill-wise settlement all real. AP aging below is derived
   from actual open bills (GET /api/vendor-bills/aging), not the old obligations
   guess. Every consumer calls this hook independently (same pattern as
   useVendorMaster above) rather than threading props through every tab.
   ───────────────────────────────────────────────────────────────────────── */
// Matches billwise.openBills()'s actual shape exactly (backend/src/modules/books/billwise.js) —
// note the field is "number" (the ledger's own auto-incrementing voucher number), NOT the
// vendor's own bill/invoice reference text (that's book_vouchers.reference, not returned here).
export interface ApAgingBill {
  voucherId: string; voucherType: "SALES" | "PURCHASE"; number: number; date: string; dueDate: string;
  gross: number; allocated: number; outstanding: number; daysOverdue: number;
}
export interface ApAgingVendorRow {
  vendorId: string; vendorLedgerId: string; vendorName: string;
  isMsme: boolean; msmeCategory: string | null; paymentTermsDays: number | null; total: number;
  buckets: { current: number; d30: number; d60: number; d60plus: number };
  bills: ApAgingBill[];
}
export interface ApAgingResponse {
  vendors: ApAgingVendorRow[];
  totals: { current: number; d30: number; d60: number; d60plus: number };
  grandTotal: number;
}
const EMPTY_AGING: ApAgingResponse = { vendors: [], totals: { current: 0, d30: 0, d60: 0, d60plus: 0 }, grandTotal: 0 };

function useApAging() {
  const [aging, setAging] = useState<ApAgingResponse>(EMPTY_AGING);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setAging(await api.get<ApAgingResponse>("/api/vendor-bills/aging")); }
    catch (e) { console.warn("[vendor-bills] aging load failed", e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { aging, loading, refresh };
}

// Bank ledgers, for the "pay from" selector on a bill settlement.
function useBankLedgers() {
  const [ledgers, setLedgers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get<{ id: string; name: string; is_bank: boolean; is_active: boolean }[]>("/api/books/ledgers")
      .then(rows => setLedgers((Array.isArray(rows) ? rows : []).filter(r => r.is_bank && r.is_active).map(r => ({ id: r.id, name: r.name }))))
      .catch(() => {});
  }, []);
  return ledgers;
}

const AP_BUCKET_META: Record<keyof ApAgingResponse["totals"], { label: string; color: string; chipCls: string }> = {
  current:  { label: "Current (not yet due)", color: "text-green-400",  chipCls: "bg-green-950/30 text-green-400 border-green-800/30" },
  d30:      { label: "1-30 days overdue",     color: "text-yellow-400", chipCls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
  d60:      { label: "31-60 days overdue",    color: "text-orange-400", chipCls: "bg-orange-950/30 text-orange-400 border-orange-800/30" },
  d60plus:  { label: "60+ days overdue",      color: "text-red-400",    chipCls: "bg-red-950/30 text-red-400 border-red-800/30" },
};

// Lightweight format checks for the profile form (mirrors the KYC vault validators).
const VM_PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const VM_GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;
const VM_IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const PROFILE_CATEGORIES = ["expense", "payroll", "tax", "loan", "transfer", "raw-material", "services", "logistics", "utilities", "other"];

function VendorProfileModal({
  initial, presetName, onClose, onSave, onDelete,
}: {
  initial: VendorMaster | null;
  presetName?: string;
  onClose: () => void;
  onSave: (draft: VendorDraft, id?: string) => Promise<VendorMaster | null>;
  onDelete?: (id: string) => Promise<boolean>;
}) {
  const [form, setForm] = useState<VendorDraft>({
    name: initial?.name ?? presetName ?? "",
    gstin: initial?.gstin ?? "",
    pan: initial?.pan ?? "",
    contact_name: initial?.contact_name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    upi: initial?.upi ?? "",
    bank_account: initial?.bank_account ?? "",
    bank_ifsc: initial?.bank_ifsc ?? "",
    payment_terms_days: initial?.payment_terms_days ?? null,
    is_msme: initial?.is_msme ?? false,
    msme_category: initial?.msme_category ?? "",
    udyam: initial?.udyam ?? "",
    category: initial?.category ?? "expense",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof VendorDraft>(k: K, v: VendorDraft[K]) => setForm(f => ({ ...f, [k]: v }));

  const pan = (form.pan ?? "").toUpperCase();
  const gstin = (form.gstin ?? "").toUpperCase();
  const ifsc = (form.bank_ifsc ?? "").toUpperCase();
  const panOk = !pan || VM_PAN_RE.test(pan);
  const gstinOk = !gstin || VM_GSTIN_RE.test(gstin);
  const ifscOk = !ifsc || VM_IFSC_RE.test(ifsc);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
  const errInp = (ok: boolean) => `${inp} ${ok ? "" : "border-red-800/50 focus:border-red-500"}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    if (!panOk) { toast.error("Invalid PAN format"); return; }
    if (!gstinOk) { toast.error("Invalid GSTIN format"); return; }
    if (!ifscOk) { toast.error("Invalid IFSC format"); return; }
    const terms = form.payment_terms_days;
    const draft: VendorDraft = {
      name: form.name.trim(),
      gstin: gstin || null,
      pan: pan || null,
      contact_name: (form.contact_name ?? "").trim() || null,
      phone: (form.phone ?? "").trim() || null,
      email: (form.email ?? "").trim() || null,
      upi: (form.upi ?? "").trim() || null,
      bank_account: (form.bank_account ?? "").trim() || null,
      bank_ifsc: ifsc || null,
      payment_terms_days: terms === null || terms === undefined || Number.isNaN(terms) ? null : Number(terms),
      is_msme: !!form.is_msme,
      msme_category: form.is_msme ? ((form.msme_category as string) || "small") : null,
      udyam: (form.udyam ?? "").toUpperCase().trim() || null,
      category: form.category || "expense",
      notes: (form.notes ?? "").trim() || null,
    };
    setSaving(true);
    const saved = await onSave(draft, initial?.id);
    setSaving(false);
    if (saved) {
      toast.success(`${saved.name} profile saved`);
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDelete) return;
    if (!window.confirm(`Delete vendor profile for ${initial.name}? Spend history from transactions is unaffected.`)) return;
    setSaving(true);
    const ok = await onDelete(initial.id);
    setSaving(false);
    if (ok) { toast.success(`${initial.name} profile deleted`); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 overflow-y-auto">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Building2 size={16} className="text-[var(--color-primary)]" />
            {initial ? "Edit Vendor Profile" : "New Vendor Profile"}
          </h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">Master record - saved to the server and shared across the MSME, TDS, terms and KYC tabs.</p>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Legal / trade name" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Category</label>
              <select value={form.category ?? "expense"} onChange={e => set("category", e.target.value)} className={inp}>
                {PROFILE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace("-", " "))}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
              <input value={form.gstin ?? ""} onChange={e => set("gstin", e.target.value.toUpperCase())} maxLength={15} placeholder="22ABCDE1234F1Z5" className={errInp(gstinOk)} />
              {!gstinOk && <p className="text-[10px] text-red-400 mt-0.5">15-char GSTIN format</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">PAN</label>
              <input value={form.pan ?? ""} onChange={e => set("pan", e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className={errInp(panOk)} />
              {!panOk && <p className="text-[10px] text-red-400 mt-0.5">5 letters, 4 digits, 1 letter</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Contact name</label>
              <input value={form.contact_name ?? ""} onChange={e => set("contact_name", e.target.value)} placeholder="Accounts contact" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Phone</label>
              <input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} placeholder="+91…" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Email</label>
              <input value={form.email ?? ""} onChange={e => set("email", e.target.value)} placeholder="accounts@vendor.com" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Payment terms (days)</label>
              <input type="number" min="0" value={form.payment_terms_days ?? ""} onChange={e => set("payment_terms_days", e.target.value === "" ? null : parseInt(e.target.value, 10))} placeholder="e.g. 30" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Bank account no.</label>
              <input value={form.bank_account ?? ""} onChange={e => set("bank_account", e.target.value)} placeholder="Account number" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
              <input value={form.bank_ifsc ?? ""} onChange={e => set("bank_ifsc", e.target.value.toUpperCase())} maxLength={11} placeholder="HDFC0001234" className={errInp(ifscOk)} />
              {!ifscOk && <p className="text-[10px] text-red-400 mt-0.5">4 letters, 0, 6 chars</p>}
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">UPI ID</label>
              <input value={form.upi ?? ""} onChange={e => set("upi", e.target.value)} placeholder="vendor@upi" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Udyam (MSME) reg. no.</label>
              <input value={form.udyam ?? ""} onChange={e => set("udyam", e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" className={inp} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!form.is_msme} onChange={e => set("is_msme", e.target.checked)} className="accent-[var(--color-primary)]" />
            Registered MSME vendor (subject to 45-day payment rule / 43B(h))
          </label>
          {form.is_msme && (
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">MSME classification</label>
              <select value={(form.msme_category as string) ?? ""} onChange={e => set("msme_category", e.target.value)} className={inp}>
                <option value="micro">Micro</option>
                <option value="small">Small</option>
                <option value="medium">Medium (43B(h) does NOT apply)</option>
              </select>
              <p className="text-[10px] text-[var(--color-muted)] mt-1">The 45-day rule &amp; interest disallowance apply only to Micro &amp; Small suppliers.</p>
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Notes</label>
            <textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Any internal notes" className={inp} />
          </div>

          <div className="flex gap-2 pt-1 items-center">
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 px-5 rounded-lg text-sm hover:opacity-90 disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}{initial ? "Save Changes" : "Create Vendor"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
            {initial && onDelete && (
              <button type="button" onClick={handleDelete} disabled={saving} className="ml-auto flex items-center gap-1.5 text-xs text-red-400 hover:bg-red-950/30 px-3 py-2 rounded-lg disabled:opacity-60">
                <Trash2 size={13} /> Delete profile
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

interface Vendor {
  name: string;
  category: string;
  totalSpend: number;
  lastPayment: string;
  txnCount: number;
  avgPayment: number;
  thisMonth: number;
  lastMonth: number;
  trend: "up" | "down" | "flat";
}

type SortKey = "totalSpend" | "lastPayment" | "thisMonth" | "txnCount";

const CATEGORY_LABEL: Record<string, string> = {
  expense:  "Operating",
  payroll:  "Payroll",
  tax:      "Tax",
  loan:     "Loan",
  transfer: "Transfer",
};

const CATEGORY_COLOR: Record<string, string> = {
  expense:  "bg-red-900/20 text-red-400 border-red-800/30",
  payroll:  "bg-orange-900/20 text-orange-400 border-orange-800/30",
  tax:      "bg-yellow-900/20 text-yellow-400 border-yellow-800/30",
  loan:     "bg-purple-900/20 text-purple-400 border-purple-800/30",
  transfer: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]",
};

function ScheduleModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const { addObligation } = useApp();
  const [amount, setAmount] = useState(vendor.avgPayment.toFixed(0));
  const [date,   setDate]   = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; });
  const [note,   setNote]   = useState("");

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    // Record a real upcoming cash obligation so the scheduled payment flows into
    // the forecast / cash-runway math (no fake disbursement - actual payout needs
    // a payout rail, which is gated).
    addObligation({
      id: crypto.randomUUID(),
      name: `Pay ${vendor.name}${note ? ` - ${note}` : ""}`,
      amount: amt,
      dueDate: date,
      type: "other",
    });
    toast.success(`₹${amt.toLocaleString("en-IN")} to ${vendor.name} scheduled for ${new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - added to your cash forecast`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Schedule Payment</h2>
          <button onClick={onClose}><X size={16} className="text-[var(--color-muted)]" /></button>
        </div>
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-sm font-semibold">{vendor.name}</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{CATEGORY_LABEL[vendor.category] ?? vendor.category} · Avg payment: {formatAmount(vendor.avgPayment)}</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Amount (₹) *</label>
            <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} required className={inp} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Payment date *</label>
            <DatePicker value={date} onChange={setDate} required min={new Date().toISOString().split("T")[0]} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} className={inp} placeholder="Invoice #, PO number…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
              Schedule Payment
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const tr = useT();
  const { store } = useApp();
  const { transactions } = store;
  const [view, setView] = useState<"directory" | "bills" | "aging" | "msme" | "po" | "three-way" | "vendor-tds" | "kyc-vault" | "early-pay" | "pay-run" | "spend-analysis" | "dup-vendor" | "requisition" | "vendor-score" | "rfq" | "advances" | "debit-notes" | "pay-forecast" | "blanket-po" | "concentration" | "stmt-recon" | "msme-interest" | "savings" | "form16a" | "rebate" | "watchlist" | "pay-mode" | "recurring-bills" | "landed-cost" | "dup-invoice" | "approval-sla" | "wc-simulator">("directory");
  const [search,   setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sortKey,  setSortKey]  = useState<SortKey>("totalSpend");
  const [sortAsc,  setSortAsc]  = useState(false);
  const [schedVendor, setSchedVendor] = useState<Vendor | null>(null);
  // AP Aging → "View bills" jumps here with the vendor preselected. A fresh object each click
  // (not just the vendor id) so clicking the SAME vendor twice in a row still re-triggers the
  // jump even if the Bills tab's own dropdown was changed in between (React bails out on an
  // unchanged primitive dependency, but never on a new object reference).
  const [billsFocus, setBillsFocus] = useState<{ vendorId: string; n: number } | undefined>(undefined);

  // Real persisted vendor master (GSTIN/PAN/bank/terms/MSME) backing the directory.
  const { vendors: master, loading: masterLoading, upsert, remove, refresh } = useVendorMaster();
  // Real AP aging (from actual posted bills) - feeds the Aging tab, the AI context below, and
  // is refreshed whenever the Bills tab records or pays a bill.
  const { aging } = useApAging();
  // Profile editor: null = closed; { name, record } = open (record null for create).
  const [profileEdit, setProfileEdit] = useState<{ record: VendorMaster | null; presetName?: string } | null>(null);

  // Bulk edit - multi-select over directory rows that have a saved master profile
  // (PATCH /vendors/:id needs a persisted record). Keyed by vendor master id.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMsme, setBulkMsme] = useState<"" | "yes" | "no">("");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [bulkTerms, setBulkTerms] = useState<string>("");
  const [bulkApplying, setBulkApplying] = useState(false);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearBulk = () => {
    setSelectedIds(new Set());
    setBulkMsme(""); setBulkCategory(""); setBulkTerms("");
  };
  const masterByName = useMemo(() => {
    const idx: Record<string, VendorMaster> = {};
    for (const v of master) idx[v.name.toLowerCase()] = v;
    return idx;
  }, [master]);

  const now  = new Date();
  const m1s  = startOfMonth(now).toISOString().split("T")[0];
  const m1e  = endOfMonth(now).toISOString().split("T")[0];
  const m2s  = startOfMonth(subMonths(now, 1)).toISOString().split("T")[0];
  const m2e  = endOfMonth(subMonths(now, 1)).toISOString().split("T")[0];

  const vendors: Vendor[] = useMemo(() => {
    const map: Record<string, { txns: typeof transactions }> = {};
    transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      if (!map[t.counterparty]) map[t.counterparty] = { txns: [] };
      map[t.counterparty].txns.push(t);
    });

    const derived = Object.entries(map).map(([name, { txns }]) => {
      const totalSpend  = txns.reduce((s, t) => s + Math.abs(t.amount), 0);
      const sorted      = [...txns].sort((a, b) => b.date.localeCompare(a.date));
      const lastPayment = sorted[0]?.date ?? "";
      const category    = sorted[0]?.category ?? "expense";
      const txnCount    = txns.length;
      const avgPayment  = totalSpend / txnCount;
      const thisMonth   = txns.filter(t => t.date >= m1s && t.date <= m1e).reduce((s, t) => s + Math.abs(t.amount), 0);
      const lastMonth   = txns.filter(t => t.date >= m2s && t.date <= m2e).reduce((s, t) => s + Math.abs(t.amount), 0);
      const trend: Vendor["trend"] = thisMonth > lastMonth * 1.05 ? "up" : thisMonth < lastMonth * 0.95 ? "down" : "flat";
      return { name, category, totalSpend, lastPayment, txnCount, avgPayment, thisMonth, lastMonth, trend };
    });

    // Surface saved master vendors that have no matching transactions yet so the
    // directory shows the full vendor book, not just transaction counterparties.
    const seen = new Set(derived.map(v => v.name.toLowerCase()));
    const masterOnly: Vendor[] = master
      .filter(v => !seen.has(v.name.toLowerCase()))
      .map(v => ({
        name: v.name,
        category: v.category || "expense",
        totalSpend: 0, lastPayment: "", txnCount: 0, avgPayment: 0,
        thisMonth: 0, lastMonth: 0, trend: "flat" as const,
      }));
    return [...derived, ...masterOnly];
  }, [transactions, m1s, m1e, m2s, m2e, master]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(vendors.map(v => v.category)))], [vendors]);

  const filtered = useMemo(() => {
    let v = vendors.filter(vend =>
      (catFilter === "all" || vend.category === catFilter) &&
      (!search || vend.name.toLowerCase().includes(search.toLowerCase()))
    );
    v = [...v].sort((a, b) => {
      const diff = sortKey === "lastPayment"
        ? a.lastPayment.localeCompare(b.lastPayment)
        : a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
    return v;
  }, [vendors, catFilter, search, sortKey, sortAsc]);

  const totalSpend   = vendors.reduce((s, v) => s + v.totalSpend, 0);
  const thisMSpend   = vendors.reduce((s, v) => s + v.thisMonth, 0);
  const recurringN   = vendors.filter(v => v.txnCount >= 2).length;

  // Only rows with a saved master profile are bulk-editable (need an id to PATCH).
  const selectableIds = useMemo(() => {
    const ids: string[] = [];
    for (const v of filtered) {
      const prof = masterByName[v.name.toLowerCase()];
      if (prof) ids.push(prof.id);
    }
    return ids;
  }, [filtered, masterByName]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleSelectAll = () => setSelectedIds(prev => {
    if (selectableIds.every(id => prev.has(id))) {
      const next = new Set(prev);
      selectableIds.forEach(id => next.delete(id));
      return next;
    }
    return new Set([...prev, ...selectableIds]);
  });

  // Apply only the fields the user actually changed to every selected vendor, in
  // parallel, via the existing PATCH /vendors/:id endpoint. Single summary toast.
  const applyBulk = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const patch: Partial<VendorMaster> = {};
    if (bulkMsme) patch.is_msme = bulkMsme === "yes";
    if (bulkCategory) patch.category = bulkCategory;
    if (bulkTerms.trim() !== "") {
      const n = Number(bulkTerms);
      if (Number.isNaN(n) || n < 0) { toast.error("Enter a valid number of payment-term days"); return; }
      patch.payment_terms_days = n;
    }
    if (Object.keys(patch).length === 0) { toast.error("Choose at least one field to update"); return; }

    setBulkApplying(true);
    const results = await Promise.allSettled(ids.map(id => api.patch<VendorMaster>(`/api/vendors/${id}`, patch)));
    setBulkApplying(false);

    const ok = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (failed === 0) toast.success(`Updated ${ok} vendor${ok !== 1 ? "s" : ""}`);
    else if (ok === 0) toast.error(`Could not update ${failed} vendor${failed !== 1 ? "s" : ""}`);
    else toast.warning(`${ok} updated, ${failed} failed`);

    await refresh();
    clearBulk();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <ArrowUpDown size={10} className={`ml-1 ${sortKey === k ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`} />
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{tr("vend.title")}</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{master.length} saved profile{master.length !== 1 ? "s" : ""} · spend derived from {transactions.filter(t=>t.amount<0&&t.counterparty).length} expense transactions</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
          {([
            ["directory", tr("vend.tab.directory"), Package],
            ["bills", tr("vend.tab.bills"), Banknote],
            ["aging", tr("vend.tab.aging"), Clock],
            ["msme", tr("vend.tab.msme"), ShieldAlert],
            ["po", tr("vend.tab.po"), ClipboardList],
            ["three-way", tr("vend.tab.threeWay"), GitCompareArrows],
            ["vendor-tds", "Vendor TDS Ledger", Receipt],
            ["kyc-vault", "Onboarding / KYC", Contact],
            ["early-pay", "Early-Pay Discount", Percent],
            ["pay-run", "Pay-Run Scheduler", CalendarClock],
            ["spend-analysis", "Spend Analysis", PieChart],
            ["dup-vendor", "Duplicate Detector", Copy],
            ["requisition", "Requisition → PO", FileInput],
            ["vendor-score", "Performance Review", Star],
            ["rfq", "RFQ Comparison", ListChecks],
            ["advances", "Advances Tracker", Wallet],
            ["debit-notes", "Debit / Return Notes", Undo2],
            ["pay-forecast", "Payables Forecast", LineChart],
            ["blanket-po", "Blanket PO Drawdown", Layers],
            ["concentration", "Concentration Risk", Network],
            ["stmt-recon", "Statement Recon", FileCheck2],
            ["msme-interest", "MSME Interest 43B(h)", Gavel],
            ["savings", "Savings Tracker", PiggyBank],
            ["form16a", "Form 16A Tracker", FileBadge],
            ["rebate", "Rebate Tracker", BadgePercent],
            ["watchlist", "Watchlist / Blacklist", Ban],
            ["pay-mode", "Payment-Mode Mix", CreditCard],
            ["recurring-bills", "Recurring Bills", Repeat],
            ["landed-cost", "Landed Cost", Truck],
            ["dup-invoice", "Duplicate Invoice", CopyCheck],
            ["approval-sla", "Approval SLA", Hourglass],
            ["wc-simulator", "Working-Capital Sim", Scale],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setView(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-colors ${view === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
      </div>

      <AiInsight
        collapsed
        className="w-full"
        title="AI insight - vendors"
        question="Which vendors should I prioritise paying or renegotiating, and where is my spend concentrated? Flag any single-vendor concentration risk and overdue AP."
        context={{
          totalVendors: vendors.length,
          savedProfiles: master.length,
          totalSpend: Math.round(totalSpend),
          thisMonthSpend: Math.round(thisMSpend),
          recurringVendors: recurringN,
          topVendorsBySpend: [...vendors]
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 20)
            .map(v => ({
              name: v.name,
              category: v.category,
              totalSpend: Math.round(v.totalSpend),
              thisMonth: Math.round(v.thisMonth),
              lastMonth: Math.round(v.lastMonth),
              txnCount: v.txnCount,
              trend: v.trend,
              lastPayment: v.lastPayment,
            })),
          apAgingBuckets: (Object.keys(aging.totals) as (keyof typeof aging.totals)[]).map(bucket => ({
            bucket,
            amount: Math.round(aging.totals[bucket]),
          })),
          apAgingVendorsWithDues: aging.vendors.length,
        }}
      />

      {view === "directory" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: tr("vend.stat.totalVendors"),  value: vendors.length.toString(),         color: "text-[var(--color-primary)]" },
              { label: tr("vend.stat.totalSpend"),    value: formatAmount(totalSpend),           color: "text-red-400" },
              { label: tr("vend.stat.thisMonth"),     value: formatAmount(thisMSpend),           color: "text-orange-400" },
            ].map(s => (
              <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
                <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div className="flex gap-1 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1">
              {categories.slice(0, 5).map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={`px-2.5 py-1 text-xs rounded capitalize font-medium transition-colors ${catFilter === cat ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
                  {CATEGORY_LABEL[cat] ?? cat}
                </button>
              ))}
            </div>
            <button onClick={() => setProfileEdit({ record: null })}
              className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 ml-auto shrink-0">
              <Plus size={13} /> {tr("vend.addVendor")}
            </button>
          </div>

          {/* Bulk edit bar - only the controls you change are applied to the selected vendors */}
          {selectedIds.size > 0 && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/40 rounded-lg p-3 flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 mr-1">
                <ListChecks size={15} className="text-[var(--color-primary)]" />
                <span className="text-sm font-semibold">{selectedIds.size} selected</span>
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1 uppercase tracking-wider">MSME</label>
                <select value={bulkMsme} onChange={e => setBulkMsme(e.target.value as "" | "yes" | "no")}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
                  <option value="">Keep as-is</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1 uppercase tracking-wider">Category</label>
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
                  <option value="">Keep as-is</option>
                  {PROFILE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace("-", " "))}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1 uppercase tracking-wider">Payment terms (days)</label>
                <input type="number" min="0" value={bulkTerms} onChange={e => setBulkTerms(e.target.value)} placeholder="Keep as-is"
                  className="w-32 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={applyBulk} disabled={bulkApplying}
                  className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
                  {bulkApplying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Apply to {selectedIds.size} vendor{selectedIds.size !== 1 ? "s" : ""}
                </button>
                <button onClick={clearBulk} disabled={bulkApplying}
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-2 py-2 rounded-lg disabled:opacity-50">
                  Clear
                </button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            masterLoading ? (
              <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
                <Package size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
                <p className="text-sm text-[var(--color-muted)]">{tr("vend.loading")}</p>
              </div>
            ) : vendors.length === 0 ? (
              <EmptyState
                icon={Building2}
                title={tr("vend.empty.title")}
                description={tr("vend.empty.desc")}
                ctaText={tr("vend.empty.cta")}
                onCta={() => setProfileEdit({ record: null })}
              />
            ) : (
              <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
                <Search size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
                <p className="text-sm text-[var(--color-muted)]">{tr("vend.noMatch")}</p>
              </div>
            )
          ) : (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input type="checkbox" aria-label="Select all vendors with a saved profile"
                        disabled={selectableIds.length === 0}
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                        className="accent-[var(--color-primary)] cursor-pointer disabled:cursor-not-allowed" />
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Vendor</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden md:table-cell">Category</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)]" onClick={() => toggleSort("totalSpend")}>
                      Total Spend <SortIcon k="totalSpend" />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)] hidden lg:table-cell" onClick={() => toggleSort("thisMonth")}>
                      This Month <SortIcon k="thisMonth" />
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden lg:table-cell">Trend</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--color-text)] hidden md:table-cell" onClick={() => toggleSort("lastPayment")}>
                      Last Paid <SortIcon k="lastPayment" />
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filtered.map((v, i) => {
                    const prof = masterByName[v.name.toLowerCase()];
                    return (
                    <tr key={i} className="hover:bg-white/2 transition-colors cursor-pointer" onClick={() => setProfileEdit({ record: prof ?? null, presetName: v.name })}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          aria-label={prof ? `Select ${v.name}` : `${v.name} has no saved profile`}
                          title={prof ? undefined : "Add a profile to bulk-edit this vendor"}
                          disabled={!prof}
                          checked={prof ? selectedIds.has(prof.id) : false}
                          onChange={() => prof && toggleSelect(prof.id)}
                          className="accent-[var(--color-primary)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm flex items-center gap-1.5">
                          {v.name}
                          {prof && <span title="Has a saved profile" className="inline-flex"><BadgeCheck size={12} className="text-[var(--color-primary)]" /></span>}
                          {prof?.is_msme && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-900/30 text-blue-400 border-blue-800/40">MSME</span>}
                        </p>
                        <p className="text-[10px] text-[var(--color-muted)]">
                          {v.txnCount > 0 ? `${v.txnCount} transaction${v.txnCount !== 1 ? "s" : ""} · avg ${formatAmount(v.avgPayment)}` : "No transactions yet"}
                          {prof?.payment_terms_days != null && ` · net ${prof.payment_terms_days}d`}
                          {prof?.gstin && ` · ${prof.gstin}`}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[v.category]}`}>
                          {CATEGORY_LABEL[v.category] ?? v.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-400">{formatAmount(v.totalSpend)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)] hidden lg:table-cell">
                        {v.thisMonth > 0 ? formatAmount(v.thisMonth) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center hidden lg:table-cell">
                        {v.trend === "up" ? <span title="Spend up vs last month"><TrendingUp size={13} className="text-red-400 mx-auto" /></span>
                          : v.trend === "down" ? <span title="Spend down vs last month"><TrendingDown size={13} className="text-green-400 mx-auto" /></span>
                          : <span className="text-[var(--color-muted)] text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--color-muted)] hidden md:table-cell">
                        {v.lastPayment ? new Date(v.lastPayment).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={(e) => { e.stopPropagation(); setProfileEdit({ record: prof ?? null, presetName: v.name }); }}
                            className="flex items-center gap-1 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 px-2.5 py-1.5 rounded-lg transition-colors">
                            {prof ? <><Pencil size={11} /> Edit</> : <><Plus size={11} /> Profile</>}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setSchedVendor(v); }}
                            className="flex items-center gap-1 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 px-2.5 py-1.5 rounded-lg transition-colors">
                            <Calendar size={11} /> Schedule
                          </button>
                        </div>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
              <div className="px-4 py-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">{filtered.length} vendors · {recurringN} recurring</p>
                <p className="text-xs text-[var(--color-muted)]">Total: <span className="font-semibold text-red-400">{formatAmount(filtered.reduce((s,v)=>s+v.totalSpend,0))}</span></p>
              </div>
            </div>
          )}
        </>
      )}

      {view === "aging" && (
        <ApAgingBoard onSelectVendor={(id) => { setBillsFocus({ vendorId: id, n: Date.now() }); setView("bills"); }} />
      )}

      {/* ── MSME 45-DAY RULE ── */}
      {view === "msme" && (() => {
        const today = new Date();
        const msmeObligations = store.obligations
          .filter(o => o.type === "other" || o.type === "loan")
          .map(o => {
            const due = new Date(o.dueDate);
            const daysSinceDue = Math.floor((today.getTime() - due.getTime()) / 86400000);
            return { ...o, daysSinceDue };
          })
          .sort((a, b) => b.daysSinceDue - a.daysSinceDue);

        const breach    = msmeObligations.filter(o => o.daysSinceDue > 45);
        const warning   = msmeObligations.filter(o => o.daysSinceDue > 30 && o.daysSinceDue <= 45);
        const safe      = msmeObligations.filter(o => o.daysSinceDue <= 30 && o.daysSinceDue > 0);
        const upcoming  = msmeObligations.filter(o => o.daysSinceDue <= 0);

        const breachAmt  = breach.reduce((s, o) => s + o.amount, 0);
        const warningAmt = warning.reduce((s, o) => s + o.amount, 0);

        return (
          <div className="space-y-4">
            <div className="bg-red-950/20 border border-red-800/30 rounded-lg px-4 py-3 flex items-start gap-3">
              <ShieldAlert size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">MSME Samadhan - 45-Day Payment Rule</p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">Under MSMED Act 2006, payments to MSME vendors must be made within 45 days of acceptance. Delays attract 3× bank rate compound interest and mandatory disclosure in ITR. Mark vendor obligations as "expense" type to track here.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "In Breach (>45d)",  value: breach.length.toString(),    color: "text-red-400",    sub: formatCurrency(breachAmt) },
                { label: "At Risk (31-45d)",   value: warning.length.toString(),   color: "text-orange-400", sub: formatCurrency(warningAmt) },
                { label: "Safe (1-30d)",       value: safe.length.toString(),      color: "text-yellow-400", sub: formatCurrency(safe.reduce((s,o) => s + o.amount, 0)) },
                { label: "Upcoming",           value: upcoming.length.toString(),  color: "text-green-400",  sub: formatCurrency(upcoming.reduce((s,o) => s + o.amount, 0)) },
              ].map(c => (
                <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-1">{c.sub}</p>
                </div>
              ))}
            </div>

            {msmeObligations.length === 0 ? (
              <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
                <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400 opacity-50" />
                <p className="text-sm text-[var(--color-muted)]">No outstanding obligations. Schedule vendor payments via AP Aging to track MSME compliance.</p>
              </div>
            ) : (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {["Vendor / Obligation","Amount","Due Date","Days Since Due","MSME Status"].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {msmeObligations.map(o => {
                      const isBreached = o.daysSinceDue > 45;
                      const isWarning  = o.daysSinceDue > 30;
                      const isPending  = o.daysSinceDue > 0;
                      return (
                        <tr key={o.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-accent)]">
                          <td className="px-4 py-3 font-medium">{o.name}</td>
                          <td className="px-4 py-3 tabular-nums font-semibold">{formatCurrency(o.amount)}</td>
                          <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{new Date(o.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                          <td className={`px-4 py-3 tabular-nums font-bold ${isBreached ? "text-red-400" : isWarning ? "text-orange-400" : isPending ? "text-yellow-400" : "text-green-400"}`}>
                            {o.daysSinceDue > 0 ? `${o.daysSinceDue}d overdue` : `Due in ${Math.abs(o.daysSinceDue)}d`}
                          </td>
                          <td className="px-4 py-3">
                            {isBreached ? (
                              <span className="text-xs font-bold px-2 py-0.5 rounded border bg-red-950/30 text-red-400 border-red-800/30 flex items-center gap-1 w-fit">
                                <ShieldAlert size={10} /> Breach - ITR disclosure
                              </span>
                            ) : isWarning ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-orange-950/30 text-orange-400 border-orange-800/30 w-fit flex items-center gap-1">
                                <AlertTriangle size={10} /> Pay within {45 - o.daysSinceDue}d
                              </span>
                            ) : isPending ? (
                              <span className="text-xs px-2 py-0.5 rounded border bg-yellow-950/20 text-yellow-400 border-yellow-800/30 w-fit">
                                {45 - o.daysSinceDue}d remaining
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded border bg-green-950/20 text-green-400 border-green-800/30 w-fit">Upcoming</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {view === "bills"         && <BillsPayables focus={billsFocus} />}
      {view === "po"            && <PurchaseOrderManager />}
      {view === "three-way"     && <ThreeWayMatch />}
      {view === "vendor-tds"    && <VendorTdsLedger />}
      {view === "kyc-vault"     && <VendorKycVault />}
      {view === "early-pay"     && <EarlyPaymentOptimizer />}
      {view === "pay-run"       && <PayRunScheduler />}
      {view === "spend-analysis" && <SpendAnalysis />}
      {view === "dup-vendor"    && <DuplicateVendorDetector />}
      {view === "requisition"   && <RequisitionToPo />}
      {view === "vendor-score"  && <VendorPerformanceReview />}
      {view === "rfq"           && <RfqComparison />}
      {view === "advances"      && <AdvancesTracker />}
      {view === "debit-notes"   && <DebitNoteTracker />}
      {view === "pay-forecast"  && <PayablesForecast />}
      {view === "blanket-po"    && <BlanketPoDrawdown />}
      {view === "concentration" && <ConcentrationRisk />}
      {view === "stmt-recon"    && <StatementReconciliation />}
      {view === "msme-interest" && <MsmeInterestLiability />}
      {view === "savings"       && <SavingsTracker />}
      {view === "form16a"       && <Form16ATracker />}
      {view === "rebate"        && <RebateTracker />}
      {view === "watchlist"     && <VendorWatchlist />}
      {view === "pay-mode"      && <PaymentModeMix />}
      {view === "recurring-bills" && <RecurringBillTracker />}
      {view === "landed-cost"   && <LandedCostCalculator />}
      {view === "dup-invoice"   && <DuplicateInvoiceDetector />}
      {view === "approval-sla"  && <ApprovalSlaTracker />}
      {view === "wc-simulator"  && <WorkingCapitalSimulator />}

      {schedVendor && <ScheduleModal vendor={schedVendor} onClose={() => setSchedVendor(null)} />}
      {profileEdit && (
        <VendorProfileModal
          initial={profileEdit.record}
          presetName={profileEdit.presetName}
          onClose={() => setProfileEdit(null)}
          onSave={upsert}
          onDelete={remove}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #60 Purchase Order Manager - raise a PO, track its lifecycle.
   ───────────────────────────────────────────────────────────────────────── */
type PoStatus = "draft" | "sent" | "received" | "closed" | "cancelled";
interface PoLine { id: string; desc: string; qty: number; rate: number; }
interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendor: string;
  date: string;
  expectedDelivery: string;
  status: PoStatus;
  lines: PoLine[];
  notes: string;
}

const PO_STATUS_META: Record<PoStatus, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]" },
  sent:      { label: "Sent",      cls: "bg-blue-950/30 text-blue-400 border-blue-800/30" },
  received:  { label: "Received",  cls: "bg-green-950/30 text-green-400 border-green-800/30" },
  closed:    { label: "Closed",    cls: "bg-purple-950/30 text-purple-400 border-purple-800/30" },
  cancelled: { label: "Cancelled", cls: "bg-red-950/30 text-red-400 border-red-800/30" },
};

const inpCls = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

function poTotal(po: PurchaseOrder): number {
  return po.lines.reduce((s, l) => s + l.qty * l.rate, 0);
}

function PurchaseOrderManager() {
  const { store } = useApp();
  const [pos, setPos] = useFeatureState<PurchaseOrder[]>("vendor-purchase-orders", []);
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expected, setExpected] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split("T")[0]; });
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoLine[]>([{ id: crypto.randomUUID(), desc: "", qty: 1, rate: 0 }]);

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const draftTotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);

  const reset = () => {
    setVendor(""); setNotes("");
    setLines([{ id: crypto.randomUUID(), desc: "", qty: 1, rate: 0 }]);
    setOpen(false);
  };

  const raise = () => {
    if (!vendor.trim()) { toast.error("Pick a vendor"); return; }
    const valid = lines.filter(l => l.desc.trim() && l.qty > 0 && l.rate >= 0);
    if (valid.length === 0) { toast.error("Add at least one line item"); return; }
    const seq = pos.length + 1;
    const po: PurchaseOrder = {
      id: crypto.randomUUID(),
      poNumber: `PO-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`,
      vendor: vendor.trim(), date, expectedDelivery: expected, status: "draft", lines: valid, notes: notes.trim(),
    };
    setPos(prev => [po, ...prev]);
    toast.success(`${po.poNumber} raised for ${po.vendor}`);
    reset();
  };

  const setStatus = (id: string, status: PoStatus) =>
    setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  const remove = (id: string) => setPos(prev => prev.filter(p => p.id !== id));

  const openValue = pos.filter(p => p.status === "sent" || p.status === "received").reduce((s, p) => s + poTotal(p), 0);
  const committed = pos.filter(p => p.status !== "cancelled").reduce((s, p) => s + poTotal(p), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] max-w-xl">Raise purchase orders and track them through draft → sent → received → closed. Tally/Zoho leave this open for SMBs.</p>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 shrink-0">
          <Plus size={13} /> Raise PO
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open POs", value: pos.filter(p => p.status === "sent" || p.status === "received").length.toString(), color: "text-blue-400" },
          { label: "Open Value", value: formatCurrency(openValue), color: "text-orange-400" },
          { label: "Total Committed", value: formatCurrency(committed), color: "text-[var(--color-primary)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {open && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold">New Purchase Order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor *</label>
              <input list="po-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor name" className={inpCls} />
              <datalist id="po-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">PO Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Expected Delivery</label>
              <DatePicker value={expected} onChange={setExpected} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[var(--color-muted)] block">Line Items</label>
            {lines.map((l, i) => (
              <div key={l.id} className="grid grid-cols-[1fr_70px_90px_auto] gap-2 items-center">
                <input value={l.desc} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} placeholder="Description" className={inpCls} />
                <input type="number" min="0" value={l.qty} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} placeholder="Qty" className={inpCls} />
                <input type="number" min="0" value={l.rate} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} placeholder="Rate" className={inpCls} />
                <button onClick={() => setLines(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)} className="text-[var(--color-muted)] hover:text-red-400 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setLines(prev => [...prev, { id: crypto.randomUUID(), desc: "", qty: 1, rate: 0 }])} className="text-xs text-[var(--color-primary)] hover:underline">+ Add line</button>
          </div>

          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes / terms (optional)" className={inpCls} />
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm">PO Total: <span className="font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(draftTotal)}</span></p>
            <div className="flex gap-2">
              <button onClick={raise} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Raise PO</button>
              <button onClick={reset} className="text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent)] px-3 py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {pos.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ClipboardList size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No purchase orders yet. Raise one to start tracking against GRN and invoices.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["PO #", "Vendor", "Date", "Expected", "Amount", "Status", ""].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i >= 4 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {pos.map(po => (
                <tr key={po.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{po.poNumber}</td>
                  <td className="px-4 py-3 font-medium">{po.vendor}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(po.date), "dd MMM")}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(po.expectedDelivery), "dd MMM")}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(poTotal(po))}</td>
                  <td className="px-4 py-3">
                    <select value={po.status} onChange={e => setStatus(po.id, e.target.value as PoStatus)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border outline-none cursor-pointer ${PO_STATUS_META[po.status].cls}`}>
                      {(Object.keys(PO_STATUS_META) as PoStatus[]).map(s => <option key={s} value={s}>{PO_STATUS_META[s].label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(po.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #61 3-Way Match - PO vs GRN vs Invoice, flag quantity & price variances.
   ───────────────────────────────────────────────────────────────────────── */
interface MatchRow {
  id: string;
  ref: string;            // PO / item reference
  vendor: string;
  poQty: number; poRate: number;
  grnQty: number;         // goods actually received
  invQty: number; invRate: number;
  tolerancePct: number;   // acceptable price variance
}

function ThreeWayMatch() {
  const [rows, setRows] = useFeatureState<MatchRow[]>("vendor-three-way-match", []);
  const [ref, setRef] = useState("");
  const [vendor, setVendor] = useState("");
  const [poQty, setPoQty] = useState("");
  const [poRate, setPoRate] = useState("");
  const [grnQty, setGrnQty] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invRate, setInvRate] = useState("");
  const [tol, setTol] = useState("2");

  const add = () => {
    if (!ref.trim() || !vendor.trim()) { toast.error("Enter reference and vendor"); return; }
    const row: MatchRow = {
      id: crypto.randomUUID(), ref: ref.trim(), vendor: vendor.trim(),
      poQty: parseFloat(poQty) || 0, poRate: parseFloat(poRate) || 0,
      grnQty: parseFloat(grnQty) || 0,
      invQty: parseFloat(invQty) || 0, invRate: parseFloat(invRate) || 0,
      tolerancePct: parseFloat(tol) || 0,
    };
    setRows(prev => [row, ...prev]);
    setRef(""); setPoQty(""); setPoRate(""); setGrnQty(""); setInvQty(""); setInvRate("");
    toast.success(`Match line added for ${row.vendor}`);
  };
  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const evaluate = (r: MatchRow) => {
    const flags: string[] = [];
    if (r.grnQty !== r.poQty) flags.push(`GRN qty ${r.grnQty} ≠ PO qty ${r.poQty}`);
    if (r.invQty !== r.grnQty) flags.push(`Invoice qty ${r.invQty} ≠ GRN qty ${r.grnQty}`);
    const priceVarPct = r.poRate > 0 ? Math.abs(r.invRate - r.poRate) / r.poRate * 100 : (r.invRate > 0 ? 100 : 0);
    if (priceVarPct > r.tolerancePct) flags.push(`Price variance ${priceVarPct.toFixed(1)}% > ${r.tolerancePct}% tolerance`);
    const overBilled = (r.invQty * r.invRate) - (r.grnQty * r.poRate);
    return { flags, priceVarPct, overBilled, ok: flags.length === 0 };
  };

  const flagged = rows.filter(r => !evaluate(r).ok).length;
  const exposure = rows.reduce((s, r) => { const e = evaluate(r); return s + (e.overBilled > 0 ? e.overBilled : 0); }, 0);

  const numInp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Reconcile the three documents before you pay: the Purchase Order, the Goods Receipt Note (what arrived), and the supplier Invoice. Any quantity mismatch or price variance beyond tolerance is flagged so you don't overpay.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Match Lines", value: rows.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Flagged", value: flagged.toString(), color: flagged > 0 ? "text-red-400" : "text-green-400" },
          { label: "Over-Billed Exposure", value: formatCurrency(Math.round(exposure)), color: exposure > 0 ? "text-orange-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Add Match Line</h3>
        <div className="grid grid-cols-2 gap-2">
          <input value={ref} onChange={e => setRef(e.target.value)} placeholder="PO / item ref *" className={numInp} />
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={numInp} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input type="number" value={poQty} onChange={e => setPoQty(e.target.value)} placeholder="PO qty" className={numInp} />
          <input type="number" value={poRate} onChange={e => setPoRate(e.target.value)} placeholder="PO rate" className={numInp} />
          <input type="number" value={grnQty} onChange={e => setGrnQty(e.target.value)} placeholder="GRN qty rcvd" className={numInp} />
          <input type="number" value={invQty} onChange={e => setInvQty(e.target.value)} placeholder="Invoice qty" className={numInp} />
          <input type="number" value={invRate} onChange={e => setInvRate(e.target.value)} placeholder="Invoice rate" className={numInp} />
          <input type="number" value={tol} onChange={e => setTol(e.target.value)} placeholder="Tolerance %" className={numInp} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Add & Match</button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <GitCompareArrows size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No match lines yet. Add a PO / GRN / Invoice line to check for variances.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const e = evaluate(r);
            return (
              <div key={r.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${e.ok ? "border-[var(--color-border)]" : "border-red-800/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {e.ok ? <CheckCircle2 size={14} className="text-green-400" /> : <AlertTriangle size={14} className="text-red-400" />}
                      {r.ref} <span className="text-[var(--color-muted)] font-normal">· {r.vendor}</span>
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-1 tabular-nums">PO {r.poQty}×{formatCurrency(r.poRate)} · GRN {r.grnQty} · Inv {r.invQty}×{formatCurrency(r.invRate)} · tol {r.tolerancePct}%</p>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>
                {e.ok ? (
                  <p className="text-xs text-green-400 mt-2">Matched - safe to approve for payment.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {e.flags.map((f, i) => <li key={i} className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={11} /> {f}</li>)}
                    {e.overBilled > 0 && <li className="text-xs text-orange-400 font-medium">Potential over-billing: {formatCurrency(Math.round(e.overBilled))}</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #62 Vendor TDS Ledger - per-vendor TDS deducted/deposited (194C/194J/194Q).
   ───────────────────────────────────────────────────────────────────────── */
const TDS_SECTIONS = [
  { code: "194C", label: "194C - Contractors (company/firm)", rate: 2 },
  { code: "194C-ind", label: "194C - Contractors (individual/HUF)", rate: 1 },
  { code: "194J", label: "194J - Professional / technical fees", rate: 10 },
  { code: "194J-tech", label: "194J - Technical services", rate: 2 },
  { code: "194Q", label: "194Q - Purchase of goods >₹50L", rate: 0.1 },
  { code: "194I-rent", label: "194I - Rent of plant/machinery", rate: 2 },
  { code: "194I-land", label: "194I - Rent of land/building", rate: 10 },
  { code: "194H", label: "194H - Commission / brokerage", rate: 5 },
] as const;

interface TdsEntry {
  id: string;
  vendor: string;
  section: string;
  grossAmount: number;
  rate: number;
  date: string;
  deposited: boolean;
}

function VendorTdsLedger() {
  const [entries, setEntries] = useFeatureState<TdsEntry[]>("vendor-tds-ledger", []);
  // Pull saved vendor master so TDS entries reference real profiles, not free text.
  const { vendors: master } = useVendorMaster();
  const masterByName = useMemo(() => {
    const idx: Record<string, VendorMaster> = {};
    for (const v of master) idx[v.name.toLowerCase()] = v;
    return idx;
  }, [master]);
  const [vendor, setVendor] = useState("");
  const [section, setSection] = useState<string>(TDS_SECTIONS[0].code);
  const [gross, setGross] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const curRate = TDS_SECTIONS.find(s => s.code === section)?.rate ?? 0;
  const previewTds = gross ? Math.round((parseFloat(gross) || 0) * curRate / 100) : 0;

  const add = () => {
    if (!vendor.trim() || !gross) { toast.error("Enter vendor and gross amount"); return; }
    const entry: TdsEntry = {
      id: crypto.randomUUID(), vendor: vendor.trim(), section,
      grossAmount: parseFloat(gross) || 0, rate: curRate, date, deposited: false,
    };
    setEntries(prev => [entry, ...prev]);
    setVendor(""); setGross("");
    toast.success(`TDS recorded for ${entry.vendor}`);
  };
  const remove = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));
  const toggleDeposit = (id: string) => setEntries(prev => prev.map(e => e.id === id ? { ...e, deposited: !e.deposited } : e));

  const tdsOf = (e: TdsEntry) => Math.round(e.grossAmount * e.rate / 100);
  const totalTds = entries.reduce((s, e) => s + tdsOf(e), 0);
  const deposited = entries.filter(e => e.deposited).reduce((s, e) => s + tdsOf(e), 0);
  const pending = totalTds - deposited;

  const sectionLabel = (code: string) => TDS_SECTIONS.find(s => s.code === code)?.label.split(" - ")[0] ?? code;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Per-vendor TDS deducted and deposited. Feeds your quarterly 26Q. Deposit TDS by the 7th of the following month to avoid interest under Sec 201(1A).</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total TDS Deducted", value: formatCurrency(totalTds), color: "text-[var(--color-primary)]" },
          { label: "Deposited", value: formatCurrency(deposited), color: "text-green-400" },
          { label: "Pending Deposit", value: formatCurrency(pending), color: pending > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Record TDS Deduction</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <input list="tds-master-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
            <datalist id="tds-master-vendors">{master.map(v => <option key={v.id} value={v.name} />)}</datalist>
          </div>
          <select value={section} onChange={e => setSection(e.target.value)} className={inpCls}>
            {TDS_SECTIONS.map(s => <option key={s.code} value={s.code}>{s.label} ({s.rate}%)</option>)}
          </select>
          <input type="number" value={gross} onChange={e => setGross(e.target.value)} placeholder="Gross amount (₹) *" className={inpCls} />
          <DatePicker value={date} onChange={setDate} />
        </div>
        {(() => {
          const prof = masterByName[vendor.trim().toLowerCase()];
          if (!vendor.trim()) return null;
          return prof
            ? <p className="text-xs text-[var(--color-muted)]">From master: PAN <span className="font-mono">{prof.pan || "- (no PAN, 20% rate applies)"}</span>{prof.gstin ? ` · GSTIN ${prof.gstin}` : ""}</p>
            : <p className="text-[11px] text-orange-400">No saved profile for "{vendor.trim()}" - add one in the Directory to capture PAN for 26Q.</p>;
        })()}
        {gross && <p className="text-xs text-[var(--color-muted)]">TDS @ {curRate}% = <span className="font-semibold text-[var(--color-primary)]">{formatCurrency(previewTds)}</span> · Net payable: {formatCurrency((parseFloat(gross) || 0) - previewTds)}</p>}
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Record</button>
      </div>

      {entries.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Receipt size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No TDS entries yet. Record a deduction to build your 26Q feed.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Section", "Gross", "Rate", "TDS", "Date", "Status", ""].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i >= 2 && i <= 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{e.vendor}</td>
                  <td className="px-4 py-3"><span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]">{sectionLabel(e.section)}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(e.grossAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">{e.rate}%</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--color-primary)]">{formatCurrency(tdsOf(e))}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(e.date), "dd MMM")}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleDeposit(e.id)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${e.deposited ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                      {e.deposited ? "Deposited" : "Pending"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #63 Vendor Onboarding & KYC Vault - PAN/GSTIN/MSME/bank, with validation.
   ───────────────────────────────────────────────────────────────────────── */
interface VendorKyc {
  id: string;
  name: string;
  pan: string;
  gstin: string;
  msmeUdyam: string;
  bankAcc: string;
  ifsc: string;
  email: string;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function kycComplete(v: VendorKyc): boolean {
  return PAN_RE.test(v.pan.toUpperCase()) && GSTIN_RE.test(v.gstin.toUpperCase()) && IFSC_RE.test(v.ifsc.toUpperCase()) && v.bankAcc.trim().length >= 6;
}

// Map a persisted master record into the KYC card shape this tab renders.
function masterToKyc(v: VendorMaster): VendorKyc {
  return {
    id: v.id,
    name: v.name,
    pan: (v.pan ?? "").toUpperCase(),
    gstin: (v.gstin ?? "").toUpperCase(),
    msmeUdyam: (v.udyam ?? "").toUpperCase(),
    bankAcc: v.bank_account ?? "",
    ifsc: (v.bank_ifsc ?? "").toUpperCase(),
    email: v.email ?? "",
  };
}

function VendorKycVault() {
  // Now backed by the persisted vendor master - the same records the Directory edits.
  const { vendors: master, upsert, remove: removeMaster } = useVendorMaster();
  const vault = useMemo(() => master.map(masterToKyc), [master]);
  const blank: Omit<VendorKyc, "id"> = { name: "", pan: "", gstin: "", msmeUdyam: "", bankAcc: "", ifsc: "", email: "" };
  const [form, setForm] = useState(blank);

  const set = (k: keyof typeof blank, val: string) => setForm(f => ({ ...f, [k]: val }));

  const panOk = !form.pan || PAN_RE.test(form.pan.toUpperCase());
  const gstinOk = !form.gstin || GSTIN_RE.test(form.gstin.toUpperCase());
  const ifscOk = !form.ifsc || IFSC_RE.test(form.ifsc.toUpperCase());

  const save = async () => {
    if (!form.name.trim()) { toast.error("Vendor name required"); return; }
    if (form.pan && !PAN_RE.test(form.pan.toUpperCase())) { toast.error("Invalid PAN format"); return; }
    if (form.gstin && !GSTIN_RE.test(form.gstin.toUpperCase())) { toast.error("Invalid GSTIN format"); return; }
    if (form.ifsc && !IFSC_RE.test(form.ifsc.toUpperCase())) { toast.error("Invalid IFSC format"); return; }
    // Upsert to the master (POST upserts by name) so onboarding persists server-side.
    const saved = await upsert({
      name: form.name.trim(),
      pan: form.pan.toUpperCase().trim() || null,
      gstin: form.gstin.toUpperCase().trim() || null,
      udyam: form.msmeUdyam.toUpperCase().trim() || null,
      is_msme: form.msmeUdyam.trim().length > 0,
      bank_account: form.bankAcc.trim() || null,
      bank_ifsc: form.ifsc.toUpperCase().trim() || null,
      email: form.email.trim() || null,
    });
    if (saved) {
      setForm(blank);
      toast.success(`${saved.name} onboarded${kycComplete(masterToKyc(saved)) ? " - KYC complete" : " - KYC incomplete"}`);
    }
  };
  const remove = (id: string) => { void removeMaster(id); };

  const completeN = vault.filter(kycComplete).length;
  const msmeN = vault.filter(v => v.msmeUdyam.trim().length > 0).length;

  const errCls = (ok: boolean) => `${inpCls} ${ok ? "" : "border-red-800/50 focus:border-red-500"}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Onboard vendors with validated PAN, GSTIN, MSME (Udyam) and bank details - saved as the persisted vendor master and shared with the Directory, MSME and TDS tabs. Format-validated on save.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vendors On File", value: vault.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "KYC Complete", value: `${completeN}/${vault.length || 0}`, color: completeN === vault.length && vault.length > 0 ? "text-green-400" : "text-orange-400" },
          { label: "MSME Registered", value: msmeN.toString(), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={15} className="text-[var(--color-primary)]" /> New Vendor KYC</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Legal / trade name" className={inpCls} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">PAN</label>
            <input value={form.pan} onChange={e => set("pan", e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className={errCls(panOk)} />
            {!panOk && <p className="text-[10px] text-red-400 mt-0.5">5 letters, 4 digits, 1 letter</p>}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">GSTIN</label>
            <input value={form.gstin} onChange={e => set("gstin", e.target.value.toUpperCase())} maxLength={15} placeholder="22ABCDE1234F1Z5" className={errCls(gstinOk)} />
            {!gstinOk && <p className="text-[10px] text-red-400 mt-0.5">15-char GSTIN format</p>}
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">MSME Udyam No.</label>
            <input value={form.msmeUdyam} onChange={e => set("msmeUdyam", e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" className={inpCls} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Bank account no.</label>
            <input value={form.bankAcc} onChange={e => set("bankAcc", e.target.value)} placeholder="Account number" className={inpCls} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">IFSC</label>
            <input value={form.ifsc} onChange={e => set("ifsc", e.target.value.toUpperCase())} maxLength={11} placeholder="HDFC0001234" className={errCls(ifscOk)} />
            {!ifscOk && <p className="text-[10px] text-red-400 mt-0.5">4 letters, 0, 6 chars</p>}
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[var(--color-muted)] block mb-1">Email (optional)</label>
            <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="accounts@vendor.com" className={inpCls} />
          </div>
        </div>
        <button onClick={save} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Onboard Vendor</button>
      </div>

      {vault.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Contact size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No vendors onboarded yet. Add KYC to build your verified vendor master.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {vault.map(v => {
            const ok = kycComplete(v);
            return (
              <div key={v.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      {v.name}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${ok ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-yellow-900/30 text-yellow-400 border-yellow-800/40"}`}>
                        {ok ? "KYC Complete" : "Incomplete"}
                      </span>
                    </p>
                    {v.email && <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{v.email}</p>}
                  </div>
                  <button onClick={() => remove(v.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[11px]">
                  <div><span className="text-[var(--color-muted)]">PAN: </span><span className="font-mono">{v.pan || "-"}</span></div>
                  <div><span className="text-[var(--color-muted)]">GSTIN: </span><span className="font-mono">{v.gstin || "-"}</span></div>
                  <div><span className="text-[var(--color-muted)]">MSME: </span><span className="font-mono">{v.msmeUdyam || "-"}</span></div>
                  <div><span className="text-[var(--color-muted)]">A/C: </span><span className="font-mono">{v.bankAcc ? `••••${v.bankAcc.slice(-4)}` : "-"}</span></div>
                  <div><span className="text-[var(--color-muted)]">IFSC: </span><span className="font-mono">{v.ifsc || "-"}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #64 Early-Payment Discount Optimizer - 2/10-net-30 vs cost of capital.
   ───────────────────────────────────────────────────────────────────────── */
interface DiscountOffer {
  id: string;
  vendor: string;
  invoiceAmount: number;
  discountPct: number;
  discountDays: number;
  netDays: number;
}

function discountMath(o: DiscountOffer, costOfCapital: number) {
  // Effective annualised return from taking the early-payment discount:
  // discount% / (100 - discount%) × 365 / (netDays - discountDays)
  const periodDays = Math.max(o.netDays - o.discountDays, 1);
  const effAnnual = (o.discountPct / (100 - o.discountPct)) * (365 / periodDays) * 100;
  const savings = Math.round(o.invoiceAmount * o.discountPct / 100);
  const amountPaidEarly = o.invoiceAmount - savings;
  // Cost of borrowing/holding that cash for the extra days:
  const carryCost = Math.round(amountPaidEarly * (costOfCapital / 100) * (periodDays / 365));
  const netBenefit = savings - carryCost;
  const worthIt = effAnnual > costOfCapital;
  return { effAnnual, savings, carryCost, netBenefit, worthIt, periodDays };
}

function EarlyPaymentOptimizer() {
  const [costOfCapital, setCostOfCapital] = useState("12");
  const [offers, setOffers] = useFeatureState<DiscountOffer[]>("vendor-early-pay-offers", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [discPct, setDiscPct] = useState("2");
  const [discDays, setDiscDays] = useState("10");
  const [netDays, setNetDays] = useState("30");

  const coc = parseFloat(costOfCapital) || 0;

  const add = () => {
    if (!vendor.trim() || !amount) { toast.error("Enter vendor and invoice amount"); return; }
    const o: DiscountOffer = {
      id: crypto.randomUUID(), vendor: vendor.trim(),
      invoiceAmount: parseFloat(amount) || 0,
      discountPct: parseFloat(discPct) || 0,
      discountDays: parseFloat(discDays) || 0,
      netDays: parseFloat(netDays) || 0,
    };
    setOffers(prev => [o, ...prev]);
    setVendor(""); setAmount("");
    toast.success(`Discount offer added for ${o.vendor}`);
  };
  const remove = (id: string) => setOffers(prev => prev.filter(o => o.id !== id));

  const totalNet = offers.reduce((s, o) => { const m = discountMath(o, coc); return s + (m.worthIt ? m.netBenefit : 0); }, 0);
  const worthCount = offers.filter(o => discountMath(o, coc).worthIt).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Should you pay early to grab the discount, or hold your cash? A 2/10-net-30 offer is an effective ~37% annualised return - usually beats your cost of capital. This compares each offer against your hurdle rate.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <Banknote size={16} className="text-[var(--color-primary)]" />
        <label className="text-sm">Your cost of capital / hurdle rate (% p.a.)</label>
        <input type="number" value={costOfCapital} onChange={e => setCostOfCapital(e.target.value)} className="w-24 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
        <span className="text-xs text-[var(--color-muted)]">Use your OD / working-capital loan rate. Any discount yielding above this is worth taking.</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Offers Worth Taking", value: `${worthCount}/${offers.length || 0}`, color: "text-green-400" },
          { label: "Net Benefit (if taken)", value: formatCurrency(totalNet), color: totalNet > 0 ? "text-green-400" : "text-[var(--color-muted)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Add Discount Offer</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Invoice ₹ *" className={inpCls} />
          <input type="number" step="0.1" value={discPct} onChange={e => setDiscPct(e.target.value)} placeholder="Discount %" className={inpCls} />
          <input type="number" value={discDays} onChange={e => setDiscDays(e.target.value)} placeholder="Discount days" className={inpCls} />
          <input type="number" value={netDays} onChange={e => setNetDays(e.target.value)} placeholder="Net days" className={inpCls} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add offer</button>
      </div>

      {offers.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Percent size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No discount offers yet. Add a vendor's "2/10 net 30" terms to see if paying early beats holding cash.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {offers.map(o => {
            const m = discountMath(o, coc);
            return (
              <div key={o.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${m.worthIt ? "border-green-800/40" : "border-[var(--color-border)]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{o.vendor} <span className="text-[var(--color-muted)] font-normal">· {formatCurrency(o.invoiceAmount)} · {o.discountPct}/{o.discountDays} net {o.netDays}</span></p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-1">
                      Effective annual yield <span className={`font-bold ${m.effAnnual > coc ? "text-green-400" : "text-red-400"}`}>{m.effAnnual.toFixed(1)}%</span> vs cost of capital {coc}% over {m.periodDays} days
                    </p>
                  </div>
                  <button onClick={() => remove(o.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div><p className="text-[10px] text-[var(--color-muted)]">Discount saved</p><p className="text-sm font-semibold tabular-nums text-green-400">{formatCurrency(m.savings)}</p></div>
                  <div><p className="text-[10px] text-[var(--color-muted)]">Cost to pay early</p><p className="text-sm font-semibold tabular-nums text-orange-400">{formatCurrency(m.carryCost)}</p></div>
                  <div><p className="text-[10px] text-[var(--color-muted)]">Net benefit</p><p className={`text-sm font-semibold tabular-nums ${m.netBenefit > 0 ? "text-green-400" : "text-red-400"}`}>{formatCurrency(m.netBenefit)}</p></div>
                </div>
                <div className={`mt-3 text-xs font-medium flex items-center gap-1.5 ${m.worthIt ? "text-green-400" : "text-[var(--color-muted)]"}`}>
                  {m.worthIt ? <><CheckCircle2 size={13} /> Pay early - beats your hurdle rate by {(m.effAnnual - coc).toFixed(1)} pts</> : <><AlertTriangle size={13} /> Hold cash - discount yield is below your cost of capital</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #65 Pay-Run Scheduler - batch open obligations into a dated pay run.
   Builds a real cash obligation per included line is not needed (they already
   exist); instead it groups due payables into a run with a chosen settlement
   date and shows the cash needed. No payout rail is invoked (gated).
   ───────────────────────────────────────────────────────────────────────── */
function PayRunScheduler() {
  const { store } = useApp();
  const [runDate, setRunDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().split("T")[0]; });
  const [selected, setSelected] = useFeatureState<string[]>("ven-pay-run-selected", []);
  const [horizon, setHorizon] = useState("30");

  const today = new Date();
  const days = parseFloat(horizon) || 30;

  const payables = useMemo(() => {
    const limit = new Date(); limit.setDate(limit.getDate() + days);
    return store.obligations
      .filter(o => o.type === "other" || o.type === "payroll" || o.type === "tax" || o.type === "loan")
      .map(o => {
        const due = new Date(o.dueDate);
        const overdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
        return { ...o, due, overdue };
      })
      .filter(o => o.due <= limit)
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [store.obligations, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const selSet = new Set(selected);
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelected(payables.map(p => p.id));
  const clear = () => setSelected([]);

  const runTotal = payables.filter(p => selSet.has(p.id)).reduce((s, p) => s + p.amount, 0);
  const overdueInRun = payables.filter(p => selSet.has(p.id) && p.overdue > 0).length;
  const available = store.bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const shortfall = runTotal - available;

  // Honest: this tool CHECKS a batch against your balance - it persists no schedule
  // and pays nobody (the old toast said "Pay run scheduled" while writing nothing
  // anywhere; the run vanished on navigation). Real payments: Record Bill → Pay.
  const schedule = () => {
    const n = payables.filter(p => selSet.has(p.id)).length;
    if (n === 0) { toast.error("Select at least one payable for the run"); return; }
    if (shortfall > 0) {
      toast.warning(`Pay run of ${formatCurrency(runTotal)} on ${format(new Date(runDate), "dd MMM")} exceeds available balance by ${formatCurrency(shortfall)}`);
    } else {
      toast.info(`Balance check passed: ${n} payable${n !== 1 ? "s" : ""} totalling ${formatCurrency(runTotal)} fits your balance for ${format(new Date(runDate), "dd MMM")}. Nothing is scheduled - pay each bill via Record Bill → Pay when the day comes.`, { duration: 8000 });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Batch your due payables into a single dated pay run instead of paying ad-hoc. MSME and overdue items are surfaced so you clear them first; the run is checked against your live bank balance. Actual disbursement needs a payout rail (gated).</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <CalendarClock size={16} className="text-[var(--color-primary)]" />
        <label className="text-sm">Settlement date</label>
        <DatePicker value={runDate} onChange={setRunDate} min={new Date().toISOString().split("T")[0]} />
        <label className="text-sm ml-2">Include due within</label>
        <select value={horizon} onChange={e => setHorizon(e.target.value)} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]">
          {["7", "15", "30", "60", "90"].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pay-Run Total", value: formatCurrency(runTotal), color: "text-[var(--color-primary)]" },
          { label: "Items Selected", value: `${selected.filter(id => payables.some(p => p.id === id)).length}/${payables.length}`, color: "text-blue-400" },
          { label: "Overdue in Run", value: overdueInRun.toString(), color: overdueInRun > 0 ? "text-red-400" : "text-green-400" },
          { label: "After Run Balance", value: formatCurrency(available - runTotal), color: shortfall > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {payables.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CalendarClock size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No payables due in this window. Schedule vendor payments from the Directory tab to build a pay run.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <div className="px-4 py-2.5 bg-[var(--color-bg)] border-b border-[var(--color-border)] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-[var(--color-primary)] hover:underline">Select all</button>
              <button onClick={clear} className="text-xs text-[var(--color-muted)] hover:underline">Clear</button>
            </div>
            <button onClick={schedule} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-1.5 rounded-lg hover:opacity-90">Check run vs balance</button>
          </div>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["", "Payable", "Type", "Due", "Amount"].map((h, i) => (
                  <th key={h || "chk"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {payables.map(p => (
                <tr key={p.id} className={`hover:bg-white/2 cursor-pointer ${selSet.has(p.id) ? "bg-[var(--color-primary)]/5" : ""}`} onClick={() => toggle(p.id)}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selSet.has(p.id)} readOnly className="accent-[var(--color-primary)]" /></td>
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate">{p.name}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLOR[p.type] ?? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>{CATEGORY_LABEL[p.type] ?? p.type}</span></td>
                  <td className="px-4 py-3 text-xs">{p.overdue > 0 ? <span className="text-red-400">{p.overdue}d overdue</span> : <span className="text-[var(--color-muted)]">{format(p.due, "dd MMM")}</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #66 Spend Analysis - concentration & consolidation from live transactions.
   Flags single-vendor dependency risk and top-N share of total spend.
   ───────────────────────────────────────────────────────────────────────── */
function SpendAnalysis() {
  const { store } = useApp();
  const [riskPct, setRiskPct] = useState("25");

  const rows = useMemo(() => {
    const map: Record<string, number> = {};
    store.transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      map[t.counterparty] = (map[t.counterparty] ?? 0) + Math.abs(t.amount);
    });
    return Object.entries(map).map(([vendor, spend]) => ({ vendor, spend })).sort((a, b) => b.spend - a.spend);
  }, [store.transactions]);

  const total = rows.reduce((s, r) => s + r.spend, 0);
  const threshold = parseFloat(riskPct) || 25;
  const concentrated = rows.filter(r => total > 0 && (r.spend / total) * 100 >= threshold);
  const top5Share = total > 0 ? rows.slice(0, 5).reduce((s, r) => s + r.spend, 0) / total * 100 : 0;
  // Consolidation opportunity: long tail of small vendors (< 2% each).
  const tail = rows.filter(r => total > 0 && (r.spend / total) * 100 < 2);
  const tailSpend = tail.reduce((s, r) => s + r.spend, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Where does your money actually go? This ranks vendors by total spend, flags any single vendor over your concentration threshold (supplier-dependency risk), and surfaces a long tail of tiny vendors you could consolidate to win better terms.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <PieChart size={16} className="text-[var(--color-primary)]" />
        <label className="text-sm">Concentration risk threshold (% of total spend)</label>
        <input type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)} className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Spend", value: formatAmount(total), color: "text-red-400" },
          { label: "Top-5 Share", value: `${top5Share.toFixed(0)}%`, color: top5Share > 70 ? "text-orange-400" : "text-blue-400" },
          { label: `Over ${threshold}% (risk)`, value: concentrated.length.toString(), color: concentrated.length > 0 ? "text-red-400" : "text-green-400" },
          { label: "Tail Vendors (<2%)", value: tail.length.toString(), color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {concentrated.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--color-muted)]"><span className="text-red-300 font-semibold">{concentrated.map(c => c.vendor).join(", ")}</span> each take ≥{threshold}% of your spend. Heavy reliance on one supplier is a continuity risk - line up a backup vendor or split volume.</p>
        </div>
      )}
      {tail.length >= 3 && (
        <div className="bg-yellow-950/20 border border-yellow-800/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <PieChart size={16} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--color-muted)]">{tail.length} tiny vendors absorb {formatAmount(tailSpend)} ({total > 0 ? (tailSpend / total * 100).toFixed(0) : 0}%). Consolidating them onto fewer suppliers cuts admin overhead and improves your negotiating leverage.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <PieChart size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No spend yet. Import expense transactions to analyse vendor concentration.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["#", "Vendor", "Spend", "Share", ""].map((h, i) => (
                  <th key={h || "bar"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 2 || i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((r, i) => {
                const share = total > 0 ? r.spend / total * 100 : 0;
                const risky = share >= threshold;
                return (
                  <tr key={r.vendor} className="hover:bg-white/2">
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)] tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{r.vendor} {risky && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-red-950/30 text-red-400 border-red-800/30 ml-1">RISK</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-400">{formatAmount(r.spend)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">{share.toFixed(1)}%</td>
                    <td className="px-4 py-3 w-[120px]"><div className="h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden"><div className={`h-full ${risky ? "bg-red-400" : "bg-[var(--color-primary)]"}`} style={{ width: `${Math.min(share, 100)}%` }} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #67 Duplicate Vendor Detector - fuzzy-match names in live transactions.
   ───────────────────────────────────────────────────────────────────────── */
function normVendor(s: string): string {
  return s.toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|enterprises|industries|traders|trading|the|and|&)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function DuplicateVendorDetector() {
  const { store } = useApp();
  const [dismissed, setDismissed] = useFeatureState<string[]>("ven-dup-dismissed", []);

  const groups = useMemo(() => {
    const names = Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty)));
    const spend: Record<string, number> = {};
    store.transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => { spend[t.counterparty] = (spend[t.counterparty] ?? 0) + Math.abs(t.amount); });
    const byKey: Record<string, string[]> = {};
    names.forEach(n => {
      const key = normVendor(n);
      if (key.length < 2) return;
      (byKey[key] ??= []).push(n);
    });
    return Object.entries(byKey)
      .filter(([, v]) => v.length > 1)
      .map(([key, v]) => ({ key, vendors: v.sort(), spend: v.reduce((s, n) => s + (spend[n] ?? 0), 0) }))
      .sort((a, b) => b.spend - a.spend);
  }, [store.transactions]);

  const dismissSet = new Set(dismissed);
  const active = groups.filter(g => !dismissSet.has(g.key));

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">The same vendor entered three different ways ("ABC Traders", "ABC Traders Pvt Ltd", "abc traders") fragments your spend data and hides your true exposure. This normalises names (strips suffixes, case, punctuation) and groups likely duplicates so you can merge them in your books.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Possible Duplicate Sets", value: active.length.toString(), color: active.length > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Vendors Involved", value: active.reduce((s, g) => s + g.vendors.length, 0).toString(), color: "text-blue-400" },
          { label: "Spend at Risk of Fragmentation", value: formatAmount(active.reduce((s, g) => s + g.spend, 0)), color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {active.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-3 text-green-400 opacity-50" />
          <p className="text-sm text-[var(--color-muted)]">No likely duplicate vendors detected. Your vendor names look clean.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(g => (
            <div key={g.key} className="bg-[var(--color-surface)] border border-orange-800/40 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2"><Copy size={14} className="text-orange-400" /> {g.vendors.length} likely-same vendors</p>
                  <ul className="mt-2 space-y-1">
                    {g.vendors.map(v => <li key={v} className="text-xs text-[var(--color-muted)] flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-[var(--color-muted)]" /> {v}</li>)}
                  </ul>
                  <p className="text-[11px] text-[var(--color-muted)] mt-2">Combined spend: <span className="font-semibold text-red-400">{formatAmount(g.spend)}</span></p>
                </div>
                <button onClick={() => setDismissed(prev => [...prev, g.key])} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] px-2.5 py-1.5 rounded-lg shrink-0">Not a duplicate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #68 Purchase Requisition → PO - internal request, approve, convert to PO.
   ───────────────────────────────────────────────────────────────────────── */
type ReqStatus = "pending" | "approved" | "rejected" | "converted";
interface Requisition {
  id: string;
  reqNo: string;
  requester: string;
  item: string;
  qty: number;
  estCost: number;
  needBy: string;
  justification: string;
  status: ReqStatus;
}
const REQ_META: Record<ReqStatus, { label: string; cls: string }> = {
  pending:   { label: "Pending", cls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
  approved:  { label: "Approved", cls: "bg-blue-950/30 text-blue-400 border-blue-800/30" },
  rejected:  { label: "Rejected", cls: "bg-red-950/30 text-red-400 border-red-800/30" },
  converted: { label: "→ PO", cls: "bg-green-950/30 text-green-400 border-green-800/30" },
};

function RequisitionToPo() {
  const [reqs, setReqs] = useFeatureState<Requisition[]>("ven-requisitions", []);
  const [requester, setRequester] = useState("");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [estCost, setEstCost] = useState("");
  const [needBy, setNeedBy] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().split("T")[0]; });
  const [justification, setJustification] = useState("");

  const raise = () => {
    if (!requester.trim() || !item.trim()) { toast.error("Enter requester and item"); return; }
    const seq = reqs.length + 1;
    const r: Requisition = {
      id: crypto.randomUUID(), reqNo: `PR-${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`,
      requester: requester.trim(), item: item.trim(), qty: parseFloat(qty) || 1,
      estCost: parseFloat(estCost) || 0, needBy, justification: justification.trim(), status: "pending",
    };
    setReqs(prev => [r, ...prev]);
    setItem(""); setEstCost(""); setJustification("");
    toast.success(`${r.reqNo} raised`);
  };
  const setStatus = (id: string, status: ReqStatus) => {
    setReqs(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (status === "approved") toast.success("Requisition approved - ready to convert to PO");
    if (status === "converted") toast.success("Converted to PO - raise it formally in the Purchase Orders tab");
  };
  const remove = (id: string) => setReqs(prev => prev.filter(r => r.id !== id));

  const pendingN = reqs.filter(r => r.status === "pending").length;
  const approvedVal = reqs.filter(r => r.status === "approved").reduce((s, r) => s + r.estCost * r.qty, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Anyone on the team can raise a purchase requisition - what they need, why, and by when. The owner approves or rejects, and approved requests convert into a PO. This adds the spend-control step SMBs usually skip.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending Approval", value: pendingN.toString(), color: pendingN > 0 ? "text-yellow-400" : "text-green-400" },
          { label: "Approved (ready for PO)", value: formatCurrency(approvedVal), color: "text-blue-400" },
          { label: "Total Requisitions", value: reqs.length.toString(), color: "text-[var(--color-primary)]" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileInput size={15} className="text-[var(--color-primary)]" /> Raise Requisition</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input value={requester} onChange={e => setRequester(e.target.value)} placeholder="Requested by *" className={inpCls} />
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item / service *" className={inpCls} />
          <DatePicker value={needBy} onChange={setNeedBy} />
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" className={inpCls} />
          <input type="number" value={estCost} onChange={e => setEstCost(e.target.value)} placeholder="Est. unit cost (₹)" className={inpCls} />
          <input value={justification} onChange={e => setJustification(e.target.value)} placeholder="Justification" className={inpCls} />
        </div>
        <button onClick={raise} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Raise Requisition</button>
      </div>

      {reqs.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileInput size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No requisitions yet. Raise one to route a purchase need through approval.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["PR #", "Requester", "Item", "Qty", "Est. Value", "Need By", "Status", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 3 || i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {reqs.map(r => (
                <tr key={r.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{r.reqNo}</td>
                  <td className="px-4 py-3">{r.requester}</td>
                  <td className="px-4 py-3 max-w-[160px] truncate" title={r.justification}>{r.item}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(r.estCost * r.qty)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(r.needBy), "dd MMM")}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${REQ_META[r.status].cls}`}>{REQ_META[r.status].label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.status === "pending" && <>
                        <button onClick={() => setStatus(r.id, "approved")} className="text-[10px] font-semibold px-2 py-1 rounded border border-blue-800/40 text-blue-400 hover:bg-blue-950/30">Approve</button>
                        <button onClick={() => setStatus(r.id, "rejected")} className="text-[10px] font-semibold px-2 py-1 rounded border border-red-800/40 text-red-400 hover:bg-red-950/30">Reject</button>
                      </>}
                      {r.status === "approved" && <button onClick={() => setStatus(r.id, "converted")} className="text-[10px] font-semibold px-2 py-1 rounded border border-green-800/40 text-green-400 hover:bg-green-950/30">→ PO</button>}
                      <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #69 Vendor Performance Review - score on delivery, quality, price, support.
   ───────────────────────────────────────────────────────────────────────── */
interface VendorReview {
  id: string;
  vendor: string;
  period: string;
  onTime: number;   // 1-5
  quality: number;  // 1-5
  price: number;    // 1-5
  support: number;  // 1-5
  notes: string;
}
const REVIEW_CRITERIA: { key: keyof Pick<VendorReview, "onTime" | "quality" | "price" | "support">; label: string }[] = [
  { key: "onTime", label: "On-time delivery" },
  { key: "quality", label: "Quality / low rejects" },
  { key: "price", label: "Price competitiveness" },
  { key: "support", label: "Responsiveness / support" },
];
function reviewScore(r: VendorReview): number {
  return (r.onTime + r.quality + r.price + r.support) / 4;
}

function VendorPerformanceReview() {
  const { store } = useApp();
  const blank = { vendor: "", onTime: 3, quality: 3, price: 3, support: 3, notes: "" };
  const [reviews, setReviews] = useFeatureState<VendorReview[]>("ven-performance-reviews", []);
  const [form, setForm] = useState(blank);

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const save = () => {
    if (!form.vendor.trim()) { toast.error("Pick a vendor to review"); return; }
    const r: VendorReview = {
      id: crypto.randomUUID(), vendor: form.vendor.trim(),
      period: format(new Date(), "MMM yyyy"),
      onTime: form.onTime, quality: form.quality, price: form.price, support: form.support, notes: form.notes.trim(),
    };
    setReviews(prev => [r, ...prev]);
    setForm(blank);
    toast.success(`${r.vendor} scored ${reviewScore(r).toFixed(1)}/5`);
  };
  const remove = (id: string) => setReviews(prev => prev.filter(r => r.id !== id));

  const avg = reviews.length ? reviews.reduce((s, r) => s + reviewScore(r), 0) / reviews.length : 0;
  const topVendor = reviews.length ? [...reviews].sort((a, b) => reviewScore(b) - reviewScore(a))[0] : null;
  const atRisk = reviews.filter(r => reviewScore(r) < 3).length;

  const Stars = ({ n }: { n: number }) => (
    <span className="flex items-center gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={12} className={i <= Math.round(n) ? "text-yellow-400 fill-yellow-400" : "text-[var(--color-border)]"} />)}</span>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Rate each vendor on delivery, quality, price and support so supplier choice is based on a track record, not gut feel. Share scores with vendors to drive improvement, and spot at-risk suppliers before they cost you.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Vendors Reviewed", value: reviews.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Avg Score", value: `${avg.toFixed(1)}/5`, color: avg >= 3.5 ? "text-green-400" : avg >= 2.5 ? "text-yellow-400" : "text-red-400" },
          { label: "Under-performers (<3)", value: atRisk.toString(), color: atRisk > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Star size={15} className="text-[var(--color-primary)]" /> New Performance Review</h3>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Vendor *</label>
          <input list="review-vendors" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" className={inpCls} />
          <datalist id="review-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {REVIEW_CRITERIA.map(c => (
            <div key={c.key}>
              <label className="text-xs text-[var(--color-muted)] flex items-center justify-between mb-1">{c.label} <span className="font-semibold text-[var(--color-text)]">{form[c.key]}/5</span></label>
              <input type="range" min={1} max={5} value={form[c.key]} onChange={e => setForm(f => ({ ...f, [c.key]: parseInt(e.target.value) }))} className="w-full accent-[var(--color-primary)]" />
            </div>
          ))}
        </div>
        <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className={inpCls} />
        <button onClick={save} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Save Review</button>
      </div>

      {topVendor && <p className="text-xs text-[var(--color-muted)]">Top performer: <span className="font-semibold text-green-400">{topVendor.vendor}</span> at {reviewScore(topVendor).toFixed(1)}/5</p>}

      {reviews.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Star size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No reviews yet. Score a vendor to start building a reliability track record.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reviews.map(r => {
            const sc = reviewScore(r);
            return (
              <div key={r.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{r.vendor} <span className="text-[var(--color-muted)] font-normal text-xs">· {r.period}</span></p>
                    <p className={`text-lg font-bold tabular-nums mt-0.5 ${sc >= 3.5 ? "text-green-400" : sc >= 2.5 ? "text-yellow-400" : "text-red-400"}`}>{sc.toFixed(1)}/5</p>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>
                <div className="space-y-1.5 mt-3">
                  {REVIEW_CRITERIA.map(c => (
                    <div key={c.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--color-muted)]">{c.label}</span><Stars n={r[c.key]} />
                    </div>
                  ))}
                </div>
                {r.notes && <p className="text-[11px] text-[var(--color-muted)] mt-3 border-t border-[var(--color-border)] pt-2">{r.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #70 RFQ Comparison - quote one item to N vendors, rank price/lead/terms.
   ───────────────────────────────────────────────────────────────────────── */
interface Quote {
  id: string;
  vendor: string;
  unitPrice: number;
  leadDays: number;
  paymentTermDays: number;
}

function RfqComparison() {
  const [item, setItem] = useFeatureState<string>("ven-rfq-item", "");
  const [qtyStr, setQtyStr] = useFeatureState<string>("ven-rfq-qty", "100");
  const [quotes, setQuotes] = useFeatureState<Quote[]>("ven-rfq-quotes", []);
  const [vendor, setVendor] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [termDays, setTermDays] = useState("30");

  const qty = parseFloat(qtyStr) || 1;

  const add = () => {
    if (!vendor.trim() || !unitPrice) { toast.error("Enter vendor and unit price"); return; }
    const q: Quote = {
      id: crypto.randomUUID(), vendor: vendor.trim(),
      unitPrice: parseFloat(unitPrice) || 0, leadDays: parseFloat(leadDays) || 0, paymentTermDays: parseFloat(termDays) || 0,
    };
    setQuotes(prev => [...prev, q]);
    setVendor(""); setUnitPrice(""); setLeadDays("");
    toast.success(`Quote from ${q.vendor} added`);
  };
  const remove = (id: string) => setQuotes(prev => prev.filter(q => q.id !== id));
  const clearAll = () => { setQuotes([]); toast.success("RFQ cleared"); };

  const ranked = useMemo(() => {
    if (quotes.length === 0) return [];
    const minPrice = Math.min(...quotes.map(q => q.unitPrice || Infinity));
    const minLead = Math.min(...quotes.map(q => q.leadDays));
    const maxTerm = Math.max(...quotes.map(q => q.paymentTermDays));
    return quotes.map(q => {
      // Lower price & lead better; longer payment term better. Weighted 0-100.
      const priceScore = q.unitPrice > 0 ? (minPrice / q.unitPrice) * 50 : 0;
      const leadScore = q.leadDays > 0 ? (minLead / q.leadDays) * 30 : 30;
      const termScore = maxTerm > 0 ? (q.paymentTermDays / maxTerm) * 20 : 0;
      return { ...q, total: q.unitPrice * qty, score: priceScore + leadScore + termScore };
    }).sort((a, b) => b.score - a.score);
  }, [quotes, qty]);

  const best = ranked[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Source the same item from several vendors and compare quotes side by side. Each is scored on price (50%), lead time (30%) and payment terms (20%) so you pick on value, not just the lowest sticker price.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Item being sourced</label>
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. 20mm MS bolts" className={inpCls} />
        </div>
        <div>
          <label className="text-xs text-[var(--color-muted)] block mb-1">Quantity</label>
          <input type="number" value={qtyStr} onChange={e => setQtyStr(e.target.value)} className={inpCls} />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Add Quote</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="Unit price ₹ *" className={inpCls} />
          <input type="number" value={leadDays} onChange={e => setLeadDays(e.target.value)} placeholder="Lead time (days)" className={inpCls} />
          <input type="number" value={termDays} onChange={e => setTermDays(e.target.value)} placeholder="Payment term (days)" className={inpCls} />
        </div>
        <div className="flex gap-2">
          <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add quote</button>
          {quotes.length > 0 && <button onClick={clearAll} className="text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent)] px-3 py-2 rounded-lg">Clear RFQ</button>}
        </div>
      </div>

      {ranked.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <ListChecks size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No quotes yet. Add at least two vendor quotes to compare and rank.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          {best && <div className="px-4 py-2.5 bg-green-950/15 border-b border-green-800/30 text-xs">Recommended: <span className="font-semibold text-green-400">{best.vendor}</span> - best blended value at {formatCurrency(best.total)} for {qty} {item || "units"}</div>}
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Rank", "Vendor", "Unit ₹", "Lead", "Terms", "Order Total", "Score", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i >= 2 && i <= 6 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {ranked.map((q, i) => (
                <tr key={q.id} className={`hover:bg-white/2 ${i === 0 ? "bg-green-950/10" : ""}`}>
                  <td className="px-4 py-3 font-bold tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{q.vendor}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(q.unitPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">{q.leadDays}d</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">{q.paymentTermDays}d</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(q.total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-[var(--color-primary)]">{q.score.toFixed(0)}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(q.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #71 Advances Tracker - advances paid to vendors, adjusted vs future bills.
   ───────────────────────────────────────────────────────────────────────── */
interface Advance {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  purpose: string;
  adjusted: number;
}

function AdvancesTracker() {
  const { store } = useApp();
  const [advances, setAdvances] = useFeatureState<Advance[]>("ven-advances", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purpose, setPurpose] = useState("");
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [adjAmt, setAdjAmt] = useState("");

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    if (!vendor.trim() || !amount) { toast.error("Enter vendor and advance amount"); return; }
    const a: Advance = {
      id: crypto.randomUUID(), vendor: vendor.trim(), amount: parseFloat(amount) || 0,
      date, purpose: purpose.trim(), adjusted: 0,
    };
    setAdvances(prev => [a, ...prev]);
    setVendor(""); setAmount(""); setPurpose("");
    toast.success(`Advance of ${formatCurrency(a.amount)} to ${a.vendor} recorded`);
  };
  const remove = (id: string) => setAdvances(prev => prev.filter(a => a.id !== id));
  const applyAdjust = (id: string) => {
    const amt = parseFloat(adjAmt) || 0;
    if (amt <= 0) { toast.error("Enter a valid amount to adjust"); return; }
    setAdvances(prev => prev.map(a => {
      if (a.id !== id) return a;
      const newAdj = Math.min(a.amount, a.adjusted + amt);
      return { ...a, adjusted: newAdj };
    }));
    setAdjustFor(null); setAdjAmt("");
    toast.success("Advance adjusted against a bill");
  };

  const totalAdvanced = advances.reduce((s, a) => s + a.amount, 0);
  const outstanding = advances.reduce((s, a) => s + (a.amount - a.adjusted), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Advances paid to vendors are real cash out that's easy to lose track of. Record each advance, then knock it down as you adjust it against incoming bills - so the unrecovered balance never surprises you at year-end.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Advanced", value: formatCurrency(totalAdvanced), color: "text-[var(--color-primary)]" },
          { label: "Adjusted", value: formatCurrency(totalAdvanced - outstanding), color: "text-green-400" },
          { label: "Outstanding", value: formatCurrency(outstanding), color: outstanding > 0 ? "text-orange-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Wallet size={15} className="text-[var(--color-primary)]" /> Record Advance</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input list="adv-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="adv-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Advance ₹ *" className={inpCls} />
          <DatePicker value={date} onChange={setDate} />
          <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Purpose / PO ref" className={inpCls} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Record Advance</button>
      </div>

      {advances.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Wallet size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No advances recorded. Track money paid upfront so it gets adjusted against bills.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {advances.map(a => {
            const bal = a.amount - a.adjusted;
            const pct = a.amount > 0 ? a.adjusted / a.amount * 100 : 0;
            return (
              <div key={a.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{a.vendor} <span className="text-[var(--color-muted)] font-normal text-xs">· {format(new Date(a.date), "dd MMM yyyy")}{a.purpose ? ` · ${a.purpose}` : ""}</span></p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-1">Advanced {formatCurrency(a.amount)} · adjusted {formatCurrency(a.adjusted)} · <span className={bal > 0 ? "text-orange-400 font-semibold" : "text-green-400 font-semibold"}>balance {formatCurrency(bal)}</span></p>
                    <div className="h-1.5 w-48 rounded-full bg-[var(--color-bg)] overflow-hidden mt-2"><div className="h-full bg-green-400" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {bal > 0 && (adjustFor === a.id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={adjAmt} onChange={e => setAdjAmt(e.target.value)} placeholder="₹" className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
                        <button onClick={() => applyAdjust(a.id)} className="text-[10px] font-semibold px-2 py-1 rounded border border-green-800/40 text-green-400 hover:bg-green-950/30">Apply</button>
                        <button onClick={() => { setAdjustFor(null); setAdjAmt(""); }} className="text-[var(--color-muted)] hover:text-red-400"><X size={13} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setAdjustFor(a.id); setAdjAmt(bal.toFixed(0)); }} className="text-[10px] font-semibold px-2.5 py-1 rounded border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)]">Adjust vs bill</button>
                    ))}
                    <button onClick={() => remove(a.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #72 Debit Note / Return-to-Vendor - raise debit notes, net vs open bills.
   ───────────────────────────────────────────────────────────────────────── */
type DnReason = "return" | "rate-diff" | "shortage" | "damage" | "discount";
interface DebitNote {
  id: string;
  dnNo: string;
  vendor: string;
  amount: number;
  date: string;
  reason: DnReason;
  status: "open" | "adjusted";
}
const DN_REASON: Record<DnReason, string> = {
  "return": "Goods returned",
  "rate-diff": "Rate difference",
  "shortage": "Short supply",
  "damage": "Damaged goods",
  "discount": "Discount claimed",
};

function DebitNoteTracker() {
  const { store } = useApp();
  const [notes, setNotes] = useFeatureState<DebitNote[]>("ven-debit-notes", []);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<DnReason>("return");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    if (!vendor.trim() || !amount) { toast.error("Enter vendor and amount"); return; }
    const seq = notes.length + 1;
    const dn: DebitNote = {
      id: crypto.randomUUID(), dnNo: `DN-${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`,
      vendor: vendor.trim(), amount: parseFloat(amount) || 0, date, reason, status: "open",
    };
    setNotes(prev => [dn, ...prev]);
    setVendor(""); setAmount("");
    toast.success(`${dn.dnNo} raised - reduces what you owe ${dn.vendor}`);
  };
  const remove = (id: string) => setNotes(prev => prev.filter(n => n.id !== id));
  const toggleAdjust = (id: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, status: n.status === "open" ? "adjusted" : "open" } : n));

  const openCredit = notes.filter(n => n.status === "open").reduce((s, n) => s + n.amount, 0);
  const byVendor = useMemo(() => {
    const m: Record<string, number> = {};
    notes.filter(n => n.status === "open").forEach(n => { m[n.vendor] = (m[n.vendor] ?? 0) + n.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">When you return goods, get short-supplied, or claim a rate difference, raise a debit note - it reduces what you owe the vendor. Track open debit notes here and net them against the next bill so credits never lapse unclaimed.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open Debit Notes", value: notes.filter(n => n.status === "open").length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Credit Owed to You", value: formatCurrency(openCredit), color: openCredit > 0 ? "text-green-400" : "text-[var(--color-muted)]" },
          { label: "Total Raised", value: notes.length.toString(), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Undo2 size={15} className="text-[var(--color-primary)]" /> Raise Debit Note</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input list="dn-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="dn-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ₹ *" className={inpCls} />
          <select value={reason} onChange={e => setReason(e.target.value as DnReason)} className={inpCls}>
            {(Object.keys(DN_REASON) as DnReason[]).map(r => <option key={r} value={r}>{DN_REASON[r]}</option>)}
          </select>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Raise Debit Note</button>
      </div>

      {byVendor.length > 0 && (
        <div className="bg-green-950/15 border border-green-800/30 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--color-muted)]">Net these open credits against the next bill: {byVendor.map(([v, amt]) => <span key={v} className="text-green-400 font-medium">{v} {formatCurrency(amt)}{byVendor[byVendor.length - 1][0] !== v ? " · " : ""}</span>)}</p>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Undo2 size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No debit notes yet. Raise one when you return goods or claim a difference.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["DN #", "Vendor", "Reason", "Date", "Amount", "Status", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {notes.map(n => (
                <tr key={n.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{n.dnNo}</td>
                  <td className="px-4 py-3 font-medium">{n.vendor}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{DN_REASON[n.reason]}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(n.date), "dd MMM")}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-green-400">{formatCurrency(n.amount)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleAdjust(n.id)} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${n.status === "adjusted" ? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]" : "bg-green-900/30 text-green-400 border-green-800/40"}`}>
                      {n.status === "adjusted" ? "Adjusted" : "Open"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(n.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #82 Payables Forecast - project the next 30/60/90 days of vendor outflows
   from scheduled obligations plus the run-rate of recurring vendor spend.
   ───────────────────────────────────────────────────────────────────────── */
function PayablesForecast() {
  const { store } = useApp();
  const { transactions, obligations } = store;

  const buckets = useMemo(() => {
    const today = new Date();
    const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const windows = [
      { key: "0_30",  label: "Next 30 days", from: 0,  to: 30 },
      { key: "31_60", label: "31-60 days",   from: 31, to: 60 },
      { key: "61_90", label: "61-90 days",   from: 61, to: 90 },
    ];
    // Scheduled payables = obligations payable to vendors / statutory dues.
    const payable = obligations.filter(o => o.type === "other" || o.type === "payroll" || o.type === "tax");
    return windows.map(w => {
      const scheduled = payable
        .map(o => ({ o, d: Math.floor((new Date(o.dueDate).getTime() - day0.getTime()) / 86400000) }))
        .filter(x => x.d >= w.from && x.d <= w.to)
        .reduce((s, x) => s + x.o.amount, 0);
      return { ...w, scheduled };
    });
  }, [obligations]);

  // Recurring run-rate: avg monthly spend on vendors seen >=2 times in last 90 days.
  const monthlyRunRate = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getTime() - 90 * 86400000).toISOString().split("T")[0];
    const recent = transactions.filter(t => t.amount < 0 && t.counterparty && t.date >= cutoff);
    const byVendor: Record<string, number> = {};
    recent.forEach(t => { byVendor[t.counterparty] = (byVendor[t.counterparty] ?? 0) + 1; });
    const recurringSpend = recent
      .filter(t => (byVendor[t.counterparty] ?? 0) >= 2)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return recurringSpend / 3; // 90 days -> per month
  }, [transactions]);

  const rows = buckets.map(b => ({ ...b, runRate: monthlyRunRate, total: b.scheduled + monthlyRunRate }));
  const total90 = rows.reduce((s, r) => s + r.total, 0);

  const exportCsv = () => {
    const lines = ["Window,Scheduled Obligations,Recurring Run-Rate,Projected Outflow"];
    rows.forEach(r => lines.push(`${r.label},${Math.round(r.scheduled)},${Math.round(r.runRate)},${Math.round(r.total)}`));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "payables-forecast.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Payables forecast exported");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] max-w-2xl">Projected vendor cash outflow over the next 90 days - combining your scheduled obligations with the run-rate of recurring vendor spend (vendors paid 2+ times in the last quarter). Use it to spot a cash crunch before it lands.</p>
        <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 px-3 py-2 rounded-lg shrink-0">
          <FileInput size={13} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.key} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{r.label}</p>
            <p className="text-xl font-bold tabular-nums text-orange-400">{formatCurrency(Math.round(r.total))}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">Scheduled {formatCurrency(Math.round(r.scheduled))} · Recurring {formatCurrency(Math.round(r.runRate))}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
            <tr>
              {["Window", "Scheduled", "Recurring Run-Rate", "Projected Outflow"].map((h, i) => (
                <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-white/2">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.scheduled))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.runRate))}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-400">{formatCurrency(Math.round(r.total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
              <td className="px-4 py-3 font-semibold" colSpan={3}>Total 90-day vendor outflow</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-400">{formatCurrency(Math.round(total90))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #52 Blanket PO Drawdown - set an umbrella PO value and draw releases
   against it; track committed vs remaining headroom.
   ───────────────────────────────────────────────────────────────────────── */
interface BlanketRelease { id: string; date: string; amount: number; note: string; }
interface BlanketPo { id: string; vendor: string; totalValue: number; validTill: string; releases: BlanketRelease[]; }

function BlanketPoDrawdown() {
  const { store } = useApp();
  const [bpos, setBpos] = useFeatureState<BlanketPo[]>("ven-blanket-pos", []);
  const [vendor, setVendor] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [validTill, setValidTill] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return d.toISOString().split("T")[0]; });
  const [relAmt, setRelAmt] = useState<Record<string, string>>({});
  const [relNote, setRelNote] = useState<Record<string, string>>({});

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const drawn = (b: BlanketPo) => b.releases.reduce((s, r) => s + r.amount, 0);

  const create = () => {
    const tv = parseFloat(totalValue) || 0;
    if (!vendor.trim() || tv <= 0) { toast.error("Enter vendor and total value"); return; }
    const bpo: BlanketPo = { id: crypto.randomUUID(), vendor: vendor.trim(), totalValue: tv, validTill, releases: [] };
    setBpos(prev => [bpo, ...prev]);
    setVendor(""); setTotalValue("");
    toast.success(`Blanket PO for ${bpo.vendor} created - ${formatCurrency(tv)} headroom`);
  };

  const release = (id: string) => {
    const amt = parseFloat(relAmt[id] ?? "") || 0;
    if (amt <= 0) { toast.error("Enter a release amount"); return; }
    setBpos(prev => prev.map(b => {
      if (b.id !== id) return b;
      const remaining = b.totalValue - drawn(b);
      if (amt > remaining) { toast.error(`Release exceeds remaining headroom ${formatCurrency(remaining)}`); return b; }
      toast.success(`${formatCurrency(amt)} released against ${b.vendor}`);
      return { ...b, releases: [{ id: crypto.randomUUID(), date: new Date().toISOString().split("T")[0], amount: amt, note: (relNote[id] ?? "").trim() }, ...b.releases] };
    }));
    setRelAmt(p => ({ ...p, [id]: "" })); setRelNote(p => ({ ...p, [id]: "" }));
  };

  const remove = (id: string) => setBpos(prev => prev.filter(b => b.id !== id));

  const totalCommitted = bpos.reduce((s, b) => s + b.totalValue, 0);
  const totalDrawn = bpos.reduce((s, b) => s + drawn(b), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">For repeat purchasing, agree an annual umbrella value with a vendor and draw smaller releases against it - no fresh PO each time. Track how much of each blanket PO you've consumed and how much headroom is left.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Blanket POs", value: bpos.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Total Committed", value: formatCurrency(totalCommitted), color: "text-blue-400" },
          { label: "Drawn to Date", value: formatCurrency(totalDrawn), color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers size={15} className="text-[var(--color-primary)]" /> New Blanket PO</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input list="bpo-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="bpo-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} placeholder="Annual value ₹ *" className={inpCls} />
          <DatePicker value={validTill} onChange={setValidTill} />
        </div>
        <button onClick={create} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Create Blanket PO</button>
      </div>

      {bpos.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Layers size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No blanket POs yet. Create one to draw releases against an annual commitment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bpos.map(b => {
            const used = drawn(b);
            const remaining = b.totalValue - used;
            const pct = b.totalValue > 0 ? Math.min(100, (used / b.totalValue) * 100) : 0;
            const expired = new Date(b.validTill) < new Date();
            return (
              <div key={b.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{b.vendor}</p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                      Valid till {format(new Date(b.validTill), "dd MMM yyyy")}
                      {expired && <span className="text-red-400 ml-1">· expired</span>}
                      {" · "}{b.releases.length} release{b.releases.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button onClick={() => remove(b.id)} className="text-[var(--color-muted)] hover:text-red-400 shrink-0"><Trash2 size={14} /></button>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[var(--color-muted)]">Drawn {formatCurrency(used)} of {formatCurrency(b.totalValue)}</span>
                    <span className={remaining <= 0 ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>{formatCurrency(remaining)} left</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
                    <div className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-orange-500" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                  <input type="number" value={relAmt[b.id] ?? ""} onChange={e => setRelAmt(p => ({ ...p, [b.id]: e.target.value }))} placeholder="Release ₹" className={inpCls} />
                  <input value={relNote[b.id] ?? ""} onChange={e => setRelNote(p => ({ ...p, [b.id]: e.target.value }))} placeholder="Note (optional)" className={inpCls} />
                  <button onClick={() => release(b.id)} disabled={remaining <= 0} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">Draw</button>
                </div>

                {b.releases.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {b.releases.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-[11px] text-[var(--color-muted)]">
                        <span>{format(new Date(r.date), "dd MMM")}{r.note ? ` · ${r.note}` : ""}</span>
                        <span className="tabular-nums font-medium text-[var(--color-text)]">{formatCurrency(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #44 Vendor Spend Concentration / Single-Source Risk - flag vendors that
   take a risky share of category or total spend (dependency risk).
   ───────────────────────────────────────────────────────────────────────── */
function ConcentrationRisk() {
  const { store } = useApp();
  const { transactions } = store;
  const [threshold, setThreshold] = useFeatureState<number>("ven-concentration-threshold", 30);

  const analysis = useMemo(() => {
    const spend = transactions.filter(t => t.amount < 0 && t.counterparty);
    const total = spend.reduce((s, t) => s + Math.abs(t.amount), 0);

    const byVendor: Record<string, { spend: number; category: string }> = {};
    spend.forEach(t => {
      if (!byVendor[t.counterparty]) byVendor[t.counterparty] = { spend: 0, category: t.category };
      byVendor[t.counterparty].spend += Math.abs(t.amount);
    });

    const byCategory: Record<string, number> = {};
    spend.forEach(t => { byCategory[t.category] = (byCategory[t.category] ?? 0) + Math.abs(t.amount); });

    const vendors = Object.entries(byVendor).map(([name, d]) => {
      const catTotal = byCategory[d.category] || 1;
      return {
        name,
        category: d.category,
        spend: d.spend,
        totalShare: total > 0 ? (d.spend / total) * 100 : 0,
        catShare: (d.spend / catTotal) * 100,
      };
    }).sort((a, b) => b.spend - a.spend);

    // Herfindahl-Hirschman Index on total-share fractions (0-10000).
    const hhi = vendors.reduce((s, v) => s + Math.pow(v.totalShare, 2), 0);
    return { total, vendors, hhi };
  }, [transactions]);

  const flagged = analysis.vendors.filter(v => v.totalShare >= threshold || v.catShare >= 60);
  const hhiLabel = analysis.hhi >= 2500 ? "Highly concentrated" : analysis.hhi >= 1500 ? "Moderately concentrated" : "Diversified";
  const hhiColor = analysis.hhi >= 2500 ? "text-red-400" : analysis.hhi >= 1500 ? "text-orange-400" : "text-green-400";

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">When too much of your spend rides on one supplier, a disruption there hits you hard. This maps single-source dependency by total and category share, and scores overall concentration with the HHI index.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Concentration (HHI)", value: Math.round(analysis.hhi).toString(), color: hhiColor, sub: hhiLabel },
          { label: "Vendors Over Threshold", value: flagged.length.toString(), color: flagged.length > 0 ? "text-red-400" : "text-green-400", sub: `≥ ${threshold}% of spend` },
          { label: "Total Spend Mapped", value: formatCurrency(Math.round(analysis.total)), color: "text-[var(--color-primary)]", sub: `${analysis.vendors.length} vendors` },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[var(--color-muted)] mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-[var(--color-muted)]">Risk threshold (% of total spend)</label>
        <input type="range" min={10} max={60} step={5} value={threshold} onChange={e => setThreshold(parseInt(e.target.value, 10))} className="accent-[var(--color-primary)]" />
        <span className="text-sm font-semibold tabular-nums">{threshold}%</span>
      </div>

      {analysis.vendors.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Network size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No vendor spend to analyse yet. Import expense transactions to map concentration.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Category", "Spend", "% of Total", "% of Category", "Risk"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i <= 1 ? "text-left" : i === 5 ? "text-center" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {analysis.vendors.slice(0, 30).map(v => {
                const risky = v.totalShare >= threshold || v.catShare >= 60;
                return (
                  <tr key={v.name} className={`hover:bg-white/2 ${risky ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{v.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[v.category] ?? "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]"}`}>
                        {CATEGORY_LABEL[v.category] ?? v.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(Math.round(v.spend))}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${v.totalShare >= threshold ? "text-red-400 font-semibold" : "text-[var(--color-muted)]"}`}>{v.totalShare.toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${v.catShare >= 60 ? "text-orange-400 font-semibold" : "text-[var(--color-muted)]"}`}>{v.catShare.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-center">
                      {risky
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-950/30 text-red-400 border-red-800/30 inline-flex items-center gap-1"><AlertTriangle size={9} /> Single-source</span>
                        : <span className="text-[10px] text-green-400">OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #63 Vendor Statement Reconciliation - paste a vendor's statement lines and
   match them against your ledger (transactions) to surface gaps fast.
   ───────────────────────────────────────────────────────────────────────── */
function StatementReconciliation() {
  const { store } = useApp();
  const { transactions } = store;
  const [vendor, setVendor] = useState("");
  const [raw, setRaw] = useState("");
  const [tolerance, setTolerance] = useState("1");

  const knownVendors = useMemo(() =>
    Array.from(new Set(transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [transactions]);

  // Parse each non-empty line: take the last number on the line as the amount.
  const statementAmounts = useMemo(() => {
    return raw.split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const nums = line.replace(/,/g, "").match(/\d+(\.\d+)?/g);
      const amt = nums && nums.length > 0 ? parseFloat(nums[nums.length - 1]) : NaN;
      return { line, amount: isNaN(amt) ? 0 : amt };
    }).filter(x => x.amount > 0);
  }, [raw]);

  const ledgerAmounts = useMemo(() => {
    if (!vendor.trim()) return [];
    return transactions
      .filter(t => t.amount < 0 && t.counterparty === vendor.trim())
      .map(t => ({ id: t.id, date: t.date, amount: Math.abs(t.amount), desc: t.description }));
  }, [transactions, vendor]);

  const result = useMemo(() => {
    const tol = parseFloat(tolerance) || 0;
    const ledgerPool = ledgerAmounts.map(l => ({ ...l, used: false }));
    const matched: { stmt: number; ledger: number; date: string }[] = [];
    const unmatchedStmt: number[] = [];

    statementAmounts.forEach(s => {
      const hit = ledgerPool.find(l => !l.used && Math.abs(l.amount - s.amount) <= tol);
      if (hit) { hit.used = true; matched.push({ stmt: s.amount, ledger: hit.amount, date: hit.date }); }
      else unmatchedStmt.push(s.amount);
    });
    const unmatchedLedger = ledgerPool.filter(l => !l.used);

    const stmtTotal = statementAmounts.reduce((s, x) => s + x.amount, 0);
    const ledgerTotal = ledgerAmounts.reduce((s, x) => s + x.amount, 0);
    return { matched, unmatchedStmt, unmatchedLedger, stmtTotal, ledgerTotal, diff: stmtTotal - ledgerTotal };
  }, [statementAmounts, ledgerAmounts, tolerance]);

  const hasData = vendor.trim() && statementAmounts.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Paste the line items off a vendor's statement of account, pick the vendor, and we'll match each amount against your own ledger - surfacing entries on their statement you haven't booked (and bills you've recorded that they've missed). This is the month-end reconciliation that eats hours by hand.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2">
          <input list="recon-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor (matches your ledger) *" className={inpCls} />
          <datalist id="recon-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input type="number" value={tolerance} onChange={e => setTolerance(e.target.value)} placeholder="Match tolerance ₹" className={inpCls} />
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={5} placeholder={"Paste statement lines - one per row. We read the last number on each line as the amount.\ne.g.  12 Apr  Invoice INV-204   45,000"} className={`${inpCls} font-mono text-xs resize-y`} />
        <p className="text-[11px] text-[var(--color-muted)]">{statementAmounts.length} statement line{statementAmounts.length !== 1 ? "s" : ""} parsed · {ledgerAmounts.length} ledger entr{ledgerAmounts.length !== 1 ? "ies" : "y"} for this vendor</p>
      </div>

      {!hasData ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileCheck2 size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Pick a vendor and paste their statement to reconcile against your ledger.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Matched", value: result.matched.length.toString(), color: "text-green-400" },
              { label: "On Statement Only", value: result.unmatchedStmt.length.toString(), color: result.unmatchedStmt.length > 0 ? "text-orange-400" : "text-[var(--color-muted)]" },
              { label: "In Ledger Only", value: result.unmatchedLedger.length.toString(), color: result.unmatchedLedger.length > 0 ? "text-blue-400" : "text-[var(--color-muted)]" },
              { label: "Balance Difference", value: formatCurrency(Math.round(Math.abs(result.diff))), color: Math.abs(result.diff) > 1 ? "text-red-400" : "text-green-400" },
            ].map(s => (
              <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-[var(--color-surface)] border border-orange-800/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-orange-400 mb-2">On their statement, not in your books</p>
              {result.unmatchedStmt.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Nothing - every statement line is booked.</p>
              ) : (
                <ul className="space-y-1">
                  {result.unmatchedStmt.map((a, i) => <li key={i} className="text-xs flex justify-between"><span className="text-[var(--color-muted)]">Unbooked entry</span><span className="tabular-nums font-medium">{formatCurrency(a)}</span></li>)}
                </ul>
              )}
            </div>
            <div className="bg-[var(--color-surface)] border border-blue-800/30 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-400 mb-2">In your books, not on their statement</p>
              {result.unmatchedLedger.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">Nothing - they've captured every payment.</p>
              ) : (
                <ul className="space-y-1">
                  {result.unmatchedLedger.map(l => <li key={l.id} className="text-xs flex justify-between gap-2"><span className="text-[var(--color-muted)] truncate">{format(new Date(l.date), "dd MMM")} · {l.desc}</span><span className="tabular-nums font-medium shrink-0">{formatCurrency(l.amount)}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #8 / #11 MSME Interest Liability (43B(h)) - estimate the compound interest
   owed on MSME dues paid beyond the 45-day limit at 3× the RBI bank rate.
   ───────────────────────────────────────────────────────────────────────── */
interface MsmeDue { id: string; vendor: string; amount: string; acceptedOn: string; }

function MsmeInterestLiability() {
  const [dues, setDues] = useFeatureState<MsmeDue[]>("ven-msme-dues", []);
  const [bankRate, setBankRate] = useFeatureState<number>("ven-msme-bank-rate", 6.5);
  // Live 43B(h) radar: real open bills (Bills tab, posted to the books) to MSME-tagged vendors.
  const { aging } = useApAging();

  const add = () => setDues(prev => [{ id: crypto.randomUUID(), vendor: "", amount: "", acceptedOn: new Date().toISOString().split("T")[0] }, ...prev]);
  const update = (id: string, patch: Partial<MsmeDue>) => setDues(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  const remove = (id: string) => setDues(prev => prev.filter(d => d.id !== id));

  // Section 16 MSMED Act: interest = 3× RBI bank rate, compounded monthly,
  // on amounts unpaid beyond 45 days from acceptance. Disallowed under 43B(h).
  const annualRate = bankRate * 3;
  const today = new Date();

  const computed = useMemo(() => dues.map(d => {
    const amt = parseFloat(d.amount) || 0;
    const accepted = new Date(d.acceptedOn);
    const daysHeld = Math.floor((today.getTime() - accepted.getTime()) / 86400000);
    const overdueDays = Math.max(0, daysHeld - 45);
    const months = overdueDays / 30;
    const interest = amt > 0 && months > 0 ? amt * (Math.pow(1 + annualRate / 100 / 12, months) - 1) : 0;
    return { ...d, amt, overdueDays, interest };
  }), [dues, annualRate, today]);

  const totalInterest = computed.reduce((s, c) => s + c.interest, 0);
  const totalPrincipal = computed.reduce((s, c) => s + c.amt, 0);
  const breachCount = computed.filter(c => c.overdueDays > 0).length;

  // ── Live 43B(h) radar from real payables ────────────────────────────────────
  // Each unpaid bill to an MSME vendor runs against ITS OWN clock: 15 days with no
  // written agreement, up to 45 with one (we read the vendor's agreed payment terms,
  // capped at 45). Past the deadline the expense is disallowed (added back to taxable
  // income, ~25% tax) AND attracts the 3× penal interest above - both real cash.
  const TAX_RATE = 0.25;
  const auto = useMemo(() => {
    const day = 86400000;
    const rows: { id: string; vendor: string; amount: number; limit: number; deadline: Date; daysToDeadline: number; overdueDays: number; interest: number }[] = [];
    for (const v of aging.vendors) {
      // 43B(h) fires only for Micro & Small — Medium is out of scope. Legacy MSME rows with no
      // category recorded stay in scope (treated as small until the owner classifies them).
      if (!v.isMsme || v.msmeCategory === "medium") continue;
      const limit = v.paymentTermsDays && v.paymentTermsDays > 0 ? Math.min(v.paymentTermsDays, 45) : 15;
      for (const b of v.bills) {
        if (!(b.outstanding > 0)) continue; // fully settled - no forward exposure
        const deadline = new Date(new Date(b.date).getTime() + limit * day);
        const daysToDeadline = Math.floor((deadline.getTime() - today.getTime()) / day);
        const overdueDays = daysToDeadline < 0 ? -daysToDeadline : 0;
        const months = overdueDays / 30;
        const interest = overdueDays > 0 ? b.outstanding * (Math.pow(1 + annualRate / 100 / 12, months) - 1) : 0;
        rows.push({ id: b.voucherId, vendor: v.vendorName, amount: b.outstanding, limit, deadline, daysToDeadline, overdueDays, interest });
      }
    }
    return rows.sort((a, b) => a.daysToDeadline - b.daysToDeadline);
  }, [aging, today, annualRate]);

  const autoBreached = auto.filter(r => r.daysToDeadline < 0);
  const autoDisallow = autoBreached.reduce((s, r) => s + r.amount, 0); // expense added back to income
  const autoInterest = auto.reduce((s, r) => s + r.interest, 0);
  const autoTaxHit = autoDisallow * TAX_RATE;
  const autoCashAtRisk = autoTaxHit + autoInterest;
  const nextDeadline = auto.find(r => r.daysToDeadline >= 0);

  return (
    <div className="space-y-4">
      <div className="bg-red-950/20 border border-red-800/30 rounded-lg px-4 py-3 flex items-start gap-3">
        <Gavel size={16} className="text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-300">Section 16 MSMED Act - Interest on Delayed Payment</p>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">Dues to a Micro/Small vendor unpaid beyond 45 days attract compound interest at 3× the RBI bank rate, compounded monthly. This interest is <span className="font-medium">not</span> tax-deductible (Sec 23). Estimate the running liability per vendor below.</p>
        </div>
      </div>

      {/* Live 43B(h) radar - auto-detected from real unpaid MSME bills */}
      {auto.length > 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} className="text-[var(--color-primary)]" />
            <h3 className="text-sm font-semibold">Live 43B(h) exposure - from your unpaid MSME bills</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cash at risk", value: formatCurrency(Math.round(autoCashAtRisk)), color: autoCashAtRisk > 0 ? "text-red-400" : "text-green-400", sub: "disallowance tax + interest" },
              { label: "Disallowed expense", value: formatCurrency(Math.round(autoDisallow)), color: autoDisallow > 0 ? "text-orange-400" : "text-green-400", sub: `${autoBreached.length} bill(s) past deadline` },
              { label: "Non-deductible interest", value: formatCurrency(Math.round(autoInterest)), color: autoInterest > 0 ? "text-orange-400" : "text-green-400", sub: `@ ${annualRate.toFixed(1)}% p.a.` },
              { label: "Next deadline", value: nextDeadline ? `${nextDeadline.daysToDeadline}d` : "-", color: nextDeadline && nextDeadline.daysToDeadline <= 7 ? "text-red-400" : "text-[var(--color-text)]", sub: nextDeadline ? nextDeadline.vendor : "all clear" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-[11px] text-[var(--color-muted)]">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color}`}>{c.value}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-[var(--color-border)]">
                <tr>{["Pay before", "MSME vendor", "Amount", "Status", "Interest if unpaid"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {auto.slice(0, 25).map(r => (
                  <tr key={r.id} className="hover:bg-white/2">
                    <td className="px-3 py-2 text-xs">{r.deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td className="px-3 py-2 font-medium">{r.vendor}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      {r.daysToDeadline < 0
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-950/30 text-red-400 border-red-800/40">{r.overdueDays}d overdue - disallowed</span>
                        : r.daysToDeadline <= 7
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-orange-950/30 text-orange-400 border-orange-800/40">pay in {r.daysToDeadline}d</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded border bg-green-950/20 text-green-400 border-green-800/30">{r.daysToDeadline}d left</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-orange-400">{r.interest > 0 ? formatCurrency(Math.round(r.interest)) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">Auto-tracked from unpaid bills (Bills tab) to vendors tagged MSME. Clock: 15 days, or up to 45 with a written agreement (your saved payment terms). Pay the top rows first to protect the cash shown above.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3 text-xs text-[var(--color-muted)]">
          No MSME payables detected yet. Add unpaid bills in the <span className="text-[var(--color-text)] font-medium">Bills</span> tab and tag those vendors as MSME (Directory → edit a vendor) to auto-track your 43B(h) exposure here. You can also track dues manually below.
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-[var(--color-muted)]">RBI bank rate (%)</label>
        <input type="number" step="0.25" value={bankRate} onChange={e => setBankRate(parseFloat(e.target.value) || 0)} className={`${inpCls} max-w-[100px]`} />
        <span className="text-xs text-[var(--color-muted)]">Penal rate applied: <span className="font-semibold text-[var(--color-text)]">{annualRate.toFixed(2)}% p.a.</span></span>
        <button onClick={add} className="flex items-center gap-1.5 text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-2 rounded-lg hover:opacity-90 ml-auto">
          <Plus size={13} /> Add MSME Due
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tracked Principal", value: formatCurrency(Math.round(totalPrincipal)), color: "text-[var(--color-primary)]" },
          { label: "Dues Past 45 Days", value: breachCount.toString(), color: breachCount > 0 ? "text-red-400" : "text-green-400" },
          { label: "Est. Interest Liability", value: formatCurrency(Math.round(totalInterest)), color: totalInterest > 0 ? "text-orange-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {dues.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Gavel size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No MSME dues tracked. Add a due with its acceptance date to estimate the 43B(h) interest exposure.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["MSME Vendor", "Due Amount", "Accepted On", "Overdue (>45d)", "Est. Interest", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {computed.map(c => (
                <tr key={c.id} className="hover:bg-white/2">
                  <td className="px-4 py-3"><input value={c.vendor} onChange={e => update(c.id, { vendor: e.target.value })} placeholder="Vendor name" className={`${inpCls} min-w-[140px]`} /></td>
                  <td className="px-4 py-3 text-right"><input type="number" value={c.amount} onChange={e => update(c.id, { amount: e.target.value })} placeholder="₹" className={`${inpCls} max-w-[120px] text-right`} /></td>
                  <td className="px-4 py-3 text-right"><input type="date" value={c.acceptedOn} onChange={e => update(c.id, { acceptedOn: e.target.value })} className={`${inpCls} max-w-[150px]`} /></td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${c.overdueDays > 0 ? "text-red-400" : "text-green-400"}`}>{c.overdueDays > 0 ? `${c.overdueDays}d` : "Within limit"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-400">{formatCurrency(Math.round(c.interest))}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(c.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                <td className="px-4 py-3 font-semibold" colSpan={4}>Total estimated non-deductible interest</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold text-orange-400">{formatCurrency(Math.round(totalInterest))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #42 / #76 Procurement Savings Tracker - log realised savings (negotiated
   discounts, avoided spend, early-pay capture) and total the impact.
   ───────────────────────────────────────────────────────────────────────── */
type SavingType = "negotiation" | "early-pay" | "consolidation" | "avoided" | "rebate";
const SAVING_META: Record<SavingType, { label: string; cls: string }> = {
  "negotiation":   { label: "Negotiated rate", cls: "bg-blue-950/30 text-blue-400 border-blue-800/30" },
  "early-pay":     { label: "Early-pay discount", cls: "bg-green-950/30 text-green-400 border-green-800/30" },
  "consolidation": { label: "Consolidation", cls: "bg-purple-950/30 text-purple-400 border-purple-800/30" },
  "avoided":       { label: "Avoided spend", cls: "bg-orange-950/30 text-orange-400 border-orange-800/30" },
  "rebate":        { label: "Rebate / credit", cls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
};

interface SavingEntry { id: string; vendor: string; type: SavingType; baseline: number; final: number; date: string; note: string; }

function SavingsTracker() {
  const { store } = useApp();
  const [entries, setEntries] = useFeatureState<SavingEntry[]>("ven-savings-entries", []);
  const [vendor, setVendor] = useState("");
  const [type, setType] = useState<SavingType>("negotiation");
  const [baseline, setBaseline] = useState("");
  const [final, setFinal] = useState("");
  const [note, setNote] = useState("");

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    const b = parseFloat(baseline) || 0;
    const f = parseFloat(final) || 0;
    if (!vendor.trim() || b <= 0) { toast.error("Enter vendor and a baseline cost"); return; }
    if (f > b) { toast.error("Final cost should be at or below the baseline"); return; }
    const e: SavingEntry = { id: crypto.randomUUID(), vendor: vendor.trim(), type, baseline: b, final: f, date: new Date().toISOString().split("T")[0], note: note.trim() };
    setEntries(prev => [e, ...prev]);
    setVendor(""); setBaseline(""); setFinal(""); setNote("");
    toast.success(`${formatCurrency(b - f)} saved logged for ${e.vendor}`);
  };
  const remove = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));

  const totalSaved = entries.reduce((s, e) => s + (e.baseline - e.final), 0);
  const totalBaseline = entries.reduce((s, e) => s + e.baseline, 0);
  const savingsRate = totalBaseline > 0 ? (totalSaved / totalBaseline) * 100 : 0;

  const ytdSaved = useMemo(() => {
    const yr = new Date().getFullYear();
    return entries.filter(e => new Date(e.date).getFullYear() === yr).reduce((s, e) => s + (e.baseline - e.final), 0);
  }, [entries]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Procurement saves money in ways that never show on the P&L - a negotiated rate cut, an early-pay discount, a consolidated contract. Log each win against its baseline cost here so you can prove the function pays for itself.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Saved", value: formatCurrency(Math.round(totalSaved)), color: "text-green-400" },
          { label: "Saved This Year", value: formatCurrency(Math.round(ytdSaved)), color: "text-[var(--color-primary)]" },
          { label: "Avg Savings Rate", value: `${savingsRate.toFixed(1)}%`, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><PiggyBank size={15} className="text-[var(--color-primary)]" /> Log a Saving</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input list="sav-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="sav-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <select value={type} onChange={e => setType(e.target.value as SavingType)} className={inpCls}>
            {(Object.keys(SAVING_META) as SavingType[]).map(t => <option key={t} value={t}>{SAVING_META[t].label}</option>)}
          </select>
          <input type="number" value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="Baseline cost ₹ *" className={inpCls} />
          <input type="number" value={final} onChange={e => setFinal(e.target.value)} placeholder="Final cost ₹ (0 if avoided)" className={inpCls} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={inpCls} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Log Saving</button>
      </div>

      {entries.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <PiggyBank size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No savings logged yet. Record a negotiated rate, early-pay discount, or avoided spend to start tracking.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Type", "Baseline", "Final", "Saved", "Date", ""].map((h, i) => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i <= 1 ? "text-left" : i === 5 ? "text-right" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {entries.map(e => {
                const saved = e.baseline - e.final;
                const pct = e.baseline > 0 ? (saved / e.baseline) * 100 : 0;
                return (
                  <tr key={e.id} className="hover:bg-white/2">
                    <td className="px-4 py-3">
                      <p className="font-medium">{e.vendor}</p>
                      {e.note && <p className="text-[10px] text-[var(--color-muted)]">{e.note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${SAVING_META[e.type].cls}`}>{SAVING_META[e.type].label}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(e.baseline))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(e.final))}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-green-400">{formatCurrency(Math.round(saved))} <span className="text-[10px] text-[var(--color-muted)]">({pct.toFixed(0)}%)</span></td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--color-muted)]">{format(new Date(e.date), "dd MMM")}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TDS Form-16A Issuance Tracker - track quarterly TDS certificates owed to vendors.
   ───────────────────────────────────────────────────────────────────────── */
type F16Status = "pending" | "downloaded" | "issued";
interface F16Cert { id: string; vendor: string; pan: string; quarter: string; fy: string; tdsAmount: number; status: F16Status; }

const F16_STATUS_META: Record<F16Status, { label: string; cls: string }> = {
  pending:    { label: "Pending",    cls: "bg-[var(--color-accent)] text-[var(--color-muted)] border-[var(--color-border)]" },
  downloaded: { label: "Downloaded", cls: "bg-blue-950/30 text-blue-400 border-blue-800/30" },
  issued:     { label: "Issued",     cls: "bg-green-950/30 text-green-400 border-green-800/30" },
};
const F16_QUARTERS = ["Q1 (Apr-Jun)", "Q2 (Jul-Sep)", "Q3 (Oct-Dec)", "Q4 (Jan-Mar)"] as const;

function Form16ATracker() {
  const { store } = useApp();
  const [certs, setCerts] = useFeatureState<F16Cert[]>("ven-f16a-certs", []);
  const [vendor, setVendor] = useState("");
  const [pan, setPan] = useState("");
  const [quarter, setQuarter] = useState<string>(F16_QUARTERS[0]);
  const [fy, setFy] = useState("2025-26");
  const [tds, setTds] = useState("");

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    const amt = parseFloat(tds) || 0;
    if (!vendor.trim() || amt <= 0) { toast.error("Enter vendor and TDS amount"); return; }
    const c: F16Cert = { id: crypto.randomUUID(), vendor: vendor.trim(), pan: pan.trim().toUpperCase(), quarter, fy: fy.trim(), tdsAmount: amt, status: "pending" };
    setCerts(prev => [c, ...prev]);
    setVendor(""); setPan(""); setTds("");
    toast.success(`Form 16A queued for ${c.vendor}`);
  };
  const cycle = (id: string) => setCerts(prev => prev.map(c => c.id === id ? { ...c, status: c.status === "pending" ? "downloaded" : c.status === "downloaded" ? "issued" : "pending" } : c));
  const remove = (id: string) => setCerts(prev => prev.filter(c => c.id !== id));

  const pending = certs.filter(c => c.status !== "issued").length;
  const totalTds = certs.reduce((s, c) => s + c.tdsAmount, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Every quarter you must issue Form 16A (TDS certificate) to vendors you deducted tax from, within 15 days of filing the TDS return. Miss it and you face a ₹100/day penalty per certificate. Track each one from TRACES download to handover here.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Certificates", value: certs.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Awaiting Issue", value: pending.toString(), color: pending > 0 ? "text-orange-400" : "text-green-400" },
          { label: "Total TDS Covered", value: formatCurrency(Math.round(totalTds)), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileBadge size={15} className="text-[var(--color-primary)]" /> Add Certificate</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input list="f16-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="f16-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input value={pan} onChange={e => setPan(e.target.value)} placeholder="Vendor PAN" className={inpCls} />
          <select value={quarter} onChange={e => setQuarter(e.target.value)} className={inpCls}>
            {F16_QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <input value={fy} onChange={e => setFy(e.target.value)} placeholder="FY (e.g. 2025-26)" className={inpCls} />
          <input type="number" value={tds} onChange={e => setTds(e.target.value)} placeholder="TDS deducted ₹ *" className={inpCls} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add Certificate</button>
      </div>

      {certs.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <FileBadge size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No certificates tracked. Add one per vendor per quarter to stay ahead of the 15-day issuance deadline.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Quarter", "TDS", "Status", ""].map(h => (
                  <th key={h || "act"} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${h === "Vendor" || h === "Quarter" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {certs.map(c => (
                <tr key={c.id} className="hover:bg-white/2">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.vendor}</p>
                    {c.pan && <p className="text-[10px] text-[var(--color-muted)] font-mono">{c.pan}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{c.quarter} · {c.fy}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(Math.round(c.tdsAmount))}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => cycle(c.id)} className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${F16_STATUS_META[c.status].cls}`}>{F16_STATUS_META[c.status].label}</button>
                  </td>
                  <td className="px-4 py-3 text-right"><button onClick={() => remove(c.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-muted)]">Tip: click a status chip to advance Pending → Downloaded → Issued.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Vendor Rebate / Volume-Discount Tracker - accrue rebates earned against slabs.
   ───────────────────────────────────────────────────────────────────────── */
interface RebateDeal { id: string; vendor: string; threshold: number; ratePct: number; ytdPurchase: number; }

function RebateTracker() {
  const { store } = useApp();
  const [deals, setDeals] = useFeatureState<RebateDeal[]>("ven-rebate-deals", []);
  const [vendor, setVendor] = useState("");
  const [threshold, setThreshold] = useState("");
  const [rate, setRate] = useState("");

  const spendByVendor = useMemo(() => {
    const m: Record<string, number> = {};
    store.transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => { m[t.counterparty] = (m[t.counterparty] ?? 0) + Math.abs(t.amount); });
    return m;
  }, [store.transactions]);
  const knownVendors = useMemo(() => Object.keys(spendByVendor).sort(), [spendByVendor]);

  const add = () => {
    const th = parseFloat(threshold) || 0;
    const rt = parseFloat(rate) || 0;
    if (!vendor.trim() || th <= 0 || rt <= 0) { toast.error("Enter vendor, threshold and rebate rate"); return; }
    const d: RebateDeal = { id: crypto.randomUUID(), vendor: vendor.trim(), threshold: th, ratePct: rt, ytdPurchase: Math.round(spendByVendor[vendor.trim()] ?? 0) };
    setDeals(prev => [d, ...prev]);
    setVendor(""); setThreshold(""); setRate("");
    toast.success(`Rebate slab added for ${d.vendor}`);
  };
  const refresh = (id: string, name: string) => { setDeals(prev => prev.map(d => d.id === id ? { ...d, ytdPurchase: Math.round(spendByVendor[name] ?? 0) } : d)); toast.success("YTD purchase refreshed from transactions"); };
  const remove = (id: string) => setDeals(prev => prev.filter(d => d.id !== id));

  const earned = (d: RebateDeal) => d.ytdPurchase >= d.threshold ? (d.ytdPurchase * d.ratePct) / 100 : 0;
  const totalEarned = deals.reduce((s, d) => s + earned(d), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Many suppliers offer a year-end rebate once you cross a purchase slab - money that's easy to forget to claim. Define each slab and track how close you are; rebate accrues once YTD purchases clear the threshold.</p>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Active Slabs", value: deals.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Rebate Accrued", value: formatCurrency(Math.round(totalEarned)), color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><BadgePercent size={15} className="text-[var(--color-primary)]" /> Add Rebate Slab</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input list="reb-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="reb-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="Purchase threshold ₹ *" className={inpCls} />
          <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="Rebate % *" className={inpCls} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add Slab</button>
      </div>

      {deals.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <BadgePercent size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No rebate slabs yet. Add a supplier's volume-discount terms to start accruing what you've earned.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map(d => {
            const pct = d.threshold > 0 ? Math.min(100, (d.ytdPurchase / d.threshold) * 100) : 0;
            const hit = d.ytdPurchase >= d.threshold;
            return (
              <div key={d.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium text-sm">{d.vendor}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{d.ratePct}% above {formatCurrency(Math.round(d.threshold))} · YTD {formatCurrency(d.ytdPurchase)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${hit ? "text-green-400" : "text-[var(--color-muted)]"}`}>{hit ? formatCurrency(Math.round(earned(d))) : "-"}</span>
                    <button onClick={() => refresh(d.id, d.vendor)} className="text-[10px] text-[var(--color-primary)] hover:underline">Refresh</button>
                    <button onClick={() => remove(d.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full ${hit ? "bg-green-400" : "bg-[var(--color-primary)]"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-1">{hit ? "Slab reached - rebate accruing" : `${(100 - pct).toFixed(0)}% to go (${formatCurrency(Math.round(d.threshold - d.ytdPurchase))} more)`}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Vendor Watchlist / Blacklist - flag risky vendors and warn before new POs.
   ───────────────────────────────────────────────────────────────────────── */
type FlagLevel = "watch" | "hold" | "blacklist";
interface VendorFlag { id: string; vendor: string; level: FlagLevel; reason: string; date: string; }

const FLAG_META: Record<FlagLevel, { label: string; cls: string }> = {
  watch:     { label: "Watch",     cls: "bg-yellow-950/30 text-yellow-400 border-yellow-800/30" },
  hold:      { label: "On Hold",   cls: "bg-orange-950/30 text-orange-400 border-orange-800/30" },
  blacklist: { label: "Blacklist", cls: "bg-red-950/30 text-red-400 border-red-800/30" },
};

function VendorWatchlist() {
  const { store } = useApp();
  const [flags, setFlags] = useFeatureState<VendorFlag[]>("ven-watchlist-flags", []);
  const [vendor, setVendor] = useState("");
  const [level, setLevel] = useState<FlagLevel>("watch");
  const [reason, setReason] = useState("");

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    if (!vendor.trim() || !reason.trim()) { toast.error("Enter vendor and a reason"); return; }
    const f: VendorFlag = { id: crypto.randomUUID(), vendor: vendor.trim(), level, reason: reason.trim(), date: new Date().toISOString().split("T")[0] };
    setFlags(prev => [f, ...prev]);
    setVendor(""); setReason("");
    toast.success(`${vendor.trim()} added to ${FLAG_META[level].label}`);
  };
  const remove = (id: string) => setFlags(prev => prev.filter(f => f.id !== id));

  const blacklisted = flags.filter(f => f.level === "blacklist").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Keep a living record of vendors you're cautious about - quality slips, compliance gaps, disputes. Flag them Watch, On Hold, or Blacklist so anyone raising a PO sees the risk before they commit spend.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Flagged Vendors", value: flags.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Blacklisted", value: blacklisted.toString(), color: blacklisted > 0 ? "text-red-400" : "text-green-400" },
          { label: "On Watch / Hold", value: (flags.length - blacklisted).toString(), color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Ban size={15} className="text-[var(--color-primary)]" /> Flag a Vendor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input list="wl-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
          <datalist id="wl-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          <select value={level} onChange={e => setLevel(e.target.value as FlagLevel)} className={inpCls}>
            {(Object.keys(FLAG_META) as FlagLevel[]).map(l => <option key={l} value={l}>{FLAG_META[l].label}</option>)}
          </select>
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason *" className={inpCls} />
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add Flag</button>
      </div>

      {flags.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Ban size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No vendors flagged. Add a watch, hold, or blacklist entry to warn your team before they raise a PO.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map(f => (
            <div key={f.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{f.vendor}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${FLAG_META[f.level].cls}`}>{FLAG_META[f.level].label}</span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-1">{f.reason}</p>
                <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Flagged {format(new Date(f.date), "dd MMM yyyy")}</p>
              </div>
              <button onClick={() => remove(f.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Payment-Mode Mix - breakdown of how vendor payments leave the business.
   ───────────────────────────────────────────────────────────────────────── */
const PAY_MODE_META: Record<string, { label: string; cls: string; bar: string }> = {
  upi:    { label: "UPI",          cls: "text-purple-400", bar: "bg-purple-400" },
  neft:   { label: "NEFT / RTGS",  cls: "text-blue-400",   bar: "bg-blue-400" },
  cheque: { label: "Cheque",       cls: "text-orange-400", bar: "bg-orange-400" },
  cash:   { label: "Cash",         cls: "text-red-400",    bar: "bg-red-400" },
  card:   { label: "Card",         cls: "text-green-400",  bar: "bg-green-400" },
};
function classifyMode(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes("upi") || d.includes("@")) return "upi";
  if (d.includes("neft") || d.includes("rtgs") || d.includes("imps")) return "neft";
  if (d.includes("chq") || d.includes("cheque")) return "cheque";
  if (d.includes("cash") || d.includes("atm")) return "cash";
  if (d.includes("card") || d.includes("pos")) return "card";
  return "neft";
}

function PaymentModeMix() {
  const { store } = useApp();

  const breakdown = useMemo(() => {
    const m: Record<string, { count: number; total: number }> = {};
    store.transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      const mode = classifyMode(`${t.description ?? ""} ${t.counterparty ?? ""}`);
      const cur = m[mode] ?? { count: 0, total: 0 };
      m[mode] = { count: cur.count + 1, total: cur.total + Math.abs(t.amount) };
    });
    const grand = Object.values(m).reduce((s, v) => s + v.total, 0);
    return (Object.keys(PAY_MODE_META) as string[])
      .map(k => ({ mode: k, count: m[k]?.count ?? 0, total: m[k]?.total ?? 0, pct: grand > 0 ? ((m[k]?.total ?? 0) / grand) * 100 : 0 }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.total - a.total);
  }, [store.transactions]);

  const grandTotal = breakdown.reduce((s, r) => s + r.total, 0);
  const cashRow = breakdown.find(r => r.mode === "cash");
  const cashPct = grandTotal > 0 && cashRow ? (cashRow.total / grandTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">How your vendor money actually leaves the business - inferred from transaction descriptions. A high cash share is a red flag for both fraud control and the ₹10,000/payment cash-expense disallowance under Section 40A(3).</p>

      {breakdown.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CreditCard size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No vendor payments found. Import bank transactions to see your payment-mode mix.</p>
        </div>
      ) : (
        <>
          {cashPct > 15 && (
            <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{cashPct.toFixed(0)}% of vendor payments look like cash - review against the Section 40A(3) ₹10,000 per-payment limit to avoid disallowed expenses.</p>
            </div>
          )}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><CreditCard size={15} className="text-[var(--color-primary)]" /> Mode Breakdown</h3>
            {breakdown.map(r => {
              const meta = PAY_MODE_META[r.mode];
              return (
                <div key={r.mode}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={`font-medium ${meta.cls}`}>{meta.label}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{formatCurrency(Math.round(r.total))} · {r.count} txns · {r.pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className={`h-full ${meta.bar}`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-muted)]">Total vendor outflow: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(Math.round(grandTotal))}</span></p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #53 / #54 Recurring Bill & Subscription Tracker - detect vendors charged on
   a regular cadence (rent, utilities, SaaS), project the monthly & annual
   run-rate, and flag tools that look dormant (no charge in 60+ days).
   ───────────────────────────────────────────────────────────────────────── */
function RecurringBillTracker() {
  const { store } = useApp();

  const recurs = useMemo(() => {
    const map: Record<string, { dates: string[]; amounts: number[]; category: string }> = {};
    store.transactions.filter(t => t.amount < 0 && t.counterparty).forEach(t => {
      const cur = map[t.counterparty] ?? { dates: [], amounts: [], category: t.category };
      cur.dates.push(t.date);
      cur.amounts.push(Math.abs(t.amount));
      map[t.counterparty] = cur;
    });
    const today = new Date();
    return Object.entries(map)
      .map(([vendor, { dates, amounts, category }]) => {
        const sorted = [...dates].sort();
        const n = sorted.length;
        if (n < 2) return null;
        // average gap between consecutive charges (days)
        let gapSum = 0;
        for (let i = 1; i < n; i++) {
          gapSum += (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
        }
        const avgGap = gapSum / (n - 1);
        // treat 25-95 day cadence (monthly-ish/quarterly) as recurring
        if (avgGap < 25 || avgGap > 95) return null;
        const avgAmt = amounts.reduce((s, a) => s + a, 0) / n;
        const monthly = avgAmt * (30 / avgGap);
        const lastDate = sorted[n - 1];
        const daysSinceLast = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
        const dormant = daysSinceLast > Math.max(60, avgGap * 2);
        return { vendor, category, charges: n, avgAmt, avgGap, monthly, lastDate, daysSinceLast, dormant };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.monthly - a.monthly);
  }, [store.transactions]);

  const monthlyRunRate = recurs.filter(r => !r.dormant).reduce((s, r) => s + r.monthly, 0);
  const annualRunRate = monthlyRunRate * 12;
  const dormantN = recurs.filter(r => r.dormant).length;
  const dormantAnnual = recurs.filter(r => r.dormant).reduce((s, r) => s + r.monthly * 12, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Detects vendors you pay on a regular cadence - rent, utilities, SaaS - from your transaction history, and projects the committed run-rate. Subscriptions with no charge in months are flagged as possibly dormant so you can cancel the dead ones.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Monthly Run-Rate", value: formatCurrency(Math.round(monthlyRunRate)), color: "text-orange-400" },
          { label: "Annual Run-Rate", value: formatCurrency(Math.round(annualRunRate)), color: "text-red-400" },
          { label: "Possibly Dormant", value: `${dormantN} · ${formatCurrency(Math.round(dormantAnnual))}/yr`, color: dormantN > 0 ? "text-yellow-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {recurs.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Repeat size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No recurring bills detected yet. Import a few months of transactions so a monthly cadence can be spotted.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Cadence", "Avg Charge", "Est. Monthly", "Last Charged", "Status"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i >= 2 && i <= 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {recurs.map(r => (
                <tr key={r.vendor} className={`hover:bg-white/2 ${r.dormant ? "opacity-70" : ""}`}>
                  <td className="px-4 py-3 font-medium">{r.vendor}<span className="block text-[10px] text-[var(--color-muted)]">{r.charges} charges</span></td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">~ every {Math.round(r.avgGap)}d</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Math.round(r.avgAmt))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-400">{formatCurrency(Math.round(r.monthly))}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(r.lastDate), "dd MMM")} <span className="text-[10px]">({r.daysSinceLast}d ago)</span></td>
                  <td className="px-4 py-3">
                    {r.dormant ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-yellow-950/30 text-yellow-400 border-yellow-800/30 w-fit flex items-center gap-1"><AlertTriangle size={10} /> Dormant?</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-950/30 text-green-400 border-green-800/30 w-fit flex items-center gap-1"><Repeat size={10} /> Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
            <p className="text-xs text-[var(--color-muted)]">{recurs.length} recurring vendors · review dormant ones to stop paying for tools you no longer use.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #65 Landed Cost Allocation - spread freight, customs duty, insurance and
   other charges across received line items (by value or by quantity) to get
   the true per-unit landed cost for inventory valuation.
   ───────────────────────────────────────────────────────────────────────── */
interface LandedLine { id: string; item: string; qty: number; unitCost: number; }
type AllocBasis = "value" | "qty";

function LandedCostCalculator() {
  const [lines, setLines] = useState<LandedLine[]>([{ id: crypto.randomUUID(), item: "", qty: 1, unitCost: 0 }]);
  const [freight, setFreight] = useState("");
  const [duty, setDuty] = useState("");
  const [insurance, setInsurance] = useState("");
  const [other, setOther] = useState("");
  const [basis, setBasis] = useState<AllocBasis>("value");

  const numInp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--color-primary)] w-full";

  const valid = lines.filter(l => l.item.trim() && l.qty > 0 && l.unitCost >= 0);
  const goodsValue = valid.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const totalQty = valid.reduce((s, l) => s + l.qty, 0);
  const addOns = (parseFloat(freight) || 0) + (parseFloat(duty) || 0) + (parseFloat(insurance) || 0) + (parseFloat(other) || 0);
  const grandTotal = goodsValue + addOns;

  const allocated = valid.map(l => {
    const lineValue = l.qty * l.unitCost;
    const share = basis === "value"
      ? (goodsValue > 0 ? lineValue / goodsValue : 0)
      : (totalQty > 0 ? l.qty / totalQty : 0);
    const allocatedAddOn = addOns * share;
    const landedTotal = lineValue + allocatedAddOn;
    const landedUnit = l.qty > 0 ? landedTotal / l.qty : 0;
    const uplift = l.unitCost > 0 ? (landedUnit - l.unitCost) / l.unitCost * 100 : 0;
    return { ...l, lineValue, allocatedAddOn, landedTotal, landedUnit, uplift };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Freight, customs duty and insurance are real costs of your goods, but they arrive on separate bills. Allocate those charges across the received items - by value or by quantity - to book inventory at its true landed cost instead of the bare invoice price.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Received Items</h3>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.id} className="grid grid-cols-[1fr_70px_100px_auto] gap-2 items-center">
              <input value={l.item} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} placeholder="Item description" className={numInp} />
              <input type="number" min="0" value={l.qty} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} placeholder="Qty" className={numInp} />
              <input type="number" min="0" value={l.unitCost} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, unitCost: parseFloat(e.target.value) || 0 } : x))} placeholder="Unit cost" className={numInp} />
              <button onClick={() => setLines(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)} className="text-[var(--color-muted)] hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={() => setLines(prev => [...prev, { id: crypto.randomUUID(), item: "", qty: 1, unitCost: 0 }])} className="text-xs text-[var(--color-primary)] hover:underline">+ Add item</button>
        </div>

        <h3 className="text-sm font-semibold pt-2">Charges to Allocate</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Freight</label><input type="number" min="0" value={freight} onChange={e => setFreight(e.target.value)} placeholder="0" className={numInp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Customs duty</label><input type="number" min="0" value={duty} onChange={e => setDuty(e.target.value)} placeholder="0" className={numInp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Insurance</label><input type="number" min="0" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0" className={numInp} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Other</label><input type="number" min="0" value={other} onChange={e => setOther(e.target.value)} placeholder="0" className={numInp} /></div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-[var(--color-muted)]">Allocate by:</span>
          {(["value", "qty"] as AllocBasis[]).map(b => (
            <button key={b} onClick={() => setBasis(b)} className={`px-3 py-1 text-xs rounded-lg border font-medium transition-colors ${basis === b ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>{b === "value" ? "Value" : "Quantity"}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Goods Value", value: formatCurrency(Math.round(goodsValue)), color: "text-[var(--color-primary)]" },
          { label: "Charges Allocated", value: formatCurrency(Math.round(addOns)), color: "text-orange-400" },
          { label: "Total Landed Cost", value: formatCurrency(Math.round(grandTotal)), color: "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {allocated.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Truck size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">Add at least one item with a quantity and unit cost to compute landed cost.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Item", "Goods Value", "+ Allocated", "Landed Total", "Landed Unit", "Uplift"].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {allocated.map(l => (
                <tr key={l.id} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium">{l.item}<span className="block text-[10px] text-[var(--color-muted)]">{l.qty} × {formatCurrency(Math.round(l.unitCost))}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(Math.round(l.lineValue))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-orange-400">{formatCurrency(Math.round(l.allocatedAddOn))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(Math.round(l.landedTotal))}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-400">{formatCurrency(Math.round(l.landedUnit))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs text-[var(--color-muted)]">+{l.uplift.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #87 Duplicate Invoice Detector - log bills as you receive them; the moment
   the same vendor + invoice number, or the same vendor + amount + date,
   repeats, it is flagged so you never pay it twice.
   ───────────────────────────────────────────────────────────────────────── */
interface BillEntry { id: string; vendor: string; invoiceNo: string; amount: number; date: string; }

function DuplicateInvoiceDetector() {
  const { store } = useApp();
  const [bills, setBills] = useFeatureState<BillEntry[]>("ven-bill-register", []);
  const [vendor, setVendor] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const knownVendors = useMemo(() =>
    Array.from(new Set(store.transactions.filter(t => t.amount < 0 && t.counterparty).map(t => t.counterparty))).sort(),
  [store.transactions]);

  const add = () => {
    const amt = parseFloat(amount) || 0;
    if (!vendor.trim() || amt <= 0) { toast.error("Enter vendor and amount"); return; }
    const e: BillEntry = { id: crypto.randomUUID(), vendor: vendor.trim(), invoiceNo: invoiceNo.trim(), amount: amt, date };
    // warn on entry if it collides with something already in the register
    const collides = bills.some(b =>
      b.vendor.toLowerCase() === e.vendor.toLowerCase() &&
      ((e.invoiceNo && b.invoiceNo.toLowerCase() === e.invoiceNo.toLowerCase()) ||
       (Math.abs(b.amount - e.amount) < 0.01 && b.date === e.date)));
    setBills(prev => [e, ...prev]);
    setVendor(""); setInvoiceNo(""); setAmount("");
    if (collides) toast.error(`Possible duplicate for ${e.vendor} - flagged in the register`);
    else toast.success(`Bill logged for ${e.vendor}`);
  };
  const remove = (id: string) => setBills(prev => prev.filter(b => b.id !== id));

  const flagged = useMemo(() => {
    const dupIds = new Set<string>();
    for (let i = 0; i < bills.length; i++) {
      for (let j = i + 1; j < bills.length; j++) {
        const a = bills[i], b = bills[j];
        if (a.vendor.toLowerCase() !== b.vendor.toLowerCase()) continue;
        const sameInv = a.invoiceNo && b.invoiceNo && a.invoiceNo.toLowerCase() === b.invoiceNo.toLowerCase();
        const sameAmtDate = Math.abs(a.amount - b.amount) < 0.01 && a.date === b.date;
        if (sameInv || sameAmtDate) { dupIds.add(a.id); dupIds.add(b.id); }
      }
    }
    return dupIds;
  }, [bills]);

  const dupExposure = bills.filter(b => flagged.has(b.id)).reduce((s, b) => s + b.amount, 0) / 2;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">The single most common AP leak is paying the same invoice twice - once from email, once from a chase. Log each bill in this register and any repeat of a vendor + invoice number (or vendor + amount + date) is flagged before it gets paid.</p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Bills Logged", value: bills.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Suspected Duplicates", value: flagged.size.toString(), color: flagged.size > 0 ? "text-red-400" : "text-green-400" },
          { label: "Double-Pay Exposure", value: formatCurrency(Math.round(dupExposure)), color: dupExposure > 0 ? "text-orange-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Log a Bill</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <input list="dupinv-vendors" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vendor *" className={inpCls} />
            <datalist id="dupinv-vendors">{knownVendors.map(v => <option key={v} value={v} />)}</datalist>
          </div>
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice #" className={inpCls} />
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount *" className={inpCls} />
          <DatePicker value={date} onChange={setDate} />
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Log Bill</button>
      </div>

      {bills.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CopyCheck size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No bills logged yet. Add invoices here as they arrive to catch duplicates before payment.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Invoice #", "Date", "Amount", "Status", ""].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {bills.map(b => {
                const dup = flagged.has(b.id);
                return (
                  <tr key={b.id} className={`hover:bg-white/2 ${dup ? "bg-red-950/10" : ""}`}>
                    <td className="px-4 py-3 font-medium">{b.vendor}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--color-muted)]">{b.invoiceNo || "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(b.date), "dd MMM yyyy")}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(b.amount)}</td>
                    <td className="px-4 py-3">
                      {dup ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-950/30 text-red-400 border-red-800/30 w-fit flex items-center gap-1"><AlertTriangle size={10} /> Duplicate</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-950/30 text-green-400 border-green-800/30 w-fit flex items-center gap-1"><CheckCircle2 size={10} /> Unique</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right"><button onClick={() => remove(b.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #74 Approval SLA Tracker - log invoice/PO approvals, measure the cycle time
   from request to decision per approver, and surface who is the bottleneck.
   ───────────────────────────────────────────────────────────────────────── */
interface ApprovalEntry { id: string; item: string; approver: string; requested: string; decided: string; outcome: "approved" | "rejected"; }

function ApprovalSlaTracker() {
  const [entries, setEntries] = useFeatureState<ApprovalEntry[]>("ven-approval-sla", []);
  const [item, setItem] = useState("");
  const [approver, setApprover] = useState("");
  const [requested, setRequested] = useState(() => new Date().toISOString().split("T")[0]);
  const [decided, setDecided] = useState(() => new Date().toISOString().split("T")[0]);
  const [outcome, setOutcome] = useState<"approved" | "rejected">("approved");
  const [slaDays, setSlaDays] = useState("2");

  const sla = parseFloat(slaDays) || 2;

  const cycleDays = (e: ApprovalEntry) =>
    Math.max(0, Math.round((new Date(e.decided).getTime() - new Date(e.requested).getTime()) / 86400000));

  const add = () => {
    if (!item.trim() || !approver.trim()) { toast.error("Enter item and approver"); return; }
    if (new Date(decided) < new Date(requested)) { toast.error("Decision date can't be before the request"); return; }
    const e: ApprovalEntry = { id: crypto.randomUUID(), item: item.trim(), approver: approver.trim(), requested, decided, outcome };
    setEntries(prev => [e, ...prev]);
    setItem("");
    toast.success(`Approval logged for ${e.item}`);
  };
  const remove = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));

  const avgCycle = entries.length > 0 ? entries.reduce((s, e) => s + cycleDays(e), 0) / entries.length : 0;
  const breaches = entries.filter(e => cycleDays(e) > sla).length;

  const byApprover = useMemo(() => {
    const m: Record<string, { count: number; totalDays: number; breaches: number }> = {};
    entries.forEach(e => {
      const cur = m[e.approver] ?? { count: 0, totalDays: 0, breaches: 0 };
      const d = cycleDays(e);
      m[e.approver] = { count: cur.count + 1, totalDays: cur.totalDays + d, breaches: cur.breaches + (d > sla ? 1 : 0) };
    });
    return Object.entries(m)
      .map(([approver, v]) => ({ approver, count: v.count, avg: v.totalDays / v.count, breaches: v.breaches }))
      .sort((a, b) => b.avg - a.avg);
  }, [entries, sla]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">When a PO or invoice sits unapproved, you miss early-pay discounts and blow MSME deadlines. Log each approval as it happens to measure how long approvers actually take, and nudge whoever is the bottleneck.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold">Log an Approval</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input value={item} onChange={e => setItem(e.target.value)} placeholder="Item (PO / invoice ref) *" className={inpCls} />
          <input value={approver} onChange={e => setApprover(e.target.value)} placeholder="Approver *" className={inpCls} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Requested</label><DatePicker value={requested} onChange={setRequested} /></div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Decided</label><DatePicker value={decided} onChange={setDecided} /></div>
          <div>
            <label className="text-[10px] text-[var(--color-muted)] block mb-1">Outcome</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value as "approved" | "rejected")} className={inpCls}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">SLA (days)</label><input type="number" min="0" value={slaDays} onChange={e => setSlaDays(e.target.value)} className={inpCls} /></div>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">Log Approval</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Logged", value: entries.length.toString(), color: "text-[var(--color-primary)]" },
          { label: "Avg Cycle Time", value: `${avgCycle.toFixed(1)}d`, color: avgCycle > sla ? "text-orange-400" : "text-green-400" },
          { label: `SLA Breaches (>${sla}d)`, value: breaches.toString(), color: breaches > 0 ? "text-red-400" : "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Hourglass size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No approvals logged yet. Record a request and decision date to start measuring cycle time.</p>
        </div>
      ) : (
        <>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Hourglass size={15} className="text-[var(--color-primary)]" /> Cycle Time by Approver</h3>
            {byApprover.map(a => (
              <div key={a.approver} className="flex items-center justify-between text-sm">
                <span className="font-medium">{a.approver} <span className="text-[10px] text-[var(--color-muted)]">({a.count})</span></span>
                <span className={`tabular-nums font-semibold ${a.avg > sla ? "text-red-400" : "text-green-400"}`}>
                  {a.avg.toFixed(1)}d avg{a.breaches > 0 && <span className="text-[10px] text-[var(--color-muted)] ml-1">· {a.breaches} breach</span>}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <tr>
                  {["Item", "Approver", "Requested", "Cycle", "Outcome", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map(e => {
                  const d = cycleDays(e);
                  return (
                    <tr key={e.id} className="hover:bg-white/2">
                      <td className="px-4 py-3 font-medium">{e.item}</td>
                      <td className="px-4 py-3 text-[var(--color-muted)]">{e.approver}</td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{format(new Date(e.requested), "dd MMM")}</td>
                      <td className={`px-4 py-3 tabular-nums font-semibold ${d > sla ? "text-red-400" : "text-green-400"}`}>{d}d</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit ${e.outcome === "approved" ? "bg-green-950/30 text-green-400 border-green-800/30" : "bg-red-950/30 text-red-400 border-red-800/30"}`}>{e.outcome === "approved" ? "Approved" : "Rejected"}</span>
                      </td>
                      <td className="px-4 py-3 text-right"><button onClick={() => remove(e.id)} className="text-[var(--color-muted)] hover:text-red-400"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   #83 Working-Capital / DPO Simulator - model how lengthening or shortening
   the days-payable-outstanding on your annual vendor spend frees up (or ties
   up) cash, and what that one-time swing is worth at your cost of capital.
   ───────────────────────────────────────────────────────────────────────── */
function WorkingCapitalSimulator() {
  const { store } = useApp();

  // Annualise vendor spend from the last 90 days of expense transactions.
  const annualSpend = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const recent = store.transactions.filter(t => t.amount < 0 && t.counterparty && t.date >= cutoffStr)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return recent * (365 / 90);
  }, [store.transactions]);

  const [spendInput, setSpendInput] = useState("");
  const [currentDpo, setCurrentDpo] = useState("30");
  const [targetDpo, setTargetDpo] = useState("45");
  const [coc, setCoc] = useState("14");

  const spend = parseFloat(spendInput) || Math.round(annualSpend);
  const cur = parseFloat(currentDpo) || 0;
  const tgt = parseFloat(targetDpo) || 0;
  const rate = parseFloat(coc) || 0;

  const dailySpend = spend / 365;
  const apCurrent = dailySpend * cur;
  const apTarget = dailySpend * tgt;
  const cashFreed = apTarget - apCurrent; // positive = cash released to you
  const annualValue = cashFreed * (rate / 100); // value of holding that cash for a year

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Every extra day you take to pay vendors keeps cash in your account a little longer. This models how moving your average payment terms (Days Payable Outstanding) up or down changes the cash tied up in payables - and what that swing is worth at your borrowing rate. Stretch responsibly: MSME vendors are capped at 45 days.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Annual vendor spend (₹)</label>
          <input type="number" min="0" value={spendInput} onChange={e => setSpendInput(e.target.value)} placeholder={Math.round(annualSpend).toString()} className={inpCls} />
          <p className="text-[10px] text-[var(--color-muted)] mt-1">Auto: {formatCurrency(Math.round(annualSpend))} (from last 90d)</p>
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Current DPO (days)</label>
          <input type="number" min="0" value={currentDpo} onChange={e => setCurrentDpo(e.target.value)} className={inpCls} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Target DPO (days)</label>
          <input type="number" min="0" value={targetDpo} onChange={e => setTargetDpo(e.target.value)} className={inpCls} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--color-muted)] block mb-1">Cost of capital (% p.a.)</label>
          <input type="number" min="0" value={coc} onChange={e => setCoc(e.target.value)} className={inpCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "AP at Current DPO", value: formatCurrency(Math.round(apCurrent)), color: "text-[var(--color-muted)]" },
          { label: "AP at Target DPO", value: formatCurrency(Math.round(apTarget)), color: "text-blue-400" },
          { label: cashFreed >= 0 ? "Cash Freed Up" : "Cash Tied Up", value: formatCurrency(Math.abs(Math.round(cashFreed))), color: cashFreed >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Annual Value @ CoC", value: formatCurrency(Math.abs(Math.round(annualValue))), color: cashFreed >= 0 ? "text-green-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 flex items-start gap-3 border ${cashFreed >= 0 ? "bg-green-950/20 border-green-800/30" : "bg-red-950/20 border-red-800/30"}`}>
        <Scale size={16} className={`shrink-0 mt-0.5 ${cashFreed >= 0 ? "text-green-400" : "text-red-400"}`} />
        <p className="text-xs text-[var(--color-muted)]">
          {tgt === cur
            ? "Set a target DPO different from your current to model the cash impact."
            : cashFreed >= 0
              ? <>Stretching terms from {cur} to {tgt} days releases a one-time <span className="font-semibold text-green-400">{formatCurrency(Math.round(cashFreed))}</span> of working capital - worth about <span className="font-semibold text-green-400">{formatCurrency(Math.round(annualValue))}</span> a year at {rate}% cost of capital. Keep MSME vendors inside 45 days to avoid 43B(h) interest.</>
              : <>Shortening terms from {cur} to {tgt} days consumes a one-time <span className="font-semibold text-red-400">{formatCurrency(Math.abs(Math.round(cashFreed)))}</span> of cash, costing roughly <span className="font-semibold text-red-400">{formatCurrency(Math.abs(Math.round(annualValue)))}</span> a year in carry - justify it with early-pay discounts.</>}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Real Accounts Payable UI (#6 audit fix): ApAgingBoard reads actual open
   bills (useApAging); BillsPayables records/pays REAL bills against
   /api/vendor-bills, which posts a genuine PURCHASE voucher (GST input,
   optional TDS, bill-wise settlement) - not a local tracker.
   ───────────────────────────────────────────────────────────────────────── */
const AP_BUCKET_KEYS: (keyof ApAgingResponse["totals"])[] = ["current", "d30", "d60", "d60plus"];

function ApAgingBoard({ onSelectVendor }: { onSelectVendor: (vendorId: string) => void }) {
  const { aging, loading, refresh } = useApAging();

  if (loading && aging.vendors.length === 0) {
    return (
      <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
        <Loader2 size={24} className="mx-auto mb-3 animate-spin text-[var(--color-muted)]" />
        <p className="text-sm text-[var(--color-muted)]">Loading real payables from the books…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--color-muted)] max-w-2xl">
          Every open bill posted through the Bills tab, aged from its actual due date - not a manual guess.
          {aging.vendors.length > 0 && <> Outstanding across {aging.vendors.length} vendor{aging.vendors.length !== 1 ? "s" : ""}: <span className="font-semibold text-[var(--color-text)]">{formatCurrency(aging.grandTotal)}</span>.</>}
        </p>
        <button onClick={() => refresh()} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 shrink-0"><RefreshCw size={12} /> Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {AP_BUCKET_KEYS.map(b => {
          const meta = AP_BUCKET_META[b];
          const Icon = b === "current" ? CheckCircle2 : b === "d60plus" ? AlertTriangle : Clock;
          const count = aging.vendors.reduce((s, v) => s + v.bills.filter(bill =>
            b === "current" ? bill.daysOverdue <= 0 :
            b === "d30" ? bill.daysOverdue > 0 && bill.daysOverdue <= 30 :
            b === "d60" ? bill.daysOverdue > 30 && bill.daysOverdue <= 60 :
            bill.daysOverdue > 60
          ).length, 0);
          return (
            <div key={b} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center gap-1.5 mb-1"><Icon size={12} className={meta.color} /><p className="text-[10px] text-[var(--color-muted)]">{meta.label}</p></div>
              <p className={`text-lg font-bold tabular-nums ${meta.color}`}>{formatCurrency(aging.totals[b])}</p>
              <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{count} bill{count !== 1 ? "s" : ""}</p>
            </div>
          );
        })}
      </div>

      {aging.vendors.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Clock size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No open bills yet. Record a vendor bill in the Bills tab to start tracking real payables.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <tr>
                {["Vendor", "Current", "1-30d", "31-60d", "60d+", "Total", ""].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {aging.vendors.map(v => (
                <tr key={v.vendorId} className="hover:bg-white/2">
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate">
                    {v.vendorName}
                    {v.isMsme && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full border border-purple-800/40 text-purple-400 bg-purple-950/20">MSME</span>}
                  </td>
                  {AP_BUCKET_KEYS.map(b => (
                    <td key={b} className={`px-4 py-3 text-right tabular-nums ${v.buckets[b] > 0 ? AP_BUCKET_META[b].color : "text-[var(--color-muted)]"}`}>{v.buckets[b] > 0 ? formatCurrency(v.buckets[b]) : "-"}</td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(v.total)}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => onSelectVendor(v.vendorId)} className="text-[10px] font-semibold text-[var(--color-primary)] hover:underline">View bills</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Each option carries the payee-type / statutory-variant the law rates differently
// (§194C 1% vs 2% by payee, §194-I 10% vs 2% by asset class, §194J 10% vs 2% FTS).
// The backend computeTds applies the matching rate - the old single-rate list here
// made the 2% legs unreachable and showed 194H's pre-Oct-2024 5%.
const TDS_SECTIONS_UI: { key: string; code: string; payeeType?: string; variant?: string; label: string }[] = [
  { key: "194C", code: "194C", label: "194C - Contractor payments, individual/HUF payee (1%)" },
  { key: "194C:other", code: "194C", payeeType: "company", label: "194C - Contractor payments, company/firm payee (2%)" },
  { key: "194J", code: "194J", label: "194J - Professional fees / royalty (10%)" },
  { key: "194J:fts", code: "194J", variant: "fts", label: "194J - Technical services / call-centre (2%)" },
  { key: "194H", code: "194H", label: "194H - Commission / brokerage (2%)" },
  { key: "194I", code: "194I", label: "194I - Rent: land / building / furniture (10%)" },
  { key: "194I:pm", code: "194I", variant: "plant_machinery", label: "194I - Rent: plant & machinery (2%)" },
  { key: "194Q", code: "194Q", label: "194Q - Purchase of goods above ₹50L (0.1%)" },
];
const AP_GST_RATES = [0, 5, 12, 18, 28];

interface VendorBillRow {
  voucherId: string; billNumber: string | null; voucherNumber: number; date: string; narration: string | null;
  cancelled: boolean; gross: number; allocated: number; outstanding: number;
  status: "open" | "partial" | "settled" | "cancelled"; vendorId: string; vendorName: string;
}

function BillsPayables({ focus }: { focus?: { vendorId: string; n: number } }) {
  const { vendors: master } = useVendorMaster();
  const bankLedgers = useBankLedgers();
  const [vendorId, setVendorId] = useState<string>("");
  const [bills, setBills] = useState<VendorBillRow[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);

  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [interState, setInterState] = useState(false);
  const [rcm, setRcm] = useState(false);
  const [tdsSection, setTdsSection] = useState("");
  const [panAvailable, setPanAvailable] = useState(true);
  const [lowerRate, setLowerRate] = useState("");
  const [saving, setSaving] = useState(false);

  const [payTarget, setPayTarget] = useState<VendorBillRow | "fifo" | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBank, setPayBank] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payRef, setPayRef] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (focus) setVendorId(focus.vendorId); }, [focus]);
  useEffect(() => { if (bankLedgers.length && !payBank) setPayBank(bankLedgers[0].id); }, [bankLedgers, payBank]);

  const selectedVendor = master.find(v => v.id === vendorId) ?? null;

  const loadBills = useCallback(async (vid: string) => {
    if (!vid) { setBills([]); return; }
    setBillsLoading(true);
    try { setBills(await api.get<VendorBillRow[]>(`/api/vendor-bills?vendor_id=${vid}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load bills"); setBills([]); }
    finally { setBillsLoading(false); }
  }, []);
  useEffect(() => { void loadBills(vendorId); }, [vendorId, loadBills]);

  const resetForm = () => {
    setBillNumber(""); setDescription(""); setAmount(""); setInterState(false); setRcm(false);
    setTdsSection(""); setPanAvailable(true); setLowerRate("");
  };

  const submitBill = async () => {
    if (!vendorId) { toast.error("Pick a vendor"); return; }
    if (!billNumber.trim()) { toast.error("Enter the bill/invoice number"); return; }
    const amt = parseFloat(amount);
    if (!(amt > 0)) { toast.error("Enter a bill amount"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        vendorId, billNumber: billNumber.trim(), billDate, narration: description.trim() || undefined,
        lineTotal: amt, gstRate: Number(gstRate), interState, rcm,
        items: rcm ? undefined : [{ description: description.trim() || billNumber.trim(), quantity: 1, unit_price: amt, gst_rate: Number(gstRate) }],
      };
      if (tdsSection) {
        const opt = TDS_SECTIONS_UI.find(s => s.key === tdsSection);
        body.tds = { section: opt?.code ?? tdsSection, payeeType: opt?.payeeType, variant: opt?.variant, panAvailable, lowerRate: lowerRate ? Number(lowerRate) : undefined };
      }
      const res = await api.post<{ voucherNumber: number; tds?: { tdsAmount: string; vendorNet: string; section: string } }>("/api/vendor-bills", body);
      toast.success(res.tds
        ? `Bill recorded (PUR-${res.voucherNumber}) · TDS ${res.tds.section} ₹${Number(res.tds.tdsAmount).toLocaleString("en-IN")} withheld · net payable ₹${Number(res.tds.vendorNet).toLocaleString("en-IN")}`
        : `Bill recorded (PUR-${res.voucherNumber})`);
      resetForm();
      await loadBills(vendorId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to record bill"); }
    finally { setSaving(false); }
  };

  const openPay = (target: VendorBillRow | "fifo") => {
    setPayTarget(target);
    setPayAmount(target === "fifo"
      ? String(bills.filter(b => b.status !== "settled" && b.status !== "cancelled").reduce((s, b) => s + b.outstanding, 0))
      : String(target.outstanding));
    setPayRef("");
  };
  const submitPay = async () => {
    if (!vendorId || !payTarget) return;
    const amt = parseFloat(payAmount);
    if (!(amt > 0)) { toast.error("Enter an amount"); return; }
    if (!payBank) { toast.error("Pick a bank account to pay from"); return; }
    setPaying(true);
    try {
      await api.post("/api/vendor-bills/pay", {
        vendorId, bankLedgerId: payBank, amount: amt, date: payDate, reference: payRef.trim() || undefined,
        billVoucherId: payTarget === "fifo" ? undefined : payTarget.voucherId,
      });
      toast.success(`₹${amt.toLocaleString("en-IN")} paid`);
      setPayTarget(null);
      await loadBills(vendorId);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Payment failed"); }
    finally { setPaying(false); }
  };

  const open = bills.filter(b => b.status !== "settled" && b.status !== "cancelled");
  const totalOutstanding = open.reduce((s, b) => s + b.outstanding, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)] max-w-2xl">Record what a vendor actually billed you - it posts a real purchase entry to the books (with GST input credit and optional TDS withholding), and pay it off against the real ledger. This is your Accounts Payable system of record, not a side tracker.</p>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <label className="text-[10px] text-[var(--color-muted)] block mb-1">Vendor</label>
        <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={inpCls}>
          <option value="">- select a vendor -</option>
          {master.map(v => <option key={v.id} value={v.id}>{v.name}{v.is_msme ? " (MSME)" : ""}</option>)}
        </select>
        {master.length === 0 && <p className="text-[10px] text-[var(--color-muted)] mt-1.5">No vendors saved yet - add one in the Directory tab first.</p>}
        {selectedVendor?.payment_terms_days != null && <p className="text-[10px] text-[var(--color-muted)] mt-1.5">Payment terms: {selectedVendor.payment_terms_days} days{selectedVendor.gstin ? ` · GSTIN ${selectedVendor.gstin}` : ""}</p>}
      </div>

      {vendorId && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Outstanding to this vendor</p><p className={`text-xl font-bold tabular-nums ${totalOutstanding > 0 ? "text-[var(--color-primary)]" : "text-green-400"}`}>{formatCurrency(totalOutstanding)}</p></div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4"><p className="text-xs text-[var(--color-muted)] mb-1">Open bills</p><p className="text-xl font-bold tabular-nums">{open.length}</p></div>
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote size={15} className="text-[var(--color-primary)]" /> Record Bill</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="Bill / invoice no. *" className={inpCls} />
              <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Bill date</label><DatePicker value={billDate} onChange={setBillDate} /></div>
              <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder={rcm ? "Taxable value ₹ *" : "Amount ₹ (pre-GST) *"} className={inpCls} />
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className={inpCls} />
              <select value={gstRate} onChange={e => setGstRate(e.target.value)} className={inpCls}>{AP_GST_RATES.map(r => <option key={r} value={r}>GST {r}%</option>)}</select>
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><input type="checkbox" checked={interState} onChange={e => setInterState(e.target.checked)} /> Inter-state (IGST)</label>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <input type="checkbox" checked={rcm} onChange={e => setRcm(e.target.checked)} />
              Reverse charge (RCM) - vendor charges no GST; we self-assess and claim the matching ITC
            </label>

            <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
              <label className="text-[10px] text-[var(--color-muted)] block">TDS withholding (optional)</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select value={tdsSection} onChange={e => setTdsSection(e.target.value)} className={inpCls}>
                  <option value="">No TDS</option>
                  {TDS_SECTIONS_UI.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {tdsSection && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]"><input type="checkbox" checked={panAvailable} onChange={e => setPanAvailable(e.target.checked)} /> Vendor has PAN</label>
                    <input type="number" min="0" value={lowerRate} onChange={e => setLowerRate(e.target.value)} placeholder="Lower-rate % (§197 certificate, optional)" className={inpCls} />
                  </>
                )}
              </div>
              {tdsSection && !panAvailable && <p className="text-[10px] text-orange-400">No PAN → §206AA penal rate (20%) applies instead of the section rate.</p>}
            </div>

            <button onClick={submitBill} disabled={saving} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50"><Plus size={13} /> {saving ? "Recording…" : "Record Bill"}</button>
          </div>

          {open.length > 0 && (
            <button onClick={() => openPay("fifo")} className="text-xs font-semibold px-4 py-2 rounded-lg border border-green-800/40 text-green-400 hover:bg-green-950/20 flex items-center gap-1.5"><Wallet size={13} /> Pay this vendor (settles oldest bills first)</button>
          )}

          {billsLoading ? (
            <p className="text-xs text-[var(--color-muted)]">Loading bills…</p>
          ) : bills.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <Banknote size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <p className="text-sm text-[var(--color-muted)]">No bills recorded for this vendor yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bills.map(b => (
                <div key={b.voucherId} className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 ${b.status === "settled" || b.status === "cancelled" ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {b.billNumber || `PUR-${b.voucherNumber}`}
                        <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-semibold ${b.status === "settled" ? "text-green-400" : b.status === "cancelled" ? "text-[var(--color-muted)]" : b.status === "partial" ? "text-yellow-400" : "text-orange-400"}`}>
                          {b.status === "settled" ? <CheckCircle2 size={11} /> : b.status === "cancelled" ? <X size={11} /> : <Clock size={11} />} {b.status}
                        </span>
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)] mt-1">{formatCurrency(b.gross)} billed · {formatCurrency(b.outstanding)} outstanding · {format(new Date(b.date + "T00:00:00"), "dd MMM yyyy")}{b.narration ? ` · ${b.narration}` : ""}</p>
                    </div>
                    {b.status !== "settled" && b.status !== "cancelled" && (
                      <button onClick={() => openPay(b)} className="text-[10px] font-semibold px-2.5 py-1 rounded border border-green-800/40 text-green-400 hover:bg-green-950/30 shrink-0">Pay this bill</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPayTarget(null)}>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold flex items-center gap-2"><Wallet size={16} className="text-green-400" /> {payTarget === "fifo" ? "Pay vendor (oldest bills first)" : `Pay ${payTarget.billNumber || `PUR-${payTarget.voucherNumber}`}`}</h3>
              <button onClick={() => setPayTarget(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Amount (₹)</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inpCls} /></div>
              <div>
                <label className="text-[10px] text-[var(--color-muted)] block mb-1">Pay from</label>
                <select value={payBank} onChange={e => setPayBank(e.target.value)} className={inpCls}>
                  {bankLedgers.length === 0 && <option value="">No bank ledgers found</option>}
                  {bankLedgers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><label className="text-[10px] text-[var(--color-muted)] block mb-1">Date</label><DatePicker value={payDate} onChange={setPayDate} /></div>
              <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Reference (UTR / cheque no.)" className={inpCls} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
              <button onClick={() => setPayTarget(null)} className="px-4 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">Cancel</button>
              <button onClick={submitPay} disabled={paying} className="px-4 py-2 text-sm rounded-lg bg-[var(--color-primary)] text-white font-medium disabled:opacity-50">{paying ? "Paying…" : "Confirm payment"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
