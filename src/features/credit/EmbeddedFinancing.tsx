import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Zap, FileText, Check, Banknote } from "lucide-react";

// Wired to /api/lending - the real LOS/LMS + invoice-financing wedge (vs. the other
// tabs on this page which are local calculators). Disbursal/e-NACH are gated; the
// rails badge shows Live vs Preview honestly.
interface Eligibility { limit: number; grade: string; score: number; decision: string; rails?: { disbursal: boolean } }
interface KFS { net_disbursal: number; total_repayable: number; all_in_cost: number; annual_interest_rate_pct: number; installments: number; recovery?: string }
interface Offer { id: string; kind: string; principal: number; processing_fee: number; apr: number; status: string; kfs: KFS }
interface ScheduleRow { installment_no: number; due_date: string; total_due: number; status: string }
interface Loan { id: string; kind: string; principal: number; outstanding_principal: number; status: string; dpd_bucket?: string; schedule?: ScheduleRow[] }

export default function EmbeddedFinancing() {
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"invoice_finance" | "working_capital">("invoice_finance");
  const [invoiceAmt, setInvoiceAmt] = useState(""); const [principal, setPrincipal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, o, l] = await Promise.all([
        api.get<Eligibility>("/api/lending/eligibility").catch(() => null),
        api.get<Offer[]>("/api/lending/offers").catch(() => []),
        api.get<Loan[]>("/api/lending/loans").catch(() => []),
      ]);
      setElig(e); setOffers(o || []); setLoans(l || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createOffer = async () => {
    setBusy(true);
    try {
      const body = kind === "invoice_finance"
        ? { kind, invoice_amount: parseFloat(invoiceAmt) || 0, apr: 24, tenure_days: 60 }
        : { kind, principal: parseFloat(principal) || 0, apr: 28, tenure_months: 12 };
      await api.post("/api/lending/offers", body);
      toast.success("Offer generated - review the Key Fact Statement");
      setInvoiceAmt(""); setPrincipal(""); await load();
    } catch (e) { toast.error((e as { message?: string })?.message || "Couldn't generate an offer"); }
    finally { setBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error((e as { message?: string })?.message || "Action failed"); }
    finally { setBusy(false); }
  };

  if (loading) return <p className="text-sm text-[var(--color-muted)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>;

  const railsLive = elig?.rails?.disbursal;

  return (
    <div className="space-y-5">
      {/* Eligibility */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1.5"><Zap size={13} className="text-[var(--color-primary)]" /> Pre-approved limit · grade {elig?.grade ?? "-"}</p>
          <p className="text-2xl font-bold">{formatCurrency(elig?.limit ?? 0)}</p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full ${railsLive ? "bg-green-900/30 text-green-400" : "bg-amber-900/30 text-amber-400"}`}>
          {railsLive ? "Disbursal rails: Live" : "Disbursal: Preview (connect a gateway)"}
        </span>
      </div>

      {/* Get an offer */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <p className="text-sm font-semibold">Get financing</p>
        <div className="flex gap-2">
          {(["invoice_finance", "working_capital"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} className={`text-xs px-3 py-1.5 rounded-lg border ${kind === k ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {k === "invoice_finance" ? "Invoice financing" : "Working capital"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {kind === "invoice_finance"
            ? <input value={invoiceAmt} onChange={e => setInvoiceAmt(e.target.value)} type="number" placeholder="Invoice amount ₹ (we advance ~80%)" className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
            : <input value={principal} onChange={e => setPrincipal(e.target.value)} type="number" placeholder="Amount needed ₹" className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />}
          <button onClick={createOffer} disabled={busy} className="text-xs px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin inline" /> : "Get offer"}</button>
        </div>
      </div>

      {/* Offers with KFS */}
      {offers.filter(o => o.status === "offered").length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] flex items-center gap-1.5"><FileText size={12} /> Offers - Key Fact Statement</p>
          {offers.filter(o => o.status === "offered").map(o => (
            <div key={o.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{o.kind === "invoice_finance" ? "Invoice advance" : "Working capital"} · {formatCurrency(o.principal)}</span>
                <span className="text-xs text-[var(--color-muted)]">{o.apr}% APR</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                <KfsCell label="Net disbursal" v={formatCurrency(o.kfs.net_disbursal)} />
                <KfsCell label="Processing fee" v={formatCurrency(o.processing_fee)} />
                <KfsCell label="Total repayable" v={formatCurrency(o.kfs.total_repayable)} />
                <KfsCell label="All-in cost" v={formatCurrency(o.kfs.all_in_cost)} />
              </div>
              {o.kfs.recovery && <p className="text-[11px] text-[var(--color-muted)] mb-3">↩ {o.kfs.recovery}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => act(() => api.post(`/api/lending/offers/${o.id}/decline`, {}), "Declined")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)]">Decline</button>
                <button onClick={() => act(() => api.post(`/api/lending/offers/${o.id}/accept`, {}), "Accepted - loan created")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold flex items-center gap-1"><Check size={12} /> Accept</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active loans */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] flex items-center gap-1.5"><Banknote size={12} /> Loans</p>
        {loans.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No loans yet - accept an offer above.</p> : loans.map(l => (
          <div key={l.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold">{l.kind === "invoice_finance" ? "Invoice advance" : "Working capital"} · {formatCurrency(l.principal)}</p>
              <p className="text-xs text-[var(--color-muted)]">Outstanding {formatCurrency(l.outstanding_principal)} · {l.status}{l.dpd_bucket && l.dpd_bucket !== "current" ? ` · DPD ${l.dpd_bucket}` : ""}</p>
            </div>
            {l.status === "active" && (
              <button onClick={() => act(() => api.post(`/api/lending/loans/${l.id}/repay`, { amount: l.outstanding_principal, method: "manual" }), "Repayment recorded")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">Record repayment</button>
            )}
            {l.status === "closed" && <span className="text-xs text-green-400">Closed</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function KfsCell({ label, v }: { label: string; v: string }) {
  return <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-2"><p className="text-[10px] text-[var(--color-muted)]">{label}</p><p className="font-semibold">{v}</p></div>;
}
