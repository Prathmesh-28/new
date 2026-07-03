import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Zap, FileText, Check, Banknote, Scale } from "lucide-react";

// Wired to /api/lending - the real LOS/LMS + invoice-financing wedge (vs. the other
// tabs on this page which are local calculators). Disbursal/e-NACH are gated; the
// rails badge shows Live vs Preview honestly.
interface Eligibility { limit: number; grade: string; score: number; decision: string; rails?: { disbursal: boolean } }
interface KFS { net_disbursal: number; total_repayable: number; all_in_cost: number; annual_interest_rate_pct: number; installments: number; recovery?: string }
interface Offer { id: string; kind: string; principal: number; processing_fee: number; apr: number; status: string; kfs: KFS }
interface ScheduleRow { installment_no: number; due_date: string; total_due: number; status: string }
interface Loan { id: string; kind: string; principal: number; outstanding_principal: number; status: string; dpd_bucket?: string; asset_class?: string; dpd?: number; penal_accrued?: number; settled_at?: string; schedule?: ScheduleRow[] }
interface Servicing { active: number; byClass: { standard: number; overdue: number; npa: number }; overdueAmount: number; npaAmount: number; penalAccrued: number; outstanding: number }
interface Mandate { id: string; loan_id: string; status: string; provider: string; provider_configured: boolean; collected: number; bounced: number }
interface FinInvoice { id: string; invoice_number: string; customer_name: string; total_amount: number; due_date: string | null; indicative_advance: number }

// presetInvoiceId (from ?invoice_id= on /credit) preselects an invoice to advance — the
// "turn THIS invoice into cash" entry point from the invoice/receivables lists.
export default function EmbeddedFinancing({ presetInvoiceId }: { presetInvoiceId?: string } = {}) {
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [svc, setSvc] = useState<Servicing | null>(null);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [settling, setSettling] = useState<string | null>(null);
  const [settleAmt, setSettleAmt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"invoice_finance" | "working_capital">("invoice_finance");
  const [invoiceAmt, setInvoiceAmt] = useState(""); const [principal, setPrincipal] = useState("");
  const [financeable, setFinanceable] = useState<FinInvoice[]>([]);
  const [selInvoice, setSelInvoice] = useState<string>(""); // "" = custom amount

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, o, l, s, mn, fi] = await Promise.all([
        api.get<Eligibility>("/api/lending/eligibility").catch(() => null),
        api.get<Offer[]>("/api/lending/offers").catch(() => []),
        api.get<Loan[]>("/api/lending/loans").catch(() => []),
        api.get<Servicing>("/api/lending/servicing").catch(() => null),
        api.get<Mandate[]>("/api/lending/mandates").catch(() => []),
        api.get<FinInvoice[]>("/api/lending/financeable-invoices").catch(() => []),
      ]);
      setElig(e); setOffers(o || []); setLoans(l || []); setSvc(s); setMandates(mn || []); setFinanceable(fi || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Deep-link preselect: land on invoice financing with the given invoice chosen. Only
  // applies once its row is present in the financeable list (so the picker can resolve it).
  useEffect(() => {
    if (presetInvoiceId && financeable.some((f) => f.id === presetInvoiceId)) {
      setKind("invoice_finance"); setSelInvoice(presetInvoiceId);
    }
  }, [presetInvoiceId, financeable]);

  const createOffer = async () => {
    setBusy(true);
    try {
      // When a real invoice is picked, send only invoice_id — the server derives the face
      // value and tenor and sets source_invoice_id (self-liquidating). Custom amount is the
      // fallback when no invoice is selected.
      const body = kind === "invoice_finance"
        ? (selInvoice
            ? { kind, invoice_id: selInvoice, apr: 24 }
            : { kind, invoice_amount: parseFloat(invoiceAmt) || 0, apr: 24, tenure_days: 60 })
        : { kind, principal: parseFloat(principal) || 0, apr: 28, tenure_months: 12 };
      await api.post("/api/lending/offers", body);
      toast.success("Offer generated - review the Key Fact Statement");
      setInvoiceAmt(""); setPrincipal(""); setSelInvoice(""); await load();
    } catch (e) { toast.error((e as { message?: string })?.message || "Couldn't generate an offer"); }
    finally { setBusy(false); }
  };

  const selectedInv = financeable.find((f) => f.id === selInvoice);
  // Deep-linked an invoice that isn't financeable (already has a live advance, or not 'sent'):
  // explain instead of silently showing a blank picker.
  const presetUnresolved = !loading && !!presetInvoiceId && !financeable.some((f) => f.id === presetInvoiceId);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (e) { toast.error((e as { message?: string })?.message || "Action failed"); }
    finally { setBusy(false); }
  };

  const settle = async (id: string) => {
    const amt = parseFloat(settleAmt);
    if (!(amt >= 0)) { toast.error("Enter a settlement amount"); return; }
    await act(() => api.post(`/api/lending/loans/${id}/settle`, { settlement_amount: amt }), "Loan settled");
    setSettling(null); setSettleAmt("");
  };

  const liveMandate = (loanId: string) => mandates.find((m) => m.loan_id === loanId && ["initiated", "active", "paused"].includes(m.status));
  const setupMandate = async (loanId: string, outstanding: number) => {
    await act(async () => {
      const m = await api.post<{ id: string }>(`/api/lending/loans/${loanId}/mandate`, { provider: "manual", max_amount: outstanding });
      await api.post(`/api/lending/mandates/${m.id}/activate`, {});
    }, "Auto-collect (e-NACH) set up");
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

      {/* Portfolio health (servicing): DPD / NPA / penal — only when it matters */}
      {svc && svc.active > 0 && (svc.byClass.overdue + svc.byClass.npa > 0 || svc.penalAccrued > 0) && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-semibold mb-3 flex items-center gap-1.5"><Scale size={13} className="text-[var(--color-primary)]" /> Portfolio health</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <KfsCell label="Overdue" v={`${svc.byClass.overdue} · ${formatCurrency(svc.overdueAmount)}`} />
            <KfsCell label="NPA (90+ DPD)" v={`${svc.byClass.npa} · ${formatCurrency(svc.npaAmount)}`} />
            <KfsCell label="Penal accrued" v={formatCurrency(svc.penalAccrued)} />
            <KfsCell label="Total outstanding" v={formatCurrency(svc.outstanding)} />
          </div>
        </div>
      )}

      {/* Get an offer */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
        <p className="text-sm font-semibold">Get financing</p>
        {presetUnresolved && (
          <p className="text-[11px] rounded-lg border border-amber-800/40 bg-amber-900/10 text-amber-400 px-3 py-2">
            That invoice can't be advanced right now — it may already have a live advance, or isn't an issued (unpaid) invoice. Pick another below.
          </p>
        )}
        <div className="flex gap-2">
          {(["invoice_finance", "working_capital"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} className={`text-xs px-3 py-1.5 rounded-lg border ${kind === k ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
              {k === "invoice_finance" ? "Invoice financing" : "Working capital"}
            </button>
          ))}
        </div>
        {/* Invoice financing: pick a real unpaid invoice → advance is computed from its face
            value and auto-recovers when the invoice is paid. Falls back to a custom amount. */}
        {kind === "invoice_finance" && financeable.length > 0 && (
          <select value={selInvoice} onChange={e => setSelInvoice(e.target.value)} className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none">
            <option value="">Advance a custom amount…</option>
            {financeable.map(f => (
              <option key={f.id} value={f.id}>{f.invoice_number} · {f.customer_name} · {formatCurrency(f.total_amount)} → advance {formatCurrency(f.indicative_advance)}</option>
            ))}
          </select>
        )}
        {kind === "invoice_finance" && selectedInv && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold">{selectedInv.invoice_number} · {selectedInv.customer_name}</span>
              {selectedInv.due_date && <span className="text-[var(--color-muted)]">due {selectedInv.due_date}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-[var(--color-muted)]">
              <span>Invoice <span className="text-[var(--color-text)] font-medium">{formatCurrency(selectedInv.total_amount)}</span></span>
              <span>Advance ~<span className="text-[var(--color-primary)] font-semibold">{formatCurrency(selectedInv.indicative_advance)}</span></span>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">↩ Auto-recovers when this invoice is marked paid.</p>
          </div>
        )}
        <div className="flex gap-2">
          {kind === "invoice_finance"
            ? (!selectedInv && <input value={invoiceAmt} onChange={e => setInvoiceAmt(e.target.value)} type="number" placeholder="Invoice amount ₹ (we advance ~80%)" className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />)
            : <input value={principal} onChange={e => setPrincipal(e.target.value)} type="number" placeholder="Amount needed ₹" className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />}
          <button onClick={createOffer} disabled={busy || (kind === "invoice_finance" && !selectedInv && !invoiceAmt)} className="text-xs px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold disabled:opacity-50 whitespace-nowrap">{busy ? <Loader2 size={13} className="animate-spin inline" /> : selectedInv ? "Advance this invoice" : "Get offer"}</button>
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
        {loans.length === 0 ? <p className="text-xs text-[var(--color-muted)]">No loans yet - accept an offer above.</p> : loans.map(l => {
          const cls = l.asset_class || "standard";
          const clsColor = cls === "npa" ? "bg-red-900/30 text-red-400" : "bg-amber-900/30 text-amber-400";
          return (
          <div key={l.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  {l.kind === "invoice_finance" ? "Invoice advance" : "Working capital"} · {formatCurrency(l.principal)}
                  {l.status === "active" && cls !== "standard" && <span className={`text-[10px] px-2 py-0.5 rounded-full ${clsColor}`}>{cls === "npa" ? "NPA" : "Overdue"}{l.dpd ? ` · ${l.dpd} DPD` : ""}</span>}
                </p>
                <p className="text-xs text-[var(--color-muted)]">Outstanding {formatCurrency(l.outstanding_principal)} · {l.status}{l.penal_accrued && l.penal_accrued > 0 ? ` · penal ${formatCurrency(l.penal_accrued)}` : ""}</p>
              </div>
              {l.status === "active" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => act(() => api.post(`/api/lending/loans/${l.id}/repay`, { amount: l.outstanding_principal, method: "manual" }), "Repayment recorded")} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">Record repayment</button>
                  {cls !== "standard" && <button onClick={() => { setSettling(settling === l.id ? null : l.id); setSettleAmt(String(l.outstanding_principal)); }} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-amber-800/40 text-amber-400 hover:bg-amber-900/10">Settle</button>}
                </div>
              )}
              {l.status === "closed" && <span className="text-xs text-green-400">{l.settled_at ? "Settled" : "Closed"}</span>}
            </div>
            {l.status === "active" && (() => {
              const mn = liveMandate(l.id);
              return (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs border-t border-[var(--color-border)] pt-2">
                  {mn ? (
                    <>
                      <span className={`px-2 py-0.5 rounded-full ${mn.status === "active" ? "bg-green-900/30 text-green-400" : mn.status === "paused" ? "bg-amber-900/30 text-amber-400" : "bg-[var(--color-accent)] text-[var(--color-muted)]"}`}>Auto-collect (e-NACH): {mn.status}</span>
                      <span className="text-[var(--color-muted)]">{mn.collected} collected · {mn.bounced} bounced{!mn.provider_configured ? " · manual mode" : ""}</span>
                      {mn.status === "active" && <button onClick={() => act(() => api.post(`/api/lending/mandates/${mn.id}/pause`, {}), "Mandate paused")} disabled={busy} className="text-[var(--color-muted)] hover:text-[var(--color-text)] underline">pause</button>}
                      {mn.status === "paused" && <button onClick={() => act(() => api.post(`/api/lending/mandates/${mn.id}/activate`, {}), "Mandate resumed")} disabled={busy} className="text-[var(--color-primary)] underline">resume</button>}
                    </>
                  ) : (
                    <button onClick={() => setupMandate(l.id, l.outstanding_principal)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]">Set up auto-collect (e-NACH)</button>
                  )}
                </div>
              );
            })()}
            {settling === l.id && (
              <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3 flex-wrap">
                <input value={settleAmt} onChange={e => setSettleAmt(e.target.value)} type="number" placeholder="Settlement amount ₹" className="flex-1 min-w-[140px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none" />
                <span className="text-[11px] text-[var(--color-muted)]">Waiver {formatCurrency(Math.max(0, l.outstanding_principal - (parseFloat(settleAmt) || 0)))} → income</span>
                <button onClick={() => settle(l.id)} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold">Confirm settlement</button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function KfsCell({ label, v }: { label: string; v: string }) {
  return <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2.5 py-2"><p className="text-[10px] text-[var(--color-muted)]">{label}</p><p className="font-semibold">{v}</p></div>;
}
