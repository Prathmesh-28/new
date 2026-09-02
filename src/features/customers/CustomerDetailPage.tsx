import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Archive, Copy, ExternalLink, FileText, Link2, Plus, Receipt, Save, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { deleteWithUndo } from "@/lib/undo";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/Confirm";
import { TextField, SelectField, TextAreaField } from "@/components/ui/Field";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { useTrackView } from "@/hooks/useRecentlyViewed";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import RecordShell, { CopyValue, Detail } from "@/features/records/RecordShell";

/**
 * /customers/:id — the customer 360 the product never had.
 *
 * Everything about one customer in one place: what they owe, how far past their credit
 * limit they are, every document that moved the balance, the people who actually pay,
 * and the details (place of supply, terms, GST treatment) that decide how their next
 * invoice is taxed.
 */
type Contact = { id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean };
type Customer = {
  id: string; name: string; display_name: string | null; gstin: string | null; pan: string | null;
  email: string | null; phone: string | null;
  billing_line1: string | null; billing_line2: string | null; billing_city: string | null;
  billing_state: string | null; billing_state_code: string | null; billing_pincode: string | null;
  place_of_supply_code: string | null; gst_treatment: string; tds_section: string | null;
  payment_terms_days: number; credit_limit: string; opening_balance: string; opening_balance_date: string | null;
  notes: string | null; tags: string[]; archived_at: string | null; created_at: string; updated_at: string;
  do_not_contact: boolean; do_not_contact_reason: string | null;
  contacts: Contact[];
  outstanding: number; overdue: number; lifetime_billed: number; invoice_count: number;
  last_invoice_at: string | null; credit_available: number | null; over_limit: boolean;
};
type LedgerEntry = { at: string; kind: "invoice" | "receipt" | "credit_note"; ref_id: string; ref: string; debit: number; credit: number; balance: number; note: string };
type Ledger = { opening_balance: number; entries: LedgerEntry[]; closing_balance: number };
type StateOpt = { code: string; name: string };

const TREATMENTS = [
  ["regular", "Regular (registered)"], ["composition", "Composition scheme"], ["unregistered", "Unregistered / B2C"],
  ["overseas", "Overseas (export)"], ["sez", "SEZ"], ["deemed_export", "Deemed export"],
] as const;

export default function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [cust, setCust] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [states, setStates] = useState<StateOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ledger" | "advances" | "details" | "contacts" | "portal">("ledger");
  const [addContact, setAddContact] = useState(false);
  const [portal, setPortal] = useState<PortalLink | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Customer>(`/api/customers/${id}`)
      .then(setCust)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load this customer"))
      .finally(() => setLoading(false));
    api.get<Ledger>(`/api/customers/${id}/ledger`).then(setLedger).catch(() => setLedger(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<StateOpt[]>("/api/customers/meta/states").then(setStates).catch(() => setStates([])); }, []);
  const loadPortal = useCallback(() => {
    api.get<PortalLink | null>(`/api/customers/${id}/portal-link`).then(setPortal).catch(() => setPortal(null));
  }, [id]);
  useEffect(() => { loadPortal(); }, [loadPortal]);

  useTrackView(cust ? { entity: "customer", id: cust.id, label: cust.name, href: `/customers/${cust.id}` } : null);

  const archive = async () => {
    if (!cust) return;
    const on = !cust.archived_at;
    if (!await confirm({
      title: on ? `Archive ${cust.name}?` : `Restore ${cust.name}?`,
      body: on ? "They come out of pickers and the active list. Every invoice and ledger entry stays exactly as it is." : "They'll appear in the active list and pickers again.",
      confirmLabel: on ? "Archive" : "Restore",
    })) return;
    try { await api.post(`/api/customers/${cust.id}/archive`, { archived: on }); toast.success(on ? "Archived" : "Restored"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't do that"); }
  };

  const del = async () => {
    if (!cust) return;
    if (cust.invoice_count > 0) {
      toast.error(`${cust.name} has ${cust.invoice_count} invoice(s)`, { description: "Archive them instead — deleting would leave that history without a customer." });
      return;
    }
    if (!await confirm({ title: `Delete ${cust.name}?`, body: "They go to Trash for 30 days.", danger: true, confirmLabel: "Delete" })) return;
    await deleteWithUndo({ label: cust.name, remove: () => api.delete(`/api/customers/${cust.id}`), onDone: () => navigate("/customers"),
      // Land back ON the restored record — re-running onDone would re-navigate to a list
      // that never refetches, so the record returns server-side and the user never sees it.
      onRestore: (r) => navigate(r.href || "/customers") });
  };

  if (loading) return <div className="max-w-7xl mx-auto"><LoadingState rows={6} label="Loading customer" /></div>;
  if (error || !cust) return <div className="max-w-7xl mx-auto"><ErrorState title="Couldn't open this customer" message={error ?? undefined} onRetry={load} /></div>;

  return (
    <RecordShell
      entity="customer" entityId={cust.id}
      backTo="/customers" backLabel="All customers"
      title={cust.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {cust.gstin ? <CopyValue value={cust.gstin} /> : <span>{TREATMENTS.find(([k]) => k === cust.gst_treatment)?.[1] ?? cust.gst_treatment}</span>}
          {cust.email && <span>· {cust.email}</span>}
          {cust.phone && <span>· {cust.phone}</span>}
        </span>
      }
      meta={{ createdAt: cust.created_at, updatedAt: cust.updated_at }}
      badges={
        <>
          {cust.archived_at && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-border)]/50 text-[var(--color-muted)] font-semibold uppercase">Archived</span>}
          {cust.over_limit && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">Over credit limit</span>}
          {cust.overdue > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold">{formatCurrency(cust.overdue)} overdue</span>}
          {cust.do_not_contact && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold"
              title={cust.do_not_contact_reason || "Automated reminders are suppressed for this customer"}>Do not contact</span>
          )}
        </>
      }
      actions={
        <>
          <Button size="sm" variant="primary" icon={<FileText size={13} />}
            onClick={() => navigate(`/invoices?compose=1&customer=${encodeURIComponent(cust.name)}`)}>New invoice</Button>
          <Button size="sm" icon={<Archive size={13} />} onClick={archive}>{cust.archived_at ? "Restore" : "Archive"}</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={del} title="Delete (only possible with no invoices)" />
        </>
      }
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Detail label="Outstanding" value={<span className={`font-bold text-base ${cust.outstanding > 0 ? "text-amber-400" : "text-[var(--color-primary)]"}`}>{formatCurrency(cust.outstanding)}</span>} />
        <Detail label="Overdue" value={<span className={cust.overdue > 0 ? "text-red-400 font-semibold" : ""}>{formatCurrency(cust.overdue)}</span>} />
        <Detail label="Billed to date" value={formatCurrency(cust.lifetime_billed)} />
        <Detail label="Credit available" value={
          cust.credit_available == null
            ? <span className="text-[var(--color-muted)]">No limit set</span>
            : <span className={cust.credit_available < 0 ? "text-red-400 font-semibold" : ""}>{formatCurrency(cust.credit_available)}</span>} />
      </div>

      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit" role="tablist">
        {([["ledger", "Ledger"], ["advances", "Advances"], ["contacts", `Contacts (${cust.contacts.length})`], ["details", "Details"], ["portal", "Customer portal"]] as const).map(([id2, label]) => (
          <button key={id2} role="tab" aria-selected={tab === id2} onClick={() => setTab(id2)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${tab === id2 ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "ledger" && <LedgerTable ledger={ledger} />}
      {tab === "contacts" && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold">People at {cust.name}</h2>
            <Button size="sm" variant="secondary" icon={<UserPlus size={12} />} onClick={() => setAddContact(true)}>Add contact</Button>
          </div>
          {cust.contacts.length === 0 ? (
            <p className="px-4 py-8 text-sm text-[var(--color-muted)] text-center">
              No contacts yet. The person who signs the PO and the person who pays it are rarely the same — add both so reminders reach the right one.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {cust.contacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{c.name} {c.is_primary && <span className="text-[10px] text-[var(--color-primary)]">· primary</span>}</p>
                    <p className="text-xs text-[var(--color-muted)]">{[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "No details"}</p>
                  </div>
                  <button onClick={async () => {
                    if (!await confirm({ title: `Remove ${c.name}?`, danger: true, confirmLabel: "Remove" })) return;
                    try { await api.delete(`/api/customers/${cust.id}/contacts/${c.id}`); load(); } catch { toast.error("Couldn't remove that contact"); }
                  }} className="text-[var(--color-muted)] hover:text-red-400" aria-label={`Remove ${c.name}`}><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tab === "advances" && <AdvancesPanel customerId={cust.id} onChanged={load} />}
      {tab === "details" && <DetailsForm cust={cust} states={states} onSaved={load} />}
      {tab === "portal" && (
        <PortalPanel
          customerName={cust.name}
          link={portal}
          freshToken={freshToken}
          busy={portalBusy}
          onCreate={async (days) => {
            setPortalBusy(true);
            try {
              const r = await api.post<{ token: string; path: string }>(`/api/customers/${cust.id}/portal-link`, { expiresInDays: days });
              setFreshToken(r.token);
              toast.success("Link created", { description: "Copy it now — it can't be shown again, only replaced." });
              loadPortal();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create the link"); }
            finally { setPortalBusy(false); }
          }}
          onRevoke={async () => {
            if (!await confirm({
              title: "Turn off this customer's link?",
              body: "Anyone holding it — including the customer — stops being able to open it. You can issue a new one afterwards.",
              danger: true, confirmLabel: "Turn it off",
            })) return;
            setPortalBusy(true);
            try { await api.delete(`/api/customers/${cust.id}/portal-link`); setFreshToken(null); toast.success("Link turned off"); loadPortal(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't turn it off"); }
            finally { setPortalBusy(false); }
          }}
        />
      )}

      {addContact && (
        <AddContactModal customerId={cust.id} onClose={() => setAddContact(false)} onAdded={() => { setAddContact(false); load(); }} />
      )}
    </RecordShell>
  );
}

function LedgerTable({ ledger }: { ledger: Ledger | null }) {
  if (!ledger) return <LoadingState rows={4} label="Loading ledger" />;
  const ICON = { invoice: FileText, receipt: Receipt, credit_note: Receipt };
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold">Ledger</h2>
        <p className="text-[11px] text-[var(--color-muted)]">Every document that moved this balance, oldest first.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm rcard">
          <thead className="border-b border-[var(--color-border)]">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Document</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Invoiced</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Received</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            <tr className="text-[var(--color-muted)]">
              <td data-label="Date" className="px-4 py-2.5 text-xs">Opening</td>
              <td data-label="Document" className="px-4 py-2.5 text-xs">Balance brought forward</td>
              <td data-label="Invoiced" className="px-4 py-2.5" /><td data-label="Received" className="px-4 py-2.5" />
              <td data-label="Balance" className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(ledger.opening_balance)}</td>
            </tr>
            {ledger.entries.map((e, i) => {
              const Icon = ICON[e.kind];
              return (
                <tr key={`${e.ref_id}-${i}`}>
                  <td data-label="Date" className="px-4 py-2.5 text-xs">{new Date(e.at).toLocaleDateString("en-IN")}</td>
                  <td data-label="Document" className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Icon size={11} className="text-[var(--color-muted)]" />
                      {e.kind === "invoice"
                        ? <Link to={`/invoices/${e.ref_id}`} className="font-mono text-[var(--color-primary)] hover:underline">{e.ref}</Link>
                        : <span className="font-mono">{e.ref}</span>}
                      <span className="text-[var(--color-muted)]">{e.kind === "credit_note" ? "credit note" : e.note}</span>
                    </span>
                  </td>
                  <td data-label="Invoiced" className="px-4 py-2.5 text-right tabular-nums">{e.debit ? formatCurrency(e.debit) : "—"}</td>
                  <td data-label="Received" className="px-4 py-2.5 text-right tabular-nums text-[var(--color-primary)]">{e.credit ? formatCurrency(e.credit) : "—"}</td>
                  <td data-label="Balance" className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(e.balance)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]/40">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold">Closing balance</td>
              <td className="px-4 py-3 text-right tabular-nums font-bold">{formatCurrency(ledger.closing_balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DetailsForm({ cust, states, onSaved }: { cust: Customer; states: StateOpt[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: cust.name, gstin: cust.gstin ?? "", pan: cust.pan ?? "", email: cust.email ?? "", phone: cust.phone ?? "",
    billing_line1: cust.billing_line1 ?? "", billing_city: cust.billing_city ?? "", billing_pincode: cust.billing_pincode ?? "",
    place_of_supply_code: cust.place_of_supply_code ?? "", gst_treatment: cust.gst_treatment,
    payment_terms_days: String(cust.payment_terms_days), credit_limit: String(Number(cust.credit_limit) || 0),
    opening_balance: String(Number(cust.opening_balance) || 0), notes: cust.notes ?? "",
    do_not_contact: !!cust.do_not_contact, do_not_contact_reason: cust.do_not_contact_reason ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const initial = JSON.stringify(form);
  const [baseline] = useState(initial);
  const dirty = initial !== baseline;
  useUnsavedChanges(dirty && !busy);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: "" }));
  };

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      await api.patch(`/api/customers/${cust.id}`, {
        ...form,
        payment_terms_days: Number(form.payment_terms_days) || 0,
        credit_limit: Number(form.credit_limit) || 0,
        opening_balance: Number(form.opening_balance) || 0,
      });
      toast.success("Saved");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save";
      setErrors({ form: msg });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField label="Customer name" required value={form.name} onChange={set("name")} error={errors.name} />
        <TextField label="GSTIN" value={form.gstin} onChange={set("gstin")} error={errors.gstin}
          help="Sets PAN and place of supply automatically." />
        <TextField label="PAN" value={form.pan} onChange={set("pan")} error={errors.pan} />
        <SelectField label="GST treatment" value={form.gst_treatment} onChange={set("gst_treatment")}
          help="Decides how their invoices are taxed.">
          {TREATMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
        <SelectField label="Place of supply" value={form.place_of_supply_code} onChange={set("place_of_supply_code")}
          help="This is what decides IGST vs CGST + SGST — stated here, not guessed from the GSTIN.">
          <option value="">Not set</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
        </SelectField>
        <TextField label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} />
        <TextField label="Phone" value={form.phone} onChange={set("phone")} error={errors.phone} />
        <TextField label="Address" value={form.billing_line1} onChange={set("billing_line1")} />
        <TextField label="City" value={form.billing_city} onChange={set("billing_city")} />
        <TextField label="PIN code" value={form.billing_pincode} onChange={set("billing_pincode")} error={errors.billing_pincode} />
        <TextField label="Payment terms (days)" type="number" min={0} max={365} value={form.payment_terms_days} onChange={set("payment_terms_days")}
          help="New invoices get their due date from this." />
        <TextField label="Credit limit" type="number" min={0} value={form.credit_limit} onChange={set("credit_limit")}
          help="0 means no limit. One number, in one place — not three." />
        <TextField label="Opening balance" type="number" value={form.opening_balance} onChange={set("opening_balance")}
          help="What they already owed before you started using Headroom." />
      </div>
      <TextAreaField label="Notes" value={form.notes} onChange={set("notes")} help="Anything the next person handling this account should know." />

      {/* Suppression. Automated chasers previously kept going out to a customer in a
          dispute because nothing checked; the reminder endpoint now refuses when this is on. */}
      <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-[var(--color-primary)] mt-0.5"
            checked={form.do_not_contact}
            onChange={(e) => { setForm((f) => ({ ...f, do_not_contact: e.target.checked })); }} />
          <span>
            Don't send this customer automated messages
            <span className="block text-xs text-[var(--color-muted)]">
              Payment reminders and statements are blocked for them. You can still send something by hand.
            </span>
          </span>
        </label>
        {form.do_not_contact && (
          <TextField label="Why" value={form.do_not_contact_reason} onChange={set("do_not_contact_reason")}
            placeholder="e.g. disputing the delivery; asked us to stop" help="Shown to whoever tries to chase them." />
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
        <Button variant="primary" icon={<Save size={13} />} loading={busy} onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}

/**
 * Advances (Wave 15). Money received before any invoice exists used to be keyed as a fake
 * receipt or forgotten. Held here against the customer, allocated to invoices later
 * (each allocation is a real numbered receipt), unapplied remainder refundable.
 */
function AdvancesPanel({ customerId, onChanged }: { customerId: string; onChanged: () => void }) {
  type Advance = { id: string; advance_number: string; amount: string; applied_amount: string; refunded_amount: string; available: string; mode: string; reference: string | null; received_at: string };
  type OpenInv = { id: string; invoice_number: string; total_amount: string };
  const confirm = useConfirm();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Advance[]>(`/api/customers/${customerId}/advances`).then(setAdvances).catch(() => setAdvances([]));
  }, [customerId]);
  useEffect(() => { load(); }, [load]);

  const receive = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter the advance amount"); return; }
    setBusy("new");
    try {
      const a = await api.post<{ advance_number: string }>(`/api/customers/${customerId}/advances`, { amount: amt, reference: reference || undefined, mode: "bank" });
      toast.success(`${a.advance_number} recorded`);
      setAmount(""); setReference(""); load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't record that"); }
    finally { setBusy(null); }
  };

  const allocate = async (adv: Advance) => {
    // Ask which open invoice — a lightweight prompt against this customer's own invoices.
    setBusy(adv.id);
    try {
      const open = await api.get<{ data: OpenInv[] }>(`/api/invoices?q=&limit=50&unpaid=1`);
      setBusy(null);
      const invNo = window.prompt(
        `Apply ${adv.advance_number} (₹${Number(adv.available).toLocaleString("en-IN")} unused) to which invoice?\n\nOpen invoices: ${open.data.map(i => i.invoice_number).join(", ") || "none"}\n\nType the invoice number:`);
      if (!invNo?.trim()) return;
      const target = open.data.find(i => i.invoice_number.toLowerCase() === invNo.trim().toLowerCase());
      if (!target) { toast.error(`No open invoice called "${invNo.trim()}"`); return; }
      setBusy(adv.id);
      const r = await api.post<{ applied: number; payment: { receipt_number: string }; gl_note?: string }>(
        `/api/customers/${customerId}/advances/${adv.id}/allocate`, { invoiceId: target.id });
      toast.success(`Applied ${formatCurrency(r.applied)} — receipt ${r.payment.receipt_number}`, { description: r.gl_note });
      load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't allocate that"); }
    finally { setBusy(null); }
  };

  const refund = async (adv: Advance) => {
    if (!await confirm({
      title: `Refund the unused ${formatCurrency(Number(adv.available))} of ${adv.advance_number}?`,
      body: "This records the refund against the advance. Actually moving the money back is a payout — do that through your bank as usual.",
      confirmLabel: "Record the refund",
    })) return;
    setBusy(adv.id);
    try { await api.post(`/api/customers/${customerId}/advances/${adv.id}/refund`, {}); toast.success("Refund recorded"); load(); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't record that"); }
    finally { setBusy(null); }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Advances</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">Money received before an invoice exists. Apply it to invoices as they're raised; refund what's never used.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="block text-xs font-medium text-[var(--color-muted)] mb-1" htmlFor="adv-amt">Amount received</label>
          <input id="adv-amt" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-36 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" /></div>
        <div className="flex-1 min-w-[140px]"><label className="block text-xs font-medium text-[var(--color-muted)] mb-1" htmlFor="adv-ref">Reference</label>
          <input id="adv-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque no."
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" /></div>
        <Button variant="primary" size="sm" loading={busy === "new"} onClick={receive} icon={<Plus size={13} />}>Record advance</Button>
      </div>
      {advances.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">No advances on record for this customer.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {advances.map((a) => {
            const avail = Number(a.available);
            return (
              <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm min-w-0">
                  <span className="font-mono text-xs">{a.advance_number}</span>
                  <span className="text-[var(--color-muted)] text-xs"> · {a.received_at}{a.reference ? ` · ${a.reference}` : ""}</span>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    {formatCurrency(Number(a.amount))} received · {formatCurrency(Number(a.applied_amount))} applied · {formatCurrency(Number(a.refunded_amount))} refunded ·{" "}
                    <span className={avail > 0 ? "text-[var(--color-primary)] font-medium" : ""}>{formatCurrency(avail)} unused</span>
                  </p>
                </div>
                {avail > 0 && (
                  <span className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="secondary" loading={busy === a.id} onClick={() => allocate(a)}>Apply to an invoice</Button>
                    <Button size="sm" variant="ghost" loading={busy === a.id} onClick={() => refund(a)}>Refund</Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type PortalLink = { id: string; token_hint: string; expires_at: string | null; view_count: number; last_viewed_at: string | null; created_at: string };

/**
 * The link a customer opens to see what they owe and pay it — the audit's highest-value
 * money-hygiene gap, because without it every collection loop ends with a person
 * re-attaching a PDF to an email.
 *
 * The token is shown exactly once. Only its hash is stored, so a database dump can't hand
 * out working links to every customer's ledger; the trade-off is that a lost link is
 * replaced, never recovered.
 */
function PortalPanel({
  customerName, link, freshToken, busy, onCreate, onRevoke,
}: {
  customerName: string;
  link: PortalLink | null;
  freshToken: string | null;
  busy: boolean;
  onCreate: (days: number) => void;
  onRevoke: () => void;
}) {
  const [days, setDays] = useState(90);
  const url = freshToken ? `${window.location.origin}/portal/${freshToken}` : null;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-1.5"><Link2 size={14} /> Customer portal link</h2>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          A page {customerName} can open — no login — showing their open invoices, what they've paid, and a
          download for every document. It only ever reaches their own records.
        </p>
      </div>

      {url && (
        <div className="rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--color-primary)]">Copy this now — it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs font-mono outline-none" />
            <Button size="sm" variant="secondary" icon={<Copy size={12} />}
              onClick={() => { navigator.clipboard?.writeText(url).then(() => toast.success("Copied")).catch(() => {}); }}>Copy</Button>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
              title="Open it the way your customer will"><ExternalLink size={13} /></a>
          </div>
        </div>
      )}

      {link ? (
        <div className="rounded-lg border border-[var(--color-border)] p-3 text-xs space-y-1">
          <p className="font-medium">A link is live for this customer</p>
          <p className="text-[var(--color-muted)]">
            Ends in <span className="font-mono">…{link.token_hint}</span>
            {link.expires_at ? ` · expires ${new Date(link.expires_at).toLocaleDateString("en-IN")}` : ""}
          </p>
          <p className="text-[var(--color-muted)]">
            {link.view_count > 0
              ? `Opened ${link.view_count} time${link.view_count === 1 ? "" : "s"}${link.last_viewed_at ? `, last on ${new Date(link.last_viewed_at).toLocaleDateString("en-IN")}` : ""}.`
              : "Not opened yet."}
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">No link is live for this customer.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Valid for</label>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[var(--color-primary)]">
          {[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
        <Button size="sm" variant="primary" loading={busy} onClick={() => onCreate(days)}>
          {link ? "Replace the link" : "Create a link"}
        </Button>
        {link && <Button size="sm" variant="ghost" loading={busy} onClick={onRevoke}>Turn it off</Button>}
      </div>
      {link && (
        <p className="text-[11px] text-[var(--color-muted)]">
          Replacing issues a new link and stops the old one working immediately.
        </p>
      )}
    </div>
  );
}

function AddContactModal({ customerId, onClose, onAdded }: { customerId: string; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ name: "", role: "", email: "", phone: "", is_primary: false });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { await api.post(`/api/customers/${customerId}/contacts`, f); toast.success("Contact added"); onAdded(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add that contact"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Add a contact" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
               <Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={add} icon={<Plus size={13} />}>Add</Button></>}>
      <div className="space-y-3">
        <TextField label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <TextField label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="e.g. Accounts payable" />
        <TextField label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" className="accent-[var(--color-primary)]" checked={f.is_primary} onChange={(e) => setF({ ...f, is_primary: e.target.checked })} />
          Primary contact — reminders and statements go here first
        </label>
      </div>
    </Modal>
  );
}
