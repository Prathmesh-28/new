import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, generateId, runwayDays, monthlyBurn } from "@/lib/utils";
import { AlertTriangle, CreditCard, TrendingUp, CheckCircle2, Clock, ChevronDown, ChevronUp, Info, X, Users, Calculator } from "lucide-react";
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

  const [tab,          setTab]          = useState<"overview" | "apply" | "loans" | "notyet" | "wc" | "equip" | "cc" | "fd" | "wcscore" | "captable" | "valuation">("overview");
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
          ["cc",       "CC Utilization"],
          ["fd",       "FD / RD"],
          ["wcscore",  "WC Health Score"],
          ["captable", "Cap Table"],
          ["valuation","Valuation"],
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
      {tab === "cc" && <CcUtilizationTab />}
      {tab === "fd" && <FdRdTab />}
      {tab === "wcscore" && <WcHealthScore />}
      {tab === "captable" && <CapTableTab />}
      {tab === "valuation" && <ValuationTab />}
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

function FdRdTab() {
  type Deposit = { id: string; kind: "FD" | "RD"; bank: string; principal: number; rate: number; tenure: number; tenureUnit: "months" | "years"; startDate: string; monthlyRd?: number; tdsApplied: boolean };
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [kind,        setKind]        = useState<"FD" | "RD">("FD");
  const [bank,        setBank]        = useState("");
  const [principal,   setPrincipal]   = useState("");
  const [rate,        setRate]        = useState("");
  const [tenure,      setTenure]      = useState("");
  const [tenureUnit,  setTenureUnit]  = useState<"months" | "years">("months");
  const [startDate,   setStartDate]   = useState(() => new Date().toISOString().split("T")[0]);
  const [monthlyRd,   setMonthlyRd]   = useState("");
  const [tdsApplied,  setTdsApplied]  = useState(true);

  const addDeposit = () => {
    if (!bank || !principal || !rate || !tenure) return;
    setDeposits(prev => [...prev, {
      id: Math.random().toString(36).slice(2), kind, bank,
      principal: parseFloat(principal), rate: parseFloat(rate),
      tenure: parseFloat(tenure), tenureUnit, startDate,
      monthlyRd: kind === "RD" ? parseFloat(monthlyRd) || undefined : undefined,
      tdsApplied,
    }]);
    setBank(""); setPrincipal(""); setRate(""); setTenure(""); setMonthlyRd("");
  };

  const today = new Date();

  const calcMaturity = (d: Deposit) => {
    const months = d.tenureUnit === "years" ? d.tenure * 12 : d.tenure;
    const maturityDate = new Date(d.startDate);
    maturityDate.setMonth(maturityDate.getMonth() + months);

    let interest = 0;
    if (d.kind === "FD") {
      // Compound interest quarterly
      const n = months / 3;
      const r = d.rate / 100 / 4;
      interest = Math.round(d.principal * (Math.pow(1 + r, n) - 1));
    } else {
      // RD: M × ((1+r)^n - 1) / (1 - (1+r)^(-1/3)) where r=quarterly rate
      const monthly = d.monthlyRd ?? d.principal;
      const r = d.rate / 100 / 4;
      const n = months / 3;
      const maturity = monthly * (Math.pow(1 + r, n) - 1) / (1 - Math.pow(1 + r, -1/3));
      interest = Math.round(maturity - monthly * months);
    }

    const tds     = d.tdsApplied ? Math.round(interest * 0.1) : 0;
    const netInt  = interest - tds;
    const daysLeft = Math.ceil((maturityDate.getTime() - today.getTime()) / 86400000);
    const matured  = daysLeft <= 0;
    return { maturityDate, interest, tds, netInt, daysLeft, matured, maturityValue: d.principal + netInt };
  };

  const totalPrincipal = deposits.reduce((s,d) => s + d.principal, 0);
  const totalInterest  = deposits.reduce((s,d) => s + calcMaturity(d).netInt, 0);
  const maturing30     = deposits.filter(d => { const { daysLeft } = calcMaturity(d); return daysLeft >= 0 && daysLeft <= 30; });

  return (
    <div className="space-y-4 max-w-3xl">
      {deposits.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total principal",        value: formatCurrency(totalPrincipal), color: "text-[var(--color-text)]" },
            { label: "Net interest (post-TDS)", value: formatCurrency(totalInterest),  color: "text-green-400" },
            { label: "Total deposits",          value: deposits.length.toString(),      color: "text-[var(--color-text)]" },
            { label: "Maturing in 30 days",     value: maturing30.length.toString(),   color: maturing30.length > 0 ? "text-yellow-400" : "text-[var(--color-muted)]" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Add Deposit</h3>
        <div className="flex gap-2 mb-3">
          {(["FD","RD"] as const).map(k => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${kind === k ? "bg-[var(--color-primary)] text-[var(--color-bg)] border-transparent" : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
              {k === "FD" ? "Fixed Deposit" : "Recurring Deposit"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="Bank / institution *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={principal} onChange={e=>setPrincipal(e.target.value)} placeholder={kind === "FD" ? "Principal (₹) *" : "Total deposit (₹) *"}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          {kind === "RD" && (
            <input type="number" value={monthlyRd} onChange={e=>setMonthlyRd(e.target.value)} placeholder="Monthly instalment (₹)"
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          )}
          <input type="number" value={rate} onChange={e=>setRate(e.target.value)} placeholder="Interest rate (% p.a.) *"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <div className="flex gap-2">
            <input type="number" value={tenure} onChange={e=>setTenure(e.target.value)} placeholder="Tenure *"
              className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
            <select value={tenureUnit} onChange={e=>setTenureUnit(e.target.value as "months"|"years")}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--color-primary)]">
              <option value="months">Mo</option>
              <option value="years">Yr</option>
            </select>
          </div>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={tdsApplied} onChange={e=>setTdsApplied(e.target.checked)} className="accent-[var(--color-primary)]" />
            <span>TDS @ 10% applicable (interest &gt; ₹40K/yr)</span>
          </label>
          <button onClick={addDeposit} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
            + Add
          </button>
        </div>
      </div>

      {deposits.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <TrendingUp size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No deposits tracked. Add FDs and RDs to monitor maturity dates and interest.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deposits
            .slice()
            .sort((a,b) => calcMaturity(a).daysLeft - calcMaturity(b).daysLeft)
            .map(d => {
              const { maturityDate, interest, tds, netInt, daysLeft, matured, maturityValue } = calcMaturity(d);
              return (
                <div key={d.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${matured ? "border-purple-800/40" : daysLeft <= 30 ? "border-yellow-800/40" : "border-[var(--color-border)]"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{d.bank}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${d.kind === "FD" ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-purple-900/30 text-purple-400 border-purple-800/40"}`}>{d.kind}</span>
                        {matured && <span className="text-[9px] bg-purple-900/30 text-purple-400 border border-purple-800/40 px-1.5 py-0.5 rounded-full font-semibold">Matured</span>}
                        {!matured && daysLeft <= 30 && <span className="text-[9px] bg-yellow-900/30 text-yellow-400 border border-yellow-800/40 px-1.5 py-0.5 rounded-full font-semibold">Maturing soon</span>}
                      </div>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{d.rate}% p.a. · {d.tenure} {d.tenureUnit} · Started {d.startDate} · Matures {maturityDate.toISOString().split("T")[0]}</p>
                    </div>
                    <button onClick={() => setDeposits(prev => prev.filter(x => x.id !== d.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><p className="text-[var(--color-muted)]">Principal</p><p className="font-semibold tabular-nums mt-0.5">{formatCurrency(d.principal)}</p></div>
                    <div><p className="text-[var(--color-muted)]">Gross interest</p><p className="font-semibold tabular-nums text-green-400 mt-0.5">{formatCurrency(interest)}</p></div>
                    <div><p className="text-[var(--color-muted)]">TDS {d.tdsApplied ? "(10%)" : "(nil)"}</p><p className="font-semibold tabular-nums text-red-400 mt-0.5">{d.tdsApplied ? `(${formatCurrency(tds)})` : "—"}</p></div>
                    <div><p className="text-[var(--color-muted)]">Maturity value</p><p className="font-bold tabular-nums text-[var(--color-primary)] mt-0.5">{formatCurrency(maturityValue)}</p></div>
                  </div>
                  {!matured && (
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] text-[var(--color-muted)] mb-1">
                        <span>{d.startDate}</span>
                        <span className={daysLeft <= 30 ? "text-yellow-400 font-semibold" : ""}>{daysLeft}d remaining</span>
                        <span>{maturityDate.toISOString().split("T")[0]}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                        {(() => {
                          const totalDays = Math.ceil((maturityDate.getTime() - new Date(d.startDate).getTime()) / 86400000);
                          const elapsed   = totalDays - Math.max(0, daysLeft);
                          const pct       = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
                          return <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function CcUtilizationTab() {
  type Card = { id: string; name: string; bank: string; limit: number; balance: number; dueDate: string; minDue: number };
  const [cards, setCards]     = useState<Card[]>([]);
  const [name,  setName]      = useState("");
  const [bank,  setBank]      = useState("");
  const [limit, setLimit]     = useState("");
  const [bal,   setBal]       = useState("");
  const [due,   setDue]       = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  });
  const [minDue, setMinDue]   = useState("");

  const addCard = () => {
    if (!name || !limit) return;
    const l = parseFloat(limit), b = parseFloat(bal) || 0;
    setCards(prev => [...prev, { id: Math.random().toString(36).slice(2), name, bank, limit: l, balance: b, dueDate: due, minDue: parseFloat(minDue) || Math.round(b * 0.05) }]);
    setName(""); setBank(""); setLimit(""); setBal(""); setMinDue("");
  };

  const updateBalance = (id: string, val: string) => setCards(prev => prev.map(c => c.id === id ? { ...c, balance: parseFloat(val) || 0, minDue: Math.round((parseFloat(val) || 0) * 0.05) } : c));
  const removeCard    = (id: string) => setCards(prev => prev.filter(c => c.id !== id));

  const totalLimit    = cards.reduce((s,c) => s + c.limit, 0);
  const totalBalance  = cards.reduce((s,c) => s + c.balance, 0);
  const totalUtil     = totalLimit > 0 ? Math.round((totalBalance / totalLimit) * 100) : 0;
  const totalMinDue   = cards.reduce((s,c) => s + c.minDue, 0);
  const today         = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4 max-w-2xl">
      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total credit limit",   value: formatCurrency(totalLimit),   color: "text-[var(--color-text)]" },
            { label: "Total balance used",   value: formatCurrency(totalBalance), color: totalUtil > 70 ? "text-red-400" : totalUtil > 30 ? "text-orange-400" : "text-green-400" },
            { label: "Overall utilization",  value: `${totalUtil}%`,              color: totalUtil > 70 ? "text-red-400" : totalUtil > 30 ? "text-orange-400" : "text-green-400" },
            { label: "Total minimum due",    value: formatCurrency(totalMinDue),  color: "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
              <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {totalUtil > 70 && (
        <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
          <AlertTriangle size={14} className="text-red-400 shrink-0" />
          <span>Overall CC utilization is {totalUtil}% — high utilization lowers your credit score and may signal cash flow stress to lenders. Keep below 30% for optimal credit health.</span>
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3">Add Credit Card</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Card name (e.g. HDFC Regalia)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input value={bank} onChange={e=>setBank(e.target.value)} placeholder="Issuing bank"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={limit} onChange={e=>setLimit(e.target.value)} placeholder="Credit limit (₹)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={bal} onChange={e=>setBal(e.target.value)} placeholder="Current balance (₹)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="date" value={due} onChange={e=>setDue(e.target.value)}
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
          <input type="number" value={minDue} onChange={e=>setMinDue(e.target.value)} placeholder="Min due (₹, auto 5%)"
            className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        </div>
        <button onClick={addCard} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          + Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <CreditCard size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No credit cards added yet. Track your business credit cards above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(c => {
            const util     = c.limit > 0 ? Math.round((c.balance / c.limit) * 100) : 0;
            const available = c.limit - c.balance;
            const overdue  = c.dueDate < today;
            return (
              <div key={c.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${overdue ? "border-red-800/40" : "border-[var(--color-border)]"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-sm">{c.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{c.bank || "—"} · Due: <span className={overdue ? "text-red-400 font-semibold" : ""}>{c.dueDate}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${util > 70 ? "text-red-400" : util > 30 ? "text-orange-400" : "text-green-400"}`}>{util}%</span>
                    <button onClick={() => removeCard(c.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(util, 100)}%`, background: util > 70 ? "#ef4444" : util > 30 ? "#f97316" : "#22c55e" }} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-[var(--color-muted)]">Balance</p>
                    <input type="number" value={c.balance || ""} onChange={e => updateBalance(c.id, e.target.value)}
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 tabular-nums text-xs outline-none focus:border-[var(--color-primary)] mt-0.5" />
                  </div>
                  <div><p className="text-[var(--color-muted)]">Limit</p><p className="font-semibold tabular-nums mt-1">{formatCurrency(c.limit)}</p></div>
                  <div><p className="text-[var(--color-muted)]">Available</p><p className="font-semibold tabular-nums text-green-400 mt-1">{formatCurrency(available)}</p></div>
                  <div><p className="text-[var(--color-muted)]">Min due</p><p className="font-semibold tabular-nums text-yellow-400 mt-1">{formatCurrency(c.minDue)}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Keep utilization below 30% per card for healthy credit scoring. Always pay the full balance to avoid 36–42% p.a. revolving interest on business credit cards.
      </div>
    </div>
  );
}

function WcHealthScore() {
  const { store } = useApp();

  const [currentAssets,   setCurrentAssets]   = useState("");
  const [currentLiab,     setCurrentLiab]     = useState("");
  const [inventory,       setInventory]       = useState("");
  const [receivables,     setReceivables]     = useState("");
  const [payables,        setPayables]        = useState("");
  const [annualRevenue,   setAnnualRevenue]   = useState("");
  const [annualCogs,      setAnnualCogs]      = useState("");

  const storeRevenue = (store.transactions ?? []).filter(t => t.category === "revenue").reduce((s, t) => s + Math.abs(t.amount), 0);

  const ca  = parseFloat(currentAssets)  || 0;
  const cl  = parseFloat(currentLiab)    || 0;
  const inv = parseFloat(inventory)      || 0;
  const ar  = parseFloat(receivables)    || 0;
  const ap  = parseFloat(payables)       || 0;
  const rev = parseFloat(annualRevenue)  || storeRevenue * 12 / Math.max((store.transactions ?? []).length / 30, 1);
  const cogs= parseFloat(annualCogs)     || rev * 0.6;

  const currentRatio   = cl > 0 ? ca / cl : 0;
  const quickRatio     = cl > 0 ? (ca - inv) / cl : 0;
  const dso            = rev > 0 ? Math.round((ar / (rev / 365))) : 0;
  const dpo            = cogs > 0 ? Math.round((ap / (cogs / 365))) : 0;
  const dio            = cogs > 0 ? Math.round((inv / (cogs / 365))) : 0;
  const ccc            = dso + dio - dpo; // Cash Conversion Cycle
  const workingCapital = ca - cl;

  const scoreComponents = [
    { label: "Current Ratio",  value: currentRatio,  good: 1.5, bad: 1.0, unit: "x",   weight: 25 },
    { label: "Quick Ratio",    value: quickRatio,    good: 1.0, bad: 0.7, unit: "x",   weight: 20 },
    { label: "DSO (days)",     value: dso,           good: 30,  bad: 60,  unit: "d",   weight: 20, invert: true },
    { label: "DPO (days)",     value: dpo,           good: 45,  bad: 20,  unit: "d",   weight: 15 },
    { label: "DIO (days)",     value: dio,           good: 30,  bad: 60,  unit: "d",   weight: 20, invert: true },
  ];

  const totalScore = scoreComponents.reduce((sum, c) => {
    let raw: number;
    if (c.invert) {
      raw = c.value <= 0 ? 1 : c.value <= c.good ? 1 : c.value >= c.bad ? 0 : (c.bad - c.value) / (c.bad - c.good);
    } else {
      raw = c.value <= 0 ? 0 : c.value >= c.good ? 1 : c.value <= c.bad ? 0 : (c.value - c.bad) / (c.good - c.bad);
    }
    return sum + raw * c.weight;
  }, 0);

  const grade = totalScore >= 80 ? { label: "Excellent", cls: "text-green-400" } : totalScore >= 60 ? { label: "Good", cls: "text-blue-400" } : totalScore >= 40 ? { label: "Fair", cls: "text-yellow-400" } : { label: "Poor", cls: "text-red-400" };
  const fc = formatCurrency;
  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Working Capital Health Score</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Current Assets (₹)", val: currentAssets, set: setCurrentAssets },
            { label: "Current Liabilities (₹)", val: currentLiab, set: setCurrentLiab },
            { label: "Inventory (₹)", val: inventory, set: setInventory },
            { label: "Accounts Receivable (₹)", val: receivables, set: setReceivables },
            { label: "Accounts Payable (₹)", val: payables, set: setPayables },
            { label: "Annual Revenue (₹)", val: annualRevenue, set: setAnnualRevenue, placeholder: `Auto: ${fc(rev)}` },
            { label: "Annual COGS (₹)", val: annualCogs, set: setAnnualCogs, placeholder: `Auto: ${fc(cogs)}` },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-[var(--color-muted)] block mb-1">{f.label}</label>
              <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder ?? "0"} className={inp} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "WC Score",         value: `${Math.round(totalScore)}/100`, color: grade.cls },
          { label: "Grade",            value: grade.label,                     color: grade.cls },
          { label: "Working Capital",  value: fc(workingCapital),              color: workingCapital >= 0 ? "text-green-400" : "text-red-400" },
          { label: "Cash Conv. Cycle", value: `${ccc}d`,                       color: ccc <= 30 ? "text-green-400" : ccc <= 60 ? "text-yellow-400" : "text-red-400" },
        ].map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold">Component Scores</span>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {scoreComponents.map(c => {
            const raw = c.invert
              ? (c.value <= 0 ? 1 : c.value <= c.good ? 1 : c.value >= c.bad ? 0 : (c.bad - c.value) / (c.bad - c.good))
              : (c.value <= 0 ? 0 : c.value >= c.good ? 1 : c.value <= c.bad ? 0 : (c.value - c.bad) / (c.good - c.bad));
            const pct = Math.round(raw * 100);
            return (
              <div key={c.label} className="flex items-center gap-4 px-4 py-3">
                <span className="text-xs font-semibold w-28">{c.label}</span>
                <span className="tabular-nums text-xs w-16">{c.value > 0 ? `${c.value.toFixed(1)}${c.unit}` : "—"}</span>
                <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs tabular-nums w-12 text-right font-semibold">{pct}%</span>
                <span className="text-[10px] text-[var(--color-muted)] w-12">wt {c.weight}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        {[
          { label: "DSO",  value: `${dso}d`,  note: "Days Sales Outstanding — lower is better",  good: dso <= 30 },
          { label: "DPO",  value: `${dpo}d`,  note: "Days Payable Outstanding — higher is better (pay later)", good: dpo >= 45 },
          { label: "DIO",  value: `${dio}d`,  note: "Days Inventory Outstanding — lower is better",  good: dio <= 30 },
        ].map(m => (
          <div key={m.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">{m.label}</span>
              <span className={`font-bold ${m.good ? "text-green-400" : "text-orange-400"}`}>{m.value}</span>
            </div>
            <p className="text-[var(--color-muted)]">{m.note}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--color-muted)]">CCC = DSO + DIO − DPO. Lower CCC = faster cash cycle. Score uses weighted average of 5 ratios. Enter balance sheet figures for accurate scoring — revenue auto-estimated from transactions.</p>
    </div>
  );
}

type ShareClass = "Founder" | "Equity" | "Preference" | "ESOP Pool" | "Angel" | "VC";
type Shareholder = { id: string; name: string; shareClass: ShareClass; sharesHeld: number; amountInvested: number };

const SHARE_CLASSES: ShareClass[] = ["Founder", "Equity", "Preference", "ESOP Pool", "Angel", "VC"];
const SHARE_CLASS_BADGE: Record<ShareClass, string> = {
  "Founder":    "bg-blue-900/30 text-blue-400 border-blue-800/40",
  "Equity":     "bg-green-900/30 text-green-400 border-green-800/40",
  "Preference": "bg-purple-900/30 text-purple-400 border-purple-800/40",
  "ESOP Pool":  "bg-orange-900/30 text-orange-400 border-orange-800/40",
  "Angel":      "bg-pink-900/30 text-pink-400 border-pink-800/40",
  "VC":         "bg-cyan-900/30 text-cyan-400 border-cyan-800/40",
};

function CapTableTab() {
  const { store } = useApp();
  const [holders, setHolders] = useState<Shareholder[]>(() => {
    const founder = store.firm?.name ? `${store.firm.name} (Founders)` : "Founders";
    return [
      { id: generateId(), name: founder,      shareClass: "Founder",   sharesHeld: 8000000, amountInvested: 1000000 },
      { id: generateId(), name: "ESOP Pool",   shareClass: "ESOP Pool", sharesHeld: 1000000, amountInvested: 0 },
      { id: generateId(), name: "Angel Round", shareClass: "Angel",     sharesHeld: 1000000, amountInvested: 5000000 },
    ];
  });

  const [name,       setName]       = useState("");
  const [shareClass, setShareClass] = useState<ShareClass>("Equity");
  const [shares,     setShares]     = useState("");
  const [invested,   setInvested]   = useState("");

  // Dilution simulator inputs
  const [roundInvestStr, setRoundInvestStr] = useState("");
  const [preMoneyStr,    setPreMoneyStr]    = useState("");

  const addHolder = () => {
    const s = parseFloat(shares) || 0;
    if (!name.trim() || s <= 0) { toast.error("Enter a name and shares held"); return; }
    setHolders(prev => [...prev, {
      id: generateId(), name: name.trim(), shareClass,
      sharesHeld: s, amountInvested: parseFloat(invested) || 0,
    }]);
    setName(""); setShares(""); setInvested("");
  };

  const totalShares  = useMemo(() => holders.reduce((s, h) => s + (h.sharesHeld || 0), 0), [holders]);
  const totalCapital = useMemo(() => holders.reduce((s, h) => s + (h.amountInvested || 0), 0), [holders]);
  const founderPct   = useMemo(() => {
    if (totalShares <= 0) return 0;
    const fs = holders.filter(h => h.shareClass === "Founder").reduce((s, h) => s + (h.sharesHeld || 0), 0);
    return (fs / totalShares) * 100;
  }, [holders, totalShares]);

  const sorted = useMemo(
    () => holders.slice().sort((a, b) => (b.sharesHeld || 0) - (a.sharesHeld || 0)),
    [holders]
  );

  // Dilution math
  const roundInvest = parseFloat(roundInvestStr) || 0;
  const preMoney    = parseFloat(preMoneyStr)    || 0;
  const postMoney   = preMoney + roundInvest;
  const newInvPct   = postMoney > 0 ? (roundInvest / postMoney) * 100 : 0;
  const pricePerShare = preMoney > 0 && totalShares > 0 ? preMoney / totalShares : 0;
  const newShares   = pricePerShare > 0 ? roundInvest / pricePerShare : 0;
  const dilutedTotal = totalShares + newShares;
  const simActive   = roundInvest > 0 && preMoney > 0 && totalShares > 0;

  const kpis = [
    { label: "Total Shares Issued",  value: totalShares.toLocaleString("en-IN"), color: "text-[var(--color-text)]" },
    { label: "Total Capital Raised", value: formatCurrency(totalCapital),         color: "text-[var(--color-primary)]" },
    { label: "# Shareholders",       value: holders.length.toString(),            color: "text-[var(--color-text)]" },
    { label: "Founder Ownership",    value: `${founderPct.toFixed(1)}%`,          color: founderPct >= 50 ? "text-green-400" : founderPct >= 25 ? "text-yellow-400" : "text-red-400" },
  ];

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Add shareholder */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users size={14} className="text-[var(--color-primary)]" /> Add Shareholder</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Holder name *" className={inp} />
          <select value={shareClass} onChange={e => setShareClass(e.target.value as ShareClass)} className={inp}>
            {SHARE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" min={0} value={shares} onChange={e => setShares(e.target.value)} placeholder="Shares held *" className={inp} />
          <input type="number" min={0} value={invested} onChange={e => setInvested(e.target.value)} placeholder="Amount invested (₹)" className={inp} />
        </div>
        <button onClick={addHolder} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">
          + Add Shareholder
        </button>
      </div>

      {/* Cap table */}
      {holders.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No shareholders yet. Add founders, investors and the ESOP pool above.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]"><span className="text-sm font-semibold">Cap Table</span></div>
          <div className="divide-y divide-[var(--color-border)]">
            {sorted.map(h => {
              const pct = totalShares > 0 ? ((h.sharesHeld || 0) / totalShares) * 100 : 0;
              return (
                <div key={h.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{h.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${SHARE_CLASS_BADGE[h.shareClass]}`}>{h.shareClass}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[var(--color-muted)] tabular-nums">{formatCurrency(h.amountInvested || 0)}</span>
                      <span className="text-sm font-bold tabular-nums text-[var(--color-primary)] w-16 text-right">{pct.toFixed(1)}%</span>
                      <button onClick={() => setHolders(prev => prev.filter(x => x.id !== h.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className="text-[10px] text-[var(--color-muted)] tabular-nums w-28 text-right">{(h.sharesHeld || 0).toLocaleString("en-IN")} sh</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dilution simulator */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingUp size={14} className="text-[var(--color-primary)]" /> Dilution Simulator</h3>
        <p className="text-xs text-[var(--color-muted)] mb-4">Model a priced equity round and see how existing holders are diluted.</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">New investment (₹)</label>
            <input type="number" min={0} value={roundInvestStr} onChange={e => setRoundInvestStr(e.target.value)} placeholder="e.g. 50000000" className={`w-full ${inp}`} />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted)] block mb-1">Pre-money valuation (₹)</label>
            <input type="number" min={0} value={preMoneyStr} onChange={e => setPreMoneyStr(e.target.value)} placeholder="e.g. 200000000" className={`w-full ${inp}`} />
          </div>
        </div>

        {simActive ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Post-money",        value: formatCurrency(postMoney),            color: "text-[var(--color-text)]" },
                { label: "New investor %",     value: `${newInvPct.toFixed(1)}%`,           color: "text-[var(--color-primary)]" },
                { label: "Price / share",      value: formatCurrency(pricePerShare),        color: "text-[var(--color-text)]" },
                { label: "New shares issued",  value: Math.round(newShares).toLocaleString("en-IN"), color: "text-[var(--color-text)]" },
              ].map(k => (
                <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                  <p className={`text-base font-bold tabular-nums ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden border border-[var(--color-border)] rounded-lg">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-[var(--color-bg)] text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                <span>Holder</span>
                <span className="text-right">Shares</span>
                <span className="text-right">Before %</span>
                <span className="text-right">After %</span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {sorted.map(h => {
                  const before = totalShares > 0 ? ((h.sharesHeld || 0) / totalShares) * 100 : 0;
                  const after  = dilutedTotal > 0 ? ((h.sharesHeld || 0) / dilutedTotal) * 100 : 0;
                  return (
                    <div key={h.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-xs items-center">
                      <span className="truncate font-medium">{h.name}</span>
                      <span className="text-right tabular-nums text-[var(--color-muted)]">{(h.sharesHeld || 0).toLocaleString("en-IN")}</span>
                      <span className="text-right tabular-nums">{before.toFixed(1)}%</span>
                      <span className="text-right tabular-nums text-orange-400">{after.toFixed(1)}%</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs items-center bg-[var(--color-primary)]/5">
                  <span className="truncate font-semibold text-[var(--color-primary)]">New Investor</span>
                  <span className="text-right tabular-nums text-[var(--color-muted)]">{Math.round(newShares).toLocaleString("en-IN")}</span>
                  <span className="text-right tabular-nums text-[var(--color-muted)]">—</span>
                  <span className="text-right tabular-nums font-bold text-[var(--color-primary)]">{newInvPct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">Enter a new investment amount and pre-money valuation (with at least one shareholder above) to see the dilution table.</p>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Simplified model — ignores option pool top-ups, liquidation preferences and anti-dilution provisions. Ownership % = shares held ÷ total shares. Post-money = pre-money + investment; new investor % = investment ÷ post-money; price/share = pre-money ÷ existing shares. Consult a CS/lawyer for the definitive cap table.
      </p>
    </div>
  );
}

function ValuationTab() {
  const { store } = useApp();

  // Auto-estimate annualised revenue from store revenue transactions.
  const autoAnnualRev = useMemo(() => {
    const txns = store.transactions ?? [];
    const revTxns = txns.filter(t => t.category === "revenue");
    const totalRev = revTxns.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    if (totalRev <= 0) return 0;
    // Annualise based on the span of revenue transaction dates.
    const dates = revTxns.map(t => t.date).filter(Boolean).sort();
    if (dates.length < 2) return Math.round(totalRev * 12);
    const spanDays = Math.max(1, (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000);
    return Math.round(totalRev * (365 / spanDays));
  }, [store.transactions]);

  // DCF inputs
  const [fcfStr,        setFcfStr]        = useState("");
  const [growthStr,     setGrowthStr]     = useState("15");
  const [waccStr,       setWaccStr]       = useState("15");
  const [termGrowthStr, setTermGrowthStr] = useState("4");
  const [projYearsStr,  setProjYearsStr]  = useState("5");

  // Revenue multiple inputs
  const [revStr,     setRevStr]     = useState(autoAnnualRev > 0 ? String(autoAnnualRev) : "");
  const [revMultStr, setRevMultStr] = useState("2.0");

  // EBITDA multiple inputs
  const [ebitdaStr,     setEbitdaStr]     = useState("");
  const [ebitdaMultStr, setEbitdaMultStr] = useState("6.0");

  const fcf        = parseFloat(fcfStr)        || 0;
  const growth     = (parseFloat(growthStr)     || 0) / 100;
  const wacc       = (parseFloat(waccStr)       || 0) / 100;
  const termGrowth = (parseFloat(termGrowthStr) || 0) / 100;
  const projYears  = Math.max(1, Math.min(15, Math.round(parseFloat(projYearsStr) || 5)));

  const dcfValid = wacc > termGrowth && fcf > 0;

  // Year-by-year DCF projection
  const dcfRows = useMemo(() => {
    if (!dcfValid) return [];
    const rows: { year: number; projectedFcf: number; discountFactor: number; pv: number }[] = [];
    for (let t = 1; t <= projYears; t++) {
      const projectedFcf   = fcf * Math.pow(1 + growth, t);
      const discountFactor = 1 / Math.pow(1 + wacc, t);
      rows.push({ year: t, projectedFcf, discountFactor, pv: projectedFcf * discountFactor });
    }
    return rows;
  }, [dcfValid, fcf, growth, wacc, projYears]);

  const dcfEv = useMemo(() => {
    if (!dcfValid) return 0;
    const sumPv = dcfRows.reduce((s, r) => s + r.pv, 0);
    const lastFcf = fcf * Math.pow(1 + growth, projYears);
    const terminalValue = (lastFcf * (1 + termGrowth)) / (wacc - termGrowth);
    const discTerminal = terminalValue / Math.pow(1 + wacc, projYears);
    return sumPv + discTerminal;
  }, [dcfValid, dcfRows, fcf, growth, projYears, termGrowth, wacc]);

  const annualRev = parseFloat(revStr)    || 0;
  const revMult   = parseFloat(revMultStr) || 0;
  const revEv     = annualRev * revMult;

  const ebitda    = parseFloat(ebitdaStr)     || 0;
  const ebitdaMult= parseFloat(ebitdaMultStr) || 0;
  const ebitdaEv  = ebitda * ebitdaMult;

  // Blended = equal-weight average of methods that have a value.
  const methodEvs = [dcfEv, revEv, ebitdaEv].filter(v => v > 0);
  const blendedEv = methodEvs.length > 0 ? methodEvs.reduce((s, v) => s + v, 0) / methodEvs.length : 0;

  const kpis = [
    { label: "DCF EV",            value: dcfValid ? formatCurrency(dcfEv) : "—", color: "text-blue-400" },
    { label: "Revenue-multiple EV", value: revEv > 0 ? formatCurrency(revEv) : "—", color: "text-green-400" },
    { label: "EBITDA-multiple EV",  value: ebitdaEv > 0 ? formatCurrency(ebitdaEv) : "—", color: "text-purple-400" },
    { label: "Blended EV",          value: blendedEv > 0 ? formatCurrency(blendedEv) : "—", color: "text-[var(--color-primary)]" },
  ];

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--color-muted)] mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* DCF */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 md:col-span-3">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-blue-400" /> 1. Discounted Cash Flow (DCF)</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">Project free cash flow, discount to present value, add a terminal value.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual FCF (₹)</label>
              <input type="number" min={0} value={fcfStr} onChange={e => setFcfStr(e.target.value)} placeholder="e.g. 5000000" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Growth rate (%)</label>
              <input type="number" value={growthStr} onChange={e => setGrowthStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">WACC / discount (%)</label>
              <input type="number" value={waccStr} onChange={e => setWaccStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Terminal growth (%)</label>
              <input type="number" value={termGrowthStr} onChange={e => setTermGrowthStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Projection years</label>
              <input type="number" min={1} max={15} value={projYearsStr} onChange={e => setProjYearsStr(e.target.value)} className={inp} />
            </div>
          </div>

          {fcf > 0 && wacc <= termGrowth ? (
            <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span>WACC ({(wacc * 100).toFixed(1)}%) must be greater than terminal growth ({(termGrowth * 100).toFixed(1)}%) for a valid terminal value. Increase WACC or lower terminal growth.</span>
            </div>
          ) : dcfValid ? (
            <>
              <div className="flex items-center justify-between bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-4 py-3 mb-4">
                <div>
                  <p className="text-xs text-[var(--color-muted)]">Enterprise Value (DCF)</p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">Σ discounted FCF + discounted terminal value</p>
                </div>
                <p className="text-xl font-bold tabular-nums text-blue-400">{formatCurrency(dcfEv)}</p>
              </div>
              <div className="overflow-hidden border border-[var(--color-border)] rounded-lg">
                <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-[var(--color-bg)] text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wide">
                  <span>Year</span>
                  <span className="text-right">Projected FCF</span>
                  <span className="text-right">Discount Factor</span>
                  <span className="text-right">Present Value</span>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {dcfRows.map(r => (
                    <div key={r.year} className="grid grid-cols-4 gap-2 px-3 py-2 text-xs items-center">
                      <span className="font-medium">Year {r.year}</span>
                      <span className="text-right tabular-nums">{formatCurrency(r.projectedFcf)}</span>
                      <span className="text-right tabular-nums text-[var(--color-muted)]">{r.discountFactor.toFixed(3)}</span>
                      <span className="text-right tabular-nums text-blue-400">{formatCurrency(r.pv)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Enter an annual FCF above to compute the DCF enterprise value.</p>
          )}
        </div>

        {/* Revenue multiple */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><TrendingUp size={14} className="text-green-400" /> 2. Revenue Multiple</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">EV = annual revenue × multiple.</p>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual revenue (₹){autoAnnualRev > 0 ? <span className="text-[10px] ml-1">auto: {formatCurrency(autoAnnualRev)}</span> : null}</label>
              <input type="number" min={0} value={revStr} onChange={e => setRevStr(e.target.value)} placeholder={autoAnnualRev > 0 ? String(autoAnnualRev) : "e.g. 25000000"} className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Revenue multiple (x)</label>
              <input type="number" step="0.1" min={0} value={revMultStr} onChange={e => setRevMultStr(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-muted)]">Enterprise Value</span>
            <span className="text-base font-bold tabular-nums text-green-400">{revEv > 0 ? formatCurrency(revEv) : "—"}</span>
          </div>
        </div>

        {/* EBITDA multiple */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-purple-400" /> 3. EBITDA Multiple</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">EV = annual EBITDA × multiple.</p>
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">Annual EBITDA (₹)</label>
              <input type="number" min={0} value={ebitdaStr} onChange={e => setEbitdaStr(e.target.value)} placeholder="e.g. 6000000" className={inp} />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted)] block mb-1">EBITDA multiple (x)</label>
              <input type="number" step="0.1" min={0} value={ebitdaMultStr} onChange={e => setEbitdaMultStr(e.target.value)} className={inp} />
            </div>
          </div>
          <div className="flex items-center justify-between bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-muted)]">Enterprise Value</span>
            <span className="text-base font-bold tabular-nums text-purple-400">{ebitdaEv > 0 ? formatCurrency(ebitdaEv) : "—"}</span>
          </div>
        </div>

        {/* Blended */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1">Blended Valuation</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">Equal-weight average of the methods with a value ({methodEvs.length} of 3).</p>
          <div className="flex items-center justify-between bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-muted)]">Indicative Enterprise Value</span>
            <span className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{blendedEv > 0 ? formatCurrency(blendedEv) : "—"}</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Valuation is indicative only. Indian SMEs typically trade at 0.5–3x revenue or 4–8x EBITDA depending on sector and growth. DCF: terminal value = FCFₙ × (1 + terminal growth) ÷ (WACC − terminal growth), discounted to PV; EV = Σ discounted FCF + discounted terminal value. DCF is highly sensitive to WACC and terminal-growth assumptions — WACC must exceed terminal growth.
      </p>
    </div>
  );
}
