import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Ban, Copy, Download, Eraser, FileText, History, Loader2, Paperclip, Printer, Send, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, authHeaders } from "@/lib/api";
import { API_BASE } from "@/lib/apiBase";
import { formatCurrency } from "@/lib/utils";
import { deleteWithUndo } from "@/lib/undo";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { TextAreaField } from "@/components/ui/Field";
import { inWords } from "@/lib/invoiceTotals";
import { useConfirm } from "@/components/ui/Confirm";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { useTrackView } from "@/hooks/useRecentlyViewed";
import RecordShell, { CopyValue, Detail } from "./RecordShell";

/**
 * /invoices/:id — the first real record permalink in the product.
 *
 * Until now an invoice existed only as a row inside the Invoices hub: it could not be
 * linked, bookmarked, opened in a new tab, or sent to a colleague, and the only way to
 * see one was to load every invoice for the tenant and find it client-side. This page
 * fetches exactly one (GET /api/invoices/:id) and is the target the command palette,
 * notifications and list rows now deep-link to.
 */
type Item = { id: string; description: string; hsn_sac: string | null; uom: string | null; quantity: string; unit_price: string; gst_rate: string; amount: string; discount_pct: string; discount_amount: string; taxable_value: string | null; tax_amount: string | null };
type Payment = { id: string; amount: string; mode: string; reference: string | null; received_at: string; receipt_number: string | null };
type CreditNote = { id: string; note_number: string; total_amount: string; reason: string | null; created_at: string };
type Reminder = { id: string; channel: string; status: string; reminded_at: string };
type Revision = { id: string; version: number; reason: string | null; changed_at: string; changed_by_email: string | null; total_amount: string; customer_name: string; invoice_date: string };
type Attachment = { id: string; file_id: string; label: string | null; name: string; mime_type: string; size: number; created_at: string };
type Invoice = {
  id: string; invoice_number: string; customer_name: string; customer_gstin: string | null;
  customer_email: string | null; customer_phone: string | null; customer_id: string | null;
  subtotal: string; gst_rate: string; gst_amount: string; total_amount: string;
  paid_amount: string; credited_amount: string | null; status: string; due_date: string | null;
  created_at: string; updated_at: string | null; paid_at: string | null; aging: string; outstanding: number;
  // Wave 4 document fields.
  invoice_date: string | null; place_of_supply_code: string | null; is_inter_state: boolean | null;
  reverse_charge: boolean; cgst_amount: string; sgst_amount: string; igst_amount: string;
  currency: string; po_number: string | null; reference: string | null; terms: string | null; notes: string | null;
  discount_amount: string; shipping_amount: string; round_off: string; version: number;
  voided_at: string | null; void_reason: string | null;
  items: Item[]; payments: Payment[]; credit_notes: CreditNote[]; reminders: Reminder[];
};

const STATUS: Record<string, string> = {
  draft:     "bg-[var(--color-border)]/40 text-[var(--color-muted)]",
  sent:      "bg-blue-500/15 text-blue-400",
  paid:      "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  cancelled: "bg-red-500/15 text-red-400",
};
const AGING_LABEL: Record<string, string> = { "30d": "30 days overdue", "60d": "60 days overdue", "90d+": "90+ days overdue" };

export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [voidOpen, setVoidOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Invoice>(`/api/invoices/${id}`)
      .then(setInv)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load this invoice"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadSidecars = useCallback(() => {
    api.get<Revision[]>(`/api/invoices/${id}/revisions`).then(setRevisions).catch(() => setRevisions([]));
    api.get<Attachment[]>(`/api/records/invoice/${id}/attachments`).then(setAttachments).catch(() => setAttachments([]));
  }, [id]);
  useEffect(() => { loadSidecars(); }, [loadSidecars]);

  useTrackView(inv ? { entity: "invoice", id: inv.id, label: `${inv.invoice_number} · ${inv.customer_name}`, href: `/invoices/${inv.id}` } : null);

  const markPaid = async () => {
    if (!inv) return;
    if (!await confirm({
      title: `Mark ${inv.invoice_number} as paid?`,
      body: `This records a receipt of ${formatCurrency(inv.outstanding)} and posts it to the ledger.`,
      confirmLabel: "Mark paid",
    })) return;
    setBusy("paid");
    try { await api.patch(`/api/invoices/${inv.id}`, { status: "paid" }); toast.success("Marked paid"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't mark it paid"); }
    finally { setBusy(null); }
  };

  const send = async () => {
    if (!inv) return;
    if (!inv.customer_email && !inv.customer_phone) { toast.error("Add a customer email or phone first — there's nowhere to send it."); return; }
    setBusy("send");
    try { await api.post(`/api/invoices/${inv.id}/send`, {}); toast.success("Sent"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send it"); }
    finally { setBusy(null); }
  };

  // The PDF endpoint streams bytes and needs the auth header, so it can't be a plain <a>.
  const downloadPdf = async () => {
    if (!inv) return;
    setBusy("pdf");
    try {
      const res = await fetch(`${API_BASE}/api/invoices/${inv.id}/pdf`, { headers: authHeaders() });
      if (!res.ok) throw new Error("The PDF couldn't be generated");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.invoice_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't download the PDF"); }
    finally { setBusy(null); }
  };

  const duplicate = async () => {
    if (!inv) return;
    if (!await confirm({
      title: `Duplicate ${inv.invoice_number}?`,
      body: "A new draft invoice is created with the same customer and line items, and a fresh invoice number. Nothing is sent.",
      confirmLabel: "Create the copy",
    })) return;
    setBusy("dup");
    try {
      const copy = await api.post<{ id: string; invoice_number: string }>("/api/invoices", {
        customer_name: inv.customer_name, customer_gstin: inv.customer_gstin,
        customer_email: inv.customer_email, customer_phone: inv.customer_phone,
        gst_rate: Number(inv.gst_rate), due_date: inv.due_date,
        items: inv.items.map((it) => ({ description: it.description, hsn_sac: it.hsn_sac, quantity: Number(it.quantity), unit_price: Number(it.unit_price), gst_rate: Number(it.gst_rate) })),
      });
      toast.success(`Created ${copy.invoice_number}`);
      navigate(`/invoices/${copy.id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't duplicate it"); }
    finally { setBusy(null); }
  };

  const del = async () => {
    if (!inv) return;
    if (!await confirm({
      title: `Delete ${inv.invoice_number}?`,
      body: `${inv.customer_name} · ${formatCurrency(Number(inv.total_amount))}. It goes to Trash for 30 days — you can put it back from there or from the Undo that appears next.`,
      danger: true, confirmLabel: "Delete",
    })) return;
    await deleteWithUndo({
      label: `Invoice ${inv.invoice_number}`,
      remove: () => api.delete(`/api/invoices/${inv.id}`),
      onDone: () => { navigate("/invoices"); },
    });
  };

  const attachFile = async (file: File) => {
    setBusy("attach");
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Files go through the existing vault (encrypted at rest, MIME-allowlisted, 10 MB),
      // then get linked to this record.
      const uploaded = await fetch(`${API_BASE}/api/files`, { method: "POST", headers: authHeaders(), body: fd })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Upload failed"); return r.json(); });
      await api.post(`/api/records/invoice/${id}/attachments`, { fileId: uploaded.id, label: file.name });
      toast.success(`${file.name} attached`);
      loadSidecars();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't attach that file"); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="max-w-7xl mx-auto"><LoadingState rows={6} label="Loading invoice" /></div>;
  if (error || !inv) return <div className="max-w-7xl mx-auto"><ErrorState title="Couldn't open this invoice" message={error ?? undefined} onRetry={load} /></div>;

  const paid = Number(inv.paid_amount) || 0;
  const credited = Number(inv.credited_amount) || 0;
  const overdue = inv.aging && inv.aging !== "current" && inv.aging !== "paid" && inv.status !== "paid" && inv.status !== "cancelled";

  return (
    <RecordShell
      entity="invoice" entityId={inv.id}
      backTo="/invoices" backLabel="All invoices"
      title={inv.invoice_number}
      subtitle={<span>{inv.customer_name}{inv.customer_gstin ? <> · <CopyValue value={inv.customer_gstin} /></> : null}</span>}
      meta={{ createdAt: inv.created_at }}
      badges={
        <>
          {inv.voided_at
            ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide bg-red-500/15 text-red-400">Void</span>
            : <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${STATUS[inv.status] ?? STATUS.draft}`}>{inv.status}</span>}
          {inv.reverse_charge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">Reverse charge</span>}
          {inv.version > 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-border)]/50 text-[var(--color-muted)] font-semibold">v{inv.version}</span>}
          {overdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">{AGING_LABEL[inv.aging] ?? "overdue"}</span>}
        </>
      }
      actions={
        <>
          {inv.status !== "paid" && inv.status !== "cancelled" && (
            <Button size="sm" variant="primary" icon={<Wallet size={13} />} loading={busy === "paid"} onClick={markPaid}>Mark paid</Button>
          )}
          <Button size="sm" icon={<Send size={13} />} loading={busy === "send"} onClick={send}>Send</Button>
          <Button size="sm" icon={<Download size={13} />} loading={busy === "pdf"} onClick={downloadPdf}>PDF</Button>
          <Button size="sm" icon={<Printer size={13} />} onClick={() => window.print()}>Print</Button>
          <Button size="sm" icon={<Copy size={13} />} loading={busy === "dup"} onClick={duplicate}>Duplicate</Button>
          {!inv.voided_at && inv.status !== "cancelled" && inv.outstanding > 0 && Number(inv.paid_amount) > 0 && (
            <Button size="sm" variant="ghost" icon={<Eraser size={13} />}
              title="Absorb the unpaid remainder as a bad debt (GST stays put; Dr Bad Debts in the books)"
              onClick={async () => {
                const reason = window.prompt(`Write off the remaining ${formatCurrency(inv.outstanding)} on ${inv.invoice_number}?\n\nWhy? (an auditor reads this)`);
                if (!reason?.trim()) return;
                try {
                  await api.post(`/api/invoices/${inv.id}/write-off`, { reason: reason.trim() });
                  toast.success("Written off", { description: "Booked to Bad Debts. GST was not reversed — bad debts don't reverse GST." });
                  load();
                } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't write it off"); }
              }}>Write off balance</Button>
          )}
          {!inv.voided_at && Number(inv.paid_amount) === 0 && (
            <Button size="sm" icon={<Ban size={13} />} onClick={() => setVoidOpen(true)}
              title="Cancel this invoice but keep its number and paper trail">Void</Button>
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={del} title="Delete (recoverable for 30 days)" />
        </>
      }
    >
      {/* Money summary */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Detail label="Invoice total" value={<span className="font-bold text-base">{formatCurrency(Number(inv.total_amount))}</span>} />
          <Detail label="Received" value={formatCurrency(paid)} />
          <Detail label="Credited" value={credited > 0 ? formatCurrency(credited) : "—"} />
          <Detail label="Outstanding" value={
            <span className={`font-bold text-base ${inv.outstanding > 0 ? "text-amber-400" : "text-[var(--color-primary)]"}`}>
              {formatCurrency(inv.outstanding)}
            </span>} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[var(--color-border)]">
          <Detail label="Invoice date" value={inv.invoice_date || "—"} />
          <Detail label="Due date" value={inv.due_date || "Not set"} />
          <Detail label="Place of supply" value={
            inv.place_of_supply_code
              ? <>{inv.place_of_supply_code}{" "}
                  <span className="text-[var(--color-muted)] text-xs">
                    ({inv.is_inter_state === true ? "inter-state, IGST" : inv.is_inter_state === false ? "intra-state, CGST+SGST" : "split unknown"})
                  </span>
                </>
              : <span className="text-amber-400 text-xs">Not stated — the tax split can't be confirmed</span>} />
          <Detail label="Your PO reference" value={inv.po_number || "—"} />
          <Detail label="GST rate" value={`${Number(inv.gst_rate)}%`} />
          <Detail label="Customer email" value={inv.customer_email || "Not set"} />
          <Detail label="Customer phone" value={inv.customer_phone || "Not set"} />
          <Detail label="Currency" value={inv.currency || "INR"} />
        </div>
        {inv.voided_at && (
          <p className="mt-4 pt-4 border-t border-red-500/30 text-xs text-red-400">
            Voided {new Date(inv.voided_at).toLocaleString("en-IN")}{inv.void_reason ? ` — ${inv.void_reason}` : ""}.
            The number is kept so the sequence stays unbroken.
          </p>
        )}
      </div>

      {/* Line items */}
      <Section title="Line items" icon={<FileText size={14} />}>
        <table className="w-full text-sm rcard">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider hidden md:table-cell">HSN/SAC</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Qty</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Rate</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {inv.items.map((it) => (
              <tr key={it.id}>
                <td data-label="Description" className="px-4 py-2.5">
                  {it.description}{it.uom ? <span className="text-[var(--color-muted)] text-xs"> ({it.uom})</span> : null}
                  {Number(it.discount_amount) > 0 && (
                    <p className="text-[10px] text-[var(--color-muted)]">
                      less {Number(it.discount_pct) > 0 ? `${Number(it.discount_pct)}% ` : ""}discount {formatCurrency(Number(it.discount_amount))}
                    </p>
                  )}
                </td>
                <td data-label="HSN/SAC" className="px-4 py-2.5 font-mono text-xs text-[var(--color-muted)] hidden md:table-cell">{it.hsn_sac || "—"}</td>
                <td data-label="Qty" className="px-4 py-2.5 text-right tabular-nums">{Number(it.quantity)}</td>
                <td data-label="Rate" className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number(it.unit_price))}</td>
                <td data-label="Amount" className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(Number(it.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)]">
            {Number(inv.discount_amount) > 0 && (
              <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">Less: discount on the invoice</td>
                  <td className="px-4 py-2 text-right tabular-nums">-{formatCurrency(Number(inv.discount_amount))}</td></tr>
            )}
            {Number(inv.shipping_amount) > 0 && (
              <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">Add: freight / packing</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.shipping_amount))}</td></tr>
            )}
            <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">Taxable value</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.subtotal))}</td></tr>
            {/* The split as STORED on the invoice, not re-derived here — the document, the
                books and this screen all read the same three columns. */}
            {Number(inv.igst_amount) > 0 && (
              <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">IGST @ {Number(inv.gst_rate)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.igst_amount))}</td></tr>
            )}
            {Number(inv.cgst_amount) > 0 && (
              <>
                <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">CGST @ {Number(inv.gst_rate) / 2}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.cgst_amount))}</td></tr>
                <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">SGST @ {Number(inv.gst_rate) / 2}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.sgst_amount))}</td></tr>
              </>
            )}
            {Number(inv.igst_amount) === 0 && Number(inv.cgst_amount) === 0 && Number(inv.gst_amount) > 0 && (
              <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-amber-400">GST (split not stated)</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.gst_amount))}</td></tr>
            )}
            {inv.reverse_charge && (
              <tr><td colSpan={5} className="px-4 py-2 text-right text-[11px] text-blue-400">Tax payable by the recipient under reverse charge — not collected on this invoice.</td></tr>
            )}
            {Number(inv.round_off) !== 0 && (
              <tr><td colSpan={4} className="px-4 py-2 text-right text-xs text-[var(--color-muted)]">Round off</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Number(inv.round_off))}</td></tr>
            )}
            <tr><td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold">{formatCurrency(Number(inv.total_amount))}</td></tr>
            <tr><td colSpan={5} className="px-4 py-2 text-right text-[11px] text-[var(--color-muted)]">{inWords(Number(inv.total_amount), inv.currency || "INR")}</td></tr>
          </tfoot>
        </table>
      </Section>

      {inv.payments.length > 0 && (
        <Section title={`Receipts (${inv.payments.length})`} icon={<Wallet size={14} />}>
          <ul className="divide-y divide-[var(--color-border)]">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {new Date(p.received_at).toLocaleDateString("en-IN")}
                  <span className="text-[var(--color-muted)]"> · {p.mode}{p.reference ? ` · ${p.reference}` : ""}</span>
                  {p.receipt_number && <span className="text-[var(--color-muted)] font-mono text-xs"> · {p.receipt_number}</span>}
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="tabular-nums font-medium">{formatCurrency(Number(p.amount))}</span>
                  {/* The printable acknowledgement the customer never used to get. */}
                  <button type="button"
                    onClick={async () => {
                      try {
                        const r = await fetch(`${API_BASE}/api/invoices/${inv.id}/payments/${p.id}/receipt`, { headers: authHeaders() });
                        if (!r.ok) throw new Error("Couldn't generate the receipt");
                        const url = URL.createObjectURL(await r.blob());
                        const a = document.createElement("a");
                        a.href = url; a.download = `${p.receipt_number || "receipt"}.pdf`; a.click();
                        URL.revokeObjectURL(url);
                      } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't download the receipt"); }
                    }}
                    className="text-xs text-[var(--color-primary)] hover:underline"
                    aria-label={`Download receipt ${p.receipt_number || ""}`}>Receipt</button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {inv.credit_notes.length > 0 && (
        <Section title={`Credit notes (${inv.credit_notes.length})`}>
          <ul className="divide-y divide-[var(--color-border)]">
            {inv.credit_notes.map((n) => (
              <li key={n.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono text-xs">{n.note_number}<span className="text-[var(--color-muted)] font-sans"> · {n.reason || "no reason given"}</span></span>
                <span className="tabular-nums font-medium">{formatCurrency(Number(n.total_amount))}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(inv.terms || inv.notes) && (
        <Section title="Terms and notes">
          <div className="px-4 py-3 space-y-3 text-sm">
            {inv.terms && <div><p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1">Terms</p><p className="whitespace-pre-wrap">{inv.terms}</p></div>}
            {inv.notes && <div><p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1">Notes</p><p className="whitespace-pre-wrap">{inv.notes}</p></div>}
          </div>
        </Section>
      )}

      {/* The signed PO, the delivery proof, the email agreeing the price — previously these
          lived in someone's inbox because a record could not hold a file. */}
      <Section title={`Attachments (${attachments.length})`} icon={<Paperclip size={14} />}>
        <div className="px-4 py-3 space-y-2">
          {attachments.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">Nothing attached yet. Add the PO or the delivery proof so the next person doesn't have to go looking.</p>
          )}
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{a.label || a.name}
                <span className="text-[10px] text-[var(--color-muted)]"> · {(a.size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                onClick={async () => {
                  if (!await confirm({ title: `Remove "${a.label || a.name}" from this invoice?`, body: "The file stays in your document vault.", confirmLabel: "Remove" })) return;
                  try { await api.delete(`/api/records/attachments/${a.id}`); loadSidecars(); }
                  catch { toast.error("Couldn't remove that"); }
                }}
                className="shrink-0 text-[var(--color-muted)] hover:text-red-400" aria-label={`Remove ${a.name}`}><Trash2 size={12} /></button>
            </div>
          ))}
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline cursor-pointer">
            <Paperclip size={12} /> {busy === "attach" ? "Uploading…" : "Attach a file"}
            <input type="file" className="sr-only" disabled={busy === "attach"}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void attachFile(f); e.target.value = ""; }} />
          </label>
        </div>
      </Section>

      {revisions.length > 0 && (
        <Section title={`Earlier versions (${revisions.length})`} icon={<History size={14} />}>
          <ul className="divide-y divide-[var(--color-border)]">
            {revisions.map((r) => (
              <li key={r.id} className="px-4 py-2.5 text-xs flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium">v{r.version}</span>
                  <span className="text-[var(--color-muted)]"> · {r.customer_name} · {formatCurrency(Number(r.total_amount))}</span>
                  {r.reason && <span className="text-[var(--color-muted)]"> · {r.reason}</span>}
                </span>
                <span className="text-[var(--color-muted)] shrink-0">
                  {r.changed_by_email ? `${r.changed_by_email.split("@")[0]} · ` : ""}{new Date(r.changed_at).toLocaleDateString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {inv.reminders.length > 0 && (
        <Section title={`Reminders sent (${inv.reminders.length})`}>
          <ul className="divide-y divide-[var(--color-border)]">
            {inv.reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span>{new Date(r.reminded_at).toLocaleString("en-IN")} · {r.channel}</span>
                <span className="text-[var(--color-muted)]">{r.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {voidOpen && (
        <VoidModal invoice={inv} onClose={() => setVoidOpen(false)} onVoided={() => { setVoidOpen(false); load(); loadSidecars(); }} />
      )}
    </RecordShell>
  );
}

/**
 * Voiding, as distinct from deleting. Cancelling used to mean deleting the invoice, which
 * punched a hole in the number sequence — the one thing a numbered statutory document must
 * never have. A void keeps the number, keeps the paper trail, and records why.
 */
function VoidModal({ invoice, onClose, onVoided }: { invoice: Invoice; onClose: () => void; onVoided: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/invoices/${invoice.id}/void`, { reason: reason.trim() });
      toast.success(`${invoice.invoice_number} voided`);
      onVoided();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't void it"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Void ${invoice.invoice_number}?`}
      description="The invoice stays, marked void, and its number is never reused. This is what to do instead of deleting a numbered document."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
               <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={submit}>Void this invoice</Button></>}>
      <TextAreaField label="Why is this being voided?" required value={reason}
        onChange={(e) => setReason(e.target.value)}
        help="Printed on the invoice and kept in the audit trail — write what an auditor would need to read."
        placeholder="e.g. Raised on the wrong entity; re-issued as INV-2026-031." />
    </Modal>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
        {icon}<h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export { Loader2 };
