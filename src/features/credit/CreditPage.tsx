import { useState, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useT } from "@/i18n";
import FinancingReadiness from "@/features/credit/FinancingReadiness";
import EmbeddedFinancing from "@/features/credit/EmbeddedFinancing";
import { useFeatureState } from "@/hooks/useFeatureState";
import { formatCurrency, generateId, runwayDays, monthlyBurn } from "@/lib/utils";
import { AlertTriangle, CreditCard, TrendingUp, CheckCircle2, Clock, ChevronDown, ChevronUp, Info, X, Users, Calculator, Landmark, Target, Gauge, FileText, Scale, Receipt, Percent, TrendingDown, Building2, Coins, Wallet, Banknote } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ActiveLoan } from "@/data/types";
import PreviewBadge from "@/components/PreviewBadge";
import AiInsight from "@/components/ai/AiInsight";

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
  const tr = useT();
  const {
    store, addCreditApplication, updateCreditApplication, addCreditOffer,
    addActiveLoan, updateActiveLoan,
  } = useApp();
  const { creditApplications, creditOffers, activeLoans, bankAccounts, transactions } = store;

  const burn     = monthlyBurn(transactions);
  const runway   = runwayDays(bankAccounts.map(b => b.balance), burn);
  const showCta  = runway > 0 && runway < 45;

  // Deep-link: /credit?invoice_id=… lands on the live financing tab with that invoice
  // preselected ("turn this invoice into cash" from the invoice/receivables lists).
  const [searchParams] = useSearchParams();
  const presetInvoiceId = searchParams.get("invoice_id") || undefined;

  const [tab,          setTab]          = useState<"overview" | "apply" | "loans" | "notyet" | "wc" | "equip" | "cc" | "fd" | "wcscore" | "captable" | "valuation" | "aapull" | "matcher" | "comscore" | "discount" | "docpack" | "foir" | "emicalc" | "flatred" | "dscr" | "drawing" | "gstelig" | "lap" | "prepay" | "odterm" | "scoreplan" | "offercmp" | "invadv" | "nbfcbank" | "scheme" | "livewc">(presetInvoiceId ? "livewc" : "overview");
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
        toast.success(`Score ${score}/100 - ${offers.length} offer${offers.length > 1 ? "s" : ""} up to ₹${(approvedAmount / 100000).toFixed(1)}L`);
        setTab("overview");
      } else {
        toast.error(`Score ${score}/100 - no offers yet. See the "Not yet" tab.`);
        setTab("notyet");
      }
      setAmount(""); setPurpose("");
    } catch (err) {
      // Honest failure - never fabricate an approval.
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
      toast.success(`${offer.lender} - ₹${(principal / 100000).toFixed(1)}L disbursed`);
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
              <p className="text-sm font-semibold mb-0.5">Plan ahead - {runway} days of cash remaining</p>
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
        <h1 className="text-xl font-bold flex items-center gap-2">{tr("credit.title")} <PreviewBadge capability="creditDisbursement" /></h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 flex-wrap">
        {([
          ["overview", tr("credit.tab.overview")],
          ["apply",    tr("credit.tab.apply")],
          ["loans",    `${tr("credit.tab.loans")}${activeLoans.length > 0 ? ` (${activeLoans.length})` : ""}`],
          ["notyet",   tr("credit.tab.notyet")],
          ["wc",       tr("credit.tab.wc")],
          ["equip",    tr("credit.tab.equip")],
          ["cc",       tr("credit.tab.cc")],
          ["fd",       tr("credit.tab.fd")],
          ["wcscore",  "WC Health Score"],
          ["captable", "Cap Table"],
          ["valuation","Valuation"],
          ["aapull",   "AA Underwriting"],
          ["matcher",  "Eligibility Matcher"],
          ["comscore", "Commercial Score"],
          ["discount", "Invoice Discounting"],
          ["docpack",  "Loan Doc Pack"],
          ["foir",     "FOIR / Capacity"],
          ["emicalc",  "EMI & Schedule"],
          ["flatred",  "Flat vs Reducing"],
          ["dscr",     "DSCR"],
          ["drawing",  "Drawing Power"],
          ["gstelig",  "GST Eligibility"],
          ["lap",      "LAP / LTV"],
          ["prepay",   "Prepayment Optimizer"],
          ["odterm",   "OD vs Term Loan"],
          ["scoreplan","Score Planner"],
          ["offercmp", "Compare 3 Offers"],
          ["livewc",   "Get Financing ⚡"],
          ["invadv",   "Invoice Advance"],
          ["nbfcbank", "NBFC vs Bank"],
          ["scheme",   "Scheme Finder"],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${tab === id ? "bg-[var(--color-primary)] text-[var(--color-bg)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── GET FINANCING (wired to /api/lending) ── */}
      {tab === "livewc" && <EmbeddedFinancing presetInvoiceId={presetInvoiceId} />}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {/* Proactive financing readiness - live underwriting score before applying */}
          <FinancingReadiness onApply={() => setTab("apply")} />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: tr("credit.stat.uwScore"),     value: bestScore > 0 ? `${bestScore}/100` : "-", color: bestScore >= 70 ? "text-green-400" : bestScore >= 50 ? "text-yellow-400" : "text-[var(--color-muted)]" },
              { label: tr("credit.stat.maxApproved"), value: bestApp ? formatCurrency(bestApp.approvedAmount) : "-", color: "text-[var(--color-primary)]" },
              { label: tr("credit.stat.activeLoans"), value: activeLoans.length.toString(), color: "text-[var(--color-text)]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <AiInsight
            collapsed
            title="Should I take on this credit?"
            question="Given my credit offers and current borrowing, should I take on any of this credit and what's the smart move?"
            context={{
              underwritingScore: bestScore,
              maxApprovedAmount: bestApp?.approvedAmount ?? null,
              monthlyBurn: burn,
              runwayDays: runway,
              activeLoans: activeLoans.slice(0, 20).map(l => ({ lender: l.lender, outstanding: l.outstanding, rate: l.rate, monthlyEmi: l.monthlyEmi, termMonths: l.termMonths })),
              offers: realOffers.slice(0, 20).map(o => ({ lender: o.lender, amount: o.amount, rate: o.rate, termMonths: o.termMonths, monthlyEmi: o.monthlyEmi, interest: o.interest, total: o.total })),
            }}
          />

          {/* Real lender offers from the underwriting backend */}
          {realOffers.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold mb-3">{tr("credit.preQualifiedOffers")}</h2>
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
                      Accept - View KFS
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
              <h2 className="text-base font-semibold mb-1">{tr("credit.empty.title")}</h2>
              <p className="text-sm text-[var(--color-muted)] mb-4 max-w-sm mx-auto">{tr("credit.empty.desc")}</p>
              <button onClick={() => setTab("apply")} className="bg-[var(--color-primary)] text-[var(--color-bg)] font-bold px-5 py-2.5 rounded-lg text-sm hover:opacity-90">{tr("credit.apply")}</button>
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
                        <p className="text-xs text-green-300 font-medium">Now is a good time - score {bestScore}/100</p>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">Your score qualifies for competitive rates. Borrowing now vs waiting 3 months saves on rate drift.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2.5 bg-yellow-950/20 border border-yellow-800/30 rounded-lg">
                        <Clock size={13} className="text-yellow-400 shrink-0" />
                        <p className="text-xs text-yellow-300 font-medium">
                          {trending ? "Wait 30 days - revenue trending up, score will improve" : `Score ${bestScore}/100 - ${50 - bestScore} pts to approval`}
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
                      <span>Safe (0-25%)</span><span>Caution (25-40%)</span><span>High risk (40%+)</span>
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
                    <span className="text-[var(--color-muted)] ml-2">- {f.desc}</span>
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
                            {earlySaving > 0 ? `Save ${formatCurrency(earlySaving)}` : "-"}
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
              ? `Your monthly revenue varies ${(cov*100).toFixed(0)}%. Lenders want <25% variation. This is the fastest lever - consistent invoicing adds ~8 pts.`
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
            action: topConc > 0.4 ? `Top customer is ${(topConc*100).toFixed(0)}% of revenue - add 2 more revenue sources` : "",
            points: topConc > 0.4 ? 6 : 0,
            done: topConc <= 0.4,
            detail: topConc > 0.4
              ? `Single customer concentration of ${(topConc*100).toFixed(0)}% is high risk. Diversify to add ~6 pts.`
              : "Revenue concentration is acceptable.",
          },
          {
            label: "Overdraft history",
            action: overdraftCount > 0 ? `${overdraftCount} negative balance occurrence${overdraftCount>1?"s":""} detected - maintain positive balance` : "",
            points: overdraftCount > 0 ? 5 : 0,
            done: overdraftCount === 0,
            detail: overdraftCount > 0
              ? `${overdraftCount} instance${overdraftCount>1?"s":""} of negative balance detected. Even 1 overdraft reduces the score by ~5 pts. Keep a buffer of 1-2 months burn.`
              : "No overdrafts detected.",
          },
          {
            label: "Monthly revenue level",
            action: meanRev < 300000 ? `Current avg ₹${(meanRev/1000).toFixed(0)}K - target ₹3L/mo for ₹15L credit` : "",
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
                    {bestScore > 0 ? `Score: ${bestScore}/100 - ${50 - bestScore} points to approval` : "Apply to see your score and exact gaps"}
                  </h2>
                  {gapTotal > 0 && bestScore > 0 && (
                    <p className="text-xs text-[var(--color-muted)]">
                      Fix the items below to reach <strong className="text-[var(--color-text)]">{projectedScore}/100</strong> (threshold: 50) - potential credit limit{" "}
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
              <p className="text-xs text-[var(--color-muted)] mb-4">RBI Digital Lending Guidelines 2022 - mandatory disclosure</p>
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
                  I acknowledge - Accept Loan
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
      {tab === "aapull" && <AaUnderwritingPull />}
      {tab === "matcher" && <LoanEligibilityMatcher />}
      {tab === "comscore" && <CommercialScoreTracker />}
      {tab === "discount" && <InvoiceDiscountingConnector />}
      {tab === "docpack" && <LoanDocumentPack />}
      {tab === "foir" && <FoirCalculator />}
      {tab === "emicalc" && <EmiAmortizationTab />}
      {tab === "flatred" && <FlatVsReducingTab />}
      {tab === "dscr" && <DscrCalculator />}
      {tab === "drawing" && <DrawingPowerTab />}
      {tab === "gstelig" && <GstEligibilityTab />}
      {tab === "lap" && <LapLtvTab />}
      {tab === "prepay" && <PrepaymentOptimizer />}
      {tab === "odterm" && <OdVsTermLoanTab />}
      {tab === "scoreplan" && <ScoreImprovementPlanner />}
      {tab === "offercmp" && <ThreeOfferCompare />}
      {tab === "invadv" && <InvoiceAdvanceCalculator />}
      {tab === "nbfcbank" && <NbfcVsBankCompare />}
      {tab === "scheme" && <SchemeFinder />}
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
              <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Residual buyout at lease end</span><span className="font-semibold text-[var(--color-text)]">{residualPct}% = {cost > 0 ? formatCurrency(Math.round(residual)) : "-"}</span></label>
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
          {winner === "finance" ? " You own the asset outright at end of tenure - consider long-term residual value." : " Lease keeps balance sheet light and preserves working capital, but you don't own the asset until buyout."}
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
  const [deposits, setDeposits] = useFeatureState<Deposit[]>("fd-rd", []);
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
              const { maturityDate, interest, tds, daysLeft, matured, maturityValue } = calcMaturity(d);
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
                    <div><p className="text-[var(--color-muted)]">TDS {d.tdsApplied ? "(10%)" : "(nil)"}</p><p className="font-semibold tabular-nums text-red-400 mt-0.5">{d.tdsApplied ? `(${formatCurrency(tds)})` : "-"}</p></div>
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
  const [cards, setCards]     = useFeatureState<Card[]>("credit-cards", []);
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
          <span>Overall CC utilization is {totalUtil}% - high utilization lowers your credit score and may signal cash flow stress to lenders. Keep below 30% for optimal credit health.</span>
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
                    <p className="text-xs text-[var(--color-muted)]">{c.bank || "-"} · Due: <span className={overdue ? "text-red-400 font-semibold" : ""}>{c.dueDate}</span></p>
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
        Keep utilization below 30% per card for healthy credit scoring. Always pay the full balance to avoid 36-42% p.a. revolving interest on business credit cards.
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
                <span className="tabular-nums text-xs w-16">{c.value > 0 ? `${c.value.toFixed(1)}${c.unit}` : "-"}</span>
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
          { label: "DSO",  value: `${dso}d`,  note: "Days Sales Outstanding - lower is better",  good: dso <= 30 },
          { label: "DPO",  value: `${dpo}d`,  note: "Days Payable Outstanding - higher is better (pay later)", good: dpo >= 45 },
          { label: "DIO",  value: `${dio}d`,  note: "Days Inventory Outstanding - lower is better",  good: dio <= 30 },
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
      <p className="text-[10px] text-[var(--color-muted)]">CCC = DSO + DIO − DPO. Lower CCC = faster cash cycle. Score uses weighted average of 5 ratios. Enter balance sheet figures for accurate scoring - revenue auto-estimated from transactions.</p>
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
  const [holders, setHolders] = useFeatureState<Shareholder[]>("cap-table", (() => {
    const founder = store.firm?.name ? `${store.firm.name} (Founders)` : "Founders";
    return [
      { id: generateId(), name: founder,      shareClass: "Founder",   sharesHeld: 8000000, amountInvested: 1000000 },
      { id: generateId(), name: "ESOP Pool",   shareClass: "ESOP Pool", sharesHeld: 1000000, amountInvested: 0 },
      { id: generateId(), name: "Angel Round", shareClass: "Angel",     sharesHeld: 1000000, amountInvested: 5000000 },
    ];
  })());

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
                  <span className="text-right tabular-nums text-[var(--color-muted)]">-</span>
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
        Simplified model - ignores option pool top-ups, liquidation preferences and anti-dilution provisions. Ownership % = shares held ÷ total shares. Post-money = pre-money + investment; new investor % = investment ÷ post-money; price/share = pre-money ÷ existing shares. Consult a CS/lawyer for the definitive cap table.
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
    { label: "DCF EV",            value: dcfValid ? formatCurrency(dcfEv) : "-", color: "text-blue-400" },
    { label: "Revenue-multiple EV", value: revEv > 0 ? formatCurrency(revEv) : "-", color: "text-green-400" },
    { label: "EBITDA-multiple EV",  value: ebitdaEv > 0 ? formatCurrency(ebitdaEv) : "-", color: "text-purple-400" },
    { label: "Blended EV",          value: blendedEv > 0 ? formatCurrency(blendedEv) : "-", color: "text-[var(--color-primary)]" },
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
            <span className="text-base font-bold tabular-nums text-green-400">{revEv > 0 ? formatCurrency(revEv) : "-"}</span>
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
            <span className="text-base font-bold tabular-nums text-purple-400">{ebitdaEv > 0 ? formatCurrency(ebitdaEv) : "-"}</span>
          </div>
        </div>

        {/* Blended */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-1">Blended Valuation</h3>
          <p className="text-xs text-[var(--color-muted)] mb-4">Equal-weight average of the methods with a value ({methodEvs.length} of 3).</p>
          <div className="flex items-center justify-between bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg px-4 py-3">
            <span className="text-xs text-[var(--color-muted)]">Indicative Enterprise Value</span>
            <span className="text-xl font-bold tabular-nums text-[var(--color-primary)]">{blendedEv > 0 ? formatCurrency(blendedEv) : "-"}</span>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        Valuation is indicative only. Indian SMEs typically trade at 0.5-3x revenue or 4-8x EBITDA depending on sector and growth. DCF: terminal value = FCFₙ × (1 + terminal growth) ÷ (WACC − terminal growth), discounted to PV; EV = Σ discounted FCF + discounted terminal value. DCF is highly sensitive to WACC and terminal-growth assumptions - WACC must exceed terminal growth.
      </p>
    </div>
  );
}

// ── #99 AA-DATA UNDERWRITING PULL ───────────────────────────────────────────
// Account Aggregator bank-data → credit profile. Interactive estimator built from
// manually-entered/derived bank-data inputs (no live AA backend call).
function AaUnderwritingPull() {
  const { store } = useApp();

  // Seed monthly inflow/balance from live transactions where available.
  const seed = useMemo(() => {
    const txns = store.transactions ?? [];
    const credits = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const months = Math.max(1, Math.round(txns.length / 30));
    const avgInflow = credits > 0 ? Math.round(credits / months) : 0;
    const bal = (store.bankAccounts ?? []).reduce((s, a) => s + a.balance, 0);
    return { avgInflow, bal };
  }, [store.transactions, store.bankAccounts]);

  const [avgInflow,   setAvgInflow]   = useState(seed.avgInflow ? String(seed.avgInflow) : "");
  const [avgBalance,  setAvgBalance]  = useState(seed.bal > 0 ? String(Math.round(seed.bal)) : "");
  const [inflowCov,   setInflowCov]   = useState(20);  // % coefficient of variation of monthly inflows
  const [bounces,     setBounces]     = useState(0);   // cheque/ECS bounces in last 6 months
  const [odDays,      setOdDays]      = useState(0);    // days overdrawn / negative balance in 6 months
  const [vintage,     setVintage]     = useState(18);   // months of bank-statement history available
  const [emiOutflow,  setEmiOutflow]  = useState("");   // existing monthly EMI/obligation outflow
  const [creditConc,  setCreditConc]  = useState(40);   // % of inflow from single top counterparty

  const inflow   = parseFloat(avgInflow)  || 0;
  const balance  = parseFloat(avgBalance) || 0;
  const emi      = parseFloat(emiOutflow) || 0;

  // Bank-statement-derived signals → 0-100 sub-scores (lender-style scorecard).
  const factors = [
    {
      label: "Avg monthly inflow",
      detail: `${formatCurrency(inflow)}/mo`,
      weight: 25,
      raw: inflow <= 0 ? 0 : Math.min(1, inflow / 500000), // ₹5L/mo saturates
    },
    {
      label: "Inflow stability (CoV)",
      detail: `${inflowCov}% variation`,
      weight: 20,
      raw: inflowCov >= 60 ? 0 : 1 - inflowCov / 60,
    },
    {
      label: "Avg bank balance / buffer",
      detail: `${formatCurrency(balance)} · ${inflow > 0 ? (balance / inflow).toFixed(1) : "0"}× monthly inflow`,
      weight: 15,
      raw: inflow <= 0 ? 0 : Math.min(1, balance / inflow), // 1 month buffer saturates
    },
    {
      label: "Bounces (6 mo)",
      detail: `${bounces} bounce${bounces === 1 ? "" : "s"}`,
      weight: 15,
      raw: bounces === 0 ? 1 : bounces >= 4 ? 0 : 1 - bounces / 4,
    },
    {
      label: "Overdraft days (6 mo)",
      detail: `${odDays} day${odDays === 1 ? "" : "s"} negative`,
      weight: 10,
      raw: odDays === 0 ? 1 : odDays >= 30 ? 0 : 1 - odDays / 30,
    },
    {
      label: "Banking vintage",
      detail: `${vintage} months history`,
      weight: 10,
      raw: Math.min(1, vintage / 24), // 24 months saturates
    },
    {
      label: "Inflow concentration",
      detail: `top payer ${creditConc}% of inflow`,
      weight: 5,
      raw: creditConc >= 80 ? 0 : 1 - creditConc / 80,
    },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.raw * f.weight, 0));

  // FOIR-anchored eligibility: 50% of net surplus serviceable as EMI, capitalised
  // at ~16% over 36 months. Surplus = inflow − existing EMI outflow.
  const surplus     = Math.max(0, inflow - emi);
  const serviceable = surplus * 0.5;
  const r36         = 0.16 / 12;
  const eligible    = serviceable > 0 ? Math.round((serviceable * (Math.pow(1 + r36, 36) - 1)) / (r36 * Math.pow(1 + r36, 36))) : 0;
  // Risk-adjust by score band.
  const adjEligible = Math.round(eligible * (score >= 70 ? 1 : score >= 50 ? 0.7 : score >= 35 ? 0.4 : 0));

  const band = score >= 70 ? { label: "Prime", cls: "text-green-400" }
    : score >= 50 ? { label: "Near-prime", cls: "text-blue-400" }
    : score >= 35 ? { label: "Sub-prime", cls: "text-yellow-400" }
    : { label: "Decline-likely", cls: "text-red-400" };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> AA-Data Underwriting Pull</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Models the credit profile a lender derives from your Account Aggregator bank-statement feed. Inflow and balance are pre-filled from your live data - adjust the bank-behaviour signals to see how the underwriting score and indicative limit move.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Avg monthly inflow / credits (₹)</label>
            <input type="number" min={0} value={avgInflow} onChange={e => setAvgInflow(e.target.value)} placeholder="e.g. 800000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Avg bank balance (₹)</label>
            <input type="number" min={0} value={avgBalance} onChange={e => setAvgBalance(e.target.value)} placeholder="e.g. 250000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Existing monthly EMI / obligations (₹)</label>
            <input type="number" min={0} value={emiOutflow} onChange={e => setEmiOutflow(e.target.value)} placeholder="e.g. 50000" className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Banking vintage</span><span className="font-semibold text-[var(--color-text)]">{vintage} mo</span></label>
            <input type="range" min={1} max={36} value={vintage} onChange={e => setVintage(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Inflow variation (CoV)</span><span className="font-semibold text-[var(--color-text)]">{inflowCov}%</span></label>
            <input type="range" min={0} max={80} value={inflowCov} onChange={e => setInflowCov(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Top-payer concentration</span><span className="font-semibold text-[var(--color-text)]">{creditConc}%</span></label>
            <input type="range" min={0} max={100} value={creditConc} onChange={e => setCreditConc(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Bounces (last 6 mo)</span><span className="font-semibold text-[var(--color-text)]">{bounces}</span></label>
            <input type="range" min={0} max={10} value={bounces} onChange={e => setBounces(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Overdraft days (last 6 mo)</span><span className="font-semibold text-[var(--color-text)]">{odDays}</span></label>
            <input type="range" min={0} max={60} value={odDays} onChange={e => setOdDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {inflow > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Underwriting score", value: `${score}/100`, color: band.cls },
              { label: "Risk band",          value: band.label,     color: band.cls },
              { label: "Indicative limit",   value: formatCurrency(adjEligible), color: "text-[var(--color-primary)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Scorecard breakdown</h3>
            <div className="space-y-3">
              {factors.map(f => (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span><span className="font-medium">{f.label}</span> <span className="text-[var(--color-muted)]">- {f.detail}</span></span>
                    <span className="tabular-nums text-[var(--color-muted)]">{Math.round(f.raw * f.weight)} / {f.weight}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${Math.round(f.raw * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Estimator only - no live Account Aggregator fetch is made. Real underwriting pulls 6-12 months of statements via the AA (Sahamati/RBI) framework with your explicit consent. Indicative limit uses a 50% FOIR cap on surplus inflow, capitalised at ~16% p.a. over 36 months, then risk-adjusted by score band.
      </div>
    </div>
  );
}

// ── #100 BUSINESS LOAN ELIGIBILITY MATCHER ──────────────────────────────────
function LoanEligibilityMatcher() {
  type Product = {
    name: string; kind: string; minTurnover: number; minVintage: number; minScore: number;
    maxTicket: number; rateFrom: number; collateral: boolean; tag: string;
  };
  const PRODUCTS: Product[] = [
    { name: "Unsecured Term Loan",      kind: "NBFC / Fintech",   minTurnover: 4000000,  minVintage: 12, minScore: 650, maxTicket: 5000000,  rateFrom: 18, collateral: false, tag: "Fast, no collateral" },
    { name: "Working Capital OD/CC",    kind: "Private Bank",     minTurnover: 10000000, minVintage: 24, minScore: 700, maxTicket: 20000000, rateFrom: 11, collateral: true,  tag: "Revolving limit" },
    { name: "CGTMSE Collateral-Free",   kind: "PSU Bank (govt)",  minTurnover: 2000000,  minVintage: 6,  minScore: 600, maxTicket: 50000000, rateFrom: 9.5, collateral: false, tag: "Govt guarantee" },
    { name: "Invoice / Bill Discounting", kind: "TReDS / NBFC",   minTurnover: 5000000,  minVintage: 12, minScore: 640, maxTicket: 30000000, rateFrom: 12, collateral: false, tag: "Against receivables" },
    { name: "LAP (Loan Against Property)", kind: "Bank / HFC",    minTurnover: 3000000,  minVintage: 12, minScore: 680, maxTicket: 75000000, rateFrom: 10, collateral: true,  tag: "Lowest rate, secured" },
    { name: "Merchant Cash Advance",    kind: "Fintech",          minTurnover: 2000000,  minVintage: 6,  minScore: 580, maxTicket: 2500000,  rateFrom: 22, collateral: false, tag: "Repay from sales %" },
  ];

  const [turnover,  setTurnover]  = useState("");
  const [vintage,   setVintage]   = useState("18");
  const [score,     setScore]     = useState("680");
  const [hasColl,   setHasColl]   = useState(true);

  const t  = parseFloat(turnover) || 0;
  const v  = parseFloat(vintage)  || 0;
  const sc = parseFloat(score)    || 0;

  const matched = PRODUCTS.map(p => {
    const checks = [
      { ok: t >= p.minTurnover,            why: `Turnover ≥ ${formatCurrency(p.minTurnover)}` },
      { ok: v >= p.minVintage,             why: `${p.minVintage}+ months vintage` },
      { ok: sc >= p.minScore,              why: `Bureau score ≥ ${p.minScore}` },
      { ok: !p.collateral || hasColl,      why: p.collateral ? "Collateral available" : "No collateral needed" },
    ];
    const passed = checks.filter(c => c.ok).length;
    const odds = Math.round((passed / checks.length) * 100);
    // Indicative offer size: 25% of annual turnover capped at product max ticket.
    const offer = Math.min(p.maxTicket, Math.round(t * 0.25));
    return { ...p, checks, odds, offer, eligible: passed === checks.length };
  }).sort((a, b) => b.odds - a.odds || a.rateFrom - b.rateFrom);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Target size={14} className="text-[var(--color-primary)]" /> Business Loan Eligibility Matcher</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Match your profile to common Indian SME lending products and see approval odds + indicative ticket size for each.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Annual turnover (₹)</label>
            <input type="number" min={0} value={turnover} onChange={e => setTurnover(e.target.value)} placeholder="e.g. 12000000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Business vintage (months)</label>
            <input type="number" min={0} value={vintage} onChange={e => setVintage(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Bureau score (CIBIL/CRIF)</label>
            <input type="number" min={300} max={900} value={score} onChange={e => setScore(e.target.value)} className={inp} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={hasColl} onChange={e => setHasColl(e.target.checked)} className="accent-[var(--color-primary)]" />
              Collateral available
            </label>
          </div>
        </div>
      </div>

      {t > 0 && (
        <div className="space-y-3">
          {matched.map(p => (
            <div key={p.name} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${p.eligible ? "border-green-800/40" : "border-[var(--color-border)]"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{p.name}</p>
                    <span className="text-[9px] bg-[var(--color-accent)] text-[var(--color-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full font-semibold">{p.kind}</span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{p.tag} · from {p.rateFrom}% p.a. · {p.collateral ? "secured" : "unsecured"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold tabular-nums ${p.odds >= 100 ? "text-green-400" : p.odds >= 75 ? "text-blue-400" : p.odds >= 50 ? "text-yellow-400" : "text-red-400"}`}>{p.odds}%</p>
                  <p className="text-[10px] text-[var(--color-muted)]">match</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {p.checks.map(c => (
                  <span key={c.why} className={`text-[10px] px-2 py-0.5 rounded-full border ${c.ok ? "bg-green-950/20 text-green-400 border-green-800/30" : "bg-red-950/20 text-red-400 border-red-800/30"}`}>
                    {c.ok ? "✓" : "✕"} {c.why}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs border-t border-[var(--color-border)] pt-2">
                <span className="text-[var(--color-muted)]">Indicative ticket (25% of turnover, capped)</span>
                <span className="font-bold tabular-nums text-[var(--color-primary)]">{p.eligible ? formatCurrency(p.offer) : "-"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Match % and tickets are indicative - final eligibility depends on each lender's policy, bureau report and document verification. CGTMSE coverage and rates vary by scheme; verify current terms with the lender.
      </div>
    </div>
  );
}

// ── #101 COMMERCIAL CREDIT SCORE TRACKER ────────────────────────────────────
function CommercialScoreTracker() {
  type Reading = { id: string; date: string; bureau: "CIBIL Rank" | "CRIF Highmark" | "Experian"; score: number; note: string };
  const [readings, setReadings] = useFeatureState<Reading[]>("commercial-credit-score", []);
  const [bureau, setBureau] = useState<Reading["bureau"]>("CIBIL Rank");
  const [score,  setScore]  = useState("");
  const [date,   setDate]   = useState(() => new Date().toISOString().split("T")[0]);
  const [note,   setNote]   = useState("");

  // CIBIL MSME Rank (CMR) is 1 (best) - 10 (worst); CRIF/Experian commercial 300-900-style.
  const isRank = bureau === "CIBIL Rank";

  const add = () => {
    const s = parseFloat(score);
    if (!score || isNaN(s)) { toast.error("Enter a score"); return; }
    if (isRank && (s < 1 || s > 10)) { toast.error("CIBIL Rank is 1 (best) to 10 (worst)"); return; }
    setReadings(prev => [...prev, { id: Math.random().toString(36).slice(2), date, bureau, score: s, note }]
      .sort((a, b) => a.date.localeCompare(b.date)));
    setScore(""); setNote("");
  };

  const byBureau = readings.filter(r => r.bureau === bureau);
  const latest   = byBureau[byBureau.length - 1];
  const prev     = byBureau[byBureau.length - 2];
  const delta    = latest && prev ? latest.score - prev.score : 0;
  // For rank, lower is better → invert the "good" direction.
  const improving = isRank ? delta < 0 : delta > 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const rankVerdict = (s: number) =>
    s <= 3 ? { label: "Low risk - best rates", cls: "text-green-400" }
    : s <= 6 ? { label: "Moderate risk", cls: "text-yellow-400" }
    : { label: "High risk - limited access", cls: "text-red-400" };
  const scoreVerdict = (s: number) =>
    s >= 750 ? { label: "Excellent", cls: "text-green-400" }
    : s >= 650 ? { label: "Good", cls: "text-blue-400" }
    : s >= 550 ? { label: "Fair", cls: "text-yellow-400" }
    : { label: "Poor", cls: "text-red-400" };
  const verdict = latest ? (isRank ? rankVerdict(latest.score) : scoreVerdict(latest.score)) : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Commercial Credit Score Tracker</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Log your business bureau scores over time - CIBIL MSME Rank (CMR 1-10, lower is better) or CRIF/Experian commercial scores - and track the trend lenders look at.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Bureau</label>
            <select value={bureau} onChange={e => setBureau(e.target.value as Reading["bureau"])} className={inp}>
              {(["CIBIL Rank", "CRIF Highmark", "Experian"] as const).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">{isRank ? "Rank (1-10)" : "Score (300-900)"}</label>
            <input type="number" value={score} onChange={e => setScore(e.target.value)} placeholder={isRank ? "e.g. 3" : "e.g. 720"} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">As of date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. after closing OD" className={inp} />
          </div>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ Add reading</button>
      </div>

      {latest && verdict && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: `Latest ${bureau}`, value: isRank ? `CMR ${latest.score}` : String(latest.score), color: verdict.cls },
            { label: "Assessment",       value: verdict.label, color: verdict.cls },
            { label: "Change vs prior",  value: prev ? `${delta > 0 ? "+" : ""}${delta}` : "-", color: !prev ? "text-[var(--color-muted)]" : improving ? "text-green-400" : "text-red-400" },
            { label: "Readings logged",  value: String(byBureau.length), color: "text-[var(--color-text)]" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {readings.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Gauge size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No scores logged yet. Add your CIBIL Rank or commercial bureau score to start tracking the trend.</p>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {["Date", "Bureau", "Score / Rank", "Note", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {readings.slice().reverse().map(r => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 tabular-nums">{r.date}</td>
                  <td className="px-4 py-2.5">{r.bureau}</td>
                  <td className="px-4 py-2.5 tabular-nums font-semibold">{r.bureau === "CIBIL Rank" ? `CMR ${r.score}` : r.score}</td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)] text-xs">{r.note || "-"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setReadings(prev => prev.filter(x => x.id !== r.id))} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        CIBIL MSME Rank (CMR) runs 1 (lowest risk) to 10 (highest risk). CRIF/Experian commercial scores follow a 300-900-style scale where higher is better. Pull your report at least quarterly - bureaus update with a 30-45 day lag.
      </div>
    </div>
  );
}

// ── #102 INVOICE-DISCOUNTING MARKETPLACE CONNECTOR ──────────────────────────
function InvoiceDiscountingConnector() {
  type Listing = { id: string; buyer: string; invoiceNo: string; amount: number; dueDate: string; discountRate: number; tenureDays: number; status: "listed" | "funded" };
  const [listings, setListings] = useFeatureState<Listing[]>("invoice-discounting", []);
  const [buyer,      setBuyer]      = useState("");
  const [invoiceNo,  setInvoiceNo]  = useState("");
  const [amount,     setAmount]     = useState("");
  const [dueDate,    setDueDate]    = useState(() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().split("T")[0]; });
  const [rate,       setRate]       = useState("14"); // annualised discount rate offered by financier

  const today = new Date();

  const calc = (l: Listing) => {
    const tenure = Math.max(1, l.tenureDays);
    // Discount charge = face × annualised rate × tenure/365 (simple bill-discounting).
    const discountCharge = Math.round(l.amount * (l.discountRate / 100) * (tenure / 365));
    // Financiers typically advance ~90% of face; charge deducted upfront.
    const advance  = Math.round(l.amount * 0.9);
    const netNow   = advance - discountCharge;
    const effAnnual = l.amount > 0 ? (discountCharge / l.amount) * (365 / tenure) * 100 : 0;
    return { discountCharge, advance, netNow, effAnnual, tenure };
  };

  const add = () => {
    const a = parseFloat(amount);
    if (!buyer || !a || a <= 0) { toast.error("Enter buyer and a valid invoice amount"); return; }
    const due = new Date(dueDate);
    const tenureDays = Math.max(1, Math.ceil((due.getTime() - today.getTime()) / 86400000));
    setListings(prev => [...prev, {
      id: Math.random().toString(36).slice(2), buyer, invoiceNo: invoiceNo || "-",
      amount: a, dueDate, discountRate: parseFloat(rate) || 14, tenureDays, status: "listed",
    }]);
    setBuyer(""); setInvoiceNo(""); setAmount("");
  };

  const toggleStatus = (id: string) => setListings(prev => prev.map(l => l.id === id ? { ...l, status: l.status === "listed" ? "funded" : "listed" } : l));
  const remove = (id: string) => setListings(prev => prev.filter(l => l.id !== id));

  const listed = listings.filter(l => l.status === "listed");
  const totalListed = listed.reduce((s, l) => s + l.amount, 0);
  const totalNetNow = listings.reduce((s, l) => s + calc(l).netNow, 0);
  const totalCost   = listings.reduce((s, l) => s + calc(l).discountCharge, 0);

  const inp = "bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      {listings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Invoices listed", value: String(listed.length), color: "text-[var(--color-text)]" },
            { label: "Face value listed", value: formatCurrency(totalListed), color: "text-[var(--color-text)]" },
            { label: "Net cash if all funded", value: formatCurrency(totalNetNow), color: "text-green-400" },
            { label: "Total discounting cost", value: formatCurrency(totalCost), color: "text-orange-400" },
          ].map(c => (
            <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Invoice-Discounting Marketplace Connector</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">List approved-buyer invoices for financing bids (TReDS-style). See what you net today after the financier's discount charge.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <input value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Buyer / drawee *" className={inp} />
          <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice no." className={inp} />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Invoice amount (₹) *" className={inp} />
          <div>
            <label className="block text-[10px] text-[var(--color-muted)] mb-1">Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`w-full ${inp}`} />
          </div>
          <div>
            <label className="block text-[10px] text-[var(--color-muted)] mb-1">Discount rate (% p.a.)</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="14" className={`w-full ${inp}`} />
          </div>
        </div>
        <button onClick={add} className="text-xs bg-[var(--color-primary)] text-[var(--color-bg)] font-semibold px-4 py-2 rounded-lg hover:opacity-90">+ List invoice</button>
      </div>

      {listings.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Receipt size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No invoices listed. Add a receivable to estimate financing bids and net proceeds.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map(l => {
            const { discountCharge, advance, netNow, effAnnual, tenure } = calc(l);
            return (
              <div key={l.id} className={`bg-[var(--color-surface)] border rounded-lg p-4 ${l.status === "funded" ? "border-green-800/40" : "border-[var(--color-border)]"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{l.buyer}</p>
                      <span className="text-[9px] text-[var(--color-muted)]">#{l.invoiceNo}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${l.status === "funded" ? "bg-green-900/30 text-green-400 border-green-800/40" : "bg-blue-900/30 text-blue-400 border-blue-800/40"}`}>{l.status === "funded" ? "Funded" : "Listed"}</span>
                    </div>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{l.discountRate}% p.a. · due {l.dueDate} · {tenure} days tenure</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleStatus(l.id)} className="text-[10px] text-[var(--color-primary)] hover:underline">{l.status === "funded" ? "Mark listed" : "Mark funded"}</button>
                    <button onClick={() => remove(l.id)} className="text-[var(--color-muted)] hover:text-red-400"><X size={12} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><p className="text-[var(--color-muted)]">Face value</p><p className="font-semibold tabular-nums mt-0.5">{formatCurrency(l.amount)}</p></div>
                  <div><p className="text-[var(--color-muted)]">Advance (90%)</p><p className="font-semibold tabular-nums mt-0.5">{formatCurrency(advance)}</p></div>
                  <div><p className="text-[var(--color-muted)]">Discount charge</p><p className="font-semibold tabular-nums text-red-400 mt-0.5">({formatCurrency(discountCharge)})</p></div>
                  <div><p className="text-[var(--color-muted)]">Net now</p><p className="font-bold tabular-nums text-green-400 mt-0.5">{formatCurrency(netNow)}</p></div>
                </div>
                <p className="text-[10px] text-[var(--color-muted)] mt-2">Effective cost ≈ {effAnnual.toFixed(1)}% annualised over the {tenure}-day tenure.</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Indicative only - actual bids on TReDS (RXIL/M1xchange/Invoicemart) are set by financiers and depend on buyer credit rating. Advance % and rate vary; bill discounting is typically with-recourse unless factored. Discount charge = face × rate × tenure/365.
      </div>
    </div>
  );
}

// ── #103 LOAN APPLICATION DOCUMENT PACK ─────────────────────────────────────
function LoanDocumentPack() {
  type LoanType = "unsecured" | "wc" | "lap" | "cgtmse";
  type Entity = "proprietorship" | "partnership_llp" | "pvt_ltd";
  type DocItem = { id: string; label: string; group: string; applies: (lt: LoanType, en: Entity) => boolean };

  const DOCS: DocItem[] = [
    { id: "pan-entity",   label: "Business PAN card",                       group: "KYC", applies: () => true },
    { id: "pan-prop",     label: "Proprietor / Directors PAN & Aadhaar",    group: "KYC", applies: () => true },
    { id: "gst-reg",      label: "GST registration certificate",            group: "KYC", applies: () => true },
    { id: "udyam",        label: "Udyam / MSME registration",               group: "KYC", applies: (lt) => lt === "cgtmse" || lt === "wc" },
    { id: "incorp",       label: "Certificate of Incorporation / MOA-AOA",  group: "KYC", applies: (_lt, en) => en === "pvt_ltd" },
    { id: "partner-deed", label: "Partnership deed / LLP agreement",        group: "KYC", applies: (_lt, en) => en === "partnership_llp" },
    { id: "shop-act",     label: "Shop & Establishment / trade licence",    group: "KYC", applies: (_lt, en) => en === "proprietorship" },
    { id: "bank-stmt",    label: "Bank statements (last 12 months)",        group: "Financial", applies: () => true },
    { id: "itr",          label: "ITR + computation (last 2-3 years)",      group: "Financial", applies: () => true },
    { id: "financials",   label: "Audited financials / P&L + Balance Sheet", group: "Financial", applies: (_lt, en) => en !== "proprietorship" },
    { id: "gst-returns",  label: "GST returns (GSTR-3B, last 12 months)",   group: "Financial", applies: () => true },
    { id: "debt-sheet",   label: "Existing loan sanction letters / repayment track", group: "Financial", applies: () => true },
    { id: "stock-debtor", label: "Stock & debtor statement",                group: "Financial", applies: (lt) => lt === "wc" },
    { id: "proj-fin",     label: "Projected financials & fund-utilisation plan", group: "Financial", applies: (lt) => lt === "wc" || lt === "cgtmse" },
    { id: "prop-docs",    label: "Property title deed & valuation report",  group: "Collateral", applies: (lt) => lt === "lap" },
    { id: "ec",           label: "Encumbrance certificate (property)",      group: "Collateral", applies: (lt) => lt === "lap" },
    { id: "guarantor",    label: "Guarantor KYC & net-worth statement",     group: "Collateral", applies: (lt) => lt === "lap" || lt === "unsecured" },
  ];

  const [loanType, setLoanType] = useState<LoanType>("wc");
  const [entity,   setEntity]   = useState<Entity>("pvt_ltd");
  const [checked,  setChecked]  = useFeatureState<Record<string, boolean>>("loan-doc-pack", {});

  const required = DOCS.filter(d => d.applies(loanType, entity));
  const groups = ["KYC", "Financial", "Collateral"].filter(g => required.some(d => d.group === g));
  const done = required.filter(d => checked[d.id]).length;
  const pct  = required.length > 0 ? Math.round((done / required.length) * 100) : 0;

  const toggle = (id: string) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><FileText size={14} className="text-[var(--color-primary)]" /> Loan Application Document Pack</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Auto-assembles the lender document checklist for your loan type and entity structure. Tick items off as you collect them - progress is saved.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Loan type</label>
            <select value={loanType} onChange={e => setLoanType(e.target.value as LoanType)} className={inp}>
              <option value="unsecured">Unsecured Term Loan</option>
              <option value="wc">Working Capital (OD/CC)</option>
              <option value="lap">Loan Against Property</option>
              <option value="cgtmse">CGTMSE Collateral-Free</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Entity type</label>
            <select value={entity} onChange={e => setEntity(e.target.value as Entity)} className={inp}>
              <option value="proprietorship">Proprietorship</option>
              <option value="partnership_llp">Partnership / LLP</option>
              <option value="pvt_ltd">Pvt Ltd / OPC</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold">{done} of {required.length} documents ready</span>
          <span className={`font-bold tabular-nums ${pct === 100 ? "text-green-400" : "text-[var(--color-primary)]"}`}>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {groups.map(g => (
        <div key={g} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">{g} documents</h3>
          <div className="space-y-2">
            {required.filter(d => d.group === g).map(d => (
              <label key={d.id} className={`flex items-center gap-3 text-sm cursor-pointer p-2 rounded-lg border ${checked[d.id] ? "border-green-800/30 bg-green-950/10" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                <input type="checkbox" checked={!!checked[d.id]} onChange={() => toggle(d.id)} className="accent-[var(--color-primary)]" />
                <span className={checked[d.id] ? "line-through text-[var(--color-muted)]" : ""}>{d.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {pct === 100 && (
        <div className="rounded-lg p-4 border border-green-800/40 bg-green-950/20 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          <p className="text-sm font-semibold text-green-400">Document pack complete - you're ready to submit your application.</p>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Checklist is indicative of common Indian SME lending requirements. Individual lenders may ask for additional documents (CA-certified turnover, board resolution, projected DSCR working). Keep statements in PDF as downloaded from net-banking for faster verification.
      </div>
    </div>
  );
}

// ── #104 REPAYMENT CAPACITY / FOIR CALCULATOR ───────────────────────────────
function FoirCalculator() {
  const { store } = useApp();

  // Pre-fill monthly income from live revenue; existing EMI from active loans.
  const seed = useMemo(() => {
    const txns = store.transactions ?? [];
    const months = Math.max(1, Math.round(txns.length / 30));
    const rev = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const profit = Math.max(0, Math.round((rev - exp) / months));
    const emi = (store.activeLoans ?? []).reduce((s, l) => s + l.monthlyEmi, 0);
    return { profit, emi: Math.round(emi) };
  }, [store.transactions, store.activeLoans]);

  const [income,     setIncome]     = useState(seed.profit > 0 ? String(seed.profit) : "");
  const [existEmi,   setExistEmi]   = useState(seed.emi > 0 ? String(seed.emi) : "");
  const [otherOblig, setOtherOblig] = useState(""); // rent, card min-dues, other fixed outflows
  const [foirCap,    setFoirCap]    = useState(50);  // lender FOIR policy ceiling %
  const [newRate,    setNewRate]    = useState("16"); // proposed new loan rate p.a.
  const [newTenure,  setNewTenure]  = useState("48"); // proposed tenure (months)

  const inc   = parseFloat(income)     || 0;
  const emiEx = parseFloat(existEmi)   || 0;
  const oth   = parseFloat(otherOblig) || 0;
  const obligations = emiEx + oth;

  const currentFoir = inc > 0 ? Math.round((obligations / inc) * 100) : 0;
  // Headroom for new EMI under the lender's FOIR ceiling.
  const maxOblig    = inc * (foirCap / 100);
  const newEmiRoom  = Math.max(0, Math.round(maxOblig - obligations));

  // Reverse the EMI formula to find max principal serviceable by that EMI room.
  const r = (parseFloat(newRate) || 16) / 100 / 12;
  const n = parseInt(newTenure) || 48;
  const maxPrincipal = newEmiRoom > 0 && r > 0
    ? Math.round((newEmiRoom * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n)))
    : newEmiRoom > 0 ? newEmiRoom * n : 0;

  const verdict = inc <= 0 ? null
    : currentFoir >= foirCap ? { label: "No headroom - at/over FOIR cap", cls: "text-red-400" }
    : currentFoir >= foirCap * 0.8 ? { label: "Limited headroom", cls: "text-yellow-400" }
    : { label: "Healthy repayment capacity", cls: "text-green-400" };

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Repayment Capacity / FOIR Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">FOIR (Fixed Obligation to Income Ratio) is the test lenders run before sanction. Income and existing EMIs are pre-filled from your data - see how much new EMI and principal you can safely service.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Net monthly income / surplus (₹)</label>
            <input type="number" min={0} value={income} onChange={e => setIncome(e.target.value)} placeholder={seed.profit > 0 ? String(seed.profit) : "e.g. 200000"} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Existing monthly EMIs (₹)</label>
            <input type="number" min={0} value={existEmi} onChange={e => setExistEmi(e.target.value)} placeholder="e.g. 40000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Other fixed obligations (rent, card dues) (₹)</label>
            <input type="number" min={0} value={otherOblig} onChange={e => setOtherOblig(e.target.value)} placeholder="e.g. 25000" className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Lender FOIR ceiling</span><span className="font-semibold text-[var(--color-text)]">{foirCap}%</span></label>
            <input type="range" min={30} max={70} value={foirCap} onChange={e => setFoirCap(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Proposed loan rate (% p.a.)</label>
            <input type="number" value={newRate} onChange={e => setNewRate(e.target.value)} placeholder="16" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Proposed tenure (months)</label>
            <input type="number" value={newTenure} onChange={e => setNewTenure(e.target.value)} placeholder="48" className={inp} />
          </div>
        </div>
      </div>

      {inc > 0 && verdict && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Current FOIR", value: `${currentFoir}%`, color: verdict.cls },
              { label: "Assessment",   value: verdict.label,     color: verdict.cls },
              { label: "New EMI headroom", value: formatCurrency(newEmiRoom), color: "text-[var(--color-primary)]" },
              { label: "Max new loan", value: formatCurrency(maxPrincipal), color: "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">FOIR utilisation</h3>
            <div className="flex justify-between text-[10px] text-[var(--color-muted)] mb-1">
              <span>Obligations {formatCurrency(obligations)}</span>
              <span>Cap {foirCap}% = {formatCurrency(Math.round(maxOblig))}</span>
            </div>
            <div className="w-full h-3 bg-[var(--color-bg)] rounded-full overflow-hidden relative">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, currentFoir)}%`, background: currentFoir >= foirCap ? "#ef4444" : currentFoir >= foirCap * 0.8 ? "#eab308" : "#22c55e" }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--color-text)]/60" style={{ left: `${Math.min(100, foirCap)}%` }} title="FOIR ceiling" />
            </div>
            <div className="space-y-2 mt-4">
              {[
                { label: "Net monthly income", value: formatCurrency(inc) },
                { label: "Existing EMIs + obligations", value: `(${formatCurrency(obligations)})`, color: "text-red-400" },
                { label: `Serviceable obligations @ ${foirCap}% FOIR`, value: formatCurrency(Math.round(maxOblig)), bold: true },
                { label: "Headroom for new EMI", value: formatCurrency(newEmiRoom), color: "text-green-400", bold: true },
              ].map(r2 => (
                <div key={r2.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]">{r2.label}</span>
                  <span className={`tabular-nums ${r2.bold ? "font-bold" : ""} ${r2.color ?? "text-[var(--color-text)]"}`}>{r2.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        FOIR = (existing EMIs + fixed obligations + proposed EMI) ÷ net income. Banks typically cap FOIR at 40-55% depending on income level (higher income allows higher ratios). Max loan reverses the EMI formula at the proposed rate and tenure. Indicative - lenders also apply DSCR and bureau checks.
      </div>
    </div>
  );
}

// ── #105 EMI & AMORTIZATION SCHEDULE ────────────────────────────────────────
function EmiAmortizationTab() {
  const [principalStr, setPrincipalStr] = useState("2500000");
  const [rateStr,      setRateStr]      = useState("16");
  const [tenureStr,    setTenureStr]    = useState("36");

  const principal = parseFloat(principalStr) || 0;
  const rate      = parseFloat(rateStr)      || 0;
  const months    = Math.max(1, Math.min(360, Math.round(parseFloat(tenureStr) || 0)));

  const monthlyEmi = principal > 0 ? emi(principal, rate, months) : 0;
  const interestTotal = principal > 0 ? totalInterest(principal, rate, months) : 0;
  const totalPay = principal + interestTotal;

  const rows = useMemo(() => {
    if (principal <= 0 || monthlyEmi <= 0) return [];
    const r = rate / 100 / 12;
    let balance = principal;
    const out: { month: number; principalPaid: number; interestPaid: number; balance: number }[] = [];
    for (let m = 1; m <= months; m++) {
      const interestPaid = balance * r;
      let principalPaid = monthlyEmi - interestPaid;
      if (m === months || principalPaid > balance) principalPaid = balance;
      balance = Math.max(0, balance - principalPaid);
      out.push({ month: m, principalPaid, interestPaid, balance });
    }
    return out;
  }, [principal, rate, months, monthlyEmi]);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Calculator size={14} className="text-[var(--color-primary)]" /> EMI & Amortization Schedule</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Reducing-balance EMI with a full month-by-month split of how much of each instalment goes to interest vs principal.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Loan amount (₹)</label>
            <input type="number" min={0} value={principalStr} onChange={e => setPrincipalStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Interest rate (% p.a.)</label>
            <input type="number" min={0} value={rateStr} onChange={e => setRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label>
            <input type="number" min={1} max={360} value={tenureStr} onChange={e => setTenureStr(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {principal > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Monthly EMI",     value: formatCurrency(monthlyEmi),    color: "text-[var(--color-primary)]" },
              { label: "Total interest",  value: formatCurrency(interestTotal), color: "text-orange-400" },
              { label: "Total repayment", value: formatCurrency(totalPay),      color: "text-[var(--color-text)]" },
              { label: "Interest / principal", value: principal > 0 ? `${Math.round((interestTotal / principal) * 100)}%` : "-", color: "text-[var(--color-muted)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {["Month", "Principal", "Interest", "Balance"].map((h, i) => (
                    <th key={h} className={`text-xs font-semibold text-[var(--color-muted)] px-4 py-2.5 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.month} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 tabular-nums">{r.month}</td>
                    <td className="px-4 py-2 tabular-nums text-right text-green-400">{formatCurrency(r.principalPaid)}</td>
                    <td className="px-4 py-2 tabular-nums text-right text-orange-400">{formatCurrency(r.interestPaid)}</td>
                    <td className="px-4 py-2 tabular-nums text-right text-[var(--color-muted)]">{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Standard reducing-balance EMI: EMI = P·r·(1+r)ⁿ ÷ ((1+r)ⁿ−1), where r = monthly rate. Early instalments are interest-heavy; the principal share rises every month. The final EMI is adjusted to clear any rounding residue.
      </div>
    </div>
  );
}

// ── #106 FLAT VS REDUCING RATE ──────────────────────────────────────────────
function FlatVsReducingTab() {
  const [principalStr, setPrincipalStr] = useState("1000000");
  const [flatRateStr,  setFlatRateStr]  = useState("10");
  const [tenureStr,    setTenureStr]    = useState("36");

  const principal = parseFloat(principalStr) || 0;
  const flatRate  = parseFloat(flatRateStr)  || 0;
  const months    = Math.max(1, Math.round(parseFloat(tenureStr) || 0));
  const years     = months / 12;

  // Flat: interest on full principal for whole tenure.
  const flatInterest = principal * (flatRate / 100) * years;
  const flatEmi      = principal > 0 ? (principal + flatInterest) / months : 0;

  // Solve the reducing rate that yields the SAME EMI (the true effective cost).
  const effReducingRate = useMemo(() => {
    if (principal <= 0 || flatEmi <= 0) return 0;
    let lo = 0, hi = 1; // monthly rate bounds
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const e = mid === 0 ? principal / months : (principal * mid * Math.pow(1 + mid, months)) / (Math.pow(1 + mid, months) - 1);
      if (e > flatEmi) hi = mid; else lo = mid;
    }
    return ((lo + hi) / 2) * 12 * 100; // annualised %
  }, [principal, flatEmi, months]);

  // For comparison: a genuine reducing loan quoted at the same nominal rate.
  const reducingEmiSameNominal = principal > 0 ? emi(principal, flatRate, months) : 0;
  const reducingInterestSame   = principal > 0 ? totalInterest(principal, flatRate, months) : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Percent size={14} className="text-[var(--color-primary)]" /> Flat vs Reducing Rate</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">A "flat" rate quote always costs far more than the same number quoted on reducing balance. See the true effective rate behind a flat quote.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Loan amount (₹)</label>
            <input type="number" min={0} value={principalStr} onChange={e => setPrincipalStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Quoted rate (% p.a.)</label>
            <input type="number" min={0} value={flatRateStr} onChange={e => setFlatRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label>
            <input type="number" min={1} value={tenureStr} onChange={e => setTenureStr(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {principal > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Flat EMI",            value: formatCurrency(flatEmi),               color: "text-[var(--color-text)]" },
              { label: "Flat total interest", value: formatCurrency(flatInterest),          color: "text-red-400" },
              { label: "Effective reducing rate", value: `${effReducingRate.toFixed(1)}%`,  color: "text-orange-400" },
              { label: "Extra vs true reducing",  value: formatCurrency(Math.max(0, flatInterest - reducingInterestSame)), color: "text-red-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--color-surface)] border border-red-800/40 rounded-lg p-5">
              <p className="text-sm font-semibold mb-3">Flat-rate quote @ {flatRate}%</p>
              <div className="space-y-2">
                {[
                  { label: "Monthly EMI", value: formatCurrency(flatEmi) },
                  { label: "Total interest", value: formatCurrency(flatInterest), color: "text-red-400" },
                  { label: "Total repayment", value: formatCurrency(principal + flatInterest), bold: true },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                    <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[var(--color-surface)] border border-[var(--color-primary)]/30 rounded-lg p-5">
              <p className="text-sm font-semibold mb-3">Reducing-balance @ same {flatRate}%</p>
              <div className="space-y-2">
                {[
                  { label: "Monthly EMI", value: formatCurrency(reducingEmiSameNominal) },
                  { label: "Total interest", value: formatCurrency(reducingInterestSame), color: "text-green-400" },
                  { label: "Total repayment", value: formatCurrency(principal + reducingInterestSame), bold: true },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                    <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        A flat rate charges interest on the full original principal every year even though you're repaying it down. Rule of thumb: effective reducing rate ≈ 1.8-1.9× the flat rate. Always ask lenders for the reducing-balance / APR equivalent before signing.
      </div>
    </div>
  );
}

// ── #107 DEBT-SERVICE COVERAGE RATIO (DSCR) ─────────────────────────────────
function DscrCalculator() {
  const { store } = useApp();

  // Seed annual net operating income from live transactions.
  const seedNoi = useMemo(() => {
    const txns = store.transactions ?? [];
    if (txns.length === 0) return 0;
    const rev = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = txns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const dates = txns.map(t => t.date).filter(Boolean).sort();
    const spanDays = dates.length >= 2 ? Math.max(1, (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000) : 30;
    return Math.max(0, Math.round((rev - exp) * (365 / spanDays)));
  }, [store.transactions]);

  // Seed existing annual debt service from active loans.
  const seedDebt = useMemo(() => Math.round((store.activeLoans ?? []).reduce((s, l) => s + l.monthlyEmi, 0) * 12), [store.activeLoans]);

  const [noiStr,        setNoiStr]        = useState(seedNoi > 0 ? String(seedNoi) : "");
  const [existDebtStr,  setExistDebtStr]  = useState(seedDebt > 0 ? String(seedDebt) : "");
  const [newAmtStr,     setNewAmtStr]     = useState("");
  const [newRateStr,    setNewRateStr]    = useState("16");
  const [newTenureStr,  setNewTenureStr]  = useState("48");

  const noi       = parseFloat(noiStr)       || 0;
  const existDebt = parseFloat(existDebtStr) || 0;
  const newAmt    = parseFloat(newAmtStr)    || 0;
  const newRate   = parseFloat(newRateStr)   || 0;
  const newTenure = Math.max(1, Math.round(parseFloat(newTenureStr) || 0));

  const newAnnualDebt = newAmt > 0 ? emi(newAmt, newRate, newTenure) * 12 : 0;
  const totalDebtService = existDebt + newAnnualDebt;

  const currentDscr = existDebt > 0 ? noi / existDebt : 0;
  const postDscr    = totalDebtService > 0 ? noi / totalDebtService : 0;

  const verdict = (d: number) => d <= 0 ? null
    : d >= 1.5 ? { label: "Strong - comfortable cover", cls: "text-green-400" }
    : d >= 1.25 ? { label: "Acceptable - most lenders OK", cls: "text-blue-400" }
    : d >= 1.0 ? { label: "Tight - barely covers", cls: "text-yellow-400" }
    : { label: "Below 1.0 - income won't cover debt", cls: "text-red-400" };
  const postVerdict = verdict(postDscr);

  // Max new annual debt service to keep DSCR ≥ 1.25, and the principal that implies.
  const minDscr = 1.25;
  const maxTotalService = noi / minDscr;
  const maxNewService   = Math.max(0, maxTotalService - existDebt);
  const r = newRate / 100 / 12;
  const maxNewPrincipal = maxNewService > 0 && r > 0
    ? Math.round(((maxNewService / 12) * (Math.pow(1 + r, newTenure) - 1)) / (r * Math.pow(1 + r, newTenure)))
    : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Debt-Service Coverage Ratio (DSCR)</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">DSCR = net operating income ÷ annual debt service. It's the core covenant lenders test. Income and existing debt are pre-filled from your data - model a new loan to see post-DSCR.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Annual net operating income (₹)</label>
            <input type="number" min={0} value={noiStr} onChange={e => setNoiStr(e.target.value)} placeholder={seedNoi > 0 ? String(seedNoi) : "e.g. 3000000"} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Existing annual debt service (₹)</label>
            <input type="number" min={0} value={existDebtStr} onChange={e => setExistDebtStr(e.target.value)} placeholder={seedDebt > 0 ? String(seedDebt) : "EMI × 12"} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">New loan amount (₹)</label>
            <input type="number" min={0} value={newAmtStr} onChange={e => setNewAmtStr(e.target.value)} placeholder="e.g. 2000000" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Rate (% p.a.)</label>
              <input type="number" min={0} value={newRateStr} onChange={e => setNewRateStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (mo)</label>
              <input type="number" min={1} value={newTenureStr} onChange={e => setNewTenureStr(e.target.value)} className={inp} />
            </div>
          </div>
        </div>
      </div>

      {noi > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Current DSCR", value: currentDscr > 0 ? `${currentDscr.toFixed(2)}x` : "no debt", color: existDebt > 0 ? (verdict(currentDscr)?.cls ?? "text-[var(--color-text)]") : "text-green-400" },
              { label: "Post-loan DSCR", value: postDscr > 0 ? `${postDscr.toFixed(2)}x` : "-", color: postVerdict?.cls ?? "text-[var(--color-muted)]" },
              { label: "Assessment", value: postVerdict?.label ?? "-", color: postVerdict?.cls ?? "text-[var(--color-muted)]" },
              { label: "Max new loan @ 1.25x", value: maxNewPrincipal > 0 ? formatCurrency(maxNewPrincipal) : "-", color: "text-[var(--color-primary)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Debt service build-up</h3>
            <div className="space-y-2">
              {[
                { label: "Net operating income (annual)", value: formatCurrency(noi) },
                { label: "Existing debt service", value: `(${formatCurrency(existDebt)})`, color: "text-red-400" },
                { label: "New loan debt service (annual)", value: `(${formatCurrency(Math.round(newAnnualDebt))})`, color: "text-orange-400" },
                { label: "Total debt service", value: formatCurrency(Math.round(totalDebtService)), bold: true },
                { label: "Income left after debt", value: formatCurrency(Math.round(noi - totalDebtService)), color: noi - totalDebtService >= 0 ? "text-green-400" : "text-red-400", bold: true },
              ].map(r2 => (
                <div key={r2.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]">{r2.label}</span>
                  <span className={`tabular-nums ${r2.bold ? "font-bold" : ""} ${r2.color ?? "text-[var(--color-text)]"}`}>{r2.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Most term lenders require DSCR ≥ 1.25-1.5; below 1.0 means operating income can't service the debt. NOI here ≈ revenue − operating expenses (before interest), annualised from your transactions. The max-loan figure keeps post-DSCR at the 1.25x floor.
      </div>
    </div>
  );
}

// ── #108 OVERDRAFT / CC DRAWING POWER ───────────────────────────────────────
function DrawingPowerTab() {
  const [stockStr,      setStockStr]      = useState("");
  const [stockMargin,   setStockMargin]   = useState(25);  // % margin on stock
  const [debtorsStr,    setDebtorsStr]    = useState("");
  const [debtorMargin,  setDebtorMargin]  = useState(40);  // % margin on debtors
  const [creditorsStr,  setCreditorsStr]  = useState("");  // creditors against stock
  const [sanctionStr,   setSanctionStr]   = useState("");  // sanctioned limit
  const [utilisedStr,   setUtilisedStr]   = useState("");  // currently drawn

  const stock     = parseFloat(stockStr)     || 0;
  const debtors   = parseFloat(debtorsStr)   || 0;
  const creditors = parseFloat(creditorsStr) || 0;
  const sanction  = parseFloat(sanctionStr)  || 0;
  const utilised  = parseFloat(utilisedStr)  || 0;

  // Paid stock = stock − creditors against it; DP = (paid stock × (1−margin)) + (debtors × (1−margin)).
  const paidStock = Math.max(0, stock - creditors);
  const dpStock   = paidStock * (1 - stockMargin / 100);
  const dpDebtors = debtors * (1 - debtorMargin / 100);
  const drawingPower = Math.round(dpStock + dpDebtors);
  // Effective limit a bank allows is the LOWER of sanctioned limit and drawing power.
  const effectiveLimit = sanction > 0 ? Math.min(sanction, drawingPower) : drawingPower;
  const available = Math.max(0, effectiveLimit - utilised);
  const utilPct   = effectiveLimit > 0 ? Math.round((utilised / effectiveLimit) * 100) : 0;
  const overdrawn = utilised > effectiveLimit;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> OD / CC Drawing Power</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Banks cap how much of your cash-credit limit you can actually draw to the "drawing power" computed from your latest stock & debtor statement, after applying margins.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Closing stock value (₹)</label>
            <input type="number" min={0} value={stockStr} onChange={e => setStockStr(e.target.value)} placeholder="e.g. 4000000" className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Margin on stock</span><span className="font-semibold text-[var(--color-text)]">{stockMargin}%</span></label>
            <input type="range" min={10} max={50} value={stockMargin} onChange={e => setStockMargin(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Creditors against stock (₹)</label>
            <input type="number" min={0} value={creditorsStr} onChange={e => setCreditorsStr(e.target.value)} placeholder="e.g. 800000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Eligible debtors (₹)</label>
            <input type="number" min={0} value={debtorsStr} onChange={e => setDebtorsStr(e.target.value)} placeholder="e.g. 2500000" className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Margin on debtors</span><span className="font-semibold text-[var(--color-text)]">{debtorMargin}%</span></label>
            <input type="range" min={20} max={60} value={debtorMargin} onChange={e => setDebtorMargin(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Sanctioned limit (₹, optional)</label>
            <input type="number" min={0} value={sanctionStr} onChange={e => setSanctionStr(e.target.value)} placeholder="e.g. 5000000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Currently utilised (₹, optional)</label>
            <input type="number" min={0} value={utilisedStr} onChange={e => setUtilisedStr(e.target.value)} placeholder="e.g. 2000000" className={inp} />
          </div>
        </div>
      </div>

      {(stock > 0 || debtors > 0) && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Drawing power", value: formatCurrency(drawingPower), color: "text-[var(--color-primary)]" },
              { label: "Effective limit", value: formatCurrency(effectiveLimit), color: "text-[var(--color-text)]" },
              { label: "Available to draw", value: formatCurrency(available), color: overdrawn ? "text-red-400" : "text-green-400" },
              { label: "Utilisation", value: sanction > 0 || utilised > 0 ? `${utilPct}%` : "-", color: utilPct > 90 ? "text-red-400" : utilPct > 70 ? "text-orange-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {overdrawn && (
            <div className="bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3 text-sm flex items-center gap-3">
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <span>You've drawn {formatCurrency(utilised)} against an effective limit of {formatCurrency(effectiveLimit)} - the account is over-drawn. Banks charge penal interest and may flag it. Submit a fresh stock statement or reduce the outstanding.</span>
            </div>
          )}

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Drawing power build-up</h3>
            <div className="space-y-2">
              {[
                { label: `Paid stock (stock − creditors)`, value: formatCurrency(Math.round(paidStock)) },
                { label: `DP from stock (after ${stockMargin}% margin)`, value: formatCurrency(Math.round(dpStock)), color: "text-blue-400" },
                { label: `DP from debtors (after ${debtorMargin}% margin)`, value: formatCurrency(Math.round(dpDebtors)), color: "text-blue-400" },
                { label: "Total drawing power", value: formatCurrency(drawingPower), bold: true },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                  <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Drawing power = (paid stock × (1 − stock margin)) + (eligible debtors × (1 − debtor margin)). You can draw only up to the LOWER of the sanctioned limit and the drawing power. Typical margins: 25% on stock, 40-50% on debtors; over-90-day debtors are usually excluded.
      </div>
    </div>
  );
}

// ── #109 GST-TURNOVER LOAN ELIGIBILITY ──────────────────────────────────────
function GstEligibilityTab() {
  const [turnoverStr, setTurnoverStr] = useState("");
  const [marginPct,   setMarginPct]   = useState(8);   // net profit margin %
  const [multiplier,  setMultiplier]  = useState(3);    // monthly-sales multiple
  const [filingMonths,setFilingMonths]= useState(12);   // consecutive GSTR filings

  const annualTurnover = parseFloat(turnoverStr) || 0;
  const monthlyTurnover = annualTurnover / 12;

  // Two common GST-based methods used by fintech lenders:
  // 1. Turnover-multiple: a multiple of monthly GST-reported sales.
  const turnoverMethod = Math.round(monthlyTurnover * multiplier);
  // 2. Profit-coverage: ~50% of annual net profit serviceable, capitalised over 36 mo @ 18%.
  const annualProfit = annualTurnover * (marginPct / 100);
  const serviceable = (annualProfit * 0.5) / 12;
  const r36 = 0.18 / 12;
  const profitMethod = serviceable > 0 ? Math.round((serviceable * (Math.pow(1 + r36, 36) - 1)) / (r36 * Math.pow(1 + r36, 36))) : 0;

  // Filing-consistency factor: <6 months filed sharply curtails eligibility.
  const filingFactor = filingMonths >= 12 ? 1 : filingMonths >= 6 ? 0.7 : filingMonths >= 3 ? 0.4 : 0.15;
  const indicative = Math.round(Math.min(turnoverMethod, profitMethod) * filingFactor);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Banknote size={14} className="text-[var(--color-primary)]" /> GST-Turnover Loan Eligibility</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Fintech and bank "GST loans" size your limit off filed GSTR turnover. Enter your annual GST-reported sales to estimate the limit under the two common methods.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Annual GST turnover (₹)</label>
            <input type="number" min={0} value={turnoverStr} onChange={e => setTurnoverStr(e.target.value)} placeholder="e.g. 24000000" className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Net profit margin</span><span className="font-semibold text-[var(--color-text)]">{marginPct}%</span></label>
            <input type="range" min={2} max={30} value={marginPct} onChange={e => setMarginPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Sales multiple (× monthly)</span><span className="font-semibold text-[var(--color-text)]">{multiplier}×</span></label>
            <input type="range" min={1} max={6} value={multiplier} onChange={e => setMultiplier(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Consecutive GSTR filings</span><span className="font-semibold text-[var(--color-text)]">{filingMonths} mo</span></label>
            <input type="range" min={1} max={24} value={filingMonths} onChange={e => setFilingMonths(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {annualTurnover > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Turnover method", value: formatCurrency(turnoverMethod), color: "text-blue-400" },
              { label: "Profit-coverage method", value: formatCurrency(profitMethod), color: "text-purple-400" },
              { label: "Filing factor", value: `${Math.round(filingFactor * 100)}%`, color: filingFactor >= 1 ? "text-green-400" : filingFactor >= 0.7 ? "text-yellow-400" : "text-red-400" },
              { label: "Indicative limit", value: formatCurrency(indicative), color: "text-[var(--color-primary)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">How it's derived</h3>
            <div className="space-y-2">
              {[
                { label: "Monthly GST sales", value: formatCurrency(Math.round(monthlyTurnover)) },
                { label: `Turnover method (${multiplier}× monthly)`, value: formatCurrency(turnoverMethod), color: "text-blue-400" },
                { label: `Annual net profit (${marginPct}% margin)`, value: formatCurrency(Math.round(annualProfit)) },
                { label: "Profit-coverage limit (50% serviceable, 36mo @18%)", value: formatCurrency(profitMethod), color: "text-purple-400" },
                { label: `Lower method × filing factor (${Math.round(filingFactor * 100)}%)`, value: formatCurrency(indicative), bold: true, color: "text-[var(--color-primary)]" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                  <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Lenders take the LOWER of a turnover multiple (commonly 2-4× monthly GST sales) and a profit-serviceability cap, then haircut for filing consistency - 12+ months of uninterrupted GSTR-1/3B filings is near-essential. Late or nil filings sharply reduce the limit.
      </div>
    </div>
  );
}

// ── #110 LOAN-AGAINST-PROPERTY / LTV ────────────────────────────────────────
function LapLtvTab() {
  const [valueStr,   setValueStr]   = useState("");
  const [propType,   setPropType]   = useState<"residential" | "commercial" | "industrial">("residential");
  const [occupancy,  setOccupancy]  = useState<"self" | "rented" | "vacant">("self");
  const [rateStr,    setRateStr]    = useState("10.5");
  const [tenureStr,  setTenureStr]  = useState("120");
  const [existingStr,setExistingStr]= useState(""); // existing loan on the property

  // LTV norms vary by property type & occupancy.
  const baseLtv: Record<typeof propType, number> = { residential: 70, commercial: 60, industrial: 50 };
  const occAdj  = occupancy === "self" ? 0 : occupancy === "rented" ? -5 : -10;
  const ltvPct  = Math.max(30, baseLtv[propType] + occAdj);

  const value     = parseFloat(valueStr)    || 0;
  const existing  = parseFloat(existingStr) || 0;
  const rate      = parseFloat(rateStr)     || 0;
  const tenure    = Math.max(1, Math.round(parseFloat(tenureStr) || 0));

  const grossEligible = Math.round(value * (ltvPct / 100));
  const netEligible   = Math.max(0, grossEligible - existing);
  const monthlyEmi    = netEligible > 0 ? emi(netEligible, rate, tenure) : 0;
  const interestTotal = netEligible > 0 ? totalInterest(netEligible, rate, tenure) : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> Loan-Against-Property / LTV</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">LAP gives the lowest SME rates but the loan is capped at a loan-to-value (LTV) of the property's market value, varying by type and occupancy.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Property market value (₹)</label>
            <input type="number" min={0} value={valueStr} onChange={e => setValueStr(e.target.value)} placeholder="e.g. 15000000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Existing loan on property (₹)</label>
            <input type="number" min={0} value={existingStr} onChange={e => setExistingStr(e.target.value)} placeholder="e.g. 0" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Property type</label>
            <select value={propType} onChange={e => setPropType(e.target.value as typeof propType)} className={inp}>
              <option value="residential">Residential (70% LTV)</option>
              <option value="commercial">Commercial (60% LTV)</option>
              <option value="industrial">Industrial (50% LTV)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Occupancy</label>
            <select value={occupancy} onChange={e => setOccupancy(e.target.value as typeof occupancy)} className={inp}>
              <option value="self">Self-occupied</option>
              <option value="rented">Rented (−5%)</option>
              <option value="vacant">Vacant (−10%)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Interest rate (% p.a.)</label>
            <input type="number" min={0} value={rateStr} onChange={e => setRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label>
            <input type="number" min={1} value={tenureStr} onChange={e => setTenureStr(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {value > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Applicable LTV", value: `${ltvPct}%`, color: "text-[var(--color-text)]" },
              { label: "Gross eligible", value: formatCurrency(grossEligible), color: "text-blue-400" },
              { label: "Net loan (after existing)", value: formatCurrency(netEligible), color: "text-[var(--color-primary)]" },
              { label: "Monthly EMI", value: formatCurrency(monthlyEmi), color: "text-[var(--color-text)]" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex justify-between text-[10px] text-[var(--color-muted)] mb-1">
              <span>Eligible loan {formatCurrency(grossEligible)}</span>
              <span>Property value {formatCurrency(value)}</span>
            </div>
            <div className="w-full h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${Math.min(100, ltvPct)}%` }} />
            </div>
            <div className="space-y-2 mt-4">
              {[
                { label: "Property market value", value: formatCurrency(value) },
                { label: `Gross eligible @ ${ltvPct}% LTV`, value: formatCurrency(grossEligible), color: "text-blue-400" },
                { label: "Less: existing loan", value: existing > 0 ? `(${formatCurrency(existing)})` : "-", color: "text-red-400" },
                { label: "Net loan available", value: formatCurrency(netEligible), bold: true, color: "text-[var(--color-primary)]" },
                { label: "Total interest over tenure", value: formatCurrency(interestTotal), color: "text-orange-400" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                  <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Indicative LTV bands: residential ~65-75%, commercial ~55-65%, industrial ~50%. Lenders value the property conservatively (often below market) and net off any existing charge. LAP tenures run up to 15 years - longer tenure lowers EMI but raises total interest.
      </div>
    </div>
  );
}

// ── #111 PREPAYMENT / PART-PAYMENT OPTIMIZER ────────────────────────────────
function PrepaymentOptimizer() {
  const { store } = useApp();
  const activeLoans = store.activeLoans ?? [];

  const [outstandingStr, setOutstandingStr] = useState("");
  const [rateStr,        setRateStr]        = useState("16");
  const [remTenureStr,   setRemTenureStr]   = useState("36");
  const [lumpStr,        setLumpStr]        = useState("");
  const [feePct,         setFeePct]         = useState(0); // prepayment/foreclosure charge %

  // Quick-fill from an active loan.
  const fillFrom = (id: string) => {
    const l = activeLoans.find(x => x.id === id);
    if (!l) return;
    setOutstandingStr(String(Math.round(l.outstanding)));
    setRateStr(String(l.rate));
    setRemTenureStr(String(l.termMonths));
  };

  const outstanding = parseFloat(outstandingStr) || 0;
  const rate        = parseFloat(rateStr)        || 0;
  const remTenure   = Math.max(1, Math.round(parseFloat(remTenureStr) || 0));
  const lump        = parseFloat(lumpStr)        || 0;

  const baseEmi      = outstanding > 0 ? emi(outstanding, rate, remTenure) : 0;
  const baseInterest = outstanding > 0 ? totalInterest(outstanding, rate, remTenure) : 0;
  const fee          = Math.round(lump * (feePct / 100));

  const newPrincipal = Math.max(0, outstanding - lump);
  // Option A: keep EMI, shorten tenure.
  const r = rate / 100 / 12;
  const newTenureKeepEmi = useMemo(() => {
    if (newPrincipal <= 0 || baseEmi <= 0) return 0;
    if (r === 0) return Math.ceil(newPrincipal / baseEmi);
    // n = -ln(1 - P·r/EMI) / ln(1+r)
    const denom = 1 - (newPrincipal * r) / baseEmi;
    if (denom <= 0) return remTenure; // EMI too small to amortise - should not happen post-prepay
    return Math.ceil(-Math.log(denom) / Math.log(1 + r));
  }, [newPrincipal, baseEmi, r, remTenure]);
  const interestKeepEmi = baseEmi * newTenureKeepEmi - newPrincipal;
  const monthsSaved     = Math.max(0, remTenure - newTenureKeepEmi);

  // Option B: keep tenure, reduce EMI.
  const newEmiKeepTenure = newPrincipal > 0 ? emi(newPrincipal, rate, remTenure) : 0;
  const interestKeepTenure = newPrincipal > 0 ? totalInterest(newPrincipal, rate, remTenure) : 0;
  const emiReduction = baseEmi - newEmiKeepTenure;

  const savingKeepEmi     = Math.max(0, baseInterest - interestKeepEmi - fee);
  const savingKeepTenure  = Math.max(0, baseInterest - interestKeepTenure - fee);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Coins size={14} className="text-[var(--color-primary)]" /> Prepayment / Part-Payment Optimizer</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Make a lump-sum payment and compare the two choices lenders give you: keep the EMI and finish sooner, or keep the tenure and pay a smaller EMI.</p>
        {activeLoans.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs text-[var(--color-muted)] mb-1">Pre-fill from an active loan</label>
            <div className="flex flex-wrap gap-2">
              {activeLoans.map(l => (
                <button key={l.id} onClick={() => fillFrom(l.id)} className="text-xs border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)] px-3 py-1.5 rounded-lg">
                  {l.lender} · {formatCurrency(l.outstanding)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Outstanding principal (₹)</label>
            <input type="number" min={0} value={outstandingStr} onChange={e => setOutstandingStr(e.target.value)} placeholder="e.g. 1500000" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Lump-sum prepayment (₹)</label>
            <input type="number" min={0} value={lumpStr} onChange={e => setLumpStr(e.target.value)} placeholder="e.g. 300000" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Rate (% p.a.)</label>
              <input type="number" min={0} value={rateStr} onChange={e => setRateStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">Months left</label>
              <input type="number" min={1} value={remTenureStr} onChange={e => setRemTenureStr(e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Prepayment / foreclosure fee</span><span className="font-semibold text-[var(--color-text)]">{feePct}%</span></label>
            <input type="range" min={0} max={5} step={0.5} value={feePct} onChange={e => setFeePct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
        </div>
      </div>

      {outstanding > 0 && lump > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Current EMI", value: formatCurrency(baseEmi), color: "text-[var(--color-text)]" },
              { label: "Interest without prepay", value: formatCurrency(baseInterest), color: "text-orange-400" },
              { label: "New principal", value: formatCurrency(newPrincipal), color: "text-[var(--color-text)]" },
              { label: "Prepay fee", value: fee > 0 ? formatCurrency(fee) : "nil", color: fee > 0 ? "text-red-400" : "text-green-400" },
            ].map(c => (
              <div key={c.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-muted)] mb-1">{c.label}</p>
                <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${savingKeepEmi >= savingKeepTenure ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2"><TrendingDown size={14} className="text-[var(--color-primary)]" /> Keep EMI, finish sooner</p>
                {savingKeepEmi >= savingKeepTenure && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Saves more</span>}
              </div>
              <div className="space-y-2">
                {[
                  { label: "EMI stays at", value: formatCurrency(baseEmi) },
                  { label: "New tenure", value: `${newTenureKeepEmi} mo (−${monthsSaved})`, color: "text-green-400" },
                  { label: "Interest now", value: formatCurrency(Math.round(interestKeepEmi)), color: "text-orange-400" },
                  { label: "Net interest saved", value: formatCurrency(Math.round(savingKeepEmi)), bold: true, color: "text-green-400" },
                ].map(r2 => (
                  <div key={r2.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r2.label}</span>
                    <span className={`tabular-nums ${r2.bold ? "font-bold" : ""} ${r2.color ?? "text-[var(--color-text)]"}`}>{r2.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${savingKeepTenure > savingKeepEmi ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2"><Wallet size={14} className="text-[var(--color-primary)]" /> Keep tenure, lower EMI</p>
                {savingKeepTenure > savingKeepEmi && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Saves more</span>}
              </div>
              <div className="space-y-2">
                {[
                  { label: "Tenure stays at", value: `${remTenure} mo` },
                  { label: "New EMI", value: `${formatCurrency(newEmiKeepTenure)} (−${formatCurrency(Math.round(emiReduction))})`, color: "text-green-400" },
                  { label: "Interest now", value: formatCurrency(Math.round(interestKeepTenure)), color: "text-orange-400" },
                  { label: "Net interest saved", value: formatCurrency(Math.round(savingKeepTenure)), bold: true, color: "text-green-400" },
                ].map(r2 => (
                  <div key={r2.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r2.label}</span>
                    <span className={`tabular-nums ${r2.bold ? "font-bold" : ""} ${r2.color ?? "text-[var(--color-text)]"}`}>{r2.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        "Keep EMI, finish sooner" almost always saves the most interest because the principal falls fastest. "Keep tenure, lower EMI" eases monthly cash flow. RBI bars foreclosure charges on floating-rate term loans to individuals/MSMEs - check your sanction; a high fee can wipe out the saving.
      </div>
    </div>
  );
}

// ── #112 OVERDRAFT VS TERM LOAN ─────────────────────────────────────────────
function OdVsTermLoanTab() {
  const [needStr,       setNeedStr]       = useState("1000000");
  const [monthsStr,     setMonthsStr]     = useState("12");
  const [odRateStr,     setOdRateStr]     = useState("14");
  const [tlRateStr,     setTlRateStr]     = useState("16");
  const [utilPct,       setUtilPct]       = useState(50); // avg % of OD limit actually used
  const [odProcessStr,  setOdProcessStr]  = useState("0.5"); // OD setup fee %
  const [tlProcessStr,  setTlProcessStr]  = useState("1.5"); // TL processing fee %

  const need    = parseFloat(needStr)    || 0;
  const months  = Math.max(1, Math.round(parseFloat(monthsStr) || 0));
  const odRate  = parseFloat(odRateStr)  || 0;
  const tlRate  = parseFloat(tlRateStr)  || 0;

  // OD: interest only on the average utilised balance; full limit available all the time.
  const avgUtilised = need * (utilPct / 100);
  const odInterest  = Math.round(avgUtilised * (odRate / 100) * (months / 12));
  const odFee       = Math.round(need * (parseFloat(odProcessStr) || 0) / 100);
  const odTotal     = odInterest + odFee;

  // Term loan: fixed EMI on full amount over the period (reducing balance).
  const tlEmi      = need > 0 ? emi(need, tlRate, months) : 0;
  const tlInterest = need > 0 ? Math.round(totalInterest(need, tlRate, months)) : 0;
  const tlFee      = Math.round(need * (parseFloat(tlProcessStr) || 0) / 100);
  const tlTotal    = tlInterest + tlFee;

  const winner = need > 0 ? (odTotal <= tlTotal ? "od" : "tl") : null;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Overdraft vs Term Loan</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">For lumpy, in-and-out working-capital needs an overdraft (interest only on what you use) often beats a term loan, even at a similar rate. Compare the true cost for your usage pattern.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount needed / limit (₹)</label>
            <input type="number" min={0} value={needStr} onChange={e => setNeedStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Period (months)</label>
            <input type="number" min={1} value={monthsStr} onChange={e => setMonthsStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">OD rate (% p.a.)</label>
            <input type="number" min={0} value={odRateStr} onChange={e => setOdRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Term loan rate (% p.a.)</label>
            <input type="number" min={0} value={tlRateStr} onChange={e => setTlRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Avg OD utilisation</span><span className="font-semibold text-[var(--color-text)]">{utilPct}%</span></label>
            <input type="range" min={10} max={100} value={utilPct} onChange={e => setUtilPct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">OD fee (%)</label>
              <input type="number" min={0} step={0.1} value={odProcessStr} onChange={e => setOdProcessStr(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-muted)] mb-1">TL fee (%)</label>
              <input type="number" min={0} step={0.1} value={tlProcessStr} onChange={e => setTlProcessStr(e.target.value)} className={inp} />
            </div>
          </div>
        </div>
      </div>

      {need > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${winner === "od" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Overdraft / Cash Credit</p>
                {winner === "od" && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Cheaper</span>}
              </div>
              <div className="space-y-2">
                {[
                  { label: `Avg utilised (${utilPct}% of limit)`, value: formatCurrency(Math.round(avgUtilised)) },
                  { label: `Interest on usage @ ${odRate}%`, value: formatCurrency(odInterest), color: "text-orange-400" },
                  { label: `Setup fee (${odProcessStr}%)`, value: formatCurrency(odFee), color: "text-red-400" },
                  { label: "Total cost", value: formatCurrency(odTotal), bold: true, color: winner === "od" ? "text-[var(--color-primary)]" : "text-[var(--color-text)]" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                    <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${winner === "tl" ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Term Loan</p>
                {winner === "tl" && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Cheaper</span>}
              </div>
              <div className="space-y-2">
                {[
                  { label: "Fixed EMI", value: `${formatCurrency(tlEmi)} /mo` },
                  { label: `Interest @ ${tlRate}% (full amount)`, value: formatCurrency(tlInterest), color: "text-orange-400" },
                  { label: `Processing fee (${tlProcessStr}%)`, value: formatCurrency(tlFee), color: "text-red-400" },
                  { label: "Total cost", value: formatCurrency(tlTotal), bold: true, color: winner === "tl" ? "text-[var(--color-primary)]" : "text-[var(--color-text)]" },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
                    <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {winner && (
            <div className={`rounded-lg px-4 py-3 border text-sm ${winner === "od" ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30" : "bg-purple-900/20 border-purple-800/30"}`}>
              <span className="font-semibold">{winner === "od" ? "Overdraft" : "Term loan"} is cheaper</span> by {formatCurrency(Math.abs(odTotal - tlTotal))} over {months} months.
              {winner === "od" ? " The OD wins because you only pay interest on the balance you actually use - ideal for fluctuating needs." : " The term loan wins at high, steady utilisation; a structured EMI also enforces repayment discipline."}
            </div>
          )}
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        OD interest is charged daily on the drawn balance, so low average utilisation makes it cheap; a term loan charges interest on the full disbursed amount regardless of use. Choose OD for unpredictable working-capital swings, a term loan for one-time capex with steady repayment.
      </div>
    </div>
  );
}

// ── Score Improvement Planner (feature #27: Score Improvement Coach) ──
// Owner ticks off concrete actions; each carries a point value. We project the
// new score live and persist which actions are committed (durable, "cr-" key).
function ScoreImprovementPlanner() {
  const { store } = useApp();
  const { creditApplications } = store;
  const baseScore = Math.max(0, ...creditApplications.map(a => a.underwritingScore), 0);

  const ACTIONS: { id: string; label: string; points: number; effort: "Quick" | "30 days" | "90 days"; detail: string }[] = [
    { id: "consistency", label: "Smooth monthly revenue (consistent invoicing)", points: 8, effort: "30 days", detail: "Keep monthly inflows within ±25% to cut revenue volatility - the single largest score lever." },
    { id: "buffer",      label: "Maintain a 1-month burn cash buffer (no overdrafts)", points: 5, effort: "Quick", detail: "Even one negative-balance day knocks ~5 pts. Park a buffer to avoid overdraft flags." },
    { id: "diversify",   label: "Add 2+ revenue sources (cut top-customer concentration)", points: 6, effort: "90 days", detail: "Lower single-customer share below 40% of revenue to reduce concentration risk." },
    { id: "gst",         label: "File GSTR-3B on time for 3 consecutive months", points: 7, effort: "90 days", detail: "On-time GST filing is verified turnover proof and a strong positive signal." },
    { id: "dsr",         label: "Reduce existing EMI load below 30% of revenue", points: 6, effort: "30 days", detail: "Prepay or close a small loan to free up debt-service capacity." },
    { id: "age",         label: "Cross the 12-month / 24-month business-age tier", points: 5, effort: "90 days", detail: "Longer verified history unlocks standard and best-rate tiers automatically." },
  ];

  const [done, setDone] = useFeatureState<Record<string, boolean>>("cr-scoreplan-done", {});
  const gained = ACTIONS.filter(a => done[a.id]).reduce((s, a) => s + a.points, 0);
  const projected = Math.min(100, baseScore + gained);
  const remaining = ACTIONS.filter(a => !done[a.id]).reduce((s, a) => s + a.points, 0);
  const toggle = (id: string) => setDone(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Gauge size={14} className="text-[var(--color-primary)]" /> Credit Score Improvement Planner</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Tick the actions you commit to. We project the score gain instantly and remember your plan. {baseScore === 0 && "Apply once to anchor this to your real score."}</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Current score", value: baseScore > 0 ? `${baseScore}/100` : "-", color: "text-[var(--color-text)]" },
            { label: "Projected",     value: baseScore > 0 ? `${projected}/100` : `+${gained}`, color: "text-[var(--color-primary)]" },
            { label: "Points left",   value: `+${remaining}`, color: "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--color-muted)] mb-0.5">{k.label}</p>
              <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
        {baseScore > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-[var(--color-muted)] mb-1"><span>{baseScore}</span><span>50 (approval)</span><span>100</span></div>
            <div className="h-2.5 bg-[var(--color-bg)] rounded-full overflow-hidden relative">
              <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${projected}%` }} />
              <div className="absolute top-0 bottom-0 w-px bg-[var(--color-muted)]" style={{ left: "50%" }} />
            </div>
          </div>
        )}
        <div className="space-y-2">
          {ACTIONS.map(a => {
            const checked = !!done[a.id];
            return (
              <button key={a.id} onClick={() => toggle(a.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${checked ? "border-green-800/40 bg-green-950/10" : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-primary)]/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1">
                    {checked ? <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-muted)]/50 shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-xs font-semibold">{a.label}</p>
                      <p className="text-[11px] text-[var(--color-muted)] mt-0.5 leading-snug">{a.detail}</p>
                      <span className="inline-block mt-1 text-[10px] text-[var(--color-muted)] bg-[var(--color-accent)]/40 border border-[var(--color-border)] px-1.5 py-0.5 rounded">{a.effort}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded border ${checked ? "text-green-400 bg-green-950/30 border-green-800/30" : "text-yellow-400 bg-yellow-950/30 border-yellow-800/30"}`}>+{a.points} pts</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Point values are indicative weightings from the underwriting model. Completing committed actions and re-applying after 30+ days lets the engine re-score with the improved data.
      </div>
    </div>
  );
}

// ── Compare 3 Loan Offers Side-by-Side (feature #28: Multi-Lender Rate Compare) ──
// Effective APR comparison that folds processing fees and insurance into the true
// cost, so the cheapest headline rate isn't mistaken for the cheapest loan.
function ThreeOfferCompare() {
  type Offer = { lender: string; amount: string; rate: string; months: string; fee: string; insurance: string };
  const blank = (lender: string): Offer => ({ lender, amount: "", rate: "", months: "24", fee: "1", insurance: "0" });
  const [offers, setOffers] = useFeatureState<Offer[]>("cr-offercmp", [blank("Lender A"), blank("Lender B"), blank("Lender C")]);

  const setField = (i: number, key: keyof Offer, val: string) =>
    setOffers(prev => prev.map((o, idx) => idx === i ? { ...o, [key]: val } : o));

  const rows = offers.map(o => {
    const amount = parseFloat(o.amount) || 0;
    const rate   = parseFloat(o.rate)   || 0;
    const months = Math.max(1, Math.round(parseFloat(o.months) || 0));
    const fee    = Math.round(amount * (parseFloat(o.fee) || 0) / 100);
    const ins    = Math.round(amount * (parseFloat(o.insurance) || 0) / 100);
    const emiVal = amount > 0 ? emi(amount, rate, months) : 0;
    const interest = amount > 0 ? Math.round(totalInterest(amount, rate, months)) : 0;
    const totalCost = interest + fee + ins;
    // Effective annualised cost on disbursed amount net of upfront fee+insurance.
    const effApr = amount > 0 && months > 0 ? Math.round(((totalCost / amount) / (months / 12)) * 1000) / 10 : 0;
    return { ...o, amount, months, emiVal, interest, fee, ins, totalCost, effApr };
  });
  const valid = rows.filter(r => r.amount > 0);
  const cheapest = valid.length > 0 ? valid.reduce((a, b) => a.totalCost <= b.totalCost ? a : b).lender : null;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Scale size={14} className="text-[var(--color-primary)]" /> Compare 3 Loan Offers</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Enter three competing offers. We fold processing fee and insurance into the effective APR so you compare true cost, not just the advertised rate.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {offers.map((o, i) => (
            <div key={i} className="space-y-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <input value={o.lender} onChange={e => setField(i, "lender", e.target.value)} placeholder="Lender name" className={`${inp} font-semibold`} />
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Amount (₹)</label><input type="number" min={0} value={o.amount} onChange={e => setField(i, "amount", e.target.value)} className={inp} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Rate %</label><input type="number" min={0} value={o.rate} onChange={e => setField(i, "rate", e.target.value)} className={inp} /></div>
                <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Months</label><input type="number" min={1} value={o.months} onChange={e => setField(i, "months", e.target.value)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Fee %</label><input type="number" min={0} step={0.1} value={o.fee} onChange={e => setField(i, "fee", e.target.value)} className={inp} /></div>
                <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Insurance %</label><input type="number" min={0} step={0.1} value={o.insurance} onChange={e => setField(i, "insurance", e.target.value)} className={inp} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {valid.length > 0 && (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)]">
                <th className="pb-2 font-medium">Metric</th>
                {rows.map((r, i) => <th key={i} className="pb-2 font-semibold text-[var(--color-text)] text-right">{r.lender || `Offer ${i + 1}`}{r.lender === cheapest && r.amount > 0 && <span className="ml-1 text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-1.5 py-0.5 rounded-full">Best</span>}</th>)}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[
                { label: "Loan amount", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.amount) : "-" },
                { label: "Headline rate", get: (r: typeof rows[number]) => r.amount > 0 ? `${parseFloat(r.rate) || 0}%` : "-" },
                { label: "Monthly EMI", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.emiVal) : "-" },
                { label: "Total interest", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.interest) : "-" },
                { label: "Processing fee", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.fee) : "-" },
                { label: "Insurance", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.ins) : "-" },
                { label: "Effective APR", get: (r: typeof rows[number]) => r.amount > 0 ? `${r.effApr}%` : "-", strong: true },
                { label: "True total cost", get: (r: typeof rows[number]) => r.amount > 0 ? formatCurrency(r.totalCost) : "-", strong: true },
              ].map(row => (
                <tr key={row.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 text-xs text-[var(--color-muted)]">{row.label}</td>
                  {rows.map((r, i) => (
                    <td key={i} className={`py-2 text-right ${row.strong ? "font-bold" : ""} ${row.strong && r.lender === cheapest && r.amount > 0 ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>{row.get(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Effective APR here loads upfront fees and insurance onto the cost spread over the tenure - a low headline rate with a 3% fee can cost more than a higher rate with no fee. Always compare the true total cost row.
      </div>
    </div>
  );
}

// ── Invoice-Financing Advance Calculator (features #9/#64: invoice discounting) ──
// Computes the advance you'd receive against an invoice net of margin/haircut and
// financing cost over the expected days to payment, with the implied annualised cost.
function InvoiceAdvanceCalculator() {
  const [faceStr,    setFaceStr]    = useState("1000000");
  const [advancePct, setAdvancePct] = useState(80);  // % advanced upfront
  const [feeStr,     setFeeStr]     = useState("1");  // one-time processing fee %
  const [rateStr,    setRateStr]    = useState("18"); // financing rate % p.a.
  const [daysStr,    setDaysStr]    = useState("60"); // expected days to buyer payment

  const face    = parseFloat(faceStr)   || 0;
  const fee     = parseFloat(feeStr)    || 0;
  const rate    = parseFloat(rateStr)   || 0;
  const days    = Math.max(1, Math.round(parseFloat(daysStr) || 0));

  const advance      = Math.round(face * (advancePct / 100));
  const reserve      = face - advance; // margin held back, released on collection
  const financeCost  = Math.round(advance * (rate / 100) * (days / 365));
  const processFee   = Math.round(face * (fee / 100));
  const totalCost    = financeCost + processFee;
  const netUpfront   = advance - totalCost;
  const finalNet     = netUpfront + reserve; // total received once buyer pays
  // Annualised cost of the cash you actually get for the period you hold it.
  const effCost = advance > 0 ? Math.round(((totalCost / advance) / (days / 365)) * 1000) / 10 : 0;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Receipt size={14} className="text-[var(--color-primary)]" /> Invoice Financing Advance Calculator</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">See exactly how much cash you get today against an unpaid invoice, the cost of that advance, and the true annualised rate so you can decide if it beats waiting.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Invoice value (₹)</label>
            <input type="number" min={0} value={faceStr} onChange={e => setFaceStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="flex justify-between text-xs text-[var(--color-muted)] mb-1"><span>Advance rate</span><span className="font-semibold text-[var(--color-text)]">{advancePct}%</span></label>
            <input type="range" min={50} max={95} value={advancePct} onChange={e => setAdvancePct(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Financing rate (% p.a.)</label>
            <input type="number" min={0} value={rateStr} onChange={e => setRateStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Processing fee (% of invoice)</label>
            <input type="number" min={0} step={0.1} value={feeStr} onChange={e => setFeeStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Expected days to payment</label>
            <input type="number" min={1} value={daysStr} onChange={e => setDaysStr(e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {face > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Cash today (net)", value: formatCurrency(netUpfront), color: "text-[var(--color-primary)]" },
              { label: "Total cost",       value: formatCurrency(totalCost),  color: "text-red-400" },
              { label: "Margin released later", value: formatCurrency(reserve), color: "text-[var(--color-text)]" },
              { label: "Effective annual cost", value: `${effCost}%`, color: effCost > 24 ? "text-red-400" : effCost > 15 ? "text-orange-400" : "text-green-400" },
            ].map(k => (
              <div key={k.label} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
                <p className="text-[10px] text-[var(--color-muted)] mb-1">{k.label}</p>
                <p className={`text-lg font-bold tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
            <h3 className="text-sm font-semibold mb-3">Cash flow breakdown</h3>
            <div className="space-y-2">
              {[
                { label: `Advance (${advancePct}% of invoice)`, value: formatCurrency(advance), op: "+" },
                { label: `Financing cost (${rate}% × ${days}d)`, value: formatCurrency(financeCost), op: "−", color: "text-red-400" },
                { label: `Processing fee (${fee}%)`, value: formatCurrency(processFee), op: "−", color: "text-red-400" },
                { label: "Net cash received today", value: formatCurrency(netUpfront), op: "=", bold: true, color: "text-[var(--color-primary)]" },
                { label: "Margin released on collection", value: formatCurrency(reserve), op: "+" },
                { label: "Total received once buyer pays", value: formatCurrency(finalNet), op: "=", bold: true },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
                  <span className="text-xs text-[var(--color-muted)]"><span className="mr-2 font-mono">{r.op}</span>{r.label}</span>
                  <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Effective annual cost annualises the fee + interest over the days the cash is outstanding - a 1% fee on a 30-day invoice is ~12% p.a. Compare it to your overdraft rate before discounting; if the buyer is reliable and your OD is cheaper, the OD may win.
      </div>
    </div>
  );
}

// ── NBFC vs Bank Cost Compare ──
// Banks usually offer a lower rate but slower disbursal and stricter docs; NBFCs
// cost more but fund fast. We price the true cost AND value the speed difference.
function NbfcVsBankCompare() {
  const [amountStr,    setAmountStr]    = useState("1500000");
  const [monthsStr,    setMonthsStr]    = useState("24");
  const [bankRateStr,  setBankRateStr]  = useState("13");
  const [bankFeeStr,   setBankFeeStr]   = useState("0.5");
  const [bankDaysStr,  setBankDaysStr]  = useState("21"); // days to disburse
  const [nbfcRateStr,  setNbfcRateStr]  = useState("18");
  const [nbfcFeeStr,   setNbfcFeeStr]   = useState("2");
  const [nbfcDaysStr,  setNbfcDaysStr]  = useState("3");
  const [delayCostStr, setDelayCostStr] = useState("0"); // ₹/day cost of waiting for funds

  const amount = parseFloat(amountStr) || 0;
  const months = Math.max(1, Math.round(parseFloat(monthsStr) || 0));
  const delayPerDay = parseFloat(delayCostStr) || 0;

  const calc = (rateStr: string, feeStr: string, daysStr: string) => {
    const rate = parseFloat(rateStr) || 0;
    const fee  = Math.round(amount * (parseFloat(feeStr) || 0) / 100);
    const days = Math.max(0, Math.round(parseFloat(daysStr) || 0));
    const emiVal = amount > 0 ? emi(amount, rate, months) : 0;
    const interest = amount > 0 ? Math.round(totalInterest(amount, rate, months)) : 0;
    const delayCost = Math.round(days * delayPerDay);
    const total = interest + fee + delayCost;
    return { rate, fee, days, emiVal, interest, delayCost, total };
  };

  const bank = calc(bankRateStr, bankFeeStr, bankDaysStr);
  const nbfc = calc(nbfcRateStr, nbfcFeeStr, nbfcDaysStr);
  const winner = amount > 0 ? (bank.total <= nbfc.total ? "bank" : "nbfc") : null;

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  const card = (title: string, who: "bank" | "nbfc", c: ReturnType<typeof calc>, icon: ReactNode) => (
    <div className={`bg-[var(--color-surface)] border rounded-lg p-5 ${winner === who ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold flex items-center gap-2">{icon}{title}</p>
        {winner === who && <span className="text-[9px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full font-semibold">Lower cost</span>}
      </div>
      <div className="space-y-2">
        {[
          { label: "Monthly EMI", value: `${formatCurrency(c.emiVal)} /mo` },
          { label: `Interest @ ${c.rate}%`, value: formatCurrency(c.interest), color: "text-orange-400" },
          { label: "Processing fee", value: formatCurrency(c.fee), color: "text-red-400" },
          { label: `Disbursal: ${c.days} days`, value: delayPerDay > 0 ? `cost ${formatCurrency(c.delayCost)}` : "-", color: delayPerDay > 0 ? "text-red-400" : "text-[var(--color-muted)]" },
          { label: "True total cost", value: formatCurrency(c.total), bold: true, color: winner === who ? "text-[var(--color-primary)]" : "text-[var(--color-text)]" },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
            <span className="text-xs text-[var(--color-muted)]">{r.label}</span>
            <span className={`tabular-nums ${r.bold ? "font-bold" : ""} ${r.color ?? "text-[var(--color-text)]"}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Building2 size={14} className="text-[var(--color-primary)]" /> NBFC vs Bank Cost Compare</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Banks are cheaper but slow; NBFCs are pricier but fund in days. Add a cost-of-delay to value speed and see which is genuinely cheaper for your situation.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Loan amount (₹)</label><input type="number" min={0} value={amountStr} onChange={e => setAmountStr(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Tenure (months)</label><input type="number" min={1} value={monthsStr} onChange={e => setMonthsStr(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs text-[var(--color-muted)] mb-1">Cost of waiting (₹/day)</label><input type="number" min={0} value={delayCostStr} onChange={e => setDelayCostStr(e.target.value)} className={inp} /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Bank terms</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Rate %</label><input type="number" min={0} value={bankRateStr} onChange={e => setBankRateStr(e.target.value)} className={inp} /></div>
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Fee %</label><input type="number" min={0} step={0.1} value={bankFeeStr} onChange={e => setBankFeeStr(e.target.value)} className={inp} /></div>
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Days</label><input type="number" min={0} value={bankDaysStr} onChange={e => setBankDaysStr(e.target.value)} className={inp} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">NBFC terms</p>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Rate %</label><input type="number" min={0} value={nbfcRateStr} onChange={e => setNbfcRateStr(e.target.value)} className={inp} /></div>
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Fee %</label><input type="number" min={0} step={0.1} value={nbfcFeeStr} onChange={e => setNbfcFeeStr(e.target.value)} className={inp} /></div>
              <div><label className="block text-[10px] text-[var(--color-muted)] mb-0.5">Days</label><input type="number" min={0} value={nbfcDaysStr} onChange={e => setNbfcDaysStr(e.target.value)} className={inp} /></div>
            </div>
          </div>
        </div>
      </div>

      {amount > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {card("Bank", "bank", bank, <Landmark size={13} className="text-[var(--color-primary)]" />)}
            {card("NBFC / Fintech", "nbfc", nbfc, <Coins size={13} className="text-[var(--color-primary)]" />)}
          </div>
          {winner && (
            <div className={`rounded-lg px-4 py-3 border text-sm ${winner === "bank" ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30" : "bg-purple-900/20 border-purple-800/30"}`}>
              <span className="font-semibold">{winner === "bank" ? "Bank" : "NBFC"} is cheaper</span> by {formatCurrency(Math.abs(bank.total - nbfc.total))} over {months} months{delayPerDay > 0 ? ", after pricing the disbursal delay" : ""}.
              {winner === "bank" ? " If you can wait for the bank's process and have the documents ready, it saves real money." : " The NBFC wins once the cost of waiting for funds is counted - speed has a price worth paying when cash is urgent."}
            </div>
          )}
        </>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Set "cost of waiting" to what a funding delay actually costs you - a missed bulk-purchase discount, a stalled order, or penalty interest. With it at ₹0 the bank almost always wins on rate; the comparison only gets interesting when speed has real value.
      </div>
    </div>
  );
}

// ── Subsidy / MUDRA Scheme Finder (feature #45: Mudra & PSB Scheme Match) ──
// Filters well-known Indian MSME credit schemes by the owner's profile and need,
// so they see only the schemes they likely qualify for.
function SchemeFinder() {
  type Scheme = {
    id: string; name: string; max: number; collateralFree: boolean;
    desc: string; eligibility: string;
    purposes: string[]; womenFocus: boolean; newToCredit: boolean;
  };
  const SCHEMES: Scheme[] = [
    { id: "mudra-shishu", name: "PMMY MUDRA - Shishu", max: 50000, collateralFree: true, desc: "Micro-loans for the smallest and newest enterprises.", eligibility: "Non-farm micro units; no collateral; ideal for new businesses.", purposes: ["Working capital", "Inventory", "Equipment purchase"], womenFocus: false, newToCredit: true },
    { id: "mudra-kishor", name: "PMMY MUDRA - Kishor", max: 500000, collateralFree: true, desc: "Growth-stage micro-enterprise funding up to ₹5L.", eligibility: "Established micro units needing expansion capital; collateral-free.", purposes: ["Working capital", "Equipment purchase", "Expansion", "Inventory"], womenFocus: false, newToCredit: false },
    { id: "mudra-tarun", name: "PMMY MUDRA - Tarun", max: 1000000, collateralFree: true, desc: "Larger micro/small enterprise loans up to ₹10L.", eligibility: "Growing small businesses with a track record; collateral-free.", purposes: ["Working capital", "Equipment purchase", "Expansion"], womenFocus: false, newToCredit: false },
    { id: "cgtmse", name: "CGTMSE Collateral-Free", max: 50000000, collateralFree: true, desc: "Govt-backed guarantee enabling collateral-free term/WC loans up to ₹5Cr.", eligibility: "Micro & small enterprises; lender routes the loan through the guarantee fund.", purposes: ["Working capital", "Equipment purchase", "Expansion"], womenFocus: false, newToCredit: false },
    { id: "standup", name: "Stand-Up India", max: 10000000, collateralFree: false, desc: "₹10L-₹1Cr for greenfield ventures by women & SC/ST entrepreneurs.", eligibility: "Women or SC/ST owner; new (greenfield) manufacturing, services or trading unit.", purposes: ["Expansion", "Equipment purchase", "Working capital"], womenFocus: true, newToCredit: true },
    { id: "pmegp", name: "PMEGP", max: 5000000, collateralFree: true, desc: "Credit-linked capital subsidy for new micro-enterprise setup.", eligibility: "New units only; subsidy 15-35% of project cost based on category & location.", purposes: ["Equipment purchase", "Expansion"], womenFocus: false, newToCredit: true },
    { id: "psb59", name: "PSB Loans in 59 Minutes", max: 50000000, collateralFree: false, desc: "In-principle MSME loan approval online in under an hour.", eligibility: "GST-registered, ITR-filing MSMEs with 6+ months banking history.", purposes: ["Working capital", "Equipment purchase", "Expansion", "GST/TDS payment"], womenFocus: false, newToCredit: false },
  ];

  const PURPOSES = ["Working capital", "Equipment purchase", "Inventory", "Expansion", "GST/TDS payment"] as const;

  const [needStr,      setNeedStr]      = useState("500000");
  const [purpose,      setPurpose]      = useState<string>("Working capital");
  const [women,        setWomen]        = useState(false);
  const [newBiz,       setNewBiz]       = useState(false);
  const [noCollateral, setNoCollateral] = useState(true);

  const need = parseFloat(needStr) || 0;

  const matches = SCHEMES.filter(s =>
    (need === 0 || need <= s.max) &&
    s.purposes.includes(purpose) &&
    (!women || s.womenFocus) &&
    (!newBiz || s.newToCredit) &&
    (!noCollateral || s.collateralFree)
  ).sort((a, b) => a.max - b.max);

  const inp = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Landmark size={14} className="text-[var(--color-primary)]" /> Subsidy & MUDRA Scheme Finder</h2>
        <p className="text-xs text-[var(--color-muted)] mb-4">Answer a few questions and see the government MSME credit schemes you likely qualify for, with limits and eligibility.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Amount needed (₹)</label>
            <input type="number" min={0} value={needStr} onChange={e => setNeedStr(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-muted)] mb-1">Purpose</label>
            <select value={purpose} onChange={e => setPurpose(e.target.value)} className={inp}>
              {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          {[
            { label: "Women-owned business", checked: women, set: setWomen },
            { label: "New / recently started", checked: newBiz, set: setNewBiz },
            { label: "Need collateral-free", checked: noCollateral, set: setNoCollateral },
          ].map(c => (
            <label key={c.label} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={c.checked} onChange={e => c.set(e.target.checked)} className="accent-[var(--color-primary)]" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-xl p-10 text-center">
          <Landmark size={28} className="mx-auto mb-3 text-[var(--color-muted)] opacity-30" />
          <p className="text-sm text-[var(--color-muted)]">No scheme matches these filters. Try raising the amount limit or relaxing a filter - e.g. a ₹50L need exceeds most MUDRA tiers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-muted)]">{matches.length} scheme{matches.length > 1 ? "s" : ""} match your profile</p>
          {matches.map(s => (
            <div key={s.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">{s.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-[var(--color-muted)]">Up to</p>
                  <p className="text-base font-bold tabular-nums text-[var(--color-primary)]">{formatCurrency(s.max)}</p>
                </div>
              </div>
              <p className="text-[11px] text-[var(--color-muted)] leading-snug mb-2"><span className="font-semibold text-[var(--color-text)]">Eligibility:</span> {s.eligibility}</p>
              <div className="flex flex-wrap gap-1.5">
                {s.collateralFree && <span className="text-[9px] bg-green-950/30 text-green-400 border border-green-800/30 px-1.5 py-0.5 rounded-full font-semibold">Collateral-free</span>}
                {s.womenFocus && <span className="text-[9px] bg-purple-900/30 text-purple-400 border border-purple-800/40 px-1.5 py-0.5 rounded-full font-semibold">Women-focused</span>}
                {s.newToCredit && <span className="text-[9px] bg-blue-900/30 text-blue-400 border border-blue-800/40 px-1.5 py-0.5 rounded-full font-semibold">New-business friendly</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-accent)]/40 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
        Scheme limits and rules are indicative as of the latest public guidelines and vary by lender and applicant category. Confirm current terms with the lending bank or on the official scheme portal before applying.
      </div>
    </div>
  );
}
