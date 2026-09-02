import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Building2, Repeat, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { deleteWithUndo } from "@/lib/undo";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import { SelectField, TextField } from "@/components/ui/Field";
import { LoadingState, ErrorState } from "@/components/EmptyState";
import { useTrackView } from "@/hooks/useRecentlyViewed";
import RecordShell, { Detail } from "./RecordShell";

/**
 * /transactions/:id — a bank line you can open, correct and discuss.
 *
 * There was no endpoint to fetch one transaction and no route to view one, so a
 * miscategorised payment could only be fixed inline in a table row, and there was nowhere
 * to record WHY it was recategorised. "Nearby" shows the days either side so opening one
 * doesn't lose the user's place in the statement.
 */
type Nearby = { id: string; transaction_date: string; amount: string; merchant_name: string | null; description_raw: string | null };
type Txn = {
  id: string; amount: string; currency: string; description_raw: string | null; merchant_name: string | null;
  category: string; category_confidence: string; is_recurring: boolean; recurrence_cadence: string | null;
  transaction_date: string; source: string; created_at: string;
  bank_account_id: string | null; account_name: string | null; account_type: string | null; provider: string | null;
  nearby: Nearby[];
};

const CATEGORIES = [
  "uncategorized", "sales", "salary", "rent", "utilities", "fuel", "travel", "supplies",
  "professional_fees", "marketing", "interest", "tax", "transfer", "loan", "other",
];

export default function TransactionDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [txn, setTxn] = useState<Txn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "", merchant_name: "" });

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Txn>(`/api/transactions/${id}`)
      .then((t) => { setTxn(t); setForm({ category: t.category, merchant_name: t.merchant_name ?? "" }); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load this transaction"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useTrackView(txn ? {
    entity: "transaction", id: txn.id,
    label: `${txn.merchant_name || txn.description_raw || "Transaction"} · ${formatCurrency(Number(txn.amount))}`,
    href: `/transactions/${txn.id}`,
  } : null);

  const save = async () => {
    if (!txn) return;
    setSaving(true);
    try {
      await api.patch(`/api/transactions/${txn.id}`, { category: form.category, merchant_name: form.merchant_name || null });
      toast.success("Saved");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save that"); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!txn) return;
    if (!await confirm({
      title: "Delete this transaction?",
      body: `${txn.merchant_name || txn.description_raw || "Transaction"} · ${formatCurrency(Number(txn.amount))}. It goes to Trash for 30 days.`,
      danger: true, confirmLabel: "Delete",
    })) return;
    await deleteWithUndo({
      label: "Transaction",
      remove: () => api.delete(`/api/transactions/${txn.id}`),
      onDone: () => { navigate("/transactions"); },
      // Restoring from a detail page must land back ON the record — re-running onDone
      // would just re-navigate to a list that never refetches.
      onRestore: (r) => { navigate(r.href || "/transactions"); },
    });
  };

  if (loading) return <div className="max-w-7xl mx-auto"><LoadingState rows={5} label="Loading transaction" /></div>;
  if (error || !txn) return <div className="max-w-7xl mx-auto"><ErrorState title="Couldn't open this transaction" message={error ?? undefined} onRetry={load} /></div>;

  const amount = Number(txn.amount);
  const isIn = amount > 0;
  const dirty = form.category !== txn.category || form.merchant_name !== (txn.merchant_name ?? "");
  const lowConfidence = Number(txn.category_confidence) < 0.7;

  return (
    <RecordShell
      entity="transaction" entityId={txn.id}
      backTo="/transactions" backLabel="All transactions"
      title={txn.merchant_name || txn.description_raw || "Transaction"}
      subtitle={<span>{txn.transaction_date}{txn.account_name ? ` · ${txn.account_name}` : ""}</span>}
      meta={{ createdAt: txn.created_at }}
      badges={
        <>
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
            isIn ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" : "bg-red-500/15 text-red-400"}`}>
            {isIn ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}{isIn ? "Money in" : "Money out"}
          </span>
          {txn.is_recurring && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold">
              <Repeat size={9} /> {txn.recurrence_cadence || "recurring"}
            </span>
          )}
        </>
      }
      actions={<Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={del} title="Delete (recoverable for 30 days)" />}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
        <p className={`text-3xl font-bold tabular-nums ${isIn ? "text-[var(--color-primary)]" : ""}`}>
          {isIn ? "+" : "−"}{formatCurrency(Math.abs(amount))}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[var(--color-border)]">
          <Detail label="Date" value={txn.transaction_date} />
          <Detail label="Account" value={txn.account_name || "Unlinked"} />
          <Detail label="Source" value={txn.source} />
          <Detail label="Currency" value={txn.currency} />
        </div>
        {txn.description_raw && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1">As it appeared on the statement</p>
            <p className="text-sm font-mono break-words">{txn.description_raw}</p>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-[var(--color-muted)]" />
          <h2 className="text-sm font-semibold">How this is classified</h2>
        </div>
        {lowConfidence && (
          <p className="text-xs text-amber-400">
            This was categorised automatically and the match wasn't confident. Correcting it here also improves
            what the forecast and the P&amp;L show.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </SelectField>
          <TextField label="Who it was with" value={form.merchant_name}
            onChange={(e) => setForm({ ...form, merchant_name: e.target.value })}
            help="A name you'll recognise later, instead of the bank's raw narration." />
        </div>
        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save</Button>
        </div>
      </div>

      {txn.nearby.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
            <Building2 size={14} className="text-[var(--color-muted)]" />
            <h2 className="text-sm font-semibold">Around the same time on this account</h2>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {txn.nearby.map((n) => (
              <li key={n.id}>
                <Link to={`/transactions/${n.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-white/2">
                  <span className="truncate">
                    <span className="text-[var(--color-muted)] text-xs mr-2">{n.transaction_date}</span>
                    {n.merchant_name || n.description_raw || "—"}
                  </span>
                  <span className={`tabular-nums shrink-0 ${Number(n.amount) > 0 ? "text-[var(--color-primary)]" : ""}`}>
                    {Number(n.amount) > 0 ? "+" : "−"}{formatCurrency(Math.abs(Number(n.amount)))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RecordShell>
  );
}
