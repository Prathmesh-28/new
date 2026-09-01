import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Building2, Loader2, ReceiptText } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";
import { formatCurrency } from "@/lib/utils";

/**
 * /vendor-portal/:token — PUBLIC. What a supplier sees when their customer shares a link.
 *
 * The mirror of the customer portal: which of their bills are booked, what's been paid,
 * and what's still due to them — straight from the buyer's books, so nobody re-types the
 * AP ledger into WhatsApp. Read by someone who has never seen the product, likely on a
 * phone, deciding whether to call about money.
 */
type Bill = { voucher_number: string; date: string; reference: string | null; gross: number; paid: number; outstanding: number; cancelled: boolean };
type Portal = {
  buyer: { name: string; gstin: string | null };
  vendor: { name: string };
  summary: { total_due_to_you: number; open_bills: number; bills_on_record: number };
  bills: Bill[];
  as_of: string;
};

export default function VendorPortalPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/portal/vendor/${encodeURIComponent(token)}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || "This link isn't working."); return b as Portal; })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "This link isn't working."))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]"><Loader2 size={22} className="animate-spin text-[var(--color-muted)]" /></div>;
  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-bg)] px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--color-border)]/40 flex items-center justify-center mb-4"><AlertCircle size={20} className="text-[var(--color-muted)]" /></div>
      <h1 className="text-lg font-bold mb-2">This link isn't working</h1>
      <p className="text-sm text-[var(--color-muted)] max-w-sm">{error}</p>
    </div>
  );

  const open = data.bills.filter((b) => !b.cancelled && b.outstanding > 0);
  const settled = data.bills.filter((b) => !b.cancelled && b.outstanding <= 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
        <header>
          <p className="text-xs text-[var(--color-muted)] flex items-center gap-1.5">
            <Building2 size={12} /> {data.buyer.name}{data.buyer.gstin ? ` · ${data.buyer.gstin}` : ""}
          </p>
          <h1 className="text-2xl font-bold mt-1">Your account with {data.buyer.name}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{data.vendor.name}</p>
        </header>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <p className="text-xs text-[var(--color-muted)]">Due to you</p>
          <p className={`text-4xl font-bold tabular-nums mt-1 ${data.summary.total_due_to_you > 0 ? "" : "text-[var(--color-primary)]"}`}>
            {formatCurrency(data.summary.total_due_to_you)}
          </p>
          <p className="text-sm text-[var(--color-muted)] mt-2">
            {data.summary.open_bills > 0
              ? `Across ${data.summary.open_bills} open bill${data.summary.open_bills === 1 ? "" : "s"} of ${data.summary.bills_on_record} on record.`
              : data.summary.bills_on_record > 0 ? "Everything on record is settled — thank you." : "No bills are booked yet."}
          </p>
        </div>

        {open.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><ReceiptText size={14} /> Open bills</h2>
            <ul className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
              {open.map((b) => (
                <li key={b.voucher_number} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{b.reference || b.voucher_number}</span>
                    <span className="text-[var(--color-muted)] text-xs"> · booked {b.date}</span>
                    {b.paid > 0 && <p className="text-xs text-[var(--color-muted)] mt-0.5">{formatCurrency(b.paid)} of {formatCurrency(b.gross)} already paid</p>}
                  </span>
                  <span className="tabular-nums font-semibold shrink-0">{formatCurrency(b.outstanding)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {settled.length > 0 && (
          <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <summary className="text-sm font-semibold cursor-pointer">Settled bills ({settled.length})</summary>
            <ul className="mt-3 divide-y divide-[var(--color-border)]">
              {settled.map((b) => (
                <li key={b.voucher_number} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs">{b.reference || b.voucher_number}<span className="font-sans text-[var(--color-muted)]"> · {b.date}</span></span>
                  <span className="tabular-nums text-[var(--color-muted)]">{formatCurrency(b.gross)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="text-[11px] text-[var(--color-muted)] pt-2">
          <p>As at {new Date(data.as_of).toLocaleString("en-IN")} · figures come straight from {data.buyer.name}'s books. If a bill you've sent isn't listed, it may not be booked yet — reply to whoever sent you this link.</p>
        </footer>
      </div>
    </div>
  );
}
