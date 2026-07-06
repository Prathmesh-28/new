import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  FileText, RefreshCw, Send, CalendarClock, Printer, PackageCheck, Ban,
  GitBranch, Link2, Plus, ExternalLink, Copy, Wallet, HandCoins, ReceiptText,
  ScrollText, Banknote, FileX2,
} from "lucide-react";
import DatePicker from "@/components/DatePicker";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES - shapes mirror backend/src/modules/books/{documents,payments,portal}.js
// ─────────────────────────────────────────────────────────────────────────────
interface DocRow {
  id: string;
  doc_kind: string;
  doc_number: string | null;
  doc_date: string | null;
  party_ledger_id: string | null;
  status: string;
  subtotal?: string | number | null;
  gst_rate?: string | number | null;
  inter_state?: boolean | null;
  reference?: string | null;
  narration?: string | null;
  converted_voucher_id?: string | null;
}

interface Ledger {
  id: string;
  name: string;
  is_party?: boolean;
  is_bank?: boolean;
}

interface PaymentLink {
  id: string;
  invoice_voucher_id: string | null;
  party_ledger_id: string | null;
  provider: string | null;
  amount: string | number | null;
  status: string;
  link_url: string | null;
  provider_ref?: string | null;
  created_at?: string | null;
}

// Allowed conversions per source kind (mirrors documents.js NEXT map).
const NEXT_KINDS: Record<string, string[]> = {
  ESTIMATE: ["SALES_ORDER", "DELIVERY_CHALLAN", "INVOICE"],
  SALES_ORDER: ["DELIVERY_CHALLAN", "INVOICE"],
  DELIVERY_CHALLAN: ["INVOICE"],
  PURCHASE_ORDER: ["GRN", "BILL"],
  GRN: ["BILL"],
};
// Kinds that hold stock and can post inventory moves.
const STOCK_KINDS = ["DELIVERY_CHALLAN", "GRN"];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Failed";
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function rupee(v: string | number | null | undefined): string {
  return `₹${num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.rows)) return r.rows as T[];
    if (Array.isArray(r.data)) return r.data as T[];
  }
  return [];
}
function prettyKind(k: string | null | undefined): string {
  return (k ?? "-").toString().replace(/_/g, " ");
}
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Couldn't copy - copy manually");
  }
}

// shared styles (mirror sibling Books tabs)
const inputCls =
  "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const labelCls = "text-xs text-[var(--color-muted)] block mb-1";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-[var(--color-primary)] text-[var(--color-bg)] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity";
const btnGhost =
  "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] disabled:opacity-40";
const thCls =
  "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]";
const thR = `${thCls} text-right`;

const STATUS_TINT: Record<string, string> = {
  DRAFT: "bg-[var(--color-bg)] text-[var(--color-muted)] border-[var(--color-border)]",
  OPEN: "bg-blue-900/30 text-blue-300 border-blue-700/40",
  CONVERTED: "bg-green-900/30 text-green-300 border-green-700/40",
  CANCELLED: "bg-red-900/30 text-red-300 border-red-700/40",
};

// ─────────────────────────────────────────────────────────────────────────────
// SMALL PIECES
// ─────────────────────────────────────────────────────────────────────────────
function Card({ title, icon, children, hint }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
        <span className="text-[var(--color-primary)]">{icon}</span> {title}
      </h3>
      {hint && <p className="text-[11px] text-[var(--color-muted)] mb-4">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_TINT[status] || STATUS_TINT.DRAFT;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BooksDocumentsTab({ canWrite = true }: { canWrite?: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsBusy, setDocsBusy] = useState(true);
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  const partyName = useCallback(
    (id: string | null | undefined) => ledgers.find((l) => l.id === id)?.name || "-",
    [ledgers],
  );

  const loadDocs = useCallback(async () => {
    setDocsBusy(true);
    try {
      const qs = new URLSearchParams();
      if (kindFilter) qs.set("kind", kindFilter);
      if (statusFilter) qs.set("status", statusFilter);
      const res = await api.get<unknown>(`/api/books/documents${qs.toString() ? `?${qs}` : ""}`);
      setDocs(asArray<DocRow>(res));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDocsBusy(false);
    }
  }, [kindFilter, statusFilter]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  useEffect(() => {
    (async () => {
      try {
        const l = await api.get<Ledger[]>("/api/books/ledgers");
        setLedgers(Array.isArray(l) ? l : []);
      } catch {
        /* ledger list optional - used only for friendly party names */
      }
    })();
  }, []);

  const selected = useMemo(() => docs.find((d) => d.id === selectedId) || null, [docs, selectedId]);

  const partyLedgers = useMemo(() => ledgers.filter((l) => l.is_party), [ledgers]);
  const bankLedgers = useMemo(() => ledgers.filter((l) => l.is_bank), [ledgers]);

  return (
    <div className="space-y-6">
      {/* HEADER + HOW TO USE */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText size={17} className="text-[var(--color-primary)]" /> Documents &amp; sharing
        </h2>
        <p className="text-[13px] text-[var(--color-muted)] mt-2 leading-relaxed">
          Drive the full document lifecycle: pick a quote / order / invoice below, then{" "}
          <strong className="text-[var(--color-text)]">convert</strong> it down the chain
          (estimate → order → challan → invoice), <strong className="text-[var(--color-text)]">post stock</strong>{" "}
          for delivery challans / GRNs, <strong className="text-[var(--color-text)]">send</strong> it by email or
          WhatsApp, <strong className="text-[var(--color-text)]">schedule</strong> installments,{" "}
          <strong className="text-[var(--color-text)]">print</strong>, or <strong className="text-[var(--color-text)]">cancel</strong>.
          Below that: book advance receipts, vendor advances, credit notes and bad-debt write-offs; mint payment
          links; and share self-service customer / vendor portal links.
        </p>
      </div>

      {/* DOCUMENT REGISTER + SELECTION */}
      <Card
        title="Document register"
        icon={<ScrollText size={15} />}
        hint="Click a row to select it - lifecycle actions act on the selected document."
      >
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className={labelCls}>Kind</label>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={inputCls}>
              <option value="">All kinds</option>
              {["ESTIMATE", "SALES_ORDER", "DELIVERY_CHALLAN", "PURCHASE_ORDER", "GRN", "INVOICE", "BILL"].map((k) => (
                <option key={k} value={k}>{prettyKind(k)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
              <option value="">All statuses</option>
              {["DRAFT", "OPEN", "CONVERTED", "CANCELLED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void loadDocs()} className={`${btnGhost} ml-auto`}>
            <RefreshCw size={14} className={docsBusy ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className={thCls}>Kind</th>
                <th className={thCls}>Number</th>
                <th className={thCls}>Date</th>
                <th className={thCls}>Party</th>
                <th className={thR}>Subtotal</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {docsBusy ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">Loading documents…</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-[var(--color-muted)]">No documents match this filter.</td></tr>
              ) : (
                docs.map((d) => {
                  const active = d.id === selectedId;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={`border-b border-[var(--color-border)] last:border-b-0 cursor-pointer ${
                        active ? "bg-[var(--color-primary)]/10" : "hover:bg-[var(--color-bg)]"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium">{prettyKind(d.doc_kind)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{d.doc_number || "-"}</td>
                      <td className="px-3 py-2.5 text-[var(--color-muted)] whitespace-nowrap">{d.doc_date || "-"}</td>
                      <td className="px-3 py-2.5">{partyName(d.party_ledger_id)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupee(d.subtotal)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={d.status} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* LIFECYCLE ACTIONS for the selected document */}
      <DocumentActions
        doc={selected}
        canWrite={canWrite}
        partyName={partyName}
        onChanged={loadDocs}
      />

      {/* POSTING DOCS: advance receipt + vendor advance + credit note + write-off */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdvanceReceiptForm parties={partyLedgers} banks={bankLedgers} canWrite={canWrite} />
        <VendorAdvanceForm parties={partyLedgers} banks={bankLedgers} canWrite={canWrite} />
        <CreditNoteForm parties={partyLedgers} canWrite={canWrite} />
        <WriteOffForm parties={partyLedgers} canWrite={canWrite} />
      </div>

      {/* PAYMENT LINKS */}
      <PaymentLinksCard parties={partyLedgers} canWrite={canWrite} partyName={partyName} />

      {/* PORTAL LINKS (customer invoice + vendor bill) */}
      <PortalLinksCard parties={partyLedgers} canWrite={canWrite} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE ACTIONS - convert / cancel / send / schedule / print / post-stock
// ─────────────────────────────────────────────────────────────────────────────
function DocumentActions({
  doc, canWrite, onChanged,
}: {
  doc: DocRow | null;
  canWrite: boolean;
  partyName: (id: string | null | undefined) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string>("");
  const [convertTo, setConvertTo] = useState("");

  // send form
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // schedule form
  const [installments, setInstallments] = useState("3");

  const nextKinds = doc ? NEXT_KINDS[doc.doc_kind] || [] : [];
  const isStock = doc ? STOCK_KINDS.includes(doc.doc_kind) : false;
  const terminal = !doc || doc.status === "CONVERTED" || doc.status === "CANCELLED";

  useEffect(() => {
    setConvertTo(nextKinds[0] || "");
    setEmail(""); setPhone("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  if (!doc) {
    return (
      <Card title="Lifecycle actions" icon={<GitBranch size={15} />}>
        <p className="text-sm text-[var(--color-muted)] text-center py-8 border border-dashed border-[var(--color-border)] rounded-lg">
          Select a document from the register above to act on it.
        </p>
      </Card>
    );
  }

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(okMsg);
      await onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };

  const doConvert = () => {
    if (!convertTo) { toast.error("Pick a target document kind"); return; }
    void run("convert", () => api.post(`/api/books/documents/${doc.id}/convert`, {
      toKind: convertTo, date: todayIso(),
    }), `Converted to ${prettyKind(convertTo)}`);
  };

  const doCancel = () => {
    if (!window.confirm("Cancel this document? It can no longer be converted.")) return;
    void run("cancel", () => api.post(`/api/books/documents/${doc.id}/cancel`, {}), "Document cancelled");
  };

  const doPostStock = () => {
    void run("post-stock", () => api.post(`/api/books/documents/${doc.id}/post-stock`, {}), "Stock posted");
  };

  const doSend = () => {
    if (!email.trim() && !phone.trim()) { toast.error("Enter an email and/or phone"); return; }
    void run("send", async () => {
      const res = await api.post<{ ok?: boolean; channels?: { channel: string; delivered: boolean; reason?: string }[] }>(
        `/api/books/documents/${doc.id}/send`,
        { email: email.trim() || undefined, phone: phone.trim() || undefined },
      );
      const undelivered = (res?.channels || []).filter((c) => !c.delivered);
      if (undelivered.length) {
        toast.error(undelivered.map((c) => `${c.channel}: ${c.reason || "not delivered"}`).join(" · "));
      }
      return res;
    }, "Document sent");
  };

  const doSchedule = () => {
    const n = Math.max(1, Math.floor(Number(installments) || 1));
    void run("schedule", () => api.post(`/api/books/documents/${doc.id}/schedule`, {
      total: num(doc.subtotal),
      invoiceDate: doc.doc_date || todayIso(),
      installments: n,
    }), `Scheduled ${n} installment${n === 1 ? "" : "s"}`);
  };

  const doPrint = () => {
    const token = localStorage.getItem("hr_access") || "";
    // Backend allows ?token= for the print GET so a new tab can authenticate.
    const path = `/api/books/documents/${doc.id}/print${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    window.open(path, "_blank", "noopener");
  };

  return (
    <Card
      title="Lifecycle actions"
      icon={<GitBranch size={15} />}
      hint={`Selected: ${prettyKind(doc.doc_kind)} #${doc.doc_number || "-"} · ${doc.status}`}
    >
      <div className="space-y-4">
        {/* quick actions row */}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={doPrint} className={btnGhost}>
            <Printer size={14} /> Print
          </button>
          {canWrite && isStock && (
            <button type="button" onClick={doPostStock} disabled={busy === "post-stock"} className={btnGhost}>
              {busy === "post-stock" ? <RefreshCw size={14} className="animate-spin" /> : <PackageCheck size={14} />}
              Post stock
            </button>
          )}
          {canWrite && !terminal && (
            <button type="button" onClick={doCancel} disabled={busy === "cancel"} className={`${btnGhost} hover:border-red-500 hover:text-red-400`}>
              {busy === "cancel" ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />}
              Cancel
            </button>
          )}
        </div>

        {/* convert */}
        {canWrite && (
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5">
              <GitBranch size={13} /> Convert
            </p>
            {terminal ? (
              <p className="text-[12px] text-[var(--color-muted)]">This document is {doc.status.toLowerCase()} and can no longer be converted.</p>
            ) : nextKinds.length === 0 ? (
              <p className="text-[12px] text-[var(--color-muted)]">{prettyKind(doc.doc_kind)} is terminal - nothing to convert it into.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <label className={labelCls}>Convert into</label>
                  <select value={convertTo} onChange={(e) => setConvertTo(e.target.value)} className={inputCls}>
                    {nextKinds.map((k) => <option key={k} value={k}>{prettyKind(k)}</option>)}
                  </select>
                </div>
                <button type="button" onClick={doConvert} disabled={busy === "convert"} className={btnPrimary}>
                  {busy === "convert" ? <RefreshCw size={14} className="animate-spin" /> : <GitBranch size={14} />}
                  Convert
                </button>
              </div>
            )}
            <p className="text-[11px] text-[var(--color-muted)] mt-2">
              Converting to INVOICE / BILL posts the accounting voucher; intermediate kinds just advance the pipeline.
            </p>
          </div>
        )}

        {/* send + schedule grid */}
        {canWrite && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SEND */}
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3 flex items-center gap-1.5">
                <Send size={13} /> Send
              </p>
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="customer@example.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>WhatsApp / phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" className={inputCls} />
                </div>
                <button type="button" onClick={doSend} disabled={busy === "send"} className={`${btnPrimary} w-full`}>
                  {busy === "send" ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Send document
                </button>
              </div>
            </div>

            {/* SCHEDULE */}
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-3 flex items-center gap-1.5">
                <CalendarClock size={13} /> Payment schedule
              </p>
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Installments</label>
                  <input value={installments} onChange={(e) => setInstallments(e.target.value)} inputMode="numeric" placeholder="3" className={`${inputCls} font-mono tabular-nums`} />
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Splits {rupee(doc.subtotal)} into equal due dates from {doc.doc_date || "today"}.
                </p>
                <button type="button" onClick={doSchedule} disabled={busy === "schedule"} className={`${btnPrimary} w-full`}>
                  {busy === "schedule" ? <RefreshCw size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                  Build schedule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTY / BANK select helpers
// ─────────────────────────────────────────────────────────────────────────────
function LedgerSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: Ledger[]; placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">{placeholder || "Select…"}</option>
        {options.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </div>
  );
}

const GST_RATES = [0, 5, 12, 18, 28] as const;

function NoWrite({ what }: { what: string }) {
  return (
    <p className="text-sm text-[var(--color-muted)] text-center py-8 border border-dashed border-[var(--color-border)] rounded-lg">
      You need an owner / finance / accountant role to {what}.
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCE RECEIPT - GST-compliant customer advance
// ─────────────────────────────────────────────────────────────────────────────
function AdvanceReceiptForm({ parties, banks, canWrite }: { parties: Ledger[]; banks: Ledger[]; canWrite: boolean }) {
  const [partyLedgerId, setParty] = useState("");
  const [bankLedgerId, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a customer"); return; }
    if (!bankLedgerId) { toast.error("Pick a bank/cash ledger"); return; }
    if (num(amount) <= 0) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ voucherNumber?: string }>("/api/books/documents/advance-receipt", {
        partyLedgerId, bankLedgerId, amount: num(amount), gstRate, date,
      });
      toast.success(r?.voucherNumber ? `Advance receipt #${r.voucherNumber}` : "Advance receipt posted");
      setAmount("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Customer advance receipt" icon={<HandCoins size={15} />} hint="GST output is self-assessed on the advance per CGST rules.">
      {!canWrite ? <NoWrite what="post advance receipts" /> : (
        <div className="space-y-3">
          <LedgerSelect label="Customer" value={partyLedgerId} onChange={setParty} options={parties} placeholder="Select customer…" />
          <LedgerSelect label="Received into (bank / cash)" value={bankLedgerId} onChange={setBank} options={banks} placeholder="Select bank…" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>GST rate</label>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputCls}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <HandCoins size={14} />} Post advance receipt
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR ADVANCE - advance paid to a supplier
// ─────────────────────────────────────────────────────────────────────────────
function VendorAdvanceForm({ parties, banks, canWrite }: { parties: Ledger[]; banks: Ledger[]; canWrite: boolean }) {
  const [partyLedgerId, setParty] = useState("");
  const [bankLedgerId, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a vendor"); return; }
    if (!bankLedgerId) { toast.error("Pick a bank/cash ledger"); return; }
    if (num(amount) <= 0) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ voucherNumber?: string }>("/api/books/documents/vendor-advance", {
        partyLedgerId, bankLedgerId, amount: num(amount), date,
      });
      toast.success(r?.voucherNumber ? `Vendor advance #${r.voucherNumber}` : "Vendor advance posted");
      setAmount("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Vendor advance" icon={<Wallet size={15} />} hint="Dr vendor (advance) / Cr bank - applied against a future bill.">
      {!canWrite ? <NoWrite what="post vendor advances" /> : (
        <div className="space-y-3">
          <LedgerSelect label="Vendor" value={partyLedgerId} onChange={setParty} options={parties} placeholder="Select vendor…" />
          <LedgerSelect label="Paid from (bank / cash)" value={bankLedgerId} onChange={setBank} options={banks} placeholder="Select bank…" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>
          <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Wallet size={14} />} Post vendor advance
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT NOTE - sales return / customer credit
// ─────────────────────────────────────────────────────────────────────────────
function CreditNoteForm({ parties, canWrite }: { parties: Ledger[]; canWrite: boolean }) {
  const [customerLedgerId, setCustomer] = useState("");
  const [lineTotal, setLineTotal] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [interState, setInterState] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const base = num(lineTotal);
  const tax = (base * gstRate) / 100;

  const submit = async () => {
    if (!customerLedgerId) { toast.error("Pick a customer"); return; }
    if (base <= 0) { toast.error("Enter a line total above zero"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ voucherNumber?: string }>("/api/books/documents/credit-note", {
        customerLedgerId, lineTotal: base, gstRate, interState, date,
      });
      toast.success(r?.voucherNumber ? `Credit note #${r.voucherNumber}` : "Credit note posted");
      setLineTotal("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Credit note (sales return)" icon={<ReceiptText size={15} />} hint="Reverses sales + GST output; reduces what the customer owes.">
      {!canWrite ? <NoWrite what="raise credit notes" /> : (
        <div className="space-y-3">
          <LedgerSelect label="Customer" value={customerLedgerId} onChange={setCustomer} options={parties} placeholder="Select customer…" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Line total</label>
              <input value={lineTotal} onChange={(e) => setLineTotal(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>GST rate</label>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputCls}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} className="accent-[var(--color-primary)] w-4 h-4" />
            Inter-state (IGST)
          </label>
          <div>
            <label className={labelCls}>Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-xs flex justify-between">
            <span className="text-[var(--color-muted)]">GST @ {gstRate}%</span>
            <span className="tabular-nums">₹{tax.toFixed(2)}</span>
          </div>
          <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <ReceiptText size={14} />} Post credit note
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE-OFF - bad-debt write-off against a customer
// ─────────────────────────────────────────────────────────────────────────────
function WriteOffForm({ parties, canWrite }: { parties: Ledger[]; canWrite: boolean }) {
  const [partyLedgerId, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partyLedgerId) { toast.error("Pick a customer"); return; }
    if (num(amount) <= 0) { toast.error("Enter an amount above zero"); return; }
    if (!window.confirm("Write off this balance as a bad debt? This posts an expense.")) return;
    setSaving(true);
    try {
      const r = await api.post<{ voucherNumber?: string }>("/api/books/documents/write-off", {
        partyLedgerId, amount: num(amount), date,
      });
      toast.success(r?.voucherNumber ? `Write-off #${r.voucherNumber}` : "Bad debt written off");
      setAmount("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Bad-debt write-off" icon={<FileX2 size={15} />} hint="Dr Bad Debts / Cr customer - clears an uncollectible balance.">
      {!canWrite ? <NoWrite what="write off bad debts" /> : (
        <div className="space-y-3">
          <LedgerSelect label="Customer" value={partyLedgerId} onChange={setParty} options={parties} placeholder="Select customer…" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>
          <button type="button" onClick={submit} disabled={saving} className={`${btnPrimary} w-full`}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <FileX2 size={14} />} Write off
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT LINKS - create + list (Razorpay/manual)
// ─────────────────────────────────────────────────────────────────────────────
function PaymentLinksCard({ parties, canWrite, partyName }: {
  parties: Ledger[]; canWrite: boolean; partyName: (id: string | null | undefined) => string;
}) {
  const [rows, setRows] = useState<PaymentLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [partyLedgerId, setParty] = useState("");
  const [invoiceVoucherId, setVoucher] = useState("");
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get<unknown>("/api/books/payments/links");
      setRows(asArray<PaymentLink>(r));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (num(amount) <= 0) { toast.error("Enter an amount above zero"); return; }
    setSaving(true);
    try {
      const res = await api.post<PaymentLink & { note?: string }>("/api/books/payments/links", {
        amount: num(amount),
        partyLedgerId: partyLedgerId || undefined,
        invoiceVoucherId: invoiceVoucherId.trim() || undefined,
      });
      if (res?.link_url && !res.link_url.startsWith("pending-gateway://")) {
        toast.success("Payment link created");
      } else {
        toast.success(res?.note || "Link recorded - no live gateway, mark paid manually");
      }
      setAmount(""); setVoucher("");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Payment links" icon={<Link2 size={15} />} hint="Mint a hosted link (Razorpay if keys are set) or a manual placeholder to collect online.">
      {canWrite && (
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <LedgerSelect label="Party (optional)" value={partyLedgerId} onChange={setParty} options={parties} placeholder="Select party…" />
            <div>
              <label className={labelCls}>Invoice voucher id (optional)</label>
              <input value={invoiceVoucherId} onChange={(e) => setVoucher(e.target.value)} placeholder="voucher UUID" className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono tabular-nums`} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create link
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-2">
        <button type="button" onClick={() => void load()} className={btnGhost}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="border border-[var(--color-border)] rounded-lg overflow-x-auto bg-[var(--color-surface)]">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className={thCls}>Party</th>
              <th className={thCls}>Provider</th>
              <th className={thR}>Amount</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Link</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-muted)]">No payment links yet.</td></tr>
            ) : (
              rows.map((r) => {
                const live = r.link_url && !r.link_url.startsWith("pending-gateway://");
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5">{partyName(r.party_ledger_id)}</td>
                    <td className="px-3 py-2.5 text-xs capitalize text-[var(--color-muted)]">{r.provider || "manual"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupee(r.amount)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        r.status === "PAID"
                          ? "bg-green-900/30 text-green-300 border-green-700/40"
                          : "bg-amber-900/30 text-amber-300 border-amber-700/40"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {live ? (
                        <a href={r.link_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline text-xs">
                          <ExternalLink size={12} /> Open
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">No live URL</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL LINKS - self-service customer-invoice + vendor-bill links
// ─────────────────────────────────────────────────────────────────────────────
function PortalLinksCard({ parties, canWrite }: { parties: Ledger[]; canWrite: boolean }) {
  const [voucherId, setVoucherId] = useState("");
  const [vendorLedgerId, setVendor] = useState("");
  const [invoicePath, setInvoicePath] = useState<string>("");
  const [vendorPath, setVendorPath] = useState<string>("");
  const [invBusy, setInvBusy] = useState(false);
  const [venBusy, setVenBusy] = useState(false);

  const mintInvoice = async () => {
    if (!voucherId.trim()) { toast.error("Enter the invoice voucher id"); return; }
    setInvBusy(true);
    try {
      const r = await api.post<{ path?: string }>("/api/books/portal/invoice-link", { voucherId: voucherId.trim() });
      setInvoicePath(r?.path || "");
      toast.success("Customer portal link minted");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setInvBusy(false);
    }
  };

  const mintVendor = async () => {
    if (!vendorLedgerId) { toast.error("Pick a vendor"); return; }
    setVenBusy(true);
    try {
      const r = await api.post<{ path?: string }>("/api/books/portal/vendor-link", { vendorLedgerId });
      setVendorPath(r?.path || "");
      toast.success("Vendor portal link minted");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setVenBusy(false);
    }
  };

  const abs = (path: string) => (path.startsWith("http") ? path : `${window.location.origin}${path}`);

  if (!canWrite) {
    return (
      <Card title="Portal links" icon={<ExternalLink size={15} />}>
        <NoWrite what="mint portal links" />
      </Card>
    );
  }

  return (
    <Card title="Self-service portal links" icon={<ExternalLink size={15} />} hint="Share a signed link so a customer can view/pay an invoice, or a vendor can see their bills.">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CUSTOMER INVOICE LINK */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] flex items-center gap-1.5">
            <Banknote size={13} /> Customer invoice link
          </p>
          <div>
            <label className={labelCls}>Invoice voucher id</label>
            <input value={voucherId} onChange={(e) => setVoucherId(e.target.value)} placeholder="voucher UUID" className={`${inputCls} font-mono`} />
          </div>
          <button type="button" onClick={mintInvoice} disabled={invBusy} className={`${btnPrimary} w-full`}>
            {invBusy ? <RefreshCw size={14} className="animate-spin" /> : <Link2 size={14} />} Mint invoice link
          </button>
          {invoicePath && (
            <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span className="text-xs font-mono truncate flex-1">{abs(invoicePath)}</span>
              <button type="button" onClick={() => void copyText(abs(invoicePath))} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Copy"><Copy size={14} /></button>
              <a href={invoicePath} target="_blank" rel="noreferrer" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Open"><ExternalLink size={14} /></a>
            </div>
          )}
        </div>

        {/* VENDOR BILL LINK */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] flex items-center gap-1.5">
            <Wallet size={13} /> Vendor bill link
          </p>
          <LedgerSelect label="Vendor" value={vendorLedgerId} onChange={setVendor} options={parties} placeholder="Select vendor…" />
          <button type="button" onClick={mintVendor} disabled={venBusy} className={`${btnPrimary} w-full`}>
            {venBusy ? <RefreshCw size={14} className="animate-spin" /> : <Link2 size={14} />} Mint vendor link
          </button>
          {vendorPath && (
            <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2">
              <span className="text-xs font-mono truncate flex-1">{abs(vendorPath)}</span>
              <button type="button" onClick={() => void copyText(abs(vendorPath))} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Copy"><Copy size={14} /></button>
              <a href={vendorPath} target="_blank" rel="noreferrer" className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" title="Open"><ExternalLink size={14} /></a>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
