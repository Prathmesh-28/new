import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Banknote, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/Confirm";
import EmptyState, { LoadingState, ErrorState } from "@/components/EmptyState";

/**
 * /reconcile — match bank credits to the invoices they pay.
 *
 * Reconciliation used to be eyeballs and memory: a credit sat in the bank ledger, the
 * invoice sat in receivables, and a human held the join in their head — so the same
 * receipt could be keyed twice, or never. The server scores the likely pairs (narration
 * quoting the invoice number, exact amount, customer name in the narration) and applying
 * one records a real receipt through the same code path as a manual payment.
 */
type Candidate = { invoice_id: string; invoice_number: string; customer_name: string; outstanding: number; score: number; reasons: string[] };
type Suggestion = { transaction: { id: string; amount: number; date: string; narration: string | null }; candidates: Candidate[] };
type Resp = { suggestions: Suggestion[]; unmatched_credits: number; open_invoices: number };

export default function ReconcilePage() {
  const confirm = useConfirm();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    api.get<Resp>("/api/transactions/match-suggestions")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load suggestions"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const apply = async (s: Suggestion, c: Candidate) => {
    const partial = s.transaction.amount < c.outstanding;
    if (!await confirm({
      title: `Match this credit to ${c.invoice_number}?`,
      body: `${formatCurrency(Math.min(s.transaction.amount, c.outstanding))} will be recorded as a receipt on ${c.customer_name}'s invoice${partial ? " (a part payment — the invoice stays open for the rest)" : s.transaction.amount > c.outstanding ? `. The credit is larger; only the ${formatCurrency(c.outstanding)} balance is applied.` : ", settling it."}`,
      confirmLabel: "Match it",
    })) return;
    setBusy(s.transaction.id);
    try {
      const r = await api.post<{ payment: { receipt_number: string }; note?: string }>(
        `/api/transactions/${s.transaction.id}/match`, { invoiceId: c.invoice_id });
      toast.success(`Matched — receipt ${r.payment.receipt_number}`, { description: r.note });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't match that"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Bank matching</h1>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {data ? `${data.unmatched_credits} unmatched credit${data.unmatched_credits === 1 ? "" : "s"} · ${data.open_invoices} open invoice${data.open_invoices === 1 ? "" : "s"}. ` : ""}
            One click records the receipt and stamps both sides, so nothing is keyed twice.
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={load}>Refresh</Button>
      </div>

      {loading ? <LoadingState rows={4} label="Scoring likely matches" />
      : error ? <ErrorState message={error} onRetry={load} />
      : !data || data.suggestions.length === 0 ? (
        <EmptyState icon={Banknote} title="Nothing to match"
          description={data && data.unmatched_credits > 0
            ? `${data.unmatched_credits} credit(s) had no likely invoice — they may be transfers, or the invoice isn't raised yet.`
            : "Every recent bank credit is either matched or there are no open invoices to match against."} />
      ) : (
        <ul className="space-y-3">
          {data.suggestions.map((s) => (
            <li key={s.transaction.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.transaction.narration || "Bank credit"}</p>
                  <p className="text-xs text-[var(--color-muted)]">{s.transaction.date} · money in</p>
                </div>
                <p className="text-lg font-bold tabular-nums text-[var(--color-primary)] shrink-0">+{formatCurrency(s.transaction.amount)}</p>
              </div>
              <ul className="mt-3 space-y-2">
                {s.candidates.map((c) => (
                  <li key={c.invoice_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
                    <div className="min-w-0 text-xs">
                      <Link to={`/invoices/${c.invoice_id}`} className="font-mono text-[var(--color-primary)] hover:underline">{c.invoice_number}</Link>
                      <span className="text-[var(--color-muted)]"> · {c.customer_name} · {formatCurrency(c.outstanding)} outstanding</span>
                      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">{c.reasons.join(" · ")}</p>
                    </div>
                    <Button size="sm" variant={c.score >= 60 ? "primary" : "secondary"} loading={busy === s.transaction.id}
                      icon={<Check size={12} />} onClick={() => apply(s, c)}>
                      Match
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-[var(--color-muted)]">
        Only credits from the last 90 days are scored. A credit that pays several invoices: match it to the first, then record the rest from the invoice pages. <Link to="/transactions" className="text-[var(--color-primary)] hover:underline inline-flex items-center gap-0.5">All transactions <ArrowRight size={10} /></Link>
      </p>
    </div>
  );
}
