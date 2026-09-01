import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, GitMerge, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import DataTable, { type Column, type TableQuery } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/Confirm";
import { TextField, SelectField, ErrorSummary } from "@/components/ui/Field";
import { useListQuery } from "@/hooks/useListQuery";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import EmptyState from "@/components/EmptyState";

/**
 * /customers — a page the product did not have.
 *
 * A customer used to exist only as free text on an invoice, so there was nothing to open,
 * nothing to correct, and no way to see what someone owed you across their invoices. This
 * is the master list: who they are, what they owe, and how far past their limit they are.
 */
export type Customer = {
  id: string; name: string; gstin: string | null; pan: string | null;
  email: string | null; phone: string | null;
  billing_city: string | null; billing_state: string | null; place_of_supply_code: string | null;
  gst_treatment: string; payment_terms_days: number; credit_limit: string;
  opening_balance: string; outstanding: string | number; invoice_count: number;
  last_invoice_at: string | null; archived_at: string | null; tags: string[];
};

const TREATMENT_LABEL: Record<string, string> = {
  regular: "Regular", composition: "Composition", unregistered: "Unregistered",
  overseas: "Overseas", sez: "SEZ", deemed_export: "Deemed export",
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { query, setQuery, toApiQuery, filters, setFilter } = useListQuery({ limit: 50, sort: "name", order: "asc" });
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeRows, setMergeRows] = useState<Customer[]>([]);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<{ data: Customer[]; total: number }>(`/api/customers?${toApiQuery()}`)
      .then((r) => { setRows(r.data); setTotal(r.total); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load customers"))
      .finally(() => setLoading(false));
  }, [toApiQuery]);
  useEffect(() => { load(); }, [load]);

  const showingArchived = filters.archived === "1";

  const COLUMNS: Column<Customer>[] = [
    { key: "name", header: "Customer", locked: true,
      render: (c) => (
        <>
          <p className="font-medium truncate max-w-[220px]">{c.name}</p>
          <p className="text-[10px] text-[var(--color-muted)]">
            {c.gstin ? <span className="font-mono">{c.gstin}</span> : TREATMENT_LABEL[c.gst_treatment] ?? c.gst_treatment}
          </p>
        </>
      ) },
    { key: "billing_city", header: "City", hideOnMobile: true,
      render: (c) => <span className="text-xs text-[var(--color-muted)]">{[c.billing_city, c.billing_state].filter(Boolean).join(", ") || "—"}</span> },
    { key: "email", header: "Contact", defaultHidden: true, hideOnMobile: true,
      render: (c) => <span className="text-xs text-[var(--color-muted)]">{c.email || c.phone || "—"}</span> },
    { key: "outstanding", header: "Outstanding", align: "right", sortable: false, total: "sum",
      value: (c) => Number(c.outstanding) || 0,
      render: (c) => {
        const out = Number(c.outstanding) || 0;
        const limit = Number(c.credit_limit) || 0;
        const over = limit > 0 && out > limit;
        return (
          <>
            <p className={`font-semibold ${out > 0 ? "" : "text-[var(--color-muted)]"}`}>{formatCurrency(out)}</p>
            {over && <p className="text-[10px] text-red-400">over limit by {formatCurrency(out - limit)}</p>}
          </>
        );
      } },
    { key: "credit_limit", header: "Credit limit", align: "right", defaultHidden: true,
      value: (c) => Number(c.credit_limit) || 0,
      render: (c) => Number(c.credit_limit) > 0 ? formatCurrency(Number(c.credit_limit)) : <span className="text-[var(--color-muted)]">none set</span> },
    { key: "payment_terms_days", header: "Terms", align: "right", hideOnMobile: true,
      render: (c) => c.payment_terms_days > 0 ? `Net ${c.payment_terms_days}` : <span className="text-[var(--color-muted)]">on receipt</span> },
    { key: "invoice_count", header: "Invoices", align: "right", sortable: false, total: "sum",
      value: (c) => c.invoice_count,
      render: (c) => <span className="tabular-nums">{c.invoice_count}</span> },
  ];

  const archive = async (targets: Customer[], clear: () => void) => {
    if (!await confirm({
      title: showingArchived ? `Restore ${targets.length} customer${targets.length === 1 ? "" : "s"}?` : `Archive ${targets.length} customer${targets.length === 1 ? "" : "s"}?`,
      body: showingArchived
        ? "They'll appear in the active list and in pickers again."
        : "They stay out of pickers and the active list, but every invoice, receipt and ledger entry is untouched. You can restore them any time.",
      confirmLabel: showingArchived ? "Restore" : "Archive",
    })) return;
    let ok = 0;
    for (const c of targets) {
      try { await api.post(`/api/customers/${c.id}/archive`, { archived: !showingArchived }); ok++; } catch { /* counted */ }
    }
    toast.success(`${ok} ${showingArchived ? "restored" : "archived"}`);
    clear(); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            One record per customer — their details, what they owe, and every document that moved the balance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<GitMerge size={13} />}
            onClick={() => { setMergeRows(rows); setMergeOpen(true); }}
            title="Fold duplicate customers into one">Merge duplicates</Button>
          <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setShowNew(true)}>New customer</Button>
        </div>
      </div>

      <DataTable<Customer>
        listKey="customers"
        exportName="customers"
        columns={COLUMNS}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        onRetry={load}
        serverMode
        total={total}
        query={query}
        onQueryChange={(q: TableQuery) => setQuery(q)}
        searchPlaceholder="Find a customer by name, GSTIN, email, phone or city…"
        onRowClick={(c) => navigate(`/customers/${c.id}`)}
        toolbar={
          <button type="button"
            onClick={() => setFilter("archived", showingArchived ? null : "1")}
            className={`px-3 py-2 rounded-lg border text-xs font-medium ${showingArchived
              ? "border-[var(--color-primary)] text-[var(--color-primary)]"
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {showingArchived ? "Showing archived" : "Show archived"}
          </button>
        }
        bulkActions={(sel, clear) => (
          <Button size="sm" variant="secondary" icon={<Archive size={12} />} onClick={() => archive(sel, clear)}>
            {showingArchived ? "Restore" : "Archive"}
          </Button>
        )}
        empty={
          <EmptyState
            icon={Users}
            title={showingArchived ? "No archived customers" : "No customers yet"}
            description={showingArchived
              ? "Customers you archive will show up here, with their history intact."
              : "Add one here, or just raise an invoice — the customer is created from it automatically and shows up on this list."}
            ctaText={showingArchived ? undefined : "Add a customer"}
            onCta={showingArchived ? undefined : () => setShowNew(true)}
          />
        }
      />

      {showNew && <NewCustomerModal onClose={() => setShowNew(false)} onCreated={(c) => { setShowNew(false); navigate(`/customers/${c.id}`); }} />}
      {mergeOpen && <MergeModal candidates={mergeRows} onClose={() => setMergeOpen(false)} onMerged={() => { setMergeOpen(false); load(); }} />}
    </div>
  );
}

/** Create a customer. Inline field errors + an error summary, and a guard on unsaved work. */
function NewCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Customer) => void }) {
  const [form, setForm] = useState({ name: "", gstin: "", email: "", phone: "", billing_city: "", payment_terms_days: "30", credit_limit: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = Object.values(form).some((v, i) => v !== Object.values({ name: "", gstin: "", email: "", phone: "", billing_city: "", payment_terms_days: "30", credit_limit: "" })[i]);
  const { guard } = useUnsavedChanges(dirty && !busy);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const c = await api.post<Customer>("/api/customers", {
        name: form.name, gstin: form.gstin || undefined, email: form.email || undefined,
        phone: form.phone || undefined, billing_city: form.billing_city || undefined,
        payment_terms_days: Number(form.payment_terms_days) || 0,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : 0,
      });
      toast.success(`${c.name} added`);
      onCreated(c);
    } catch (err) {
      // The API returns per-field errors; show them ON the fields rather than as one toast.
      const msg = err instanceof Error ? err.message : "Couldn't save that customer";
      const m = /already have a customer called/.test(msg);
      setErrors(m ? { name: msg } : { form: msg });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => void guard(onClose)} title="New customer"
      description="Only the name is required — everything else can be filled in later."
      onBeforeClose={async () => !dirty || window.confirm("Discard this customer?")}
      footer={
        <>
          <Button variant="ghost" onClick={() => void guard(onClose)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={(e) => submit(e as unknown as React.FormEvent)}>Add customer</Button>
        </>
      }>
      <form onSubmit={submit} className="space-y-4">
        <ErrorSummary errors={errors} />
        <TextField label="Customer name" required value={form.name} onChange={set("name")} error={errors.name}
          placeholder="e.g. Nimbus Exports Pvt Ltd" autoFocus />
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="GSTIN" value={form.gstin} onChange={set("gstin")} error={errors.gstin}
            placeholder="27AAPFU0939F1ZV" help="We'll fill in the PAN and place of supply from this." />
          <TextField label="City" value={form.billing_city} onChange={set("billing_city")} />
          <TextField label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email}
            help="Where invoices and reminders go." />
          <TextField label="Phone" value={form.phone} onChange={set("phone")} error={errors.phone}
            placeholder="9876543210" help="Used for WhatsApp reminders." />
          <TextField label="Payment terms (days)" type="number" min={0} max={365} value={form.payment_terms_days} onChange={set("payment_terms_days")}
            help="Due date on new invoices is set from this." />
          <TextField label="Credit limit" type="number" min={0} value={form.credit_limit} onChange={set("credit_limit")}
            placeholder="0 = no limit" help="You'll be warned when their outstanding goes past it." />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Fold duplicates into one record — the cleanup free-text names made necessary. */
function MergeModal({ candidates, onClose, onMerged }: { candidates: Customer[]; onClose: () => void; onMerged: () => void }) {
  const [keepId, setKeepId] = useState("");
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Surface likely duplicates rather than making the user spot them: same first word, or
  // one name contained in another.
  const norm = (s: string) => s.toLowerCase().replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|and|&)\b/g, "").replace(/[^a-z0-9]/g, "");
  const suspects = candidates.filter((a) =>
    candidates.some((b) => b.id !== a.id && (norm(a.name).includes(norm(b.name)) || norm(b.name).includes(norm(a.name)))));

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ kept: string; merged: string[]; invoices_moved: number }>("/api/customers/merge", { keepId, mergeIds });
      toast.success(`Merged into ${r.kept}`, { description: `${r.invoices_moved} invoice(s) moved across.` });
      onMerged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't merge those"); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Merge duplicate customers"
      description="Invoices, receipts and contacts move to the customer you keep. Opening balances are added together. This can't be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={!keepId || !mergeIds.length} onClick={run}>
            Merge {mergeIds.length || ""} into one
          </Button>
        </>
      }>
      {suspects.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Nothing on this page looks like a duplicate. Search for the names you have in mind, then come back — merging works on whatever is listed.
        </p>
      ) : (
        <div className="space-y-4">
          <SelectField label="Keep this customer" value={keepId} onChange={(e) => { setKeepId(e.target.value); setMergeIds((m) => m.filter((x) => x !== e.target.value)); }} required>
            <option value="">Choose the record to keep…</option>
            {suspects.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.invoice_count} invoice(s)</option>)}
          </SelectField>
          <div>
            <p className="text-xs font-medium text-[var(--color-muted)] mb-2">Fold these into it</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {suspects.filter((c) => c.id !== keepId).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-[var(--color-accent)] cursor-pointer">
                  <input type="checkbox" className="accent-[var(--color-primary)]"
                    checked={mergeIds.includes(c.id)}
                    onChange={(e) => setMergeIds((m) => e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id))} />
                  <span>{c.name}</span>
                  <span className="text-xs text-[var(--color-muted)]">· {c.invoice_count} invoice(s) · {formatCurrency(Number(c.outstanding) || 0)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
