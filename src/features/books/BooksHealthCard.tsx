import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ShieldCheck, CheckCircle2, AlertTriangle, Loader2, ArrowRight } from "lucide-react";

// Surfaces the trust proof an SMB owner / CA actually wants before relying on the
// numbers: "are my books internally consistent, and is my GST reconciled?" Every
// check runs live on the ledger via existing endpoints (no external upload needed):
//   • Trial balance balanced (Σdebit = Σcredit) — the double-entry integrity guarantee
//   • Balance sheet tallies (Assets = Liabilities + Equity)
//   • No posting errors (duplicate vouchers / postings to group ledgers / failed assertions)
//   • GST liability for the current month (books-derived)
// Reads cleanly when the books aren't set up yet (shows nothing rather than scary zeros).

const rupee = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const sumVals = (o: Record<string, unknown> | undefined) =>
  o ? Object.values(o).reduce<number>((s, v) => s + (Number(v) || 0), 0) : 0;

export default function BooksHealthCard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tb, setTb] = useState<any>(null);
  const [bs, setBs] = useState<any>(null);
  const [checks, setChecks] = useState<any>(null);
  const [gst, setGst] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM
      const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };
      const [t, b, c, g] = await Promise.all([
        safe(api.get<any>("/api/books/reports/trial-balance")),
        safe(api.get<any>("/api/books/reports/balance-sheet")),
        safe(api.get<any>("/api/books/integrity/checks")),
        safe(api.get<any>(`/api/books/gst/liability-vs-paid?period=${period}`)),
      ]);
      if (cancelled) return;
      setTb(t); setBs(b); setChecks(c); setGst(g); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-muted)]">
        <Loader2 size={13} className="animate-spin" /> Checking books & tax health…
      </div>
    );
  }

  // No ledger yet (books not seeded) → don't show scary all-zero checks.
  const hasBooks = tb && Array.isArray(tb.ledgers) && tb.ledgers.length > 0;
  if (!hasBooks) return null;

  const issueCount = checks ? (checks.duplicates?.length ?? 0) + (checks.nonLeaf?.length ?? 0) + (checks.assertions?.length ?? 0) : null;
  const gstPayable = gst ? sumVals(gst.netToPay) : null;

  const items: { ok: boolean | null; label: string; detail: string }[] = [
    { ok: tb?.balanced ?? null, label: "Books balanced", detail: tb?.balanced ? "Debits = Credits" : `Dr ${tb?.totalDebit} vs Cr ${tb?.totalCredit}` },
    { ok: bs?.balanced ?? null, label: "Balance sheet tallies", detail: bs?.balanced ? "Assets = Liabilities + Equity" : "Does not tally — review" },
    { ok: issueCount === null ? null : issueCount === 0, label: "No posting errors", detail: issueCount === 0 ? "No duplicates / mis-postings" : `${issueCount} to review` },
  ];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-[var(--color-primary)]" />
          <p className="text-sm font-semibold">Books &amp; tax health</p>
          <span className="text-[11px] text-[var(--color-muted)]">live checks on your ledger</span>
        </div>
        <button onClick={() => navigate("/gst")} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline">
          Verify GSTR-2B ITC <ArrowRight size={11} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map(it => (
          <div key={it.label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              {it.ok === null
                ? <span className="h-3.5 w-3.5 rounded-full bg-[var(--color-surface-2)]" />
                : it.ok
                  ? <CheckCircle2 size={14} className="text-[var(--color-success,#16a34a)]" />
                  : <AlertTriangle size={14} className="text-[var(--color-warning,#d97706)]" />}
              <p className="text-xs font-medium">{it.label}</p>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">{it.detail}</p>
          </div>
        ))}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
          <p className="text-[11px] text-[var(--color-muted)]">GST payable (this month)</p>
          <p className="mt-0.5 text-sm font-semibold">{gstPayable === null ? "—" : gstPayable > 0 ? rupee(gstPayable) : "Settled"}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">Same double-entry checks a CA runs at audit — recomputed from your live postings, not stored summaries.</p>
    </div>
  );
}
