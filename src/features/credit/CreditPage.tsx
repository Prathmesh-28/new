import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId, runwayDays, monthlyBurn } from "@/lib/utils";
import { AlertTriangle, CreditCard, TrendingUp, CheckCircle2, Clock, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ActiveLoan } from "@/data/types";
import PreviewBadge from "@/components/PreviewBadge";

function emi(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function totalInterest(principal: number, annualRate: number, months: number): number {
  return emi(principal, annualRate, months) * months - principal;
}

const HARDSHIP_PLANS = [
  { trigger: "Revenue drop >30%", relief: "Pause up to 60 days", autoApproved: true },
  { trigger: "Key customer lost", relief: "Reduce 50% for up to 90 days", autoApproved: true },
  { trigger: "Medical emergency", relief: "Full pause for 30 days", autoApproved: true },
];

const SCORE_FACTORS = [
  { label: "Revenue consistency", weight: 25, desc: "CoV of monthly revenue over 6 months" },
  { label: "Avg monthly revenue", weight: 20, desc: "Higher revenue = higher eligibility" },
  { label: "Business age",        weight: 15, desc: ">12 months significantly improves score" },
  { label: "Debt service ratio",  weight: 15, desc: "Existing debt load relative to revenue" },
  { label: "Customer concentration", weight: 10, desc: "Revenue spread across multiple customers" },
  { label: "Overdraft frequency", weight: 8,  desc: "Fewer overdrafts = better score" },
  { label: "Engagement signals",  weight: 7,  desc: "Login frequency, scenario use, alert action" },
];

export default function CreditPage() {
  const {
    store, addCreditApplication, updateCreditApplication, addCreditOffer,
    addActiveLoan, updateActiveLoan, deleteActiveLoan,
  } = useApp();
  const { creditApplications, creditOffers, activeLoans, bankAccounts, transactions } = store;

  const burn     = monthlyBurn(transactions);
  const balance  = bankAccounts.reduce((s, a) => s + a.balance, 0);
  const runway   = runwayDays(bankAccounts.map(b => b.balance), burn);
  const showCta  = runway > 0 && runway < 45;

  const [tab,          setTab]          = useState<"overview" | "apply" | "loans" | "notyet" | "wc" | "equip">("overview");
  const [amount,       setAmount]       = useState("");
  const [term,         setTerm]         = useState("24");
  const [purpose,      setPurpose]      = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [showKfs,      setShowKfs]      = useState<string | null>(null);
  const [expandRepay,  setExpandRepay]  = useState<string | null>(null);
  const [payoffMonths, setPayoffMonths] = useState<Record<string, number>>({});
  const [payingLoan,   setPayingLoan]   = useState<string | null>(null);
  const [payAmt,       setPayAmt]       = useState("");

  const bestApp   = creditApplications.find(a => a.status === "approved");
  const bestScore = Math.max(0, ...creditApplications.map(a => a.underwritingScore));
  const declined  = creditApplications.filter(a => a.status === "rejected");

  // Real lender offers returned by the underwriting backend for this application
  // (persisted in the store with their server-side offer ids so "Accept" can hit
  // POST /api/credit/accept/:offerId and create a durable loan).
  const realOffers = useMemo(() => {
    if (!bestApp) return [];
    const offers = creditOffers
      .filter(o => o.applicationId === bestApp.id && o.status === "pending")
      .map(o => {
        const monthlyEmi = emi(o.amount, o.rate, o.termMonths);
        const interest   = totalInterest(o.amount, o.rate, o.termMonths);
        return { ...o, monthlyEmi, interest, total: o.amount + interest };
      })
      .sort((a, b) => b.amount - a.amount);
    return offers;
  }, [bestApp, creditOffers]);
  const topOfferId = realOffers[0]?.id;

  const handleSubmit = async () => {
    if (!amount || !purpose) { toast.error("Enter loan amount and purpose"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSubmitting(true);
    try {
      // Backend contract: { requested_amount, term_months, purpose } →
      // { application, offers[], underwriting:{ score, approved_amount } }.
      const result = await api.post<{
        application: { id: string; status: string; underwriting_score: number };
        offers: { id: string; lender_partner: string; offer_amount: number | string; apr_equivalent: number | string; term_months: number }[];
        underwriting: { score: number; approved_amount: number };
      }>("/api/credit/apply", { requested_amount: amt, term_months: Number(term), purpose });

      const score = Number(result.underwriting?.score ?? result.application?.underwriting_score ?? 0);
      const approvedAmount = Number(result.underwriting?.approved_amount ?? 0);
      const offers = result.offers ?? [];
      const approved = offers.length > 0;
      const id = generateId();
      const now = new Date().toISOString();
      addCreditApplication({ id, status: approved ? "approved" : "rejected", loanAmount: amt, termMonths: Number(term), purpose, underwritingScore: score, approvedAmount, createdAt: now, updatedAt: now });
      // Persist the REAL lender offers, keyed by their server offer id.
      offers.forEach(o => addCreditOffer({
        id: o.id,
        applicationId: id,
        lender: o.lender_partner,
        amount: Number(o.offer_amount),
        rate: Math.round((Number(o.apr_equivalent) || 0) * 1000) / 10, // 0.28 → 28.0%
        termMonths: o.term_months,
        status: "pending",
      }));
      if (approved) {
        toast.success(`Score ${score}/100 — ${offers.length} offer${offers.length > 1 ? "s" : ""} up to ₹${(approvedAmount / 100000).toFixed(1)}L`);
        setTab("overview");
      } else {
        toast.error(`Score ${score}/100 — no offers yet. See the "Not yet" tab.`);
        setTab("notyet");
      }
      setAmount(""); setPurpose("");
    } catch (err) {
      // Honest failure — never fabricate an approval.
      const status = Number(String((err as Error)?.message || "").match(/^(\d{3})/)?.[1] || 0);
      if (status === 429)      toast.error("You can submit only one credit application every 90 days.");
      else if (status === 409) toast.error("You already have an application in progress.");
      else                     toast.error("Couldn't reach the underwriting service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (offer: NonNullable<typeof realOffers>[number]) => {
    if (!bestApp) return;
    setShowKfs(null);
    try {
      const { loan } = await api.post<{ loan: { id: string; disbursed_amount: number | string; outstanding_balance: number | string; next_payment_at: string } }>(
        `/api/credit/accept/${offer.id}`, {}
      );
      const principal = Number(loan.disbursed_amount);
      const monthlyEmi = emi(principal, offer.rate, offer.termMonths);
      const newLoan: ActiveLoan = {
        id: loan.id, lender: offer.lender, principal, outstanding: Number(loan.outstanding_balance ?? principal),
        rate: offer.rate, termMonths: offer.termMonths, monthlyEmi,
        startDate: new Date().toISOString().split("T")[0],
        nextPaymentDate: (loan.next_payment_at || new Date(Date.now() + 30 * 86400000).toISOString()).split("T")[0],
        nextPaymentAmount: monthlyEmi, applicationId: bestApp.id,
      };
      addActiveLoan(newLoan);
      updateCreditApplication({ ...bestApp, status: "funded", updatedAt: new Date().toISOString() });
      toast.success(`${offer.lender} — ₹${(principal / 100000).toFixed(1)}L disbursed`);
      setTab("loans");
    } catch (err) {
      const status = Number(String((err as Error)?.message || "").match(/^(\d{3})/)?.[1] || 0);
      toast.error(status === 409 ? "This offer is no longer active." : "Couldn't accept the offer. Please try again.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Proactive CTA when runway < 45d */}
      {showCta && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold mb-0.5">Plan ahead — {runway} days of cash remaining</p>
              <p className="text-sm text-[var(--color-muted)]">
                You have time to act. Businesses that secure credit 30+ days early get better rates and no-panic decisions. See your pre-qualified options below.
              </p>
            </div>
            <button onClick={() => setTab("apply")} className="text-xs bg-amber-900/40 text-amber-300 border border-amber-800/40 px-3 py-1.5 rounded-lg hover:bg-amber-900/60 shrink-0">
              See options →
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">Credit & Loans <PreviewBadge capability="creditDisbursement" /></h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([
          ["overview", "Overview"],
          ["apply",    "Apply"],
          ["loans",    `Active Loans${activeLoans.length > 0 ? ` (${activeLoans.length})` : ""}`],
          ["notyet",   "Not yet"],
          ["wc",       "WC Sizing"],
          ["equip",    "Finance vs Lease"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "UW Score",      value: bestScore > 0 ? `${bestScore}/100` : "—", color: bestScore >= 70 ? "text-green-400" : bestScore >= 50 ? "text-yellow-400" : "text-[var(--color-muted)]" },
              { label: "Max Approved",  value: bestApp ? formatCurrency(bestApp.approvedAmount) : "—", color: "text-[var(--color-primary)]" },
              { label: "Active Loans",  value: activeLoans.length.toString(), color: "text-[var(--color-text)]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Real lender offers from the underwriting backend */}
          {realOffers.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold mb-3">Your Pre-Qualified Offers</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {realOffers.map(o => (
                  <div key={o.id} className={`rounded-lg border p-4 relative ${o.id === topOfferId ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5" : "border-[var(--color-border)]"}`}>
                    {o.id === topOfferId && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold bg-[var(--color-primary)] text-[var(--color-bg)] px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Best offer
                      </span>
                    )}
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)] mb-3">{o.lender}</p>
                    <p className="text-2xl font-bold mb-1">{formatCurrency(o.amount)}</p>
                    <div className="space-y-1 text-xs text-[var(--color-muted)] mb-4">
                      <div className="flex justify-between"><span>APR</span><span className="font-semibold text-[var(--color-text)]">{o.rate}%</span></div>
                      <div className="flex justify-between"><span>Monthly EMI</span><span className="font-semibold text-[var(--color-text)]">{formatCurrency(o.monthlyEmi)}</span></div>
                      <div className="flex justify-between"><span>Total interest</span><span>{formatCurrency(o.interest)}</span></div>
                      <div className="flex justify-between"><span>Total repayment</span><span>{formatCurrency(o.total)}</span></div>
                      <div className="flex justify-between"><span>Term</span><span>{o.termMonths} months</span></div>
                    </div>
                    <button onClick={() => setShowKfs(o.id)}
                      className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2 rounded-lg text-sm hover:opacity-90">
                      Accept — View KFS
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--color-muted)] mt-2 flex items-center gap-1">
                <Info size={10} /> APR shown per RBI Digital Lending Guidelines 2022. 3-day cooling-off period applies.
              </p>
            </div>
          ) : (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
              <CreditCard size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
              <h2 className="text-base font-semibold mb-1">No offers yet</h2>
              <p className="text-sm text-[var(--color-muted)] mb-4 max-w-sm mx-auto">Complete an application to see your pre-qualified offers. The engine scores your business instantly based on 9 signals.</p>
              <button onClick={() => setTab("apply")} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">Apply Now</button>
            </div>
          )}

          {/* Optimal Borrow Timing */}
          {(() => {
            // Compute next-month projected score improvement
            const now = new Date();
            const thisM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
            const lastMDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
            const lastM = `${lastMDate.getFullYear()}-${String(lastMDate.getMonth()+1).padStart(2,"0")}`;
            const thisRev = transactions.filter(t => t.date.startsWith(thisM) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
            const lastRev = transactions.filter(t => t.date.startsWith(lastM) && t.amount > 0).reduce((s,t) => s+t.amount, 0);
            const trending = thisRev > lastRev * 1.05;
            const emiLoad  = activeLoans.length > 0 ? activeLoans.reduce((s,l) => s + l.monthlyEmi, 0) : 0;
            const capacity = burn > 0 ? Math.max(0, Math.round(((burn * 0.3) - emiLoad) / 1000)) : 0;
            const emiPct   = burn > 0 ? Math.round((emiLoad / burn) * 100) : 0;

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Borrow timing */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-[var(--color-primary)]" />
                    <h3 className="text-sm font-semibold">Right time to borrow?</h3>
                  </div>
                  {bestScore === 0 ? (
                    <p className="text-xs text-[var(--color-muted)]">Apply first to get a score, then we'll tell you the optimal timing.</p>
                  ) : bestScore >= 65 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2.5 bg-green-950/20 border border-green-800/30 rounded-lg">
                        <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                        <p className="text-xs text-green-300 font-medium">Now is a good time — score {bestScore}/100</p>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">Your score qualifies for competitive rates. Borrowing now vs waiting 3 months saves on rate drift.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2.5 bg-yellow-950/20 border border-yellow-800/30 rounded-lg">
                        <Clock size={13} className="text-yellow-400 shrink-0" />
                        <p className="text-xs text-yellow-300 font-medium">
                          {trending ? "Wait 30 days — revenue trending up, score will improve" : `Score ${bestScore}/100 — ${50 - bestScore} pts to approval`}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        {trending
                          ? "Revenue growing month-over-month. One more consistent month adds ~8 pts to your score."
                          : "Fix the items in the 'Not yet' tab to reach the 50-pt threshold. Each fix adds measurable points."}
                      </p>
                    </div>
                  )}
                </div>

                {/* EMI capacity gauge */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={14} className={emiPct > 40 ? "text-red-400" : emiPct > 25 ? "text-yellow-400" : "text-green-400"} />
                    <h3 className="text-sm font-semibold">EMI capacity</h3>
                  </div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--color-muted)]">EMI as % of monthly burn</span>
                      <span className={`font-bold ${emiPct > 40 ? "text-red-400" : emiPct > 25 ? "text-yellow-400" : "text-green-400"}`}>{emiPct}%</span>
                    </div>
                    <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, emiPct)}%`, background: emiPct > 40 ? "#ef4444" : emiPct > 25 ? "#eab308" : "#22c55e" }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-[var(--color-muted)] mt-1">
                      <span>Safe (0–25%)</span><span>Caution (25–40%)</span><span>High risk (40%+)</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-muted)]">
                    {emiLoad === 0
                      ? `You have no active EMIs. You can safely take on up to ₹${capacity}K/month.`
                      : emiPct > 40
                        ? "EMI load is high. Adding another loan increases default risk significantly."
                        : `You can absorb ~₹${capacity}K/month in additional EMI without stress.`}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Score factors */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">How your score is computed</h3>
            <div className="space-y-2">
              {SCORE_FACTORS.map(f => (
                <div key={f.label} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium">{f.label}</span>
                    <span className="text-[var(--color-muted)] ml-2">— {f.desc}</span>
                  </div>
                  <span className="text-[var(--color-primary)] font-semibold shrink-0 ml-4">{f.weight}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── APPLY ── */}
      {tab === "apply" && (
        <div className="space-y-4 max-w-lg">
          <p className="text-sm text-[var(--color-muted)]">Our engine scores your business instantly using live bank data. No documents needed for the pre-qualification.</p>
          <div className="space-y-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">How much do you need? (₹)</label>
              <input type="number" min="100000" placeholder="e.g. 2500000" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Repayment term</label>
              <select value={term} onChange={e => setTerm(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none">
                {[6,12,18,24,36].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Purpose</label>
              <select value={purpose} onChange={e => setPurpose(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none">
                <option value="">Select purpose…</option>
                {["Working capital", "Equipment purchase", "Inventory", "Marketing / growth", "GST/TDS payment", "Payroll bridge", "Expansion"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-3 rounded-lg text-sm hover:opacity-90 disabled:opacity-40">
              {submitting ? "Underwriting in progress…" : "Get Pre-Qualified Offers"}
            </button>
            <p className="text-[11px] text-[var(--color-muted)] text-center">No hard CIBIL pull · Decision in under 60 seconds</p>
          </div>

          {/* Hardship plans */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">Hardship protection included</h3>
            <div className="space-y-2">
              {HARDSHIP_PLANS.map(h => (
                <div key={h.trigger} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 size={12} className="text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{h.trigger}</span>
                    <span className="text-[var(--color-muted)]"> → {h.relief}</span>
                    {h.autoApproved && <span className="ml-1 text-[var(--color-muted)]">(auto-approved)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE LOANS ── */}
      {tab === "loans" && (
        <div className="space-y-4">
          {activeLoans.length === 0 ? (
            <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center text-sm text-[var(--color-muted)]">
              No active loans. Accept an offer from the Overview tab to start tracking repayments here.
            </div>
          ) : (
            activeLoans.map((loan: ActiveLoan) => {
              const paidPct = loan.principal > 0 ? Math.round(((loan.principal - loan.outstanding) / loan.principal) * 100) : 0;
              const customMonths = payoffMonths[loan.id] ?? loan.termMonths;
              const earlyEmi = emi(loan.outstanding, loan.rate, customMonths);
              const earlySaving = totalInterest(loan.outstanding, loan.rate, loan.termMonths) - totalInterest(loan.outstanding, loan.rate, customMonths);
              const expanded = expandRepay === loan.id;

              return (
                <div key={loan.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">{loan.lender}</p>
                      <p className="text-xs text-[var(--color-muted)]">{loan.rate}% APR · {loan.termMonths}mo term</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[var(--color-primary)]">{formatCurrency(loan.outstanding)}</p>
                      <p className="text-xs text-[var(--color-muted)]">outstanding of {formatCurrency(loan.principal)}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mb-3">{paidPct}% repaid</p>

                  {/* Next payment */}
                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
                      <Clock size={13} /> Next payment: <strong className="text-[var(--color-text)]">{loan.nextPaymentDate}</strong>
                    </div>
                    <span className="font-bold">{formatCurrency(loan.nextPaymentAmount)}</span>
                  </div>

                  {/* Record payment */}
                  {payingLoan === loan.id ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input type="number" min="1" placeholder={`EMI: ₹${Math.round(loan.monthlyEmi).toLocaleString("en-IN")}`}
                        value={payAmt} onChange={e => setPayAmt(e.target.value)}
                        className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]" />
                      <button
                        disabled={!payAmt}
                        onClick={async () => {
                          const paid = Number(payAmt);
                          if (!paid) return;
                          try {
                            await api.post(`/api/credit/loans/${loan.id}/payment`, { amount: paid });
                            const next = new Date(loan.nextPaymentDate);
                            next.setMonth(next.getMonth() + 1);
                            updateActiveLoan({ ...loan, outstanding: Math.max(0, loan.outstanding - paid), nextPaymentDate: next.toISOString().split("T")[0] });
                            toast.success("Payment recorded");
                          } catch { toast.error("Failed to record payment"); }
                          setPayingLoan(null); setPayAmt("");
                        }}
                        className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40">
                        Confirm
                      </button>
                      <button onClick={() => { setPayingLoan(null); setPayAmt(""); }}
                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-2 py-1.5 rounded-lg hover:bg-[var(--color-accent)]">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setPayingLoan(loan.id); setPayAmt(String(Math.round(loan.monthlyEmi))); }}
                      className="flex items-center gap-1.5 text-xs text-green-400 hover:underline mb-2">
                      Record Payment
                    </button>
                  )}

                  {/* Repayment slider */}
                  <button onClick={() => setExpandRepay(expanded ? null : loan.id)}
                    className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline mb-2">
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Early repayment calculator
                  </button>

                  {expanded && (
                    <div className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)] space-y-3">
                      <div>
                        <label className="text-xs text-[var(--color-muted)] block mb-1">Pay off in (months)</label>
                        <div className="flex items-center gap-3">
                          <input type="range" min="1" max={loan.termMonths} value={customMonths}
                            onChange={e => setPayoffMonths(prev => ({ ...prev, [loan.id]: Number(e.target.value) }))}
                            className="flex-1 accent-[var(--color-primary)]" />
                          <span className="text-sm font-bold text-[var(--color-primary)] w-16 text-right">{customMonths}mo</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[var(--color-muted)]">Revised EMI</p>
                          <p className="text-base font-bold">{formatCurrency(earlyEmi)}</p>
                        </div>
                        <div>
                          <p className="text-[var(--color-muted)]">Interest saved</p>
                          <p className={`text-base font-bold ${earlySaving > 0 ? "text-green-400" : "text-[var(--color-text)]"}`}>
                            {earlySaving > 0 ? `Save ${formatCurrency(earlySaving)}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── NOT YET ── */}
      {tab === "notyet" && (() => {
        // Compute real CoV from monthly revenue over last 6 months
        const monthlyRevs: number[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(); d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
          const rev = transactions.filter(t => t.amount > 0 && t.date.startsWith(key)).reduce((s,t) => s+t.amount, 0);
          if (rev > 0) monthlyRevs.push(rev);
        }
        const meanRev = monthlyRevs.length ? monthlyRevs.reduce((a,b) => a+b, 0) / monthlyRevs.length : 0;
        const stdRev  = monthlyRevs.length > 1
          ? Math.sqrt(monthlyRevs.reduce((s,v) => s + Math.pow(v - meanRev, 2), 0) / monthlyRevs.length)
          : 0;
        const cov = meanRev > 0 ? stdRev / meanRev : 1;

        // Business age in months from first transaction
        const firstTx = transactions.slice().sort((a,b) => a.date.localeCompare(b.date))[0];
        const ageMonths = firstTx
          ? Math.floor((Date.now() - new Date(firstTx.date).getTime()) / (30.44 * 86400000))
          : 0;

        // Overdraft proxy: any day where cumulative balance went negative
        const overdraftCount = transactions.filter(t => {
          const runningTotal = transactions
            .filter(x => x.bankAccountId === t.bankAccountId && x.date <= t.date)
            .reduce((s, x) => s + x.amount, 0);
          return runningTotal < 0;
        }).length;

        // Top customer concentration
        const cpRevs = transactions.filter(t => t.amount > 0 && t.counterparty)
          .reduce<Record<string,number>>((acc,t) => { acc[t.counterparty] = (acc[t.counterparty]??0)+t.amount; return acc; }, {});
        const topCpRevs = Object.values(cpRevs).sort((a,b) => b-a);
        const topConc   = meanRev > 0 && topCpRevs[0] ? topCpRevs[0] / (meanRev * 6) : 0;

        const improvements: { label: string; action: string; points: number; done: boolean; detail: string }[] = [
          {
            label: "Revenue consistency (CoV)",
            action: `Reduce CoV from ${cov.toFixed(2)} → below 0.25`,
            points: cov > 0.25 ? 8 : 0,
            done: cov <= 0.25,
            detail: cov > 0.25
              ? `Your monthly revenue varies ${(cov*100).toFixed(0)}%. Lenders want <25% variation. This is the fastest lever — consistent invoicing adds ~8 pts.`
              : "Revenue consistency is strong.",
          },
          {
            label: "Business age",
            action: ageMonths < 12 ? `${12 - ageMonths} months until 1-year milestone` : ageMonths < 24 ? `${24 - ageMonths} months to 2-year tier` : "",
            points: ageMonths < 12 ? 10 : ageMonths < 24 ? 5 : 0,
            done: ageMonths >= 24,
            detail: ageMonths < 12
              ? `You have ${ageMonths} months of history. Lenders require 12+ for standard approval, 24+ for best rates.`
              : ageMonths < 24
                ? `At ${ageMonths} months, you qualify for standard tier. Reaching 24 months adds ~5 pts.`
                : "Business age is excellent.",
          },
          {
            label: "Customer concentration",
            action: topConc > 0.4 ? `Top customer is ${(topConc*100).toFixed(0)}% of revenue — add 2 more revenue sources` : "",
            points: topConc > 0.4 ? 6 : 0,
            done: topConc <= 0.4,
            detail: topConc > 0.4
              ? `Single customer concentration of ${(topConc*100).toFixed(0)}% is high risk. Diversify to add ~6 pts.`
              : "Revenue concentration is acceptable.",
          },
          {
            label: "Overdraft history",
            action: overdraftCount > 0 ? `${overdraftCount} negative balance occurrence${overdraftCount>1?"s":""} detected — maintain positive balance` : "",
            points: overdraftCount > 0 ? 5 : 0,
            done: overdraftCount === 0,
            detail: overdraftCount > 0
              ? `${overdraftCount} instance${overdraftCount>1?"s":""} of negative balance detected. Even 1 overdraft reduces the score by ~5 pts. Keep a buffer of 1-2 months burn.`
              : "No overdrafts detected.",
          },
          {
            label: "Monthly revenue level",
            action: meanRev < 300000 ? `Current avg ₹${(meanRev/1000).toFixed(0)}K — target ₹3L/mo for ₹15L credit` : "",
            points: meanRev < 300000 ? 5 : 0,
            done: meanRev >= 300000,
            detail: meanRev < 300000
              ? `Avg monthly revenue ₹${(meanRev/1000).toFixed(0)}K. ₹3L/mo unlocks ₹15L limit; ₹5L/mo unlocks ₹25L.`
              : `Revenue level of ₹${(meanRev/1000).toFixed(0)}K/mo is sufficient.`,
          },
        ];

        const gapTotal = improvements.filter(i => !i.done).reduce((s,i) => s+i.points, 0);
        const projectedScore = Math.min(100, bestScore + gapTotal);

        return (
          <div className="space-y-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
              <div className="flex items-start gap-3 mb-4">
                <Clock size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h2 className="text-sm font-semibold mb-0.5">
                    {bestScore > 0 ? `Score: ${bestScore}/100 — ${50 - bestScore} points to approval` : "Apply to see your score and exact gaps"}
                  </h2>
                  {gapTotal > 0 && bestScore > 0 && (
                    <p className="text-xs text-[var(--color-muted)]">
                      Fix the items below to reach <strong className="text-[var(--color-text)]">{projectedScore}/100</strong> (threshold: 50) — potential credit limit{" "}
                      <strong className="text-[var(--color-primary)]">{formatCurrency(meanRev * 3)}</strong>
                    </p>
                  )}
                </div>
              </div>

              {bestScore > 0 && (
                <div className="space-y-4">
                  {improvements.map(item => (
                    <div key={item.label} className={`rounded-lg border p-3 ${item.done ? "border-green-800/30 bg-green-950/10 opacity-60" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1">
                          {item.done
                            ? <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
                            : <div className="w-3.5 h-3.5 rounded-full border-2 border-yellow-500/60 shrink-0 mt-0.5" />}
                          <div>
                            <p className="text-xs font-semibold">{item.label}</p>
                            <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">{item.detail}</p>
                            {item.action && !item.done && (
                              <p className="text-[11px] text-[var(--color-primary)] mt-1 font-medium">→ {item.action}</p>
                            )}
                          </div>
                        </div>
                        {!item.done && item.points > 0 && (
                          <span className="text-xs font-bold text-yellow-400 bg-yellow-950/30 border border-yellow-800/30 px-2 py-0.5 rounded shrink-0">+{item.points} pts</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={13} className="text-[var(--color-primary)]" />
                <h3 className="text-sm font-semibold">Auto re-check in 30 days</h3>
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                Headroom re-scores your business every 30 days. Fix any item above and your score updates automatically.
                15% of declined applicants reach approval within 90 days.
              </p>
            </div>
          </div>
        );
      })()}

      {/* KFS modal */}
      {showKfs && (() => {
        const o = realOffers.find(x => x.id === showKfs);
        if (!o) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 w-full max-w-md">
              <h2 className="text-base font-bold mb-1">Key Facts Statement (KFS)</h2>
              <p className="text-xs text-[var(--color-muted)] mb-4">RBI Digital Lending Guidelines 2022 — mandatory disclosure</p>
              <div className="space-y-2 text-sm bg-[var(--color-bg)] rounded-lg p-4 border border-[var(--color-border)] mb-4">
                {[
                  ["Lender",               o.lender],
                  ["Loan amount",          formatCurrency(o.amount)],
                  ["APR",                  `${o.rate}%`],
                  ["Term",                 `${o.termMonths} months`],
                  ["Monthly EMI",          formatCurrency(o.monthlyEmi)],
                  ["Total interest",       formatCurrency(o.interest)],
                  ["Total repayment",      formatCurrency(o.total)],
                  ["Processing fee",       "₹999 (deducted at disbursement)"],
                  ["Prepayment",           "No penalty after 6 EMIs"],
                  ["Cooling-off period",   "3 calendar days"],
                  ["Grievance contact",    "grievance@headroom.app"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs"><span className="text-[var(--color-muted)]">{k}</span><span className="font-medium text-right">{v}</span></div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAccept(o)} className="flex-1 bg-[var(--color-primary)] text-[var(--color-bg)] font-bold py-2.5 rounded-lg text-sm hover:opacity-90">
                  I acknowledge — Accept Loan
                </button>
                <button onClick={() => setShowKfs(null)} className="px-4 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent)] rounded-lg">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── WC LOAN SIZING ── */}
      {tab === "wc" && <WCSizingTab />}
      {tab === "equip" && <EquipmentFinanceLease />}
    </div>
  );
}

function WCSizingTab() {
  const { store } = useApp();
  const [arDays,  setArDays]  = useState(45);
  const [apDays,  setApDays]  = useState(30);
  const [invDays, setInvDays] = useState(60);
  const [annualRevStr, setAnnualRevStr] = useState(() => {
    const rev12 = store.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    return rev12 > 0 ? String(Math.round(rev12)) : "";
  });
  const annualRev = parseFloat(annualRevStr) || 0;
  const dailySales = annualRev / 365;

  const arReq  = Math.round(dailySales * arDays);
  const invReq = Math.round(dailySales * invDays * 0.6); // COGS ~60% of sales
  const apCred = Math.round(dailySales * 0.6 * apDays);
  const wcReq  = arReq + invReq - apCred;
  const mpbfCalc = Math.max(0, Math.round(0.75 * wcReq));

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Working Capital Loan Sizing</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Based on Tandon Committee's 2nd method (MPBF = 75% of net working capital requirement). Adjust operating cycle days to model your business.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Annual Revenue / Net Sales (₹)</label>
            <input type="number" min={0} value={annualRevStr} onChange={e => setAnnualRevStr(e.target.value)} placeholder="e.g. 10000000"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]" />
          </div>

          {[
            { label: "Debtor days (AR collection period)", value: arDays, set: setArDays, min: 7, max: 180 },
            { label: "Inventory holding days", value: invDays, set: setInvDays, min: 7, max: 365 },
            { label: "Creditor days (AP payment period)", value: apDays, set: setApDays, min: 7, max: 120 },
          ].map(({ label, value, set, min, max }) => (
            <div key={label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <label className="text-[var(--color-muted)]">{label}</label>
                <span className="font-semibold text-[var(--color-text)]">{value} days</span>
              </div>
              <input type="range" min={min} max={max} value={value} onChange={e => set(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)]" />
            </div>
          ))}
        </div>
      </div>

      {annualRev > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Working Capital Requirement</h3>
          <div className="space-y-2 mb-4">
            {[
              { label: "Debtors (AR)",       value: arReq,    color: "text-blue-400",   op: "+" },
              { label: "Inventory",           value: invReq,   color: "text-orange-400", op: "+" },
              { label: "Creditors (AP)",      value: apCred,   color: "text-green-400",  op: "−" },
              { label: "Net WC Requirement",  value: wcReq,    color: "text-[var(--color-text)] font-bold", op: "=" },
            ].map(r => (
              <div key={r.label} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0 ${r.label.startsWith("Net") ? "pt-1" : ""}`}>
                <span className="text-xs text-[var(--color-muted)]"><span className="mr-2 font-mono">{r.op}</span>{r.label}</span>
                <span className={`tabular-nums ${r.color}`}>{formatCurrency(r.value)}</span>
              </div>
            ))}
          </div>
          <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--color-muted)]">MPBF (Max Permissible Bank Finance)</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">75% × Net WC Requirement (Tandon 2nd method)</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(mpbfCalc)}</p>
              <p className="text-[10px] text-[var(--color-muted)]">indicative limit</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        MPBF is a guideline; banks apply their own credit policies. Operating cycle = debtor days + inventory days − creditor days. Shorter cycle = lower WC need = better terms.
      </div>
    </div>
  );
}

function EquipmentFinanceLease() {
  const [assetCost,      setAssetCost]      = useState("");
  const [downPayment,    setDownPayment]     = useState("20");   // % of cost
  const [loanRate,       setLoanRate]        = useState("12");   // % p.a.
  const [loanTenure,     setLoanTenure]      = useState("36");   // months
  const [leaseMonthly,   setLeaseMonthly]    = useState("");     // monthly lease rent
  const [leaseTenure,    setLeaseTenure]     = useState("36");   // months
  const [residualPct,    setResidualPct]     = useState("20");   // buyout % at lease end
  const [taxRate,        setTaxRate]         = useState("25");   // corporate tax %

  const cost      = parseFloat(assetCost)    || 0;
  const dp        = (parseFloat(downPayment) / 100) * cost;
  const principal = cost - dp;
  const r         = parseFloat(loanRate)     / 100 / 12;
  const n         = parseInt(loanTenure)     || 36;
  const emi       = r > 0 && principal > 0 ? Math.round(principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)) : 0;
  const totalFinanceCost  = dp + emi * n;
  const totalInterest     = emi * n - principal;

  const lr          = parseFloat(leaseMonthly) || 0;
  const leaseMons   = parseInt(leaseTenure)    || 36;
  const residual    = (parseFloat(residualPct) / 100) * cost;
  const totalLeaseCost = lr * leaseMons + residual;

  const taxPct = parseFloat(taxRate) / 100;
  // Finance: depreciation 15% WDV is deductible; Lease: full rent deductible
  const annualDeprDeduction  = cost * 0.15;
  const annualLeaseDeduction = lr * 12;
  const taxSavingFinance     = Math.round(annualDeprDeduction * taxPct * (n / 12));
  const taxSavingLease       = Math.round(annualLeaseDeduction * taxPct * (leaseMons / 12));

  const netFinance = Math.round(totalFinanceCost - taxSavingFinance);
  const netLease   = Math.round(totalLeaseCost   - taxSavingLease);
  const winner     = cost > 0 ? (netFinance <= netLease ? "finance" : "lease") : null;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><CreditCard size={14} className="text-[var(--color-primary)]" /> Equipment Finance vs Lease</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Compare the total cost of ownership (after tax) of taking a term loan against a lease for the same asset.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Asset & Common</p>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Asset cost (₹)</label>
              <input type="number" value={assetCost} onChange={e => setAssetCost(e.target.value)} placeholder="e.g. 1500000"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Down payment</span><span className="font-semibold text-[var(--color-text)]">{downPayment}%</span></label>
              <input type="range" min={0} max={50} value={downPayment} onChange={e => setDownPayment(e.target.value)} className="w-full accent-[var(--color-primary)]" />
            </div>
            <div>
              <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Corporate tax rate</span><span className="font-semibold text-[var(--color-text)]">{taxRate}%</span></label>
              <input type="range" min={0} max={40} value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-full accent-[var(--color-primary)]" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Finance Terms</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Interest rate (% p.a.)</label>
                <input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} placeholder="12"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label>
                <input type="number" value={loanTenure} onChange={e => setLoanTenure(e.target.value)} placeholder="36"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] pt-1">Lease Terms</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Monthly rent (₹)</label>
                <input type="number" value={leaseMonthly} onChange={e => setLeaseMonthly(e.target.value)} placeholder="Lease EMI"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label>
                <input type="number" value={leaseTenure} onChange={e => setLeaseTenure(e.target.value)} placeholder="36"
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <div>
              <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Residual buyout at lease end</span><span className="font-semibold text-[var(--color-text)]">{residualPct}% = {cost > 0 ? formatCurrency(Math.round(residual)) : "—"}</span></label>
              <input type="range" min={0} max={50} value={residualPct} onChange={e => setResidualPct(e.target.value)} className="w-full accent-[var(--color-primary)]" />
            </div>
          </div>
        </div>
      </div>

      {cost > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Finance card */}
          <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${winner === "finance" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Term Finance</p>
              {winner === "finance" && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Cheaper option</span>}
            </div>
            <div className="space-y-2">
              {[
                { label: `Down payment (${downPayment}%)`, value: formatCurrency(Math.round(dp)) },
                { label: `EMI × ${n} months`, value: formatCurrency(emi) + " /mo" },
                { label: "Total interest paid", value: formatCurrency(totalInterest), color: "text-red-400" },
                { label: "Gross cost (dp + total EMI)", value: formatCurrency(Math.round(totalFinanceCost)), isBold: true },
                { label: `Tax saving (15% WDV depr @ ${taxRate}% tax)`, value: `(${formatCurrency(taxSavingFinance)})`, color: "text-green-400" },
                { label: "Net cost after tax", value: formatCurrency(netFinance), isBold: true, color: winner === "finance" ? "text-[var(--color-primary)]" : "text-[var(--color-text)]" },
              ].map(r => (
                <div key={r.label} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0 ${r.label.startsWith("Net") ? "pt-1" : ""}`}>
                  <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                  <span className={`tabular-nums ${r.isBold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lease card */}
          <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${winner === "lease" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Operating Lease</p>
              {winner === "lease" && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Cheaper option</span>}
            </div>
            <div className="space-y-2">
              {[
                { label: `Monthly rent × ${leaseMons} months`, value: `${formatCurrency(lr)} × ${leaseMons}` },
                { label: "Total lease payments", value: formatCurrency(Math.round(lr * leaseMons)) },
                { label: `Residual buyout (${residualPct}%)`, value: formatCurrency(Math.round(residual)), color: "text-red-400" },
                { label: "Gross cost (payments + buyout)", value: formatCurrency(Math.round(totalLeaseCost)), isBold: true },
                { label: `Tax saving (full rent deductible @ ${taxRate}%)`, value: `(${formatCurrency(taxSavingLease)})`, color: "text-green-400" },
                { label: "Net cost after tax", value: formatCurrency(netLease), isBold: true, color: winner === "lease" ? "text-[var(--color-primary)]" : "text-[var(--color-text)]" },
              ].map(r => (
                <div key={r.label} className={`flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0 ${r.label.startsWith("Net") ? "pt-1" : ""}`}>
                  <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                  <span className={`tabular-nums ${r.isBold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {cost > 0 && winner && (
        <div className={`rounded-lg px-4 py-3 border text-sm ${winner === "finance" ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30" : "bg-purple-900/20 border-purple-800/30"}`}>
          <span className="font-semibold">{winner === "finance" ? "Finance" : "Lease"} is cheaper</span> by {formatCurrency(Math.abs(netFinance - netLease))} on a net-of-tax basis over the term.
          {winner === "finance" ? " You own the asset outright at end of tenure — consider long-term residual value." : " Lease keeps balance sheet light and preserves working capital, but you don't own the asset until buyout."}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Finance tax saving assumes 15% WDV depreciation (Plant & Machinery, IT equipment). Lease tax saving assumes full rent deductible as operating expense. Consult your CA for actual deductibility based on asset class and lease structure.
      </div>
    </div>
  );
}
