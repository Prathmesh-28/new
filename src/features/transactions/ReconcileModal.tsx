import { useMemo, useState } from "react";
import { X, Copy, AlertCircle, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Transaction } from "@/data/types";

/* Ledger hygiene / reconciliation. Without a live bank feed, the highest-value
   checks are (1) likely duplicate entries and (2) rows missing a counterparty,
   both of which quietly corrupt forecasts and analytics. Surfaces them with
   one-click fixes. */
export default function ReconcileModal({ onClose }: { onClose: () => void }) {
  const { store, updateTransaction, deleteTransaction, canEdit } = useApp();
  const txns = store.transactions ?? [];
  const editable = canEdit();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Duplicate groups: same absolute amount + same date. Each group is a set of
  // rows that are almost certainly the same payment entered twice.
  const dupGroups = useMemo(() => {
    const by = new Map<string, Transaction[]>();
    for (const t of txns) {
      const key = `${t.date}|${Math.abs(t.amount)}`;
      const arr = by.get(key) ?? [];
      arr.push(t); by.set(key, arr);
    }
    return [...by.entries()]
      .filter(([k, arr]) => arr.length > 1 && !dismissed.has(k))
      .map(([k, arr]) => ({ key: k, txns: arr }));
  }, [txns, dismissed]);

  const missing = useMemo(
    () => txns.filter((t) => !t.counterparty || !t.counterparty.trim()),
    [txns]
  );

  // Delete/update on the SERVER first - TransactionsPage's own mount effect fully
  // replaces store.transactions from GET /api/transactions, so a KV-only edit here
  // used to be silently reverted the next time that page (re)loaded.
  const [busyId, setBusyId] = useState<string | null>(null);
  const delDup = async (t: Transaction) => {
    setBusyId(t.id);
    try {
      await api.delete(`/api/transactions/${t.id}`);
      deleteTransaction(t.id);
      toast.success("Duplicate removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete - it will reappear on refresh");
    } finally { setBusyId(null); }
  };
  const setParty = async (t: Transaction, name: string) => {
    setBusyId(t.id);
    try {
      await api.patch(`/api/transactions/${t.id}`, { merchant_name: name });
      updateTransaction({ ...t, counterparty: name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save - it will revert on refresh");
    } finally { setBusyId(null); }
  };

  const issues = dupGroups.length + missing.length;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center px-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-base font-bold">Reconcile transactions</h2>
            <p className="text-xs text-[var(--color-muted)]">{issues === 0 ? "No issues found - your ledger looks clean." : `${issues} thing${issues === 1 ? "" : "s"} to review`}</p>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]"><X size={18} /></button>
        </div>

        <div className="overflow-auto p-5 space-y-6">
          {/* Duplicates */}
          {dupGroups.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5"><Copy size={13} /> Possible duplicates</h3>
              <div className="space-y-3">
                {dupGroups.map((g) => (
                  <div key={g.key} className="border border-[var(--color-border)] rounded-lg p-3">
                    {g.txns.map((t, i) => (
                      <div key={t.id} className={`flex items-center justify-between gap-3 ${i > 0 ? "mt-2 pt-2 border-t border-[var(--color-border)]" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{t.description || t.counterparty || "-"}</p>
                          <p className="text-xs text-[var(--color-muted)] tabular-nums">{t.date} · <span className={t.amount < 0 ? "text-red-400" : "text-green-400"}>{formatCurrency(t.amount)}</span> · {t.category}</p>
                        </div>
                        {editable && (
                          <button onClick={() => delDup(t)} disabled={busyId === t.id} className="flex items-center gap-1 text-xs text-red-400 hover:bg-red-500/10 px-2 py-1 rounded shrink-0 disabled:opacity-50"><Trash2 size={12} /> {busyId === t.id ? "Deleting…" : "Delete"}</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => setDismissed((s) => new Set(s).add(g.key))} className="mt-2 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] flex items-center gap-1"><Check size={11} /> Not a duplicate</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Missing counterparty */}
          {missing.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2 flex items-center gap-1.5"><AlertCircle size={13} /> Missing payer / payee</h3>
              <div className="space-y-2">
                {missing.slice(0, 20).map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.description || "-"}</p>
                      <p className="text-xs text-[var(--color-muted)] tabular-nums">{t.date} · {formatCurrency(t.amount)}</p>
                    </div>
                    {editable && (
                      <input placeholder="Add name…" defaultValue=""
                        onBlur={(e) => { if (e.target.value.trim()) setParty(t, e.target.value.trim()); }}
                        className="w-36 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]" />
                    )}
                  </div>
                ))}
                {missing.length > 20 && <p className="text-xs text-[var(--color-muted)]">+{missing.length - 20} more</p>}
              </div>
            </section>
          )}

          {issues === 0 && (
            <div className="py-10 text-center">
              <Check size={28} className="mx-auto mb-3 text-green-400" />
              <p className="text-sm text-[var(--color-muted)]">Nothing to reconcile. Duplicates and incomplete entries will show up here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
